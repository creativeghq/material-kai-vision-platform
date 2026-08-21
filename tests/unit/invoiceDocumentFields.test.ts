/**
 * What a fiscal document has to SHOW.
 *
 * Every gap this pins was the same shape: the figure was stored, it was transmitted to myDATA,
 * and it was simply never printed — so the customer's copy was missing information the envelope
 * carried, and nothing could raise. A missing column is not a type error, an unprinted exemption
 * ground is not a failed constraint, and a document addressed to last month's version of a
 * customer is a perfectly valid PDF.
 *
 * These are contract tests on `buildInvoiceRenderData`, which both renderers draw from — the
 * React preview directly, the pdf-lib generator through the same field set. They fail if a
 * field stops reaching the page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { InvoiceDocument } from '@/modules/finance/components/InvoiceDocument';
import { getTemplateSpec, resolveColors, INVOICE_LABELS } from '@/modules/finance/invoice-templates';
import { buildInvoiceRenderData } from '@/modules/finance/invoice-templates/renderData';
import {
  resolvePrintedCounterparty,
  applyAddressUnit,
} from '@/modules/finance/invoice-templates/counterparty';
import { round2 } from '@/utils/decimal';

const SETTINGS = {
  business_name: 'Kai Materials A.E.',
  business_vat: '090000045',
  business_tax_office: 'ΦΑΕ ΑΘΗΝΩΝ',
  base_currency: 'EUR',
};

const LIVE_CUSTOMER = {
  name: 'Papadopoulos Constructions',
  vat_number: '111222333',
  tax_office: 'Α ΘΕΣΣΑΛΟΝΙΚΗΣ',
  street: 'Tsimiski',
  street_number: '14',
  postal_code: '54622',
  city: 'Thessaloniki',
  profession: 'Construction',
};

function build(invoice: Record<string, unknown>, items: Record<string, unknown>[], extra = {}) {
  return buildInvoiceRenderData({
    invoice: { currency: 'EUR', doc_language: 'en', ...invoice },
    items,
    settings: SETTINGS,
    customer: LIVE_CUSTOMER,
    ...extra,
  });
}

describe('invoice line columns — every stored myDATA figure reaches the page', () => {
  it('a line discount is carried onto the document', () => {
    // Without this the customer reads "2 × 100.00 → Net 150.00": arithmetic that does not work,
    // made of numbers that are individually valid. `discounted_price` on an INVOICE line is a
    // discount AMOUNT — on a QUOTE line the same column name means a discounted unit price.
    const data = build({}, [
      { description: 'Tiles', quantity: 2, unit_price: 100, discounted_price: 50, net_value: 150, vat_percent: 24 },
    ]);
    expect(data.items[0].discount).toBe(50);
    expect(data.items[0].qty * data.items[0].unitPrice - data.items[0].discount).toBe(data.items[0].net);
  });

  it('per-line VAT and other taxes are carried, and the line total includes them', () => {
    const data = build({}, [
      { description: 'Supply', quantity: 1, unit_price: 100, net_value: 100, vat_percent: 24, vat_amount: 24, other_taxes_amount: 7.47 },
    ]);
    expect(data.items[0].vatAmount).toBe(24);
    expect(data.items[0].otherTaxes).toBe(7.47);
    expect(data.items[0].lineTotal).toBe(131.47);
  });

  it('a 0%-VAT line cites its legal exemption ground, deduplicated across lines', () => {
    const data = build({}, [
      { description: 'Export A', quantity: 1, unit_price: 100, net_value: 100, vat_percent: 0, vat_exemption_category: 8 },
      { description: 'Export B', quantity: 1, unit_price: 50, net_value: 50, vat_percent: 0, vat_exemption_category: 8 },
      { description: 'Reverse charge', quantity: 1, unit_price: 30, net_value: 30, vat_percent: 0, vat_exemption_category: 16 },
    ]);
    expect(data.vatExemptions).toHaveLength(2);
    expect(data.vatExemptions[0]).toMatchObject({ marker: '(1)', code: 8 });
    expect(data.vatExemptions[1]).toMatchObject({ marker: '(2)', code: 16 });
    // The ground itself, not just the code — the code means nothing to a reader.
    expect(data.vatExemptions[0].label).toMatch(/art\. 24/);
    expect(data.items.map((i) => i.exemptionCode)).toEqual([8, 8, 16]);
  });

  it('a Greek document cites the exemption ground in Greek', () => {
    // The ground is a legal statement on the παραστατικό, not a UI string.
    const data = build({ doc_language: 'el' }, [
      { description: 'Εξαγωγή', quantity: 1, unit_price: 100, net_value: 100, vat_percent: 0, vat_exemption_category: 16 },
    ]);
    expect(data.vatExemptions[0].label).toContain('Χωρίς ΦΠΑ');
    expect(data.vatExemptions[0].label).toContain('39α');
  });

  it('a VAT-bearing line does NOT invent an exemption ground', () => {
    const data = build({}, [
      { description: 'Tiles', quantity: 1, unit_price: 100, net_value: 100, vat_percent: 24, vat_exemption_category: 8 },
    ]);
    expect(data.items[0].exemptionCode).toBeNull();
    expect(data.vatExemptions).toEqual([]);
  });
});

describe('VAT analysis — the table foots', () => {
  it('the printed VAT total is the sum of the printed rows, not a parallel sum', () => {
    // Rounding N values and rounding their sum are different operations. The table exists so a
    // reader can verify the total; deriving the total from the rows makes a mismatch impossible
    // rather than unlikely. (The pdf-lib generator carried the parallel-sum version until now.)
    const data = build({ cash_discount_pct: 3 }, [
      { description: 'A', quantity: 1, unit_price: 33.33, net_value: 33.33, vat_percent: 24 },
      { description: 'B', quantity: 1, unit_price: 66.67, net_value: 66.67, vat_percent: 13 },
      { description: 'C', quantity: 1, unit_price: 10.01, net_value: 10.01, vat_percent: 24 },
    ]);
    const rowsVat = round2(data.vatAnalysis.reduce((s, v) => s + v.vat, 0));
    const rowsNet = round2(data.vatAnalysis.reduce((s, v) => s + v.net, 0));
    expect(data.totals.totalVat).toBe(rowsVat);
    expect(data.totals.priceAfterDiscount).toBe(rowsNet);
  });

  it("each row's Total Value is its own net + VAT", () => {
    const data = build({}, [
      { description: 'A', quantity: 1, unit_price: 100, net_value: 100, vat_percent: 24 },
      { description: 'B', quantity: 1, unit_price: 100, net_value: 100, vat_percent: 6 },
    ]);
    for (const v of data.vatAnalysis) expect(v.total).toBe(round2(v.net + v.vat));
    // Highest rate first, as a Greek ΑΝΑΛΥΣΗ ΦΠΑ prints it.
    expect(data.vatAnalysis.map((v) => v.pct)).toEqual([24, 6]);
  });
});

describe('who the document is addressed to', () => {
  const SNAPSHOT = {
    name: 'Papadopoulos Constructions S.A.',
    vat_number: '111222333',
    street: 'Tsimiski',
    street_number: '14',
    city: 'Thessaloniki',
  };

  it('the identity frozen at issue wins over the live CRM row', () => {
    // An issued document must keep saying who it was addressed to. Reading the live row means
    // renaming a customer silently rewrites every past PDF.
    const data = build({ counterparty_snapshot: { row: SNAPSHOT } }, []);
    expect(data.customer.name).toBe('Papadopoulos Constructions S.A.');
  });

  it('falls back to the live row when there is no snapshot (drafts, older documents)', () => {
    const data = build({}, []);
    expect(data.customer.name).toBe('Papadopoulos Constructions');
  });

  it('a separate billing identity is what gets printed, as it is what gets transmitted', () => {
    const party = resolvePrintedCounterparty(null, {
      ...LIVE_CUSTOMER,
      billing_name: 'PapaHold Ltd',
      billing_vat: '999888777',
      billing_street: 'Ermou',
      billing_street_number: '2',
      billing_city: 'Athens',
      billing_postal_code: '10563',
    });
    expect(party?.name).toBe('PapaHold Ltd');
    expect(party?.vatNumber).toBe('999888777');
    expect(party?.city).toBe('Athens');
  });

  it('a partial billing identity falls back per field, exactly as the transmission does', () => {
    // `partyFromCrm` prefers each `billing_*` value where present and falls back to the party's
    // own where absent. The printer has to agree with it field for field or the customer's copy
    // and the myDATA envelope name different addresses for the same document.
    const party = resolvePrintedCounterparty(null, { ...LIVE_CUSTOMER, billing_vat: '999888777' });
    expect(party?.vatNumber).toBe('999888777');
    expect(party?.street).toBe('Tsimiski');
    expect(party?.city).toBe('Thessaloniki');
  });

  it('a chosen sub-unit re-addresses delivery and carries its ΑΑΔΕ branch number', () => {
    const data = build({}, [], {
      addressUnit: { name: 'Warehouse', street: 'Monastiriou', street_number: '90', city: 'Thessaloniki', postal_code: '54627', branch_number: 3 },
    });
    expect(data.delivery?.name).toBe('Warehouse');
    expect(data.delivery?.lines.join(' ')).toContain('Monastiriou 90');
    expect(applyAddressUnit(resolvePrintedCounterparty(null, LIVE_CUSTOMER)!, { branch_number: 3 }).branch).toBe(3);
  });

  it('no sub-unit means no delivery panel — not an empty one', () => {
    expect(build({}, []).delivery).toBeNull();
  });
});

describe('document header and fiscal footer', () => {
  const META = (data: ReturnType<typeof build>) =>
    Object.fromEntries(data.meta.map((m) => [m.label, m.value]));

  it('carries the myDATA document-type code, the issue time and the payment method', () => {
    const data = build({
      document_type: '1.1',
      internal_number: 'INV-2026-0042',
      issued_at: '2026-08-20T19:19:57.000Z',
      payment_method_code: 2,
    }, []);
    const meta = META(data);
    expect(meta['Document type']).toBe('1.1');
    expect(meta['Payment method']).toBe('Check');
    expect(meta.Time).toBeTruthy();
    // The date and time come from the same instant, rendered in the operator's locale.
    expect(meta.Date).toBeTruthy();
  });

  it('prints the AADE authentication code beside the MARK', () => {
    const data = build({ fiscal_mark: '400014932167395' }, [], { authCode: '6A4E53BB890855C1FA919DC8702CBE64871992C' });
    expect(data.fiscal?.mark).toBe('400014932167395');
    expect(data.fiscal?.authCode).toBe('6A4E53BB890855C1FA919DC8702CBE64871992C');
  });

  it('prints the conversion rate only on a foreign-currency document', () => {
    expect(build({ currency: 'EUR', exchange_rate: 1 }, []).fx).toBeNull();
    expect(build({ currency: 'USD', exchange_rate: 0.92 }, []).fx).toEqual({ rate: 0.92, base: 'EUR' });
  });
});


describe('document language — English unless the document says Greek', () => {
  const ITEMS = [
    { description: 'Tile', quantity: 1, unit_price: 100, net_value: 100, vat_percent: 24, vat_amount: 24 },
    { description: 'Export', quantity: 1, unit_price: 50, net_value: 50, vat_percent: 0, vat_exemption_category: 16 },
  ];

  // Latin-only parties on purpose. A Greek tax-office name or customer name is DATA and is
  // legitimately Greek whatever language the document is in; only the chrome is under test, so
  // the fixture carries nothing Greek and any Greek glyph in the output is therefore ours.
  const renderTemplate = (templateId: string, lang: 'el' | 'en') => {
    const data = buildInvoiceRenderData({
      invoice: { currency: 'EUR', doc_language: lang, document_type: '1.1', total: 174 },
      items: ITEMS,
      settings: { business_name: 'Kai Materials SA', business_vat: '090000045', base_currency: 'EUR' },
      customer: { name: 'Papadopoulos Ltd', vat_number: '802349569', street: 'Tsimiski', city: 'Thessaloniki' },
    });
    const spec = getTemplateSpec(templateId);
    return renderToStaticMarkup(
      React.createElement(InvoiceDocument, { spec, colors: resolveColors(templateId, null), data }),
    );
  };

  const TEMPLATES = ['classic', 'modern', 'minimal', 'commercial'];

  // Greek belongs in `INVOICE_LABELS.el`, which is reached only when doc_language is 'el'.
  // A glyph written straight into a renderer bypasses that switch entirely and prints on every
  // document in every language — which is exactly what a bare Σ in the VAT-table sum row did.
  it.each(TEMPLATES)('%s: an English document contains no Greek characters at all', (id) => {
    const greek = [...renderTemplate(id, 'en')].filter((c) => c >= '\u0370' && c <= '\u03ff');
    expect(
      greek,
      `The ${id} template leaked Greek glyphs onto an English document: ${JSON.stringify(greek)}. ` +
        'Put the word in INVOICE_LABELS (both languages) and read it through `L`.',
    ).toEqual([]);
  });

  it.each(TEMPLATES)('%s: a Greek document is actually in Greek', (id) => {
    const html = renderTemplate(id, 'el');
    expect(html).toContain('ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ');
    // Including the exemption ground, which is a legal statement and not a UI string.
    expect(html).toContain('Χωρίς ΦΠΑ');
  });
});

describe('label dictionaries — three hand-kept copies', () => {
  it('el and en declare exactly the same keys', () => {
    // A key present in one and missing from the other prints `undefined` on that language's
    // document — a real word in one column and the string "undefined" in the other, with
    // nothing failing. Six labels were added to both by hand for the myDATA column set.
    const el = Object.keys(INVOICE_LABELS.el).sort();
    const en = Object.keys(INVOICE_LABELS.en).sort();
    expect(el, 'INVOICE_LABELS.el is missing keys that en declares').toEqual(en);
  });

  it('the pdf-lib generator carries every label the preview does', () => {
    // supabase/functions/finance-invoice-pdf/index.ts keeps its own copy of the dictionary
    // because it runs on Deno. labels.ts says the two "MUST stay identical"; until now nothing
    // checked, so a label added on one side rendered `undefined` on the other.
    const pdf = readFileSync(
      join(__dirname, '..', '..', 'supabase', 'functions', 'finance-invoice-pdf', 'index.ts'),
      'utf8',
    );
    const missing = Object.keys(INVOICE_LABELS.en).filter((k) => !pdf.includes(`${k}:`));
    expect(
      missing,
      'These labels exist in src/modules/finance/invoice-templates/labels.ts but not in the ' +
        'PDF generator\'s copy, so the PDF prints "undefined" where the preview prints a word.',
    ).toEqual([]);
  });
});
