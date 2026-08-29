/**
 * Does what the order says it cost agree with what has actually been booked against it?
 *
 * An order records a cost in TWO independent places and nothing has ever compared them:
 *
 *   • `order_items.unit_cost` — what the goods cost. This is the ONLY input to the order's margin.
 *   • `supplier_bills` attached to the order — what a supplier has billed us. This is the payable.
 *
 * Both are legitimate and they are not duplicates of each other in general: the first is a costing,
 * the second is an obligation, and one supplier invoice can be an instalment against one line.
 * But nothing reconciled them, so three different wrong states all looked completely normal:
 *
 *   1. The same cost entered twice — once on the line, once as an expense — leaves a payable that
 *      has already been paid through the other copy. Pay it again and the money is gone. Two €328
 *      KEROS bills on ORD-2026-0001 sat in exactly that state; the unpaid one read as a live debt.
 *   2. A cost booked ONLY as an expense (freight, customs, an installer) never reaches the margin,
 *      because margin reads lines and nothing else. The order reports what it made and is wrong by
 *      the whole amount, with every figure on the screen internally consistent.
 *   3. A line left with no cost is treated as costing nothing, so it reports 100% margin. The
 *      party screen warns about this; the order screen — where the money is actually taken — does not.
 *
 * None of the three can be caught downstream: a wrong cost is a valid cost, so no typecheck, no
 * constraint and no integrity probe can see it. It has to be compared here, at the point where both
 * numbers are in scope.
 *
 * This module is PURE and holds no opinion about presentation. It is the single place the rules
 * live, so the order panel and its guard test read the same answers.
 * Guarded by tests/unit/orderCostAudit.test.ts.
 */

// Cent rounding is declared once, in `@/utils/decimal`. A local copy is how two money figures
// that should agree start disagreeing in the last digit.
import { round2 as r2 } from '@/utils/decimal';

/** VAT-inclusive cost of a line, matching `getOrderSupplierExposure`: the purchase carries the
 *  SAME rate the line carries, so a 0% line owes its net cost and a 24% line owes cost x 1.24. */
const grossOf = (net: number, vatPercent: number | null | undefined) =>
  net * (1 + (Number(vatPercent ?? 0) || 0) / 100);

/** A bill is out of play once voided — it is neither a payable nor a costing any more. */
const VOID_STATUS = 'void';

export interface CostAuditLine {
  supplier_company_id: string | null;
  quantity: number | string | null;
  unit_cost: number | string | null;
  vat_percent: number | string | null;
  net_value?: number | string | null;
  line_total?: number | string | null;
  description?: string | null;
}

export interface CostAuditBill {
  id: string;
  supplier_company_id: string | null;
  total: number | string | null;
  amount_due: number | string | null;
  status: string | null;
  /** For labelling only — the audit keys on the company id, falling back to this. */
  supplier_label?: string | null;
}

export type CostAuditFinding =
  /**
   * Two or more live expenses on this order, same supplier, same amount. Never proof of an error —
   * two identical instalments are real — but it is the shape the double-entry takes, and the
   * operator is the only one who can tell them apart. Says so rather than deleting anything.
   */
  | { kind: 'duplicate_expense'; supplier: string; amount: number; billIds: string[]; count: number }
  /**
   * Expenses booked against a supplier beyond what this order's lines say that supplier's goods
   * cost. The excess is real money the MARGIN CANNOT SEE, because margin reads lines only. A
   * supplier with no lines at all (freight, customs) lands here with its whole amount.
   */
  | { kind: 'cost_outside_margin'; supplier: string; amount: number; billIds: string[] }
  /**
   * Lines carrying revenue and no cost. They report as pure margin, so the order's profit is
   * overstated by whatever they really cost.
   */
  | { kind: 'line_without_cost'; count: number; revenue: number };

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Compare the two records of what this order cost.
 *
 * `supplierNames` resolves a company id to something printable; a bill with no company id is keyed
 * by its own label so two unattributed bills for the same amount still pair up.
 */
