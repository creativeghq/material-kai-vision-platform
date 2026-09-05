/**
 * AADE VAT categories — the cat↔percent table, written ONCE.
 *
 * The pairs MUST match exactly or myDATA rejects the document; categories 4/5/6 are the
 * reduced island rates and were once omitted from two pickers. This used to live inside
 * `financeService.ts`, which imports half the platform and so could not be mirrored to Deno —
 * which is why the edge had no category→rate lookup at all and every server-created line
 * (storefront checkout, and now a hire from a public profile) fell back to the workspace's
 * default rate whatever the service was classified as.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by `npm run vocab:mirror`
 * (`supabase/functions/_shared/vatVocabulary.generated.ts`). `financeService` re-exports it so
 * every existing importer keeps its path.
 */

export interface VatCategory {
  /** AADE category code, as a string (myDATA accepts "1".."8"). */
  code: string;
  /** Numeric VAT percentage applied for this category (0 for 7/8). */
  pct: number;
  /** Short label, e.g. "24%". */
  label: string;
  /** Longer label for settings/defaults pickers, e.g. "1 — 24%". */
  longLabel: string;
}

export const VAT_CATEGORIES: VatCategory[] = [
  { code: '1', pct: 24, label: '24%', longLabel: '1 — 24%' },
  { code: '2', pct: 13, label: '13%', longLabel: '2 — 13%' },
  { code: '3', pct: 6, label: '6%', longLabel: '3 — 6%' },
  { code: '4', pct: 17, label: '17% (reduced)', longLabel: '4 — 17% (island reduced)' },
  { code: '5', pct: 9, label: '9% (reduced)', longLabel: '5 — 9% (island reduced)' },
  { code: '6', pct: 4, label: '4% (super-reduced)', longLabel: '6 — 4% (island super-reduced)' },
  { code: '7', pct: 0, label: '0%', longLabel: '7 — 0%' },
  { code: '8', pct: 0, label: 'Without VAT', longLabel: '8 — Without VAT (exempt)' },
];

/** VAT percentage for an AADE category code; `fallback` when the code is unknown/blank. */
export function vatPctForCat(code: string | number | null | undefined, fallback = 0): number {
  if (code == null || code === '') return fallback;
  const c = VAT_CATEGORIES.find((v) => v.code === String(code));
  return c ? c.pct : fallback;
}

/** Codes 7 and 8 (and any 0% category) require a vatExemptionCategory on myDATA. */
export function vatCatRequiresExemption(code: string | number | null | undefined): boolean {
  return vatPctForCat(code, -1) === 0;
}
