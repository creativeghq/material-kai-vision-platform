// GENERATED MIRROR of src/utils/fieldKeyNormalize.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * An attribute key folded to the denylist's spelling: snake_case, lowercase. That regex is
 * case-insensitive in all three engines, so only folding the INPUT catches `purchasePrice`.
 */
export function normalizeFieldKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}
