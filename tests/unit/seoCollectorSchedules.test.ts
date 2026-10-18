import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';

const CRONS: Array<[string, string]> = [
  ['supabase/functions/seo-rank-tracker/index.ts', 'rank_tracking'],
  ['supabase/functions/seo-domain-tracker/index.ts', 'domain_tracking'],
  ['supabase/functions/seo-site-audit/index.ts', 'site_audit'],
  ['supabase/functions/crawl-user-website/index.ts', 'page_crawl'],
];

describe('paid collectors run on the customer schedule (#475)', () => {
  it('each collector cron reads its due sites from the schedule and records the run', () => {
    for (const [file, collector] of CRONS) {
      const src = strippedSource(file);
      if (collector !== 'page_crawl') {
        expect(src, file).toContain(`rpc('website_collectors_due', { p_collector: '${collector}'`);
        expect(src, file).not.toMatch(/from\('user_websites'\)\s*\.select\('id, workspace_id, url'\)\.eq\('is_active', true\)/);
      }
      expect(src, file).toContain(`p_collector: '${collector}' }`);
    }
  });

  it('a scheduled run bills the payer the schedule names', () => {
    expect(strippedSource('supabase/functions/seo-domain-tracker/index.ts')).toMatch(/user_id: s\.payer/);
    expect(strippedSource('supabase/functions/seo-site-audit/index.ts')).toMatch(/d\.payer_user_id\)/);
    expect(strippedSource('supabase/functions/seo-rank-tracker/index.ts')).toMatch(/trackKeywords\(supabase, batch, payer, deadline\)/);
    expect(strippedSource('supabase/functions/crawl-user-website/index.ts')).toMatch(/body\.payer_user_id/);
  });

  it('only the scheduled crawl records a run, and the platform default is not billed', () => {
    const crawl = strippedSource('supabase/functions/crawl-user-website/index.ts');
    expect(crawl).toMatch(/const scheduled = isCron && Object\.prototype\.hasOwnProperty\.call\(body, 'payer_user_id'\)/);
    expect(crawl).not.toMatch(/isCron && result\.ok\) await markCrawlRun/);
  });

  it('rank tracking counts a day as done when every keyword was attempted, so a failing keyword cannot keep a schedule due', () => {
    expect(strippedSource('supabase/functions/seo-rank-tracker/index.ts')).toContain("rpc('website_rank_run_complete'");
  });

  it('the hourly toolkit audit leaves a website\'s own domain to the domain tracker', () => {
    expect(strippedSource('supabase/functions/seo-api/handlers/toolkit-audit.ts')).toMatch(/\.is\('website_id', null\)/);
  });

  it('the price shown before a schedule comes from the spend gate formula', () => {
    expect(strippedSource('supabase/functions/seo-api/handlers/collector-estimates.ts')).toContain('ceilingCreditsFor(');
  });
});
