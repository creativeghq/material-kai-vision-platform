import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { serialiseEn16931Ubl } from '../../supabase/functions/_shared/fiscal/en16931-ubl.ts';
import type { FiscalInvoiceInput, FiscalLine } from '../../supabase/functions/_shared/fiscal/types.ts';

const line = (over: Partial<FiscalLine> = {}): FiscalLine => ({
  lineNumber: 1, description: 'Porcelain tile 60x60', quantity: 10, unitPrice: 20,
  netValue: 200, vatCategory: 1, vatPercent: 24, vatAmount: 48, ...over,
});

const doc = (over: Partial<FiscalInvoiceInput> = {}, lines: FiscalLine[] = [line()]): FiscalInvoiceInput => {
  const net = lines.reduce((s, l) => s + l.netValue, 0);
  const vat = lines.reduce((s, l) => s + l.vatAmount, 0);
  return {
    issuer: { vatNumber: '094177099', country: 'GR', branch: 0, name: 'Seller SA', address: { street: 'Ermou', number: '1', city: 'Athens', postalCode: '10563' } },
    counterpart: { vatNumber: '099117147', country: 'GR', branch: 0, name: 'Buyer & Sons <Ltd>', address: { city: 'Thessaloniki' } },
    header: { series: 'A', aa: '17', issueDate: '2026-10-30', invoiceType: '1.1', currency: 'EUR' },
    lines,
    summary: { totalNetValue: net, totalVatAmount: vat, totalGrossValue: net + vat },
    ...over,
  };
};

const ok = (d: FiscalInvoiceInput) => {
  const r = serialiseEn16931Ubl(d);
  if (!r.ok) throw new Error(`refused: ${r.refusals.join('; ')}`);
  return r;
};

describe('EN 16931 UBL is a serialisation of the derivation', () => {
  it('writes well-formed UBL 2.1 carrying the EN 16931 customization id', () => {
    const r = ok(doc());
    const dom = new JSDOM(r.xml, { contentType: 'application/xml' });
    expect(dom.window.document.documentElement.localName).toBe('Invoice');
    expect(r.xml).toContain('<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>');
    expect(r.xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(r.fileName).toBe('A-17-en16931.xml');
  });

  it('states the stored figures and recomputes none of them', () => {
    const r = ok(doc());
    expect(r.xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">200.00</cbc:TaxExclusiveAmount>');
    expect(r.xml).toContain('<cbc:TaxAmount currencyID="EUR">48.00</cbc:TaxAmount>');
    expect(r.xml).toContain('<cbc:PayableAmount currencyID="EUR">248.00</cbc:PayableAmount>');
    expect(r.warnings).toEqual([]);
  });

  it('puts Greece in the VAT identifier as EL and in the country element as GR', () => {
    const r = ok(doc());
    expect(r.xml).toContain('<cbc:CompanyID>EL094177099</cbc:CompanyID>');
    expect(r.xml).toContain('<cbc:IdentificationCode>GR</cbc:IdentificationCode>');
  });

  it('escapes markup in party and item names', () => {
    const r = ok(doc());
    expect(r.xml).toContain('Buyer &amp; Sons &lt;Ltd&gt;');
  });

  it('writes a credit note as a CreditNote document with credited quantities', () => {
    const d = doc();
    d.header.invoiceType = '5.1';
    const r = ok(d);
    expect(r.kind).toBe('credit_note');
    expect(new JSDOM(r.xml, { contentType: 'application/xml' }).window.document.documentElement.localName).toBe('CreditNote');
    expect(r.xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(r.xml).toContain('<cbc:CreditedQuantity unitCode="C62">10</cbc:CreditedQuantity>');
    expect(r.xml).not.toContain('InvoicedQuantity');
  });

  it('carries a per-line discount as a line allowance, with the net after it', () => {
    const r = ok(doc({}, [line({ unitPrice: 20, quantity: 10, discountValue: 20, netValue: 180, vatAmount: 43.2 })]));
    expect(r.xml).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
    expect(r.xml).toContain('<cbc:LineExtensionAmount currencyID="EUR">180.00</cbc:LineExtensionAmount>');
  });

  it('cites the exemption ground on a 0% line', () => {
    const r = ok(doc({}, [line({ vatPercent: 0, vatAmount: 0, vatCategory: 7, vatExemptionCategory: 8 })]));
    expect(r.xml).toContain('<cbc:TaxExemptionReason>');
    expect(r.xml).toMatch(/<cac:TaxCategory><cbc:ID>E<\/cbc:ID>/);
  });
});

describe('what EN 16931 cannot say is refused, and drift is reported rather than repaired', () => {
  it('refuses a movement document', () => {
    const d = doc();
    d.header.invoiceType = '9.3';
    const r = serialiseEn16931Ubl(d);
    expect(r.ok).toBe(false);
  });

  it('refuses a line carrying withholding, fees or stamp duty', () => {
    const r = serialiseEn16931Ubl(doc({}, [line({ stampDutyAmount: 1.2 })]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals.join(' ')).toMatch(/stamp duty/);
  });

  it('refuses a buyer with no name and an exemption code outside the table', () => {
    const d = doc();
    d.counterpart.name = undefined;
    expect(serialiseEn16931Ubl(d).ok).toBe(false);
    const e = serialiseEn16931Ubl(doc({}, [line({ vatPercent: 0, vatAmount: 0, vatExemptionCategory: 99 })]));
    expect(e.ok).toBe(false);
  });

  it('refuses a line whose quantity × price is not its net', () => {
    expect(serialiseEn16931Ubl(doc({}, [line({ netValue: 190, vatAmount: 45.6 })])).ok).toBe(false);
  });

  it('keeps the stored VAT and warns when it is a cent off the rule (BR-CO-17)', () => {
    const r = ok(doc({}, [line({ vatAmount: 48.01 })]));
    expect(r.warnings.join(' ')).toContain('BR-CO-17');
    expect(r.xml).toContain('<cbc:TaxAmount currencyID="EUR">48.01</cbc:TaxAmount>');
  });

  it('warns when the stored summary disagrees with the lines', () => {
    const d = doc();
    d.summary.totalGrossValue = 250;
    expect(ok(d).warnings.join(' ')).toMatch(/Gross total/);
  });
});
