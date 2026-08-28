import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

/**
 * Warehouse audit #355 — the three findings the SQL layer cannot see.
 *
 * #355's headline is that this is the best-defended module audited, because it puts its
 * invariants in SQL: `receive_order_into_warehouse` takes `quantity - quantity_shipped` and
 * skips when that is ≤ 0, so a repeat receive cannot double stock; `post_stock_count` refuses a
 * second post; `cancel_stock_count` refuses to cancel a posted one. The double-submit class that
 * is dangerous elsewhere is largely ABSORBED here.
 *
 * These three survived precisely because they are invisible from the database:
 *
 *  • WH-1 — a count posted with quantities that were never saved. `post_stock_count` correctly
 *    refuses a second post, but it cannot know the FIRST one carried stale data.
 *  • WH-2 — stock created with no movement behind it. The balance is valid; the ledger simply
 *    cannot explain it. Fixed with a trigger, so this file only asserts the client is not
 *    reimplementing it.
 *  • WH-3 — two DISTINCT purchase orders. Both are legitimate rows, so no idempotency guard
 *    anywhere can absorb them.
 */

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const COUNTS = 'src/modules/stock/components/StockCountsSection.tsx';
const RESUPPLY = 'src/modules/stock/components/ResupplySection.tsx';
const OVERVIEW = 'src/modules/stock/components/StockOverviewSection.tsx';

describe('#355 WH-1 — a stock count cannot post quantities it never saved', () => {
  const src = read(COUNTS);

  it('post() flushes pending edits before calling postCount', () => {
    // The failure is ordering, so assert ordering: the flush must appear before the post call.
    const flush = src.indexOf('flushPendingEdits()');
    const post = src.indexOf('stockService.postCount(');
    expect(flush, 'post() no longer flushes pending edits').toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(-1);
    expect(
      flush < post,
      'the flush must happen BEFORE postCount — an unsaved line posts as "not counted", '
        + 'produces no adjustment movement, and the physical shortfall is never recorded',
    ).toBe(true);
  });

  it('a failed flush aborts the post rather than posting anyway', () => {
    expect(src).toMatch(/if\s*\(!\(await flushPendingEdits\(\)\)\)/);
    // And it must return, not fall through.
    const branch = src.slice(src.indexOf('if (!(await flushPendingEdits()))'), src.indexOf('stockService.postCount('));
    expect(branch).toContain('return');
  });

  it('the flush waits for in-flight blur saves instead of racing them', () => {
    // Without this, the diff below re-sends edits that a blur save has already started, and the
    // whole point of the flush — that the durable count matches the screen — is not established.
    expect(src).toContain('Promise.allSettled([...inFlight.current])');
  });

  it('it diffs against a ref, not a closed-over `lines`', () => {
    // `flushPendingEdits` compares AFTER an await. A closure over `lines` holds the value from
    // the render that created it, so freshly-saved lines would look stale and be re-sent.
    const fn = src.slice(src.indexOf('const flushPendingEdits'), src.indexOf('const post ='));
    expect(fn).toContain('linesRef.current');
    expect(fn).not.toMatch(/\blines\.filter\b/);
  });

  it('a failed save rolls the input back', () => {
    // `variance()` reads `drafts`, so a kept-but-unsaved value shows a correction that does not
    // exist — the worst possible lie for the mechanism that corrects stock drift.
    const fn = src.slice(src.indexOf('const saveLine'), src.indexOf('const flushPendingEdits'));
    const cat = fn.slice(fn.indexOf('catch'));
    expect(cat).toContain('setDrafts');
    expect(cat).toContain('line.counted_qty');
  });
});

describe('#355 WH-3 — a double click cannot draft two purchase orders', () => {
  it('both reorder paths latch synchronously, not on React state', () => {
    // `confirm()` blocks the main thread; the second click's event waits behind it and runs the
    // moment the first handler awaits. `setReordering`/`setBulkBusy` have not applied by then.
    for (const f of [RESUPPLY, OVERVIEW]) {
      const src = read(f);
      expect(src, `${f} does not use a ref latch`).toMatch(/inFlightReorders\s*=\s*useRef/);
      expect(src, `${f} never adds to the latch`).toContain('inFlightReorders.current.add(');
      expect(src, `${f} never releases the latch`).toContain('inFlightReorders.current.delete(');
    }
  });

  it('the latch is taken AFTER the confirm and BEFORE the first await', () => {
    // Before the confirm and a cancelled dialog leaves the item permanently latched; after the
    // first await and the queued click has already passed the check.
    for (const f of [RESUPPLY, OVERVIEW]) {
      const src = read(f);
      const fn = src.slice(src.indexOf('const reorder = async'));
      const confirmAt = fn.indexOf('confirm(');
      const addAt = fn.indexOf('inFlightReorders.current.add(');
      const awaitAt = fn.indexOf('await stockService.reorder(');
      expect(confirmAt, `${f}: no confirm`).toBeGreaterThan(-1);
      expect(addAt > confirmAt, `${f}: latch taken before the confirm — a cancelled dialog would strand it`).toBe(true);
      expect(addAt < awaitAt, `${f}: latch taken after the first await — the queued click is already past it`).toBe(true);
    }
  });

  it('the bulk run has its own latch and blocks single reorders while it runs', () => {
    const src = read(RESUPPLY);
    expect(src).toMatch(/bulkRunning\s*=\s*useRef/);
    expect(src).toContain('bulkRunning.current = true');
    expect(src).toContain('bulkRunning.current = false');
    // A single reorder fired mid-bulk would duplicate an item the bulk run is about to reach.
    const single = src.slice(src.indexOf('const reorder = async'), src.indexOf('const reorderAll'));
    expect(single).toContain('bulkRunning.current');
  });
});

describe('#355 WH-2 — the opening balance belongs to the ledger, not the client', () => {
  it('no client path hand-writes an opening movement', () => {
    // The fix is an AFTER INSERT trigger on `warehouse_items`, so the balance and its movement
    // are atomic and EVERY writer is covered — including ones not written yet. A client that
    // also inserted a movement would double-count the opening stock, which is a valid number
    // and therefore silent.
    for (const f of [RESUPPLY, OVERVIEW, COUNTS, 'src/services/warehouseService.ts']) {
      const src = read(f);
      expect(
        src.includes("'opening_balance'") || src.includes('"opening_balance"'),
        `${f} writes an opening_balance movement — the trigger already does, so this double-counts`,
      ).toBe(false);
    }
  });
});
