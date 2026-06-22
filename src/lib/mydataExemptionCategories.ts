/** myDATA VAT-exemption categories (ΑΑΔΕ "Κατηγορία Αιτίας Εξαίρεσης ΦΠΑ"), codes
 * 1–31. Required by myDATA on every 0%/exempt invoice line (vatCategory 7/8) —
 * see `vatExemptionCategory` in
 * [_shared/fiscal/types.ts](supabase/functions/_shared/fiscal/types.ts) and the
 * line mapping in `invoice-builder.ts`.
 *
 * On a CRM party this is stored on `vat_exemption_reason` (text) as the **numeric
 * code**, and pre-fills the exemption category on that customer's 0%-VAT invoice
 * lines. Labels carry the governing article so the operator picks the correct one;
 * the Code is the load-bearing value sent to myDATA. */
export interface MydataExemptionCategory {
  /** myDATA exemption code 1–31, stored as text on the party. */
  code: number;
  label: string;
}

export const MYDATA_EXEMPTION_CATEGORIES: MydataExemptionCategory[] = [
  { code: 1,  label: 'Out of scope — arts. 2 & 3 of the VAT Code' },
  { code: 2,  label: 'No VAT — art. 5 of the VAT Code' },
  { code: 3,  label: 'No VAT — art. 13 of the VAT Code' },
  { code: 4,  label: 'No VAT — art. 14 of the VAT Code' },
  { code: 5,  label: 'No VAT — art. 16 of the VAT Code' },
  { code: 6,  label: 'No VAT — art. 19 of the VAT Code' },
  { code: 7,  label: 'No VAT — art. 22 of the VAT Code (domestic exemptions)' },
  { code: 8,  label: 'No VAT — art. 24 of the VAT Code (exports outside the EU)' },
  { code: 9,  label: 'No VAT — art. 25 of the VAT Code' },
  { code: 10, label: 'No VAT — art. 26 of the VAT Code' },
  { code: 11, label: 'No VAT — art. 27 of the VAT Code' },
  { code: 12, label: 'No VAT — art. 27 — sea-going vessels' },
  { code: 13, label: 'No VAT — art. 27.1.γ — sea-going vessels' },
  { code: 14, label: 'No VAT — art. 28 of the VAT Code (intra-community supplies)' },
  { code: 15, label: 'No VAT — art. 39 of the VAT Code (small-enterprise scheme)' },
  { code: 16, label: 'No VAT — art. 39a of the VAT Code (reverse charge)' },
  { code: 17, label: 'No VAT — art. 40 of the VAT Code' },
  { code: 18, label: 'No VAT — art. 41 of the VAT Code (flat-rate farmers)' },
  { code: 19, label: 'No VAT — art. 47 of the VAT Code' },
  { code: 20, label: 'VAT included — art. 43 of the VAT Code' },
  { code: 21, label: 'VAT included — art. 44 of the VAT Code' },
  { code: 22, label: 'VAT included — art. 45 of the VAT Code' },
  { code: 23, label: 'VAT included — art. 46 of the VAT Code' },
  { code: 24, label: 'No VAT — art. 6 of the VAT Code' },
  { code: 25, label: 'No VAT — ΠΟΛ.1029/1995' },
  { code: 26, label: 'No VAT — ΠΟΛ.1167/2015' },
  { code: 27, label: 'Other VAT exemptions' },
  { code: 28, label: "No VAT — art. 24 §1(b) — export outside the EU" },
  { code: 29, label: 'No VAT — art. 47b — intra-community distance sales of goods' },
  { code: 30, label: 'No VAT — art. 47c — goods imported from third countries/territories' },
  { code: 31, label: 'No VAT — art. 47d — OSS non-union scheme (services)' },
];

/** Resolve the human label for a stored code (string or number). */
export function mydataExemptionLabel(code: string | number | null | undefined): string | null {
  if (code === null || code === undefined || code === '') return null;
  const n = typeof code === 'number' ? code : parseInt(code, 10);
  return MYDATA_EXEMPTION_CATEGORIES.find((c) => c.code === n)?.label ?? null;
}
