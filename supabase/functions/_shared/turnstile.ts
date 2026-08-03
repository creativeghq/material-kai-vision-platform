import { resolveSecret } from './secrets.ts';
import type { DbClient } from './supabase-client.ts';

/**
 * Cloudflare Turnstile verification — the canonical copy.
 *
 * There were four near-identical implementations (hr-careers, inbox-api, public-project-plan, and
 * this one was about to become the fifth for the storefront). They had already drifted in the way
 * that matters: `public-project-plan` read the secret with `Deno.env.get('TURNSTILE_SECRET_KEY')`,
 * and that is the one mistake this check cannot survive.
 *
 * WHY `Deno.env.get` IS WRONG HERE. `bootstrapForFunction()` copies `platform_secrets` into env via
 * `Deno.env.set`, which this runtime DENIES — the bootstrap swallows the throw. So an admin-saved
 * key never reaches env, `Deno.env.get` returns undefined, and the "not configured → allow" branch
 * fires on every request. The bot gate then reports itself as working while challenging nobody:
 * a guard that cannot fail is worth less than no guard, because it also stops anyone looking.
 * `resolveSecret` reads env FIRST and falls back to `platform_secrets`, so both configuration
 * routes work.
 *
 * FAIL-OPEN WHEN UNCONFIGURED, FAIL-CLOSED WHEN CONFIGURED. This is deliberate and is the same
 * ruling every public form in this platform already follows. A tenant who has never set up
 * Turnstile must still be able to take an order or receive a job application; a tenant who HAS set
 * it up must have a missing or forged token rejected. The failure mode of the alternative — every
 * public form on the platform breaking the moment a secret is unset — is worse than the bots.
 */
export async function verifyTurnstile(
  db: DbClient,
  token: string | null | undefined,
  ip: string,
): Promise<{ ok: boolean; configured: boolean }> {
  const secret = (await resolveSecret(db, 'TURNSTILE_SECRET_KEY').catch(() => ({ value: null })))?.value;
  if (!secret) return { ok: true, configured: false };

  // Configured but no token supplied: reject without asking Cloudflare. Saves a round trip and
  // makes "the client didn't render the widget" indistinguishable from "the client faked it",
  // which is the correct posture — both are a caller that did not pass the challenge.
  if (!token) return { ok: false, configured: true };

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const out = await r.json().catch(() => ({ success: false }));
    return { ok: !!out.success, configured: true };
  } catch (e) {
    // Cloudflare unreachable. Fail OPEN on an infrastructure failure — the alternative is that a
    // Cloudflare outage takes down checkout and every public form we own. The bot exposure lasts
    // as long as the outage; the availability exposure would last as long as we kept the rule.
    console.error('[turnstile] siteverify unreachable, allowing:', e instanceof Error ? e.message : e);
    return { ok: true, configured: true };
  }
}

/**
 * The caller's IP for Turnstile's `remoteip` and for rate limiting.
 *
 * FIRST hop of x-forwarded-for. On Supabase edge the header is appended by the trusted proxy, so
 * the left-most entry is the real client. Never read a raw client-controlled header (invariant 10
 * says the quota IP comes from the trusted proxy hop) — a caller who picks their own IP defeats
 * any per-IP limit by rotating it.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || '0.0.0.0';
}
