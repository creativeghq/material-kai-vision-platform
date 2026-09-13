/**
 * Selections against a frozen allowance, and what the difference becomes (#431).
 *
 * "The customer picks from the range we stock, against a per-room budget, and the difference
 * becomes money." An allowance you can edit afterwards is not a budget — it is a note, and every
 * overage disappears the moment somebody raises the number. Import-free so the predicates can be
 * tested without a client.
 */

export type SelectionStatus = 'proposed' | 'client_approved' | 'declined' | 'ordered';

export type SelectionPositionStatus =
  | 'ok' | 'overage_unbilled' | 'unpriced_selections' | 'unfrozen' | 'no_allowances' | 'no_project';

export interface AllowanceRow {
  allowance_id: string;
  label: string;
  room_id: string | null;
  room_name: string | null;
  category_key: string | null;
  amount: number;
  currency: string;
  frozen_at: string | null;
  selected: number;
  variance: number;
  selections: number;
  unpriced: number;
  client_approved: number;
  billed_as_variation: number;
}

export interface SelectionPosition {
  project_id: string;
  status: SelectionPositionStatus;
  reason: string;
  allowance_total: number;
  selected_total: number;
  overage_total: number;
  underage_total: number;
  rows: AllowanceRow[];
}

export interface ProjectSelection {
  id: string;
  allowance_id: string | null;
  room_id: string | null;
  product_id: string | null;
  stock_pool_id: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  currency: string;
  status: SelectionStatus;
  client_approved_at: string | null;
  order_item_id: string | null;
  variation_id: string | null;
}

export interface ClientViewSettings {
  client_sees_specs: boolean;
  client_sees_pricing: boolean;
  client_sees_cost: boolean;
}

export const SELECTION_STATUS_LABEL: Record<SelectionStatus, string> = {
  proposed: 'Proposed',
  client_approved: 'Approved by the client',
  declined: 'Declined',
  ordered: 'Ordered',
};

export const POSITION_LABEL: Record<SelectionPositionStatus, string> = {
  ok: 'Every allowance is settled',
  overage_unbilled: 'Over budget with no change order',
  unpriced_selections: 'Selections with no price',
  unfrozen: 'Allowances not frozen',
  no_allowances: 'No allowance set',
  no_project: 'No such project',
};

/** An allowance is only a budget once it is frozen. Until then the variance is movable. */
export const allowanceIsFrozen = (a: Pick<AllowanceRow, 'frozen_at'>): boolean => !!a.frozen_at;

export const isOverage = (a: Pick<AllowanceRow, 'variance'>): boolean => a.variance > 0;

export const isUnderage = (a: Pick<AllowanceRow, 'variance'>): boolean => a.variance < 0;

/**
 * An overage becomes a change order. An UNDERAGE does not: it is the customer's money, and
 * quietly keeping it is the shape this whole object exists to prevent in the other direction.
 */
export const overageNeedsBilling = (a: AllowanceRow): boolean =>
  isOverage(a) && a.billed_as_variation === 0;

export const positionNeedsAttention = (p: SelectionPosition | null): boolean =>
  !!p && p.status !== 'ok';

/** A total built over unpriced lines is a FLOOR, never the figure. */
export const totalIsAFloor = (p: SelectionPosition | null): boolean =>
  !!p && p.rows.some((r) => r.unpriced > 0);

/**
 * Cost is a separate answer from price. The price is what they pay and the cost is what we paid;
 * one board showing both is a different conversation, so it defaults off.
 */
export const clientMaySeeCost = (s: ClientViewSettings | null): boolean => !!s && s.client_sees_cost;

export const FROZEN_IS_THE_POINT =
  'An allowance is frozen when the estimate goes out, and its amount cannot move afterwards. That '
  + 'is what makes an overage real money rather than a number somebody adjusted.';

export const UNDERAGE_IS_NOT_A_CHANGE_ORDER =
  'An underage is the customer’s money. It is reported, never billed.';

/** Buildertrend's split: raised is not approved, and unapproved money is not a spend. */
export const COMMITTED_VS_PENDING =
  'Pending is a purchase order nobody has approved. It is shown apart from committed cost and is '
  + 'not added into the total, because an unapproved order is not yet money spent.';
