/** The VAT return's vocabulary. Import-free: Reports and the return panel share it. */

export interface VatRateRow {
  section: string;
  vat_rate: number | null;
  net: number;
  vat: number;
  doc_count: number;
}

export interface VatExplainTerm { count: number; net: number; vat: number }

export interface VatReturnSnapshot {
  period: { from: string; to: string; months: number; aligned_to_months: boolean };
  ours: {
    rates: VatRateRow[];
    output_vat: number; input_vat: number; payable: number;
    income_net: number; expense_net: number; doc_count: number;
    status: string;
  };
  aade: {
    income_net: number | null; income_vat: number | null; income_docs: number | null;
    expense_net: number | null; expense_vat: number | null; expense_docs: number | null;
    payable: number | null;
    income_status: string; expense_status: string;
  };
  difference: {
    income_net: number | null; expense_net: number | null; payable: number | null;
    income_residual: number | null; expense_residual: number | null;
  };
  explained: {
    unbooked_expenses: VatExplainTerm;
    untransmitted_invoices: VatExplainTerm;
    bills_without_inbound: VatExplainTerm;
    deviations: {
      declared_count: number; declared_amount: number;
      undeclared_count: number; undeclared_amount: number;
    };
  };
  prefill_period_id: string | null;
}

import { aadeVerdict } from '@/modules/finance/pnlStatus';

const RATE = (rate: number | null) => (rate == null ? '—' : `${Number(rate)}%`);

/** One verdict for a figure built from BOTH sides: the side that could not be read decides. */
export function worseAadeStatus(a: string, b: string): string {
  const va = aadeVerdict(a); const vb = aadeVerdict(b);
  if (va.hasFigures !== vb.hasFigures) return va.hasFigures ? b : a;
  if (a === 'partial' || b === 'partial') return 'partial';
  return a;
}

/** The reverse charge is TWO lines because it is two entries: declared, then reclaimed. */
export function vatReturnLineLabel(section: string, rate: number | null): string {
  switch (section) {
    case 'output': return `Sales @ ${RATE(rate)}`;
    case 'output_credit': return 'Less: customer credit notes';
    case 'input': return 'Purchases (supplier bills)';
    case 'input_credit': return 'Less: supplier credit notes';
    case 'reverse_charge_output': return 'Intra-EU acquisitions — VAT self-assessed';
    case 'reverse_charge_input': return 'Intra-EU acquisitions — VAT reclaimed';
    default: return section;
  }
}

const SECTION_ORDER = [
  'output', 'output_credit', 'input', 'input_credit',
  'reverse_charge_output', 'reverse_charge_input',
];

export function sortVatReturnLines(rows: VatRateRow[]): VatRateRow[] {
  return [...rows].sort((a, b) => {
    const s = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
    return s !== 0 ? s : Number(b.vat_rate ?? 0) - Number(a.vat_rate ?? 0);
  });
}

/** A negative VAT liability is money back, not a smaller bill. */
export function vatPayableLabel(payable: number | null | undefined): string {
  if (payable == null) return 'VAT return';
  if (payable > 0) return 'VAT payable';
  if (payable < 0) return 'VAT refundable';
  return 'VAT — nothing due';
}

export interface VatDifferenceLine {
  key: 'unbooked_expenses' | 'untransmitted_invoices' | 'bills_without_inbound' | 'deviations';
  label: string;
  detail: string;
  count: number;
  net: number | null;
  explains: 'income' | 'expense' | null;
}

