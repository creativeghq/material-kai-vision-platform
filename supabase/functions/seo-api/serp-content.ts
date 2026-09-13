/**
 * Read the pages that actually rank, instead of describing them from the SERP: the sections every
 * one of them has, and the ones only one of them thought of.
 *
 * Every page is reported with its own outcome. A page we could not fetch is `failed` with the
 * reason, never a zero-word competitor quietly dragging the average down.
 */

import { scrapeMarkdown } from '../_shared/scrape-markdown.ts';
import type { RankingContent, RankingPageRead, SubtopicCoverage } from '../_shared/seo-types.ts';

const HEADING = /^\s{0,3}(#{2,4})\s+(.+?)\s*#*\s*$/gm;

/** Two headings are the same subtopic when they read the same — case, numbering and punctuation
 *  are typography, not meaning. Nothing here infers a synonym; that would be a guess counted as
 *  a fact. */
function normalise(h: string): string {
  return h
    .toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headingsOf(markdown: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(HEADING)) {
    const text = m[2].trim();
    const key = normalise(text);
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 40) break;
  }
  return out;
}

const wordsIn = (markdown: string) =>
  markdown.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * @param targets The organic results in rank order. Only the first `limit` are fetched.
 * @param deadlineMs Wall-clock budget. What it cuts short is reported as `not_attempted` with the
 *   reason — the edge runtime stops at 150s, and a partially-read set that CLAIMS to be complete
 *   would understate every competitor's coverage.
 */
export async function readRankingPages(
  targets: { url: string; position: number }[],
  opts: { limit?: number; deadlineMs?: number } = {},
): Promise<RankingContent> {
  const limit = Math.min(opts.limit ?? 5, 10);
  const deadline = Date.now() + (opts.deadlineMs ?? 45_000);
  const queue = targets.filter((t) => !!t.url).slice(0, limit);

  const pages: RankingPageRead[] = [];
  // Serial on purpose: Firecrawl rate-limits per account and a 429 costs the whole set, not one
  // page. Five pages at ~3s each fits the budget with room to spare.
  for (const t of queue) {
    if (Date.now() > deadline) {
      pages.push({ url: t.url, position: t.position, status: 'not_attempted', wordCount: null, headings: [], reason: 'time budget reached' });
      continue;
    }
    const page = await scrapeMarkdown(t.url);
    if (!page.markdown) {
      pages.push({
        url: t.url, position: t.position, status: 'failed', wordCount: null, headings: [],
        reason: page.error ?? (page.http_status ? `page returned ${page.http_status}` : 'no content returned'),
      });
      continue;
    }
    pages.push({ url: t.url, position: t.position, status: 'read', wordCount: wordsIn(page.markdown), headings: headingsOf(page.markdown) });
  }

  for (const t of targets.slice(limit)) {
    pages.push({ url: t.url, position: t.position, status: 'not_attempted', wordCount: null, headings: [], reason: `outside the top ${limit} read` });
  }

  const readPages = pages.filter((p) => p.status === 'read');
  const buckets = new Map<string, { label: string; urls: Set<string>; examples: string[] }>();
  for (const p of readPages) {
    for (const h of p.headings) {
      const key = normalise(h);
      const b = buckets.get(key) ?? { label: h, urls: new Set<string>(), examples: [] };
      b.urls.add(p.url);
      if (b.examples.length < 3 && !b.examples.includes(h)) b.examples.push(h);
      buckets.set(key, b);
    }
  }

  const ranked: SubtopicCoverage[] = [...buckets.values()]
    .map((b) => ({ label: b.label, pages: b.urls.size, examples: b.examples }))
    .sort((a, b) => b.pages - a.pages || a.label.localeCompare(b.label));

  const failed = pages.filter((p) => p.status === 'failed').length;
  const notAttempted = pages.filter((p) => p.status === 'not_attempted').length;

  return {
    pages,
    read: readPages.length,
    failed,
    not_attempted: notAttempted,
    medianWordCount: median(readPages.map((p) => p.wordCount ?? 0).filter((n) => n > 0)),
    common: ranked.filter((r) => r.pages >= 2).slice(0, 25),
    distinctive: ranked.filter((r) => r.pages === 1).slice(0, 25),
    note: readPages.length === 0
      ? `None of the ${pages.length} ranking pages could be read (${failed} failed, ${notAttempted} not attempted), so nothing here describes what the competition covers.`
      : `Derived from ${readPages.length} ranking page(s) actually read${failed ? `, ${failed} could not be fetched` : ''}. Counts are out of the pages READ, never out of the SERP.`,
  };
}
