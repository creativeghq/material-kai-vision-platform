export interface ParsedEn16931Line {
  quantity: number | null;
  unitCode: string | null;
  name: string;
  net: number | null;
  unitPrice: number | null;
  vatPercent: number | null;
  vatCategory: string | null;
}

export interface ParsedEn16931 {
  kind: 'invoice' | 'credit_note';
  number: string | null;
  issueDate: string | null;
  currency: string | null;
  mark: string | null;
  authenticationCode: string | null;
  supplier: { vat: string | null; name: string | null; country: string | null };
  customer: { vat: string | null; name: string | null };
  paymentMeansCode: string | null;
  ibans: string[];
  totals: { net: number | null; vat: number | null; gross: number | null; payable: number | null };
  lines: ParsedEn16931Line[];
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&').trim();

const tagRe = (tag: string) => new RegExp(`<(?:[\\w-]+:)?${tag}\\b([^>]*)>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'g');

function blocks(xml: string, tag: string): { attrs: string; body: string }[] {
  return [...xml.matchAll(tagRe(tag))].map((m) => ({ attrs: m[1], body: m[2] }));
}

function first(xml: string, tag: string): string | null {
  const m = tagRe(tag).exec(xml);
  if (!m) return null;
  const v = decode(m[2]);
  return v === '' ? null : v;
}

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const stripEl = (v: string | null) => (v ? v.replace(/^EL/i, '') : null);

function refByDescription(xml: string, description: string): string | null {
  for (const b of blocks(xml, 'AdditionalDocumentReference')) {
    if (first(b.body, 'DocumentDescription') === description) return first(b.body, 'ID');
  }
  return null;
}

export function parseEn16931(xml: string): ParsedEn16931 | null {
  const root = /<(?:[\w-]+:)?(Invoice|CreditNote)\b/.exec(xml);
  if (!root) return null;
  const kind = root[1] === 'CreditNote' ? 'credit_note' : 'invoice';
  const lineTag = kind === 'invoice' ? 'InvoiceLine' : 'CreditNoteLine';
  const qtyTag = kind === 'invoice' ? 'InvoicedQuantity' : 'CreditedQuantity';

  const headerEnd = xml.search(new RegExp(`<(?:[\\w-]+:)?${lineTag}\\b`));
  const header = headerEnd === -1 ? xml : xml.slice(0, headerEnd);
  const supplier = blocks(header, 'AccountingSupplierParty')[0]?.body ?? '';
  const customer = blocks(header, 'AccountingCustomerParty')[0]?.body ?? '';
  const monetary = blocks(header, 'LegalMonetaryTotal')[0]?.body ?? '';
  const vatTotal = blocks(header, 'TaxTotal')[0]?.body ?? '';

  const lines = blocks(xml, lineTag).map((l): ParsedEn16931Line => {
    const item = blocks(l.body, 'Item')[0]?.body ?? '';
    const tax = blocks(item, 'ClassifiedTaxCategory')[0]?.body ?? '';
    return {
      quantity: num(first(l.body, qtyTag)),
      unitCode: /unitCode="([^"]*)"/.exec(blocks(l.body, qtyTag)[0]?.attrs ?? '')?.[1] ?? null,
      name: first(item, 'Name') ?? '',
      net: num(first(l.body.replace(item, ''), 'LineExtensionAmount')),
      unitPrice: num(first(blocks(l.body, 'Price')[0]?.body ?? '', 'PriceAmount')),
      vatPercent: num(first(tax, 'Percent')),
      vatCategory: first(tax, 'ID'),
    };
  });

  const ibans = [...new Set(blocks(header, 'PayeeFinancialAccount').map((b) => first(b.body, 'ID')).filter((v): v is string => !!v))];

  return {
    kind,
    number: first(header.replace(supplier, '').replace(customer, ''), 'ID'),
    issueDate: first(header, 'IssueDate'),
    currency: first(header, 'DocumentCurrencyCode'),
    mark: refByDescription(header, '##M.AR.K##'),
    authenticationCode: refByDescription(header, '##AUTHCODE##'),
    supplier: {
      vat: stripEl(first(blocks(supplier, 'PartyTaxScheme')[0]?.body ?? '', 'CompanyID')),
      name: first(blocks(supplier, 'PartyLegalEntity')[0]?.body ?? '', 'RegistrationName') ?? first(supplier, 'Name'),
      country: first(blocks(supplier, 'Country')[0]?.body ?? '', 'IdentificationCode'),
    },
    customer: {
      vat: stripEl(first(blocks(customer, 'PartyTaxScheme')[0]?.body ?? '', 'CompanyID')),
      name: first(blocks(customer, 'PartyLegalEntity')[0]?.body ?? '', 'RegistrationName') ?? first(customer, 'Name'),
    },
    paymentMeansCode: first(header, 'PaymentMeansCode'),
    ibans,
    totals: {
      net: num(first(monetary, 'TaxExclusiveAmount')),
      vat: num(first(vatTotal, 'TaxAmount')),
      gross: num(first(monetary, 'TaxInclusiveAmount')),
      payable: num(first(monetary, 'PayableAmount')),
    },
    lines,
  };
}

export interface MyDataRowFacts {
  issuer_vat: string | null;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  mark: string | null;
}

export type En16931Check = { verdict: 'agrees' | 'differs'; differences: string[]; rules: number };

const close = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= 0.01;

export function checkAgainstMyData(parsed: ParsedEn16931, row: MyDataRowFacts): En16931Check {
  const differences: string[] = [];
  if (row.issuer_vat && parsed.supplier.vat && stripEl(row.issuer_vat) !== parsed.supplier.vat) differences.push('supplier VAT');
  if (row.total_net !== null && !close(parsed.totals.net, row.total_net)) differences.push('net total');
  if (row.total_vat !== null && !close(parsed.totals.vat, row.total_vat)) differences.push('VAT total');
  if (row.total_gross !== null && !close(parsed.totals.gross, row.total_gross)) differences.push('gross total');
  if (row.mark && parsed.mark && row.mark !== parsed.mark) differences.push('MARK');
  return { verdict: differences.length ? 'differs' : 'agrees', differences, rules: 2 };
}
