// GENERATED MIRROR of src/services/seo/collectorSchedules.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const COLLECTORS = ['rank_tracking', 'domain_tracking', 'site_audit', 'page_crawl'] as const;
export type CollectorKind = typeof COLLECTORS[number];

export const CADENCES = ['off', 'daily', 'weekly', 'monthly'] as const;
export type CollectorCadence = typeof CADENCES[number];

/** What each collector may run at; `collector_cadence_allowed` in SQL holds the same table. */
export const COLLECTOR_CADENCES: Record<CollectorKind, readonly CollectorCadence[]> = {
  rank_tracking: ['off', 'daily', 'weekly'],
  domain_tracking: ['off', 'weekly', 'monthly'],
  site_audit: ['off', 'weekly', 'monthly'],
  page_crawl: ['off', 'daily', 'weekly'],
};

export const RUNS_PER_MONTH: Record<CollectorCadence, number> = { off: 0, daily: 30, weekly: 4.3, monthly: 1 };

/** Worst case per tracked keyword: three full-depth attempts, then a shallower one. */
export const RANK_SERP_CALLS_PER_KEYWORD_MAX = 4;
