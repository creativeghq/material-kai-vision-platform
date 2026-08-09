/**
 * Origin allowlist guard for embed keys (#321 M1, #258).
 *
 * `material_kai_keys.allowed_origins` existed for a year with no code that read it, and a default
 * of `['*']`. Now that it is enforced, it is the whole of the browser-side access control on a
 * PUBLISHABLE key — so the matcher has to be exactly right, and "exactly right" here is mostly
 * about what it must REFUSE.
 *
 * The failure this test is really guarding is the suffix bug: `origin.endsWith('acme.com')` is the
 * obvious spelling of a subdomain wildcard and it also accepts `https://evil-acme.com`, a domain
 * anyone can register. That one is asserted from both directions, and it is why the matcher
 * compares against a leading dot.
 *
 * The second half asserts PARITY between the two halves of the feature that a user experiences as
 * one: what `normalizeOriginList` (frontend, what the tenant types into Profile → Keys) produces
 * must be a pattern `isOriginAllowed` (edge, what actually gates the request) accepts. Those live
 * in different runtimes and cannot import each other, which is the same setup that let the three
 * escapeHtml copies drift.
 */
import { describe, it, expect } from 'vitest';
import { isOriginAllowed, embedCorsHeaders } from '../../supabase/functions/_shared/cors';
import { intersectIdFilters } from '../../supabase/functions/_shared/embed-key';
import { normalizeOriginList, isWildcardOriginList } from '@/utils/embedOrigins';

const req = (origin?: string | null) =>
  new Request('https://example.supabase.co/functions/v1/products-3d-api', {
    headers: origin == null ? {} : { Origin: origin },
  });

describe('isOriginAllowed', () => {
  it('accepts an exact origin', () => {
    expect(isOriginAllowed('https://shop.acme.com', ['https://shop.acme.com'])).toBe(true);
  });

  it('ignores case and a trailing slash on both sides', () => {
    expect(isOriginAllowed('HTTPS://Shop.Acme.com/', ['https://shop.acme.com'])).toBe(true);
    expect(isOriginAllowed('https://shop.acme.com', ['HTTPS://SHOP.ACME.COM/'])).toBe(true);
  });

  it('accepts a host-only entry on any scheme, because that is how people type it', () => {
    expect(isOriginAllowed('https://acme.com', ['acme.com'])).toBe(true);
    expect(isOriginAllowed('http://acme.com', ['acme.com'])).toBe(true);
  });

  it('matches subdomains under a wildcard', () => {
    expect(isOriginAllowed('https://shop.acme.com', ['https://*.acme.com'])).toBe(true);
    expect(isOriginAllowed('https://a.b.acme.com', ['https://*.acme.com'])).toBe(true);
    expect(isOriginAllowed('https://shop.acme.com', ['*.acme.com'])).toBe(true);
  });

  // THE bug this matcher exists to avoid. `evil-acme.com` is registrable by anyone and ends with
  // the string "acme.com"; it is not a subdomain of it.
  it('refuses a lookalike domain that merely ends with the allowed one', () => {
    expect(isOriginAllowed('https://evil-acme.com', ['https://*.acme.com'])).toBe(false);
    expect(isOriginAllowed('https://evilacme.com', ['*.acme.com'])).toBe(false);
    expect(isOriginAllowed('https://acme.com.evil.net', ['https://*.acme.com'])).toBe(false);
  });

  it('does not let a subdomain wildcard cover the apex', () => {
    expect(isOriginAllowed('https://acme.com', ['https://*.acme.com'])).toBe(false);
  });

  it('honours the scheme on a scheme-qualified wildcard', () => {
    expect(isOriginAllowed('http://shop.acme.com', ['https://*.acme.com'])).toBe(false);
  });

  it('refuses a different origin, an empty list, and a missing origin', () => {
    expect(isOriginAllowed('https://other.com', ['https://shop.acme.com'])).toBe(false);
    expect(isOriginAllowed('https://shop.acme.com', [])).toBe(false);
    expect(isOriginAllowed('https://shop.acme.com', null)).toBe(false);
    expect(isOriginAllowed(null, ['*'])).toBe(false);
  });

  it('accepts anything under an explicit wildcard', () => {
    expect(isOriginAllowed('https://anywhere.example', ['*'])).toBe(true);
  });

  // A sandboxed iframe sends the literal string "null" as its Origin. It is not parseable as a
  // URL and must not be treated as a match for anything.
  it('refuses the opaque "null" origin', () => {
    expect(isOriginAllowed('null', ['*.acme.com'])).toBe(false);
    expect(isOriginAllowed('null', ['https://shop.acme.com'])).toBe(false);
  });
});

