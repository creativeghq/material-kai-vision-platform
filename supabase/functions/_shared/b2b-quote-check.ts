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

/** True when the quote is on the page: exact after normalising, or at least 60% of its six-word windows (eight-character windows for unspaced scripts). */
export function quoteIsOnPage(quote: string, pageText: string): boolean {
  const q = normaliseForMatch(quote);
  const page = normaliseForMatch(pageText);
  if (!q || !page) return false;
  if ((` ${page} `).includes(` ${q} `)) return true;
  const qCompact = q.replace(/ /g, '');
  const pageCompact = page.replace(/ /g, '');
  const unspaced = (qCompact.match(UNSPACED)?.length ?? 0) > qCompact.length / 2;
  if (unspaced) {
    return pageCompact.includes(qCompact) || windowShare([...qCompact], CHAR_WINDOW, pageCompact, '') >= THRESHOLD;
  }
  return windowShare(q.split(' '), WORD_WINDOW, ` ${page} `, ' ') >= THRESHOLD;
}

export type PageFetcher = (url: string, timeoutMs: number) => Promise<string>;

export interface QuoteCheckOptions {
  fetchPage: PageFetcher;
  maxRows?: number;
  timeoutMs?: number;
}

export const QUOTE_NOT_FOUND = 'quote not found on the cited page';

/** Matches whose quote is absent from the cited page move to `unverified`; a fetch failure keeps the match with `evidence_verified: null`. */
export async function verifyEvidenceQuotes<R extends Record<string, any>>(
  matches: R[],
  unverified: R[],
  opts: QuoteCheckOptions,
): Promise<{ matches: R[]; unverified: R[] }> {
  const max = opts.maxRows ?? 8;
  const timeout = opts.timeoutMs ?? 6000;
  const verdicts = await Promise.all(matches.map(async (row, i): Promise<boolean | null> => {
    const url = typeof row.type_evidence_url === 'string' ? row.type_evidence_url.trim() : '';
    if (i >= max || !url || typeof row.type_evidence !== 'string') return null;
    try {
      return quoteIsOnPage(row.type_evidence, htmlToText(await opts.fetchPage(url, timeout)));
    } catch {
      return null;
    }
  }));
  const kept: R[] = [];
  const moved: R[] = [];
  matches.forEach((row, i) => {
    if (verdicts[i] === false) moved.push({ ...row, evidence_verified: false, unverified_reason: QUOTE_NOT_FOUND });
    else kept.push({ ...row, evidence_verified: verdicts[i] });
  });
  return { matches: kept, unverified: [...unverified, ...moved] };
}
