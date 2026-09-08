/**
 * The payable arithmetic of a myDATA document-level tax — AADE Appendix §23, the `taxType` table.
 *
 * | taxType | bucket      | kind         | reducesPayable=true | reducesPayable=false |
 * |---------|-------------|--------------|---------------------|----------------------|
 * | 1       | withheld    | deductive (−)| subtracts           | does not subtract    |
 * | 2       | fees        | additive  (+)| does NOT add        | adds                 |
 * | 3       | other taxes | additive  (+)| does NOT add        | adds                 |
 * | 4       | stamp duty  | additive  (+)| does NOT add        | adds                 |
 * | 5       | deductions  | deductive (−)| subtracts           | does not subtract    |
 *
 * ONE boolean whose effect depends on the tax's inherent sign; either way `true` leaves the
 * payable smaller. ΠΛΗΡΩΤΕΟ = totalNetValue + totalVatAmount, plus the sum of these deltas.
 *
 * **`public.mydata_tax_payable_delta` in SQL is the authority**, and it is what stamps the
 * stored `invoices.tax_payable_delta` that the envelope builder transmits. This copy exists for
 * ONE reason: the invoice dialog has to show a live total before any row has been written, so
 * there is no invoice for the RPC to derive from yet. The two are held equal by the truth-table
 * case in `tests/unit/mydataDocumentTaxes.test.ts` — the same arrangement `escapeHtml` uses
 * across its runtimes, and for the same reason: the last hand-copied rule drifted.
 *
 * Import-free on purpose, so the guard test can load it in any runtime.
 */

/** AADE `taxType`. */
export const MYDATA_TAX_TYPE = {
  withheld: 1,
  fees: 2,
  otherTaxes: 3,
  stampDuty: 4,
  deductions: 5,
} as const;

export type MydataTaxType = (typeof MYDATA_TAX_TYPE)[keyof typeof MYDATA_TAX_TYPE];

/** The buckets AADE treats as deductive — the ones whose amount can only ever make the payable smaller. */
const DEDUCTIVE: ReadonlySet<number> = new Set<number>([MYDATA_TAX_TYPE.withheld, MYDATA_TAX_TYPE.deductions]);

/**
 * Whether a bucket subtracts from the payable by nature. Drives the DEFAULT of the
 * `reducesPayable` toggle, which reproduces exactly the arithmetic that was hardcoded in the
 * envelope builder before document-level taxes existed — so nothing moves unless an operator
 * deliberately flips a row.
 */
export function isDeductiveTaxType(taxType: number): boolean {
  return DEDUCTIVE.has(taxType);
}

/** The default `reducesPayable` for a bucket: deductive taxes subtract, additive ones add. */
export function defaultReducesPayable(taxType: number): boolean {
  return isDeductiveTaxType(taxType);
}

/** What this tax does to the payable. Mirrors `public.mydata_tax_payable_delta`. */
export function mydataTaxPayableDelta(taxType: number, taxAmount: number, reducesPayable: boolean): number {
  const amount = Number.isFinite(taxAmount) ? taxAmount : 0;
  if (isDeductiveTaxType(taxType)) return reducesPayable ? -amount : 0;
  return reducesPayable ? 0 : amount;
}

/** Human label for a bucket, used by the document-tax editor and the printed charges block. */
export const MYDATA_TAX_TYPE_LABEL: Record<number, string> = {
  1: 'Withholding',
  2: 'Fees',
  3: 'Other taxes',
  4: 'Stamp duty',
  5: 'Deductions',
};

/**
 * The `mydata_reference` category that holds a bucket's own code table.
 *
 * Deductions (5) is the one bucket AADE publishes NO table for, so it is `null` — offering a
 * category picker there would invite a code nobody can read back.
 */
export const MYDATA_TAX_TYPE_REF_CATEGORY: Record<number, string | null> = {
  1: 'withholding_tax',
  2: 'fees',
  3: 'other_taxes',
  4: 'stamp_duty',
  5: null,
};
