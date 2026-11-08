/**
 * Selections against a frozen allowance, and what the difference becomes (#431).
 *
 * "The customer picks from the range we stock, against a per-room budget, and the difference
 * becomes money." An allowance you can edit afterwards is not a budget — it is a note, and every
 * overage disappears the moment somebody raises the number. Import-free so the predicates can be
 * tested without a client.
 */

/** The client's decision. How far the ORDER has got is not typed here — see SelectionFulfilment. */
export type SelectionStatus = 'proposed' | 'client_approved' | 'declined';

/** Derived in SQL by `project_selection_fulfilment` from the linked order line. */
export type SelectionFulfilment =
  | 'not_ordered' | 'specified' | 'approved' | 'ordered' | 'acknowledged' | 'shipped'
  | 'received' | 'delivered' | 'installed' | 'damaged' | 'cancelled';

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

/** One row of `project_selection_lines` — every figure on it is derived server-side. */
export interface ProjectSelectionLine {
  id: string;
  allowance_id: string | null;
  allowance_label: string | null;
  room_id: string | null;
  room_name: string | null;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  currency: string;
  status: SelectionStatus;
  client_approved_at: string | null;
  client_approved_name: string | null;
  order_item_id: string | null;
  order_id: string | null;
  order_number: string | null;
  order_type: 'sales' | 'purchase' | null;
  fulfilment: SelectionFulfilment;
  variation_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface SelectionOrderCandidate {
  order_item_id: string;
  order_id: string;
  order_number: string | null;
  order_type: 'sales' | 'purchase';
  description: string | null;
  quantity: number;
  product_match: boolean;
  linked_selection_id: string | null;
  fulfilment: SelectionFulfilment;
}

export const SELECTION_STATUS_LABEL: Record<SelectionStatus, string> = {
  proposed: 'Proposed',
  client_approved: 'Approved by the Client',
  declined: 'Declined',
};

export const FULFILMENT_LABEL: Record<SelectionFulfilment, string> = {
  not_ordered: 'Not Ordered',
  specified: 'On a Draft Order',
  approved: 'Order Approved',
  ordered: 'Ordered',
  acknowledged: 'Acknowledged',
  shipped: 'Shipped',
  received: 'Received',
  delivered: 'Delivered',
  installed: 'Installed',
  damaged: 'Damaged',
  cancelled: 'Order Cancelled',
};

export const FULFILMENT_TONE: Record<SelectionFulfilment, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  not_ordered: 'neutral',
  specified: 'neutral',
  approved: 'info',
  ordered: 'info',
  acknowledged: 'info',
  shipped: 'info',
  received: 'success',
  delivered: 'success',
  installed: 'success',
  damaged: 'error',
  cancelled: 'error',
};

export const POSITION_LABEL: Record<SelectionPositionStatus, string> = {
  ok: 'Every allowance is settled',
  overage_unbilled: 'Over Budget with No Change Order',
  unpriced_selections: 'Selections with No Price',
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

export const FROZEN_IS_THE_POINT =
  'An allowance is frozen when the estimate goes out, and its amount cannot move afterwards. That '
  + 'is what makes an overage real money rather than a number somebody adjusted.';

export const UNDERAGE_IS_NOT_A_CHANGE_ORDER =
  'An underage is the customer’s money. It is reported, never billed.';
