import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';

describe('every finding gets a next step (#475 Phase 4)', () => {
  it('striking distance and movers are lenses on the queries view, each row carrying the keyword actions', () => {
    expect(strippedSource('src/components/core/Profile/WebsiteGscPanel.tsx')).toContain('<GscQueryLens');
    const lens = strippedSource('src/components/core/Profile/seo/GscQueryLens.tsx');
    expect(lens).toContain("'get_gsc_striking_distance'");
    expect(lens).toContain("'get_gsc_movers'");
    expect(lens).toContain('<KeywordActions');
  });

  it('choosing the main page for a cannibalised query is recorded, and competing articles can be refreshed', () => {
    const svc = strippedSource('src/services/userWebsitesService.ts');
    expect(svc).toContain("'set_cannibalisation_main_page'");
    expect(svc).toMatch(/action: 'refresh', article_id: articleId, reason/);
    expect(strippedSource('src/components/core/Profile/WebsiteCannibalisationPanel.tsx')).toContain('Make this the main page');
  });

  it('a site-health issue hands the website, page and issue code to the agent', () => {
    const crawl = strippedSource('src/components/core/Profile/WebsiteCrawlPanel.tsx');
    expect(crawl).toMatch(/fixWithAgent\(website, sm\.url, g\.issue_type/);
    expect(crawl).toContain('section=articles&article=');
    expect(strippedSource('src/components/core/Profile/WebsiteHealthPanel.tsx')).toContain('Ask JARVIS to fix the');
  });
});
