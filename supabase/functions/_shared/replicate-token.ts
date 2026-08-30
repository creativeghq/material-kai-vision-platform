/**
 * The one way an edge function gets the Replicate credential.
 *
 * ── Why this exists at all ────────────────────────────────────────────────────────────────────
 * Six functions read the token, and until 2026-08-30 every one of them called `Deno.env.get()`
 * directly. Per `_shared/secrets.ts` and the platform-secrets design, that is the one lookup an
 * admin cannot fix: `Deno.env.set` throws on Supabase edge, so `secrets-bootstrap` is a no-op and
 * a `platform_secrets` row is simply unreachable to a `Deno.env.get` caller. The row existed, was
 * empty, and could not have helped even if it were full.
 *
 * ── Why it resolves TWO names ─────────────────────────────────────────────────────────────────
 * Three callers read `REPLICATE_API_TOKEN` (generate-interior-gemini, generate-virtual-staging,
 * model-health-check-agent) and three read `REPLICATE_API_KEY` (generate-social-image,
 * generate-social-video, generate-interior-video-v2). Same account, same value, two spellings —
 * the `platform_secrets` description on `REPLICATE_API_KEY` even says "Same value as
 * REPLICATE_API_TOKEN". So setting one name fixed half the platform and left the other half
 * emitting the identical "not configured" error, which is the worst shape of half-fix: the
 * symptom does not change, so the obvious conclusion is that setting the key did not work.
 * One resolver reading both means ONE row, or ONE project secret, is enough.
 *
 * ── Fail closed, and say which thing failed ───────────────────────────────────────────────────
 * `resolve()` returns the SOURCE alongside the value. A caller that cannot find a credential must
 * report "no Replicate credential is configured" and never "Replicate rejected us" — those send a
 * reader to completely different fixes, and conflating them is exactly what happened here: 18 of
 * 19 registry rows sat at `last_probe_status='auth_failed'` carrying our OWN
 * "REPLICATE_API_TOKEN not configured in this environment" string, while the account was funded
 * and the token worked. Replicate was never called. Same distinction the repo already draws
 * between `collector_failed` and `not_collected` (CLAUDE.md anti-regression 3).
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from './secrets.ts';

/** In precedence order. `REPLICATE_API_TOKEN` is the name Replicate's own docs use. */
export const REPLICATE_KEY_NAMES = ['REPLICATE_API_TOKEN', 'REPLICATE_API_KEY'] as const;

export interface ResolvedReplicateToken {
  /** The credential, or null when neither name resolves anywhere. */
  token: string | null;
  /** Which name it came from — for logs, never for branching on behaviour. */
  key: (typeof REPLICATE_KEY_NAMES)[number] | null;
  /** Where it came from: `env` (a Supabase project secret), `db`/`default` (platform_secrets). */
  source: 'env' | 'db' | 'default' | 'missing';
}

/**
 * The service-role client the resolver reads `platform_secrets` with.
 *
 * Built lazily and memoized. NOT captured at module load — the bootstrap populates env at handler
 * entry, so a module-load read gets `undefined` (CLAUDE.md, Secrets).
 */
let client: ReturnType<typeof createClient> | null = null;
function serviceClient() {
  if (!client) {
    client = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
  }
  return client;
}

/**
 * Resolve the Replicate credential from either accepted name, env first then `platform_secrets`.
 *
 * Not cached here on purpose: `resolveSecret` already caches the DB row for 30s, and caching the
 * VALUE in the isolate would mean an admin setting the key has to wait for a cold start to see it
 * take effect — which is the whole reason the row exists.
 */
export async function resolveReplicateToken(): Promise<ResolvedReplicateToken> {
  const supabase = serviceClient();
  for (const key of REPLICATE_KEY_NAMES) {
    const r = await resolveSecret(supabase, key);
    if (r.value) return { token: r.value, key, source: r.source };
  }
  return { token: null, key: null, source: 'missing' };
}

/**
 * The credential, or `''` when none is configured — a drop-in for the `Deno.env.get(...) || ''`
 * getters this replaced, except that it is async and it also sees `platform_secrets`.
 *
 * Prefer `resolveReplicateToken()` where the caller reports a failure to a human or to a row, so
 * the message can distinguish "not configured" from "rejected".
 */
export async function replicateToken(): Promise<string> {
  return (await resolveReplicateToken()).token ?? '';
}

/**
 * The sentence to show when there is no credential. Names both accepted keys and both places they
 * can live, because "REPLICATE_API_TOKEN not set" sent three separate investigations to the
 * billing page of a funded account.
 */
export const REPLICATE_NOT_CONFIGURED =
  'No Replicate credential is configured. Set REPLICATE_API_TOKEN (or REPLICATE_API_KEY — same ' +
  'value) as a Supabase project secret, or fill it in under Admin → Platform Secrets. This is a ' +
  'missing configuration, NOT a rejected key and NOT an exhausted balance.';
