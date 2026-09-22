/**
 * Why a P&L figure is the way it is, in the words the operator reads. Import-free: a card that
 * wants only the copy must not pull the finance service, and through it the Supabase client.
 */

export type PnlAadeStatus =
  | 'ok' | 'partial' | 'no_data' | 'not_collected' | 'collector_failed' | 'not_connected'
  | 'period_not_comparable';

export type PnlBooksStatus = 'ok' | 'no_data' | 'mixed_currency';

export interface PnlVerdict {
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'unknown';
  /** False means there is no number to render — show the reason, never a zero. */
  hasFigures: boolean;
}

const AADE: Record<PnlAadeStatus, PnlVerdict> = {
  ok: { label: 'Complete', detail: 'Every month in this range has been read from ΑΑΔΕ.', tone: 'ok', hasFigures: true },
  partial: { label: 'Partial', detail: 'Some months in this range have not been read yet — these totals are a floor, not the whole.', tone: 'warn', hasFigures: true },
  no_data: { label: 'Nothing filed', detail: 'ΑΑΔΕ answered and holds no documents for this range.', tone: 'ok', hasFigures: true },
  not_collected: { label: 'Not fetched', detail: 'Nobody has read this range from ΑΑΔΕ yet — unknown, not zero.', tone: 'unknown', hasFigures: false },
  collector_failed: { label: 'Could not reach ΑΑΔΕ', detail: 'The last read failed, so these figures are unknown rather than absent.', tone: 'unknown', hasFigures: false },
  not_connected: { label: 'ΑΑΔΕ not connected', detail: 'Add the ΑΑΔΕ credentials in Settings → Documents to read your book.', tone: 'unknown', hasFigures: false },
  period_not_comparable: { label: 'Not comparable', detail: 'ΑΑΔΕ keeps the book by calendar month, so a period that starts or ends mid-month has nothing to compare against. Use whole months.', tone: 'unknown', hasFigures: false },
};

const BOOKS: Record<PnlBooksStatus, PnlVerdict> = {
  ok: { label: 'From your documents', detail: 'Derived from the invoices, bills and orders in this workspace.', tone: 'ok', hasFigures: true },
  no_data: { label: 'No documents', detail: 'Nothing has been issued or booked in this range.', tone: 'ok', hasFigures: true },
  mixed_currency: { label: 'Mixed currencies', detail: 'This range holds more than one currency, so there is no single total to show. Open Reports → P&L by category, which reports per currency.', tone: 'unknown', hasFigures: false },
};

/** An unrecognised status is UNKNOWN, never a figure rendered as fact. */
const UNKNOWN: PnlVerdict = {
  label: 'Unknown', detail: 'This figure could not be explained, so it is not shown as fact.',
  tone: 'unknown', hasFigures: false,
};

export const aadeVerdict = (s: PnlAadeStatus | string | null | undefined): PnlVerdict =>
  (s && AADE[s as PnlAadeStatus]) || UNKNOWN;

export const booksVerdict = (s: PnlBooksStatus | string | null | undefined): PnlVerdict =>
  (s && BOOKS[s as PnlBooksStatus]) || UNKNOWN;

/** Why a received document cannot become an expense. `bookable` is the one state that can. */
export const BOOKING_STATE_COPY: Record<string, { label: string; detail: string }> = {
  bookable: { label: 'Ready to book', detail: 'These become supplier bills, and then reach Payables and the P&L.' },
  booked: { label: 'Already in Expenses', detail: 'A supplier bill exists for these.' },
  settled_outside: { label: 'Settled outside the books', detail: 'Paid, but not through this platform — deliberately kept out of the P&L. Undo it from the row menu.' },
  dismissed: { label: 'Dismissed', detail: 'Set aside by hand — not ours to book.' },
  cancelled: { label: 'Cancelled at ΑΑΔΕ', detail: 'The issuer cancelled these. A void document is not an expense.' },
  payroll: { label: 'Payroll', detail: 'Recorded in HR. Booking it here would double it against payroll.' },
  credit_note: { label: 'Supplier credit notes', detail: 'These REDUCE an expense, so they are issued against the bill they correct rather than booked as one.' },
  no_value: { label: 'Delivery notes', detail: 'Goods moved, no money stated. The invoice that prices them is booked instead.' },
  out_of_scope: { label: 'Other document types', detail: 'Not a purchase document — nothing to book.' },
};

export const bookingStateCopy = (s: string) =>
  BOOKING_STATE_COPY[s] ?? { label: s, detail: 'Unrecognised document state — left alone.' };
