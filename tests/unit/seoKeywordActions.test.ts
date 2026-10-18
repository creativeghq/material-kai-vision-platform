import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { strippedSource } from '../helpers/sourceIndex';

const ROOT = process.cwd();
const walk = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const rel = `${dir}/${f}`;
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(f) ? [rel] : [];
});
const SRC = walk('src');
const PROFILE = SRC.filter((f) => f.startsWith('src/components/core/Profile/'));

describe('one keyword action bar (#475 Phase 2)', () => {
  it('nothing in src writes seo_tracked_keywords directly; tracking is the seo_track_keywords RPC', () => {
    const writers = SRC.filter((f) => /from\(\s*['"]seo_tracked_keywords['"][^)]*\)[\s\S]{0,80}\.(insert|upsert)\(/.test(strippedSource(f)));
    expect(writers).toEqual([]);
    const rpcCallers = SRC.filter((f) => strippedSource(f).includes("'seo_track_keywords'"));
    expect(rpcCallers).toEqual(['src/services/userWebsitesService.ts']);
  });

  it('every keyword-showing panel offers the shared bar', () => {
    for (const f of [
      'src/components/core/Profile/WebsiteGscPanel.tsx',
      'src/components/core/Profile/WebsiteCannibalisationPanel.tsx',
      'src/components/core/Profile/WebsiteRankTrackerPanel.tsx',
      'src/components/core/Profile/WebsiteSerpFeaturesPanel.tsx',
      'src/components/core/Profile/WebsiteKeywordResearchPanel.tsx',
      'src/components/core/Profile/seo/DomainRankingKeywordsCard.tsx',
      'src/components/core/Profile/seo/WebsiteOpportunitiesCard.tsx',
    ]) expect(strippedSource(f), f).toContain('<KeywordActions');
  });

  it('no website panel hard-codes a market', () => {
    for (const f of PROFILE) {
      const src = strippedSource(f);
      expect(src, f).not.toMatch(/const (COUNTRY|LANGUAGE) = '[A-Za-z]{2}'/);
      expect(src, f).not.toMatch(/Greek market/);
    }
    expect(strippedSource('src/services/userWebsitesService.ts')).not.toMatch(/countryCode = 'GR'/);
  });

  it('a research or article quick-start from a website panel always carries the website', () => {
    for (const f of PROFILE) {
      for (const m of strippedSource(f).matchAll(/launchQuickStart\(\s*'seo-(research|article)'\s*,\s*'[^']+'\s*(,\s*[^)]+)?\)/g)) {
        expect(m[2], `${f}: ${m[0]}`).toBeTruthy();
      }
    }
  });
});
