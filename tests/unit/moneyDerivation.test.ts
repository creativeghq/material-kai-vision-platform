/**
 * Money-derivation guard.
 *
 * The bug this exists to stop: "how much is still owed on this order" was implemented FIVE times
 * — twice in SQL (`recompute_order_payment_status`, `dic_detect__finance_order_over_settled`) and
 * three times in TypeScript (`settledByOrder` + OrdersPanel, `listUninvoicedOutstanding`,
 * `orderSettled`). Four applied the rule "a sales order settles on money IN, a purchase order on
 * money OUT" correctly; one netted the two directions. The result was an order row showing
 * `Payment: Paid` next to `Outstanding: €945` — the exact amount we had paid our supplier —
 * with the DB perfectly consistent the whole time.
 *
 * No stored-data integrity check can see that, because nothing was wrong with the stored data.
 * No typecheck can see it, because a wrong number is a valid `number`. The only durable fix is to
 * have ONE derivation, in SQL, and let TypeScript format the answer.
 *
 * So: `get_order_settlements` returns `settled` / `outstanding` / `payment_status` already
 * derived, and this test fails the build if the finance client-side code starts doing the
 * arithmetic again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const FINANCE_DIRS = [
  'src/modules/finance',
  'src/modules/quotes',
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the old bug doesn't trip the scanner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('order settlement has exactly one derivation', () => {
  const files = FINANCE_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('finds finance sources to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  /**
   * Re-applying the direction rule in TypeScript is the specific mistake. `settled_in` and
   * `settled_out` are returned for DISPLAY (an order page shows both sides of the trade); the
   * moment one of them is picked by order type, someone is restating the rule.
   */
  it('never picks a settlement half by order type in TypeScript', () => {
    const offenders: string[] = [];
    // Any line that branches on the order type AND reaches for one of the two halves — whether
    // it names them (`fin.settled_in`) or aliases them (`s?.in` / `s?.out`, which is how the
    // original bug was written after its first fix).
    const HALF = String.raw`(?:\bsettled_(?:in|out)\b|\bsettled(?:In|Out)\b|[?.]\s*\b(?:in|out)\b\s*\?\?)`;
    const RE = new RegExp(`order_type[^\\n]*${HALF}|${HALF}[^\\n]*order_type`);
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (RE.test(line)) offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'Pick the settlement side in SQL, not here. `get_order_settlements` already returns ' +
      '`settled` (the direction-correct half) and `outstanding`. Read those.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * `total − settled` is the outstanding formula. It belongs in `get_order_settlements`, which is
   * also what drives `payment_status` and the `finance.order_payment_status_drift` check — so the
   * badge and the balance are incapable of disagreeing.
   */
  it('never recomputes outstanding as total − settled in TypeScript', () => {
    const offenders: string[] = [];
    const RE = /\btotal\b[^\n]{0,40}[-−]\s*(settled|paid|net)\b/i;
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (RE.test(line)) offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'Outstanding is derived once, in `get_order_settlements`. Read `outstanding` from ' +
      '`ordersService.orderBalances()` instead of subtracting here.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /** The RPC is the single source; nothing should hand-roll the allocation sum around it. */
  it('reads settlement only through ordersService.orderBalances / get_order_settlements', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      // A direct allocation query joined to payment direction = a private settlement derivation.
      if (/from\(['"]payment_allocations['"]\)[\s\S]{0,200}payments?\s*\([^)]*direction/.test(src)) {
        offenders.push(relative(ROOT, f));
      }
    }
    expect(
      offenders,
      'Summing payment_allocations by direction IS the settlement rule. Call ' +
      '`ordersService.orderBalances()` so there stays exactly one copy of it.\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});
