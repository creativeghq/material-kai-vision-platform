/**
 * Scoring a live URL spends money and produces a number. Both halves have a way to go wrong
 * quietly: bill for work that never happened, or report a confident score about a page we never
 * read. #401 G4.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const SRC = read('supabase/functions/seo-api/handlers/score-url.ts');
const ROUTER = read('supabase/functions/seo-api/index.ts');
const SHARED = read('supabase/functions/_shared/scrape-markdown.ts');
const CRAWLER = read('supabase/functions/crawl-user-website/index.ts');

describe('the debit happens before the upstream call', () => {
  it('charges, then scrapes — in that order', () => {
    // Invariant 10. A check after the side effect is not a check: the Firecrawl scrape is money
    // whether or not the page turns out to be scoreable.
    const charge = SRC.search(/chargeCron(Workspace|User)\(/);
    const scrape = SRC.search(/await scrapeMarkdown\(/);
    expect(charge, 'no credit gate found').toBeGreaterThan(-1);
    expect(scrape, 'no scrape found').toBeGreaterThan(-1);
    expect(charge, 'the scrape is paid for before it runs').toBeLessThan(scrape);
  });

  it('refuses on an empty wallet instead of scoring for free', () => {
    expect(SRC).toMatch(/if\s*\(!gate\.allowed\)/);
    expect(SRC).toMatch(/insufficient_credits/);
  });

  it('refunds every path that produces no score', () => {
    // Three: unfetchable page, no keyword, unexpected throw. A charge kept for work that
    // produced nothing is a standing fee for an outage.
    const refunds = SRC.match(/await refund\(/g) || [];
    expect(refunds.length, 'every no-verdict exit must refund').toBeGreaterThanOrEqual(3);
  });
});

describe('a page we could not read has no score', () => {
  it('returns a stated status rather than a number', () => {
    // The silent-zero shape: a score of 0 reads as "this page is terrible" instead of
    // "we never saw it".
    expect(SRC).toMatch(/collector_failed|fetch_failed/);
    expect(SRC).toMatch(/page\.error\s*\|\|\s*!page\.markdown/);
  });

  it('refuses to score against an empty keyword', () => {
    // Every keyword-dependent check would compare against '' and emit a confident number
    // about nothing. GSC withholding a query is not evidence the page has no traffic.
    expect(SRC).toMatch(/status:\s*'no_keyword'/);
    expect(SRC).toMatch(/keyword_source/);
  });

  it('names the checks it did not run', () => {
    // A live page has no ArticlePlan, so plan-dependent checks are SKIPPED, never scored as
    // failures — otherwise the score punishes a page for not having been planned by us.
    expect(SRC).toMatch(/PLAN_DEPENDENT_CHECKS/);
    expect(SRC).toMatch(/checks_skipped/);
  });
});

describe('there is one Firecrawl implementation', () => {
  it('the crawler and the scorer share it', () => {
    expect(SHARED).toContain('api.firecrawl.dev');
    expect(SRC).toMatch(/from '\.\.\/\.\.\/_shared\/scrape-markdown\.ts'/);
    expect(CRAWLER).toMatch(/from '\.\.\/_shared\/scrape-markdown\.ts'/);
    // The crawler must no longer hold its own copy: the status handling in it (Firecrawl's 429 is
    // OUR quota, not the page's) already cost a live incident where 72 pages were filed as "429".
    expect(CRAWLER, 'the crawler still calls Firecrawl directly').not.toContain('api.firecrawl.dev');
  });

  it('the shared fetch guards the URL before spending', () => {
    const guard = SHARED.search(/assertSafeUrl\(/);
    const spend = SHARED.search(/fetch\('https:\/\/api\.firecrawl\.dev/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard, 'a URL is validated before we pay to fetch it').toBeLessThan(spend);
  });

  it('never files Firecrawl’s own status as the page’s', () => {
    expect(SHARED).toMatch(/http_status:\s*meta\.statusCode/);
  });
});

describe('the route is reachable', () => {
  it('is registered in the seo-api action map', () => {
    // A handler nothing routes to is unreachable however good it is.
    expect(ROUTER).toMatch(/score_url:\s*handleScoreUrl/);
    expect(ROUTER).toMatch(/from '\.\/handlers\/score-url\.ts'/);
  });
});
