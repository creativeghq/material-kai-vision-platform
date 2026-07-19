/**
 * Expense money-split — the pure, runtime-agnostic core of the `record_expense` agent tool.
 *
 * Deliberately free of Deno globals, npm imports and I/O so it imports cleanly in BOTH the
 * Deno edge runtime (expense-tools.ts) AND the node/vitest unit runner
 * (tests/unit/expenseMath.test.ts). This is the money-sensitive part of the tool — deriving
 * the net / VAT / total that land on the supplier_bills row and feed AP + P&L — so it gets a
 * behavioral test guarding the REAL code path, not a copy.
 *
 * Everything that needs the runtime (Supabase writes, `new Date()` defaulting, category/payee
 * find-or-create) stays in the edge tool; only validation + arithmetic + currency normalization
 * live here.
 */

/** Round to 2 decimals (currency). Epsilon nudge so a binary-float 1.005 rounds up, not down. */
export function round2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

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
 *
 * Validation order is significant — it decides which message the user sees first:
 *   1. amount must be > 0
 *   2. category required
 *   3. payee required
 *   4. VAT must not exceed the total (net cannot go negative)
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
