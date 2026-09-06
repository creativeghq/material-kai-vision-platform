/**
 * What the article does NOT say that it should — and what it already says that competitors do.
 *
 * The previous derivation was this, in full:
 *
 *     for (const comp of competitors) if (comp.title) gaps.push(comp.title);
 *     ...
 *     { topic, competitorCount: 3, relevanceScore: 0.6 }   // "Approximate"
 *
 * So a "gap" was a COMPETITOR'S PAGE TITLE that did not appear verbatim in the body — meaning
 * `Gap: ΨΑΡΑΔΕΛΛΗΣ | ΠΛΑΚΑΚΙΑ` said "you have not printed a rival's brand name", and closing it
 * would have been actively bad advice. The two numbers beside every row were constants: 3 and
 * 0.6 for every gap, 0 and 0.7 for every gain, on every article ever produced. Nothing could see
 * it — a hardcoded number is a valid number, and the panel rendered them faithfully.
 *
 * A gap is now a TOPIC someone searches for, from the research that has already been paid for:
 *
 *   • `keyword`            — a researched secondary keyword, carrying its real search volume.
 *   • `question`           — a People Also Ask question the body does not answer.
 *   • `competitor_heading` — a section heading shared by the ranked pages.
 *
 * and every number beside it is measured: the volume is DataForSEO's, and `competitorCount` is a
 * count of the competitors that actually mention the term.
 *
 * It reads `research_tab_data`, which is STORED on the article, rather than the full research
 * result, which is not. That is deliberate: it means `reanalyze` can rebuild this for an article
 * written months ago, instead of the fix reaching only articles generated after today.
 */

import type { MissingTopic } from '../../_shared/seo-types.ts';

/** One ranked page. */
export interface GapCompetitor { title?: string; headings?: string[]; domain?: string }

/**
 * The stored research this derivation needs. Every field optional — old rows are missing some.
 *
 * `competition` and `competitors` are BOTH accepted because the same list is called two different
 * things: `research_tab_data.competition` on the article row, `research.serpInsights` in the
 * pipeline. Reading only one of them is not a type error and not a crash — it silently produces a
 * competitor count of 0 on every row and switches brand detection off, which is what the first
 * live run of this did.
 */
export interface GapSources {
  keyTerms?: { term?: string; searchVolume?: number; opportunityScore?: number }[];
  competitors?: GapCompetitor[];
  /** What `research_tab_data` calls the same list. */
  competition?: GapCompetitor[];
  questions?: { question?: string; answered?: boolean }[];
}

const competitorsOf = (s: GapSources): GapCompetitor[] => s.competitors ?? s.competition ?? [];

/**
 * Lowercase, strip Greek/Latin diacritics, collapse whitespace.
 *
 * The old coverage test was `body.includes(topic.toLowerCase().slice(0, 20))` — a raw 20-character
 * prefix. On Greek that fails on the first inflection AND on the first accent: `πλακάκια` in the
 * body never matches `πλακακια` from the keyword tool, which returns unaccented terms. Every
 * keyword would have read as missing.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/**
 * Does the body cover this term?
 *
 * Every significant token has to appear, stem-matched. Greek inflects the ending of almost every
 * word (πλακάκια / πλακακιών / πλακάκι), so an exact phrase test under-reports badly.
 *
 * The stem is 80% of the token, not "the token minus two characters". Minus-two was the first
 * version and it reported this article as covering "πρακτικερ πλακακια μπανιου" — Praktiker's
 * brand — because the body contains the ordinary Greek adverb «πρακτική»: both reduce to
 * `πρακτικ` at seven characters. 80% keeps `πρακτικε` distinct from `πρακτικη` while still
 * catching the declensions it exists for, which for a nine-letter word is the difference between
 * a measurement and a coincidence.
 *
 * Tokens shorter than four characters are skipped — they are articles and prepositions, and
 * requiring them would fail on word order rather than on meaning.
 */
export function stemOf(token: string): string {
  return token.slice(0, Math.max(4, Math.ceil(token.length * 0.8)));
}

export function coversTerm(normalizedBody: string, term: string): boolean {
  const tokens = normalizeText(term).split(' ').filter((t) => t.length >= 4);
  if (tokens.length === 0) return normalizedBody.includes(normalizeText(term));
  return tokens.every((t) => normalizedBody.includes(stemOf(t)));
}

/**
 * Is this query one of the competitors' brand names?
 *
 * "πρακτικερ πλακακια μπανιου" has 720 searches a month and is the highest-volume term the
 * research found — and it is Praktiker's brand. Offering it as a gap to fill is telling the
 * customer to write about a competitor. It is still worth SEEING (it says who owns the demand),
 * so it is labelled rather than dropped.
 */
