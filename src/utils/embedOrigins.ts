/** Origin-list helpers for embed keys (#321 M1, #258). */

/** Normalize a typed origin list; accepts the four forms the edge matcher understands. */
export function normalizeOriginList(raw: string): string[] {
  return raw
    .split(/[\s,\n]+/)
    .map((s) => s.trim().toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean);
}

function matchesOriginPattern(origin: string, pattern: string): boolean {
  const pat = pattern.trim().toLowerCase().replace(/\/+$/, '');
  if (!pat) return false;
  if (pat === '*' || pat === origin) return true;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (!pat.includes('://')) return pat.startsWith('*.') ? url.host.endsWith(pat.slice(1)) : url.host === pat;
  const starAt = pat.indexOf('://*.');
  if (starAt === -1) return false;
  return url.protocol.replace(/:$/, '') === pat.slice(0, starAt) && url.host.endsWith(pat.slice(starAt + 4));
}

/** Client twin of the edge's `isOriginAllowed`; held equal by embedKeyOrigins.test.ts. */
export function originListAllows(list: string[] | null | undefined, origin: string): boolean {
  const o = origin.trim().toLowerCase().replace(/\/+$/, '');
  return !!o && (list ?? []).some((p) => typeof p === 'string' && matchesOriginPattern(o, p));
}

/** True when this list lets any site on the internet use the key. */
export function isWildcardOriginList(origins: string[] | null | undefined): boolean {
  return (origins ?? []).some((o) => o.trim() === '*');
}
