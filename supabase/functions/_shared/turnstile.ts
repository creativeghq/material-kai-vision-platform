import { resolveSecret } from './secrets.ts';
import { getTrustedClientIp } from './client-ip.ts';
import type { DbClient } from './supabase-client.ts';

/** Cloudflare Turnstile verification — the canonical copy. */
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

/** The caller's IP for Turnstile's `remoteip` and for rate limiting (#354 HR-12). */
export function clientIp(req: Request): string {
  return getTrustedClientIp(req);
}
