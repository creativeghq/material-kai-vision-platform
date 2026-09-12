/**
 * "Has Google crawled this page?" is a question nothing in this platform could answer.
 *
 * gsc_performance only holds pages that earned an impression, two steps downstream of crawling.
 * materialshub.gr has 5,351 URLs and 42 with any impression, and that has THREE explanations
 * with three different fixes — never crawled, crawled and declined, or indexed and never matched.
 * Guessing between them was the state of the art here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const COLLECTOR = read('supabase/functions/gsc-api/urlInspection.ts');
const API = read('supabase/functions/gsc-api/index.ts');

describe('the collector respects a quota it does not own', () => {
  it('uses the published per-site limit, not a guess', () => {
    // 2,000 queries per day and 600 per minute, PER SITE. Exceeding it gets the property
    // throttled, which would take the whole collector down rather than slow it.
    expect(COLLECTOR).toMatch(/INSPECT_QUOTA_PER_DAY\s*=\s*2000/);
    expect(COLLECTOR).toMatch(/INSPECT_QPM\s*=\s*600/);
    expect(COLLECTOR).toMatch(/MIN_INTERVAL_MS/);
    expect(COLLECTOR, 'the pacing sleep must actually be awaited between calls')
      .toMatch(/await sleep\(MIN_INTERVAL_MS\)/);
  });

  it('counts the day from what was WRITTEN, not from a counter', () => {
    // A counter is wrong the moment a run dies halfway. The rows are the truth.
    expect(COLLECTOR).toMatch(/from\('gsc_url_inspection'\)[\s\S]{0,200}?count: 'exact'/);
    expect(COLLECTOR).toMatch(/gte\('inspected_at'/);
  });

  it('stops on the wall clock as well as the quota', () => {
    // The edge gateway cuts a request at 150s; a run that ignores that is killed mid-write.
    expect(COLLECTOR).toMatch(/RUN_BUDGET_MS/);
    expect(COLLECTOR).toMatch(/Date\.now\(\) > deadline/);
  });
});

describe('an answer we could not get is not an answer', () => {
  it('a failed inspection is a ROW with a reason, never a missing row', () => {
    // A missing row reads as "not inspected yet" forever, which is the silent-zero shape: the
    // backfill looks incomplete instead of broken.
    expect(COLLECTOR).toMatch(/source_error/);
    expect(COLLECTOR, 'inspectOne must not throw — a failure has to be recordable')
      .toMatch(/catch \(e\)[\s\S]{0,160}?source_error/);
  });

  it('a failed call never borrows a verdict', () => {
    // `crawl_status: row.source_error ? 'unknown' : ...` — a 429 must not be filed as a
    // coverage state. Same mistake as storing Firecrawl's 429 as the page's HTTP status.
    expect(COLLECTOR).toMatch(/row\.source_error \? 'unknown'/);
  });

  it('the verdict is derived in SQL, not restated here', () => {
    // gsc_crawl_status() is the one mapping. Google's wording is prose that has been reworded
    // before, so a second copy in TypeScript would drift silently.
    expect(COLLECTOR).toMatch(/rpc\('gsc_crawl_status'/);
    expect(COLLECTOR, 'the collector must not classify coverage wording itself')
      .not.toMatch(/crawled_not_indexed|discovered_not_crawled|unknown_to_google/);
  });

  it('stores Google strings verbatim', () => {
    // Never normalised on the way in: a state we do not recognise has to survive to be read
    // rather than be bucketed into the nearest one we know.
    for (const f of ['coverage_state', 'robots_txt_state', 'indexing_state', 'page_fetch_state',
      'google_canonical', 'user_canonical']) {
      expect(COLLECTOR, `${f} is not stored`).toContain(f);
    }
  });
});

describe('the work queue and the routes', () => {
  it('asks the never-inspected first, then the stalest', () => {
    expect(COLLECTOR).toMatch(/seenAt\.get\(url\) \?\? 0/);
    expect(COLLECTOR).toMatch(/sort\(\(a, b\) => a\.at - b\.at\)/);
  });

  it('is reachable on both a cron and an on-demand path', () => {
    expect(API).toMatch(/action === 'cron-inspect'/);
    expect(API).toMatch(/case 'inspect_urls'/);
    // The cron path authenticates: an unauthenticated caller could burn the daily quota.
    const cronAt = API.indexOf("action === 'cron-inspect'");
    expect(API.slice(cronAt, cronAt + 260)).toMatch(/isCronAuthorized\(req\)/);
  });
});
