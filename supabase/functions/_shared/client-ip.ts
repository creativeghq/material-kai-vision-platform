/** Trusted client IP for rate-limiting / quota keys (CLAUDE.md invariant #10). */
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
