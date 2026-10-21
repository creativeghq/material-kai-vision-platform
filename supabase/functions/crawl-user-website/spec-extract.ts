/** A crawled page's own product facts and same-site links, read deterministically from its HTML. */

export interface PageSpecs {
  source: 'jsonld' | 'table' | 'mixed';
  attributes: Record<string, string>;
  price: { amount: number; currency: string } | null;
  extracted_at: string;
}

const MAX_LABEL_CHARS = 80;
const MAX_VALUE_CHARS = 300;
const MAX_ATTRIBUTES = 80;
const MAX_TABLE_COLUMNS = 12;
const MAX_DISTINCT_PER_COLUMN = 20;
/** A spec list this close after a link to another page is that page's listing card. */
const CARD_LOOKBACK_CHARS = 500;
export const MAX_CONTENT_LINKS = 400;

const CURRENCY_SYMBOLS: Record<string, string> = { '€': 'EUR', '$': 'USD', '£': 'GBP' };
/** The words a page uses to say a figure is an estimate, not its price, in the languages our sites are written in. */
const ESTIMATE = /indicativ|estimat|approx|\bcirca\b|\bca\.|ενδεικτ|περίπου|εκτιμ|unverbindlich|richtwert|ungefähr|indicatif|environ|estimé|orientativ|aproximad|stimat|indicativo|orientativo/iu;
/** Two amounts joined by a dash, money on at least one side: «€21–€36», «20 - 30 EUR»; never «60x60 - 34,90 €» or «€34,90 - 2 pcs». */
const DASH_RANGE = /(?:€|\$|£|\b(?:EUR|USD|GBP)\b)\s*\d[\d.,]*\s*[-–—]\s*(?:€|\$|£|\b(?:EUR|USD|GBP)\b)?\s*\d[\d.,]*(?!\s*(?!(?:EUR|USD|GBP)\b)\p{L})|(?<![x×\d.,])\d[\d.,]*\s*[-–—]\s*\d[\d.,]*\s*(?:€|\$|£|\b(?:EUR|USD|GBP)\b)/u;

function decodeEntities(s: string): string {
  return s.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g,
    (_m, dec: string, hex: string, name: string) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name] ?? ' ';
    },
  );
}

function clean(s: unknown): string {
  return String(s ?? '').replace(/[\s ]+/g, ' ').trim();
}

function cellText(fragment: string): string {
  return clean(decodeEntities(
    fragment
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ));
}

/** A table row on ONE line, cells joined by " | ": a value split across lines inside a cell must stay with its row's label. */
function rowLine(row: string): string {
  const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => m[1]
      .replace(/<\/(p|div|li)>|<br\s*\/?>/gi, '\u0000')
      .replace(/<[^>]+>/g, ' ')
      .split('\u0000')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' · '))
    .filter(Boolean);
  return cells.length ? `\n${cells.join(' | ')}\n` : '\n';
}

export function textFromHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_m, row: string) => rowLine(row))
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function cleanLabel(s: string): string {
  return s.replace(/\s*[:：]\s*$/, '').trim();
}

/** `<main>` when the page has one, else `<body>`; site chrome removed either way. */
export function mainContentHtml(html: string): string {
  const start = html.search(/<main\b/i);
  const end = html.toLowerCase().lastIndexOf('</main>');
  let region = start >= 0 && end > start ? html.slice(start, end) : null;
  if (!region) {
    const b = html.search(/<body\b/i);
    region = b >= 0 ? html.slice(b) : html;
  }
  return region
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
}

function hostKey(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, '');
}

