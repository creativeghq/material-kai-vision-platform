/**
 * SELF-BILLING (αυτοτιμολόγηση) — the buyer draws the document up, but it is legally the
 * SUPPLIER's invoice: their ΑΦΜ issues it, their income, their VAT. Every other document this
 * platform builds runs the other way, which is why the feature shipped for months as a checkbox
 * that set a flag and left US as the issuer — a valid envelope filing the supplier's sale under
 * our ΑΦΜ, which no typecheck and no AADE validation could see.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { buildCreditNoteInputFromDb, buildInvoiceInputFromDb } from '../../supabase/functions/_shared/fiscal/invoice-builder.ts';
import { buildNovusPayload } from '../../supabase/functions/_shared/fiscal/novus.ts';
import { mydataClassificationLedger } from '@/services/fiscal/fiscalVocabulary';

const ROOT = join(__dirname, '..', '..');

const WS_VAT = '802349569';
const SUPPLIER_VAT = '094014201';

const FINANCE_SETTINGS = {
  workspace_id: 'ws-1', business_vat: WS_VAT, business_country_code: 'GR',
  business_name: 'MATERIALS BANK', business_profession: 'Δομικά υλικά',
  business_tax_office: 'Θεσσαλονίκης', business_address: 'ΔΗΜΗΤΡΙΟΥ ΧΑΡΙΣΗ',
  business_street_number: '10', business_postal_code: '54352', business_city: 'ΘΕΣΣΑΛΟΝΙΚΗ',
  default_vat_rate: 24,
};

const SUPPLIER_ROW = {
  id: 'sup-1', name: 'ΞΥΛΟΥΡΓΕΙΟ ΑΕ', vat_number: SUPPLIER_VAT, country_code: 'GR',
  is_supplier: true, tax_office: 'Α΄ Αθηνών', profession: 'Ξυλουργικές εργασίες',
  street: 'Πατησίων', street_number: '12', postal_code: '11257', city: 'Αθήνα',
};

const CUSTOMER_ROW = {
  id: 'cus-1', name: 'ΥΔΡΑΥΛΙΚΟΣ ΑΕ', vat_number: '026883248', country_code: 'GR',
  street: 'Ζωγράφου', street_number: '500', postal_code: '11527', city: 'Ζωγράφου',
};

const ITEM = {
  id: 'it-1', invoice_id: 'inv-1', description: 'Κουζίνα', quantity: 1, unit_price: 1000,
  net_value: 1000, line_total: 1000, vat_category: 1, vat_percent: 24, vat_amount: 240,
  product_id: null, added_at: '2026-09-13T09:00:00Z',
};

/**
 * The reads `buildInvoiceInputFromDb` actually makes, and nothing else — an unexpected table
 * returns empty rather than a convenient default, so a read the builder starts doing later
 * surfaces as a failing assertion instead of a silently plausible document.
 */
function fakeSupabase(rows: Record<string, unknown>) {
  const one = (table: string) => {
    const v = rows[table];
    const data = Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    return { data, error: null };
  };
  const many = (table: string) => {
    const v = rows[table];
    return { data: Array.isArray(v) ? v : v ? [v] : [], error: null };
  };
  return {
    from(table: string) {
      const api: Record<string, unknown> = {};
      const chain = () => api;
      Object.assign(api, {
        select: chain, eq: chain, in: chain, not: chain,
        order: () => Promise.resolve(many(table)),
        single: () => Promise.resolve(one(table)),
        maybeSingle: () => Promise.resolve(one(table)),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(many(table)).then(resolve),
      });
      return api;
    },
  };
}

const invoiceRow = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1', workspace_id: 'ws-1', status: 'issued', currency: 'EUR',
  document_type: '1.1', series: 'SB', series_number: 7, legal_number: 'SB7',
  issued_at: '2026-09-13T09:00:00Z', vat_rate: 24,
  subtotal_net: 1000, vat_amount: 240, total: 1240,
  customer_company_id: null, customer_contact_id: null,
  self_billed_supplier_company_id: null, self_pricing: false,
  branch_code: 0, counterparty_snapshot: null, customer_address_unit_id: null,
  ...over,
});

