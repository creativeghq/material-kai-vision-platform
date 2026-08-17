/**
 * Guard: the schema-writer lint still sees what it claims to see.
 *
 * `scripts/schema-writers.mjs` compares this checkout's column references against the LIVE schema,
 * so the check itself can only run where a service key exists (the `db.schema-writers` smoke check,
 * or `npm run schema:writers` after a migration). What runs HERE is the half that needs no
 * database: the parser.
 *
 * That half is where the danger is. Every defect this file pins was real, and every one of them was
 * found by watching the guard's output rather than by reading it — a scanner is either noisy enough
 * to be ignored or blind enough to be pointless, and both failure modes report a number that looks
 * fine:
 *
 *   embedded relations   `products ( name, sku )` counted `products` as a column of quote_items,
 *                        which flagged essentially every join in the codebase
 *   ternaries            `col: a ? b : c` read `b` as a second key, because `b` is an identifier
 *                        followed by a colon
 *   window bleed         a 600-char forward window swallowed the NEXT statement, blaming
 *                        `user_websites.update({page_count})` on a table 40 lines above it
 *   template literals    the first version skipped any object containing `${`, which is most
 *                        inserts in the repo — including the fixture that was writing a generated
 *                        column, sitting directly in front of it, producing nothing
 *   comments             an apostrophe in a comment inside an object literal opened a string that
 *                        never closed and swallowed the real keys below it
 *   truncated bodies     an object literal with a long comment ran past the window, `balanced()`
 *                        never found its closing brace, and the whole insert was written off as
 *                        "unparseable"
 *
 * Four of those six make the guard SILENTLY WEAKER rather than louder. That is the shape this repo
 * keeps finding, and it is why the skip count is printed on every run and asserted here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';

// The script is plain ESM with no side effects at import time (the CLI block is guarded), so a
// unit test can import it directly and exercise the pure half.
const mod = await import('../../scripts/schema-writers.mjs');
const { extractUsages, blankNonCode, lint, problemKey, KNOWN_DRIFT } = mod as any;

/** A registry shaped like the live one, for the cases below. */
const registry = {
  columns: new Map<string, Set<string>>([
    ['quote_items', new Set(['id', 'quote_id', 'quantity', 'unit_price', 'line_total', 'custom_product_name'])],
    ['quotes', new Set(['id', 'name', 'status', 'subtotal', 'grand_total'])],
    ['products', new Set(['name', 'sku'])],
  ]),
  generated: new Map<string, Set<string>>([
    ['quote_items', new Set(['line_total'])],
  ]),
};

const problemsFor = (src: string) => lint(registry, extractUsages(src, 'x.ts'));

describe('schema-writer lint · what it catches', () => {
  it('flags a write to a GENERATED column', () => {
    const src = `await sb.from('quote_items').insert({ quote_id: q, quantity: 1, unit_price: 5, line_total: 5 });`;
    const p = problemsFor(src);
    expect(p).toHaveLength(1);
    expect(p[0].problem).toContain('GENERATED');
    expect(p[0].column).toBe('line_total');
  });

  it('flags a write to a generated column even when the object holds a template literal', () => {
    // The exact shape of the fixture this guard was written for. The first version skipped it.
    const src = 'await sb.from(\'quote_items\').insert({ quote_id: q, quantity: 1, unit_price: 5, line_total: 5, custom_product_name: `E2E line ${rid}` });';
    const p = problemsFor(src);
    expect(p.map((x: any) => x.column)).toEqual(['line_total']);
  });

  it('flags a write to a generated column past a long comment inside the object', () => {
    // `balanced()` must read the FULL source, not a fixed window — a comment can push the closing
    // brace out of any cap, and an unparseable insert is reported as nothing at all.
    const filler = Array.from({ length: 14 }, (_, i) => `      // explanatory line ${i} — it's long, and it's quoted "like this"`).join('\n');
    const src = `await sb.from('quote_items').insert({\n${filler}\n  quote_id: q, quantity: 1, unit_price: 5, line_total: 5,\n});`;
    expect(problemsFor(src).map((x: any) => x.column)).toEqual(['line_total']);
  });

  it('flags a READ of a column that does not exist', () => {
    const src = `await sb.from('quotes').select('id, name, extras_total');`;
    const p = problemsFor(src);
    expect(p).toHaveLength(1);
    expect(p[0].problem).toContain('does not exist');
  });
});

