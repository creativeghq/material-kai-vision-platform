/**
 * Back-to-back ordering and the reception report, with no I/O (#433).
 *
 * IMPORT-FREE on purpose. Roughly a third of merchant lines are non-stock specials, so at order
 * entry the useful question is not "what is my stock level" but "what is on an inbound PO and
 * unallocated" — and the answer has to survive the PO being cancelled.
 */

export type ReceptionStatus = 'claims' | 'nobody_waiting' | 'not_a_purchase' | 'not_found';

export interface ReceptionClaim {
  sales_order_id: string;
  order_number: string | null;
  sales_item_id: string;
  quantity: number;
  outstanding: number;
  confirmed_at: string;
  already_linked: boolean;
  linked_to_this: boolean;
  pool_id: string | null;
}

export interface ReceptionLine {
  purchase_item_id: string;
  description: string | null;
  ordered: number;
  received: number;
  claims: ReceptionClaim[];
}

export interface ReceptionReport {
  status: ReceptionStatus;
  order_id?: string;
  lines?: number;
  waiting_lines?: number;
  allocation?: ReceptionLine[];
  reason: string;
}

/**
 * Whether the pallet that landed has somebody waiting for it.
 *
 * `nobody_waiting` is a real answer, not an empty one: it means the goods go to free stock, which
 * is a decision rather than an absence of one.
 */
export function hasClaims(r: ReceptionReport | null): boolean {
  return r?.status === 'claims';
}

/**
 * Claims in the order they should be offered — oldest confirmed first.
 *
 * A newer order jumping the queue because somebody opened it first is the unfairness this
 * ordering exists to prevent, so the sort is not a UI preference.
 */
export function claimsOldestFirst(line: ReceptionLine | null): ReceptionClaim[] {
  const claims = line?.claims ?? [];
  return [...claims].sort((a, b) => a.confirmed_at.localeCompare(b.confirmed_at));
}

/**
 * How much of this receipt is already spoken for.
 *
 * Against the OUTSTANDING quantity on each claim, not the ordered one: a line half-delivered
 * already wants only the other half.
 */
export function claimedQuantity(line: ReceptionLine | null): number {
  return (line?.claims ?? [])
    .filter((c) => c.linked_to_this)
    .reduce((a, c) => a + (c.outstanding ?? 0), 0);
}

/**
 * A sales line whose link ended.
 *
 * Odoo severs the link on a cancelled RFQ and nothing replaces it, so the line looks satisfied.
 * Here a severed link is a fact with a reason, and this is how a screen tells the two apart.
 */
export function linkIsSevered(line: { link_severed_at?: string | null }): boolean {
  return !!line.link_severed_at;
}
