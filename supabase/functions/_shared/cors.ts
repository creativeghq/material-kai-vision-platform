export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Type, Cache-Control, Connection',
  'Access-Control-Max-Age': '86400',
};

/** Per-key CORS for the embed SDK (#321 M1). */

/** Lowercase, drop a trailing slash. `HTTPS://Foo.com/` and `https://foo.com` are one origin. */
function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, '');
}

/** Does `origin` satisfy one `allowed_origins` entry? */
function matchesOriginPattern(origin: string, pattern: string): boolean {
  const pat = normalizeOrigin(pattern);
  if (!pat) return false;
  if (pat === '*') return true;
  if (pat === origin) return true;

  // Host-only entry (`acme.com`, `*.acme.com`) — compare against the origin's host, any scheme.
  const hasScheme = pat.includes('://');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  if (!hasScheme) {
    if (pat.startsWith('*.')) return originHost.endsWith(pat.slice(1));
    return originHost === pat;
  }

  // Scheme-qualified wildcard: `https://*.acme.com`.
  const starAt = pat.indexOf('://*.');
  if (starAt === -1) return false;
  const scheme = pat.slice(0, starAt);
  const suffix = pat.slice(starAt + 4); // keeps the leading '.', e.g. '.acme.com'
  let originScheme: string;
  try {
    originScheme = new URL(origin).protocol.replace(/:$/, '');
  } catch {
    return false;
  }
  return originScheme === scheme && originHost.endsWith(suffix);
}

/**
 * True when `origin` is allowed by `allowed`.
 *
 * A null/absent origin is NOT allowed here — callers decide separately what to do with a request
 * that carries no `Origin` header at all (see `embedCorsHeaders`), because that is a non-browser
 * caller and a CORS decision does not apply to it.
 */
export function isOriginAllowed(origin: string | null | undefined, allowed: string[] | null | undefined): boolean {
  if (!origin) return false;
  if (!allowed || allowed.length === 0) return false;
  const normalized = normalizeOrigin(origin);
  return allowed.some((pattern) => typeof pattern === 'string' && matchesOriginPattern(normalized, pattern));
}

/** CORS headers to answer an embed request with, or `null` when this origin may not use this key. */
export function embedCorsHeaders(
  req: Request,
  allowed: string[] | null | undefined,
): Record<string, string> | null {
  const origin = req.headers.get('Origin');
  const base = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-embed-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Type, Cache-Control',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (!origin) return { ...base, 'Access-Control-Allow-Origin': '*' };
  if (!isOriginAllowed(origin, allowed)) return null;
  // An explicit `*` in the allowlist stays `*` — cacheable, and there are no credentials in play.
  const wildcard = (allowed ?? []).some((p) => typeof p === 'string' && p.trim() === '*');
  return { ...base, 'Access-Control-Allow-Origin': wildcard ? '*' : normalizeOrigin(origin) };
}
