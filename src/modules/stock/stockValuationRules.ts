/**
 * What a stock valuation MEANS, with no I/O (#421).
 *
 * IMPORT-FREE on purpose: the derivations live in SQL and the service that fetches them pulls in
 * the Supabase client. The rules about how to read the answer have no dependencies and belong
 * where a hermetic test can reach them.
 */

export type ValuationMethod = 'weighted_average' | 'fifo' | 'standard';

export interface InventoryValue {
  status: 'complete' | 'partial' | 'no_stock';
  as_of?: string;
  method?: ValuationMethod;
  value: number;
  valued_items: number;
  unvalued_items: number;
  valued_quantity: number;
  unvalued_quantity: number;
  reason: string;
}

export interface CogsResult {
  status: 'complete' | 'partial' | 'no_movements';
  from?: string;
  to?: string | null;
  method?: ValuationMethod;
  cogs: number;
  valued_movements: number;
  unvalued_movements: number;
  unvalued_quantity: number;
  reason: string;
}

export const METHOD_LABEL: Record<ValuationMethod, string> = {
  weighted_average: 'Weighted average (μέση σταθμική)',
  fifo: 'FIFO',
  standard: 'Standard cost',
};

/**
 * Is this figure the whole warehouse, or part of it?
 *
 * `partial` is the load-bearing state: an inventory value that silently omits a third of the
 * shelves is worse than no figure at all, because it looks like one.
 */
export function valuationIsPartial(v: InventoryValue | CogsResult | null): boolean {
  return v?.status === 'partial';
}

/**
 * The figure, or a dash.
 *
 * A partial total still has a number worth showing — but it is shown WITH its caveat, never as the
 * inventory value. A missing answer is a dash, never 0: zero stock and unreadable stock are
 * different facts and only one of them is good news.
 */
export function formatValuation(v: number | null | undefined, currency = 'EUR'): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(Math.round(v * 100) / 100).toFixed(2)} ${currency}`;
}

/**
 * Whether a costing-method change would rewrite history.
 *
 * ERPNext makes FIFO → Moving Average one-way once transactions exist, and it is right to: the
 * method decides what every past issue cost, so changing it re-values sales that are already
 * invoiced. A change is allowed only from a date with nothing behind it.
 */
export function methodChangeRewritesHistory(input: {
  current: ValuationMethod;
  next: ValuationMethod;
  movementsInPeriod: number;
}): boolean {
  return input.current !== input.next && input.movementsInPeriod > 0;
}
