/**
 * What a stock-ageing figure MEANS, with no I/O (#438).
 *
 * IMPORT-FREE on purpose. The provision is a money quantity derived once in SQL; these are the
 * rules about how to read it, and the most important of them is that "never sold" and "sold none
 * this month" are different facts.
 */

export type AgeingStatus = 'complete' | 'partial' | 'no_policy' | 'no_stock' | 'not_found';

export interface AgeingRow {
  pool_id: string;
  item: string | null;
  lot: string;
  tone: string;
  calibre: string;
  is_remainder: boolean;
  quantity: number;
  /** NULL when the pool has no cost behind it — not zero. */
  value: number | null;
  /** NULL when nothing is known about the pool's history at all. */
  days_since_last_sale: number | null;
  never_sold: boolean;
  discontinued_on: string | null;
  provision_percent: number | null;
  provision: number;
}

export interface AgeingPosition {
  status: AgeingStatus;
  as_of?: string;
  policy_effective_from?: string | null;
  pools?: number;
  value?: number;
  provision?: number;
  unvalued_pools?: number;
  never_sold_pools?: number;
  provisioned_pools?: number;
  rows?: AgeingRow[];
  reason: string;
}

/**
 * How a pool's history reads.
 *
 * `never` is the one that matters: a pallet received last week and one nobody has wanted since
 * 2024 both sold nothing this month, and only one of them is a write-down waiting to happen.
 */
export function describeAge(r: AgeingRow): string {
  if (r.days_since_last_sale == null) return 'no history recorded';
  if (r.never_sold) return `never sold · ${r.days_since_last_sale} days on the shelf`;
  return `${r.days_since_last_sale} days since it last sold`;
}

/**
 * Is the provision covering the whole warehouse?
 *
 * `no_policy` is not "nothing needs writing down" — it is nobody having said what should be. That
 * distinction is the entire value of this figure.
 */
export function provisionIsIncomplete(p: AgeingPosition | null): boolean {
  return p?.status === 'partial' || p?.status === 'no_policy';
}

/**
 * The pools worth an operator's attention, worst first.
 *
 * Discontinued ranges lead, because the factory dropping a colour is the earliest signal there is
 * — everything else only tells you once the stock has already sat.
 */
export function poolsNeedingAttention(p: AgeingPosition | null): AgeingRow[] {
  const rows = p?.rows ?? [];
  return rows
    .filter((r) => r.discontinued_on != null || (r.provision_percent ?? 0) > 0)
    .sort((a, b) => {
      if ((a.discontinued_on != null) !== (b.discontinued_on != null)) {
        return a.discontinued_on != null ? -1 : 1;
      }
      return (b.provision ?? 0) - (a.provision ?? 0);
    });
}
