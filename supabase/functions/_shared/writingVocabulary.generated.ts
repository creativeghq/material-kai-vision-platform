// GENERATED MIRROR of src/config/writingVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const WRITING_SURFACES = ['social', 'email', 'article'] as const;
export type WritingSurface = typeof WRITING_SURFACES[number];

export const WRITING_SURFACE_LABELS: Record<WritingSurface, string> = {
  social: 'Social',
  email: 'Email',
  article: 'Article',
};

export const WRITING_TELL_KINDS = ['ai_phrase', 'engagement_bait', 'filler_hashtag', 'banned_opener', 'ask'] as const;
export type WritingTellKind = typeof WRITING_TELL_KINDS[number];

export const WRITING_TELL_KIND_LABELS: Record<WritingTellKind, string> = {
  ai_phrase: 'Stock Phrase',
  engagement_bait: 'Engagement Bait',
  filler_hashtag: 'Filler Hashtag',
  banned_opener: 'Banned Opener',
  ask: 'Ask (Counted)',
};

export const WRITING_TELL_KIND_HINTS: Record<WritingTellKind, string> = {
  ai_phrase: 'Flagged anywhere in the text.',
  engagement_bait: 'Flagged anywhere in the text.',
  filler_hashtag: 'Flagged when used as a hashtag.',
  banned_opener: 'Flagged only at the start of the text.',
  ask: 'Each different ask found is counted against the channel’s ask limit.',
};
