/**
 * Tenant webhook management (#330) — register / update / rotate / delete an outbound endpoint,
 * and read its delivery log.
 *
 * Why this is an edge function rather than direct PostgREST writes: three things have to happen
 * server-side and cannot be trusted to a client.
 *   - The **signing secret** is generated here and returned exactly once. `secret` is
 *     column-level revoked from `authenticated`, so nothing can read it back afterwards; losing
 *     it means rotating it.
 *   - The **URL is SSRF-checked before it is ever stored**, so a hostile endpoint never even
 *     reaches the deliveries table. (The dispatcher re-checks at delivery — DNS moves.)
 *   - The **event types are validated against a fixed allowlist**, so a subscription cannot be
 *     created for an event the platform does not emit and then quietly never fire.
 *
 * Tenancy: `workspace_id` is always reconciled against the caller's JWT via
 * `userCanAccessWorkspace`. A body-supplied workspace is never trusted, and a mismatch returns
 * 404 rather than 403 so endpoint ids cannot be enumerated.
 */
import { createClient } from '@supabase/supabase-js';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';
import { SUBSCRIBABLE_EVENT_TYPES } from '../_shared/webhook-events.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Endpoints a single workspace may register. A cap exists so one tenant cannot multiply every
 *  event into hundreds of deliveries. */
const MAX_ENDPOINTS_PER_WORKSPACE = 10;

function newSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'whsec_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reject anything not in the emitted vocabulary — a subscription to an event that does not
 *  exist would sit silent forever and look like a delivery bug. */
function validateEventTypes(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, 'Pick at least one event type.');
  }
  const types = [...new Set(raw.map(String))];
  const unknown = types.filter((t) => !SUBSCRIBABLE_EVENT_TYPES.includes(t));
  if (unknown.length) {
    throw new HttpError(400, `Unknown event type(s): ${unknown.join(', ')}`);
  }
  return types;
}

async function validateUrl(raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(400, 'A URL is required.');
  try {
    // https only for a tenant endpoint: the payload carries their business data and the
    // signature does not provide confidentiality.
    return await assertSafeUrl(raw.trim(), { allowSchemes: ['https:'] });
  } catch (e) {
    if (e instanceof SSRFError) throw new HttpError(400, `That URL cannot be used: ${e.message}`);
    throw e;
  }
}

Deno.serve(withApiLogging('workspace-webhooks-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, auth.error || 'Unauthorized');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');

  /** Resolve an endpoint the caller is actually entitled to. 404 on a miss OR a tenancy
   *  mismatch — the two must be indistinguishable or ids become enumerable. */
  const ownedWebhook = async (id: unknown) => {
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'webhook id is required');
    const { data: hook } = await supabase
      .from('workspace_webhooks')
      .select('id, workspace_id')
      .eq('id', id)
      .maybeSingle();
    if (!hook || !(await userCanAccessWorkspace(supabase, auth.userId, hook.workspace_id))) {
      throw new HttpError(404, 'Webhook not found');
    }
    return hook;
  };

  switch (action) {
    case 'list': {
      const workspaceId = String(body.workspace_id ?? '');
      if (!(await userCanAccessWorkspace(supabase, auth.userId, workspaceId))) {
        throw new HttpError(404, 'Workspace not found');
      }
      // `secret` is deliberately absent from this projection AND unreadable at the column level.
      const { data } = await supabase
        .from('workspace_webhooks')
        .select('id, url, description, event_types, is_active, consecutive_failures, disabled_reason, last_delivery_at, last_success_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      return json({ ok: true, webhooks: data ?? [], available_events: SUBSCRIBABLE_EVENT_TYPES });
    }

    case 'create': {
      const workspaceId = String(body.workspace_id ?? '');
      if (!(await userCanAccessWorkspace(supabase, auth.userId, workspaceId))) {
        throw new HttpError(404, 'Workspace not found');
      }
      const { count, error: countErr } = await supabase
        .from('workspace_webhooks')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);
      // The cap is the enforcement decision, so an unanswerable count refuses rather than reading
      // as "no endpoints registered" — which would let one workspace register without bound.
      if (countErr) {
        console.error('[workspace-webhooks-api] endpoint count failed — refusing (fail closed):', countErr.message);
        throw new HttpError(503, 'Could not verify the endpoint limit right now. Please try again.');
      }
      if ((count ?? 0) >= MAX_ENDPOINTS_PER_WORKSPACE) {
        throw new HttpError(400, `A workspace may register at most ${MAX_ENDPOINTS_PER_WORKSPACE} endpoints.`);
      }

      const url = await validateUrl(body.url);
      const eventTypes = validateEventTypes(body.event_types);
      const secret = newSecret();

      // Explicit allowlisted payload — never a spread of the request body. `workspace_id` and
      // `created_by` are server-derived; `secret`, `is_active` and the failure counters are
      // ours alone.
      const { data: created, error } = await supabase.from('workspace_webhooks').insert({
        workspace_id: workspaceId,
        url,
        description: typeof body.description === 'string' ? body.description.slice(0, 500) : null,
        event_types: eventTypes,
        secret,
        created_by: auth.userId,
      }).select('id, url, description, event_types, is_active, created_at').single();
      if (error) throw new HttpError(400, error.message);

      // The ONE time the secret is ever returned.
      return json({ ok: true, webhook: created, secret, secret_shown_once: true });
    }

    case 'update': {
      const hook = await ownedWebhook(body.id);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.url !== undefined) patch.url = await validateUrl(body.url);
      if (body.event_types !== undefined) patch.event_types = validateEventTypes(body.event_types);
      if (body.description !== undefined) {
        patch.description = typeof body.description === 'string' ? body.description.slice(0, 500) : null;
      }
      if (body.is_active !== undefined) {
        patch.is_active = !!body.is_active;
        // Re-enabling clears the auto-disable state, otherwise the endpoint would be disabled
        // again on its very next failure.
        if (body.is_active) { patch.consecutive_failures = 0; patch.disabled_reason = null; }
      }
      const { error } = await supabase.from('workspace_webhooks').update(patch).eq('id', hook.id);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    case 'rotate_secret': {
      const hook = await ownedWebhook(body.id);
      const secret = newSecret();
      const { error } = await supabase.from('workspace_webhooks')
        .update({ secret, updated_at: new Date().toISOString() }).eq('id', hook.id);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true, secret, secret_shown_once: true });
    }

    case 'delete': {
      const hook = await ownedWebhook(body.id);
      const { error } = await supabase.from('workspace_webhooks').delete().eq('id', hook.id);
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }

    case 'deliveries': {
      const hook = await ownedWebhook(body.id);
      const { data } = await supabase
        .from('workspace_webhook_deliveries')
        .select('id, event_type, status, attempt, http_status, error, response_snippet, next_attempt_at, delivered_at, created_at')
        .eq('webhook_id', hook.id)
        .order('created_at', { ascending: false })
        .limit(Math.min(100, Number(body.limit) || 25));
      return json({ ok: true, deliveries: data ?? [] });
    }

    default:
      throw new HttpError(400, `Unknown action: ${action || '(none)'}`);
  }
}));