describe('embedCorsHeaders', () => {
  it('echoes an allowed origin and always varies on it', () => {
    const headers = embedCorsHeaders(req('https://shop.acme.com'), ['https://shop.acme.com']);
    expect(headers?.['Access-Control-Allow-Origin']).toBe('https://shop.acme.com');
    // Without Vary: Origin a shared cache can hand one tenant's browser another tenant's grant.
    expect(headers?.['Vary']).toBe('Origin');
  });

  it('returns null for a disallowed origin, so the caller can refuse without granting CORS', () => {
    expect(embedCorsHeaders(req('https://evil.com'), ['https://shop.acme.com'])).toBeNull();
  });

  it('answers a request with no Origin header — a non-browser caller — with the wildcard', () => {
    const headers = embedCorsHeaders(req(null), ['https://shop.acme.com']);
    expect(headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('keeps an explicit wildcard as "*" rather than echoing', () => {
    const headers = embedCorsHeaders(req('https://anywhere.example'), ['*']);
    expect(headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('advertises the embed key header, or the browser strips it from the real request', () => {
    const headers = embedCorsHeaders(req('https://shop.acme.com'), ['https://shop.acme.com']);
    expect(headers?.['Access-Control-Allow-Headers']).toContain('x-embed-key');
  });
});

/**
 * `null` = "this filter did not restrict anything"; `[]` = "this filter matched nothing".
 *
 * Both read as empty-ish and they are one keystroke apart, and swapping them fails in opposite,
 * silent directions: `[]` treated as unrestricted serves the WHOLE catalog through a key scoped to
 * one collection, and `null` treated as empty serves an empty shelf through a working key. A
 * catalog is a valid response either way, so nothing downstream can notice.
 */
describe('intersectIdFilters — null is not the same as empty', () => {
  it('returns null only when nothing restricted', () => {
    expect(intersectIdFilters(null, null)).toBeNull();
    expect(intersectIdFilters()).toBeNull();
  });

  it('a single restriction passes through', () => {
    expect(intersectIdFilters(['a', 'b'], null)).toEqual(['a', 'b']);
    expect(intersectIdFilters(null, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('an empty restriction wins — it means nothing matches, not "no filter"', () => {
    expect(intersectIdFilters([], null)).toEqual([]);
    expect(intersectIdFilters(['a', 'b'], [])).toEqual([]);
    expect(intersectIdFilters([], ['a'])).toEqual([]);
  });

  it('intersects rather than unions, so a caller cannot widen past the key scope', () => {
    // Key scoped to a+b; caller asks for only_3d which matches b+c. Only b is legitimately visible.
    expect(intersectIdFilters(['a', 'b'], ['b', 'c'])).toEqual(['b']);
    expect(intersectIdFilters(['a'], ['b'])).toEqual([]);
  });

  it('handles three restrictions', () => {
    expect(intersectIdFilters(['a', 'b', 'c'], ['b', 'c'], ['c'])).toEqual(['c']);
  });
});

describe('what the tenant types is what the edge accepts', () => {
  // Left: pasted into the "Websites allowed to use this key" box. Right: an origin that must work.
  const CASES: Array<[string, string]> = [
    ['https://www.acme.com', 'https://www.acme.com'],
    ['https://www.acme.com/', 'https://www.acme.com'],
    ['  HTTPS://WWW.ACME.COM  ', 'https://www.acme.com'],
    ['acme.com', 'https://acme.com'],
    ['https://*.acme.com', 'https://shop.acme.com'],
    ['*.acme.com', 'https://shop.acme.com'],
    ['https://a.com, https://b.com', 'https://b.com'],
    ['https://a.com\nhttps://b.com', 'https://b.com'],
  ];

  it.each(CASES)('%s allows %s', (typed, origin) => {
    expect(isOriginAllowed(origin, normalizeOriginList(typed))).toBe(true);
  });

  it('drops empty lines instead of storing a blank pattern that matches nothing', () => {
    expect(normalizeOriginList('https://a.com\n\n  \n')).toEqual(['https://a.com']);
  });

  it('agrees with the edge on what counts as a wildcard list', () => {
    expect(isWildcardOriginList(normalizeOriginList('*'))).toBe(true);
    expect(isOriginAllowed('https://anything.example', normalizeOriginList('*'))).toBe(true);
    expect(isWildcardOriginList(normalizeOriginList('https://a.com'))).toBe(false);
  });
});