function sameSiteUrl(href: string, pageUrl: string): string | null {
  const raw = decodeEntities(href).trim();
  if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(raw)) return null;
  try {
    const page = new URL(pageUrl);
    const u = new URL(raw, page);
    if (!/^https?:$/.test(u.protocol) || hostKey(u) !== hostKey(page)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function samePage(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}

/** Same-site links in the page's main content, de-duplicated, in document order. */
export function extractContentLinks(html: string, pageUrl: string, max = MAX_CONTENT_LINKS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of mainContentHtml(html).matchAll(/<a\b[^>]*\shref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    if (out.length >= max) break;
    const url = sameSiteUrl(m[2] ?? m[3] ?? '', pageUrl);
    if (!url || samePage(url, pageUrl) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function isListingCard(region: string, blockStart: number, pageUrl: string): boolean {
  const before = region.slice(Math.max(0, blockStart - CARD_LOOKBACK_CHARS), blockStart);
  for (const m of before.matchAll(/<a\b[^>]*\shref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const url = sameSiteUrl(m[2] ?? m[3] ?? '', pageUrl);
    if (url && !samePage(url, pageUrl)) return true;
  }
  return false;
}

type Pair = [string, string];

function tablePairs(table: string): Pair[] {
  const body = table.replace(/<caption\b[\s\S]*?<\/caption>/gi, ' ');
  const rows: { header: boolean; text: string }[][] = [];
  for (const r of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...r[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((c) => ({ header: c[1].toLowerCase() === 'th', text: cellText(c[2]) }));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return [];

  const head = rows[0];
  const data = rows.slice(1);
  const columnar = head.length >= 2 && head.length <= MAX_TABLE_COLUMNS
    && head.every((c) => c.header) && data.length > 0
    && data.filter((r) => !r[0]?.header).length * 2 > data.length;
  if (columnar) {
    const pairs: Pair[] = [];
    head.forEach((h, i) => {
      if (!h.text) return;
      const values = [...new Set(data.map((r) => r[i]?.text ?? '').filter(Boolean))]
        .slice(0, MAX_DISTINCT_PER_COLUMN);
      if (values.length) pairs.push([h.text, values.join(', ')]);
    });
    return pairs;
  }

  const pairs: Pair[] = [];
  for (const r of rows) {
    if (r.length < 2 || r.every((c) => c.header)) continue;
    const value = r.slice(1).find((c) => c.text)?.text;
    if (r[0].text && value) pairs.push([r[0].text, value]);
  }
  return pairs;
}

function dlPairs(dl: string): Pair[] {
  const pairs: Pair[] = [];
  let label: string | null = null;
  let values: string[] = [];
  const flush = () => {
    if (label && values.length) pairs.push([label, values.join(', ')]);
    values = [];
  };
  for (const m of dl.matchAll(/<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = cellText(m[2]);
    if (m[1].toLowerCase() === 'dt') { flush(); label = text; } else if (text) values.push(text);
  }
  flush();
  return pairs;
}

function listPairs(list: string): Pair[] {
  if (/<(ul|ol)\b/i.test(list.slice(4))) return [];
  const items = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => cellText(m[1]));
  const pairs: Pair[] = [];
  for (const t of items) {
    const kv = /^([^:：]{1,60})[:：]\s*(.+)$/.exec(t);
    if (kv) pairs.push([kv[1], kv[2]]);
  }
  return pairs.length >= 2 && pairs.length * 2 >= items.length ? pairs : [];
}

function htmlPairs(html: string, pageUrl: string): Pair[] {
  const region = mainContentHtml(html);
  const blocks: { at: number; pairs: Pair[] }[] = [];
  for (const m of region.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    if (/<table\b/i.test(m[0].slice(6))) continue;
    blocks.push({ at: m.index ?? 0, pairs: tablePairs(m[0]) });
  }
  for (const m of region.matchAll(/<dl\b[\s\S]*?<\/dl>/gi)) blocks.push({ at: m.index ?? 0, pairs: dlPairs(m[0]) });
  for (const m of region.matchAll(/<(ul|ol)\b[\s\S]*?<\/\1>/gi)) blocks.push({ at: m.index ?? 0, pairs: listPairs(m[0]) });
  return blocks
    .filter((b) => b.pairs.length && !isListingCard(region, b.at, pageUrl))
    .sort((a, b) => a.at - b.at)
    .flatMap((b) => b.pairs);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function typeOf(node: Record<string, unknown>): string[] {
  return asArray(node['@type']).map((t) => String(t));
}

function jsonLdNodes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    const node = v as Record<string, unknown>;
    out.push(node);
    if (node['@graph']) walk(node['@graph'], depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim()), 0); } catch { /* a malformed block says nothing about the page */ }
  }
  return out;
}

function nameOf(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) return clean((v as Record<string, unknown>).name);
  return clean(Array.isArray(v) ? v[0] : v);
}

function toAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  return parseAmount(String(v ?? ''));
}

/** "1.234,50", "1,234.50", "34,90", "34.9" → a number; anything else null. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s ]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const decimalAt = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let normal = s;
  if (decimalAt >= 0) {
    const sep = s[decimalAt];
    const bothKinds = s.includes('.') && s.includes(',');
    const groupsOnly = !bothKinds && (s.split(sep).length > 2 || s.length - decimalAt - 1 === 3);
    normal = groupsOnly
      ? s.replace(/[.,]/g, '')
      : s.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + s.slice(decimalAt + 1);
  }
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function jsonLdProduct(html: string): { attrs: Pair[]; price: PageSpecs['price'] } {
  const attrs: Pair[] = [];
  let price: PageSpecs['price'] = null;
  const product = jsonLdNodes(html).find((n) => typeOf(n).some((t) => /^(Product|ProductGroup|IndividualProduct)$/i.test(t)));
  if (!product) return { attrs, price };
  for (const key of ['name', 'brand', 'sku', 'mpn', 'gtin13', 'model', 'material', 'color']) {
    const v = nameOf(product[key]);
    if (v) attrs.push([key, v]);
  }
  for (const p of asArray(product.additionalProperty)) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const label = clean(r.name);
    const value = [clean(r.value), clean(r.unitText)].filter(Boolean).join(' ');
    if (label && value) attrs.push([label, value]);
  }
  for (const o of asArray(product.offers)) {
    if (!o || typeof o !== 'object') continue;
    const offer = o as Record<string, unknown>;
    const spec = asArray(offer.priceSpecification)[0] as Record<string, unknown> | undefined;
    const low = toAmount(offer.lowPrice);
    const high = toAmount(offer.highPrice);
    if (offer.price == null && low !== null && high !== null && low !== high) break;
    const amount = toAmount(offer.price ?? offer.lowPrice ?? spec?.price);
    const currency = clean(offer.priceCurrency ?? spec?.priceCurrency).toUpperCase();
    if (amount !== null && currency) { price = { amount, currency }; break; }
  }
  return { attrs, price };
}

function metaPrice(html: string): PageSpecs['price'] {
  const meta = (names: string[]): string | null => {
    for (const name of names) {
      const tag = new RegExp(`<meta[^>]+(?:name|property|itemprop)\\s*=\\s*["']${name}["'][^>]*>`, 'i').exec(html)?.[0];
      const content = tag ? /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] : null;
      if (content) return clean(decodeEntities(content));
    }
    return null;
  };
  const amount = toAmount(meta(['product:price:amount', 'og:price:amount', 'price']));
  const currency = meta(['product:price:currency', 'og:price:currency', 'priceCurrency'])?.toUpperCase();
  return amount !== null && currency ? { amount, currency } : null;
}

/**
 * The first money-bearing spec value, when it states ONE firm amount ("€ 34,90", "34.90 EUR").
 * When it states a range, several amounts or an estimate the page labels as one ("€21–€36/m²",
 * "Indicative from €30"), the page has no single price: null, never the next amount on the page.
 */
function priceFromValues(attrs: Record<string, string>): PageSpecs['price'] {
  const re = /(€|\$|£|\b(?:EUR|USD|GBP)\b)\s*(\d[\d.,\s]*\d|\d)|(\d[\d.,\s]*\d|\d)\s*(€|\$|£|\b(?:EUR|USD|GBP)\b)/;
  for (const [label, value] of Object.entries(attrs)) {
    const m = re.exec(value);
    if (!m) continue;
    if ([...value.matchAll(new RegExp(re.source, 'g'))].length > 1 || DASH_RANGE.test(value)) return null;
    if (ESTIMATE.test(label) || ESTIMATE.test(value)) return null;
    const symbol = m[1] ?? m[4];
    const amount = parseAmount((m[2] ?? m[3]).trim());
    if (amount !== null) return { amount, currency: CURRENCY_SYMBOLS[symbol] ?? symbol.toUpperCase() };
  }
  return null;
}

/** JSON-LD Product facts plus the page's own spec tables / lists; null when the page states none. */
export function extractSpecs(html: string, pageUrl: string, now: Date = new Date()): PageSpecs | null {
  const ld = jsonLdProduct(html);
  const fromHtml = htmlPairs(html, pageUrl);
  const attributes: Record<string, string> = {};
  let fromLd = 0;
  let fromTables = 0;
  const add = (pairs: Pair[], counter: () => void) => {
    for (const [rawLabel, rawValue] of pairs) {
      if (Object.keys(attributes).length >= MAX_ATTRIBUTES) return;
      const label = cleanLabel(clean(rawLabel));
      const value = clean(rawValue).slice(0, MAX_VALUE_CHARS);
      if (!label || label.length > MAX_LABEL_CHARS || /^[-–—\s]*$/.test(value) || label in attributes) continue;
      attributes[label] = value;
      counter();
    }
  };
  add(ld.attrs, () => { fromLd += 1; });
  add(fromHtml, () => { fromTables += 1; });
  const price = ld.price ?? metaPrice(html) ?? priceFromValues(attributes);
  if (!fromLd && !fromTables && !price) return null;
  return {
    source: fromLd && fromTables ? 'mixed' : fromTables ? 'table' : 'jsonld',
    attributes,
    price,
    extracted_at: now.toISOString(),
  };
}
