import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';

/** No database write in `src/` discards its result (#389). */

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
