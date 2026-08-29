import { resolveSecret } from './secrets.ts';
import { getTrustedClientIp } from './client-ip.ts';
import type { DbClient } from './supabase-client.ts';

/**
 * Cloudflare Turnstile verification — the canonical copy.
 *
 * There were four near-identical implementations (hr-careers, inbox-api, public-project-plan, and
 * this one was about to become the fifth for the storefront). All four work today; consolidating
 * them is about keeping it that way, not about repairing a break — I claimed public-project-plan
 * was broken, checked production, and it answers "Bot check failed" rather than "not configured",
 * so its `Deno.env.get` read was finding the key all along.
 *
 * WHY `resolveSecret` RATHER THAN `Deno.env.get`. Both work when the secret is set as a Supabase
 * edge secret, which is how it is set today. Only `resolveSecret` ALSO finds a key saved from the
 * admin UI into `platform_secrets` — `bootstrapForFunction()` cannot bridge that gap, because it
 * copies platform_secrets into env with `Deno.env.set`, which this runtime denies while the
 * bootstrap swallows the throw. An env-only read is therefore correct until the day someone
 * configures the key from the admin screen, at which point the gate silently starts allowing
 * everything. `resolveSecret` reads env FIRST and falls back, so both routes work.
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
 * The caller's IP for Turnstile's `remoteip` and for rate limiting (#354 HR-12).
 *
 * This used to take the FIRST hop of `x-forwarded-for`, citing invariant 10 while doing the exact
 * thing invariant 10 forbids. `_shared/client-ip.ts` — written for the same rule — says the
 * opposite and is right: Cloudflare APPENDS the connecting IP to whatever XFF the caller sent, so
 * the left-most entry is the attacker's prefix and the right-most is the proxy's. Two shared
 * helpers for one rule, disagreeing, and the wrong one was the one the public forms imported: a
 * caller rotating that header minted a fresh rate-limit bucket per request, which is unlimited
 * applications on the careers form and unlimited attempts on every other public surface.
 *
 * There is now one implementation. `cf-connecting-ip` is preferred where present because
 * Cloudflare overwrites it and it cannot be forged.
 */
export function clientIp(req: Request): string {
  return getTrustedClientIp(req);
}