/** The named causes of a difference. An empty term is dropped; the residual says what is left. */
export function vatDifferenceLines(snap: VatReturnSnapshot): VatDifferenceLine[] {
  const e = snap.explained;
  const out: VatDifferenceLine[] = [];
  if (e.unbooked_expenses.count > 0) {
    out.push({
      key: 'unbooked_expenses',
      label: 'Received documents nobody has booked',
      detail: 'ΑΑΔΕ counts these as your purchases. Until they become supplier bills they are in their figure and not in yours.',
      count: e.unbooked_expenses.count, net: e.unbooked_expenses.net, explains: 'expense',
    });
  }
  if (e.untransmitted_invoices.count > 0) {
    out.push({
      key: 'untransmitted_invoices',
      label: 'Issued invoices with no MARK',
      detail: 'In your books and not at ΑΑΔΕ — either not transmitted yet, or the transmission failed.',
      count: e.untransmitted_invoices.count, net: e.untransmitted_invoices.net, explains: 'income',
    });
  }
  if (e.bills_without_inbound.count > 0) {
    out.push({
      key: 'bills_without_inbound',
      label: 'Supplier bills entered by hand',
      detail: 'Booked here without a document arriving from ΑΑΔΕ. Whether they are in their book too is not something this can answer — it is listed, not subtracted.',
      count: e.bills_without_inbound.count, net: e.bills_without_inbound.net, explains: null,
    });
  }
  const devCount = e.deviations.declared_count + e.deviations.undeclared_count;
  if (devCount > 0) {
    out.push({
      key: 'deviations',
      label: 'Deviations recorded for this period',
      detail: e.deviations.undeclared_count > 0
        ? `${e.deviations.undeclared_count} of them have not been transmitted. The escape hatch is an emitted document, not a note.`
        : 'All of them carry a MARK.',
      count: devCount,
      net: e.deviations.declared_amount + e.deviations.undeclared_amount,
      explains: null,
    });
  }
  return out;
}

/** A residual small enough to be rounding, rather than a document nobody has found. */
export const RESIDUAL_EPSILON = 0.5;

export function residualVerdict(residual: number | null | undefined): {
  tone: 'ok' | 'warn' | 'unknown'; text: string;
} {
  if (residual == null) {
    return { tone: 'unknown', text: 'There is no ΑΑΔΕ figure to compare against, so nothing here is explained or unexplained.' };
  }
  if (Math.abs(residual) <= RESIDUAL_EPSILON) {
    return { tone: 'ok', text: 'The difference is fully accounted for by the documents listed above.' };
  }
  return {
    tone: 'warn',
    text: residual > 0
      ? 'That much of the difference is not explained by anything listed above — your books hold value ΑΑΔΕ does not.'
      : 'That much of the difference is not explained by anything listed above — ΑΑΔΕ holds value your books do not.',
  };
}

/** Whole months only: ΑΑΔΕ's book is monthly, and a part-month has no counterpart in it. */
export function vatPeriodPresets(today: Date): Array<{ key: string; label: string; from: string; to: string }> {
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const monthEnd = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const y = today.getFullYear();
  const m = today.getMonth();

  const month = (offset: number) => {
    const d = new Date(y, m + offset, 1);
    return {
      from: iso(d.getFullYear(), d.getMonth(), 1),
      to: iso(d.getFullYear(), d.getMonth(), monthEnd(d.getFullYear(), d.getMonth())),
    };
  };
  const quarter = (offset: number) => {
    const startMonth = Math.floor(m / 3) * 3 + offset * 3;
    const s = new Date(y, startMonth, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 2, 1);
    return {
      from: iso(s.getFullYear(), s.getMonth(), 1),
      to: iso(e.getFullYear(), e.getMonth(), monthEnd(e.getFullYear(), e.getMonth())),
    };
  };

  return [
    { key: 'this_quarter', label: 'This quarter', ...quarter(0) },
    { key: 'last_quarter', label: 'Last quarter', ...quarter(-1) },
    { key: 'this_month', label: 'This month', ...month(0) },
    { key: 'last_month', label: 'Last month', ...month(-1) },
    { key: 'this_year', label: `This year (${y})`, from: iso(y, 0, 1), to: iso(y, 11, 31) },
    { key: 'last_year', label: `Last year (${y - 1})`, from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) },
  ];
}
