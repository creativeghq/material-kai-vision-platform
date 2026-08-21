/**
 * "What is this cost for?", re-answered on an expense that already exists (#378 L1).
 *
 * WHY THIS FILE EXISTS, rather than another rule in `orderLinkTargets.test.ts`: that suite proves
 * a call site handles a kind by searching its source for the kind. When `linkToColumns` was
 * deliberately broken to watch the guard fire, it did not fire — `linkKey`, sitting in the same
 * file, switching on the same `.kind`, carrying the same `case` labels, satisfied the search on
 * behalf of the handler that no longer worked. A text guard cannot distinguish a handler from a
 * same-shaped helper, and exhaustiveness over a discriminated union is a behavioural property.
 * So this one CALLS the mapping.
 *
 * What it protects: an expense pointed at an order, a job, a building or a trip, where the wrong
 * column — or a second column left set from the previous answer — is a perfectly valid uuid that
 * nothing raises about, and that quietly moves money onto the wrong job's P&L.
 */
import { describe, it, expect } from 'vitest';
import {
  linkToColumns, linkKey, linkSubject, EMPTY_LINK, BILL_LINK_COLUMNS,
  type BillLinkColumns,
} from '@/modules/finance/utils/billLink';
import type { OrderLinkTarget } from '@/modules/finance/services/ordersService';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ORDER = '22222222-2222-2222-2222-222222222222';
const SALES = '33333333-3333-3333-3333-333333333333';
const TRIP = '44444444-4444-4444-4444-444444444444';
const PROPERTY = '55555555-5555-5555-5555-555555555555';

/** Every kind the dialog's picker can emit, with the column(s) each one must land in. */
const CASES: Array<{ value: OrderLinkTarget; expect: Partial<BillLinkColumns>; why: string }> = [
  {
    value: { kind: 'project', projectId: PROJECT, label: 'Kitchen refit' },
    expect: { project_id: PROJECT },
    why: 'a job',
  },
  {
    value: { kind: 'cost_of_order', orderId: ORDER, projectId: PROJECT, label: 'PO-1' },
    expect: { order_id: ORDER, project_id: PROJECT },
    why: 'a cost ON a purchase order inherits that order\'s job, or it floats unattributed',
  },
  {
    value: { kind: 'sales_order', orderId: SALES, projectId: PROJECT, label: 'SO-1' },
    expect: { covers_order_id: SALES, project_id: PROJECT },
    why: 'covers_order_id, NEVER order_id — three-way match joins on order_id',
  },
  {
    value: { kind: 'trip', reportId: TRIP, label: 'Milan fair' },
    expect: { trip_report_id: TRIP },
    why: 'a filing link: it sets no project, because a trip is not a job',
  },
  {
    value: { kind: 'property', propertyId: PROPERTY, label: '12 Ermou' },
    expect: { property_id: PROPERTY },
    why: 'a filing link: a building is not a job, and inferring one invents work nobody raised',
  },
];

describe('a picked link becomes exactly one answer', () => {
  for (const c of CASES) {
    it(`${c.value.kind} → ${Object.keys(c.expect).join(' + ')} (${c.why})`, () => {
      const cols = linkToColumns(c.value);
      // The columns it must set…
      for (const [k, v] of Object.entries(c.expect)) {
        expect(cols[k as keyof BillLinkColumns], `${c.value.kind} should set ${k}`).toBe(v);
      }
      // …and, just as important, every one it must NOT. A leftover from the previous answer is
      // how a bill ends up booked to a job AND to somebody else's sales order.
      for (const k of BILL_LINK_COLUMNS) {
        if (k in c.expect) continue;
        expect(cols[k], `${c.value.kind} must leave ${k} null`).toBeNull();
      }
    });
  }

  it('clearing the field clears every column, so a link can be removed and not just replaced', () => {
    expect(linkToColumns({ kind: 'none' })).toEqual(EMPTY_LINK);
  });

  /**
   * The two kinds the edit dialog deliberately does not offer. If either ever reaches this
   * mapping it falls to the default and silently wipes the bill's existing link, so the picker
   * groups that emit them MUST stay off there (`allowMerge={false}`, `allowRaiseCustomerOrder={false}`
   * — pinned by orderLinkTargets.test.ts). This records that the blank is a decision.
   */
  it('merge and customer are unmapped on purpose — an edit merges nothing and creates nothing', () => {
    expect(linkToColumns({ kind: 'merge_order', orderId: ORDER, orderType: 'purchase', projectId: null, label: 'x' }))
      .toEqual(EMPTY_LINK);
    expect(linkToColumns({ kind: 'customer', party: { party_type: 'company', id: 'c', name: 'ACME' }, label: 'x' }))
      .toEqual(EMPTY_LINK);
  });
});

describe('which stored column answers the question', () => {
  it('the order wins over the job it carried — the bill\'s subject is the PO', () => {
    // The exact shape #378 Phase 1 now produces: generate_supplier_bill_from_order stamps both.
    const cols: BillLinkColumns = { ...EMPTY_LINK, order_id: ORDER, project_id: PROJECT };
    expect(linkSubject(cols)).toEqual({ kind: 'cost_of_order', id: ORDER });
  });

  it('a job with no order behind it resolves as a job', () => {
    expect(linkSubject({ ...EMPTY_LINK, project_id: PROJECT })).toEqual({ kind: 'project', id: PROJECT });
  });

  it('a covering sales order outranks the job, and never reads as a purchase', () => {
    const cols: BillLinkColumns = { ...EMPTY_LINK, covers_order_id: SALES, project_id: PROJECT };
    expect(linkSubject(cols)).toEqual({ kind: 'sales_order', id: SALES });
  });

  it('nothing set is nothing — never a confident wrong answer', () => {
    expect(linkSubject(EMPTY_LINK)).toBeNull();
  });

  it('round-trips: whatever is picked resolves back to the same subject', () => {
    for (const c of CASES) {
      const subject = linkSubject(linkToColumns(c.value));
      expect(subject, `${c.value.kind} should resolve back to itself`).not.toBeNull();
      expect(subject!.kind).toBe(c.value.kind);
    }
  });
});

describe('change detection', () => {
  it('two values naming the same target compare equal despite different labels', () => {
    // The label is resolved on load and rebuilt on pick, so it differs for the same target. If it
    // counted, merely opening the dialog and saving would rewrite the link every time.
    expect(linkKey({ kind: 'project', projectId: PROJECT, label: 'Kitchen refit' }))
      .toBe(linkKey({ kind: 'project', projectId: PROJECT, label: 'Project' }));
  });

  it('the same id under a different kind is a different answer', () => {
    expect(linkKey({ kind: 'cost_of_order', orderId: ORDER, projectId: null, label: 'x' }))
      .not.toBe(linkKey({ kind: 'sales_order', orderId: ORDER, projectId: null, label: 'x' }));
  });

  it('every kind produces a distinct key, so no change can be mistaken for none', () => {
    const keys = CASES.map((c) => linkKey(c.value)).concat(linkKey({ kind: 'none' }));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
