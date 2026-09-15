/**
 * The agent's way into the platform's OWN API, for the work no hand-written tool covers.
 *
 * Authorization is NOT decided here. The call carries the user's own JWT, every edge function
 * declares its own auth and validates its own body (invariant 5), and the callable set is
 * whatever the generated catalogue says accepts a user token. So this grants the agent exactly
 * what the person operating it already had, and nothing else — a hand-written tool per capability
 * was a product limit, not a security boundary.
 *
 * @remarks What IS decided here is the smaller question of which calls a model should not make
 * unattended: `platformApiAccess` blocks a handful outright (recursion, bulk jobs, a queue a
 * human works) and stops the rest for approval when money moves, something is filed with an
 * authority, or a third party is reached.
 */
import { platformApiAccess } from '../platformApiAccess.generated.ts';
import { PLATFORM_API_CATALOG, type PlatformApiEndpoint } from '../platformApiCatalog.generated.ts';

const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

// Lazy, never captured at module load: the bootstrap populates env at HANDLER entry, so a
// module-load read is `undefined` and every call would report a network failure against
// "undefined/functions/v1/…" rather than a missing variable.
const supabaseUrl = () => Deno.env.get('SUPABASE_URL') ?? '';

// deno-lint-ignore no-explicit-any
type AnyRow = Record<string, any>;

/** A body big enough to be a bulk operation is not the shape this tool is for. */
const MAX_BODY_BYTES = 32_000;
/** What comes BACK has to fit the turn too — one list endpoint can otherwise fill the context. */
const MAX_RESULT_CHARS = 8_000;
/** An endpoint can legitimately be slow; the agent node's own ceiling is the real bound. */
const CALL_TIMEOUT_MS = 60_000;

/** Bytes, not UTF-16 units — a Greek body is ~2x its `.length` and would pass a char check. */
const byteLength = (s: string) => new TextEncoder().encode(s).length;

/**
 * Keep a result inside the turn's budget, and SAY it was cut.
 *
 * Silently truncating hands the model a list it believes is complete, which is how a "you have 3
 * suppliers" answer gets made out of the first 3 of 300.
 */
function capResult(value: unknown): { result: unknown; truncated?: string } {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (!text || text.length <= MAX_RESULT_CHARS) return { result: value };
  return {
    result: `${text.slice(0, MAX_RESULT_CHARS)}…`,
    truncated: `The response was ${text.length} characters and has been cut to ${MAX_RESULT_CHARS}. `
      + 'Do not report this as the complete answer — narrow the request (a filter, a smaller page) '
      + 'and call again if you need all of it.',
  };
}

/** Score an endpoint against a free-text need. Name and tag beat prose. */
function score(endpoint: PlatformApiEndpoint, terms: string[]): number {
  const name = endpoint.name.toLowerCase();
  const tag = (endpoint.tag || '').toLowerCase();
  const prose = `${endpoint.summary || ''} ${endpoint.description || ''}`.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (name.includes(term)) total += 8;
    if (tag.includes(term)) total += 4;
    if (prose.includes(term)) total += 1;
  }
  return total;
}

function describe(endpoint: PlatformApiEndpoint, access: ReturnType<typeof platformApiAccess>) {
  return {
    endpoint: endpoint.name,
    area: endpoint.tag,
    methods: endpoint.methods,
    summary: endpoint.summary,
    description: endpoint.description,
    body_fields: endpoint.fields,
    // Said up front so the model plans around it rather than discovering it on refusal.
    needs_approval: access.access === 'confirm' ? access.reason : undefined,
    unavailable: access.access === 'blocked' ? access.reason : undefined,
  };
}

/**
 * discover_platform_api — what can this platform do that I have no tool for?
 *
 * Read-only and free. Kept separate from the call so the model can look before it acts, and so a
 * turn that only needed to know "is there an endpoint for this" costs nothing but tokens.
 */
