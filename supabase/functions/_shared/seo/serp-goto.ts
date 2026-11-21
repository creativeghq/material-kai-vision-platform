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
