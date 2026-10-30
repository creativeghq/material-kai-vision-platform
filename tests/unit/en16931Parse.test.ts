import { describe, expect, it } from 'vitest';
import { parseEn16931, checkAgainstMyData } from '../../supabase/functions/_shared/finance/en16931-parse';

const XML = `<Invoice xmlns:cac="x" xmlns:cbc="y" xmlns="z">
  <cbc:ID>084087688|16/09/2026|0|1.1|1ΤΙΜ|15162</cbc:ID>
  <cbc:IssueDate>2026-09-16</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AdditionalDocumentReference><cbc:ID>400015286109842</cbc:ID><cbc:DocumentDescription>##M.AR.K##</cbc:DocumentDescription></cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>EL084087688</cbc:CompanyID></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>A &amp; B SA</cbc:RegistrationName></cac:PartyLegalEntity>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>GR</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>EL802349569</cbc:CompanyID></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>BUYER OE</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>GR1601101250000000012300695</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">36.19</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount>150.78</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>186.97</cbc:TaxInclusiveAmount><cbc:PayableAmount>186.97</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="E48">2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>150.78</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Εμπόρευμα</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>24.00</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>75.39</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const ROW = { issuer_vat: '084087688', total_net: 150.78, total_vat: 36.19, total_gross: 186.97, mark: '400015286109842', line_count: 1 };

describe('parseEn16931', () => {
  const p = parseEn16931(XML)!;

  it('reads the header, parties, MARK and IBAN', () => {
    expect(p.kind).toBe('invoice');
    expect(p.number).toBe('084087688|16/09/2026|0|1.1|1ΤΙΜ|15162');
    expect(p.mark).toBe('400015286109842');
    expect(p.supplier).toEqual({ vat: '084087688', name: 'A & B SA', country: 'GR' });
    expect(p.customer.vat).toBe('802349569');
    expect(p.ibans).toEqual(['GR1601101250000000012300695']);
  });

  it('reads stored totals and the line without recomputing', () => {
    expect(p.totals).toEqual({ net: 150.78, vat: 36.19, gross: 186.97, payable: 186.97 });
    expect(p.lines).toEqual([{ quantity: 2, unitCode: 'E48', name: 'Εμπόρευμα', net: 150.78, unitPrice: 75.39, vatPercent: 24, vatCategory: 'S' }]);
  });

  it('refuses a body that is not an invoice', () => {
    expect(parseEn16931('<html></html>')).toBeNull();
  });

  it('agrees with a matching myDATA row and names each difference otherwise', () => {
    expect(checkAgainstMyData(p, ROW)).toEqual({ verdict: 'agrees', differences: [] });
    const bad = checkAgainstMyData(p, { ...ROW, total_gross: 190, mark: '1', line_count: 3 });
    expect(bad.verdict).toBe('differs');
    expect(bad.differences).toEqual(['gross total', 'MARK', 'line count']);
  });
});
