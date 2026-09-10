/** Origin-list helpers for embed keys (#321 M1, #258). */

/**
 * Normalize what a human typed into an origin list.
 *
 * Accepts `https://shop.acme.com`, `shop.acme.com`, `https://*.acme.com` and a trailing slash,
 * because all four are what people actually paste. The edge matcher understands the same four
 * forms; the parity test is what keeps that true.
 */
export function normalizeOriginList(raw: string): string[] {
  return raw
    .split(/[\s,\n]+/)
    .map((s) => s.trim().toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** True when this list lets any site on the internet use the key. */
export function isWildcardOriginList(origins: string[] | null | undefined): boolean {
  return (origins ?? []).some((o) => o.trim() === '*');
}
