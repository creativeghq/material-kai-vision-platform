import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';

/**
 * No database write in `src/` discards its result (#389).
 *
 * This is not "missing error handling". The reason is written in the codebase already,
 * next to the fix that prompted it, in `PriceLookupDrawer`:
 *
 *   > The error MUST be destructured and thrown. supabase-js RESOLVES on an RLS denial
 *   > rather than throwing, so discarding it let a rejected write flow straight into the
 *   > "Price confirmed" toast below and close the drawer — the user saw a price they
 *   > believed was saved, the catalog was unchanged, and no second signal existed
 *   > anywhere. The enclosing try/catch could not help: nothing threw.
 *
 * So an unbound write that RLS denies is COMPLETELY silent. A surrounding try/catch does
 * not catch it, because nothing was thrown, and the UI proceeds as though it succeeded.
 * It is the same family as every silent-zero defect in this platform: a plausible
 * outcome, no signal, and a number or a row that is simply wrong afterwards.
 *
 * WHY ZERO AND NOT A RATCHET
 * ---------------------------
 * The population was 27 and every one had a decision available — check it, or say in a
 * comment that it is deliberately fire-and-forget. Both are cheap, so there is no honest
 * reason for a tolerated remainder. A ratchet is the right tool when the debt cannot be
 * paid in one change; here it could.
 *
 * If a genuinely fire-and-forget write appears, bind the error and ignore it explicitly
 * (`const { error } = ...` with a comment). That reads as a decision. An unbound await
 * reads as an oversight, and after enough of them nobody can tell which is which — which
 * is the actual thing this test protects.
 *
 * THE MATCHER STOPS AT THE STATEMENT
 * -----------------------------------
 * `[^;]*?` matters. A looser version that scanned forward N characters attributed a
 * LATER statement's `.insert(` to an earlier `await supabase.rpc(...)`, which put five
 * false positives in the first count of this sweep.
 */

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

/** An awaited supabase write whose result is never bound to anything. */
const UNBOUND_WRITE = /^[ \t]*await\s+supabase[^;]*?\.(insert|update|delete|upsert)\s*\(/gm;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('#389 — every database write has its result inspected', () => {
  it('no write in src/ discards its result', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const rel = file.replace(ROOT, '').replace(/\\/g, '/');
      for (const m of src.matchAll(UNBOUND_WRITE)) {
        const line = src.slice(0, m.index ?? 0).split('\n').length;
        offenders.push(`${rel}:${line} (${m[1]})`);
      }
    }
    expect(
      offenders,
      'these writes discard their result. supabase-js RESOLVES on an RLS denial rather ' +
        'than throwing, so the write is silent, the surrounding try/catch cannot help, ' +
        'and the caller proceeds as though it succeeded:\n  ' +
        offenders.join('\n  ') +
        '\n\nBind the error and handle it — or bind it and ignore it WITH a comment ' +
        'saying it is deliberately fire-and-forget. The second still reads as a decision; ' +
        'an unbound await reads as an oversight.',
    ).toEqual([]);
  });

  it('the matcher does not cross a statement boundary', () => {
    // The first version of this sweep scanned forward a fixed number of characters and
    // attributed a later statement's write to an earlier await, producing five false
    // positives. A checker that cries wolf gets muted, which costs more than it saves.
    const twoStatements = `
      await supabase.rpc('recompute_order_totals', { p_order_id: orderId });
      const { error } = await supabase.from('order_items').insert(lines);
    `;
    expect([...twoStatements.matchAll(UNBOUND_WRITE)]).toEqual([]);
  });

  it('the matcher still catches the real shape', () => {
    // Both forms that actually occur: one line, and a chained multi-line builder.
    const oneLine = `      await supabase.from('user_follows').delete().eq('id', x);`;
    const chained = [
      '      await supabase',
      "        .from('user_notifications')",
      '        .update({ is_read: true })',
      "        .eq('id', n.id);",
    ].join('\n');
    expect([...oneLine.matchAll(UNBOUND_WRITE)]).toHaveLength(1);
    expect([...chained.matchAll(UNBOUND_WRITE)]).toHaveLength(1);
  });

  it('a bound write is not reported', () => {
    const bound = `      const { error } = await supabase.from('x').insert({ a: 1 });`;
    expect([...bound.matchAll(UNBOUND_WRITE)]).toEqual([]);
  });
});
