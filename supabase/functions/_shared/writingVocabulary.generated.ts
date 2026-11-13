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

export const WRITING_TELL_KINDS = [
  'ai_phrase', 'engagement_bait', 'filler_hashtag', 'banned_opener', 'ask', 'staging', 'inflation', 'chatbot_residue',
] as const;
export type WritingTellKind = typeof WRITING_TELL_KINDS[number];

export const WRITING_TELL_KIND_LABELS: Record<WritingTellKind, string> = {
  ai_phrase: 'Stock Phrase',
  engagement_bait: 'Engagement Bait',
  filler_hashtag: 'Filler Hashtag',
  banned_opener: 'Banned Opener',
  ask: 'Ask (Counted)',
  staging: 'Staging',
  inflation: 'Inflated Claim',
  chatbot_residue: 'Chat Leftover',
};

export const WRITING_TELL_STRENGTHS = ['strong', 'weak'] as const;
export type WritingTellStrength = typeof WRITING_TELL_STRENGTHS[number];

export const WRITING_TELL_STRENGTH_LABELS: Record<WritingTellStrength, string> = {
  strong: 'Strong',
  weak: 'Weak',
};

export const WRITING_TELL_KIND_HINTS: Record<WritingTellKind, string> = {
  ai_phrase: 'Flagged anywhere in the text.',
  engagement_bait: 'Flagged anywhere in the text.',
  filler_hashtag: 'Flagged when used as a hashtag.',
  banned_opener: 'Flagged only at the start of the text.',
  ask: 'Each different ask found is counted against the channel’s ask limit.',
  staging: 'A sentence that signals importance instead of adding a fact: "not X but Y", run-ups, closers that repeat.',
  inflation: 'Ordinary facts dressed as pivotal, expert-backed or breathtaking.',
  chatbot_residue: 'Chat wrappers and lines about the document itself.',
};

export const COPY_WARNING_CODES = [
  'over_limit', 'below_target', 'above_target', 'first_line_cut', 'opens_with_tag',
  'banned_opener', 'too_many_hashtags', 'filler_hashtag', 'link_not_clickable',
  'too_many_asks', 'ai_phrase', 'engagement_bait', 'invisible_characters', 'avoid_list',
  'staging', 'inflation', 'chatbot_residue', 'weak_tells', 'dash_heavy', 'repeated_openings',
] as const;
export type CopyWarningCode = typeof COPY_WARNING_CODES[number];

export const COPY_WARNING_LABELS: Record<CopyWarningCode, string> = {
  over_limit: 'Over the Platform Limit',
  below_target: 'Shorter Than Target',
  above_target: 'Longer Than Target',
  first_line_cut: 'First Line Cut Off',
  opens_with_tag: 'Opens With a Tag',
  banned_opener: 'Stock Opener',
  too_many_hashtags: 'Too Many Hashtags',
  filler_hashtag: 'Filler Hashtag',
  link_not_clickable: 'Unclickable Link',
  too_many_asks: 'Too Many Asks',
  ai_phrase: 'Stock Phrase',
  engagement_bait: 'Engagement Bait',
  invisible_characters: 'Invisible Characters',
  avoid_list: 'Words to Avoid',
  staging: 'Staged Instead of Stated',
  inflation: 'Inflated Claim',
  chatbot_residue: 'Chat Leftover',
  weak_tells: 'Several Weak Tells',
  dash_heavy: 'Dashes Everywhere',
  repeated_openings: 'Repeated Sentence Openings',
};
