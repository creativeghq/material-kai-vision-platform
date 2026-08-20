/**
 * "What is still owed to us / by us" — assembled ONCE, here.
 *
 * This is the money-derivation rule from CLAUDE.md applied to receivables and payables. The
 * answer is not one table: it is the aging view PLUS confirmed-but-not-yet-invoiced orders PLUS
 * customer money held on account, and each part changes the total. Anything that re-derives a
 * subset gets a different, equally valid-looking number:
 *
 *   • The Finance page's Receivables tab reads all three.
 *   • The dashboard's Finance block used to sum `invoices.amount_due` for three statuses, capped
 *     at 1000 rows, and label the result with whichever currency the last row happened to carry.
 *     In a workspace with no invoices and two confirmed sales orders it reported "All Settled"
 *     while the tab it linked to listed the orders as outstanding. The stored data was correct in
 *     both places; only the derivation differed, so nothing could flag it — a wrong number is a
 *     valid number.
 *
 * So both callers load the SAME rows through `loadAgingLedger` and summarize them with the SAME
 * `summarizeAging`. Adding a third consumer means calling these, never re-querying `invoices`.
 */
import { financeService, type AgeBucket, type AgingRow } from './financeService';
import { ordersService } from './ordersService';

export type DepositsOnAccount = Awaited<ReturnType<typeof financeService.getDepositsOnAccount>>;

export interface AgingLedger {
  /** Receivables: sales invoices + uninvoiced sales orders + credit held for customers. */
  ar: AgingRow[];
  /** Payables: supplier bills + uninvoiced purchase orders. */
  ap: AgingRow[];
  /** Customer money on account, kept separately — it is held, not owed. */
  deposits: DepositsOnAccount;
  /**
   * True when the uninvoiced-orders overlay failed. Both sides then UNDER-report, which looks
   * exactly like "there is less outstanding" — the one reading an operator must never be handed
   * by accident. Surfaced by every caller, never swallowed.
   */
  overlayFailed: boolean;
}

/**
 * Bucket an un-invoiced order's expected payment date.
 *
 * The invoice aging view computes `CURRENT_DATE - due_at` in the DB session timezone (UTC on
 * Supabase). We MUST match that reference or an order and an invoice with the same date can
 * disagree by a day near midnight — so both "today" and the due date are compared as UTC calendar
 * days. This is the one place in the app where UTC is the CORRECT reference rather than the
 * `todayLocalISO()` bug: it is not a date of record, it is a comparison against a UTC-derived one.
 */
function agingFromExpected(expected: string | null, todayUtcMs: number): { age_bucket: AgeBucket; days_overdue: number } {
  if (!expected) return { age_bucket: 'no_due_date', days_overdue: 0 };
  const [y, m, d] = expected.split('-').map(Number);
  if (!y || !m || !d) return { age_bucket: 'no_due_date', days_overdue: 0 };
  const days = Math.floor((todayUtcMs - Date.UTC(y, m - 1, d)) / 86_400_000);
  const bucket: AgeBucket = days <= 0 ? 'current' : days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
  return { age_bucket: bucket, days_overdue: Math.max(days, 0) };
}

export async function loadAgingLedger(workspaceId: string): Promise<AgingLedger> {
  const [arRows, apRows] = await Promise.all([
    financeService.getArAging(workspaceId),
    financeService.getApAging(workspaceId),
  ]);

  // Cash + documents only: receivables/payables are issued invoices / supplier bills, plus
  // confirmed-but-not-yet-invoiced orders (real order-derived money). Manual "virtual" AR/AP
  // entries are intentionally excluded everywhere now.
  let ar = arRows.filter((r) => r.entry_kind !== 'manual');
  let ap = apRows.filter((r) => r.entry_kind !== 'manual');
  let overlayFailed = false;

  try {
    const uninvoiced = await ordersService.listUninvoicedOutstanding({ workspaceId });
    const nowUtc = new Date();
    const todayUtcMs = Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate());
    const toAgingRow = (o: typeof uninvoiced[number]): AgingRow => ({
      id: o.id,
      workspace_id: workspaceId,
      total: o.total,
      amount_paid: o.settled,
      amount_due: o.outstanding,
      // The ORDER's currency, not the workspace base. A synthesised row that guesses EUR is
      // exactly how a USD order's outstanding got summed into the euro bucket totals.
      currency: o.currency,
      // `due_at` stays the operator-set date (often null) so the inline editor on the Finance
      // page opens empty and never persists a date nobody typed; the derived one drives aging.
      due_at: o.expected_payment_date,
      effective_due_at: o.due_date,
      due_from_terms: o.due_from_terms,
      issued_at: o.created_at,
      status: o.status,
      ...agingFromExpected(o.due_date, todayUtcMs),
      entry_kind: 'order',
      // Bare number only — the row already says "Order, not invoiced" next to it, so the word
      // "Order" in front of the number just read as "Order ORD-2026-0001".
      description: o.order_number ?? o.id.slice(0, 8),
      party_name: o.party_name,
      category_id: o.category_id,
      category_name: o.category_name,
    });
    ar = [...ar, ...uninvoiced.filter((o) => o.order_type === 'sales').map(toAgingRow)];
    ap = [...ap, ...uninvoiced.filter((o) => o.order_type === 'purchase').map(toAgingRow)];
  } catch (overlayErr) {
    overlayFailed = true;
    console.error('[agingLedger] uninvoiced-orders overlay failed — AR/AP under-report:', overlayErr);
  }

  // Customer money held on account (unallocated inbound payments) lives in the receivables list
  // so the operator sees it next to what that customer owes — but it carries POSITIVE amounts and
  // is aggregated separately (creditHeld), never summed into "owed" totals as a negative row.
  // Per operator (2026-08-04): negative numbers on this page are banned; a credit is presented as
  // "money we hold", and the netting happens in labelled aggregate lines, not in row signs.
  const deposits = await financeService.getDepositsOnAccount(workspaceId)
    .catch(() => ({ total: 0, currency: 'EUR', totals: [], rows: [] }) as DepositsOnAccount);
  ar = [...ar, ...deposits.rows.map((d): AgingRow => ({
    id: d.payment_id,
    workspace_id: workspaceId,
    total: d.unallocated,
    amount_paid: 0,
    amount_due: d.unallocated, // positive — aggregates key off entry_kind, not the sign
    // The DEPOSIT's currency. A credit may only net against same-currency receivables — netting
    // a USD deposit against a EUR invoice is not a discount, it is a wrong number.
    currency: d.currency,
    due_at: null,
    issued_at: d.paid_at,
    status: 'credit',
    age_bucket: 'no_due_date',
    days_overdue: 0,
    entry_kind: 'credit',
    description: d.credit_number ? `Credit ${d.credit_number}` : 'Credit on account',
    party_name: d.party_name,
    category_id: null,
    category_name: null,
    order_id: d.order_id,
    order_number: d.order_number,
    credit_number: d.credit_number,
  }))];

  // Sort each side by how overdue it is (most overdue first) so aging orders interleave with
  // invoices instead of always sitting below them. 'no_due_date' (unaged) sinks to the bottom.
  const byOverdue = (a: AgingRow, b: AgingRow) => (b.days_overdue || 0) - (a.days_overdue || 0);
  ar.sort(byOverdue);
  ap.sort(byOverdue);

  return { ar, ap, deposits, overlayFailed };
}

