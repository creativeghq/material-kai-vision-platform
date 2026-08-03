import { resolveSecret } from './secrets.ts';
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