export const createDiscoverPlatformApiTool = (onChunk?: (chunk: AnyRow) => void) => {
  return tool(
    async ({ query, area, limit = 8 }: AnyRow) => {
      const terms = String(query ?? '')
        .toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
      if (!terms.length && !area) {
        return JSON.stringify({
          success: false,
          error: 'Give me a few words describing what you need to do, or an area to browse.',
          areas: [...new Set(PLATFORM_API_CATALOG.map((e) => e.tag))].sort(),
        });
      }

      // `area` NARROWS, it never empties. A model paraphrasing the tag — "Invoicing" for
      // "Finance" — would otherwise get an empty pool, and the empty branch below tells it to
      // say the capability does not exist: a confident wrong answer, which is the exact failure
      // this whole tool exists to remove. An area that matches nothing is ignored.
      const pool = ((): PlatformApiEndpoint[] => {
        const all = PLATFORM_API_CATALOG as PlatformApiEndpoint[];
        if (!area) return all;
        const wanted = String(area).toLowerCase();
        const scoped = all.filter((e) => (e.tag || '').toLowerCase().includes(wanted)
          || wanted.includes((e.tag || '').toLowerCase()));
        return scoped.length ? scoped : all;
      })();
      const ranked = terms.length
        ? pool.map((e) => ({ e, s: score(e, terms) })).filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s).map((x) => x.e)
        : pool;

      const capped = Math.min(Math.max(Number(limit) || 8, 1), 20);
      // A blocked endpoint is still WORTH SHOWING with its reason. Hiding it makes the model
      // guess a neighbour and fail differently; naming it lets it tell the user why not.
      const matches = ranked.slice(0, capped).map((e) => describe(e, platformApiAccess(e.name)));

      // This is a DIRECT-run quick-start: the tool runs with no model turn behind it, so if it
      // emits nothing the user reads the quick-start's cheerful "done" over an empty screen.
      // Emitted for the empty case too — "nothing matches" is the answer, not the absence of one.
      onChunk?.({
        type: 'platform_api_matches',
        data: { query: query ?? null, area: area ?? null, count: matches.length, matches },
        timestamp: Date.now(),
      });

      if (matches.length === 0) {
        const asked = [query && `"${query}"`, area && `area "${area}"`].filter(Boolean).join(' in ');
        return JSON.stringify({
          success: true, found: false, matches: [],
          note: `Nothing in the platform API matches ${asked}. Say so plainly rather than `
            + 'describing what such an endpoint would do — it does not exist.',
          areas: [...new Set(PLATFORM_API_CATALOG.map((e) => e.tag))].sort(),
        });
      }
      return JSON.stringify({ success: true, found: true, count: matches.length, matches });
    },
    {
      name: 'discover_platform_api',
      description:
        'Search the platform\'s own API for an endpoint that does something you have no dedicated '
        + 'tool for. Returns the endpoint name, what it does, and the body fields it accepts. Use '
        + 'this BEFORE telling a user something is not possible — a dedicated tool not existing is '
        + 'not the same as the platform not being able to do it. Follow up with call_platform_api.',
      schema: z.object({
        query: z.string().optional().describe('A few words for what you need to do, e.g. "email a statement to a customer".'),
        area: z.string().optional().describe('Optional area to browse, e.g. "Finance", "CRM", "SEO", "HR".'),
        limit: z.number().optional().describe('Max matches (default 8, max 20).'),
      }),
    },
  );
};

/**
 * call_platform_api — actually make the call, as the user.
 */
