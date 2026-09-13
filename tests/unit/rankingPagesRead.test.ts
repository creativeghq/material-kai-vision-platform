/**
 * Research reads the pages that actually rank — and says which ones it could not read.
 *
 * The failure mode this guards is the silent-zero shape: three pages read out of ten, presented
 * as a survey of ten. Every count is out of the pages READ, and a page that could not be fetched
 * keeps its place in the list with its reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const scrapeMarkdown = vi.hoisted(() => vi.fn());
vi.mock('../../supabase/functions/_shared/scrape-markdown.ts', () => ({ scrapeMarkdown }));

const { readRankingPages } = await import('../../supabase/functions/seo-api/serp-content.ts');

const page = (markdown: string) => ({ url: '', title: null, description: null, markdown, http_status: 200, error: null });

beforeEach(() => scrapeMarkdown.mockReset());

describe('what the ranking pages cover', () => {
  it('counts a shared subtopic out of the pages READ, not out of the SERP', async () => {
    scrapeMarkdown
      .mockResolvedValueOnce(page('# T\n## Installation cost\ntext here\n## Warranty\nmore'))
      .mockResolvedValueOnce(page('# T\n## Installation Cost\nwords\n## Lifespan\nwords'))
      .mockResolvedValueOnce({ ...page(''), markdown: null, error: 'timed out' });

    const r = await readRankingPages(
      [{ url: 'https://a.test/1', position: 1 }, { url: 'https://b.test/2', position: 2 }, { url: 'https://c.test/3', position: 3 }],
      { limit: 5 },
    );

    expect(r.read).toBe(2);
    expect(r.failed).toBe(1);
    const installation = r.common.find((c) => /installation/i.test(c.label));
    expect(installation, 'the subtopic both readable pages share was not found').toBeTruthy();
    // Two of the two READ, never 2 of 3.
    expect(installation!.pages).toBe(2);
    expect(r.distinctive.map((d) => d.label).sort()).toEqual(['Lifespan', 'Warranty']);
  });

  it('names the page it could not read, with the reason', async () => {
    scrapeMarkdown.mockResolvedValueOnce({ ...page(''), markdown: null, error: 'Firecrawl 402: out of credit' });
    const r = await readRankingPages([{ url: 'https://a.test/1', position: 1 }]);
    expect(r.pages[0].status).toBe('failed');
    expect(r.pages[0].reason).toContain('out of credit');
    expect(r.pages[0].wordCount, 'a page we could not read is unknown, never zero words').toBeNull();
  });

  it('reads nothing as nothing, in words, rather than as an empty competitor set', async () => {
    scrapeMarkdown.mockResolvedValue({ ...page(''), markdown: null, error: 'blocked' });
    const r = await readRankingPages([{ url: 'https://a.test/1', position: 1 }, { url: 'https://b.test/2', position: 2 }]);
    expect(r.read).toBe(0);
    expect(r.common).toEqual([]);
    expect(r.medianWordCount).toBeNull();
    expect(r.note).toMatch(/None of the .* could be read/);
  });

  it('keeps the results it did not attempt, so the list is never silently short', async () => {
    scrapeMarkdown.mockResolvedValue(page('# T\n## One\nbody'));
    const r = await readRankingPages(
      [1, 2, 3, 4].map((n) => ({ url: `https://x.test/${n}`, position: n })),
      { limit: 2 },
    );
    expect(r.pages).toHaveLength(4);
    expect(r.not_attempted).toBe(2);
    expect(r.pages.filter((p) => p.status === 'not_attempted').every((p) => !!p.reason)).toBe(true);
  });

  it('takes the median length, not the mean', async () => {
    const words = (n: number) => `# T\n## S\n${'word '.repeat(n)}`;
    scrapeMarkdown
      .mockResolvedValueOnce(page(words(100)))
      .mockResolvedValueOnce(page(words(200)))
      .mockResolvedValueOnce(page(words(9000)));
    const r = await readRankingPages([1, 2, 3].map((n) => ({ url: `https://x.test/${n}`, position: n })));
    // One 9,000-word pillar in a set of three makes a mean nobody should target.
    expect(r.medianWordCount).toBeGreaterThan(150);
    expect(r.medianWordCount).toBeLessThan(300);
  });
});

describe('the reader is actually wired in', () => {
  const ROOT = join(__dirname, '..', '..');
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

  it('research fills the competitor headings that were hardcoded empty', () => {
    const src = read('supabase/functions/seo-api/handlers/research.ts');
    expect(src).toMatch(/readRankingPages\(/);
    expect(src).toMatch(/c\.headings = r\.headings;/);
  });

  it('the extra Firecrawl spend is in the SAME debit, and the refund can see it', () => {
    const src = read('supabase/functions/seo-api/handlers/research.ts');
    // A handler with two debits needs two refunds, and the refund path is the one nobody
    // exercises until it is wrong.
    expect(src.match(/rpc\(\s*\n?\s*'debit_credits'/g) ?? []).toHaveLength(1);
    // Declared outside the try, because the refund lives in the catch.
    const declare = src.indexOf('let creditCost = CREDIT_COST;');
    const tryAt = src.indexOf('\n  try {');
    expect(declare).toBeGreaterThan(-1);
    expect(declare, 'creditCost is out of scope in the refund').toBeLessThan(tryAt);
  });

  it('the planner is given what was read, not the page titles', () => {
    const src = read('supabase/functions/seo-api/handlers/plan.ts');
    expect(src).toMatch(/WHAT THE RANKING PAGES ACTUALLY COVER/);
    expect(src, 'the old title list must not still be labelled as content gaps')
      .not.toMatch(/=== CONTENT GAPS \(topics competitors cover\) ===/);
    // Scraped competitor headings are untrusted ingested content (invariant 9): the whole SERP
    // block is delimited, and the new section has to sit INSIDE it.
    const block = /serpBlock\(`([\s\S]*?)`\)\}/.exec(src);
    expect(block, 'the SERP block wrapper is gone').toBeTruthy();
    expect(block![1]).toContain('${rankingSection}');
  });
});
