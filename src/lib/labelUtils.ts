/**
 * Label formatting utilities.
 * Converts snake_case / camelCase database keys into human-readable labels
 * with zero cost and zero loading — pure string transformation.
 */

/**
 * Abbreviations that should always be fully uppercased.
 * Add to this list if you encounter a new acronym — that's the only maintenance needed.
 */
const ACRONYMS = new Set([
  'id', 'url', 'uri', 'voc', 'co2', 'uv', 'sku', 'pdf',
  'rgb', 'hex', 'api', 'seo', 'crm', 'vat',
]);

/**
 * Converts any snake_case or camelCase key into a readable Title Case label.
 * Handles acronyms automatically — no dictionary to maintain.
 */
export function formatLabel(key: string): string {
  if (!key) return '';

  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-\.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
