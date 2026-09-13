// GENERATED MIRROR of src/lib/surfaceRenderer/patternVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** The laying patterns the renderer draws. Import-free: mirrored to Deno by vocab:mirror. */

export const PATTERNS = [
  'stack', 'offset_1_2', 'offset_1_3', 'diagonal', 'herringbone', 'diagonal_herringbone', 'basket_weave',
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABELS: Record<Pattern, string> = {
  stack: 'Stack bond',
  offset_1_2: 'Offset ½',
  offset_1_3: 'Offset ⅓',
  diagonal: 'Diagonal',
  herringbone: 'Herringbone',
  diagonal_herringbone: 'Herringbone at 45°',
  basket_weave: 'Basket weave',
};
