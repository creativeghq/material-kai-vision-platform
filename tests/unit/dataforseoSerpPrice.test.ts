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
