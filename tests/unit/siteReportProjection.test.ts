import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The site-report card must show FINDINGS, not how the site is configured.
 *
 * `seo_site_report kind:'overview'` rendered, in order: "website is active true", "website
 * max pages 6000", "website is default true", "website page count 353", "website display
 * name Materials Hub", then a few counts — and stopped at its ten-stat cap. So four of ten
 * slots restated configuration for a site the card already names in its own footer, and the
 * payload's most useful field never rendered at all: `articles.by_status` is nested two
 * levels deep and the flattener only ever tested one.
 *
 * That field is the breakdown of how many articles are drafts, completed or failed — which
 * is exactly what the user was trying to find when the model reached for this tool. The
 * data was in the response and the card threw it away to make room for "is default: true".
 *
 * The projection is a private helper in a Deno module, so it is exercised here through a
 * transcription pinned to the source rather than imported. The transcription is checked
 * against the real file below, which is what stops it drifting into a test of itself.
 */

const SRC = join(process.cwd(), 'supabase/functions/_shared/tools/seo-agent-tools.ts');
const src = readFileSync(SRC, 'utf-8');

/** The exact shape `get_website_seo_overview` returns (read off its SQL definition). */
const OVERVIEW_PAYLOAD = {
  website: {
    id: '11111111-1111-1111-1111-111111111111',
    url: 'https://materialshub.gr',
    display_name: 'Materials Hub',
    is_default: true,
    is_active: true,
    page_count: 353,
    max_pages: 6000,
    last_crawled_at: '2026-09-01T00:00:00Z',
    last_crawl_error: null,
  },
  articles: { total: 3, by_status: { completed: 1, failed: 2 } },
  keyword_research: 7,
  toolkit_runs: { total: 6, starred: 0 },
  tracked_domains: { total: 1, active: 1, last_audited_at: '2026-09-05T00:00:00Z' },
};

/** Transcription of `siteReportCardProjection`'s stats half. Pinned to source below. */
function projectStats(data: any): Array<{ label: string; value: string }> {
  const stats: Array<{ label: string; value: string }> = [];
  const skip = /(^id$|_id$|url|^task|^error$|^note$|^status$|_at$)/;
  const SUBJECT_KEYS = new Set(['website', 'site', 'domain_record']);
  const CONFIG_KEYS = new Set(['is_default', 'is_active', 'max_pages', 'display_name', 'name', 'slug']);
  const scalar = (v: any) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40);
  const fmt = (v: any) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v));
  if (!data || typeof data !== 'object' || Array.isArray(data)) return stats;

  const push = (label: string, v: unknown) => {
    if (stats.length >= 12) return;
    stats.push({ label: label.replace(/_/g, ' '), value: fmt(v) });
  };
  const walk = (obj: Record<string, unknown>, prefix: string, depth: number, drop?: Set<string>) => {
    for (const [k, v] of Object.entries(obj)) {
      if (stats.length >= 12) return;
      if (skip.test(k) || drop?.has(k)) continue;
      const label = prefix ? `${prefix} ${k}` : k;
      if (scalar(v)) push(label, v);
      else if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
        walk(v as Record<string, unknown>, label, depth + 1, drop);
      }
    }
  };

  for (const [k, v] of Object.entries(data)) {
    if (stats.length >= 12) break;
    if (skip.test(k)) continue;
    if (scalar(v)) push(k, v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      walk(v as Record<string, unknown>, k, 1, SUBJECT_KEYS.has(k) ? CONFIG_KEYS : undefined);
    }
  }
  return stats;
}

const labels = (d: any) => projectStats(d).map((s) => s.label);

describe('the site report shows findings, not configuration', () => {
  it('drops the subject record’s setup fields', () => {
    const l = labels(OVERVIEW_PAYLOAD);
    // Every one of these was on the card the user complained about.
    expect(l).not.toContain('website is active');
    expect(l).not.toContain('website is default');
    expect(l).not.toContain('website max pages');
    expect(l).not.toContain('website display name');
  });

  it('keeps a real measurement on the same record', () => {
    // `page_count` is a finding about the site, not a setting — the filter must not be
    // "drop everything under website".
    expect(labels(OVERVIEW_PAYLOAD)).toContain('website page count');
  });

  it('surfaces the article breakdown that was being discarded', () => {
    const stats = projectStats(OVERVIEW_PAYLOAD);
    const byStatus = stats.filter((s) => s.label.startsWith('articles by status'));
    expect(byStatus.map((s) => `${s.label}=${s.value}`).sort()).toEqual([
      'articles by status completed=1',
      'articles by status failed=2',
    ]);
  });

  it('keeps is_active where it IS a figure', () => {
    // Scoped to the subject: "1 of 1 tracked domains active" is a real number and the
    // config filter must not reach it.
    expect(labels(OVERVIEW_PAYLOAD)).toContain('tracked domains active');
  });

  it('still renders the plain counts', () => {
    const l = labels(OVERVIEW_PAYLOAD);
    for (const expected of ['articles total', 'keyword research', 'toolkit runs total', 'tracked domains total']) {
      expect(l).toContain(expected);
    }
  });

  it('does not recurse without end, and stays within the card', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } }, n: 5 };
    expect(() => projectStats(deep)).not.toThrow();
    const wide: Record<string, number> = {};
    for (let i = 0; i < 50; i++) wide[`k${i}`] = i;
    expect(projectStats(wide).length).toBeLessThanOrEqual(12);
  });

  it('survives a payload that is not an object', () => {
    for (const bad of [null, undefined, 'x', 3, []]) {
      expect(projectStats(bad)).toEqual([]);
    }
  });
});

describe('the transcription above is the code that ships', () => {
  // A transcribed helper that drifts is a test of itself. These pin the three decisions the
  // cases above depend on; change the projection and this fails until the copy is updated.
  it('the projection scopes its config filter to the subject record', () => {
    expect(src).toContain("const SUBJECT_KEYS = new Set(['website', 'site', 'domain_record']);");
    expect(src).toContain("const CONFIG_KEYS = new Set(['is_default', 'is_active', 'max_pages', 'display_name', 'name', 'slug']);");
    expect(src).toContain('SUBJECT_KEYS.has(k) ? CONFIG_KEYS : undefined');
  });

  it('the projection flattens two levels, so a count map renders', () => {
    expect(src).toMatch(/depth < 2/);
    expect(src).toMatch(/walk\(v as Record<string, unknown>, label, depth \+ 1, drop\)/);
  });

  it('the stat cap is the one the cases assume', () => {
    expect(src).toMatch(/stats\.length >= 12/);
  });
});
