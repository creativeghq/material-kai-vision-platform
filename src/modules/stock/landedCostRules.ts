/**
 * What a landed-cost allocation MEANS, with no I/O (#422).
 *
 * IMPORT-FREE on purpose: the allocation is derived in SQL and the service that fetches it pulls in
 * the Supabase client. The rules about how to read the answer have no dependencies.
 */

export type AllocationBasis = 'weight' | 'volume' | 'value' | 'quantity' | 'equal';

export type AllocationStatus = 'forecast' | 'actual' | 'unmeasurable' | 'no_lines' | 'not_found';

export interface AllocationLine {
  order_item_id: string;
  description: string | null;
  quantity: number;
  measure: number | null;
  share?: number;
  on_cost?: number;
  on_cost_per_unit?: number | null;
}

export interface FolderAllocation {
  status: AllocationStatus;
  basis?: AllocationBasis;
  basis_total?: number;
  forecast_total?: number;
  actual_total?: number;
  variance?: number;
  allocated_total?: number;
  lines?: number;
  unmeasured_lines?: number;
  allocation?: AllocationLine[];
  reason: string;
}

export const BASIS_LABEL: Record<AllocationBasis, string> = {
  weight: 'Weight — the default for tile',
  volume: 'Volume',
  value: 'Value',
  quantity: 'Quantity',
  equal: 'Equally across lines',
};

/**
 * Is this figure an accrual rather than a fact?
 *
 * The goods sell long before the freight invoice arrives, so a container costed on a forecast is
 * the normal state for weeks — and saying so is what stops the later correction being silent.
 */
export function allocationIsForecast(a: FolderAllocation | null): boolean {
  return a?.status === 'forecast';
}

/**
 * Could the container be apportioned at all?
 *
 * A weight basis where half the lines have no weight is not "allocated by weight". Falling back to
 * value would put the freight on the light, expensive decor and under-cost the heavy floor tile —
 * wrong in the one direction that flatters the cheap lines.
 */
export function allocationRefused(a: FolderAllocation | null): boolean {
  return a?.status === 'unmeasurable';
}

/**
 * The gap between what was accrued and what was invoiced.
 *
 * `null` when there is nothing to compare, which is different from a variance of zero: one means
 * the invoices agree with the estimate and the other means they have not arrived.
 */
export function onCostVariance(a: FolderAllocation | null): number | null {
  if (!a) return null;
  if (!(a.actual_total && a.actual_total > 0)) return null;
  if (!(a.forecast_total && a.forecast_total > 0)) return null;
  return Math.round((a.actual_total - a.forecast_total) * 100) / 100;
}
