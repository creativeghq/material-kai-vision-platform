/**
 * EN 16931 UBL 2.1 — a second SERIALISATION of the invoice derivation, never a second builder.
 *
 * It reads a `FiscalInvoiceInput` and recomputes nothing: every amount in the file is a stored
 * figure. What EN 16931 cannot express is REFUSED, and arithmetic that drifts from the rules
 * (BR-CO-*) is reported as a warning beside the file rather than quietly repaired.
 */
import type { FiscalInvoiceInput, FiscalLine, FiscalParty } from './types.ts';
import { MYDATA_PAYMENT_CODE } from '../paymentVocabulary.generated.ts';
import { mydataExemptionLabel } from '../finance/vat-exemptions.ts';

export const EN16931_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017';
const EAS_GREEK_VAT = '9933';
const CENT = 0.01;

export type En16931Result =
  | { ok: true; xml: string; fileName: string; kind: 'invoice' | 'credit_note'; warnings: string[] }
  | { ok: false; refusals: string[] };

const INVOICE_TYPES = new Set(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '11.1', '11.2']);
const CREDIT_NOTE_TYPES = new Set(['5.1', '5.2', '11.4']);

const UNIT_CODE: Record<string, string> = {
  pc: 'C62', piece: 'C62', pieces: 'C62', unit: 'C62', kg: 'KGM', kgs: 'KGM', l: 'LTR', lt: 'LTR',
  m: 'MTR', mtr: 'MTR', m2: 'MTK', 'm²': 'MTK', sqm: 'MTK', m3: 'MTQ', 'm³': 'MTQ', cbm: 'MTQ',
};

const PAYMENT_MEANS_CODE: Record<number, string> = {
  [MYDATA_PAYMENT_CODE.domestic_account]: '30',
  [MYDATA_PAYMENT_CODE.foreign_account]: '30',
  [MYDATA_PAYMENT_CODE.web_banking]: '30',
  [MYDATA_PAYMENT_CODE.iris]: '30',
  [MYDATA_PAYMENT_CODE.cash]: '10',
  [MYDATA_PAYMENT_CODE.cheque]: '20',
  [MYDATA_PAYMENT_CODE.pos]: '48',
  [MYDATA_PAYMENT_CODE.on_credit]: '1',
};

const xmlText = (v: unknown): string =>
  String(v ?? '').replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]);

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const amt = (n: number): string => r2(n).toFixed(2);
const qty = (n: number): string => String(Number(n.toFixed(6)));
const present = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== '';

/** VIES prefix, not ISO: Greece is `EL` in a VAT identifier and `GR` in a country element. */
const vatId = (p: FiscalParty): string => {
  const cc = p.country === 'GR' ? 'EL' : p.country;
  return `${cc}${p.vatNumber}`.replace(/\s/g, '');
};

interface Group { code: 'S' | 'E' | 'Z'; percent: number; exemption?: number; taxable: number; tax: number }

function categoryOf(l: FiscalLine): Pick<Group, 'code' | 'percent' | 'exemption'> {
  if (l.vatPercent > 0) return { code: 'S', percent: l.vatPercent };
  if (l.vatExemptionCategory) return { code: 'E', percent: 0, exemption: l.vatExemptionCategory };
  return { code: 'Z', percent: 0 };
}

