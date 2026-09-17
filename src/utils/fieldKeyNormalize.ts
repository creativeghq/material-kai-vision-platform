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
