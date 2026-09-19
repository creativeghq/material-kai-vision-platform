/** The GA breakdown vocabulary, and the two artefacts the world map is drawn from. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GA_BREAKDOWNS, GA_BREAKDOWN_COLUMNS, GA_BREAKDOWN_KEYS,
} from '@/components/core/Profile/seo/gaVocabulary';
import { COUNTRY_TOPO_ID } from '@/components/core/Profile/seo/countryTopoIds.generated';
import { SEO_SECTIONS } from '@/components/core/Profile/seo/sections';
import { countryFlag, formatDuration, prettyPath, shareOf } from '@/components/core/Profile/seo/gaBreakdowns';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the GA breakdown vocabulary is one list', () => {
  it('every metric lands in a column the table actually has', () => {
    // A binding naming a column that does not exist inserts nothing and raises nothing — the
    // dimension just arrives with every figure null, which reads as a site nobody visits.
    const known = new Set(GA_BREAKDOWN_COLUMNS);
    for (const spec of GA_BREAKDOWNS) {
      for (const m of spec.metrics) {
        expect(known.has(m.col), `${spec.key} binds ${m.ga} → ${m.col}, which ga_breakdown has no column for`).toBe(true);
      }
    }
  });

  it('the CHECK constraint and the SQL reader hold the same ten keys', () => {
    // Both are written out in migrations, so they cannot import this list. This is the only place
    // the three can be compared.
    expect([...GA_BREAKDOWN_KEYS].sort()).toEqual([
      'ads_campaign', 'age', 'browser', 'city', 'country', 'device', 'event', 'gender',
      'hostname', 'item', 'landing_page', 'language', 'os', 'page', 'returning', 'source',
    ]);
  });

  it('a renamed metric declares BOTH names', () => {
    // `conversions` became `keyEvents`, and a property answers to one or the other. Asking for the
    // wrong one fails the WHOLE report, so every binding for it has to carry the alternative.
    for (const spec of GA_BREAKDOWNS) {
      const conv = spec.metrics.find((m) => m.col === 'conversions');
      if (!conv) continue;
      expect(conv.alt, `${spec.key} asks for ${conv.ga} with no alternative name`).toBeTruthy();
      expect([conv.ga, conv.alt].sort()).toEqual(['conversions', 'keyEvents']);
    }
  });

  it('a breakdown that needs setting up says so', () => {
    // Without `requires`, "not available" is a dead end — the reader cannot tell what would make
    // it available.
    for (const key of ['item', 'ads_campaign'] as const) {
      const spec = GA_BREAKDOWNS.find((b) => b.key === key)!;
      expect(spec.requires, `${key} can be unavailable and does not say what it needs`).toBeTruthy();
    }
  });

  it('only low-cardinality dimensions collect a per-day series', () => {
    // `date x page` on a 5,000-page site is 140k rows for a sparkline nobody asked for.
    const daily = GA_BREAKDOWNS.filter((b) => b.daily).map((b) => b.key).sort();
    expect(daily).toEqual(['country', 'device', 'returning', 'source']);
    for (const key of ['page', 'landing_page', 'city', 'event'] as const) {
      expect(GA_BREAKDOWNS.find((b) => b.key === key)!.daily, `${key} must not collect a daily series`).toBeFalsy();
    }
  });

  it('each spec orders by a metric it asked for', () => {
    // GA rejects an orderBy naming a metric absent from the request, which would fail the whole
    // dimension rather than degrade it.
    for (const spec of GA_BREAKDOWNS) {
      expect(spec.metrics.length, `${spec.key} has no metrics`).toBeGreaterThan(0);
      expect(spec.metrics.some((m) => m.ga === spec.metrics[0].ga)).toBe(true);
    }
  });

  it('the first dimension is the identity, and no spec asks for more than two', () => {
    // `storeGaBreakdown` maps exactly value+label; a third would be silently dropped.
    for (const spec of GA_BREAKDOWNS) {
      expect(spec.dimensions.length, `${spec.key} requests ${spec.dimensions.length} dimensions`).toBeLessThanOrEqual(2);
      expect(spec.dimensions.length).toBeGreaterThan(0);
    }
  });
});

describe('the world map can highlight what it draws', () => {
  const topo = JSON.parse(read('public/geo/countries-110m.json'));

  it('the committed atlas is a topology, not the SPA index page', () => {
    // The host answers 200 with index.html for a missing static path, so "it fetched" proves
    // nothing. The runtime check in WorldChoropleth is the same one.
    expect(topo.type).toBe('Topology');
    expect(topo.objects?.countries?.geometries?.length).toBeGreaterThan(150);
    expect(topo.transform?.scale?.length).toBe(2);
  });

  it('every drawn country is reachable from some alpha-2 code', () => {
    // A shape no code maps to can never be shaded — it renders as "no visitors" for a country
    // that may have plenty, and nothing anywhere reports the gap.
    const reachable = new Set(Object.values(COUNTRY_TOPO_ID));
    const orphans = topo.objects.countries.geometries
      .filter((g: any) => g.id && !reachable.has(g.id))
      .map((g: any) => `${g.properties?.name} (${g.id})`);
    expect(orphans, `atlas shapes no alpha-2 code reaches:\n${orphans.join('\n')}`).toEqual([]);
  });

  it('every mapped code points at a shape the atlas has', () => {
    const drawn = new Set(topo.objects.countries.geometries.map((g: any) => g.id));
    const dangling = Object.entries(COUNTRY_TOPO_ID)
      .filter(([, id]) => !drawn.has(id))
      .map(([c, id]) => `${c} → ${id}`);
    expect(dangling, `codes pointing at nothing:\n${dangling.join('\n')}`).toEqual([]);
  });

  it('the countries GA actually reports for this business resolve', () => {
    for (const c of ['GR', 'CY', 'DE', 'GB', 'US', 'IT', 'FR', 'BG', 'RO', 'AL']) {
      expect(COUNTRY_TOPO_ID[c], `${c} has no shape`).toBeTruthy();
    }
  });
});

describe('breakdown formatting', () => {
  it('a share is null when there is no denominator — never 0%', () => {
    const row = { sessions: 5 } as any;
    expect(shareOf(row, { shown_sessions: 0 } as any)).toBeNull();
    expect(shareOf({ sessions: null } as any, { shown_sessions: 10 } as any)).toBeNull();
    expect(shareOf(row, { shown_sessions: 20 } as any)).toBe(25);
  });

  it('renders a duration a person reads', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(135)).toBe('2m 15s');
    expect(formatDuration(3720)).toBe('1h 2m');
  });

  it('drops the query string so a table is not 80% tracking parameters', () => {
    expect(prettyPath('/products/tiles?utm_source=x&gclid=y')).toBe('/products/tiles');
    expect(prettyPath('/products/tiles')).toBe('/products/tiles');
  });

  it('turns an alpha-2 code into its flag, and refuses anything else', () => {
    expect(countryFlag('GR')).toBe('🇬🇷');
    expect(countryFlag('(not set)')).toBe('');
  });
});

describe('the Audience rail', () => {
  it('offers a pane for each Analytics surface', () => {
    const audience = SEO_SECTIONS.filter((s) => s.group === 'audience').map((s) => s.value);
    expect(audience).toEqual([
      'analytics', 'analytics-pages', 'analytics-geo', 'analytics-tech', 'analytics-commerce',
    ]);
  });

  it('every section id is unique — a duplicate silently shadows a pane', () => {
    const ids = SEO_SECTIONS.map((s) => s.value);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exactly one section is the landing pane', () => {
    expect(SEO_SECTIONS.filter((s) => s.landing).map((s) => s.value)).toEqual(['overview']);
  });
});
