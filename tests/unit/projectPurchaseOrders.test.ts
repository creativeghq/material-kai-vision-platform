/**
 * Made-to-order items becoming real purchase orders (#378 C2).
 *
 * Before this, a door or a window carried a supplier, a spec and a price and produced a PDF that
 * got emailed. That was the whole path — so the committed cost was invisible to the job's P&L,
 * nothing could be received against them, three-way match had nothing to match, and the supplier
 * could not acknowledge or give an ETA through the portal they already have. On the longest-lead,
 * most expensive items on the job.
 *
 * This CALLS the planner rather than grepping the service, because grouping and exhaustiveness are
 * behavioural properties. A text guard has already failed this codebase twice by accepting a
 * same-shaped helper in place of the real one.
 *
 * What it protects, in order of expense:
 *   1. An item silently dropped. "3 ordered" while the fourth is left behind is discovered on
 *      fitting day, which is the most expensive day to discover it.
 *   2. Two currencies on one order. One order carries one currency; converting silently is the
 *      money bug this platform keeps finding.
 *   3. The same door ordered twice.
 */
import { describe, it, expect } from 'vitest';
import { planPurchaseOrders, type PurchaseItemForOrder } from '@/modules/projects/utils/purchaseOrders';

const SUPPLIER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUPPLIER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

let seq = 0;
function item(over: Partial<PurchaseItemForOrder> = {}): PurchaseItemForOrder {
  seq += 1;
  return {
    id: `item-${seq}`,
    item_type: 'door',
    name: `Door ${seq}`,
    quantity: 1,
    unit_cost: 100,
    currency: 'EUR',
    supplier_company_id: SUPPLIER_A,
    details: {},
    order_id: null,
    ...over,
  };
}

describe('what can be ordered', () => {
  it('an item with a supplier and a cost is ordered', () => {
    const plan = planPurchaseOrders([item()]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].items).toHaveLength(1);
    expect(plan.skipped).toEqual([]);
  });

  it('an item with no supplier is REPORTED, never dropped — there is nobody to send a PO to', () => {
    const plan = planPurchaseOrders([item({ supplier_company_id: null, name: 'Orphan door' })]);
    expect(plan.groups).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].name).toBe('Orphan door');
    expect(plan.skipped[0].reason).toMatch(/supplier/i);
  });

  it('an item with no unit cost is REPORTED — it would reach a supplier priced at zero', () => {
    const plan = planPurchaseOrders([item({ unit_cost: null, name: 'Unpriced window' })]);
    expect(plan.groups).toHaveLength(0);
    expect(plan.skipped[0].reason).toMatch(/cost/i);
  });

  it('a zero cost is a PRICE, not a missing one, and is ordered', () => {
    // null means "nobody has priced this yet"; 0 means "the supplier is not charging for it"
    // (a warranty replacement, a sample). Conflating them either blocks a legitimate order or
    // sends a real one out at nothing.
    const plan = planPurchaseOrders([item({ unit_cost: 0 })]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.skipped).toEqual([]);
  });

  it('an item already on an order is REPORTED — the same door must not be ordered twice', () => {
    const plan = planPurchaseOrders([item({ order_id: 'existing-order', name: 'Already ordered' })]);
    expect(plan.groups).toHaveLength(0);
    expect(plan.skipped[0].reason).toMatch(/already/i);
  });

  it('every input is accounted for — ordered or reported, never neither', () => {
    const items = [
      item(),
      item({ supplier_company_id: null }),
      item({ unit_cost: null }),
      item({ order_id: 'x' }),
      item({ supplier_company_id: SUPPLIER_B }),
    ];
    const plan = planPurchaseOrders(items);
    const accounted = plan.groups.reduce((n, g) => n + g.items.length, 0) + plan.skipped.length;
    expect(accounted, 'an item that is neither ordered nor reported has vanished').toBe(items.length);
  });
});

describe('how items group onto orders', () => {
  it('one order per supplier — that is what a supplier can acknowledge and bill', () => {
    const plan = planPurchaseOrders([
      item({ supplier_company_id: SUPPLIER_A }),
      item({ supplier_company_id: SUPPLIER_B }),
      item({ supplier_company_id: SUPPLIER_A }),
    ]);
    expect(plan.groups).toHaveLength(2);
    const a = plan.groups.find((g) => g.supplierCompanyId === SUPPLIER_A);
    expect(a?.items).toHaveLength(2);
  });

  it('one supplier billing in two currencies gets two orders, never one mixed order', () => {
    const plan = planPurchaseOrders([
      item({ currency: 'EUR' }),
      item({ currency: 'GBP' }),
    ]);
    expect(plan.groups, 'an order carries ONE currency; converting silently is a money bug').toHaveLength(2);
    expect(new Set(plan.groups.map((g) => g.currency))).toEqual(new Set(['EUR', 'GBP']));
  });

  it('a blank currency falls back to EUR rather than opening a third group', () => {
    const plan = planPurchaseOrders([item({ currency: '' }), item({ currency: 'EUR' })]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].currency).toBe('EUR');
  });

  it('nothing selected produces nothing — no empty order is raised', () => {
    const plan = planPurchaseOrders([]);
    expect(plan.groups).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });
});
