// deno-lint-ignore-file no-explicit-any
// Platform-wide secret resolver.
// Priority is ALWAYS env-var first, DB fallback second:
//   1. Deno.env.get(key) — wins if set, even when DB has a value.
//   2. platform_secrets.value — fallback for admin-managed config.
// Env-first matters because env represents an explicit deployer choice that should never be
// silently overridden by an admin clicking around in the UI. The DB store is for self-service:
// it makes a key configurable without a redeploy, but env always trumps it when present.

export interface ResolvedSecret {
  key: string;
  value: string | null;
  source: 'env' | 'db' | 'default' | 'missing';
}

export interface PlatformSecretRow {
  key: string;
  value: string | null;
  description: string | null;
  category: string | null;
  primary_module_slug: string | null;
  is_sensitive: boolean;
  default_value: string | null;
  last_verified_at: string | null;
  last_verified_status: 'ok' | 'failed' | null;
  last_verified_error: string | null;
  updated_at: string;
}

type SupabaseLike = { from: (t: string) => any };

const ROW_CACHE = new Map<string, { row: PlatformSecretRow | null; at: number }>();
const CACHE_TTL_MS = 30_000;

async function loadRow(supabase: SupabaseLike, key: string): Promise<PlatformSecretRow | null> {
  const cached = ROW_CACHE.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.row;

  try {
    const { data } = await supabase
      .from('platform_secrets')
      .select('*')
      .eq('key', key)
      .maybeSingle();
    const row = (data ?? null) as PlatformSecretRow | null;
    ROW_CACHE.set(key, { row, at: Date.now() });
    return row;
  } catch {
    ROW_CACHE.set(key, { row: null, at: Date.now() });
    return null;
  }
}

/**
 * Resolve a single secret. Env wins, DB is fallback, default_value is third.
 * Returns the source so callers can log/expose where the value came from.
 */
export async function resolveSecret(supabase: SupabaseLike, key: string): Promise<ResolvedSecret> {
  const envVal = Deno.env.get(key);
  if (envVal && envVal.length > 0) {
    return { key, value: envVal, source: 'env' };
  }

  const row = await loadRow(supabase, key);
  if (row?.value && row.value.length > 0) {
    return { key, value: row.value, source: 'db' };
  }
  if (row?.default_value && row.default_value.length > 0) {
    return { key, value: row.default_value, source: 'default' };
  }
  return { key, value: null, source: 'missing' };
}

/**
 * Resolve N secrets at once. Returns an object keyed by secret name.
 */
export async function resolveSecrets(
  supabase: SupabaseLike,
  keys: string[],
): Promise<Record<string, ResolvedSecret>> {
  const results = await Promise.all(keys.map(k => resolveSecret(supabase, k)));
  const out: Record<string, ResolvedSecret> = {};
  for (const r of results) out[r.key] = r;
  return out;
}

/**
 * Convenience: get a string value or throw.
 */
export async function requireSecret(supabase: SupabaseLike, key: string): Promise<string> {
  const r = await resolveSecret(supabase, key);
  if (!r.value) throw new Error(`Secret "${key}" is not configured. Set it via env var or /admin/operations → Keys.`);
  return r.value;
}

/**
 * Convenience: get a numeric value (parsed) or null.
 */
export async function resolveSecretAsNumber(supabase: SupabaseLike, key: string): Promise<number | null> {
  const r = await resolveSecret(supabase, key);
  if (!r.value) return null;
  const n = parseInt(r.value, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mask a value for admin GET responses. Never returns the full value.
 */
export function maskSecretValue(value: string | null | undefined, sensitive = true): string | null {
  if (!value) return null;
  if (!sensitive) return value;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Invalidate the per-process cache. Call this from the admin function after writes
 * so subsequent edge-function invocations don't see stale values for 30s.
 */
export function invalidateSecretCache(key?: string): void {
  if (key) ROW_CACHE.delete(key);
  else ROW_CACHE.clear();
}
