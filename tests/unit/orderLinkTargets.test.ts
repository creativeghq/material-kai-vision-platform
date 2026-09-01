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
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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
  /**
   * DISCOVERED, never listed. A hand-kept array of call sites is a list of the sites somebody
   * already looked at: `EditSupplierBillDialog` mounted this picker (#378 L1) and would have been
   * exempt from every rule below purely by not being typed into a constant. Any file that renders
   * an `<OrderLinkPicker>` is judged, from the moment it does.
   */
  const CALLERS = (() => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!e.name.endsWith('.tsx')) continue;
        const src = readFileSync(full, 'utf8');
        if (src.includes('<OrderLinkPicker')) found.push(relative(ROOT, full).replace(/\\/g, '/'));
      }
    };
    walk(join(ROOT, 'src'));
    return found.sort();
  })();

  it('finds the mounts at all — an empty sweep would vacuously pass every rule below', () => {
    expect(CALLERS.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * Does this call site actually DO something with `kind`?
   *
   * Two handler shapes were recognised originally — an inline dispatch that decides on the spot,
   * and a plain setter that defers to the file's save path. A third is just as correct and was
   * being failed: the idiomatic discriminated-union `switch (v.kind) { case 'trip': … }`. The
   * receiver is matched loosely (`.kind ===`) rather than pinned to the name `link`, because what
   * the handler calls its parameter is not the invariant.
   */
  function handlesKind(usage: string, src: string, kind: string, inlineDispatch: boolean): boolean {
    if (inlineDispatch) return new RegExp(`kind === '${kind}'`).test(usage);
    if (new RegExp(`\\.kind === '${kind}'`).test(src)) return true;
    // A `case` label only counts inside a file that switches on a `.kind` — otherwise any
    // unrelated string switch in the file would vouch for a handler that does not exist.
    return /switch\s*\([^)]*\.kind\)/.test(src) && new RegExp(`case '${kind}':`).test(src);
  }

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

        const inlineDispatch = /onChange=\{\([^)]*\)\s*=>\s*\{[\s\S]*?kind === '/.test(usage);
        const handled = handlesKind(usage, src, 'customer', inlineDispatch);
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
    // Open orders of either type, as a FILING target — "this cost is for that commitment"
    // (#378 D5). Distinct from every other order row the picker offers: `sales_order` sets
    // `covers_order_id`, `merge_order` appends lines, `cost_of_order` books a bill on a purchase
    // order. None of them could say this, which is why the trip line kept two bare `<Select>`s.
    { prop: 'allowOrder', kind: 'order' },
  ];

  /**
   * This list is HAND-KEPT, and the previous version of this comment claimed the rule was
   * "generalised over the opt-in groups so a future one inherits it". It was not: adding
   * `allowOrder` to the picker and deleting its handler left every case here green, because a
   * group the list does not name is a group this file cannot see.
   *
   * So the list is now checked against the component. A new `allowX` prop must be added here in
   * the same change, which is the two-line edit the comment above assumed — and if it is
   * forgotten, this fails instead of quietly covering three groups out of four.
   */
  it('the opt-in list names every opt-in prop the picker actually has', () => {
    const picker = read(join(ROOT, 'src/modules/finance/components/OrderLinkPicker.tsx'));
    const declared = [...picker.matchAll(/^\s{2}(allow[A-Z]\w*)\?: boolean;/gm)].map((m) => m[1]);
    // `allowProject`, `allowCustomer`, `allowMerge` and `allowRaiseCustomerOrder` default to ON or
    // are covered by the always-on kinds; only the ones defaulting to false are opt-in.
    const optIn = declared.filter((d) => new RegExp(`${d} = false`).test(picker));
    const named = new Set(OPT_IN_GROUPS.map((g) => g.prop));
    const missing = optIn.filter((d) => !named.has(d));
    expect(
      missing,
      `OPT_IN_GROUPS does not name: ${missing.join(', ')}. A group this list does not know about `
      + 'is a group whose callers are never checked for handling its kind — which is exactly how '
      + 'an unhandled row ships.',
    ).toEqual([]);
  });

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
          const handled = handlesKind(usage, src, kind, inlineDispatch);
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

  it('the recurring template stamps them onto every generated bill, not just the first', () => {
    const body = methodBody(fin, 'createRecurringExpense');
    expect(body).toContain('trip_report_id: input.tripReportId');
    expect(body).toContain('property_id: input.propertyId');
  });

  /**
   * #378 L1 — the same link, re-answered after the bill exists. Before this, "what is this for?"
   * could only be written at creation, so a cost that arrived after its goods (freight, customs,
   * an installer) could reach its order only from the ORDER's side, which requires already
   * knowing which order it was.
   *
   * The invariant that matters here is that the five columns move as ONE SET. A patch able to
   * carry three of them can leave a bill booked to a job AND to somebody else's sales order —
   * two answers to a question that has one, and both of them valid uuids.
   */
  it('an existing expense can be re-pointed, and all five columns move together', () => {
    const body = methodBody(fin, 'updateSupplierBillMeta');
    expect(body, 'the link must arrive as one nested object, not five independent optional keys')
      .toMatch(/if\s*\(patch\.link\)/);
    for (const col of ['project_id', 'order_id', 'covers_order_id', 'trip_report_id', 'property_id']) {
      expect(body, `updateSupplierBillMeta does not write ${col}`).toContain(`row.${col} = patch.link.`);
    }
    // Assigned straight through, so `null` reaches the column: a truthiness guard here would make
    // every link settable and none of them removable.
    expect(body).not.toMatch(/row\.(project_id|order_id|covers_order_id|trip_report_id|property_id)\s*=\s*patch\.link\.\w+\s*\|\|/);
  });

  it('the payables row points at the dialog that now carries the link', () => {
    const page = read(join(ROOT, 'src/pages/Admin/FinancePage.tsx'));
    expect(page, 'the AP row should open EditSupplierBillDialog').toContain('EditSupplierBillDialog');
    const dialog = read(join(ROOT, 'src/modules/finance/components/EditSupplierBillDialog.tsx'));
    expect(dialog, 'the edit dialog should mount the link picker').toContain('<OrderLinkPicker');
  });

  /**
   * The bug this exists to stop: a one-off expense files correctly, its "Repeat" twin inherits
   * only SOME of the link, and from the second bill onward the cost floats — looking perfectly
   * correct the whole time, because a missing uuid is a valid null. Derived from the one-off call
   * rather than hard-coded, so a fifth link added later inherits the rule instead of quietly
   * skipping the repeat.
   */
  const RECURRING_LINK_EXEMPT: Record<string, string> = {
    // `finance_recurring_expenses` has no covers_order_id, deliberately: a covers link points at
    // ONE customer sales order, which a template generating bills forever has no business pinning.
    coversOrderId: 'no column, and a repeating cost should not pin one customer order',
  };

  it('the repeat inherits every filing link the one-off expense sets', () => {
    const src = read(join(ROOT, 'src/modules/finance/components/NewExpenseDialog.tsx'));
    const argsOf = (call: string) => {
      const i = src.indexOf(call);
      expect(i, `${call} should be called from NewExpenseDialog`).toBeGreaterThan(-1);
      // Argument object up to its closing `});` — both calls are the sole statement of their line.
      const rest = src.slice(i);
      const end = rest.indexOf('\n      });') >= 0 ? rest.indexOf('\n      });') : rest.indexOf('});');
      return rest.slice(0, end);
    };
    const oneOff = argsOf('financeService.createExpense({');
    const repeat = argsOf('financeService.createRecurringExpense({');

    const LINK_KEYS = ['projectId', 'orderId', 'coversOrderId', 'tripReportId', 'propertyId'];
    const missing = LINK_KEYS
      .filter((k) => new RegExp(`\\b${k}:`).test(oneOff))
      .filter((k) => !RECURRING_LINK_EXEMPT[k])
      .filter((k) => !new RegExp(`\\b${k}:`).test(repeat));
    expect(
      missing,
      `the one-off expense files ${missing.join(', ')} but the recurring template does not — `
        + 'every generated bill after the first would arrive unattributed',
    ).toEqual([]);
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

/**
 * One name for a building, platform-wide.
 *
 * There were FOUR answers, and the differences were not stylistic: `'Untitled property'` in the
 * finance link surfaces, `'Untitled listing'` on the workbench header and the portfolio row,
 * `'Untitled'` in the portfolio's own property select, and a `title || name || reference_code`
 * chain in the CRM pipeline subject picker that covered properties and projects with one
 * expression. So one untitled building was called three different things depending on which
 * screen you were standing on, and only one of the four ever fell back to the ADDRESS — the thing
 * a person actually recognises a building by.
 *
 * `@/utils/propertyLabel` is now the only source, in two documented shapes:
 *   • `propertyLabel` — a self-contained string (dropdown row, link field, board card); falls
 *     through to the reference code, because a bare code beats "Untitled property".
 *   • `propertyName`  — for a surface that ALREADY prints the reference beside it; stops before
 *     the code so the same string is not rendered twice in one control.
 *
 * DISCOVERED, not listed. A hand-kept file list is a list of the files somebody already looked at.
 */
describe('a property has one name', () => {
  const NAMING_SITES = (() => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const rel = relative(ROOT, full).replace(/\\/g, '/');
        if (rel === 'src/utils/propertyLabel.ts') continue;             // the source itself
        if (rel === 'src/integrations/supabase/types.ts') continue;     // generated
        found.push(rel);
      }
    };
    walk(join(ROOT, 'src'));
    return found;
  })();

  it('finds files at all — an empty sweep would vacuously pass', () => {
    expect(NAMING_SITES.length).toBeGreaterThan(100);
  });

  it('nobody re-rolls the fallback chain', () => {
    const offenders: string[] = [];
    for (const rel of NAMING_SITES) {
      const src = read(join(ROOT, rel));
      // The two shapes a hand-rolled copy takes. A caller of the helper is a call expression and
      // cannot match either.
      if (/\baddress\b[^\n]*\|\|[^\n]*\breference_code\b/.test(src)) {
        offenders.push(`${rel}: hand-rolls title -> address -> reference_code — call propertyLabel()`);
      }
      // The invented fallback words. `dealLabel` legitimately reads `d.property?.title` on its way
      // to a company/contact fallback and is NOT a property name, so only the terminal string is
      // forbidden — that is the part that has to agree across screens.
      if (/\|\|\s*'Untitled listing'/.test(src)) {
        offenders.push(`${rel}: says 'Untitled listing' — the platform word is 'Untitled property'`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the surfaces that resolve a stored property use the shared helper', () => {
    const LINK_SURFACES = [
      'src/modules/finance/components/OrdersPanel.tsx',
      'src/modules/finance/components/OrderLinkPicker.tsx',
      'src/modules/finance/components/EditSupplierBillDialog.tsx',
      'src/modules/finance/components/NewExpenseDialog.tsx',
    ];
    for (const rel of LINK_SURFACES) {
      const src = read(join(ROOT, rel));
      if (!/kind: 'property'/.test(src)) continue;   // this surface never labels one
      expect(src, `${rel} builds a property link value without propertyLabel()`)
        .toContain('propertyLabel(');
    }
  });

  it('finance re-exports the helper rather than owning a second definition of it', () => {
    const svc = read(ORDERS_SERVICE);
    expect(svc, 'ordersService should re-export propertyLabel, not define it')
      .toMatch(/export \{ propertyLabel \} from '@\/utils\/propertyLabel'/);
    expect(svc, 'ordersService still contains its own propertyLabel body')
      .not.toMatch(/export function propertyLabel/);
  });
});

/**
 * The agent can file an expense the same way the form can — and, crucially, cannot INVENT the
 * thing it files against.
 *
 * `resolveCategory` and `resolvePayee` in the same file are find-or-create, and rightly so: those
 * are labels, and a new one costs nothing. A trip card and a property are RECORDS. An agent that
 * conjured "the Athens trip" because the expense mentioned Athens would fabricate a claim nobody
 * filed, and every later expense would file against the fake one — while every message the
 * operator saw said it had worked.
 */
describe('the agent files expenses, and never invents what it files against', () => {
  const TOOLS = join(ROOT, 'supabase/functions/_shared/tools/expense-tools.ts');

  /** The resolver body, up to the next top-level declaration. */
  function resolverBody(src: string): string {
    const start = src.indexOf('async function resolveFilingTarget');
    expect(start, 'resolveFilingTarget should exist').toBeGreaterThan(-1);
    const rest = src.slice(start);
    const end = rest.search(/\n(?:export |\/\/ ─|async function |function )/);
    return end > 0 ? rest.slice(0, end) : rest;
  }

  it('record_expense offers both filing links', () => {
    const src = read(TOOLS);
    expect(src).toMatch(/trip:\s*z\.string\(\)\.optional\(\)/);
    expect(src).toMatch(/property:\s*z\.string\(\)\.optional\(\)/);
  });

  it('and writes them to the columns the reverse views read', () => {
    const src = read(TOOLS);
    expect(src).toContain('trip_report_id: tripRef?.id ?? null');
    expect(src).toContain('property_id: propRef?.id ?? null');
  });

  it('the filing resolver never creates a row', () => {
    const body = resolverBody(read(TOOLS));
    expect(body, 'resolveFilingTarget must look a target up, never create one')
      .not.toMatch(/\.insert\(/);
    expect(body, 'an unmatched target must be reported, not invented').toMatch(/rows\.length === 0/);
    expect(body, 'an ambiguous target must be reported, not guessed').toMatch(/rows\.length > 1/);
  });

  /**
   * Resolution happens BEFORE the insert. The other order books a real payable and then fails to
   * file it — leaving a bill whose entire purpose was to sit on a trip card, and an agent
   * reporting a partial success it has no way to undo.
   */
  it('resolves the targets before the bill is inserted', () => {
    const src = read(TOOLS);
    const resolveAt = src.indexOf('resolveFilingTarget(workspaceId');
    const insertAt = src.indexOf("from('supplier_bills').insert(");
    expect(resolveAt, 'the resolver is never called from record_expense').toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(resolveAt, 'the bill is inserted before its filing target is resolved').toBeLessThan(insertAt);
  });
});
