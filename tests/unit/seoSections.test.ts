import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LEGACY_SECTION_ALIASES, SEO_SECTIONS, resolveSeoTarget, seoSectionViews,
} from '@/components/core/Profile/seo/sections';

const OPPORTUNITY_TAB: Record<string, string> = Object.fromEntries(
  [...(readFileSync('src/components/core/Profile/seo/WebsiteOpportunitiesCard.tsx', 'utf8')
    .match(/export const OPPORTUNITY_TAB[^{]*\{([\s\S]*?)\};/)?.[1] ?? '')
    .matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]),
);

const PRE_475_IDS = [
  'overview', 'gsc', 'cannibalisation', 'ranks', 'serp-features',
  'analytics', 'analytics-pages', 'analytics-geo', 'analytics-tech', 'analytics-commerce',
  'analytics-funnel', 'analytics-retention',
  'ai', 'rankings', 'competitors', 'domains',
  'articles', 'research', 'brand',
  'crawl', 'health', 'llms',
  'runs', 'reports',
];

describe('the website rail (#475)', () => {
  it('has ten sections', () => {
    expect(SEO_SECTIONS).toHaveLength(10);
  });

  it('every pre-#475 ?section= id still lands on a real section and view', () => {
    for (const id of PRE_475_IDS) {
      const t = resolveSeoTarget(id);
      expect(SEO_SECTIONS.some((s) => s.value === t.section), id).toBe(true);
      const views = seoSectionViews(t.section);
      if (views.length) expect(views.some((v) => v.value === t.view), `${id} -> ${t.section}/${t.view}`).toBe(true);
      else expect(t.view, id).toBeNull();
    }
  });

  it('every alias names a view its section declares', () => {
    for (const [legacy, t] of Object.entries(LEGACY_SECTION_ALIASES)) {
      expect(seoSectionViews(t.section).some((v) => v.value === t.view), legacy).toBe(true);
    }
  });

  it('every section/view pair is reachable, and an unknown view falls back to the first', () => {
    for (const s of SEO_SECTIONS) {
      for (const v of s.views ?? []) expect(resolveSeoTarget(s.value, v.value)).toEqual({ section: s.value, view: v.value });
      expect(resolveSeoTarget(`${s.value}/nope`).view).toBe(s.views?.[0]?.value ?? null);
    }
    expect(resolveSeoTarget('nonsense')).toEqual({ section: 'overview', view: null });
  });

  it('every opportunity opens a real target', () => {
    expect(Object.keys(OPPORTUNITY_TAB).length).toBeGreaterThan(3);
    for (const [kind, target] of Object.entries(OPPORTUNITY_TAB)) {
      const t = resolveSeoTarget(target);
      expect(t.section === 'overview' && target !== 'overview', `${kind} -> ${target} fell back to Overview`).toBe(false);
    }
  });

  it('a section renders its views as a strip, never a second rail', () => {
    const src = readFileSync('src/components/core/Profile/WebsiteSeoDashboard.tsx', 'utf8');
    expect(src).toContain('<HubTabNav');
    expect(src.match(/orientation="vertical"/g) ?? []).toHaveLength(1);
    expect(src).not.toMatch(/HubSideNav/);
  });
});
