/** Mechanical check that a model-supplied evidence quote is on the cited page. The page text is compared, never obeyed. */

// deno-lint-ignore-file no-explicit-any

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', shy: '',
  eacute: 'é', egrave: 'è', agrave: 'à', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', ccedil: 'ç',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ' ';
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  const noCode = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  return decodeEntities(noCode.replace(/<[^>]*>/g, ' '));
}

/** Case, accents, punctuation and whitespace folded away; letters and digits of every script survive. */
export function normaliseForMatch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/gu;
const WORD_WINDOW = 6;
const CHAR_WINDOW = 8;
const THRESHOLD = 0.6;

function windowShare(units: string[], size: number, hay: string, join: string): number {
  if (units.length < size) return 0;
  let hit = 0;
  const total = units.length - size + 1;
  for (let i = 0; i < total; i++) {
    const w = units.slice(i, i + size).join(join);
    if (hay.includes(join ? ` ${w} ` : w)) hit++;
  }
  return hit / total;
}

export interface NormalisedPage {
  spaced: string;
  compact: string;
}

const MAX_HTML_CHARS = 1_000_000;
const MAX_TEXT_CHARS = 400_000;

/** Page text normalised once; capped so eight pages in parallel cannot hold the event loop. */
export function normalisePage(pageText: string): NormalisedPage {
  const spaced = normaliseForMatch(pageText.slice(0, MAX_TEXT_CHARS));
  return { spaced, compact: spaced.replace(/ /g, '') };
}

export function quoteWordCount(quote: string): number {
  const q = normaliseForMatch(quote);
  return q ? q.split(' ').length : 0;
}

/** True when the quote is on the page: exact after normalising, or at least 60% of its six-word windows (eight-character windows for unspaced scripts). */
export function quoteInPage(quote: string, page: NormalisedPage): boolean {
  const q = normaliseForMatch(quote);
  if (!q || !page.spaced) return false;
  if ((` ${page.spaced} `).includes(` ${q} `)) return true;
  const qCompact = q.replace(/ /g, '');
  const unspaced = (qCompact.match(UNSPACED)?.length ?? 0) > qCompact.length / 2;
  if (unspaced) {
    return page.compact.includes(qCompact) || windowShare([...qCompact], CHAR_WINDOW, page.compact, '') >= THRESHOLD;
  }
  return windowShare(q.split(' '), WORD_WINDOW, ` ${page.spaced} `, ' ') >= THRESHOLD;
}

export function quoteIsOnPage(quote: string, pageText: string): boolean {
  return quoteInPage(quote, normalisePage(pageText));
}

export interface FetchedPage {
  text: string;
  contentType: string | null;
  /** The body hit the byte cap, so absence from it proves nothing. */
  truncated: boolean;
}

export type PageFetcher = (url: string, timeoutMs: number) => Promise<FetchedPage>;

export interface QuoteCheckOptions {
  fetchPage: PageFetcher;
  maxRows?: number;
  timeoutMs?: number;
}

export const QUOTE_NOT_FOUND = 'quote not found on the cited page';
export const NOT_OWN_SITE = "evidence page is not on the company's own site";
const MIN_READABLE_CHARS = 400;

const hostOf = (u: unknown): string | null => {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    return new URL(/^[a-z]+:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

/** True when `evidenceUrl` is the company's own host or one of its subdomains (www ignored). */
export function isOwnSite(evidenceUrl: unknown, row: Record<string, any>): boolean {
  const ev = hostOf(evidenceUrl);
  const own = hostOf(row.domain) ?? hostOf(row.website);
  return !!ev && !!own && (ev === own || ev.endsWith(`.${own}`));
}

type Verdict = { verified: boolean | null; note?: string };

/** Matches whose quote is absent from a readable page on the company's own site move to `unverified`; anything inconclusive keeps the match with `evidence_verified: null`. */
export async function verifyEvidenceQuotes<R extends Record<string, any>>(
  matches: R[],
  unverified: R[],
  opts: QuoteCheckOptions,
): Promise<{ matches: R[]; unverified: R[] }> {
  const max = opts.maxRows ?? 8;
  const timeout = opts.timeoutMs ?? 6000;
  const pages = new Map<string, Promise<{ page: NormalisedPage; readable: boolean; fetched: FetchedPage }>>();
  const load = (url: string) => {
    let p = pages.get(url);
    if (!p) {
      p = opts.fetchPage(url, timeout).then((fetched) => {
        const text = htmlToText(fetched.text.slice(0, MAX_HTML_CHARS));
        const html = /html|xml/i.test(fetched.contentType ?? '');
        return { page: normalisePage(text), readable: html && text.trim().length >= MIN_READABLE_CHARS && !fetched.truncated, fetched };
      });
      pages.set(url, p);
    }
    return p;
  };
  const verdicts = await Promise.all(matches.map(async (row, i): Promise<Verdict> => {
    const url = typeof row.type_evidence_url === 'string' ? row.type_evidence_url.trim() : '';
    if (i >= max || !url || typeof row.type_evidence !== 'string') return { verified: null };
    if (!isOwnSite(url, row)) return { verified: null, note: NOT_OWN_SITE };
    try {
      const { page, readable } = await load(url);
      if (quoteInPage(row.type_evidence, page)) return { verified: true };
      if (!readable || quoteWordCount(row.type_evidence) < WORD_WINDOW) return { verified: null };
      return { verified: false };
    } catch {
      return { verified: null };
    }
  }));
  const kept: R[] = [];
  const moved: R[] = [];
  matches.forEach((row, i) => {
    const v = verdicts[i];
    if (v.verified === false) moved.push({ ...row, evidence_verified: false, unverified_reason: QUOTE_NOT_FOUND });
    else kept.push({ ...row, evidence_verified: v.verified, ...(v.note ? { evidence_note: v.note } : {}) });
  });
  return { matches: kept, unverified: [...unverified, ...moved] };
}
