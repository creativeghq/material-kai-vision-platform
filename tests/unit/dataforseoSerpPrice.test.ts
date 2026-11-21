import { describe, expect, it } from 'vitest';
import { RANK_SERP_DEPTH, serpLiveAdvancedUnits, serpLiveAdvancedUsd } from '../../supabase/functions/_shared/seo/serp-price';

describe('live advanced SERP price', () => {
  it.each([[10, 0.002], [20, 0.0035], [30, 0.005], [50, 0.008], [60, 0.0095], [100, 0.0155]])(
    'depth %i costs what DataForSEO charged on its own ledger',
    (depth, usd) => expect(serpLiveAdvancedUsd(depth)).toBeCloseTo(usd, 6),
  );

  it('the rank tracker reserves for the depth it actually reads', () => {
    expect(RANK_SERP_DEPTH).toBe(100);
    expect(serpLiveAdvancedUnits(RANK_SERP_DEPTH)).toBe(16);
  });

  it('an unusable depth is priced as one page, never as free', () => {
    expect(serpLiveAdvancedUnits(Number.NaN)).toBe(2);
    expect(serpLiveAdvancedUnits(0)).toBe(2);
  });
});

describe('poisoned-result check', () => {
  it('bills one extra page and the rank tracker reserves for it', async () => {
    const { serpLiveAdvancedUnitsWith, RANK_SERP_POISON_CHECK } = await import('../../supabase/functions/_shared/seo/serp-price');
    const { readFileSync } = await import('node:fs');
    const { stripComments } = await import('../helpers/stripComments');
    expect(serpLiveAdvancedUnitsWith(100, true)).toBe(18);
    expect(serpLiveAdvancedUnitsWith(100, false)).toBe(16);
    expect(RANK_SERP_POISON_CHECK).toBe(true);
    const gate = stripComments(readFileSync('supabase/functions/_shared/tools/dataforseo-spend-gate.ts', 'utf8'));
    expect(gate).toMatch(/serpLiveAdvancedUnitsWith\(.*, poison\)/);
    const tracker = stripComments(readFileSync('supabase/functions/seo-rank-tracker/index.ts', 'utf8'));
    expect(tracker).toMatch(/resolve_poisoned: RANK_SERP_POISON_CHECK/);
  });
});
