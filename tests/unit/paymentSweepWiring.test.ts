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

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const financeService = read('src/modules/finance/services/financeService.ts');
const types = read('src/integrations/supabase/types.ts');

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
