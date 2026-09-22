// A provider may only carry 1.1-11.5, so this goes straight to myDATA. ORDER is load-bearing.

export interface ExpenseParty {
  vatNumber: string;
  country: string;
  branch: number;
  name?: string;
}

export interface ExpenseLine {
  lineNumber: number;
  netValue: number;
  vatCategory: number;
  vatAmount: number;
  vatExemptionCategory?: number;
  classificationType?: string;
  classificationCategory: string;
  itemDescr?: string;
}

export interface ExpenseEnvelopeInput {
  invoiceType: string;
  series: string;
  aa: string;
  issueDate: string;
  currency?: string;
  issuer: ExpenseParty;
  counterpart?: ExpenseParty;
  lines: ExpenseLine[];
}

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

function party(tag: string, p: ExpenseParty): string {
  return [
    `<${tag}>`,
    `<vatNumber>${esc(p.vatNumber)}</vatNumber>`,
    `<country>${esc(p.country)}</country>`,
    `<branch>${Number(p.branch) || 0}</branch>`,
    p.name ? `<name>${esc(p.name)}</name>` : '',
    `</${tag}>`,
  ].join('');
}

function row(l: ExpenseLine): string {
  return [
    '<invoiceDetails>',
    `<lineNumber>${l.lineNumber}</lineNumber>`,
    l.itemDescr ? `<itemDescr>${esc(l.itemDescr)}</itemDescr>` : '',
    `<netValue>${money(l.netValue)}</netValue>`,
    `<vatCategory>${l.vatCategory}</vatCategory>`,
    `<vatAmount>${money(l.vatAmount)}</vatAmount>`,
    l.vatExemptionCategory ? `<vatExemptionCategory>${l.vatExemptionCategory}</vatExemptionCategory>` : '',
    '<expensesClassification>',
    l.classificationType ? `<ecls:classificationType>${esc(l.classificationType)}</ecls:classificationType>` : '',
    `<ecls:classificationCategory>${esc(l.classificationCategory)}</ecls:classificationCategory>`,
    `<ecls:amount>${money(l.netValue)}</ecls:amount>`,
    '</expensesClassification>',
    '</invoiceDetails>',
  ].join('');
}

export function expenseEnvelopeProblems(input: ExpenseEnvelopeInput): string[] {
  const problems: string[] = [];
  if (!/^\d{2}\.\d{1,2}$/.test(input.invoiceType)) {
    problems.push(`invoiceType "${input.invoiceType}" is not an expense-side myDATA type`);
  }
  if (!input.lines.length) problems.push('a document with no lines states nothing');
  for (const l of input.lines) {
    if (l.vatCategory === 7 && !l.vatExemptionCategory) {
      problems.push(`line ${l.lineNumber} is 0% VAT and states no exemption article`);
    }
    if (!l.classificationCategory) {
      problems.push(`line ${l.lineNumber} has no expense classification category`);
    }
  }
  if (!input.issuer?.vatNumber) problems.push('the issuer has no VAT number');
  return problems;
}

export function buildExpenseEnvelope(input: ExpenseEnvelopeInput): string {
  const net = input.lines.reduce((s, l) => s + l.netValue, 0);
  const vat = input.lines.reduce((s, l) => s + l.vatAmount, 0);
  const byCategory = new Map<string, { type?: string; category: string; amount: number }>();
  for (const l of input.lines) {
    const key = `${l.classificationType ?? ''}|${l.classificationCategory}`;
    const at = byCategory.get(key)
      ?? { type: l.classificationType, category: l.classificationCategory, amount: 0 };
    at.amount += l.netValue;
    byCategory.set(key, at);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"',
    ' xmlns:ecls="https://www.aade.gr/myDATA/expensesClassificaton/v1.0"',
    ' xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0">',
    '<invoice>',
    party('issuer', input.issuer),
    input.counterpart ? party('counterpart', input.counterpart) : '',
    '<invoiceHeader>',
    `<series>${esc(input.series)}</series>`,
    `<aa>${esc(input.aa)}</aa>`,
    `<issueDate>${esc(input.issueDate)}</issueDate>`,
    `<invoiceType>${esc(input.invoiceType)}</invoiceType>`,
    `<currency>${esc(input.currency ?? 'EUR')}</currency>`,
    '</invoiceHeader>',
    ...input.lines.map(row),
    '<invoiceSummary>',
    `<totalNetValue>${money(net)}</totalNetValue>`,
    `<totalVatAmount>${money(vat)}</totalVatAmount>`,
    '<totalWithheldAmount>0.00</totalWithheldAmount>',
    '<totalFeesAmount>0.00</totalFeesAmount>',
    '<totalStampDutyAmount>0.00</totalStampDutyAmount>',
    '<totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>',
    '<totalDeductionsAmount>0.00</totalDeductionsAmount>',
    `<totalGrossValue>${money(net + vat)}</totalGrossValue>`,
    ...[...byCategory.values()].map((v) => [
      '<expensesClassification>',
      v.type ? `<ecls:classificationType>${esc(v.type)}</ecls:classificationType>` : '',
      `<ecls:classificationCategory>${esc(v.category)}</ecls:classificationCategory>`,
      `<ecls:amount>${money(v.amount)}</ecls:amount>`,
      '</expensesClassification>',
    ].join('')),
    '</invoiceSummary>',
    '</invoice>',
    '</InvoicesDoc>',
  ].join('');
}

export interface SendOutcome {
  ok: boolean;
  mark?: string;
  uid?: string;
  authenticationCode?: string;
  errors: string[];
  status: number;
  raw: string;
}

export function parseSendResponse(status: number, body: string): SendOutcome {
  const one = (tag: string) => body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))?.[1];
  const errors = [...body.matchAll(/<message>([^<]*)<\/message>/gi)].map((m) => m[1]);
  const codes = [...body.matchAll(/<code>([^<]*)<\/code>/gi)].map((m) => m[1]);
  const mark = one('mark');
  const ok = status >= 200 && status < 300 && !!mark && errors.length === 0;
  return {
    ok,
    mark: mark ?? undefined,
    uid: one('invoiceUid') ?? one('uid') ?? undefined,
    authenticationCode: one('authenticationCode') ?? undefined,
    errors: errors.length ? errors.map((m, i) => (codes[i] ? `${codes[i]}: ${m}` : m))
      : (ok ? [] : [`myDATA answered ${status} with no MARK`]),
    status,
    raw: body,
  };
}
