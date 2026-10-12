/** Update article: which statements may be out of date, decided without a model. Pure (unit-tested). */

import { occurrences } from './suggestion-rules.ts';
import { pagesNamedIn } from './site-assets.ts';

const MIN_STATEMENT_CHARS = 25;

export interface LinkedPageState {
  url: string;
  title: string | null;
  content: string | null;
  live: boolean;
}

export interface OutdatedStatement {
  sentence: string;
  reasons: string[];
  pages: string[];
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export function numberValue(raw: string): number | null {
  const s = raw.replace(/[.,]+$/, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let norm: string;
  if (lastDot !== -1 && lastComma !== -1) {
    norm = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    norm = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot !== -1) {
    norm = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  } else {
    norm = s;
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const key = (n: number) => n.toFixed(2);

const PRICE_RE = /€\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:€|eur(?:o|os)?(?!\p{L})|ευρω)/giu;
const DIM_RE = /(\d+(?:[.,]\d+)?)\s?[x×X*]\s?(\d+(?:[.,]\d+)?)/g;
const MM_RE = /(\d+(?:[.,]\d+)?)\s?(?:mm|χιλ\p{L}*)(?!\p{L})/giu;
const LEAD_RE = /(\d+)(?:\s?[-–]\s?(\d+))?\s?(?:days?|weeks?|ημερ\p{L}*|μερ(?:α|ες|ων)|εβδομαδ\p{L}*|εργασιμ\p{L}*)/giu;
const IN_STOCK_RE = /(in stock|available|διαθεσιμ\p{L}*|σε αποθεμα)/u;
const OUT_OF_STOCK_RE = /(out of stock|sold out|unavailable|discontinued|εξαντλ\p{L}*|μη διαθεσιμ\p{L}*|καταργ\p{L}*)/u;

export interface FactTokens { prices: number[]; dims: string[]; sizes: number[]; leadTimes: number[]; inStock: boolean }

export function factTokens(sentence: string): FactTokens {
  const f = fold(sentence);
  const prices = [...f.matchAll(PRICE_RE)].map((m) => numberValue(m[1] ?? m[2] ?? '')).filter((n): n is number => n !== null);
  const dims = [...sentence.matchAll(DIM_RE)].map((m) => dimKey(m[1], m[2])).filter((d): d is string => !!d);
  const sizes = [...f.matchAll(MM_RE)].map((m) => numberValue(m[1])).filter((n): n is number => n !== null);
  const leadTimes = [...f.matchAll(LEAD_RE)].flatMap((m) => [m[1], m[2]]).filter(Boolean).map((n) => Number(n));
  return { prices, dims, sizes, leadTimes, inStock: IN_STOCK_RE.test(f) };
}

function dimKey(a: string, b: string): string | null {
  const x = numberValue(a);
  const y = numberValue(b);
  if (x === null || y === null) return null;
  return [x, y].sort((p, q) => p - q).map(key).join('x');
}

export function pageFigures(content: string): { numbers: Set<string>; dims: Set<string>; outOfStock: boolean } {
  const numbers = new Set<string>();
  for (const m of content.matchAll(/\d[\d.,]*/g)) {
    const n = numberValue(m[0]);
    if (n !== null) numbers.add(key(n));
  }
  const dims = new Set([...content.matchAll(DIM_RE)].map((m) => dimKey(m[1], m[2])).filter((d): d is string => !!d));
  return { numbers, dims, outOfStock: OUT_OF_STOCK_RE.test(fold(content)) };
}

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_EL = ['ιανουαρ', 'φεβρουαρ', 'μαρτ', 'απριλ', 'μαι', 'ιουν', 'ιουλ', 'αυγουστ', 'σεπτεμβρ', 'οκτωβρ', 'νοεμβρ', 'δεκεμβρ'];
const MONTH_RE = new RegExp(
  `(?<!\\p{L})(${[...MONTHS_EN, ...MONTHS_EL].join('|')})\\p{L}*,?\\s+(20\\d\\d)(?!\\d)|(?<!\\d)(20\\d\\d)-(0[1-9]|1[0-2])(?![\\d-])`,
  'gu',
);

export function monthStamps(sentence: string): number[] {
  return [...fold(sentence).matchAll(MONTH_RE)].map((m) => {
    if (m[3]) return Number(m[3]) * 12 + Number(m[4]);
    const name = m[1];
    const idx = MONTHS_EN.indexOf(name) !== -1 ? MONTHS_EN.indexOf(name) : MONTHS_EL.indexOf(name);
    return Number(m[2]) * 12 + idx + 1;
  });
}

const TIME_SENSITIVE_RE = /(?<!\p{L})(currently|nowadays|this year|latest|newest|trend\p{L}*|deadline\p{L}*|subsid\p{L}*|σημερα|φετος|πλεον|προσφατ\p{L}*|τασ(?:η|εις|εων)|προθεσμι\p{L}*|επιδοτ\p{L}*|20\d\d)(?!\p{L}|\d)/u;

export const isTimeSensitive = (sentence: string): boolean => TIME_SENSITIVE_RE.test(fold(sentence));

export function statementsOf(markdown: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    const t = line.trim();
    if (fenced || !t || /^#{1,6}\s/.test(t) || /^!\[/.test(t) || /^\|?\s*:?-{3,}/.test(t)) continue;
    const parts = t.startsWith('|') ? [t] : t.split(/(?<=[.!?;])\s+(?=[\p{Lu}[*(«"])/u);
    for (const p of parts) {
      const s = p.trim();
      if (s.length >= MIN_STATEMENT_CHARS && occurrences(markdown, s) === 1) out.push(s);
    }
  }
  return out;
}

const fmtMonth = (stamp: number) => {
  const y = Math.floor((stamp - 1) / 12);
  const m = stamp - y * 12;
  return `${y}-${String(m).padStart(2, '0')}`;
};

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** `checked` counts statements carrying anything checkable; a page with content null was never read. */
export function findOutdated(opts: {
  markdown: string;
  pages: LinkedPageState[];
  now: Date;
  /** seo_article_freshness.is_due and refresh_interval_days: the one definition of an article due for refresh. */
  refreshDue: boolean;
  intervalDays: number | null;
}): { checked: number; outdated: OutdatedStatement[] } {
  const thisMonth = opts.now.getUTCFullYear() * 12 + opts.now.getUTCMonth() + 1;
  const named = opts.pages.map((p) => ({ ...p, images: [] as { src: string }[] }));
  const figures = new Map(opts.pages.filter((p) => p.content).map((p) => [p.url, pageFigures(p.content as string)]));
  let checked = 0;
  const outdated: OutdatedStatement[] = [];

  for (const sentence of statementsOf(opts.markdown)) {
    const tokens = factTokens(sentence);
    const stamps = monthStamps(sentence);
    const timely = isTimeSensitive(sentence);
    const pages = pagesNamedIn(sentence, named);
    const hasFigures = tokens.prices.length + tokens.dims.length + tokens.sizes.length + tokens.leadTimes.length > 0;
    if (!stamps.length && !timely && !(pages.length && (hasFigures || tokens.inStock))) continue;
    checked += 1;

    const reasons: string[] = [];
    const gone = pages.filter((p) => !p.live);
    for (const p of gone) reasons.push(`the linked page ${p.url} is no longer on the site`);
    const read = pages.filter((p) => p.live && figures.has(p.url)).map((p) => figures.get(p.url)!);
    if (read.length) {
      const has = (n: number) => read.some((f) => f.numbers.has(key(n)));
      const missingPrices = tokens.prices.filter((n) => !has(n));
      const missingDims = tokens.dims.filter((d) => !read.some((f) => f.dims.has(d)));
      const missingSizes = tokens.sizes.filter((n) => !has(n));
      const missingLead = tokens.leadTimes.filter((n) => !has(n));
      if (missingPrices.length) reasons.push(`price ${missingPrices.map((n) => `€${fmtNum(n)}`).join(', ')} is not on the linked page now`);
      if (missingDims.length) reasons.push(`size ${missingDims.map((d) => d.split('x').map((v) => fmtNum(Number(v))).join('×')).join(', ')} is not on the linked page now`);
      if (missingSizes.length) reasons.push(`${missingSizes.map((n) => `${fmtNum(n)} mm`).join(', ')} is not on the linked page now`);
      if (missingLead.length) reasons.push(`lead time ${missingLead.join(', ')} is not on the linked page now`);
      if (tokens.inStock && read.every((f) => f.outOfStock)) reasons.push('says available, the linked page now says it is not');
    }
    const stale = stamps.filter((s) => s < thisMonth);
    if (stale.length) reasons.push(`dated ${fmtMonth(Math.max(...stale))}, before this month`);
    if (opts.refreshDue && timely && !stale.length) {
      reasons.push(`time-sensitive, and the article is due for refresh (every ${opts.intervalDays ?? '?'} days)`);
    }

    if (reasons.length) outdated.push({ sentence, reasons, pages: pages.map((p) => p.url) });
  }
  return { checked, outdated };
}
