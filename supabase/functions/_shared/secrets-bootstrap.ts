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
/** One warning per worker when the runtime refuses env.set — see the catch below. */
let warnedEnvSetUnsupported = false;

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
        } catch (err) {
          // NOT fine, and not silent any more. The Supabase edge runtime throws "The operation is
          // not supported" on every env.set, so this bootstrap has never actually populated
          // anything there — and the bare `catch {}` that used to be here meant a DB-only secret
          // read through `Deno.env.get()` came back undefined for ever, with nothing logged.
          // #342 lost an hour to it: email-webhooks reported INBOUND_WEBHOOK_SECRET unset on a
          // COLD boot, which memoisation could not explain.
          // Log ONCE per worker — one line is the difference between a five-minute diagnosis and
          // an hour; one line per key on every boot is noise that gets muted.
          //
          // At INFO, not WARNING. On the Supabase edge runtime this throw is the DOCUMENTED,
          // universal behaviour — it fires on every cold boot of every function, so as a WARNING
          // it was the single most frequent warning in the platform's logs and it is not
          // actionable: `resolveSecret()` already reads the table directly and everything works.
          // A warning that fires on 100% of boots trains the reader to skim past warnings, which
          // is how a real one gets missed. (`SupabaseLoggingHandler` never drops WARNING+ from
          // any logger, so this was also writing a DB row per boot.) The other runtimes where
          // env.set genuinely works never reach this branch at all.
          if (!warnedEnvSetUnsupported) {
            warnedEnvSetUnsupported = true;
            console.info(
              `[secrets-bootstrap] Deno.env.set is unavailable here (${(err as Error).message}). ` +
              'platform_secrets values will NOT appear in Deno.env — read them with ' +
              '_shared/secrets.ts → resolveSecret(), which queries the table directly.',
            );
          }
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
