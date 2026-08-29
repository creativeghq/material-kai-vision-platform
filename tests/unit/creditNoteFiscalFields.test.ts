/**
 * A credit note is the invoice it corrects, in reverse — and it was built from a strictly
 * poorer line than the invoice was.
 *
 * Three defects of the same shape, all found on 2026-08-29 by reading another Greek invoicing
 * vendor's public API (docs.oxygen.gr), whose credit-note endpoint carries exactly the fields
 * ours dropped. Every one of them produces a VALID document, so nothing here could have been
 * caught by a type, a constraint or an integrity probe:
 *
 *   1. `buildCreditNoteInputFromDb` read `vat_exemption_category` off a column that did not
 *      exist. myDATA rejects a vatCategory-7 line with no exemption ground, and the envelope
 *      builder omits an `undefined` field silently — so crediting an export, an art. 39a
 *      reverse charge or an art. 28 intra-community line went out without the article, and the
 *      printed copy could not state it either.
 *   2. `invoice_items` carries five per-line tax pairs; `credit_note_items` carried none. A
 *      reversal of a services invoice restated net + VAT and forgot the 20% withholding.
 *   3. The type was hardcoded `5.1 | 5.2`, while `buildInvoiceInputFromDb` emits **11.1** for
 *      every counterparty with no VAT number — i.e. every register and storefront sale. A
 *      retail receipt is reversed by **11.4**; a 5.x against an 11.x is a mis-typed document.
 *
 * The SQL half (`issue_credit_note` copying and pro-rating those facts from the credited
 * invoice line) lives in `pg_proc` and cannot be seen from the repo, so it is not asserted
 * here — it was verified against the live database when it shipped.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { INVOICE_LABELS, invoiceDocTitle } from '@/modules/finance/invoice-templates/labels';

const ROOT = join(__dirname, '..', '..');
const BUILDER = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/_shared/fiscal/invoice-builder.ts'), 'utf8'),
);

/** The credit-note builder body, so an assertion cannot be satisfied by the INVOICE builder. */
const CREDIT_BUILDER = (() => {
  const start = BUILDER.indexOf('export async function buildCreditNoteInputFromDb');
  const end = BUILDER.indexOf('export async function buildDeliveryNoteInputFromDb');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return BUILDER.slice(start, end);
})();

describe('credit note — the line carries what the invoice line carried', () => {
  it('maps the VAT exemption ground onto the transmitted line', () => {
    expect(CREDIT_BUILDER).toMatch(/vatExemptionCategory:\s*it\.vat_exemption_category/);
  });

  it.each([
    ['withheldAmount', 'withheld_amount'],
    ['withheldCategory', 'withheld_category'],
    ['feesAmount', 'fees_amount'],
    ['feesCategory', 'fees_category'],
    ['stampDutyAmount', 'stamp_duty_amount'],
    ['stampDutyCategory', 'stamp_duty_category'],
    ['otherTaxesAmount', 'other_taxes_amount'],
    ['otherTaxesCategory', 'other_taxes_category'],
    ['deductionsAmount', 'deductions_amount'],
  ])('maps %s from %s', (field, column) => {
    expect(CREDIT_BUILDER).toContain(field);
    expect(CREDIT_BUILDER).toContain(`it.${column}`);
  });

  it.each([
    'totalWithheldAmount',
    'totalFeesAmount',
    'totalStampDutyAmount',
    'totalOtherTaxesAmount',
    'totalDeductionsAmount',
  ])('states %s in the summary', (total) => {
    expect(CREDIT_BUILDER).toContain(total);
  });

  it('derives the per-line tax totals from the lines it is transmitting', () => {
    // Not from a second stored copy on `credit_notes`: a cached total beside the rows that
    // produce it is a derivation nobody reconciles. What the reader can add up must add up.
    expect(CREDIT_BUILDER).toMatch(/sumLines\s*=\s*\(/);
    expect(CREDIT_BUILDER).not.toMatch(/cn\.total_withheld_amount/);
  });

  it('honours an explicit VAT category rather than the invoice rate', () => {
    // A 0% line stored as category 7 must transmit at 0%, whatever `invoices.vat_rate` says.
    expect(CREDIT_BUILDER).toContain('VAT_PCT_BY_CATEGORY');
  });
});

describe('credit note — the type follows the document being corrected', () => {
  it('reverses a retail receipt with 11.4', () => {
    expect(CREDIT_BUILDER).toMatch(/inv\.document_type[^)]*\)\.startsWith\('11\.'\)\s*\?\s*'11\.4'/);
  });

  it('still uses 5.1 when correlated to a MARK and 5.2 when not', () => {
    expect(CREDIT_BUILDER).toContain("'5.1'");
    expect(CREDIT_BUILDER).toContain("'5.2'");
  });

  it('does not hardcode the header type back to the 5.x pair', () => {
    // The regression this replaces: `invoiceType: ... ?? (isCorrelated ? '5.1' : '5.2')` in the
    // header, which ignored a retail source outright.
    expect(CREDIT_BUILDER).toMatch(/invoiceType:\s*creditDocType/);
  });

  it('labels a retail credit note as one', () => {
    expect(CREDIT_BUILDER).toContain('Πιστωτικό Στοιχείο Λιανικής');
  });
});

describe('11.4 prints as a credit note, not as a sale', () => {
  it.each(['el', 'en'] as const)('%s title', (lang) => {
    const L = INVOICE_LABELS[lang];
    expect(invoiceDocTitle('11.4', L)).toBe(L.retailCreditNote);
    // The bug: 11.4 sat in the receipt row, so a refund printed "ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ".
    expect(invoiceDocTitle('11.4', L)).not.toBe(L.receipt);
    // The other retail codes are still receipts.
    expect(invoiceDocTitle('11.1', L)).toBe(L.receipt);
    expect(invoiceDocTitle('11.5', L)).toBe(L.receipt);
  });

  it('the edge PDF twin routes 11.4 the same way', () => {
    const pdf = stripComments(
      readFileSync(join(ROOT, 'supabase/functions/finance-invoice-pdf/index.ts'), 'utf8'),
    );
    expect(pdf).toMatch(/case '11\.4':\s*return L\.retailCreditNote;/);
    expect(pdf).toContain('retailCreditNote');
    // Both dictionaries — a title that exists in one language only prints blank in the other.
    expect(pdf).toContain("retailCreditNote: 'ΠΙΣΤΩΤΙΚΟ ΣΤΟΙΧΕΙΟ ΛΙΑΝΙΚΗΣ'");
    expect(pdf).toContain("retailCreditNote: 'RETAIL CREDIT NOTE'");
  });
});
