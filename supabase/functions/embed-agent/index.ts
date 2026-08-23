/**
 * The public agent surface — a merchant's visitor reaching the platform's tools (#382 Phase 2/3).
 *
 * Anonymous, keyed by a publishable `mk_embed_…` value, exactly like `products-3d-api`:
 * `authenticateEmbedKey` resolves the key to ONE workspace and that workspace is the only thing
 * this request can ever see. Nothing here reads a workspace, user or owner from the body.
 *
 * WHY IT IS NOT `agent-chat`. That function is JWT + RBAC, and `load_toolkit` can widen its bound
 * tool set at runtime — both correct for a signed-in member and both wrong for a stranger. This
 * surface binds a CONSTANT list from `_shared/embed-agent-tools.ts`; there is no path by which a
 * request, a prompt, or a model can add to it.
 *
 * THE BUTTONS COST NOTHING, AND THAT IS THE POINT. `action=run` invokes one allowlisted tool
 * directly with the caller's arguments — no model turn, no tokens, no Anthropic spend. A visitor's
 * first interaction with the widget returns real data from the merchant's own catalogue for free.
 * A blinking cursor would have been the same emptiness as the facet wizard in a different shape,
 * and it would have billed the merchant per keystroke for the privilege.
 *
 * Actions:
 *   • capabilities → which quick-starts this key may run
 *   • run          → one allowlisted tool, deterministically, no model turn
 */
import { serviceClient } from '../_shared/supabase-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { captureException } from '../_shared/sentry.ts';
import { authenticateEmbedKey, embedJson } from '../_shared/embed-key.ts';
import { embedCorsHeaders } from '../_shared/cors.ts';
import { verifyTurnstile, clientIp } from '../_shared/turnstile.ts';
import { PUBLIC_TOOLS, PUBLIC_TOOL_NAMES, buildPublicTools } from '../_shared/embed-agent-tools.ts';
import { resolveSecret } from '../_shared/secrets.ts';

/**
 * Ceiling on the JSON a visitor may hand a tool.
 *
 * Anonymous input that becomes tool arguments. The tools validate their own shapes; this stops the
 * request being a place to post a megabyte.
 */
const MAX_ARG_BYTES = 8_000;

