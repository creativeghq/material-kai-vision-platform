/**
 * Document-level myDATA taxes (`taxesTotals`), `reducesPayable`, and `recType` 3.
 *
 * Read against the AADE Appendix that ships with the Novus provider docs (last update
 * 15/07/2025, `src/modules/myaade/NovusProvider/Appendix.pdf`) and the live provider swagger.
 * Three things the platform did not emit at all until this test existed:
 *
 *  1. `taxesTotals` — the DOCUMENT-level declaration. A line carries exactly ONE category per
 *     bucket, so a document charging the same AADE code at several rates — which is what a
 *     recycling levy is, fees 17 at a different rate per ΑΗΗΕ appliance class — was
 *     unrepresentable. AADE's own answer is N rows, each with a free-text `taxTypeLabel`.
 *  2. `reducesPayable` — Appendix §23. The builder hardcoded the sign of every bucket.
 *  3. `recType` 3, "Other Taxes Line with VAT" (Appendix §12). A levy billed to the customer as
 *     its own VAT-bearing line could only ever ride on a goods line, which states a different
 *     fact to AADE.
 *
 * The cases below pin the parts that are silent when wrong: a doubled tax, a flipped sign and a
 * levy filed as goods are all VALID numbers on a VALID document, so nothing downstream raises.
 */
import { describe, it, expect } from 'vitest';

import {
  MYDATA_TAX_TYPE, MYDATA_TAX_TYPE_REF_CATEGORY,
  defaultReducesPayable, isDeductiveTaxType, mydataTaxPayableDelta,
} from '@/modules/finance/mydataTaxPayable';
import { buildInvoiceRenderData } from '@/modules/finance/invoice-templates/renderData';
import { round2 } from '@/utils/decimal';
import { buildNovusPayload } from '../../supabase/functions/_shared/fiscal/novus';

const SETTINGS = { business_name: 'Kai Materials A.E.', business_vat: '090000045', base_currency: 'EUR' };
const CUSTOMER = { name: 'Papadopoulos Constructions', vat_number: '111222333' };

