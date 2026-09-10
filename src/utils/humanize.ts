/**
 * Turn a raw enum / key value (snake_case, kebab-case, camelCase) into a human
 * Title-Case label for display in the UI. This is the single source for rendering
 * DB status/category/method/source values so the user never sees `in_progress`,
 * `bankTransfer`, or `partially_paid` raw.
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
