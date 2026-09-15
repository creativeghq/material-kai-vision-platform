/**
 * Sample loans and display stock, with no I/O (#427).
 *
 * IMPORT-FREE on purpose. TilesPOS states the rule better than any ERP does: "A borrowed sample
 * with a follow-up date is a warm lead. A borrowed sample nobody wrote down is just missing
 * inventory." Three fields carry it — who took them, what they took, and when they are due back.
 */

export type LoanStatus = 'out' | 'returned' | 'converted' | 'written_off';

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  out: 'Out with the customer',
  returned: 'Returned',
  converted: 'Turned into an order',
  written_off: 'Written off',
};

export interface SampleLoanRow {
  id: string;
  borrower_name: string | null;
  company_id: string | null;
  loaned_on: string;
  due_back_on: string | null;
  returned_on: string | null;
  status: LoanStatus;
  converted_order_id: string | null;
  notes: string | null;
}

export interface LoanPosition {
  status: 'ok' | 'overdue' | 'none';
  out?: number;
  overdue?: number;
  undated?: number;
  converted?: number;
  written_off?: number;
  total?: number;
  /** NULL when no loan has finished yet — not a zero conversion rate. */
  conversion_rate?: number | null;
  reason: string;
}

/**
 * Is this loan chaseable at all?
 *
 * A loan with no due date can never be overdue, which is NOT the same as being on time — and it
 * is the state a sample quietly disappears in.
 */
export function loanIsUnchaseable(l: SampleLoanRow): boolean {
  return l.status === 'out' && l.due_back_on == null;
}

/**
 * Out past its date, on the OPERATOR's calendar.
 *
 * Comparing UTC midnight against `now` made a loan due today read "Overdue since ..." from local
 * midnight onwards — a full day early, and the showroom chases a customer who still has until
 * close of business.
 */
export function loanIsOverdue(l: SampleLoanRow, todayIso: string): boolean {
  if (l.status !== 'out' || !l.due_back_on) return false;
  return todayIso > l.due_back_on;
}

/**
 * Has the loan finished, one way or the other?
 *
 * The conversion rate divides by these, not by every loan — counting live loans as failures
 * understates it while they are still perfectly capable of converting. A RETURNED sample is
 * finished and did not convert: leaving it out made one conversion against nine returns read as
 * 100%.
 */
export function loanIsSettled(l: SampleLoanRow): boolean {
  return l.status === 'converted' || l.status === 'written_off' || l.status === 'returned';
}

/** What a sample loan is worth as a lead: the reason to chase it, in one line. */
export function describeLoan(l: SampleLoanRow, todayIso: string): string {
  if (l.status === 'converted') return 'Became an order';
  if (l.status === 'returned') return `Returned ${l.returned_on ?? ''}`.trim();
  if (l.status === 'written_off') return 'Written off — gone';
  if (loanIsUnchaseable(l)) return 'Out with no date — nobody will ever chase this';
  return loanIsOverdue(l, todayIso) ? `Overdue since ${l.due_back_on}` : `Due back ${l.due_back_on}`;
}
