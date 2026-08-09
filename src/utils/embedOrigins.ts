/**
 * Origin-list helpers for embed keys (#321 M1, #258).
 *
 * Deliberately free of any Supabase import. These are the frontend half of a contract whose other
 * half is `supabase/functions/_shared/cors.ts`, and
 * [tests/unit/embedKeyOrigins.test.ts](../../tests/unit/embedKeyOrigins.test.ts) imports BOTH to
 * prove they agree. Living in `embedKeysService` put them behind a module-load client that throws
 * without env, so the parity test could not reach them — the guard would have been skipped for the
 * usual reason guards get skipped: it was inconvenient.
 */

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