/** Minimal valid envelope input; the guards in `buildNovusPayload` run before anything else. */
const envelope = (extra: Record<string, unknown>) => buildNovusPayload({
  issuer: { vatNumber: '090000045', country: 'GR', branch: 0 },
  counterpart: { vatNumber: '111222333', country: 'GR', branch: 0 },
  header: { series: 'A', aa: '1', issueDate: '2026-09-08', invoiceType: '1.1', currency: 'EUR' },
  lines: [{
    lineNumber: 1, description: 'Washing machine', quantity: 2, measurementUnitLabel: 'pcs',
    unitPrice: 300, netValue: 600, vatCategory: 1, vatPercent: 24, vatAmount: 144,
  }],
  summary: { totalNetValue: 600, totalVatAmount: 144, totalGrossValue: 744.16 },
  ...extra,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

const firstInvoice = (payload: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (payload as any).invoice[0];

describe('reducesPayable — AADE Appendix §23, one boolean whose effect follows the tax sign', () => {
  /**
   * The whole truth table, verbatim from the Appendix:
   *
   *   1 Withheld / 5 Deductions — deductive (−): TRUE subtracts, FALSE does not.
   *   2 Fees / 3 Other / 4 Stamp — additive (+): TRUE does NOT add, FALSE adds.
   *
   * This is the TS twin of `public.mydata_tax_payable_delta`; the same ten rows were run
   * against the SQL function on the live database when it was created. A drift here means the
   * on-screen total and the transmitted gross have started to disagree, which is the shape of
   * every money bug this codebase has had.
   */
  const TRUTH: [number, boolean, number][] = [
    [MYDATA_TAX_TYPE.withheld, true, -10], [MYDATA_TAX_TYPE.withheld, false, 0],
    [MYDATA_TAX_TYPE.deductions, true, -10], [MYDATA_TAX_TYPE.deductions, false, 0],
    [MYDATA_TAX_TYPE.fees, true, 0], [MYDATA_TAX_TYPE.fees, false, 10],
    [MYDATA_TAX_TYPE.otherTaxes, true, 0], [MYDATA_TAX_TYPE.otherTaxes, false, 10],
    [MYDATA_TAX_TYPE.stampDuty, true, 0], [MYDATA_TAX_TYPE.stampDuty, false, 10],
  ];

  it.each(TRUTH)('taxType %i with reducesPayable=%s moves the payable by %i', (taxType, flag, expected) => {
    expect(mydataTaxPayableDelta(taxType, 10, flag)).toBe(expected);
  });

  it('the default flag reproduces the arithmetic that was hardcoded before document taxes existed', () => {
    // fees + stamp + other − withheld − deductions. Nothing may move for a document that does
    // not deliberately flip a row, or every existing invoice changes its gross on redeploy.
    const amounts = { [MYDATA_TAX_TYPE.withheld]: 5, [MYDATA_TAX_TYPE.fees]: 2,
      [MYDATA_TAX_TYPE.otherTaxes]: 3, [MYDATA_TAX_TYPE.stampDuty]: 1, [MYDATA_TAX_TYPE.deductions]: 4 };
    const delta = Object.entries(amounts).reduce(
      (acc, [t, amt]) => acc + mydataTaxPayableDelta(Number(t), amt, defaultReducesPayable(Number(t))), 0);
    expect(delta).toBe(2 + 1 + 3 - 5 - 4);
  });

  it('only withholding and deductions are deductive', () => {
    expect([1, 2, 3, 4, 5].filter(isDeductiveTaxType)).toEqual([1, 5]);
  });

  it('deductions is the one bucket AADE publishes no category table for', () => {
    // Offering a category picker there would invite a code nobody can read back, and the DB
    // constraint `invoice_taxes_deductions_have_no_category` rejects the write.
    expect(MYDATA_TAX_TYPE_REF_CATEGORY[MYDATA_TAX_TYPE.deductions]).toBeNull();
    for (const t of [1, 2, 3, 4]) expect(MYDATA_TAX_TYPE_REF_CATEGORY[t]).toBeTruthy();
  });
});

describe('taxesTotals reaches the myDATA envelope', () => {
  it('emits one row per declared charge, each keeping its own AADE category and label', () => {
    // The case the per-line model cannot state: ONE code (fees 17, recycling) at two different
    // rates, told apart only by the class name in `taxTypeLabel`.
    const payload = firstInvoice(envelope({
      taxesTotals: [
        { taxType: 2, taxCategory: 17, underlyingValue: 2, taxAmount: 0.16, reducesPayable: false, label: 'Φόρος Ανακύκλωσης ΑΗΗΕ-5Γ01' },
        { taxType: 2, taxCategory: 17, underlyingValue: 3, taxAmount: 0.3, reducesPayable: false, label: 'Φόρος Ανακύκλωσης ΑΗΗΕ-6' },
        { taxType: 3, taxCategory: 19, taxAmount: 1.2, reducesPayable: false, label: 'ΕΦΚ Καφές' },
      ],
    }));
    expect(payload.taxesTotals).toHaveLength(3);
    expect(payload.taxesTotals[0]).toMatchObject({
      taxType: 2, taxCategory: 17, underlyingValue: 2, taxAmount: 0.16,
      reducesPayable: false, taxTypeLabel: 'Φόρος Ανακύκλωσης ΑΗΗΕ-5Γ01',
    });
    // Two rows of the SAME bucket and category survive as two rows. Collapsing them is exactly
    // what the per-line declaration does, and why it could not express this document.
    expect(payload.taxesTotals[1].taxTypeLabel).toBe('Φόρος Ανακύκλωσης ΑΗΗΕ-6');
    expect(payload.taxesTotals[2].taxTypeLabel).toBe('ΕΦΚ Καφές');
  });

  it('reducesPayable is transmitted even when false — it is a stated fact, not an absence', () => {
    // Emitting it only when true would make "declared but not charged" indistinguishable from
    // "charged", which is the entire content of the flag.
    const payload = firstInvoice(envelope({
      taxesTotals: [{ taxType: 2, taxCategory: 10, taxAmount: 5, reducesPayable: false }],
    }));
    expect(payload.taxesTotals[0]).toHaveProperty('reducesPayable', false);
  });

  it('omits taxesTotals entirely on a document that declares nothing at document level', () => {
    expect(firstInvoice(envelope({})).taxesTotals).toBeUndefined();
  });
});

describe('recType 3 — a levy line says it is a levy', () => {
  it('is transmitted when the line carries it', () => {
    const payload = firstInvoice(envelope({
      lines: [{
        lineNumber: 1, description: 'Recycling fee ΑΗΗΕ-6', quantity: 3, measurementUnitLabel: 'pcs',
        unitPrice: 0.1, netValue: 0.3, vatCategory: 1, vatPercent: 24, vatAmount: 0.07, recType: 3,
      }],
    }));
    expect(payload.invoiceDetails[0].recType).toBe(3);
  });

  it('is absent on an ordinary goods line rather than defaulted', () => {
    // A recType on every line would tell AADE every line is a levy. Absence is the correct
    // statement for goods, the same way an unset movePurpose is refused rather than defaulted.
    expect(firstInvoice(envelope({})).invoiceDetails[0]).not.toHaveProperty('recType');
  });
});

describe('the printed document names every charge it transmits', () => {
  const build = (documentTaxes: unknown, invoiceExtra: Record<string, unknown> = {}) => buildInvoiceRenderData({
    invoice: {
      currency: 'EUR', doc_language: 'en', total_fees_amount: 0.46, total_other_taxes_amount: 1.2,
      ...invoiceExtra,
    },
    items: [{ description: 'Washing machine', quantity: 2, unit_price: 300, net_value: 600, vat_percent: 24, vat_amount: 144 }],
    settings: SETTINGS,
    customer: CUSTOMER,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    documentTaxes: documentTaxes as any,
  });

  it('prints one row per declared levy, under the name it was filed with', () => {
    // Rule 1c: a figure that is stored and transmitted is PRINTED. Here the LABEL is the part
    // the header totals cannot carry — three levies folded into "Fees 0.46" tells the customer
    // less than the envelope told AADE, and nothing about the document looks wrong.
    const data = build([
      { tax_type: 2, tax_category: 17, tax_amount: 0.16, reduces_payable: false, label: 'Φόρος Ανακύκλωσης ΑΗΗΕ-5Γ01' },
      { tax_type: 2, tax_category: 17, tax_amount: 0.3, reduces_payable: false, label: 'Φόρος Ανακύκλωσης ΑΗΗΕ-6' },
      { tax_type: 3, tax_category: 19, tax_amount: 1.2, reduces_payable: false, label: 'ΕΦΚ Καφές' },
    ]);
    const labels = data.totals.extras.map((e) => e.label);
    expect(labels).toContain('Φόρος Ανακύκλωσης ΑΗΗΕ-5Γ01');
    expect(labels).toContain('Φόρος Ανακύκλωσης ΑΗΗΕ-6');
    expect(labels).toContain('ΕΦΚ Καφές');
    // and NOT the folded bucket name that would otherwise stand in for all three
    expect(labels).not.toContain('Fees');
  });

  it('a levy declared but not charged is not printed in a column the reader adds up', () => {
    // `reducesPayable` on an additive bucket means "declared, does not add". Printing it beside
    // the ones that DO add gives the customer a list that does not foot to the total.
    const data = build([
      { tax_type: 2, tax_category: 17, tax_amount: 0.3, reduces_payable: false, label: 'Charged levy' },
      { tax_type: 2, tax_category: 10, tax_amount: 9.99, reduces_payable: true, label: 'Declared only' },
    ]);
    const labels = data.totals.extras.map((e) => e.label);
    expect(labels).toContain('Charged levy');
    expect(labels).not.toContain('Declared only');
  });

  it('a withholding row prints as a subtraction', () => {
    const data = build([
      { tax_type: 1, tax_category: 7, tax_amount: 48, reduces_payable: true, label: 'Services withholding 8%' },
    ]);
    const row = data.totals.extras.find((e) => e.label === 'Services withholding 8%');
    expect(row).toBeDefined();
    expect(row!.negative).toBe(true);
    expect(row!.value).toBe(48);
  });

  it('falls back to the bucket name only when a row was filed without a label', () => {
    const data = build([{ tax_type: 4, tax_category: 1, tax_amount: 2, reduces_payable: false, label: null }]);
    expect(data.totals.extras.map((e) => e.label)).toContain('Stamp duty');
  });

  it('a zero-amount row is printed by neither renderer', () => {
    // The PDF renderer skips these. A charge listed on one copy of a document and absent from
    // the other is the drift this pair of renderers exists to avoid, and it is invisible until
    // somebody holds both.
    const data = build([
      { tax_type: 2, tax_category: 17, tax_amount: 0, reduces_payable: false, label: 'Nil levy' },
      { tax_type: 2, tax_category: 17, tax_amount: 0.3, reduces_payable: false, label: 'Real levy' },
    ]);
    const labels = data.totals.extras.map((e) => e.label);
    expect(labels).not.toContain('Nil levy');
    expect(labels).toContain('Real levy');
  });

  it('the grand total foots to the charges printed above it', () => {
    // Rendered and read: net 660.16 + VAT 158.44 + charges 2.22 = 820.82. The point is not the
    // arithmetic but that the reader can DO it — the charge list, the "Charges" total and the
    // grand total all have to come from the same rows.
    const data = build([
      { tax_type: 2, tax_category: 17, tax_amount: 0.16, reduces_payable: false, label: 'ΑΗΗΕ-5Γ01' },
      { tax_type: 2, tax_category: 17, tax_amount: 0.3, reduces_payable: false, label: 'ΑΗΗΕ-6' },
      { tax_type: 3, tax_category: 19, tax_amount: 1.2, reduces_payable: false, label: 'ΕΦΚ Καφές' },
    ], { tax_payable_delta: 1.66 });
    const printed = data.totals.extras.reduce((t, e) => t + (e.negative ? -e.value : e.value), 0);
    expect(round2(printed)).toBe(1.66);
    expect(data.totals.grand).toBe(round2(data.totals.priceAfterDiscount + data.totals.totalVat + 1.66));
  });

  it('a row declared but not charged is left out of the grand total, not just the list', () => {
    // The bucket total keeps the full amount — AADE wants it — so re-adding the buckets to get
    // a grand total would charge the customer for a levy the same page says is not charged.
    // The fallback reads `tax_payable_delta`, which SQL derived with the reducesPayable rule.
    const data = build([
      { tax_type: 2, tax_category: 17, tax_amount: 0.3, reduces_payable: false, label: 'Charged' },
      { tax_type: 2, tax_category: 10, tax_amount: 9.99, reduces_payable: true, label: 'Declared only' },
    ], { tax_payable_delta: 0.3 });
    expect(data.totals.grand).toBe(round2(data.totals.priceAfterDiscount + data.totals.totalVat + 0.3));
  });

  it('a document with no document-level rows still prints the per-line bucket totals', () => {
    // The line-mode path is untouched; this is what every existing invoice uses.
    const labels = build(null).totals.extras.map((e) => e.label);
    expect(labels).toContain('Fees');
    expect(labels).toContain('Other taxes');
  });
});
