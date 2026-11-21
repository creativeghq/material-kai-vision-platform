const GOTO = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/goto\?/i;
const ORIGIN = /^\s*(https?:\/\/[^\s/›>]+)/i;
const MAX_DEPTH = 12;

export function isGotoUrl(value: unknown): boolean {
  return typeof value === 'string' && GOTO.test(value);
}

export function breadcrumbHost(breadcrumb: unknown): string | null {
  if (typeof breadcrumb !== 'string') return null;
  const m = ORIGIN.exec(breadcrumb);
  if (!m) return null;
  try {
    const host = new URL(m[1]).hostname.toLowerCase();
    if (!host || host === 'google.com' || host.endsWith('.google.com')) return null;
    return host;
  } catch {
    return null;
  }
}

export function normalizeGotoInPlace(node: unknown, depth = 0): number {
  if (depth > MAX_DEPTH || !node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n: number, v) => n + normalizeGotoInPlace(v, depth + 1), 0);
  const o = node as Record<string, unknown>;
  let fixed = 0;
  if (isGotoUrl(o.url)) {
    o.goto_url = o.url;
    o.url = null;
    o.url_unresolved = true;
    const d = String(o.domain || '').toLowerCase();
    if (!d || d === 'google.com' || d.endsWith('.google.com')) o.domain = breadcrumbHost(o.breadcrumb);
    fixed = 1;
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') fixed += normalizeGotoInPlace(v, depth + 1);
  }
  return fixed;
}

const GOOGLE_HOP = /^https:\/\/(?:www\.)?google\.[a-z.]+\/goto\?url=[\w-]+$/;

function ownsHost(url: string, host: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return h === host || h.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

/** Our own row only: Google answers one GoTo per results page. Never fetches the destination. */
export async function resolveOwnGoto(gotoUrl: string, host: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let cur = gotoUrl;
  for (let hop = 0; hop < 3; hop++) {
    if (!GOOGLE_HOP.test(cur)) return null;
    let res: Response;
    try {
      res = await fetchImpl(cur, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
    } catch {
      return null;
    }
    await res.body?.cancel().catch(() => {});
    const loc = res.headers.get('location');
    if (!loc) return null;
    if (ownsHost(loc, host)) return loc;
    cur = loc;
  }
  return null;
}
