/**
 * Order-link guard.
 *
 * "What is this cost for?" resolves to four different writes, and two of them look identical in the
 * UI while doing opposite things to money:
 *
 *   • MERGE  — append these lines to an order that already exists
 *   • LINK   — point at a customer's sales order via `covers_order_id`, writing nothing into it
 *
 * A sales order settles on money IN; a purchase order settles on money OUT. So appending
 * purchase-cost lines to a customer's sales order bills the customer what we paid our supplier —
 * a wrong number that is a perfectly valid number, invisible to typecheck and to every stored-data
 * integrity check, exactly like the settlement bug that `moneyDerivation.test.ts` exists to stop.
 *
 * Two invariants keep that impossible, and this file fails the build if either is removed:
 *
 *   1. Merging goes through `append_order_items` and always declares the type it expects. The RPC
 *      refuses the mismatch, so the rule lives in the database rather than in a caller's good
 *      intentions.
 *   2. Merging never goes through `updateItems`, which DELETEs every line and re-inserts it.
 *      `stock_allocations.demand_id` points at `order_items.id`, so a delete silently drops the
 *      order's stock reservations and its `quantity_delivered` along with them.
 *
 * Plus: order line totals are derived in SQL (`recompute_order_totals`), so a merged order and a
 * created order cannot end up rated by two different rules.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const ORDERS_SERVICE = join(ROOT, 'src/modules/finance/services/ordersService.ts');
const ORDERS_PANEL = join(ROOT, 'src/modules/finance/components/OrdersPanel.tsx');
const LINK_PICKER = join(ROOT, 'src/modules/finance/components/OrderLinkPicker.tsx');

/** Strip comments so prose describing the rule doesn't satisfy a check about the code. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

/** The body of a named method in the service object, up to the next top-level method. */
function methodBody(src: string, name: string): string {
  const start = src.indexOf(`async ${name}(`);
  expect(start, `ordersService.${name} should exist`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.search(/\n {2}(?:async )?[a-zA-Z_$][\w$]*\(|\n {2}\/\*\*/);
  return end > 0 ? rest.slice(0, end) : rest;
}

describe('merging lines into an existing order', () => {
  const svc = read(ORDERS_SERVICE);

  it('appends via append_order_items, never by re-writing the whole line set', () => {
    const body = methodBody(svc, 'appendItems');
    expect(body).toContain('append_order_items');
    // The destructive path: delete-then-reinsert. It is correct for updateItems and catastrophic here.
    expect(body).not.toMatch(/\.delete\(\)/);
    expect(body).not.toContain('updateItems');
  });

  it('declares the order type it expects, so the database refuses a cross-direction merge', () => {
    const body = methodBody(svc, 'appendItems');
    expect(body).toContain('p_expect_order_type');
  });

  it('the merge call site passes the target order type through rather than assuming one', () => {
    const panel = read(ORDERS_PANEL);
    const call = panel.slice(panel.indexOf('ordersService.appendItems'));
    expect(call.slice(0, 400)).toMatch(/expectOrderType:\s*link\.orderType/);
  });

  /**
   * A merge creates no order. If the save path ever fell through to `create` as well, one purchase
   * would be booked twice — once merged into the target and once as a brand-new order.
   */
  it('returns instead of falling through to create()', () => {
    const panel = read(ORDERS_PANEL);
    expect(panel).toContain("link.kind === 'merge_order'");
    // Anchored to the SUCCESS path specifically. An earlier version of this test looked for any
    // `return;` in the branch and was satisfied by the `if (!merged.ok) { … return; }` guard above
    // it — so deleting the real one left the test green while every merge also created an order.
    expect(panel).toMatch(/onCreated\(link\.orderId\);\s*return;/);
  });
});

describe('a customer sales order is linked, never merged into', () => {
  it('the picker maps a customer order to covers_order_id and a merge row to merge_order', () => {
    const picker = read(LINK_PICKER);
    // The customer group can only ever produce 'customer' (raise one) or 'sales_order' (link one).
    const customerGroup = picker.slice(picker.indexOf('customers.map('), picker.indexOf('mergeTargets.map('));
    expect(customerGroup).toContain("kind: 'sales_order'");
    expect(customerGroup).not.toContain("kind: 'merge_order'");
  });

  it('sets covers_order_id — not order_id — when a cost is booked for a customer order', () => {
    // supplier_bills.order_id is the PURCHASE order a bill invoices; compute_three_way_match joins
    // on it. Reusing it for the demand link would corrupt the match.
    const fin = read(join(ROOT, 'src/modules/finance/services/financeService.ts'));
    expect(fin).toContain('covers_order_id: input.coversOrderId');
    expect(fin).toContain('order_id: input.orderId');
  });
});

/**
 * The picker offers four kinds; a caller that renders a kind it does not handle ships a menu item
 * that silently does nothing. The order detail panel did exactly that in an earlier revision: it
 * offered "New sales order for X" while its onChange only understood project / sales_order / none.
 */
describe('every offered link kind is handled by its call site', () => {
  const CALLERS = [
    'src/modules/finance/components/OrdersPanel.tsx',
    'src/modules/finance/components/NewExpenseDialog.tsx',
  ];

  it('a caller that offers "raise a customer order" actually creates one', () => {
    const offenders: string[] = [];
    for (const rel of CALLERS) {
      const src = read(join(ROOT, rel));
      // Each <OrderLinkPicker …> usage is judged on its OWN handler. A file-level search is not
      // enough: OrdersPanel mounts two pickers, and the new-order form's handling of 'customer'
      // would otherwise vouch for the detail panel's handler, which does not handle it at all.
      for (const m of src.matchAll(/<OrderLinkPicker\b[\s\S]*?\/>/g)) {
        const usage = m[0];
        if (/allowRaiseCustomerOrder=\{false\}/.test(usage) || /allowCustomer=\{false\}/.test(usage)) continue;

        // Two handler shapes. An INLINE dispatch decides on the spot, so it must cover 'customer'
        // itself; a plain setter defers to the save path, so the file must cover it.
        const inlineDispatch = /onChange=\{\([^)]*\)\s*=>\s*\{[\s\S]*?kind === '/.test(usage);
        const handled = inlineDispatch
          ? /kind === 'customer'/.test(usage)
          : /link\.kind === 'customer'/.test(src);
        if (!handled) {
          offenders.push(`${rel}: a picker offers "New sales order for …" but its handler ignores kind === 'customer'`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * The opt-in groups. Each defaults to OFF precisely because a caller that offers a row it does
   * not handle ships a row that silently does nothing — click it and the field closes having
   * changed nothing at all. Same shape as an AgentHub chunk with no `AGENT_RESULT_TITLES` entry,
   * and just as invisible to typecheck: the handler is a valid discriminated-union narrow that
   * simply never mentions the case.
   */
  const OPT_IN_GROUPS: Array<{ prop: string; kind: string }> = [
    { prop: 'allowCostOf', kind: 'cost_of_order' },
    { prop: 'allowTrip', kind: 'trip' },
    { prop: 'allowProperty', kind: 'property' },
  ];

  it('a caller that turns on an opt-in group handles the kind that group emits', () => {
    const offenders: string[] = [];
    for (const rel of CALLERS) {
      const src = read(join(ROOT, rel));
      for (const m of src.matchAll(/<OrderLinkPicker\b[\s\S]*?\/>/g)) {
        const usage = m[0];
        const inlineDispatch = /onChange=\{\([^)]*\)\s*=>\s*\{[\s\S]*?kind === '/.test(usage);
        for (const { prop, kind } of OPT_IN_GROUPS) {
          // "On" means present and not explicitly false. `allowProperty={realEstate}` is ON — a
          // runtime-gated offer still has to be handled for the case where the gate opens.
          const present = new RegExp(`\\b${prop}\\b`).test(usage);
          const off = new RegExp(`\\b${prop}=\\{false\\}`).test(usage);
          if (!present || off) continue;
          const handled = inlineDispatch
            ? new RegExp(`kind === '${kind}'`).test(usage)
            : new RegExp(`link\\.kind === '${kind}'`).test(src);
          if (!handled) {
            offenders.push(`${rel}: a picker sets ${prop} but its handler ignores kind === '${kind}'`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the picker actually renders a row for every opt-in group it advertises', () => {
    const picker = read(LINK_PICKER);
    for (const { prop, kind } of OPT_IN_GROUPS) {
      expect(picker, `OrderLinkPicker accepts ${prop} but never emits kind: '${kind}'`)
        .toMatch(new RegExp(`kind: '${kind}'`));
    }
  });
});

/**
 * Offered → handled → WRITTEN. The first two are covered above; without this one a link can be
 * picked, dispatched, threaded through a service argument and then quietly dropped before the
 * insert — which reads as working right up until someone opens the trip card and finds it empty.
 * A missing uuid is a valid null, so nothing raises.
 */
describe('the filing links reach a column', () => {
  const svc = read(ORDERS_SERVICE);
  const fin = read(join(ROOT, 'src/modules/finance/services/financeService.ts'));

  it('ordersService.create writes both filing links', () => {
    const body = methodBody(svc, 'create');
    expect(body).toContain('trip_report_id: input.tripReportId');
    expect(body).toContain('property_id: input.propertyId');
  });

  it('ordersService.updateMeta can set AND clear both', () => {
    const body = methodBody(svc, 'updateMeta');
    // `!== undefined` rather than a truthiness test: `null` is the "unlink me" instruction, and a
    // truthy guard makes the link one-way — settable, never removable.
    expect(body).toMatch(/patch\.tripReportId !== undefined/);
    expect(body).toMatch(/patch\.propertyId !== undefined/);
    expect(body).toContain('clean.trip_report_id');
    expect(body).toContain('clean.property_id');
  });

  it('a supplier bill carries them too, so a cost can be filed as well as an order', () => {
    const body = methodBody(fin, 'createSupplierBill');
    expect(body).toContain('trip_report_id: input.tripReportId');
    expect(body).toContain('property_id: input.propertyId');
  });
});

describe('order line totals are derived in SQL', () => {
  const svc = read(ORDERS_SERVICE);

  it('create() and updateItems() let recompute_order_totals have the last word', () => {
    expect(methodBody(svc, 'create')).toContain('recompute_order_totals');
    expect(methodBody(svc, 'updateItems')).toContain('recompute_order_totals');
  });

  /**
   * Mirroring a purchase onto the customer's order must re-price through the pricing resolver
   * (pricing pyramid). A house markup invented at the call site would be a second pricing
   * rule competing with the resolver, and the two would disagree the first time a customer got a
   * pricing level.
   */
  it('mirrored sales lines are priced by the resolver, not by an invented markup', () => {
    const body = methodBody(svc, 'mirrorLinesForSale');
    expect(body).toContain('resolveLinePricing');
    expect(body).toMatch(/orderType:\s*'sales'/);
    // No literal multiplier masquerading as a margin.
    expect(body).not.toMatch(/\*\s*1\.\d+/);
  });
});
