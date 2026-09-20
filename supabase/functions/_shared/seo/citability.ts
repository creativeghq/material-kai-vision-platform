/** Scores a page against the mirrored dimension catalogue. No DB, no network. */

import {
  CITABILITY_DIMENSIONS,
  type CitabilityStatus,
} from './citabilityDimensions.generated.ts';

export { CITABILITY_DIMENSIONS };
export type { CitabilityStatus };

export interface DimensionResult {
  key: string;
  /** 0–100 for this dimension. Null when it could not be judged. */
  score: number | null;
  status: CitabilityStatus;
  /** What was actually found, stated so the reader can disagree with it. */
  evidence: string;
}

export interface CitabilityReport {
  status: CitabilityStatus;
  /** 0–100, weighted. Null when the page has not been read. */
  score: number | null;
  note: string | null;
  dimensions: DimensionResult[];
  /** The lowest-scoring dimensions, worst first — what to fix. */
  gaps: string[];
  words: number;
}

/** Enough text to judge. Below this the page is a stub and every signal is noise. */
const MIN_WORDS = 60;

const RE = {
  heading: /<h([1-6])[^>]*>([\s\S]{0,300}?)<\/h\1>/gi,
  table: /<table[\b>]/i,
  faqSchema: /"@type"\s*:\s*"FAQPage"/i,
  qaPair: /<(h[2-4])[^>]*>[^<]{0,200}\?\s*<\/\1>/i,
  anchor: /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi,
  time: /<time\b|datetime=|"datePublished"|"dateModified"/i,
  dateText: /\b(20[12]\d)\b/,
  // \p{Lu} with /u rather than [A-Z]: Greek bylines are the common case here, and the
  // lower-case `by` alternative missed "By Maria" — a sentence-initial byline, i.e. most.
  author: /"@type"\s*:\s*"Person"|rel=["']author["']|\b[Bb]y\s+\p{Lu}\p{L}+\s+\p{Lu}/u,
  number: /\b\d+([.,]\d+)?\s?(mm|cm|m|m2|m²|kg|g|%|€|\$|years?|mm²|W|V|A|°C|χλστ|εκ|ετών)\b/gi,
};

const stripTags = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Words shared between the question and a piece of text, ignoring short words. */
function overlap(question: string, text: string): number {
  const terms = question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  if (terms.length === 0) return 0;
  const hay = text.toLowerCase();
  const hit = terms.filter((t) => hay.includes(t)).length;
  return hit / terms.length;
}

/**
 * Score one page against one buyer question.
 *
 * `html` may be absent — the demand-driven crawl only fetches a page when something
 * asks for it. That is `not_collected`, and it must never score 0: a page nobody has
 * read is not a page that failed.
 */
export function scoreCitability(
  input: { html?: string | null; text?: string | null; question?: string | null; fetchedAt?: string | null },
): CitabilityReport {
  const html = input.html ?? '';
  const plain = (input.text ?? (html ? stripTags(html) : '')).trim();
  const words = plain ? plain.split(/\s+/).length : 0;

  if (!plain) {
    return {
      status: 'not_collected',
      score: null,
      note: 'This page has not been read yet, so nothing about it has been judged. Analyse it to fill this in.',
      dimensions: CITABILITY_DIMENSIONS.map((d) => ({ key: d.key, score: null, status: 'not_collected' as const, evidence: 'Page not read' })),
      gaps: [],
      words: 0,
    };
  }
  if (words < MIN_WORDS) {
    return {
      status: 'no_data',
      score: 0,
      note: `Only ${words} words of body text. There is nothing here for an engine to quote — this is a stub, not a weak page.`,
      dimensions: CITABILITY_DIMENSIONS.map((d) => ({ key: d.key, score: 0, status: 'no_data' as const, evidence: 'Page is a stub' })),
      gaps: CITABILITY_DIMENSIONS.map((d) => d.key),
      words,
    };
  }

  const question = input.question ?? '';
  const headings: string[] = [];
  for (const m of html.matchAll(RE.heading)) headings.push(stripTags(m[2]));
  const opening = plain.slice(0, 600);
  const results: DimensionResult[] = [];

  // Answer-first: does the opening actually address the question, and is it short enough to lift?
  {
    const ov = question ? overlap(question, opening) : (opening.length > 120 ? 0.5 : 0.2);
    const firstPara = plain.split(/(?<=[.!?;·])\s+/).slice(0, 3).join(' ');
    const tight = firstPara.length >= 80 && firstPara.length <= 600;
    const score = clamp(ov * 70 + (tight ? 30 : 0));
    results.push({
      key: 'answer_first', score, status: 'ok',
      evidence: question
        ? `${Math.round(ov * 100)}% of the question’s terms appear in the first 600 characters${tight ? ', and the opening is a liftable length' : ''}`
        : 'No question supplied, so only the shape of the opening was judged',
    });
  }

  // A heading that asks the question.
  {
    const best = headings.reduce((acc, h) => Math.max(acc, question ? overlap(question, h) : 0), 0);
    const anyQuestion = headings.some((h) => h.trim().endsWith('?'));
    const score = clamp(best * 80 + (anyQuestion ? 20 : 0));
    results.push({
      key: 'question_heading', score, status: 'ok',
      evidence: headings.length === 0
        ? 'No headings found on the page'
        : `${headings.length} headings; best match to the question ${Math.round(best * 100)}%${anyQuestion ? ', at least one is phrased as a question' : ', none phrased as a question'}`,
    });
  }

  {
    const schema = RE.faqSchema.test(html);
    const pair = RE.qaPair.test(html);
    const score = schema ? 100 : pair ? 55 : 0;
    results.push({
      key: 'faq_block', score, status: 'ok',
      evidence: schema ? 'FAQPage JSON-LD present' : pair ? 'Question-shaped headings, but no FAQPage markup' : 'No FAQ block and no FAQPage markup',
    });
  }

  {
    const hits = (plain.match(RE.number) ?? []).length;
    const per1k = (hits / Math.max(words, 1)) * 1000;
    const score = clamp(Math.min(per1k / 8, 1) * 100);
    results.push({
      key: 'entity_facts', score, status: 'ok',
      evidence: `${hits} measured facts (${per1k.toFixed(1)} per 1,000 words)`,
    });
  }

  {
    const has = RE.table.test(html);
    results.push({
      key: 'comparison', score: has ? 100 : 0, status: 'ok',
      evidence: has ? 'Page contains a table' : 'No table on the page',
    });
  }

  // Outbound links to somewhere else — the citation an engine can verify.
  {
    let external = 0; let internal = 0;
    for (const m of html.matchAll(RE.anchor)) {
      const href = m[1];
      if (/^https?:\/\//i.test(href)) external += 1;
      else if (href.startsWith('/')) internal += 1;
    }
    const score = clamp(Math.min(external / 4, 1) * 100);
    results.push({
      key: 'sources_cited', score, status: 'ok',
      evidence: `${external} outbound links, ${internal} internal`,
    });
  }

  {
    const has = RE.author.test(html);
    results.push({
      key: 'author_trust', score: has ? 100 : 0, status: 'ok',
      evidence: has ? 'An author or Person markup is present' : 'No byline, author markup or credentials found',
    });
  }

  {
    const marked = RE.time.test(html);
    const year = plain.match(RE.dateText)?.[1];
    const thisYear = new Date().getUTCFullYear();
    const recent = year ? thisYear - Number(year) <= 1 : false;
    const score = clamp((marked ? 60 : 0) + (recent ? 40 : year ? 10 : 0));
    results.push({
      key: 'freshness', score, status: 'ok',
      evidence: marked
        ? `A machine-readable date is present${year ? `, newest year mentioned ${year}` : ''}`
        : year ? `No date markup; the newest year in the text is ${year}` : 'No date anywhere on the page',
    });
  }

  const byKey = new Map(results.map((r) => [r.key, r]));
  const totalWeight = CITABILITY_DIMENSIONS.reduce((s, d) => s + d.weight, 0);
  const weighted = CITABILITY_DIMENSIONS.reduce(
    (s, d) => s + ((byKey.get(d.key)?.score ?? 0) * d.weight), 0) / totalWeight;

  const gaps = [...CITABILITY_DIMENSIONS]
    .filter((d) => (byKey.get(d.key)?.score ?? 0) < 50)
    .sort((a, b) => ((byKey.get(a.key)?.score ?? 0) * a.weight) - ((byKey.get(b.key)?.score ?? 0) * b.weight))
    .map((d) => d.key);

  return {
    status: 'ok',
    score: clamp(weighted),
    note: null,
    dimensions: CITABILITY_DIMENSIONS.map((d) => byKey.get(d.key)!),
    gaps,
    words,
  };
}

/** The ordered fixes for a report — what the operator should actually do. */
export function citabilityFixes(report: CitabilityReport): { key: string; label: string; fix: string }[] {
  const byKey = new Map(CITABILITY_DIMENSIONS.map((d) => [d.key, d]));
  return report.gaps.map((k) => {
    const d = byKey.get(k)!;
    return { key: k, label: d.label, fix: d.fix };
  });
}
