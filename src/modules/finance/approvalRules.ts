/**
 * The approval spine's verdicts, with no I/O (#426, #435) — and the tile counter's (#436).
 *
 * IMPORT-FREE on purpose: the derivations live in SQL and the services that fetch them pull in the
 * Supabase client, which fails closed with no environment configured. What a verdict MEANS has no
 * dependencies and belongs here, where a hermetic test can reach it.
 */

export type ApprovalSubject = 'credit_hold' | 'margin_floor' | 'pos_variance';
export type ApprovalAction = 'warn' | 'block' | 'approve';
export type ApprovalDecision = 'allow' | 'warn' | 'block' | 'approve';

export interface CreditVerdict {
  decision: ApprovalDecision;
  exposure: number;
  proposed: number;
  credit_limit: number | null;
  overdue_amount: number;
  oldest_due_on: string | null;
  days_overdue: number;
  grace_days: number;
  grace_basis: 'calendar' | 'working';
  approver_role: string | null;
  reasons: string[];
  reason: string;
}

export interface MarginVerdict {
  decision: ApprovalDecision;
  status: 'no_policy' | 'unknown_cost' | 'over_discount' | 'below_floor' | 'within_policy';
  margin_percent?: number;
  /** Points above or below what this product normally makes. The number the approver needs. */
  variance_from_reference?: number | null;
  unit_cost?: number;
  line_value?: number;
  min_margin_percent?: number | null;
  max_discount_percent?: number | null;
  approver_role?: string | null;
  reason: string;
}

export const SUBJECT_LABEL: Record<ApprovalSubject, string> = {
  credit_hold: 'Credit hold',
  margin_floor: 'Margin authority',
  pos_variance: 'Till variance',
};

/** Whether a verdict should stop the write rather than merely inform. */
export function verdictStops(decision: ApprovalDecision | undefined | null): boolean {
  return decision === 'block' || decision === 'approve';
}

/**
 * Whether a verdict can be released by someone signing for it.
 *
 * Only `approve`. `block` means nobody can wave it through, and letting a signature release it
 * would make the two settings the same setting.
 */
export function verdictIsApprovable(decision: ApprovalDecision | undefined | null): boolean {
  return decision === 'approve';
}

// ── The tile counter (#436) ──────────────────────────────────────────────────

export type TileQuantityStatus =
  | 'rounded_to_packs'
  | 'partial_allowed'
  | 'no_pack_size'
  | 'no_quantity'
  | 'not_found';

export interface TileQuantity {
  status: TileQuantityStatus;
  requested?: number;
  wastage_percent?: number | null;
  with_wastage?: number;
  box_m2?: number | null;
  boxes?: number | null;
  supplied?: number;
  pallets?: number | null;
  pack_uplift?: number;
  reason: string;
}

/**
 * Whether the uplift is worth showing the customer.
 *
 * A line that ships exactly what was asked for needs no explanation; one that ships 47.52 m²
 * against 42 m² asked for needs one, or the quote looks like a mistake.
 */
export function hasVisibleUplift(q: TileQuantity | null): boolean {
  if (!q) return false;
  if (q.status === 'rounded_to_packs') return true;
  return (q.wastage_percent ?? 0) > 0;
}
