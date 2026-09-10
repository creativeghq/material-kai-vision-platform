/** Variant key — the TypeScript twin must equal the SQL one (#347 phase 7). */
import { describe, expect, it } from 'vitest';

import { variantKey } from '@/services/lineIdentityRules';

/**
 * Verified against `public._variant_key(jsonb)` on 2026-08-14. `null` here means SQL NULL — the
 * row that applies to ANY variant, which is what an unchosen line must resolve to.
 */
const SQL_FIXTURES: Array<{ label: string; input: unknown; expected: string | null }> = [
  { label: 'sorted',            input: { finish: 'matte', available_sizes: '600x600' }, expected: 'available_sizes=600x600;finish=matte' },
  // Key order must not matter: a map has none, and two orderings are the same variant.
  { label: 'reversed',          input: { available_sizes: '600x600', finish: 'matte' }, expected: 'available_sizes=600x600;finish=matte' },
  { label: 'case and spacing',  input: { Finish: ' Matte ', available_sizes: '600X600' }, expected: 'available_sizes=600x600;finish=matte' },
  // A blank choice is not a choice — it must not create a distinct variant.
  { label: 'blank dropped',     input: { finish: '', available_sizes: '600x600' }, expected: 'available_sizes=600x600' },
  { label: 'whitespace only',   input: { finish: '   ' }, expected: null },
  { label: 'empty object',      input: {}, expected: null },
  // Non-objects: SQL type-checks rather than raising, because a raise under every price lookup
  // would take out the whole line instead of degrading to the product-wide price.
  { label: 'null',              input: null, expected: null },
  { label: 'array',             input: [1, 2], expected: null },
  { label: 'scalar',            input: 'x', expected: null },
  { label: 'three fields',      input: { color: 'Sand', finish: 'matte', available_sizes: '300x300' }, expected: 'available_sizes=300x300;color=sand;finish=matte' },

  // Prefix keys — the case the fixture set could not see. Every key above extends another with a
  // LETTER (color/colors), and letters sort ABOVE '=' (61), so joining first and sorting the
  // "k=v" strings happened to agree with SQL's ORDER BY k. A DIGIT sorts BELOW '=', which flips
  // the pair: the old TS returned 'size2=b;size=a' where SQL returns 'size=a;size2=b'.
  // Expected values below are what public._variant_key() actually returns.
  { label: 'prefix key, digit',  input: { size: 'a', size2: 'b' }, expected: 'size=a;size2=b' },
  { label: 'prefix key, three',  input: { a: 'Z', a2: 'y', ab: 'x' }, expected: 'a=z;a2=y;ab=x' },
  { label: 'prefix key, hyphen', input: { width: '10', 'width-2': '20' }, expected: 'width=10;width-2=20' },
  { label: 'prefix key, letter', input: { color: 'sand', colors: 'sand,grey' }, expected: 'color=sand;colors=sand,grey' },
];

describe('variantKey matches public._variant_key', () => {
  for (const f of SQL_FIXTURES) {
    it(`${f.label} → ${f.expected ?? 'NULL'}`, () => {
      expect(variantKey(f.input as Record<string, string>)).toBe(f.expected);
    });
  }

  it('is order-independent for every permutation of a three-field map', () => {
    const base = { color: 'sand', finish: 'matte', available_sizes: '300x300' };
    const permutations = [
      { color: base.color, finish: base.finish, available_sizes: base.available_sizes },
      { finish: base.finish, available_sizes: base.available_sizes, color: base.color },
      { available_sizes: base.available_sizes, color: base.color, finish: base.finish },
    ];
    const keys = new Set(permutations.map((p) => variantKey(p)));
    expect(keys.size, 'insertion order changed the key — two price rows for one variant').toBe(1);
  });

  it('separates variants that differ in exactly one field', () => {
    const a = variantKey({ available_sizes: '600x600', finish: 'matte' });
    const b = variantKey({ available_sizes: '600x600', finish: 'polished' });
    expect(a).not.toBe(b);
  });
});
