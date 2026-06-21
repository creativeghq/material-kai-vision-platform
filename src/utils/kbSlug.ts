/**
 * Slugify a KB document title into a URL slug.
 * Mirrors the SQL backfill: lowercase, non-alphanumerics → '-', trim hyphens.
 */
export function slugifyKbTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'article';
}
