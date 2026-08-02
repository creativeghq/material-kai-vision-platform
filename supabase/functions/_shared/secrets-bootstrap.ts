// deno-lint-ignore-file no-explicit-any
// One-shot bootstrap that pre-populates Deno.env from platform_secrets for the lifetime of
// the worker. This lets every existing `Deno.env.get('XXX')` call in the codebase transparently
// pick up admin-saved DB values — without touching the 50+ functions that read env directly.
// Priority is preserved: env-first. If the env var is already set (real deployment secret), the
// DB row is NEVER overwritten into env. The DB only fills in keys that the deployer left blank.
// Call this ONCE per worker, as early as possible in the request lifecycle. The recommended hook
// is _shared/auth.ts → authenticate(), which is already called at the top of nearly every
// function. For functions that don't use authenticate(), call bootstrapSecretsFromDb(supabase)
// at the top of the handler manually.

let bootstrapped: Promise<void> | null = null;

export function bootstrapSecretsFromDb(supabase: { from: (t: string) => any }): Promise<void> {
  // Memoised — every call after the first is a no-op in the same worker.
  if (bootstrapped) return bootstrapped;
  bootstrapped = (async () => {
    try {
      const { data: rows, error } = await supabase
        .from('platform_secrets')
        .select('key, value')
        .not('value', 'is', null);
      if (error || !rows) return;

      for (const row of rows) {
        if (!row.value) continue;
        // Env always wins — never overwrite a value the deployer set.
        if (Deno.env.get(row.key)) continue;
        try {
          Deno.env.set(row.key, row.value);
        } catch {
          // Some Deno permission setups deny env.set; that's fine — we silently skip.
        }
      }
    } catch (err) {
      // Bootstrap failure must never break the function. Log and continue with env-only.
      console.warn('[secrets-bootstrap] failed:', err);
    }
  })();
  return bootstrapped;
}

/**
 * Reset the memoisation barrier. Useful in tests or after a secret save when the same worker
 * needs to pick up new values without restarting.
 */
export function resetSecretsBootstrap(): void {
  bootstrapped = null;
}

/**
 * One-liner for edge functions that DON'T call _shared/auth.ts → authenticate() (crons,
 * webhooks, public AI endpoints). Constructs an admin client internally so callers don't have
 * to plumb one through. Call as the first await in the request handler.
 *
 * Example:
 *   Deno.serve(async (req) => {
 *     await bootstrapForFunction();
 *     // … rest of handler can now rely on Deno.env.get() seeing platform_secrets DB values
 *   });
 */
export async function bootstrapForFunction(): Promise<void> {
  if (bootstrapped) return bootstrapped;
  const { createClient } = await import('@supabase/supabase-js');
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return; // can't reach DB; env-only mode
  const client = createClient(url, key);
  await bootstrapSecretsFromDb(client);
}
