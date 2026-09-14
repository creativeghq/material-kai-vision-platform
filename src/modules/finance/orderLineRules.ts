/**
 * The order-line status ladder, its eight dates, and the counter's fulfilment modes (#432, #434).
 *
 * IMPORT-FREE on purpose. A line had quantities and no status, and for a kitchen or bathroom job
 * the status is what the customer is actually asking about.
 */

export type LineStatus =
  | 'specified'
  | 'approved'
  | 'ordered'
  | 'acknowledged'
  | 'shipped'
  | 'received'
  | 'delivered'
  | 'installed'
  | 'damaged'
  | 'cancelled';

/** The ladder, in order. `damaged` and `cancelled` are outcomes, not rungs. */
export const LINE_LADDER: LineStatus[] = [
  'specified', 'approved', 'ordered', 'acknowledged', 'shipped', 'received', 'delivered', 'installed',
];

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  specified: 'Specified',
  approved: 'Approved',
  ordered: 'Ordered',
  acknowledged: 'Acknowledged',
  shipped: 'Shipped',
  received: 'Received',
  delivered: 'Delivered',
  installed: 'Installed',
  damaged: 'Damaged',
  cancelled: 'Cancelled',
};

export type FulfilmentType = 'collect_now' | 'delivered' | 'direct_order' | 'quotation' | 'credit';

/**
 * Five modes, chosen per LINE.
 *
 * One ticket can be goods taken, goods delivered and goods returned at once — which is what a
 * trade counter actually is, and why this is not a property of the document.
 */
export const FULFILMENT_LABEL: Record<FulfilmentType, string> = {
  collect_now: 'Collect now',
  delivered: 'Deliver',
  direct_order: 'Direct from supplier',
  quotation: 'Quote only',
  credit: 'Return / credit',
};

/** The eight dates Programa carries per line: logistics and BOTH sides of the money. */
export const LINE_DATE_FIELDS = [
  { key: 'ordered_on', label: 'Ordered', side: 'logistics' },
  { key: 'shipped_on', label: 'Shipped', side: 'logistics' },
  { key: 'delivery_on', label: 'Delivery', side: 'logistics' },
  { key: 'install_on', label: 'Install', side: 'logistics' },
  { key: 'client_deposit_on', label: 'Client deposit', side: 'money' },
  { key: 'supplier_deposit_on', label: 'Supplier deposit', side: 'money' },
  { key: 'client_balance_on', label: 'Client balance', side: 'money' },
  { key: 'supplier_balance_on', label: 'Supplier balance', side: 'money' },
] as const;

export type LineDateKey = typeof LINE_DATE_FIELDS[number]['key'];

export type QueueBucket = 'overdue' | 'today' | 'this_week' | 'next_week' | 'later' | 'undated';

export const BUCKET_LABEL: Record<QueueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  this_week: 'This week',
  next_week: 'Next week',
  later: 'Later',
  undated: 'No date promised',
};

export interface QueueRow {
  order_item_id: string;
  description: string | null;
  order_number: string | null;
  order_type: string;
  line_status: LineStatus | null;
  tracking_reference: string | null;
  due_on: string | null;
  bucket: QueueBucket;
}

export interface WorkQueue {
  status: 'ok' | 'nothing_open';
  as_of?: string;
  overdue?: number;
  today?: number;
  this_week?: number;
  next_week?: number;
  later?: number;
  undated?: number;
  rows?: QueueRow[];
  reason: string;
}

/**
 * A line with no date is not on time.
 *
 * Nothing can be late if nothing was promised, so an undated line is its own bucket rather than
 * being sorted to the bottom of "later" where it reads as comfortable.
 */
export function lineIsUndated(r: QueueRow): boolean {
  return r.bucket === 'undated';
}

/** Whether an outcome has taken the line off the ladder. */
export function isTerminalStatus(s: LineStatus | null | undefined): boolean {
  return s === 'installed' || s === 'cancelled' || s === 'damaged';
}

/**
 * `damaged` is a first-class outcome, not a note.
 *
 * On tile it is the common case, and it has to reach a supplier claim rather than being absorbed
 * as a quantity adjustment that leaves no trace of what happened.
 */
export function needsSupplierClaim(s: LineStatus | null | undefined): boolean {
  return s === 'damaged';
}

/** How far up the ladder a line has got, for a progress reading. `null` for an outcome. */
export function ladderPosition(s: LineStatus | null | undefined): number | null {
  if (!s) return null;
  const i = LINE_LADDER.indexOf(s);
  return i < 0 ? null : i;
}
