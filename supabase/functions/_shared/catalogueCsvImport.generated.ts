// GENERATED MIRROR of src/config/catalogueCsvImport.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** The catalogue CSV import contract, shared by Data Import's CSV tab and the agent. Import-free: mirrored to Deno. */

/** The only columns read. Price and cost are never taken from a file. */
export const CATALOGUE_CSV_COLUMNS = [
  'name', 'sku', 'description', 'category', 'barcode', 'country_of_origin',
  'warranty', 'product_url',
] as const;

/** Rows per `import_catalogue_rows` call (the RPC refuses more than 2000). */
export const CATALOGUE_CSV_BATCH = 500;

export interface CatalogueCsvResult { created: number; updated: number; skipped: number; unkeyed: number }

/** Keep only the read columns; a country that is not an ISO-2 code is dropped, not guessed. */
export function catalogueCsvRow(r: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const c of CATALOGUE_CSV_COLUMNS) if (r[c] !== undefined) row[c] = r[c];
  const cc = (row.country_of_origin ?? '').trim();
  if (cc && /^[A-Za-z]{2}$/.test(cc)) row.country_of_origin = cc.toUpperCase();
  else if (cc) delete row.country_of_origin;
  return row;
}
