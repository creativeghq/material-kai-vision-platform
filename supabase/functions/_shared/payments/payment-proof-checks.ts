/** A transfer receipt vs its order. The model only reads; every comparison lives here (import-free). */

export interface ProofExtraction {
  is_bank_transfer_receipt: boolean;
  transfer_status: 'completed' | 'pending' | 'scheduled' | 'failed' | 'unknown';
  amount: number | null;
  currency: string | null;
  transfer_date: string | null;
  beneficiary_name: string | null;
  beneficiary_iban: string | null;
  payer_name: string | null;
  payer_iban: string | null;
  reference: string | null;
  bank_name: string | null;
  transaction_id: string | null;
  legibility: 'clear' | 'partial' | 'unreadable';
  tamper_signals: string[];
}

export interface ProofOrderFacts {
  internalNumber: string;
  currency: string;
  amountDue: number;
  depositAmount: number | null;
  earliestDate: string | null;
  latestDate: string;
  businessName: string | null;
  accounts: Array<{ id: string; iban: string }>;
}

export type ProofCheckKey = 'amount' | 'currency' | 'beneficiary_iban' | 'beneficiary_name' | 'reference' | 'date' | 'status' | 'tamper';
export type ProofCheckResult = 'ok' | 'warn' | 'fail' | 'missing';

export interface ProofCheck {
  key: ProofCheckKey;
  result: ProofCheckResult;
  detail: string;
}

export type ProofVerdict = 'matches' | 'review' | 'not_a_receipt' | 'unreadable';

export interface ProofComparison {
  verdict: ProofVerdict;
  checks: ProofCheck[];
  amount_kind: 'full' | 'deposit' | 'partial' | 'over' | null;
  bank_account_id: string | null;
}

const PROOF_VERDICTS: readonly ProofVerdict[] = ['matches', 'review', 'not_a_receipt', 'unreadable'];
const STATUSES = ['completed', 'pending', 'scheduled', 'failed', 'unknown'] as const;
const LEGIBILITY = ['clear', 'partial', 'unreadable'] as const;

const cents = (n: number) => Math.round(n * 100);
const iban = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').toUpperCase();
const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export function parseProofExtraction(raw: unknown): ProofExtraction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.is_bank_transfer_receipt !== 'boolean') return null;
  const status = STATUSES.find((s) => s === r.transfer_status) ?? 'unknown';
  const legibility = LEGIBILITY.find((s) => s === r.legibility) ?? 'partial';
  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) ? Math.round(r.amount * 100) / 100 : null;
  const date = typeof r.transfer_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.transfer_date) ? r.transfer_date : null;
  return {
    is_bank_transfer_receipt: r.is_bank_transfer_receipt,
    transfer_status: status,
    amount,
    currency: str(r.currency, 3)?.toUpperCase() ?? null,
    transfer_date: date,
    beneficiary_name: str(r.beneficiary_name),
    beneficiary_iban: str(r.beneficiary_iban, 40) ? iban(r.beneficiary_iban as string) : null,
    payer_name: str(r.payer_name),
    payer_iban: str(r.payer_iban, 40) ? iban(r.payer_iban as string) : null,
    reference: str(r.reference, 300),
    bank_name: str(r.bank_name),
    transaction_id: str(r.transaction_id, 100),
    legibility,
    tamper_signals: Array.isArray(r.tamper_signals)
      ? r.tamper_signals.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim().slice(0, 200)).slice(0, 8)
      : [],
  };
}

export function isProofVerdict(v: unknown): v is ProofVerdict {
  return PROOF_VERDICTS.includes(v as ProofVerdict);
}

