/**
 * What a rebate position MEANS, with no I/O (#425).
 *
 * IMPORT-FREE on purpose. Expected, claimed, settled and written-off are four states of ONE
 * quantity, derived in SQL — and the rules about how to read them have no dependencies.
 */

export type RebateStatus =
  | 'accruing'
  | 'below_first_band'
  | 'nothing_received'
  | 'unmeasurable'
  | 'not_found';

export type ClaimStatus = 'expected' | 'claimed' | 'settled' | 'written_off';

export interface RebatePosition {
  status: RebateStatus;
  agreement?: string;
  basis?: 'value' | 'quantity';
  period_to_date?: number;
  band_from?: number;
  band_to?: number | null;
  percent?: number | null;
  per_unit_amount?: number | null;
  retrospective?: boolean;
  /** NULL when the base cannot be totalled — which is not the same as nil. */
  accrual?: number | null;
  next_threshold?: number | null;
  to_go?: number | null;
  reason: string;
}

export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  expected: 'Expected — an accrual, not banked',
  claimed: 'Claimed — waiting on the supplier',
  settled: 'Settled',
  written_off: 'Written off',
};

/**
 * Has this actually been received?
 *
 * Only a settled claim is money. Treating an accrual as banked is the opposite error to ignoring
 * the rebate altogether, and it is just as invisible: both produce a confident wrong margin.
 */
export function rebateIsBanked(status: ClaimStatus): boolean {
  return status === 'settled';
}

/**
 * How close the next band is, and what crossing it is worth.
 *
 * The whole commercial point: a threshold crossed in November re-rates every line since January,
 * so "£10k more this quarter" can be worth far more than £10k of margin.
 */
export function crossingIsWorth(p: RebatePosition | null, nextPercent: number | null): number | null {
  if (!p || p.to_go == null || p.period_to_date == null || nextPercent == null) return null;
  if (!p.retrospective) return null;
  const currentPct = p.percent ?? 0;
  const newBase = p.period_to_date + p.to_go;
  return Math.round((newBase * (nextPercent - currentPct) / 100) * 100) / 100;
}

/** Whether the position needs a human rather than merely informing one. */
export function rebateNeedsAttention(p: RebatePosition | null): boolean {
  return p?.status === 'unmeasurable';
}
