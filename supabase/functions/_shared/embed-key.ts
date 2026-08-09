/**
 * Embed-key authentication for the public embed surface (#321 M1, #258).
 *
 * The one place a `material_kai_keys` row turns into a workspace. Every public embed endpoint
 * goes through `authenticateEmbedKey` and uses the workspace it returns — the key IS the tenancy
 * binding, so no embed request ever reads a workspace id from a body, a query param or a header
 * (CLAUDE.md invariant 1: the caller does not get to name its own tenant).
 *
 * Three gates, cheapest first:
 *   1. the key resolves to an active, unexpired row        → else 401
 *   2. the browser's Origin is in that key's allowlist      → else 403, WITHOUT permissive CORS
 *   3. the key is under its per-minute quota                → else 429
 *
 * Gate 2 binds browsers only and gate 3 binds everyone; see the note in `_shared/cors.ts` on why
 * that is the honest reading of a publishable key rather than a gap.
 */
import type { DbClient } from './supabase-client.ts';
import { embedCorsHeaders } from './cors.ts';

export type EmbedScopeType = 'all' | 'categories' | 'products';

export interface EmbedKeyContext {
  keyId: string;
  /** Derived from the key row. The ONLY source of tenancy on an embed request. */
  workspaceId: string;
  /**
   * Which slice of the published catalog this key may read.
   *
   * Enforced server-side on every action. It cannot be a request parameter: the key is public, so
   * anything the request can say, an attacker can say too.
   */
  scopeType: EmbedScopeType;
  scopeValues: string[];
  /** CORS headers every response on this request must carry. */
  cors: Record<string, string>;
}

/**
 * Combine id restrictions, where `null` means "no restriction" and `[]` means "nothing matches".
 *
 * That distinction is the whole reason this is a named, tested function rather than an inline
 * `&&`. The two values are both falsy-ish to a reader, they are one keystroke apart, and getting
 * them backwards fails in opposite and equally silent directions: treating `[]` as "unrestricted"
 * serves the ENTIRE catalog through a scoped key, and treating `null` as "nothing" serves an empty
 * shelf through a working one. Neither raises.
 *
 * Intersection, not union — every restriction present must hold (a key scoped to a category, asked
 * for only_3d, gets the products that are both).
 */
export function intersectIdFilters(...filters: (string[] | null)[]): string[] | null {
  const present = filters.filter((f): f is string[] => f !== null);
  if (present.length === 0) return null;
  return present.reduce((acc, next) => {
    const nextSet = new Set(next);
    return acc.filter((id) => nextSet.has(id));
  });
}

export type EmbedAuthResult =
  | { ok: true; ctx: EmbedKeyContext }
  | { ok: false; response: Response };

/** Header first (what the web component sends), query param second (hand-written <img>/link uses). */
export function readEmbedKey(req: Request): string | null {
  const header = req.headers.get('x-embed-key');
  if (header && header.trim()) return header.trim();
  try {
    const param = new URL(req.url).searchParams.get('key');
    if (param && param.trim()) return param.trim();
  } catch {
    // Unparseable URL — treat as no key.
  }
  return null;
}

/**
 * A refusal that deliberately carries NO `Access-Control-Allow-Origin`.
 *
 * Used when we cannot vouch for the origin — an unknown key (we have no allowlist to check it
 * against) or an origin the key does not permit. Answering these with permissive CORS would let
 * the calling page read the refusal and, more importantly, would make the allowlist advisory.
 */
function opaqueRefusal(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
  });
}

/** JSON response carrying this request's per-key CORS headers. */
export function embedJson<T>(body: T, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/**
 * Resolve the caller's embed key to a workspace, or produce the refusal to return.
 *
 * `supabase` must be the SERVICE-ROLE client: the caller is anonymous by design, so there is no
 * JWT for RLS to act on. That makes the checks below the whole of the access control, which is
 * why they are here and not copied into each endpoint.
 */
export async function authenticateEmbedKey(
  supabase: DbClient,
  req: Request,
): Promise<EmbedAuthResult> {
  const key = readEmbedKey(req);
  if (!key) return { ok: false, response: opaqueRefusal('Missing embed key', 401) };

  const { data: row, error } = await supabase
    .from('material_kai_keys')
    .select('id, workspace_id, is_active, expires_at, allowed_origins, rate_limit_per_minute, scope_type, scope_values')
    .eq('api_key', key)
    .maybeSingle();

  // One indistinguishable answer for unknown / disabled / expired, so the endpoint cannot be used
  // to test which keys exist.
  if (error || !row || !row.is_active) {
    return { ok: false, response: opaqueRefusal('Invalid embed key', 401) };
  }
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return { ok: false, response: opaqueRefusal('Invalid embed key', 401) };
  }

  const cors = embedCorsHeaders(req, row.allowed_origins as string[] | null);
  if (!cors) {
    return {
      ok: false,
      response: opaqueRefusal('This origin is not allowed to use this embed key', 403),
    };
  }

  // Quota AFTER the origin check — a blocked origin should not be able to burn a tenant's budget.
  const { data: allowed, error: quotaError } = await supabase.rpc('consume_embed_key_quota', {
    p_key_id: row.id as string,
    p_limit: (row.rate_limit_per_minute as number | null) ?? 60,
  });
  // Fail CLOSED. A quota check that errors is not evidence of headroom, and this endpoint is
  // anonymous — treating an outage as "allow" turns one broken RPC into an open relay.
  if (quotaError) {
    return { ok: false, response: embedJson({ error: 'Rate limit unavailable' }, 503, cors) };
  }
  if (allowed === false) {
    return {
      ok: false,
      response: embedJson({ error: 'Rate limit exceeded for this embed key' }, 429, cors),
    };
  }

  return {
    ok: true,
    ctx: {
      keyId: row.id as string,
      workspaceId: row.workspace_id as string,
      // Default to the most restrictive reading of a missing value. A row that somehow carries no
      // scope_type is a bug, and an unrecognised one must not fall through to "serve everything".
      scopeType: (['all', 'categories', 'products'] as const).includes(row.scope_type as EmbedScopeType)
        ? (row.scope_type as EmbedScopeType)
        : 'products',
      scopeValues: (row.scope_values as string[] | null) ?? [],
      cors,
    },
  };
}