export function compareProofToOrder(
  x: ProofExtraction,
  o: ProofOrderFacts,
  normName: (s: string) => string,
): ProofComparison {
  const checks: ProofCheck[] = [];
  let amountKind: ProofComparison['amount_kind'] = null;
  let bankAccountId: string | null = null;

  if (x.amount == null || x.amount <= 0) {
    checks.push({ key: 'amount', result: 'missing', detail: 'No amount could be read.' });
  } else if (cents(x.amount) === cents(o.amountDue)) {
    amountKind = 'full';
    checks.push({ key: 'amount', result: 'ok', detail: 'Equals the amount due.' });
  } else if (o.depositAmount != null && cents(x.amount) === cents(o.depositAmount)) {
    amountKind = 'deposit';
    checks.push({ key: 'amount', result: 'ok', detail: 'Equals the deposit.' });
  } else if (x.amount < o.amountDue) {
    amountKind = 'partial';
    checks.push({ key: 'amount', result: 'warn', detail: 'Less than the amount due.' });
  } else {
    amountKind = 'over';
    checks.push({ key: 'amount', result: 'warn', detail: 'More than the amount due.' });
  }

  if (!x.currency) checks.push({ key: 'currency', result: 'missing', detail: 'No currency shown.' });
  else if (x.currency === o.currency.toUpperCase()) checks.push({ key: 'currency', result: 'ok', detail: x.currency });
  else checks.push({ key: 'currency', result: 'fail', detail: `Paid in ${x.currency}, the order is in ${o.currency}.` });

  if (!x.beneficiary_iban) {
    checks.push({ key: 'beneficiary_iban', result: 'missing', detail: 'No beneficiary IBAN shown.' });
  } else {
    const hit = o.accounts.find((a) => iban(a.iban) === x.beneficiary_iban);
    if (hit) {
      bankAccountId = hit.id;
      checks.push({ key: 'beneficiary_iban', result: 'ok', detail: 'One of your accounts.' });
    } else {
      checks.push({ key: 'beneficiary_iban', result: 'fail', detail: 'Not one of your accounts.' });
    }
  }

  const biz = o.businessName ? normName(o.businessName) : '';
  const ben = x.beneficiary_name ? normName(x.beneficiary_name) : '';
  if (!ben) checks.push({ key: 'beneficiary_name', result: 'missing', detail: 'No beneficiary name shown.' });
  else if (biz.length >= 4 && ben.length >= 4 && (biz.includes(ben) || ben.includes(biz))) {
    checks.push({ key: 'beneficiary_name', result: 'ok', detail: 'Your business name.' });
  } else checks.push({ key: 'beneficiary_name', result: 'warn', detail: 'Differs from your business name.' });

  const num = normName(o.internalNumber);
  const ref = x.reference ? normName(x.reference) : '';
  if (!ref) checks.push({ key: 'reference', result: 'warn', detail: 'No reference shown.' });
  else if (num.length >= 4 && ` ${ref} `.includes(` ${num} `)) checks.push({ key: 'reference', result: 'ok', detail: 'Quotes the order number.' });
  else checks.push({ key: 'reference', result: 'warn', detail: 'Does not quote the order number.' });

  if (!x.transfer_date) checks.push({ key: 'date', result: 'missing', detail: 'No date shown.' });
  else if (o.earliestDate && x.transfer_date < o.earliestDate) checks.push({ key: 'date', result: 'fail', detail: 'Dated before the order was placed.' });
  else if (x.transfer_date > o.latestDate) checks.push({ key: 'date', result: 'warn', detail: 'Dated in the future.' });
  else checks.push({ key: 'date', result: 'ok', detail: x.transfer_date });

  if (x.transfer_status === 'completed') checks.push({ key: 'status', result: 'ok', detail: 'Executed.' });
  else if (x.transfer_status === 'unknown') checks.push({ key: 'status', result: 'warn', detail: 'Does not say it was executed.' });
  else checks.push({ key: 'status', result: 'fail', detail: x.transfer_status === 'failed' ? 'The transfer failed.' : `The transfer is ${x.transfer_status}, not executed.` });

  checks.push(x.tamper_signals.length
    ? { key: 'tamper', result: 'fail', detail: x.tamper_signals.join('; ') }
    : { key: 'tamper', result: 'ok', detail: 'No visible signs of editing.' });

  let verdict: ProofVerdict;
  if (!x.is_bank_transfer_receipt) verdict = 'not_a_receipt';
  else if (x.legibility === 'unreadable' || x.amount == null) verdict = 'unreadable';
  else {
    const byKey = (k: ProofCheckKey) => checks.find((c) => c.key === k)?.result;
    const clean = (amountKind === 'full' || amountKind === 'deposit')
      && byKey('currency') === 'ok'
      && byKey('beneficiary_iban') === 'ok'
      && byKey('status') === 'ok'
      && byKey('date') !== 'fail'
      && byKey('tamper') === 'ok';
    verdict = clean ? 'matches' : 'review';
  }

  return { verdict, checks, amount_kind: amountKind, bank_account_id: bankAccountId };
}