const build = (inv: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  buildInvoiceInputFromDb(
    fakeSupabase({
      invoices: inv,
      invoice_items: [ITEM],
      finance_settings: FINANCE_SETTINGS,
      invoice_taxes: [],
      crm_companies: CUSTOMER_ROW,
      ...extra,
    }) as never,
    'inv-1',
  );

describe('the parties are the other way round, and that is the whole feature', () => {
  it('makes the SUPPLIER the issuer and US the counterpart', async () => {
    const input = await build(
      invoiceRow({ self_billed_supplier_company_id: 'sup-1', self_pricing: true }),
      { crm_companies: SUPPLIER_ROW },
    );

    expect(input.issuer.vatNumber).toBe(SUPPLIER_VAT);
    expect(input.issuer.name).toBe(SUPPLIER_ROW.name);
    expect(input.counterpart.vatNumber).toBe(WS_VAT);
    expect(input.counterpart.name).toBe(FINANCE_SETTINGS.business_name);
  });

  it('leaves an ordinary invoice exactly as it was — us issuing, the customer billed', async () => {
    const input = await build(invoiceRow({ customer_company_id: 'cus-1' }));

    expect(input.issuer.vatNumber).toBe(WS_VAT);
    expect(input.counterpart.vatNumber).toBe('026883248');
    expect(input.header.selfPricing).toBeFalsy();
  });

  it('declares self-pricing on the envelope because the SUPPLIER is named, not because a box is ticked', async () => {
    const input = await build(
      // self_pricing deliberately false: the supplier is what makes it self-billed.
      invoiceRow({ self_billed_supplier_company_id: 'sup-1', self_pricing: false }),
      { crm_companies: SUPPLIER_ROW },
    );
    expect(input.header.selfPricing).toBe(true);
  });
});

describe('the states that used to produce a wrong document are refused', () => {
  it('refuses the flag with no supplier — that is the arrangement that filed their sale under our ΑΦΜ', async () => {
    await expect(build(invoiceRow({ self_pricing: true }))).rejects.toThrow(/no supplier/i);
  });

  it('refuses when the supplier row cannot be read, rather than issuing under nobody', async () => {
    await expect(
      build(invoiceRow({ self_billed_supplier_company_id: 'sup-1', self_pricing: true }), { crm_companies: null }),
    ).rejects.toThrow(/not found/i);
  });

  it('refuses a supplier with no ΑΦΜ — the document is issued in their name', async () => {
    await expect(
      build(invoiceRow({ self_billed_supplier_company_id: 'sup-1', self_pricing: true }),
        { crm_companies: { ...SUPPLIER_ROW, vat_number: null } }),
    ).rejects.toThrow(/ΑΦΜ/);
  });
});

describe('what AADE is told about a self-billed document', () => {
  /**
   * Verified against the Novus sandbox, not reasoned about: with an income classification AADE
   * answers 231 "incomeClassification is forbidden". The issuer is not declaring their own income
   * on a document the buyer drew up.
   */
  it('classifies into NEITHER ledger', () => {
    expect(mydataClassificationLedger('1.1', { selfPricing: true })).toBe('none');
    expect(mydataClassificationLedger('2.1', { selfPricing: true })).toBe('none');
    expect(mydataClassificationLedger('1.1', {})).toBe('income');
  });

  it('carries selfPricing through to the transmitted envelope', async () => {
    const input = await build(
      invoiceRow({ self_billed_supplier_company_id: 'sup-1', self_pricing: true }),
      { crm_companies: SUPPLIER_ROW },
    );
    const doc = (buildNovusPayload(input) as Record<string, any>).invoice[0];
    expect(doc.invoiceHeader.selfPricing).toBe(true);
    expect(doc.issuer.vatNumber).toBe(SUPPLIER_VAT);
    expect(doc.counterpart.vatNumber).toBe(WS_VAT);
  });
});

describe('a credit note corrects the SUPPLIER\'s document, so it runs the same way round', () => {
  const creditNote = {
    id: 'cn-1', workspace_id: 'ws-1', invoice_id: 'inv-1', currency: 'EUR',
    series: 'SB', series_number: 1, credit_note_number: '1', document_type: '5.1',
    issued_at: '2026-09-13T09:00:00Z', correlated_mark: '400001234567890',
    total_net: 1000, total_vat: 240, total: 1240,
  };
  const cnItem = {
    id: 'cni-1', credit_note_id: 'cn-1', description: 'Κουζίνα', quantity: 1, unit_price: 1000,
    net_value: 1000, vat_category: 1, vat_percent: 24, vat_amount: 240, created_at: '2026-09-13T09:00:00Z',
  };

  const buildCn = (invOver: Record<string, unknown>, companies: unknown) =>
    buildCreditNoteInputFromDb(
      fakeSupabase({
        credit_notes: creditNote,
        credit_note_items: [cnItem],
        credit_note_taxes: [],
        invoices: invoiceRow(invOver),
        invoice_items: [ITEM],
        finance_settings: FINANCE_SETTINGS,
        crm_companies: companies,
      }) as never,
      'cn-1',
    );

  it('credits a self-billed invoice in the SUPPLIER\'s name, not ours', async () => {
    const input = await buildCn(
      { self_billed_supplier_company_id: 'sup-1', self_pricing: true },
      SUPPLIER_ROW,
    );
    expect(input.issuer.vatNumber).toBe(SUPPLIER_VAT);
    expect(input.counterpart.vatNumber).toBe(WS_VAT);
    expect(input.header.selfPricing).toBe(true);
  });

  it('leaves an ordinary credit note as it was', async () => {
    const input = await buildCn({ customer_company_id: 'cus-1' }, CUSTOMER_ROW);
    expect(input.issuer.vatNumber).toBe(WS_VAT);
    expect(input.counterpart.vatNumber).toBe('026883248');
    expect(input.header.selfPricing).toBeUndefined();
  });
});

describe('issuance is gated on the agreement, server-side', () => {
  const ISSUE_FN = stripComments(
    readFileSync(join(ROOT, 'supabase/functions/finance-issue-invoice/index.ts'), 'utf8'),
  );

  it('asks self_billing_blocks before issuing or transmitting', () => {
    expect(ISSUE_FN).toContain("rpc('self_billing_blocks'");
  });

  it('treats a FAILED check as a block — an unverifiable authorization is not an authorized one', () => {
    const i = ISSUE_FN.indexOf("rpc('self_billing_blocks'");
    expect(i).toBeGreaterThan(-1);
    expect(ISSUE_FN.slice(i, i + 700)).toMatch(/sbErr[\s\S]*?return json/);
  });

  it('the gate runs BEFORE the issue, not after it', () => {
    const gate = ISSUE_FN.indexOf("rpc('self_billing_blocks'");
    const issue = ISSUE_FN.indexOf("rpc('mark_invoice_issued'");
    expect(gate).toBeGreaterThan(-1);
    expect(issue).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(issue);
  });

  it('does not measure a self-billed document against the CUSTOMER risk rules — the buyer is us', () => {
    const start = ISSUE_FN.indexOf('async function buyerRiskBlocks');
    expect(start).toBeGreaterThan(-1);
    const body = ISSUE_FN.slice(start, start + 1200);
    expect(body).toMatch(/if \(inv\.self_billed_supplier_company_id\) return \[\]/);
  });
});

describe('a supplier\'s numbering range never stands in for one of ours', () => {
  it('listSeries excludes self-billing ranges — it is what decides which types are issuable', () => {
    const svc = stripComments(
      readFileSync(join(ROOT, 'src/services/invoicingSetupService.ts'), 'utf8'),
    );
    const i = svc.indexOf('async listSeries');
    expect(i).toBeGreaterThan(-1);
    expect(svc.slice(i, i + 400)).toMatch(/\.is\(\s*'self_billed_supplier_company_id'\s*,\s*null\s*\)/);
  });
});

describe('the printed document says what the transmitted one says', () => {
  const PREVIEW = stripComments(
    readFileSync(join(ROOT, 'src/modules/finance/invoice-templates/renderData.ts'), 'utf8'),
  );
  const PDF = stripComments(
    readFileSync(join(ROOT, 'supabase/functions/finance-invoice-pdf/index.ts'), 'utf8'),
  );

  it.each([['HTML preview', () => PREVIEW], ['PDF', () => PDF]])(
    '%s heads the document with the supplier, not with us',
    (_label, src) => {
      expect(src()).toContain('self_billed_supplier_company_id');
      expect(src()).toContain('selfBillSupplier');
    },
  );

  it.each([['HTML preview', () => PREVIEW], ['PDF', () => PDF]])(
    '%s states the supplier identity is missing rather than falling back to ours',
    (_label, src) => {
      expect(src()).toContain('selfBilledSupplierUnavailable');
    },
  );

  /**
   * We are the PAYER on a self-billed document. Printing our IBANs, our Revtag or the hosted
   * /pay link invites the supplier to settle their own invoice into our account — money moving
   * the wrong way on a page that otherwise reads perfectly.
   */
  it('PDF prints no bank details, RF code or pay link on a self-billed document', () => {
    expect(PDF).toMatch(/const accounts: any\[\] = \(!selfBilledId &&/);
    expect(PDF).toMatch(/if \(rfCode && !selfBilledId\)/);
    expect(PDF).toMatch(/if \(payUrl && !selfBilledId\)/);
  });

  it('HTML preview does the same, so the two cannot disagree', () => {
    expect(PREVIEW).toMatch(/selfBilledId \? \[\] : \(bankAccounts \?\? \[\]\)/);
    expect(PREVIEW).toMatch(/payUrl: selfBilledId \? null/);
  });

  it('offers the note in both languages — an English default must not print a Greek-only label', () => {
    const labels = readFileSync(join(ROOT, 'src/modules/finance/invoice-templates/labels.ts'), 'utf8');
    for (const key of ['selfBilled', 'selfBilledBy', 'selfBilledSupplierUnavailable']) {
      expect(labels.split(`${key}:`).length - 1).toBe(2);
    }
  });
});