export const createCallPlatformApiTool = (
  jwt: string | undefined,
  onChunk?: (chunk: AnyRow) => void,
) => {
  return tool(
    async ({ endpoint, method = 'POST', body, reason, confirm }: AnyRow) => {
      const name = String(endpoint ?? '').trim();
      if (!name) return JSON.stringify({ success: false, error: 'Name the endpoint to call.' });

      const known = PLATFORM_API_CATALOG.find((e) => e.name === name);
      if (!known) {
        return JSON.stringify({
          success: false,
          error: `"${name}" is not a platform endpoint your session can call. Use `
            + 'discover_platform_api to find the right one.',
        });
      }

      // Fail closed on the session, not on the endpoint: with no user token this would fall back
      // to whatever the runtime has, and the whole safety argument for this tool is that it acts
      // as the USER and is bounded by their own RLS and role.
      if (!jwt) {
        return JSON.stringify({
          success: false,
          error: 'The platform API needs a signed-in user session and this request has none.',
        });
      }

      const access = platformApiAccess(name);
      if (access.access === 'blocked') {
        return JSON.stringify({
          success: false, blocked: true, endpoint: name, error: access.reason,
          note: 'Tell the user this one is not available to the assistant and why. Do not look '
            + 'for another endpoint that does the same thing.',
        });
      }

      const verb = String(method || 'POST').toUpperCase();
      if (!known.methods.includes(verb)) {
        return JSON.stringify({
          success: false,
          error: `${name} accepts ${known.methods.join(', ')}, not ${verb}.`,
        });
      }

      const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : undefined;
      const serialized = payload ? JSON.stringify(payload) : '';
      const bytes = byteLength(serialized);
      if (bytes > MAX_BODY_BYTES) {
        return JSON.stringify({
          success: false,
          error: `That body is ${bytes} bytes. This is for one operation at a time, not a bulk `
            + 'load — narrow it or use the dedicated import path.',
        });
      }

      // A GET carries its parameters in the QUERY STRING. Dropping the body on a GET — which is
      // what fetch does — would let the user approve a card showing a date range and then have
      // the endpoint answer for its default instead. Encode it rather than discard it.
      const query_ = new URLSearchParams();
      if (verb === 'GET' && payload) {
        for (const [k, v] of Object.entries(payload)) {
          if (v === undefined || v === null) continue;
          query_.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      }
      const search = query_.toString();

      // HUMAN-IN-THE-LOOP (invariant 9). Before the call, and it RETURNS — a gate that emits a
      // card and falls through is not a gate.
      if (access.access === 'confirm' && confirm !== true) {
        onChunk?.({
          type: 'action_confirmation',
          tool: 'call_platform_api',
          input: { endpoint: name, method: verb, body: payload },
          title: `Run ${name}?`,
          summary: `${access.reason} ${reason ? `Asked for: ${reason}` : ''}`.trim()
            + (serialized ? ` — with: ${serialized.slice(0, 300)}` : ''),
          danger: true,
          toolkit_id: 'platform-api',
          timestamp: Date.now(),
        });
        return JSON.stringify({
          success: true, awaiting_confirmation: true, endpoint: name,
          message: 'Awaiting the user\'s approval. Do not retry — the user will approve or decline.',
        });
      }

      onChunk?.({ type: 'tool_progress', status: `Calling ${name}…`, timestamp: Date.now() });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
      try {
        const url = `${supabaseUrl()}/functions/v1/${name}${search ? `?${search}` : ''}`;
        const resp = await fetch(url, {
          method: verb,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: verb === 'GET' ? undefined : serialized || '{}',
          signal: controller.signal,
        });
        const text = await resp.text();
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = text.slice(0, 4000); }

        if (!resp.ok) {
          // The endpoint's own refusal, verbatim. It is the most useful thing here: it names the
          // missing field or the failed check, which is how the model corrects itself — and a
          // 403 means the USER lacks the right, which is an answer, not a bug to work around.
          return JSON.stringify({
            success: false, endpoint: name, status: resp.status, error: data,
            note: resp.status === 401 || resp.status === 403
              ? 'The signed-in user is not allowed to do this. Say so; do not try another endpoint.'
              : 'Read the error and correct the body, or tell the user what it needs.',
          });
        }

        // The CARD gets the full result — the screen can scroll. The model gets the capped one.
        onChunk?.({
          type: 'platform_api_result',
          data: { endpoint: name, method: verb, status: resp.status, result: data },
          timestamp: Date.now(),
        });
        const capped = capResult(data);
        return JSON.stringify({
          success: true, endpoint: name, status: resp.status,
          result: capped.result, truncated: capped.truncated,
        });
      } catch (e) {
        const aborted = e instanceof Error && e.name === 'AbortError';
        return JSON.stringify({
          success: false, endpoint: name,
          error: aborted ? `${name} did not answer within ${CALL_TIMEOUT_MS / 1000}s.` : (e as Error)?.message,
          // Said explicitly because the model cannot otherwise tell a timeout from a refusal, and
          // the two want opposite next moves: a timed-out write may well have happened.
          note: aborted
            ? 'It may still have run. Check before repeating it — do not simply retry.'
            : 'The call did not reach the endpoint.',
        });
      } finally {
        clearTimeout(timer);
      }
    },
    {
      name: 'call_platform_api',
      description:
        'Call one of the platform\'s own API endpoints, as the signed-in user, for work no '
        + 'dedicated tool covers. Find the endpoint with discover_platform_api first, then pass '
        + 'its name and a body built from the fields it listed. The endpoint enforces its own '
        + 'permissions — a 403 means the user genuinely may not do this. Some endpoints stop for '
        + 'the user to approve (money, filings with ΑΑΔΕ/ΕΡΓΑΝΗ, anything reaching a customer); '
        + 'never pass confirm yourself, the approval card sets it.',
      schema: z.object({
        endpoint: z.string().describe('The endpoint name from discover_platform_api, e.g. "crm-api".'),
        method: z.string().optional().describe('HTTP method (default POST). Must be one the endpoint lists.'),
        body: z.record(z.any()).optional().describe('JSON body, built from the endpoint\'s listed fields.'),
        reason: z.string().optional().describe('One line on what the user asked for — shown on the approval card.'),
        confirm: z.boolean().optional().describe('Do NOT set this — the Approve/Decline card sets confirm:true when the user approves.'),
      }),
    },
  );
};
