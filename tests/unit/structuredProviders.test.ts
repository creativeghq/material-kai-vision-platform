import { describe, it, expect } from 'vitest';
import { structuredUrlFor, readEn16931Header } from '../../supabase/functions/_shared/finance/structured-providers.ts';
import { serialiseEn16931Ubl } from '../../supabase/functions/_shared/fiscal/en16931-ubl.ts';

describe('which stored links have a structured twin', () => {
  it('maps an invoiceportal.gr link to its /EN16931 file', () => {
    expect(structuredUrlFor('https://invoiceportal.gr/invoices/2026-DB0F85D4'))
      .toBe('https://invoiceportal.gr/invoices/2026-DB0F85D4/EN16931');
    expect(structuredUrlFor('https://www.invoiceportal.gr/invoices/2026-AB/?x=1'))
      .toBe('https://www.invoiceportal.gr/invoices/2026-AB/EN16931');
  });

  it('maps the other probed providers, subdomains included', () => {
    expect(structuredUrlFor('https://einvoice.impact.gr/p/EL099117147/AA/BB')).toBe('https://einvoice.impact.gr/p/EL099117147/AA/BB/EN16931');
    expect(structuredUrlFor('https://einvoice.s1ecos.gr/p/EL094177099/AA/BB')).toBe('https://einvoice.s1ecos.gr/p/EL094177099/AA/BB/EN16931');
    expect(structuredUrlFor('https://epsilondigital21.epsilonnet.gr/fd/abc:185')).toBe('https://epsilondigital21.epsilonnet.gr/fd/abc:185/EN16931');
    expect(structuredUrlFor('https://vs.gr/iv/invoice/download/a/b')).toBe('https://vs.gr/iv/invoice/download/a/b/EN16931');
    expect(structuredUrlFor('https://srv2.parochos.gr/fd/abc:2')).toBe('https://srv2.parochos.gr/fd/abc:2/EN16931');
    expect(structuredUrlFor('https://www.eskap.gr/invoice/abc')).toBe('https://www.eskap.gr/invoice/abc/EN16931');
  });

  it('names no twin for a provider that answered with only a viewer, or for AADE', () => {
    for (const u of [
      'https://e-invoicing.gr/edocuments/ViewInvoice/-1/abc',
      'https://mydatapi.aade.gr/x',
    ]) expect(structuredUrlFor(u), u).toBeNull();
  });

  it('refuses a non-https link, a look-alike host and junk', () => {
    expect(structuredUrlFor('http://invoiceportal.gr/invoices/1')).toBeNull();
    expect(structuredUrlFor('https://invoiceportal.gr.evil.example/invoices/1')).toBeNull();
    expect(structuredUrlFor('https://notvs.gr/iv/1')).toBeNull();
    expect(structuredUrlFor('https://evilepsilonnet.gr/fd/1')).toBeNull();
    expect(structuredUrlFor('https://evil.example/invoiceportal.gr/invoices/1')).toBeNull();
    expect(structuredUrlFor('not a url')).toBeNull();
    expect(structuredUrlFor(null)).toBeNull();
  });
});

describe('what counts as an EN 16931 document', () => {
  const real = '<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" '
    + 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
    + '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID></Invoice>';

  it('recognises an invoice and a credit note by root and customization id', () => {
    expect(readEn16931Header(real)).toEqual({ kind: 'invoice', customizationId: expect.stringMatching(/^urn:cen\.eu:en16931:2017/) });
    expect(readEn16931Header(real.replaceAll('Invoice', 'CreditNote'))?.kind).toBe('credit_note');
  });

  it('does not accept an HTML page, an error body or a different customization', () => {
    expect(readEn16931Header('<html><body>EN16931 UBL Invoice</body></html>')).toBeNull();
    expect(readEn16931Header('{"error":"not found"}')).toBeNull();
    expect(readEn16931Header(real.replace('urn:cen.eu:en16931:2017', 'urn:other'))).toBeNull();
    expect(readEn16931Header('<Invoice xmlns:cbc="x"></Invoice>')).toBeNull();
  });

  it('accepts the documents we write ourselves', () => {
    const r = serialiseEn16931Ubl({
      issuer: { vatNumber: '094177099', country: 'GR', branch: 0, name: 'S' },
      counterpart: { vatNumber: '099117147', country: 'GR', branch: 0, name: 'B' },
      header: { series: 'A', aa: '1', issueDate: '2026-10-30', invoiceType: '1.1', currency: 'EUR' },
      lines: [{ lineNumber: 1, description: 'x', quantity: 1, unitPrice: 10, netValue: 10, vatCategory: 1, vatPercent: 24, vatAmount: 2.4 }],
      summary: { totalNetValue: 10, totalVatAmount: 2.4, totalGrossValue: 12.4 },
    });
    expect(r.ok && readEn16931Header(r.xml)?.kind).toBe('invoice');
  });
});
