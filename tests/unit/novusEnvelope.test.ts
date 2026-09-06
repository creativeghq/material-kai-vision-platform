/**
 * What the myDATA envelope has to say for the provider to accept it at all.
 *
 * Every assertion here was WRITTEN FROM A REJECTION the Novus sandbox actually returned on
 * 2026-09-06 (issue #319, the first time anything was transmitted). Until that pass,
 * `fiscal_submissions` had zero rows and the whole path looked healthy: the connector was
 * shipped, the settings card said the key was configured, and nothing had ever asked the
 * provider a question. It turned out that **no document of any kind could be transmitted**, and
 * each cause produced a plausible-looking failure rather than a loud one:
 *
 *   - `paymentMethodInvoiceLabel` was never sent. Mandatory → HTTP 400 on EVERY document.
 *   - the summary's `incomeClassification` was one entry for the whole net value, so any invoice
 *     whose lines carried two different classifications was refused (311/312/321) — which is
 *     exactly what the builder's own per-product classification feature produces.
 *   - a movement document (9.3) was sent as an invoice with zero totals: `paymentMethods` and
 *     `currency` are FORBIDDEN there (205), `itemDescr` + `measurementUnit` are mandatory (230),
 *     issuer/counterpart names are mandatory (204), and its classification is `category3`.
 *   - `fetchTransmitted` — the offline-recovery path's only way to learn a final MARK — omitted
 *     the mandatory `issuedFrom`/`issuedTo` (400 every time) and then parsed the wrong envelope,
 *     so a healthy queued document read as `rejected`. Since #193 that verdict CONDEMNS the
 *     document after a 6h grace.
 *
 * The shape of all four is the same: a wrong envelope is a valid envelope, so no typecheck and
 * no integrity probe could see it. Only the provider could, which is why these are pinned here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

import { buildNovusPayload } from '../../supabase/functions/_shared/fiscal/novus.ts';
import type { FiscalInvoiceInput } from '../../supabase/functions/_shared/fiscal/types.ts';
import {
  mydataIncomeClassificationType,
  mydataIncomeClassificationCategory,
} from '@/services/fiscal/fiscalVocabulary';

const issuer = {
  vatNumber: '802349569', country: 'GR', branch: 0,
  name: 'MATERIALS BANK', profession: 'Δομικά υλικά', taxOffice: 'Θεσσαλονίκης',
  address: { street: 'ΔΗΜΗΤΡΙΟΥ ΧΑΡΙΣΗ', number: '10', postalCode: '54352', city: 'ΘΕΣΣΑΛΟΝΙΚΗ', country: 'GR' },
};
const counterpart = {
  vatNumber: '026883248', country: 'GR', branch: 0, name: 'ΥΔΡΑΥΛΙΚΟΣ ΑΕ',
  address: { street: 'Ζωγράφου', number: '500', postalCode: '11527', city: 'Ζωγράφου', country: 'GR' },
};

const line = (over: Record<string, unknown> = {}) => ({
  lineNumber: 1, description: 'Πλακίδιο 60x60', quantity: 1, measurementUnitLabel: 'ΤΜΧ',
  unitPrice: 100, netValue: 100, vatCategory: 1, vatPercent: 24, vatAmount: 24,
  incomeClassificationType: 'E3_561_001', incomeClassificationCategory: 'category1_1',
  ...over,
});

const invoice = (over: Partial<FiscalInvoiceInput> = {}): FiscalInvoiceInput => ({
  issuer, counterpart,
  header: { series: 'MK', aa: '1', issueDate: '2026-09-06', invoiceType: '1.1', currency: 'EUR', ...(over.header ?? {}) },
  lines: (over.lines as any) ?? [line()],
  summary: {
    totalNetValue: 100, totalVatAmount: 24, totalGrossValue: 124,
    incomeClassificationType: 'E3_561_001', incomeClassificationCategory: 'category1_1',
    ...(over.summary ?? {}),
  },
  ...over,
} as FiscalInvoiceInput);

const doc = (input: FiscalInvoiceInput) => (buildNovusPayload(input) as any).invoice[0];

describe('the printed payment method is sent, and it names the code that is transmitted', () => {
  it('always carries paymentMethodInvoiceLabel — its absence is a 400 on every document', () => {
    const d = doc(invoice());
    expect(d.providerAdditionalInvoiceDetails.additionalDetails.paymentMethodInvoiceLabel).toBeTruthy();
  });

  it('derives the label from the transmitted code, so the two cannot disagree', () => {
    const cash = doc(invoice({ paymentMethods: [{ type: 3, amount: 124 }] } as any));
    expect(cash.paymentMethods[0].type).toBe(3);
    expect(cash.providerAdditionalInvoiceDetails.additionalDetails.paymentMethodInvoiceLabel).toBe('Cash');

    const pos = doc(invoice({ paymentMethods: [{ type: 7, amount: 124 }] } as any));
    expect(pos.providerAdditionalInvoiceDetails.additionalDetails.paymentMethodInvoiceLabel).toBe('POS / e-POS');
  });

  it('labels the FALLBACK method when the document records none — 5, on credit', () => {
    const d = doc(invoice());
    expect(d.paymentMethods[0].type).toBe(5);
    expect(d.providerAdditionalInvoiceDetails.additionalDetails.paymentMethodInvoiceLabel).toBe('On credit');
  });

  it('follows the document language for the printed name', () => {
    const el = doc(invoice({ documentLanguageCode: 'EL', paymentMethods: [{ type: 3, amount: 124 }] } as any));
    expect(el.providerAdditionalInvoiceDetails.additionalDetails.paymentMethodInvoiceLabel).toBe('Μετρητά');
  });
});

describe('the summary classification is DERIVED from the lines, never restated', () => {
  it('sums per (type, category) pair — two classifications produce two summary entries', () => {
    const d = doc(invoice({
      lines: [
        line({ lineNumber: 1, netValue: 100 }),
        line({ lineNumber: 2, netValue: 50, incomeClassificationCategory: 'category1_3' }),
        line({ lineNumber: 3, netValue: 25, incomeClassificationCategory: 'category1_3' }),
      ],
    } as any));
    expect(d.invoiceSummary.incomeClassification).toEqual([
      { classificationType: 'E3_561_001', classificationCategory: 'category1_1', amount: 100 },
      { classificationType: 'E3_561_001', classificationCategory: 'category1_3', amount: 75 },
    ]);
  });

  it('matches the LINE totals exactly — AADE cross-checks the two (311/312/321)', () => {
    const d = doc(invoice({
      lines: [line({ lineNumber: 1, netValue: 33.33 }), line({ lineNumber: 2, netValue: 66.67 })],
    } as any));
    const summed = d.invoiceSummary.incomeClassification.reduce((s: number, c: any) => s + c.amount, 0);
    const lineTotal = d.invoiceDetails.reduce((s: number, l: any) => s + l.incomeClassification[0].amount, 0);
    expect(summed).toBe(Math.round(lineTotal * 100) / 100);
  });

  it('falls back to the document-level pair only when NO line carries one', () => {
    const d = doc(invoice({
      lines: [line({ incomeClassificationType: undefined, incomeClassificationCategory: undefined })],
    } as any));
    expect(d.invoiceSummary.incomeClassification).toEqual([
      { classificationType: 'E3_561_001', classificationCategory: 'category1_1', amount: 100 },
    ]);
  });
});

describe('a movement document is a different envelope, not an invoice with zero totals', () => {
  const movement = (over: Record<string, unknown> = {}) => invoice({
    header: {
      series: 'MK', aa: '1', issueDate: '2026-09-06', invoiceType: '9.3', currency: 'EUR',
      movePurpose: 1, movePurposeLabel: 'Πώληση',
      loadingAddress: { street: 'ΧΑΡΙΣΗ', number: '10', postalCode: '54352', city: 'ΘΕΣΣΑΛΟΝΙΚΗ' },
      deliveryAddress: { street: 'Ζωγράφου', number: '500', postalCode: '11527', city: 'Ζωγράφου' },
      ...over,
    },
    lines: [line({ unitPrice: 0, netValue: 0, vatCategory: 8, vatPercent: 0, vatAmount: 0 })],
    summary: { totalNetValue: 0, totalVatAmount: 0, totalGrossValue: 0 },
  } as any);

  it('omits paymentMethods and currency — both are FORBIDDEN there (205)', () => {
    const d = doc(movement());
    expect(d.paymentMethods).toBeUndefined();
    expect(d.invoiceHeader.currency).toBeUndefined();
  });

  it('carries itemDescr and the NUMERIC measurementUnit per line (230)', () => {
    const d = doc(movement());
    expect(d.invoiceDetails[0].itemDescr).toBe('Πλακίδιο 60x60');
    expect(d.invoiceDetails[0].measurementUnit).toBe(1);
  });

  it('carries the issuer name + address and the counterpart name (204)', () => {
    const d = doc(movement());
    expect(d.issuer.name).toBe('MATERIALS BANK');
    expect(d.issuer.address.city).toBe('ΘΕΣΣΑΛΟΝΙΚΗ');
    expect(d.counterpart.name).toBe('ΥΔΡΑΥΛΙΚΟΣ ΑΕ');
  });

  it('classifies as category3 (Transport) with no income type, on the line AND the summary', () => {
    const d = doc(movement());
    expect(d.invoiceDetails[0].incomeClassification).toEqual([{ classificationCategory: 'category3', amount: 0 }]);
    expect(d.invoiceSummary.incomeClassification).toEqual([{ classificationCategory: 'category3', amount: 0 }]);
  });

  it('leaves an ordinary invoice untouched — none of the movement fields appear', () => {
    const d = doc(invoice());
    expect(d.invoiceHeader.currency).toBe('EUR');
    expect(d.paymentMethods).toBeTruthy();
    expect(d.invoiceDetails[0].itemDescr).toBeUndefined();
    expect(d.invoiceDetails[0].measurementUnit).toBeUndefined();
    expect(d.issuer.name).toBeUndefined();
  });

  it('REFUSES a movement line whose unit has no AADE code rather than guessing one', () => {
    expect(() => doc(movement() && invoice({
      header: {
        series: 'MK', aa: '1', issueDate: '2026-09-06', invoiceType: '9.3', currency: 'EUR',
        movePurpose: 1,
        loadingAddress: { street: 'ΧΑΡΙΣΗ', number: '10', postalCode: '54352', city: 'ΘΕΣΣΑΛΟΝΙΚΗ' },
        deliveryAddress: { street: 'Ζωγράφου', number: '500', postalCode: '11527', city: 'Ζωγράφου' },
      },
      lines: [line({ measurementUnitLabel: 'crate', unitPrice: 0, netValue: 0, vatCategory: 8, vatPercent: 0, vatAmount: 0 })],
      summary: { totalNetValue: 0, totalVatAmount: 0, totalGrossValue: 0 },
    } as any))).toThrow(/measurement_unit code/i);
  });

  it('REFUSES purpose 8 addressed to someone else — an internal transfer is to yourself (286)', () => {
    expect(() => doc(movement({ movePurpose: 8 }))).toThrow(/Ενδοδιακίνηση|internal transfer/i);
  });
});

describe('a movement document is addressed to somebody even when they have no VAT number', () => {
  it('keeps the counterpart block for a 9.3 to a private customer — 204 needs the name', () => {
    const d = doc(invoice({
      counterpart: { vatNumber: '', country: 'GR', branch: 0, name: 'Ιδιώτης πελάτης' },
      header: {
        series: 'MK', aa: '1', issueDate: '2026-09-06', invoiceType: '9.3', currency: 'EUR',
        movePurpose: 1,
        loadingAddress: { street: 'ΧΑΡΙΣΗ', number: '10', postalCode: '54352', city: 'ΘΕΣΣΑΛΟΝΙΚΗ' },
        deliveryAddress: { street: 'Ζωγράφου', number: '500', postalCode: '11527', city: 'Ζωγράφου' },
      },
      lines: [line({ unitPrice: 0, netValue: 0, vatCategory: 8, vatPercent: 0, vatAmount: 0 })],
      summary: { totalNetValue: 0, totalVatAmount: 0, totalGrossValue: 0 },
    } as any));
    expect(d.counterpart).toBeTruthy();
    expect(d.counterpart.name).toBe('Ιδιώτης πελάτης');
  });

  it('still drops the counterpart on a RETAIL invoice — that is what makes it retail', () => {
    const d = doc(invoice({
      counterpart: { vatNumber: '', country: 'GR', branch: 0, name: 'Λιανική' },
      header: { series: 'MK', aa: '1', issueDate: '2026-09-06', invoiceType: '11.1', currency: 'EUR' },
    } as any));
    expect(d.counterpart).toBeUndefined();
  });
});

describe('the unit code resolves the way units are actually written', () => {
  it('matches unaccented Greek capitals — ΚΙΛΑ is how a document spells it', () => {
    const movementWith = (unit: string) => doc(invoice({
      header: {
        series: 'MK', aa: '1', issueDate: '2026-09-06', invoiceType: '9.3', currency: 'EUR',
        movePurpose: 1,
        loadingAddress: { street: 'ΧΑΡΙΣΗ', number: '10', postalCode: '54352', city: 'ΘΕΣΣΑΛΟΝΙΚΗ' },
        deliveryAddress: { street: 'Ζωγράφου', number: '500', postalCode: '11527', city: 'Ζωγράφου' },
      },
      lines: [line({ measurementUnitLabel: unit, unitPrice: 0, netValue: 0, vatCategory: 8, vatPercent: 0, vatAmount: 0 })],
      summary: { totalNetValue: 0, totalVatAmount: 0, totalGrossValue: 0 },
    } as any));
    expect(movementWith('ΚΙΛΑ').invoiceDetails[0].measurementUnit).toBe(2);
    expect(movementWith('κιλά').invoiceDetails[0].measurementUnit).toBe(2);
    expect(movementWith('ΛΙΤΡΑ').invoiceDetails[0].measurementUnit).toBe(3);
    expect(movementWith('Τ.Μ.').invoiceDetails[0].measurementUnit).toBe(5);
  });
});

describe('the provider routes and body shapes, as the swagger declares them', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'supabase', 'functions', '_shared', 'fiscal', 'novus.ts'),
    'utf8',
  );

  it('POSTs an ARRAY to CompletionPosInvoices — a bare object is a 400', () => {
    // `List<SendInvoicesAfterPosPaymentRequest>`. Sending the object meant the POS completion had
    // never once succeeded: card charged, receipt held, no legal document filed.
    const body = src.slice(src.indexOf('CompletionPosInvoices'), src.indexOf('CompletionPosInvoices') + 1400);
    expect(body).toMatch(/body:\s*JSON\.stringify\(\[\{/);
  });

  it('sends a B2G invoice to SendInvoicesB2G, not to SendInvoices', () => {
    // `ProviderInvoice` has no `providerB2gAdditionalInvoiceDetails` property, and the JSON
    // binder drops unknown members — so the plain route silently discarded every B2G field.
    expect(src).toMatch(/input\.b2g\s*\?\s*'SendInvoicesB2G'\s*:\s*'SendInvoices'/);
  });

  it('passes the MARK as the body and the terminal/payment as QUERY on the deferred-signature pair', () => {
    for (const route of ['AskSignatureForOldInvoice', 'CompletionAskSignatureForOldInvoice']) {
      const at = src.indexOf(`Provider/${route}`);
      expect(at, `${route} not called`).toBeGreaterThan(-1);
      const block = src.slice(at, at + 700);
      expect(block, `${route} must send the MARK as a bare number body`)
        .toMatch(/body:\s*JSON\.stringify\(Number\(input\.invoiceMark\)\)/);
      expect(block, `${route} must carry its parameters in the query string`).toContain('qs.toString()');
    }
  });

  it('reads the provider credit pool directly instead of inferring it from a spend', () => {
    expect(src).toContain('GetCreditsBalance');
  });
});

describe('a 228 is resolved by CHECKING, never by taking the provider at its word', () => {
  const edge = stripComments(readFileSync(
    join(__dirname, '..', '..', 'supabase', 'functions', 'finance-issue-invoice', 'index.ts'), 'utf8'));

  it('adopts the filed MARK only when series, AA and gross all match', () => {
    // The same 228 is what a numbering collision looks like. Adopting on the MARK alone would
    // stamp this invoice with a different document's legal number.
    expect(edge).toMatch(/duplicateOf\?\.mark/);
    expect(edge).toMatch(/invoiceHeader\?\.series/);
    expect(edge).toMatch(/invoiceHeader\?\.aa/);
    expect(edge).toMatch(/totalGrossValue/);
    expect(edge).toMatch(/sameDocument/);
  });

  it('reports a numbering collision as one, rather than failing quietly', () => {
    expect(edge).toMatch(/numbering collision/i);
  });

  it('marks a recovered transmission as recovered, so it is not mistaken for a fresh one', () => {
    expect(edge).toContain('recoveredFromDuplicate');
  });
});

describe('a movement cancellation goes to the route for its own direction of goods', () => {
  const edge = stripComments(readFileSync(
    join(__dirname, '..', '..', 'supabase', 'functions', 'finance-issue-invoice', 'index.ts'), 'utf8'));
  const conn = stripComments(readFileSync(
    join(__dirname, '..', '..', 'supabase', 'functions', '_shared', 'fiscal', 'novus.ts'), 'utf8'));

  it('the connector implements BOTH cancellation routes', () => {
    expect(conn).toContain('CancelDeliveryNote');
    expect(conn).toContain('CancelReceivingNote');
  });

  it('shares one body between them rather than duplicating the success contract', () => {
    expect(conn).toMatch(/function cancelMovement/);
  });

  it('the edge function picks the route from the note kind, not from a single hardcoded one', () => {
    // A goods RECEIPT sent to the delivery route comes back 301 "not found" — on precisely the
    // notes nobody tests, because the inbound ones are the rarer half.
    expect(edge).toMatch(/kind === 'receipt'/);
    expect(edge).toMatch(/cancelReceivingNote/);
    expect(edge).toMatch(/cancelFn\(/);
  });
});

describe('a document declares the right ledger, or none at all', () => {
  // All three verdicts were read off the sandbox: sending the wrong ledger is a hard rejection,
  // and until this existed the connector sent `incomeClassification` on everything — so
  // self-billing (231), a Titlos Ktisis (231) and a self-delivery (331) could never transmit.
  const withHeader = (header: Record<string, unknown>, over: Record<string, unknown> = {}) =>
    doc(invoice({
      header: { series: 'MK', aa: '1', issueDate: '2026-09-06', currency: 'EUR', invoiceType: '1.1', ...header },
      ...over,
    } as any));

  it('a SELF-BILLED document declares neither ledger', () => {
    const d = withHeader({ selfPricing: true });
    expect(d.invoiceSummary.incomeClassification).toBeUndefined();
    expect(d.invoiceSummary.expensesClassification).toBeUndefined();
    expect(d.invoiceDetails[0].incomeClassification).toBeUndefined();
    expect(d.invoiceDetails[0].expensesClassification).toBeUndefined();
  });

  it('a proof of expenditure (3.1) declares EXPENSES, never income', () => {
    const d = withHeader({ invoiceType: '3.1' }, {
      lines: [line({ expenseClassificationType: 'E3_102_002', expenseClassificationCategory: 'category2_1' })],
    });
    expect(d.invoiceDetails[0].incomeClassification).toBeUndefined();
    expect(d.invoiceDetails[0].expensesClassification).toEqual([
      { classificationType: 'E3_102_002', classificationCategory: 'category2_1', amount: 100 },
    ]);
    expect(d.invoiceSummary.expensesClassification).toEqual([
      { classificationType: 'E3_102_002', classificationCategory: 'category2_1', amount: 100 },
    ]);
    expect(d.invoiceSummary.incomeClassification).toBeUndefined();
  });

  it('REFUSES a proof of expenditure that does not say what kind of expense it was', () => {
    expect(() => withHeader({ invoiceType: '3.1' })).toThrow(/EXPENSE classification/i);
  });

  it('a self-delivery (6.1) uses its own income pair, not the sales one', () => {
    expect(mydataIncomeClassificationType('6.1')).toBe('E3_595');
    expect(mydataIncomeClassificationCategory('6.1')).toBe('category1_6');
  });

  it('an ordinary sales invoice still declares income only', () => {
    const d = withHeader({});
    expect(d.invoiceSummary.incomeClassification).toBeTruthy();
    expect(d.invoiceSummary.expensesClassification).toBeUndefined();
  });
});

describe('income classification is derived from the document type, not defaulted flat', () => {
  it.each([
    ['1.1', 'E3_561_001', 'category1_1'],
    ['2.1', 'E3_561_001', 'category1_3'],
    ['11.1', 'E3_561_003', 'category1_1'],
    ['11.2', 'E3_561_003', 'category1_3'],
    ['11.4', 'E3_561_003', 'category1_1'],
    ['5.1', 'E3_561_001', 'category1_1'],
  ])('%s → %s / %s', (docType, expectedType, expectedCategory) => {
    expect(mydataIncomeClassificationType(docType)).toBe(expectedType);
    expect(mydataIncomeClassificationCategory(docType)).toBe(expectedCategory);
  });

  it('never answers the wholesale-goods pair for a retail or service document', () => {
    // The exact combination the provider refused: 11.1 with E3_561_001 (313), 2.1 with
    // category1_1 (331).
    expect(mydataIncomeClassificationType('11.1')).not.toBe('E3_561_001');
    expect(mydataIncomeClassificationCategory('2.1')).not.toBe('category1_1');
  });
});
