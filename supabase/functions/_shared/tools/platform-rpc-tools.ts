/**
 * The agent's way into the numbers the platform already DERIVES (anti-regression rule 1).
 *
 * @remarks Three independent things keep this to READS: the catalogue holds only STABLE and
 * IMMUTABLE functions, the call is a GET (PostgREST runs those read-only and refuses one against
 * a VOLATILE function), and the caller's own EXECUTE grant bounds the rest.
 */
import { platformRpcAccess } from '../platformRpcAccess.generated.ts';
import { PLATFORM_RPC_CATALOG, type PlatformRpcEntry } from '../platformRpcCatalog.generated.ts';

const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

// Lazy: the bootstrap populates env at HANDLER entry, so a module-load read is `undefined`.
const supabaseUrl = () => Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = () => Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// deno-lint-ignore no-explicit-any
type AnyRow = Record<string, any>;

const MAX_RESULT_CHARS = 8_000;
const CALL_TIMEOUT_MS = 30_000;

/** Cap a result and SAY it was cut — a silent truncation reads as a complete answer. */
function capResult(value: unknown): { result: unknown; truncated?: string } {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (!text || text.length <= MAX_RESULT_CHARS) return { result: value };
  return {
    result: `${text.slice(0, MAX_RESULT_CHARS)}…`,
    truncated: `The response was ${text.length} characters and has been cut to ${MAX_RESULT_CHARS}. `
      + 'Do not report this as the complete answer — narrow it (fewer ids, a shorter period) and ask again.',
  };
}

function score(entry: PlatformRpcEntry, terms: string[]): number {
  const name = entry.name.toLowerCase();
  const subject = entry.subject.toLowerCase();
  let total = 0;
  for (const t of terms) {
    if (!t) continue;
    if (name === t || subject === t) total += 6;
    else if (subject.split(' ').includes(t)) total += 4;
    else if (name.includes(t)) total += 2;
    else if (subject.includes(t)) total += 1;
  }
  return total;
}

function describe(entry: PlatformRpcEntry) {
  const access = platformRpcAccess(entry.name);
  return {
    reader: entry.name,
    answers: entry.subject,
    arguments: entry.args,
    withheld: access.access === 'withheld' ? access.reason : undefined,
  };
}

export const createDiscoverPlatformDataTool = (onChunk?: (chunk: AnyRow) => void) => tool(
  async ({ query, limit }: AnyRow) => {
    const terms = String(query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const cap = Math.min(Math.max(Number(limit) || 8, 1), 20);
    const ranked = PLATFORM_RPC_CATALOG
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, cap)
      .map((r) => describe(r.e));

    onChunk?.({ type: 'platform_data_matches', data: { query: String(query ?? ''), count: ranked.length, readers: ranked } });

    if (!ranked.length) {
      return JSON.stringify({
        found: false,
        note: 'No derived reader matches that. Say the platform does not compute this figure rather '
          + 'than describing one that would — and do not invent a reader name.',
      });
    }
    return JSON.stringify({ found: true, readers: ranked });
  },
  {
    name: 'discover_platform_data',
    description:
      'Find a figure the platform already WORKS OUT — settlements, margins, forecasts, site health, '
      + 'a customer 360. Search in the words the user used ("how did the pipeline do", "what does this '
      + 'customer owe"). Returns the reader name and the arguments it takes; call it with '
      + 'call_platform_rpc. Use this before saying a number is unavailable.',
    schema: z.object({
      query: z.string().describe('What figure you need, in plain words.'),
      limit: z.number().optional().describe('Max matches (default 8, max 20).'),
    }),
  },
);

export const createCallPlatformRpcTool = (
  jwt: string | undefined,
  onChunk?: (chunk: AnyRow) => void,
) => tool(
  async ({ reader, args }: AnyRow) => {
    const name = String(reader ?? '').trim();
    if (!name) return JSON.stringify({ success: false, error: 'Name the reader to call.' });

    const known = PLATFORM_RPC_CATALOG.find((e) => e.name === name);
    if (!known) {
      return JSON.stringify({
        success: false,
        error: `"${name}" is not a derived reader this session can call. Use discover_platform_data.`,
      });
    }

    // Fail closed on the SESSION: the whole argument for this tool is that it reads AS the user.
    if (!jwt) {
      return JSON.stringify({
        success: false,
        error: 'Reading platform data needs a signed-in user session and this request has none.',
      });
    }

    const access = platformRpcAccess(name);
    if (access.access === 'withheld') {
      return JSON.stringify({
        success: false, withheld: true, reader: name, error: access.reason,
        note: 'Cost and margin are not served through the generic reader. Tell the user this figure '
          + 'needs the screen that gates it by role; do not look for another reader that leaks it.',
      });
    }

    const supplied = args && typeof args === 'object' && !Array.isArray(args) ? args as AnyRow : {};
    const declared = new Set(known.args.map((a) => a.name));
    const unknownArgs = Object.keys(supplied).filter((k) => !declared.has(k));
    if (unknownArgs.length) {
      return JSON.stringify({
        success: false, reader: name,
        error: `${name} takes ${[...declared].join(', ') || 'no arguments'}. It does not take ${unknownArgs.join(', ')}.`,
      });
    }
    const missing = known.args.filter((a) => a.required && supplied[a.name] === undefined).map((a) => a.name);
    if (missing.length) {
      return JSON.stringify({
        success: false, reader: name,
        error: `${name} needs ${missing.join(', ')}. Find the id first rather than guessing one.`,
      });
    }

    // GET, deliberately: PostgREST runs one read-only, so the request cannot become a write.
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(supplied)) {
      if (v === undefined || v === null) continue;
      search.set(k, Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : String(v));
    }

    onChunk?.({ type: 'tool_progress', status: `Reading ${name}…`, timestamp: Date.now() });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      const qs = search.toString();
      const url = `${supabaseUrl()}/rest/v1/rpc/${name}${qs ? `?${qs}` : ''}`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: { apikey: anonKey(), Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      const text = await resp.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text.slice(0, 4000); }

      if (!resp.ok) {
        return JSON.stringify({
          success: false, reader: name, status: resp.status, error: data,
          note: resp.status === 401 || resp.status === 403 || (data as AnyRow)?.code === '42501'
            ? 'The signed-in user may not read this. Say so; do not try another reader.'
            : 'Read the error and correct the arguments, or tell the user what it needs.',
        });
      }

      const { result, truncated } = capResult(data);
      onChunk?.({ type: 'platform_data_result', data: { reader: name, result } });
      return JSON.stringify({ success: true, reader: name, result, truncated });
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      return JSON.stringify({
        success: false, reader: name,
        error: aborted ? `${name} did not answer within ${CALL_TIMEOUT_MS / 1000}s.` : String(e),
        note: aborted
          ? 'It may still be computing. Nothing was written — this is a read — so asking again is safe.'
          : 'The read did not reach the database.',
      });
    } finally {
      clearTimeout(timer);
    }
  },
  {
    name: 'call_platform_rpc',
    description:
      'Read a figure the platform derives, as the signed-in user. Find the reader with '
      + 'discover_platform_data first, then pass its name and the arguments it listed. This is '
      + 'READ-ONLY and cannot change anything. A 403 means the user genuinely may not see it.',
    schema: z.object({
      reader: z.string().describe('The reader name from discover_platform_data, e.g. "get_deal_velocity".'),
      args: z.record(z.any()).optional().describe('Arguments by name, e.g. {"p_workspace_id": "…", "p_days": 28}.'),
    }),
  },
);
