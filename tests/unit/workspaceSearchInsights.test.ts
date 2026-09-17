import { describe, expect, it } from 'vitest';

import {
  type SearchInsights,
  coverageVerdict,
  insightsOutcome,
} from '../../src/components/analytics/searchInsightsState';

const base: SearchInsights = {
  window_days: 30, searches: 39, answered: 0, zero_result_share: 1,
  top_queries: [], unmet: [], unmatched_terms: [], top_products: [], reason: null,
};

describe('a catalogue that answers nothing says so', () => {
  it('names the verdict rather than leaving a percentage to interpret', () => {
    expect(coverageVerdict(1)).toEqual({ label: 'Nothing found, ever', tone: 'bad', known: true });
    expect(coverageVerdict(0.7).tone).toBe('bad');
    expect(coverageVerdict(0.3).tone).toBe('warn');
    expect(coverageVerdict(0.05).tone).toBe('good');
  });

  it('no share to judge is "No verdict", never 0%', () => {
    for (const v of [null, undefined, Number.NaN]) {
      const out = coverageVerdict(v as number | null);
      expect(out.known, `${String(v)} must not be treated as a real share`).toBe(false);
      expect(out.label).toBe('No verdict');
    }
  });
});

describe('nobody searching is different from the lookup failing', () => {
  it('a failure outranks everything and is never an empty catalogue', () => {
    expect(insightsOutcome({ kind: 'failed', reason: 'gateway' }))
      .toEqual({ kind: 'failed', reason: 'gateway' });
  });

  it('no searches in the window is its own answer', () => {
    const empty = { ...base, searches: 0, zero_result_share: null, reason: 'no_searches_in_window' };
    expect(insightsOutcome({ kind: 'loaded', data: empty }))
      .toEqual({ kind: 'no_searches', windowDays: 30 });
  });

  it('a zero count with no stated reason is still reported as no searches, not as data', () => {
    expect(insightsOutcome({ kind: 'loaded', data: { ...base, searches: 0 } }).kind)
      .toBe('no_searches');
  });

  it('real activity comes through as ready', () => {
    expect(insightsOutcome({ kind: 'loaded', data: base })).toEqual({ kind: 'ready', data: base });
  });

  it('loading never reads as no searches', () => {
    expect(insightsOutcome({ kind: 'loading' }).kind).toBe('loading');
  });
});
