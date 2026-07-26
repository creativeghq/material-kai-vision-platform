/**
 * Trusted client IP for rate-limiting / quota keys (CLAUDE.md invariant #10).
 *
 * Supabase Edge Functions run on Deno Deploy BEHIND Cloudflare. Cloudflare sets `cf-connecting-ip`
 * to the real connecting client and OVERWRITES any client-supplied value — so it is NOT spoofable.
 * `x-forwarded-for` is a client-controllable list: its LEFTMOST entry is whatever the caller chose
 * to prepend, so keying a per-IP quota on `x-forwarded-for.split(',')[0]` lets an attacker mint a
 * fresh bucket per request by rotating the header. NEVER key a limit on the leftmost XFF hop.
 *
 * Resolution order: cf-connecting-ip (trusted edge) → the LAST (proxy-appended) XFF hop → x-real-ip
 * → 'unknown'. The last XFF hop is the one added by the proxy closest to us, not the client's prefix.
 */
export function getTrustedClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