function partyXml(tag: string, p: FiscalParty): string {
  const a = p.address;
  const street = [a?.street, a?.number].filter(present).join(' ');
  return `<cac:${tag}><cac:Party>`
    + `<cbc:EndpointID schemeID="${EAS_GREEK_VAT}">${xmlText(vatId(p))}</cbc:EndpointID>`
    + `<cac:PartyName><cbc:Name>${xmlText(p.name)}</cbc:Name></cac:PartyName>`
    + '<cac:PostalAddress>'
    + (street ? `<cbc:StreetName>${xmlText(street)}</cbc:StreetName>` : '')
    + (a?.city ? `<cbc:CityName>${xmlText(a.city)}</cbc:CityName>` : '')
    + (a?.postalCode ? `<cbc:PostalZone>${xmlText(a.postalCode)}</cbc:PostalZone>` : '')
    + `<cac:Country><cbc:IdentificationCode>${xmlText(p.country)}</cbc:IdentificationCode></cac:Country>`
    + '</cac:PostalAddress>'
    + `<cac:PartyTaxScheme><cbc:CompanyID>${xmlText(vatId(p))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
    + `<cac:PartyLegalEntity><cbc:RegistrationName>${xmlText(p.name)}</cbc:RegistrationName></cac:PartyLegalEntity>`
    + '</cac:Party>'
    + `</cac:${tag}>`;
}

function taxCategoryXml(g: Pick<Group, 'code' | 'percent' | 'exemption'>): string {
  return `<cac:TaxCategory><cbc:ID>${g.code}</cbc:ID><cbc:Percent>${qty(g.percent)}</cbc:Percent>`
    + (g.code === 'E'
      ? `<cbc:TaxExemptionReason>${xmlText(mydataExemptionLabel(g.exemption!))}</cbc:TaxExemptionReason>`
      : '')
    + '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>';
}

export function serialiseEn16931Ubl(input: FiscalInvoiceInput): En16931Result {
  const { header, issuer, counterpart, lines } = input;
  const refusals: string[] = [];
  const warnings: string[] = [];

  const isCredit = CREDIT_NOTE_TYPES.has(header.invoiceType);
  if (!isCredit && !INVOICE_TYPES.has(header.invoiceType)) {
    refusals.push(`Document type ${header.invoiceType} has no EN 16931 equivalent (invoices and credit notes only).`);
  }
  if (!present(issuer.name)) refusals.push('The seller has no name (BR-06).');
  if (!present(counterpart.name)) refusals.push('The buyer has no name (BR-07).');
  if (!present(issuer.country) || !present(counterpart.country)) refusals.push('Seller and buyer need a country (BR-09, BR-11).');
  if (lines.length === 0) refusals.push('The document has no lines (BR-16).');
  if (input.taxesTotals?.length) refusals.push('Document-level myDATA taxes have no EN 16931 field in this version.');

  const nonVat = (l: FiscalLine) => [l.withheldAmount, l.feesAmount, l.stampDutyAmount, l.otherTaxesAmount, l.deductionsAmount]
    .some((v) => (v ?? 0) > 0);
  const greekTaxLines = lines.filter(nonVat).map((l) => l.lineNumber);
  if (greekTaxLines.length) {
    refusals.push(`Line(s) ${greekTaxLines.join(', ')} carry withholding, fees, stamp duty or other taxes that EN 16931 cannot express here.`);
  }

  const groups = new Map<string, Group>();
  for (const l of lines) {
    if (!present(l.description)) refusals.push(`Line ${l.lineNumber} has no item name (BR-25).`);
    if (!(l.quantity > 0)) refusals.push(`Line ${l.lineNumber} has a quantity of ${l.quantity}.`);
    const gross = l.netValue + (l.discountValue ?? 0);
    if (Math.abs(l.quantity * l.unitPrice - gross) > CENT) {
      refusals.push(`Line ${l.lineNumber}: quantity × unit price (${amt(l.quantity * l.unitPrice)}) is not net + discount (${amt(gross)}).`);
    }
    const c = categoryOf(l);
    if (c.code === 'E' && !mydataExemptionLabel(c.exemption)) {
      refusals.push(`Line ${l.lineNumber}: exemption category ${c.exemption} is not in the myDATA table (BR-E-10).`);
    }
    const key =`${c.code}|${c.percent}|${c.exemption ?? ''}`;
    const g = groups.get(key) ?? { ...c, taxable: 0, tax: 0 };
    g.taxable += l.netValue;
    g.tax += l.vatAmount;
    groups.set(key, g);
  }
  if (refusals.length) return { ok: false, refusals };

  for (const g of groups.values()) {
    const expected = r2(g.taxable * g.percent / 100);
    if (Math.abs(r2(g.tax) - expected) > 0) {
      warnings.push(`BR-CO-17: ${g.code} ${g.percent}% VAT is ${amt(g.tax)} but taxable ${amt(g.taxable)} × rate is ${amt(expected)}.`);
    }
  }

  const lineNet = r2(lines.reduce((s, l) => s + l.netValue, 0));
  const totalVat = r2([...groups.values()].reduce((s, g) => s + g.tax, 0));
  const inclusive = r2(lineNet + totalVat);
  const s = input.summary;
  if (Math.abs(lineNet - s.totalNetValue) > CENT) warnings.push(`Net total ${amt(lineNet)} differs from the stored summary ${amt(s.totalNetValue)}.`);
  if (Math.abs(totalVat - s.totalVatAmount) > CENT) warnings.push(`VAT total ${amt(totalVat)} differs from the stored summary ${amt(s.totalVatAmount)}.`);
  if (Math.abs(inclusive - s.totalGrossValue) > CENT) warnings.push(`Gross total ${amt(inclusive)} differs from the stored summary ${amt(s.totalGrossValue)}.`);

  const cur = xmlText(header.currency || 'EUR');
  const money = (tag: string, n: number, text = amt(n)) =>
    `<cbc:${tag} currencyID="${cur}">${text}</cbc:${tag}>`;

  const root = isCredit ? 'CreditNote' : 'Invoice';
  const lineTag = isCredit ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = isCredit ? 'CreditedQuantity' : 'InvoicedQuantity';
  const number = `${header.series ?? ''} ${header.aa ?? ''}`.trim();

  const lineXml = lines.map((l) => {
    const c = categoryOf(l);
    const unit = UNIT_CODE[String(l.measurementUnitLabel ?? '').trim().toLowerCase()] ?? 'C62';
    return `<cac:${lineTag}><cbc:ID>${l.lineNumber}</cbc:ID>`
      + `<cbc:${qtyTag} unitCode="${unit}">${qty(l.quantity)}</cbc:${qtyTag}>`
      + money('LineExtensionAmount', l.netValue)
      + ((l.discountValue ?? 0) > 0
        ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>${money('Amount', l.discountValue!)}</cac:AllowanceCharge>`
        : '')
      + '<cac:Item>'
      + `<cbc:Name>${xmlText(l.description)}</cbc:Name>`
      + (present(l.code) ? `<cac:SellersItemIdentification><cbc:ID>${xmlText(l.code)}</cbc:ID></cac:SellersItemIdentification>` : '')
      + (present(l.countryOfOrigin) ? `<cac:OriginCountry><cbc:IdentificationCode>${xmlText(l.countryOfOrigin)}</cbc:IdentificationCode></cac:OriginCountry>` : '')
      + (present(l.commodityCode) ? `<cac:CommodityClassification><cbc:ItemClassificationCode listID="HS">${xmlText(l.commodityCode)}</cbc:ItemClassificationCode></cac:CommodityClassification>` : '')
      + `<cac:ClassifiedTaxCategory><cbc:ID>${c.code}</cbc:ID><cbc:Percent>${qty(c.percent)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>`
      + '</cac:Item>'
      + `<cac:Price>${money('PriceAmount', l.unitPrice, qty(l.unitPrice))}</cac:Price>`
      + `</cac:${lineTag}>`;
  }).join('');

  const means = (input.paymentMethods ?? []).find((p) => PAYMENT_MEANS_CODE[p.type]);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>'
    + `<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`
    + `<cbc:CustomizationID>${EN16931_CUSTOMIZATION_ID}</cbc:CustomizationID>`
    + `<cbc:ID>${xmlText(number)}</cbc:ID>`
    + `<cbc:IssueDate>${xmlText(header.issueDate)}</cbc:IssueDate>`
    + `<cbc:${root}TypeCode>${isCredit ? '381' : '380'}</cbc:${root}TypeCode>`
    + (present(input.documentComments) ? `<cbc:Note>${xmlText(input.documentComments)}</cbc:Note>` : '')
    + `<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`
    + partyXml('AccountingSupplierParty', issuer)
    + partyXml('AccountingCustomerParty', counterpart)
    + (means ? `<cac:PaymentMeans><cbc:PaymentMeansCode>${PAYMENT_MEANS_CODE[means.type]}</cbc:PaymentMeansCode></cac:PaymentMeans>` : '')
    + `<cac:TaxTotal>${money('TaxAmount', totalVat)}`
    + [...groups.values()].map((g) =>
      `<cac:TaxSubtotal>${money('TaxableAmount', g.taxable)}${money('TaxAmount', g.tax)}${taxCategoryXml(g)}</cac:TaxSubtotal>`).join('')
    + '</cac:TaxTotal>'
    + '<cac:LegalMonetaryTotal>'
    + money('LineExtensionAmount', lineNet) + money('TaxExclusiveAmount', lineNet)
    + money('TaxInclusiveAmount', inclusive) + money('PayableAmount', inclusive)
    + '</cac:LegalMonetaryTotal>'
    + lineXml
    + `</${root}>`;

  return {
    ok: true, xml, kind: isCredit ? 'credit_note' : 'invoice', warnings,
    fileName: `${number.replace(/[^A-Za-z0-9._-]+/g, '-') || 'document'}-en16931.xml`,
  };
}