function brandTokens(competitors: GapCompetitor[]): string[] {
  const tokens = new Set<string>();
  for (const c of competitors) {
    const host = (c.domain ?? '').replace(/^www\./, '').split('.')[0];
    if (host.length >= 5) tokens.add(normalizeText(host));
  }
  return [...tokens];
}

/**
 * Greek transliteration is not a solved problem and this does not try to solve it: it folds the
 * handful of Greek letters that map to a single Latin letter, which is enough to match a brand
 * token against a domain (πρακτικερ → praktiker, ραβεννα → ravenna).
 */
const GREEK_TO_LATIN: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l',
  μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f',
  χ: 'ch', ψ: 'ps', ω: 'o',
};

function latinize(s: string): string {
  return normalizeText(s).split('').map((ch) => GREEK_TO_LATIN[ch] ?? ch).join('');
}

function namesACompetitor(term: string, brands: string[]): boolean {
  const latin = latinize(term);
  return brands.some((b) => {
    const stem = b.slice(0, Math.max(5, b.length - 2));
    return latin.includes(stem);
  });
}

/** How many of the ranked pages mention this term, in their title or their headings. Measured. */
function competitorsMentioning(term: string, competitors: GapCompetitor[]): number {
  let n = 0;
  for (const c of competitors) {
    const haystack = normalizeText([c.title ?? '', ...(c.headings ?? [])].join(' '));
    if (haystack && coversTerm(haystack, term)) n += 1;
  }
  return n;
}

export interface GapsGainsResult {
  all: MissingTopic[];
  gaps: MissingTopic[];
  gains: MissingTopic[];
  gapCount: number;
  gainCount: number;
}

export function buildGapsGains(markdown: string, sources: GapSources): GapsGainsResult {
  const body = normalizeText(markdown);
  const competitors = competitorsOf(sources);
  const brands = brandTokens(competitors);
  const seen = new Set<string>();
  const all: MissingTopic[] = [];

  const push = (
    topic: string,
    source: MissingTopic['source'],
    searchVolume: number | null,
    relevance: number,
  ) => {
    const key = normalizeText(topic);
    if (!key || seen.has(key)) return;
    seen.add(key);
    all.push({
      topic: topic.trim(),
      type: coversTerm(body, topic) ? 'gain' : 'gap',
      source,
      // Upstream coerces a missing volume to 0 (`item.search_volume || … || 0`), so 0 and
      // "DataForSEO said nothing" are the same value by the time it reaches here. Either way it
      // is not a number to rank decisions by, so it travels as null and the UI says so.
      searchVolume: searchVolume && searchVolume > 0 ? searchVolume : null,
      competitorCount: competitorsMentioning(topic, competitors),
      relevanceScore: Math.max(0, Math.min(1, relevance)),
      competitorBrand: namesACompetitor(topic, brands) || undefined,
    });
  };

  for (const k of sources.keyTerms ?? []) {
    if (!k?.term) continue;
    // opportunityScore is 0-100 where the research computes one; fall back to a neutral 0.5
    // rather than inventing a confident number.
    push(k.term, 'keyword', k.searchVolume ?? null, k.opportunityScore != null ? k.opportunityScore / 100 : 0.5);
  }

  for (const q of sources.questions ?? []) {
    if (!q?.question) continue;
    push(q.question, 'question', null, 0.6);
  }

  // Headings shared by the ranked pages. `CompetitorData.headings` is declared and, as of today,
  // never populated by the SERP client — so this contributes nothing yet and will start working
  // the moment it does, rather than needing to be remembered.
  const headingCounts = new Map<string, { text: string; n: number }>();
  for (const c of competitors) {
    for (const h of new Set((c.headings ?? []).map((x) => x.trim()).filter(Boolean))) {
      const key = normalizeText(h);
      const entry = headingCounts.get(key) ?? { text: h, n: 0 };
      entry.n += 1;
      headingCounts.set(key, entry);
    }
  }
  for (const { text, n } of headingCounts.values()) {
    // One competitor using a heading is that competitor's editorial choice; two or more is a
    // convention of the SERP, which is the only version worth reporting as a gap.
    if (n >= 2) push(text, 'competitor_heading', null, Math.min(1, n / 5));
  }

  // Highest demand first, unknown volume last — a gap you cannot size is not a gap you should
  // act on before one you can.
  const byValue = (a: MissingTopic, b: MissingTopic) =>
    (b.searchVolume ?? -1) - (a.searchVolume ?? -1) || b.relevanceScore - a.relevanceScore;

  const gaps = all.filter((t) => t.type === 'gap').sort(byValue);
  const gains = all.filter((t) => t.type === 'gain').sort(byValue);
  return { all: [...gaps, ...gains], gaps, gains, gapCount: gaps.length, gainCount: gains.length };
}
