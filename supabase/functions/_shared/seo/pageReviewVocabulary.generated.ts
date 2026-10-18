// GENERATED MIRROR of src/services/seo/pageReviewVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const PAGE_REVIEW_VERDICTS = ['fine', 'improve', 'rewrite'] as const;
export type PageReviewVerdict = typeof PAGE_REVIEW_VERDICTS[number];

export const PAGE_RECOMMENDATION_KINDS = ['title', 'description', 'h1', 'content_gap', 'internal_link'] as const;
export type PageRecommendationKind = typeof PAGE_RECOMMENDATION_KINDS[number];

export const PAGE_RECOMMENDATION_STATUSES = ['open', 'applied', 'dismissed', 'stale'] as const;
export type PageRecommendationStatus = typeof PAGE_RECOMMENDATION_STATUSES[number];

export const PAGE_REVIEW_VERDICT_LABELS: Record<PageReviewVerdict, string> = {
  fine: 'Fine as it is',
  improve: 'Improve',
  rewrite: 'Rewrite',
};

export const PAGE_RECOMMENDATION_KIND_LABELS: Record<PageRecommendationKind, string> = {
  title: 'Title',
  description: 'Meta description',
  h1: 'H1 heading',
  content_gap: 'Content gap',
  internal_link: 'Internal link',
};

export const PAGE_RECOMMENDATION_STATUS_LABELS: Record<PageRecommendationStatus, string> = {
  open: 'Open',
  applied: 'Applied',
  dismissed: 'Dismissed',
  stale: 'Superseded',
};

export const PAGE_REVIEW_TITLE_MAX = 60;
export const PAGE_REVIEW_DESCRIPTION_MAX = 155;

export const PAGE_LIST_FILTERS = ['not_fetched', 'no_title', 'no_description', 'has_impressions', 'has_open_recommendations'] as const;
export type PageListFilter = typeof PAGE_LIST_FILTERS[number];

export const PAGE_LIST_FILTER_LABELS: Record<PageListFilter, string> = {
  not_fetched: 'Not fetched',
  no_title: 'No title',
  no_description: 'No description',
  has_impressions: 'Has impressions',
  has_open_recommendations: 'Has open proposals',
};
