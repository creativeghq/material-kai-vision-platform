/** "What is still owed to us / by us" — assembled ONCE, here. */
import { financeService, type AgeBucket, type AgingRow } from './financeService';
import { ordersService } from './ordersService';

export interface AgingLedger {
  /** Receivables from `get_receivables_aging`: open invoices, un-invoiced orders, opening balances, credit held. */
  ar: AgingRow[];
  /** Payables: supplier bills + uninvoiced purchase orders. */
  ap: AgingRow[];
  /** True when the purchase-orders overlay failed, so payables UNDER-report. Always surfaced. */
  overlayFailed: boolean;
}

/** Bucket an un-invoiced purchase order in UTC days, as `vw_ap_aging` does with CURRENT_DATE. */
function agingFromExpected(expected: string | null, todayUtcMs: number): { age_bucket: AgeBucket; days_overdue: number } {
  if (!expected) return { age_bucket: 'no_due_date', days_overdue: 0 };
  const [y, m, d] = expected.split('-').map(Number);
  if (!y || !m || !d) return { age_bucket: 'no_due_date', days_overdue: 0 };
  const days = Math.floor((todayUtcMs - Date.UTC(y, m - 1, d)) / 86_400_000);
  const bucket: AgeBucket = days <= 0 ? 'current' : days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
  return { age_bucket: bucket, days_overdue: Math.max(days, 0) };
}

export async function loadAgingLedger(workspaceId: string): Promise<AgingLedger> {
  const [ar, apRows] = await Promise.all([
    financeService.getReceivablesAging(workspaceId),
    financeService.getApAging(workspaceId),
  ]);

  let ap = apRows.filter((r) => r.entry_kind !== 'manual');
  let overlayFailed = false;

  try {
    const uninvoiced = await ordersService.listUninvoicedOutstanding({ workspaceId });
    const nowUtc = new Date();
    const todayUtcMs = Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate());
    ap = [...ap, ...uninvoiced.filter((o) => o.order_type === 'purchase').map((o): AgingRow => ({
      id: o.id,
      workspace_id: workspaceId,
      total: o.total,
      amount_paid: o.settled,
      amount_due: o.outstanding,
      currency: o.currency,
      // Operator-set date only, so the inline editor never persists a date nobody typed.
      due_at: o.expected_payment_date,
      effective_due_at: o.due_date,
      due_from_terms: o.due_from_terms,
      issued_at: o.created_at,
      status: o.status,
      ...agingFromExpected(o.due_date, todayUtcMs),
      entry_kind: 'order',
      description: o.order_number ?? o.id.slice(0, 8),
      party_name: o.party_name,
      category_id: o.category_id,
      category_name: o.category_name,
    }))];
  } catch (overlayErr) {
    overlayFailed = true;
    console.error('[agingLedger] uninvoiced purchase-orders overlay failed — AP under-reports:', overlayErr);
  }

  const byOverdue = (a: AgingRow, b: AgingRow) => (b.days_overdue || 0) - (a.days_overdue || 0);
  ar.sort(byOverdue);
  ap.sort(byOverdue);

  return { ar, ap, overlayFailed };
}

/** Which currency a set of aging rows may honestly be totalled in, and whether it is mixed. */
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
 * A row is past due once it has aged out of `current` — never by re-comparing dates here: the
 * buckets come from SQL (and the purchase-order overlay), and the "Past due" filter uses this too.
 */
export const isAgingRowOverdue = (r: AgingRow): boolean =>
  r.entry_kind !== 'credit' && r.age_bucket !== 'current' && r.age_bucket !== 'paid' && r.age_bucket !== 'no_due_date';

export function summarizeAging(rows: AgingRow[]): AgingSummary {
  // Owed and held are reported as two separate POSITIVE numbers, never netted into one figure
  // that can go negative on screen.
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
