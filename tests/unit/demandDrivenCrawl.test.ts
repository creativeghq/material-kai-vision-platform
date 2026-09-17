import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const crawler = read('supabase/functions/crawl-user-website/index.ts');

describe('the crawl queue is search demand, not the sitemap', () => {
  it('takes its fetch list from get_page_crawl_queue', () => {
    expect(crawler, 'the URLs to read come from the demand queue RPC')
      .toMatch(/rpc\('get_page_crawl_queue'/);
  });

  it('reads only what the plan queued', () => {
    expect(crawler, 'the fetch loop iterates the queue')
      .toMatch(/for \(const entry of plan\.queue\)/);
  });

  it('does not re-derive demand in the edge function', () => {
    for (const table of ['gsc_performance', 'seo_keyword_positions', 'seo_domain_keywords']) {
      expect(crawler, `${table} is read by seo_page_demand, never by the crawler`)
        .not.toContain(table);
    }
  });

  it('treats an unavailable queue as a failure, never as an empty one', () => {
    expect(crawler, 'a queue error must abort the run rather than read nothing and report success')
      .toMatch(/queueErr\)\s*return \{ error:/);
  });

  it('seeds a site with no search history once, and only when nothing is indexed', () => {
    expect(crawler, 'the seed is bounded').toMatch(/sampleEvenly\(urls, SEED_SAMPLE_SIZE\)/);
    expect(crawler, 'and gated on the site having no content at all').toMatch(/if \(!count\)/);
  });
});

describe('the reader is ours; Firecrawl is the fallback', () => {
  it('tries a direct fetch before paying for a scrape', () => {
    const direct = crawler.indexOf('const direct = await directScrape(url)');
    const paid = crawler.indexOf('await firecrawlScrape(url)', direct);
    expect(direct, 'scrapePage must attempt the direct read').toBeGreaterThan(-1);
    expect(paid, 'and only then fall back to Firecrawl').toBeGreaterThan(direct);
  });

  it('falls back only when the HTML carried no readable text', () => {
    expect(crawler, 'a client-rendered shell is the one case Firecrawl is for')
      .toMatch(/text\.length < DIRECT_TEXT_FLOOR/);
  });

  it('records which reader ran, so the paid one stays measurable', () => {
    expect(crawler).toMatch(/fetch_method: s\.fetch_method/);
  });
});

describe('the charge follows the pages actually read', () => {
  it('debits before the read, never after', () => {
    const charge = crawler.indexOf("chargeCronUser(supabase, website.user_id as string, 'seo-website-crawl'");
    const execute = crawler.indexOf('const result = await executeCrawl(supabase, website, plan)', charge);
    expect(charge, 'the cron path must charge').toBeGreaterThan(-1);
    expect(execute, 'and the charge must precede the reading (invariant 10)').toBeGreaterThan(charge);
  });

  it('charges per queued page, not per invocation', () => {
    expect(crawler, 'units are the queue length')
      .toMatch(/units: queued/);
    expect(crawler, 'and the interactive path prices the same way')
      .toMatch(/const amount = queued \* PER_PAGE_CREDIT_COST/);
  });

  it('an empty queue is free', () => {
    const empty = crawler.indexOf('if (queued === 0)');
    const charge = crawler.indexOf('chargeCronUser', empty);
    expect(empty, 'the empty-queue branch must exist').toBeGreaterThan(-1);
    expect(charge, 'and must return before anything is charged').toBeGreaterThan(empty);
  });

  it('refunds pages the budget never reached', () => {
    expect(crawler, 'paying for an unread page is the flat fee one layer down')
      .toMatch(/const unread = queued - result\.pages_fetched/);
    expect(crawler).toMatch(/refundCronUser\(/);
  });
});

describe('a fetched page carries what a suggestion needs', () => {
  it('stores the whole document, not only the excerpt', () => {
    expect(crawler, 'a keyword check needs the body it should appear in')
      .toMatch(/content_text: s\.text/);
  });

  it('stores the keywords the page was queued for', () => {
    expect(crawler, 'without the keyword no improvement can be stated')
      .toMatch(/demand_snapshot:/);
    expect(crawler).toMatch(/keywords: kwList/);
  });

  it('marks a seed read as having no demand behind it', () => {
    expect(crawler, 'a seed has no search evidence, and must not claim one')
      .toMatch(/entry\.reason === 'seed' \? null :/);
  });
});
