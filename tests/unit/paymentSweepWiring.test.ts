/**
 * The settlement sweep must actually be invoked by the code path that records money.
 *
 * `auto_allocate_workspace` / `_auto_allocate_payment` shipped in 0965287d, which removed the
 * manual "Apply credit" button on the grounds that "money received now lands on what is owed
 * without anyone pointing it there". The RPC was created and granted — but nothing ever called it:
 * not the frontend, not an edge function, not cron. Settlement-by-itself simply did not happen, and
 * because an unallocated payment is a perfectly valid row, nothing complained. ORD-2026-0002 sat
 * with €2,854 received and €0 allocated until a repair migration and a since-deleted button placed
 * it by hand.
 *
 * This is the "silent zero" shape from CLAUDE.md: the mechanism exists, the metric it should move
 * stays at zero, and no typecheck or integrity probe can see it. The only thing that catches a
 * caller-less function is a test that asserts the call site.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const financeService = read('src/modules/finance/services/financeService.ts');
const ordersService = read('src/modules/finance/services/ordersService.ts');
const ordersPanel = read('src/modules/finance/components/OrdersPanel.tsx');
const types = read('src/integrations/supabase/types.ts');

/** Comments describe the history on purpose; only real call sites count. */
const stripComments = (src: string) =>
  sharedStripComments(src).replace(/\{\s*\}/g, '');

/** `recordPayment` is the single funnel — every payment in the app is created through it. */
function recordPaymentBody(src: string): string {
  const start = src.indexOf('async recordPayment(input: {');
  expect(start, 'recordPayment is the one funnel for creating payments — it must exist').toBeGreaterThan(-1);
  // Up to the next top-level service method, which is enough to cover the whole body.
  const end = src.indexOf('\n  async sweepUnallocated', start);
  expect(end, 'recordPayment must be followed by the sweep helper').toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('payment auto-allocation sweep is wired', () => {
  it('recordPayment invokes the sweep, so a payment remainder lands on what is owed', () => {
    expect(recordPaymentBody(financeService)).toMatch(/sweepUnallocated\(/);
  });

  it('the sweep helper calls the RPC that actually places the remainder', () => {
    expect(financeService).toMatch(/rpc\(\s*'auto_allocate_workspace'/);
  });

  it('the RPC is declared in the generated types, or the call cannot compile', () => {
    expect(types).toMatch(/\bauto_allocate_workspace:\s*\{/);
  });

  it('the sweep never fails the payment — the money is already committed when it runs', () => {
    const helper = financeService.slice(financeService.indexOf('async sweepUnallocated'));
    const body = helper.slice(0, helper.indexOf('\n  },'));
    expect(body, 'a throwing sweep would surface as "the payment failed"').toMatch(/catch\s*\(/);
  });
});

/**
 * One placer, not three. Placing money on an order was written three times — record_payment_fx's
 * order remainder, this sweep, and `apply_customer_credit_to_order` behind a per-order button —
 * and only the sweep read `get_order_settlements`. The other two carried their own idea of what an
 * order still owed, which is the duplicate-derivation shape CLAUDE.md and moneyDerivation.test.ts
 * exist to stop. Both dropped RPCs are gone from the database; a call to either now fails at
 * runtime, so re-adding one here must fail at build time instead.
 */
describe('settlement has a single placer', () => {
  const RETIRED = ['apply_customer_credit_to_order', 'get_order_applicable_credit'];

  it.each(RETIRED)('%s is not called from anywhere in the app', (rpc) => {
    for (const [name, src] of Object.entries({ financeService, ordersService, ordersPanel, types })) {
      expect(stripComments(src), `${rpc} was dropped from the database — ${name} would fail at runtime`)
        .not.toMatch(new RegExp(rpc));
    }
  });

  it('no per-order credit-application helper survives on ordersService', () => {
    expect(stripComments(ordersService)).not.toMatch(/async (applyCreditToOrder|getApplicableCredit)\b/);
  });
});
