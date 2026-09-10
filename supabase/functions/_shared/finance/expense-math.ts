/** Expense money-split — the pure, runtime-agnostic core of the `record_expense` agent tool. */

// Canonical money rounding lives in _shared/money.ts; re-exported for this module's importers.
// `export … from` re-exports WITHOUT creating a local binding, and this module CALLS round2
// below — so the re-export alone left it undefined at runtime (ReferenceError: round2 is not
// defined) while typechecking clean, because TS only verifies the re-export is valid. Import it
// into scope first, then re-export the local binding. (audit #287 follow-up)
import { round2 } from '../money.ts';

export { round2 };

export interface ExpenseSplitInput {
  /** Total amount INCLUDING VAT (what the payee charged). */
  amount: number;
  /** VAT portion of the total. Optional; negatives are clamped to 0. */
  vat_amount?: number;
  /** Expense category name (Rent, Utilities, …) — required by the tool. */
  category?: string;
  /** Supplier / payee name — required (supplier_bills needs a counterparty). */
  payee?: string;
  /** ISO currency; defaults to EUR, always upper-cased. */
  currency?: string;
}

export type ExpenseSplit =
  | { ok: true; total: number; vat: number; net: number; currency: string }
  | { ok: false; error: string };

/**
 * Validate + derive the net / VAT / total split for an expense, exactly as the `record_expense`
 * tool does before it writes the supplier_bills row. Returns a discriminated result so the caller
 * can surface the error string verbatim (no throwing across the tool boundary).
 */
export function computeExpenseSplit(input: ExpenseSplitInput): ExpenseSplit {
  const { amount, vat_amount, category, payee, currency } = input;

  if (!(amount > 0)) return { ok: false, error: 'Amount (total incl. VAT) must be greater than zero.' };
  if (!category?.trim()) return { ok: false, error: 'A category is required (e.g. Rent, Utilities).' };
  if (!payee?.trim()) return { ok: false, error: 'A supplier / payee name is required.' };

  const total = round2(amount);
  const vat = round2(Math.max(0, vat_amount ?? 0));
  const net = round2(total - vat);
  if (net < 0) return { ok: false, error: 'VAT cannot exceed the total amount.' };

  const cur = (currency || 'EUR').toUpperCase();
  return { ok: true, total, vat, net, currency: cur };
}