Deno.serve(withApiLogging((req) => {
  try {
    return `embed-agent?action=${new URL(req.url).searchParams.get('action') ?? 'capabilities'}`;
  } catch {
    return 'embed-agent';
  }
}, async (req) => {
  const supabase = serviceClient();

  // Preflight, answered the same way products-3d-api answers it and for the same reason: a browser
  // sends no custom headers on OPTIONS, so a keyless preflight cannot be resolved to an allowlist
  // and refusing it would break the flow while protecting nothing — the real request is where the
  // key is checked and where the response either carries this origin's headers or none at all.
  if (req.method === 'OPTIONS') {
    const key = new URL(req.url).searchParams.get('key');
    if (!key) {
      const origin = req.headers.get('Origin');
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-embed-key',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }
    const { data } = await supabase
      .from('material_kai_keys')
      .select('allowed_origins')
      .eq('api_key', key)
      .eq('is_active', true)
      .maybeSingle();
    const cors = embedCorsHeaders(req, (data?.allowed_origins as string[] | null) ?? null);
    return new Response(null, { status: cors ? 200 : 403, headers: cors ?? { 'Vary': 'Origin' } });
  }

  const auth = await authenticateEmbedKey(supabase, req);
  if (!auth.ok) return auth.response;
  const { cors } = auth.ctx;

  const url = new URL(req.url);
  let params: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  if (req.method === 'POST') {
    // Same bodyless-POST tolerance as products-3d-api: `req.json()` throws on an empty body, and a
    // beacon-shaped caller that puts everything in the query string is legitimate.
    const raw = await req.text();
    if (raw.trim()) {
      if (raw.length > MAX_ARG_BYTES) {
        return embedJson({ error: 'Request too large' }, 413, cors);
      }
      try {
        const body = JSON.parse(raw);
        if (body && typeof body === 'object') params = { ...params, ...body };
      } catch {
        return embedJson({ error: 'Invalid JSON body' }, 400, cors);
      }
    }
  }

  const action = String(params.action ?? 'capabilities');

  if (action === 'capabilities') {
    // Told up front what may be run, so the widget can render the right buttons rather than
    // discovering a refusal by pressing one. The Turnstile site key ships here for the same reason
    // `spec_options` ships it: the quote form needs to render its challenge BEFORE the visitor
    // reaches the only action that writes.
    const siteKey = (await resolveSecret(supabase, 'TURNSTILE_SITE_KEY')
      .catch(() => ({ value: null })))?.value ?? null;
    return embedJson({
      ok: true,
      tools: PUBLIC_TOOLS.map((t) => ({ name: t.name, label: t.label, writes: t.writes })),
      turnstile_site_key: siteKey,
    }, 200, cors);
  }

  if (action === 'run') {
    const name = String(params.tool ?? '').trim();
    if (!PUBLIC_TOOL_NAMES.has(name)) {
      // The allowlist answers before anything is constructed. Naming an unknown tool and naming a
      // real tool this surface does not expose get the SAME answer, so the endpoint cannot be used
      // to enumerate what the platform has.
      return embedJson({ error: 'Unknown tool' }, 400, cors);
    }
    const spec = PUBLIC_TOOLS.find((t) => t.name === name)!;

    // The one write is bot-gated BEFORE the tool is built, let alone invoked — it mints a CRM
    // contact, which is exactly the shape the storefront had to protect.
    if (spec.writes) {
      // Narrowed rather than cast to `any`: a non-string token is a missing token, and
      // `verifyTurnstile` fails closed on one.
      const token = typeof params.turnstile_token === 'string' ? params.turnstile_token : null;
      const bot = await verifyTurnstile(supabase, token, clientIp(req));
      if (!bot.ok) return embedJson({ error: 'Bot check failed. Please try again.' }, 400, cors);
    }

    let args: Record<string, unknown> = {};
    const rawArgs = params.args;
    try {
      args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : ((rawArgs ?? {}) as Record<string, unknown>);
    } catch {
      return embedJson({ error: 'args must be a JSON object' }, 400, cors);
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return embedJson({ error: 'args must be a JSON object' }, 400, cors);
    }

    try {
      const tools = await buildPublicTools(auth.ctx);
      const tool = tools.get(name);
      if (!tool) return embedJson({ error: 'Unknown tool' }, 400, cors);

      // No model turn. The caller supplied the arguments, we call the tool, we return what it
      // said. Zero tokens, zero Anthropic spend, and the answer is the merchant's real data.
      const result = await tool.invoke(args);

      // Every one of these tools returns a JSON STRING (the shape a model expects). Parsing it
      // here means the widget receives an object and never has to double-decode — and a tool that
      // ever returns something unparseable surfaces as a 502 rather than as a string the widget
      // renders as gibberish.
      let parsed: unknown = result;
      if (typeof result === 'string') {
        try {
          parsed = JSON.parse(result);
        } catch {
          parsed = { success: true, text: result };
        }
      }
      return embedJson({ ok: true, tool: name, result: parsed }, 200, cors);
    } catch (e) {
      // Never leak an internal message to a stranger's page, and never swallow it either — a tool
      // failing on 100% of calls while the endpoint reports success is this platform's dominant
      // failure shape.
      const message = e instanceof Error ? e.message : String(e);
      console.error('[embed-agent] tool run failed', name, message);
      void captureException(e instanceof Error ? e : new Error(message), {
        tags: { function_name: 'embed-agent', tool: name },
        extra: { workspace_id: auth.ctx.workspaceId, embed_key_id: auth.ctx.keyId },
        fingerprint: ['embed-agent', 'tool-run-failed', name],
      });
      return embedJson({ error: 'That did not work. Please try again.' }, 502, cors);
    }
  }

  return embedJson({ error: `Unknown action: ${action}` }, 400, cors);
}));
