/**
 * "What is this cost for?", as it sits on a `supplier_bills` row — the pure half.
 *
 * Five nullable columns answer ONE question, so they are handled as one value: pick a target and
 * exactly one of them is set. A caller able to write three of them can leave a bill booked to a
 * job AND to somebody else's sales order, which are two answers to a question that has one, and
 * both of them valid uuids.
 *
 * This lives outside the dialog so the mapping can be tested by CALLING it. The text-matching
 * guard in `orderLinkTargets.test.ts` cannot tell a real handler from a same-shaped helper: when
 * `linkToColumns` was deliberately broken to prove the guard fired, `linkKey` — sitting in the
 * same file, switching on the same `.kind`, with the same `case` labels — vouched for it and the
 * suite stayed green. Exhaustiveness over a discriminated union is a behavioural property; asking
 * a regex about it gets the answer a regex can give.
 *
 * @see tests/unit/billLink.test.ts
 */
import type { OrderLinkTarget } from '@/modules/finance/services/ordersService';

/** The five link columns as they sit on the row. */
export interface BillLinkColumns {
  project_id: string | null;
  /** The PURCHASE order this bill invoices, or rides along with as a cost of. */
  order_id: string | null;
  /** The SALES order this cost was incurred FOR — never `order_id`, which three-way match joins on. */
  covers_order_id: string | null;
  trip_report_id: string | null;
  property_id: string | null;
}

export const EMPTY_LINK: BillLinkColumns = {
  project_id: null, order_id: null, covers_order_id: null, trip_report_id: null, property_id: null,
};

/** Every column this module owns. Derived from the shape so a sixth link cannot be forgotten. */
export const BILL_LINK_COLUMNS = Object.keys(EMPTY_LINK) as Array<keyof BillLinkColumns>;

/**
 * Identity of a link, for "did the operator actually change this?". Compared rather than the
 * objects themselves because the picker rebuilds its value on every pick and the label is
 * resolved rather than stored — two values naming the same target must compare equal.
 */
export function linkKey(v: OrderLinkTarget): string {
  switch (v.kind) {
    case 'project': return `project:${v.projectId}`;
    case 'cost_of_order': return `cost_of_order:${v.orderId}`;
    case 'sales_order': return `sales_order:${v.orderId}`;
    case 'merge_order': return `merge_order:${v.orderId}`;
    case 'customer': return `customer:${v.party.id}`;
    case 'trip': return `trip:${v.reportId}`;
    case 'property': return `property:${v.propertyId}`;
    default: return 'none';
  }
}

/**
 * The picked value back to columns. Mirrors what `NewExpenseDialog` writes at creation, so a bill
 * edited later and a bill created there end up in the same shape.
 *
 * A cost booked ON an order is reported under that order's job — the same inheritance a linked
 * sales order gets, so the expense does not float unattributed while its order has a project.
 * `trip` and `property` are FILING links and set no project: a property is not a job, and
 * inferring one from the other invents work nobody raised.
 *
 * `merge_order` and `customer` are absent deliberately, not by omission — a bill has no line
 * items to merge, and creating a second document is not something an edit does. The surfaces that
 * offer those kinds turn the corresponding picker groups off, and the exhaustiveness test pins
 * both facts.
 */
export function linkToColumns(v: OrderLinkTarget): BillLinkColumns {
  switch (v.kind) {
    case 'project':
      return { ...EMPTY_LINK, project_id: v.projectId };
    case 'cost_of_order':
      return { ...EMPTY_LINK, order_id: v.orderId, project_id: v.projectId };
    case 'sales_order':
      return { ...EMPTY_LINK, covers_order_id: v.orderId, project_id: v.projectId };
    case 'trip':
      return { ...EMPTY_LINK, trip_report_id: v.reportId };
    case 'property':
      return { ...EMPTY_LINK, property_id: v.propertyId };
    default:
      return { ...EMPTY_LINK };
  }
}

/** Which stored column answers the question, and what it points at. */
export interface BillLinkSubject {
  kind: 'cost_of_order' | 'sales_order' | 'project' | 'property' | 'trip';
  id: string;
}

/**
 * Which column wins when more than one is set — and more than one legitimately is: since #378
 * Phase 1 a bill raised from a purchase order carries BOTH `order_id` and the job it inherited
 * from that order.
 *
 * The order resolves FIRST. It is the more specific answer and it carries the project with it;
 * reading the project first would print a job name over a bill whose real subject is a PO, which
 * is the mistake the order header made when it fed the same control a full link and printed a
 * customer's order number under the word "Project".
 */
export function linkSubject(cols: BillLinkColumns): BillLinkSubject | null {
  if (cols.order_id) return { kind: 'cost_of_order', id: cols.order_id };
  if (cols.covers_order_id) return { kind: 'sales_order', id: cols.covers_order_id };
  if (cols.project_id) return { kind: 'project', id: cols.project_id };
  if (cols.property_id) return { kind: 'property', id: cols.property_id };
  if (cols.trip_report_id) return { kind: 'trip', id: cols.trip_report_id };
  return null;
}