describe('schema-writer lint · what it must NOT flag', () => {
  it('an embedded relation is not a column of the parent table', () => {
    const src = `await sb.from('quote_items').select('id, quantity, products ( name, sku )');`;
    expect(problemsFor(src)).toEqual([]);
  });

  it('an aliased column resolves to the real column', () => {
    const src = `await sb.from('quotes').select('id, title:name');`;
    expect(problemsFor(src)).toEqual([]);
  });

  it('a ternary VALUE is not a second key', () => {
    const src = `await sb.from('quotes').insert({ name: ready ? subtotal : grand_total });`;
    expect(problemsFor(src)).toEqual([]);
  });

  it('the next statement\'s columns are not blamed on this table', () => {
    const src = [
      `await sb.from('quotes').select('id');`,
      ...Array.from({ length: 6 }, () => '// padding'),
      `await sb.from('quote_items').insert({ quote_id: q, line_total: 5 });`,
    ].join('\n');
    const p = problemsFor(src);
    // Exactly one problem, and it belongs to quote_items — not to `quotes` above it.
    expect(p).toHaveLength(1);
    expect(p[0].table).toBe('quote_items');
  });

  it('a column name appearing inside a string is not a reference', () => {
    const src = `await sb.from('quotes').select('id'); throw new Error('extras_total, line_total are gone');`;
    expect(problemsFor(src)).toEqual([]);
  });

  it('a table the live schema does not know is left alone', () => {
    // Another system's table, or an RPC name — flagging every column on it would be pure noise.
    const src = `await sb.from('some_other_system').select('whatever_column');`;
    expect(problemsFor(src)).toEqual([]);
  });
});

describe('schema-writer lint · coverage is visible, not silent', () => {
  it('records WHY it skipped something instead of dropping it', () => {
    const spread = `await sb.from('quotes').insert({ ...payload, name: 'x' });`;
    const star = `await sb.from('quotes').select('*');`;
    for (const src of [spread, star]) {
      const skips = extractUsages(src, 'x.ts').filter((u: any) => u.kind === 'skip');
      expect(skips.length, `no skip recorded for: ${src}`).toBeGreaterThan(0);
      expect(skips[0].why).toBeTruthy();
    }
  });

  it('parses the overwhelming majority of real call sites', () => {
    // A guard that quietly stops parsing is a guard that reports green forever. If a refactor
    // pushes the skip rate up, this fails and says so rather than shrinking in silence.
    const usages = mod.scanRepo();
    const skipped = usages.filter((u: any) => u.kind === 'skip').length;
    const ratio = skipped / usages.length;
    expect(usages.length, 'the scanner found almost nothing — is SCAN still pointing at real dirs?').toBeGreaterThan(3000);
    expect(ratio, `skip rate ${(ratio * 100).toFixed(1)}% — the parser is going blind`).toBeLessThan(0.2);
  });
});

describe('schema-writer lint · the baseline is shrink-only', () => {
  it('is empty — every finding from the first run was fixed, not exempted', () => {
    // Not a style preference. All 33 problems the guard found on its first run were real runtime
    // errors and all were repaired, so there is nothing legitimate to exempt. A line reappearing
    // here means someone made a build pass instead of making the code right; the mechanism stays
    // for a migration that genuinely needs a staged fix, but the default is zero.
    expect([...KNOWN_DRIFT]).toEqual([]);
  });

  it('has no duplicate entries', () => {
    expect(KNOWN_DRIFT.size).toBe([...KNOWN_DRIFT].length);
  });

  it('every entry is a well-formed problem key', () => {
    for (const k of KNOWN_DRIFT) {
      expect(k, `malformed baseline key: ${k}`).toMatch(/^[^|]+\|[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\|(read|write)$/);
    }
  });

  it('problemKey ignores line numbers, so an edit above an entry does not churn it', () => {
    const a = problemKey({ file: 'f.ts', table: 't', column: 'c', kind: 'read', line: 3 });
    const b = problemKey({ file: 'f.ts', table: 't', column: 'c', kind: 'read', line: 900 });
    expect(a).toBe(b);
  });
});

describe('schema-writer lint · the comment blanker matches the canonical one', () => {
  /**
   * `blankNonCode` is a second implementation of something `tests/helpers/stripComments.ts`
   * already does — unavoidable, because that helper is TypeScript loaded by vitest and the lint is
   * a plain `.mjs` CLI. CLAUDE.md's rule for a twin like this is that it is held equivalent by a
   * test rather than by convention, which is exactly how the three escapeHtml copies are kept
   * honest. So: on real repo source, the comment bytes the two blank out must agree.
   */
  const CORPUS = [
    'scripts/schema-writers.mjs',
    'tests/integration/fiscal-derivations.test.ts',
    'supabase/functions/quote-public-share/index.ts',
    'supabase/functions/_shared/next-steps.ts',
  ];

  it.each(CORPUS)('agrees with blankComments on %s', (rel) => {
    const src = readFileSync(join(__dirname, '..', '..', rel), 'utf8');
    const mine = blankNonCode(src);
    const canonical = blankComments(src);
    expect(mine).toHaveLength(src.length);
    expect(canonical).toHaveLength(src.length);
    // Wherever the canonical blanker removed a comment character, ours must have removed it too.
    // (Ours blanks string CONTENTS as well, which the canonical one keeps — so this is one-way.)
    const missed: number[] = [];
    for (let i = 0; i < src.length; i++) {
      if (canonical[i] === ' ' && src[i] !== ' ' && mine[i] !== ' ') missed.push(i);
    }
    expect(missed.slice(0, 5), `${missed.length} comment char(s) our blanker left as code`).toEqual([]);
  });
});
