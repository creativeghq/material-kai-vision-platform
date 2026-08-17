/**
 * Sales-document-kind guard — the same shape as the money-derivation guard, for a business rule
 * instead of a money quantity.
 *
 * The bug this exists to stop: "is this buyer a business, so do they get a τιμολόγιο or an ΑΛΠ
 * retail receipt" was implemented TWICE. NewInvoiceDialog checked the buyer's VAT number
 * (correct — AADE rejects an invoice issued to a VAT-less party). OrdersPanel checked only
 * whether a CRM company was linked:
 *
 *     const salesDocKind = order?.customer_company_id ? 'invoice' : 'receipt';
 *
 * Those disagree for a sole trader (ατομική επιχείρηση) held as a CONTACT carrying an ΑΦΜ — a
 * business the order flow called retail, so it proposed a receipt to someone entitled to an
 * invoice. Nothing about the stored data is wrong, and 'receipt' is a perfectly valid string, so
 * neither an integrity check nor the typechecker can see it. The document is transmitted to
 * myDATA, so the correction is a 5.1 credit note plus a reissue — not a delete.
 *
 * One rule, in `salesDocumentKind.ts`. This test fails the build if a surface starts deciding it
 * from the company link again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  buyerIsConsumer,
  salesDocumentKindFor,
  salesDocumentKindLabel,
} from '../../src/modules/finance/utils/salesDocumentKind';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SCAN_DIRS = ['src/modules/finance', 'src/modules/quotes', 'src/pages/Admin'];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the old bug doesn't trip the scanner. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

describe('the rule itself', () => {
  it('a linked CRM company is always a business', () => {
    expect(buyerIsConsumer({ isCompany: true })).toBe(false);
    expect(salesDocumentKindFor({ isCompany: true })).toBe('invoice');
  });

  it('THE REGRESSION: a sole trader — a contact with an ΑΦΜ — is a business, not retail', () => {
    const soleTrader = { isCompany: false, vatNumber: '123456789', contactType: 'person' };
    expect(buyerIsConsumer(soleTrader)).toBe(false);
    expect(salesDocumentKindFor(soleTrader)).toBe('invoice');
  });

  it('a contact marked as a company is a business even with no VAT captured yet', () => {
    expect(salesDocumentKindFor({ isCompany: false, contactType: 'company' })).toBe('invoice');
  });

  it('a bare contact with no VAT identity is a consumer → retail receipt', () => {
    expect(buyerIsConsumer({ isCompany: false, vatNumber: null, contactType: 'person' })).toBe(true);
    expect(salesDocumentKindFor({ isCompany: false, vatNumber: '   ', contactType: null })).toBe('receipt');
  });

  it('an UNRESOLVED buyer is not treated as a consumer — that would silently restrict them', () => {
    expect(buyerIsConsumer(null)).toBe(false);
    expect(salesDocumentKindFor(undefined)).toBe('invoice');
  });

  it('labels are stable (they appear on issue buttons and in the payment dialog)', () => {
    expect(salesDocumentKindLabel('invoice')).toBe('Invoice');
    expect(salesDocumentKindLabel('receipt')).toBe('Receipt');
  });
});

describe('nobody re-derives the rule', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('scans a non-trivial number of files (guards against a silently-empty walk)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no surface decides invoice-vs-receipt from the company link alone', () => {
    // The exact defect: a ternary that picks a document kind off *_company_id being set.
    const RE = /customer_company_id\s*\?[^;\n]*['"](?:invoice|receipt)['"]/i;
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      if (RE.test(src)) offenders.push(relative(ROOT, f));
    }
    expect(
      offenders,
      `These decide the sales document from the company link, ignoring a contact's VAT number ` +
        `(a sole trader is a business): ${offenders.join(', ')}. ` +
        `Resolve the buyer with financeService.getBuyerIdentity and call salesDocumentKindFor.`,
    ).toEqual([]);
  });

  it('no surface re-implements the VAT/contact_type consumer test inline', () => {
    // A second copy of "has a vat_number OR contact_type === 'company'" is the rule restated.
    const RE = /contact_type\s*===\s*['"]company['"]/;
    const offenders: string[] = [];
    for (const f of files) {
      if (/salesDocumentKind\.ts$/.test(f)) continue; // the one definition
      const src = stripComments(readFileSync(f, 'utf8'));
      if (RE.test(src)) offenders.push(relative(ROOT, f));
    }
    expect(
      offenders,
      `These restate the business-vs-consumer test: ${offenders.join(', ')}. ` +
        `Import buyerIsConsumer from src/modules/finance/utils/salesDocumentKind.ts instead.`,
    ).toEqual([]);
  });
});
