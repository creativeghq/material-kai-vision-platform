import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';

const CRONS: Array<[string, string]> = [
  ['supabase/functions/seo-rank-tracker/index.ts', 'rank_tracking'],
  ['supabase/functions/seo-domain-tracker/index.ts', 'domain_tracking'],
  ['supabase/functions/seo-site-audit/index.ts', 'site_audit'],
  ['supabase/functions/crawl-user-website/index.ts', 'page_crawl'],
  ['supabase/functions/seo-api/handlers/llm-mentions.ts', 'ai_visibility'],
];

describe('paid collectors run on the customer schedule (#475)', () => {
  it('each collector cron reads its due sites from the schedule and records the run', () => {
    for (const [file, collector] of CRONS) {
      const src = strippedSource(file);
      if (collector !== 'page_crawl' && collector !== 'ai_visibility') {
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
  it('a manual run states its price, and setup and the competitor gap are derived, not stored', () => {
    for (const f of ['WebsiteRankTrackerPanel', 'WebsiteHealthPanel', 'WebsiteDomainIntelPanel', 'WebsiteDomainAuditsPanel']) {
      expect(strippedSource(`src/components/core/Profile/${f}.tsx`), f).toContain('<RunPrice');
    }
    expect(strippedSource('src/components/core/Profile/seo/WebsiteSetupChecklist.tsx')).toContain("'get_website_setup'");
    const gap = strippedSource('src/components/core/Profile/seo/CompetitorGapPanel.tsx');
    expect(gap).toContain("'get_competitor_keyword_gap'");
    expect(gap).toContain('<KeywordActions');
  });

  it('nothing paid runs on a schedule nobody chose: subjects opt in, articles are checked on demand', () => {
    expect(strippedSource('supabase/functions/seo-api/handlers/llm-mentions.ts')).toContain("rpc('website_collectors_due', { p_collector: 'ai_visibility'");
    expect(strippedSource('supabase/functions/seo-api/handlers/llm-mentions.ts')).not.toMatch(/from\('user_websites'\)[\s\S]{0,120}\.eq\('is_active', true\);/);
    expect(strippedSource('supabase/functions/seo-api/handlers/toolkit-audit.ts')).toMatch(/\.eq\('auto_refresh', true\)/);
    const answer = strippedSource('supabase/functions/seo-api/handlers/answer-check.ts');
    expect(answer).not.toContain('x-cron-secret');
    expect(answer).not.toContain('runInBackground');
    expect(strippedSource('supabase/functions/seo-content-freshness/index.ts')).not.toContain("action: 'refresh'");
    expect(strippedSource('src/components/features/ai/ArticleSuggestionsPanel.tsx')).toContain("action: 'answer_check'");
    expect(strippedSource('src/components/business/mention-monitoring/MentionMonitorTab.tsx')).toContain('auto_refresh: on');
    expect(strippedSource('src/components/business/price-monitoring/MonitoredProductsList.tsx')).toContain('setPriceAutoRefresh(');
  });
});