/**
 * Which currency a set of aging rows may honestly be totalled in, and whether it is mixed.
 *
 * Bucket totals, the DSO base and the AR/AP figures all sum `amount_due` across every row, so they
 * are only meaningful when the rows share a currency. Fall back to formatMoney's EUR default and a
 * USD invoice's 1,000 is added to the euro total and shown with a euro symbol.
 *
 * Summing genuinely mixed rows is not something a symbol can fix, so this reports the dominant
 * currency AND whether the set is mixed; callers label the total honestly and warn when it cannot
 * be trusted. Converting to a base currency needs stored FX rates per document.
 */
export function aggregateCurrency(rows: AgingRow[]): { currency: string; mixed: boolean } {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const c = r.currency || 'EUR';
    totals.set(c, (totals.get(c) ?? 0) + Math.abs(r.amount_due || 0));
  }
  if (totals.size === 0) return { currency: 'EUR', mixed: false };
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return { currency: sorted[0][0], mixed: totals.size > 1 };
}

export interface AgingSummary {
  /** Money genuinely owed — credit rows excluded, never netted against them. */
  outstanding: number;
  /** Customer money we hold, reported as its own POSITIVE number. */
  creditHeld: number;
  /** Owed money past its due date. */
  overdueTotal: number;
  /** How many rows are past due — the count the dashboard's "Overdue" row shows. */
  overdueCount: number;
  /** How many rows are owed at all (invoices + uninvoiced orders), credits excluded. */
  openCount: number;
  currency: string;
  /** True when the rows span more than one currency, so `outstanding` cannot be trusted. */
  mixed: boolean;
}

/**
 * A row is past due when it has aged out of `current` — never by re-comparing dates here.
 *
 * The buckets are the derivation: `vw_ar_aging` computes them in SQL for invoices and
 * `loadAgingLedger` computes them the same way for un-invoiced orders. Re-deriving "overdue" from
 * `due_at` would disagree with both, because an un-invoiced order ages against its terms-derived
 * date while `due_at` stays null. Exported so the "Past due" list filter selects EXACTLY the rows
 * this counts — the figure and the list it links to are one set.
 */
export const isAgingRowOverdue = (r: AgingRow): boolean =>
  r.entry_kind !== 'credit' && r.age_bucket !== 'current' && r.age_bucket !== 'paid' && r.age_bucket !== 'no_due_date';

export function summarizeAging(rows: AgingRow[]): AgingSummary {
  // Owed and held are reported as two separate POSITIVE numbers, never netted into one figure
  // that can go negative on screen.
  //
  // The accumulator is `owed`, not `outstanding`, and the distinction is the one
  // moneyDerivation.test.ts polices: an ORDER's `outstanding` is derived once by
  // `get_order_settlements` and may only ever be READ. What happens here is a sum of already-
  // derived `amount_due` across rows — aggregation, not a second derivation — and naming the
  // accumulator after the thing that must never be recomputed is how the two get confused.
  let owed = 0;
  let creditHeld = 0;
  let overdueTotal = 0;
  let overdueCount = 0;
  let openCount = 0;
  for (const r of rows) {
    const due = Number(r.amount_due) || 0;
    if (r.entry_kind === 'credit') { creditHeld += due; continue; }
    owed += due;
    openCount += 1;
    if (isAgingRowOverdue(r)) { overdueTotal += due; overdueCount += 1; }
  }
  return { outstanding: owed, creditHeld, overdueTotal, overdueCount, openCount, ...aggregateCurrency(rows) };
}
