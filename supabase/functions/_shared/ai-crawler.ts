/** AI-crawler log ingest (#487 B1): payload shape, signature, and vendor IP-range verification. */

export const INGEST_MAX_BYTES = 1_000_000;
export const INGEST_MAX_EVENTS = 1000;
export const SIGNATURE_MAX_SKEW_SECS = 300;

/** GA4 pre-filter for assistant referrers; a superset of `ai_referral_platform()` in SQL, which decides. */
export const AI_REFERRAL_SOURCE_REGEX =
  'chatgpt|searchgpt|openai|perplexity|copilot|edgeservices\\.bing|gemini|bard\\.google|claude|deepseek|grok|x\\.ai|meta\\.ai|mistral|you\\.com|phind';

export interface CrawlerEvent {
  ts: string;
  path: string;
  ua: string;
  ip: string | null;
  status: number | null;
}

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** HMAC-SHA256 over `${timestamp}.${rawBody}`, hex, within the skew window. Fails closed on anything missing. */
export async function verifyIngestSignature(
  secret: string | null | undefined,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  nowSecs: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !timestamp || !signature || !/^\d{9,11}$/.test(timestamp)) return false;
  if (Math.abs(nowSecs - Number(timestamp)) > SIGNATURE_MAX_SKEW_SECS) return false;
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return constantTimeEqual(signature.trim().toLowerCase(), expected);
}

export function signIngestBody(secret: string, timestamp: string, rawBody: string): Promise<string> {
  return hmacHex(secret, `${timestamp}.${rawBody}`);
}

/** `{events:[…]}` or a single event. Malformed entries are dropped, never repaired. */
export function parseIngestBody(body: unknown): CrawlerEvent[] {
  const list = Array.isArray((body as { events?: unknown })?.events)
    ? (body as { events: unknown[] }).events
    : body && typeof body === 'object' && !Array.isArray(body) ? [body] : [];
  const out: CrawlerEvent[] = [];
  for (const e of list.slice(0, INGEST_MAX_EVENTS)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    const ua = typeof r.ua === 'string' ? r.ua.slice(0, 500) : '';
    const path = typeof r.path === 'string' ? r.path.slice(0, 2000) : '';
    const ts = typeof r.ts === 'string' || typeof r.ts === 'number' ? new Date(r.ts) : null;
    if (!ua || !path || !ts || Number.isNaN(ts.getTime())) continue;
    const ip = typeof r.ip === 'string' && /^[0-9a-fA-F:.]{3,45}$/.test(r.ip) ? r.ip : null;
    const status = Number.isInteger(r.status) && (r.status as number) >= 100 && (r.status as number) <= 599 ? r.status as number : null;
    out.push({ ts: ts.toISOString(), path, ua, ip, status });
  }
  return out;
}

/** Vendors that publish their crawler IP ranges. A bot not listed here is stored with `verified: null`. */
export const PUBLISHED_RANGES: readonly { needle: string; url: string }[] = [
  { needle: 'oai-searchbot', url: 'https://openai.com/searchbot.json' },
  { needle: 'chatgpt-user', url: 'https://openai.com/chatgpt-user.json' },
  { needle: 'gptbot', url: 'https://openai.com/gptbot.json' },
  { needle: 'perplexity-user', url: 'https://www.perplexity.ai/perplexity-user.json' },
  { needle: 'perplexitybot', url: 'https://www.perplexity.ai/perplexitybot.json' },
];

export function rangeSourceFor(ua: string): string | null {
  const u = ua.toLowerCase();
  return PUBLISHED_RANGES.find((r) => u.includes(r.needle))?.url ?? null;
}

function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = (n << 8n) | BigInt(Number(p));
  }
  return n;
}

function ipv6ToBigInt(ip: string): bigint | null {
  let s = ip.toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = ipv4ToBigInt(v4[1]);
    if (n == null) return null;
    s = s.slice(0, -v4[1].length) + `${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

/** Is `ip` inside `cidr`? Families never cross-match. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const v6 = base.includes(':');
  if (v6 !== ip.includes(':')) return false;
  const width = v6 ? 128 : 32;
  const bits = bitsRaw === undefined ? width : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > width) return false;
  const a = v6 ? ipv6ToBigInt(ip) : ipv4ToBigInt(ip);
  const b = v6 ? ipv6ToBigInt(base) : ipv4ToBigInt(base);
  if (a == null || b == null) return false;
  const shift = BigInt(width - bits);
  return (a >> shift) === (b >> shift);
}

export function prefixesFromRangeFile(body: unknown): string[] {
  const list = (body as { prefixes?: unknown })?.prefixes;
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => (p as Record<string, unknown>)?.ipv4Prefix ?? (p as Record<string, unknown>)?.ipv6Prefix)
    .filter((p): p is string => typeof p === 'string' && p.includes('/'));
}

const RANGE_TTL_MS = 6 * 3600_000;
const rangeCache = new Map<string, { at: number; prefixes: string[] | null }>();

/** The vendor's prefixes, cached per worker; `null` when the list could not be fetched (verdict unknown). */
export async function vendorPrefixes(url: string, fetcher: typeof fetch = fetch): Promise<string[] | null> {
  const hit = rangeCache.get(url);
  if (hit && Date.now() - hit.at < RANGE_TTL_MS) return hit.prefixes;
  let prefixes: string[] | null = null;
  try {
    const resp = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const list = prefixesFromRangeFile(await resp.json());
      prefixes = list.length ? list : null;
    }
  } catch {
    prefixes = null;
  }
  rangeCache.set(url, { at: Date.now(), prefixes });
  return prefixes;
}

/** true / false against the vendor's published ranges; null when the vendor publishes none or the list is unavailable. */
export async function verifyCrawlerIp(ua: string, ip: string | null, fetcher: typeof fetch = fetch): Promise<boolean | null> {
  const url = rangeSourceFor(ua);
  if (!url || !ip) return null;
  const prefixes = await vendorPrefixes(url, fetcher);
  if (!prefixes) return null;
  return prefixes.some((c) => ipInCidr(ip, c));
}