export function auditOrderCosts(input: {
  lines: CostAuditLine[];
  bills: CostAuditBill[];
  supplierNames?: Map<string, string>;
}): CostAuditFinding[] {
  const { lines, bills, supplierNames } = input;
  const findings: CostAuditFinding[] = [];

  const liveBills = bills.filter((b) => (b.status ?? '') !== VOID_STATUS);
  const nameFor = (companyId: string | null, fallback?: string | null) =>
    (companyId ? supplierNames?.get(companyId) : null) ?? fallback ?? 'this supplier';

  // --- 1. The same amount, the same supplier, twice ---------------------------------------
  const byAmount = new Map<string, CostAuditBill[]>();
  for (const b of liveBills) {
    // No company id: key on the label so unattributed bills still pair, and on '' only as a last
    // resort — grouping every anonymous bill together would pair unrelated amounts.
    const key = `${b.supplier_company_id ?? b.supplier_label ?? ''}|${r2(num(b.total)).toFixed(2)}`;
    byAmount.set(key, [...(byAmount.get(key) ?? []), b]);
  }
  for (const group of byAmount.values()) {
    if (group.length < 2) continue;
    const amount = r2(num(group[0].total));
    // A pair of zero-value bills is noise, not a duplicated cost.
    if (amount <= 0.005) continue;
    findings.push({
      kind: 'duplicate_expense',
      supplier: nameFor(group[0].supplier_company_id, group[0].supplier_label),
      amount,
      billIds: group.map((b) => b.id),
      count: group.length,
    });
  }

  // --- 2. Cost booked as an expense that the margin never sees ----------------------------
  // Line cost per supplier, VAT-inclusive so it is comparable with a bill total.
  const lineCostGross = new Map<string, number>();
  for (const l of lines) {
    if (!l.supplier_company_id || l.unit_cost == null) continue;
    const net = num(l.unit_cost) * num(l.quantity);
    lineCostGross.set(
      l.supplier_company_id,
      (lineCostGross.get(l.supplier_company_id) ?? 0) + grossOf(net, num(l.vat_percent)),
    );
  }

  const billedBySupplier = new Map<string, { total: number; ids: string[]; label: string | null }>();
  for (const b of liveBills) {
    const key = b.supplier_company_id ?? `~${b.supplier_label ?? b.id}`;
    const cur = billedBySupplier.get(key) ?? { total: 0, ids: [], label: b.supplier_label ?? null };
    cur.total += num(b.total);
    cur.ids.push(b.id);
    billedBySupplier.set(key, cur);
  }

  for (const [key, billed] of billedBySupplier) {
    const isCompany = !key.startsWith('~');
    const lineCost = isCompany ? (lineCostGross.get(key) ?? 0) : 0;
    const excess = r2(billed.total - lineCost);
    // A cent of rounding between a gross line cost and a supplier's own total is not a finding.
    if (excess <= 0.01) continue;
    findings.push({
      kind: 'cost_outside_margin',
      supplier: nameFor(isCompany ? key : null, billed.label),
      amount: excess,
      billIds: billed.ids,
    });
  }

  // --- 3. Revenue with no cost behind it ---------------------------------------------------
  // `net_value` is the post-discount line revenue the margin uses; `line_total` is the fallback the
  // same derivation applies, so a line missing one is still counted rather than silently skipped.
  let costlessCount = 0;
  let costlessRevenue = 0;
  for (const l of lines) {
    if (l.unit_cost != null) continue;
    const revenue = num(l.net_value ?? l.line_total ?? 0);
    if (revenue <= 0.005) continue;
    costlessCount += 1;
    costlessRevenue += revenue;
  }
  if (costlessCount > 0) {
    findings.push({ kind: 'line_without_cost', count: costlessCount, revenue: r2(costlessRevenue) });
  }

  return findings;
}

/** One-line human summary of a finding. Kept beside the rules so wording and rule cannot drift. */
export function describeCostFinding(f: CostAuditFinding): string {
  switch (f.kind) {
    case 'duplicate_expense':
      return `${f.count} expenses of the same amount for ${f.supplier} — if they are one cost entered twice, the unpaid one is a bill you have already settled.`;
    case 'cost_outside_margin':
      return `Booked against ${f.supplier} beyond what this order's lines say their goods cost. The order's margin does not include it.`;
    case 'line_without_cost':
      return `${f.count} ${f.count === 1 ? 'line carries' : 'lines carry'} revenue with no cost, so they count as pure margin and the profit figure is too high.`;
  }
}
