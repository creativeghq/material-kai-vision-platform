/**
 * Turn a raw enum / key value (snake_case, kebab-case, camelCase) into a human
 * Title-Case label for display in the UI. This is the single source for rendering
 * DB status/category/method/source values so the user never sees `in_progress`,
 * `bankTransfer`, or `partially_paid` raw.
 *
 *   humanizeLabel('partially_paid') === 'Partially Paid'
 *   humanizeLabel('bankTransfer')   === 'Bank Transfer'
 *   humanizeLabel('whatsapp')       === 'Whatsapp'
 *   humanizeLabel(null)             === ''
 *
 * For values that need a curated label (acronyms like "PDF", brand casing like
 * "WhatsApp", or a friendlier phrase), keep an explicit `Record<string,string>`
 * label map at the call site and fall back to this helper for the long tail.
 */
export function humanizeLabel(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2') // split camelCase
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
