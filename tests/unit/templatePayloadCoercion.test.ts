/**
 * Template payload coercion (#322).
 *
 * A template payload is stored jsonb — as trustworthy as whatever wrote it. The starter project
 * templates shipped with `visibility: "client"`, which `project_tasks_visibility_check` rejects;
 * passed through unchecked, that aborts the insert PARTWAY through building the task tree and
 * leaves a half-populated project behind. The value was fixed in the data, but a template is
 * user-editable, so the same string can come back tomorrow.
 *
 * These are the narrowings that keep a bad payload value from becoming a failed import.
 */
import { describe, expect, it } from 'vitest';
import { childRows, depositPct, num, oneOf, parentSelect, pickDeclared, positiveQty, str } from '@/services/templates/coerce';

describe('num', () => {
  it('passes finite numbers and numeric strings through', () => {
    expect(num(3)).toBe(3);
    expect(num('2.5')).toBe(2.5);
    expect(num(0)).toBe(0);
  });

  it('never returns NaN — a NaN would reach the column as null and silently blank a price', () => {
    expect(num('abc', 7)).toBe(7);
    expect(num(Infinity, 7)).toBe(7);
  });

  it('does not let a MISSING value collapse to zero', () => {
    // Number(null) === Number('') === Number([]) === Number(false) === 0, so the naive
    // `Number(v) || fallback` turns "no quantity given" into a quantity of zero.
    expect(num(null, 7)).toBe(7);
    expect(num(undefined, 7)).toBe(7);
    expect(num('', 7)).toBe(7);
    expect(num([], 7)).toBe(7);
    expect(num([5], 7)).toBe(7);
    expect(num({}, 7)).toBe(7);
    expect(num(false, 7)).toBe(7);
  });
});

describe('str', () => {
  it('trims and rejects blanks', () => {
    expect(str('  hello ')).toBe('hello');
    expect(str('   ')).toBeNull();
    expect(str('')).toBeNull();
  });

  it('never stringifies an object into "[object Object]"', () => {
    expect(str({ a: 1 })).toBeNull();
    expect(str([1, 2])).toBeNull();
    expect(str(null)).toBeNull();
    expect(str(undefined)).toBeNull();
  });
});

describe('oneOf — the CHECK-constraint guard', () => {
  const visibility = oneOf(['internal', 'client_visible'] as const);

  it('accepts a member', () => {
    expect(visibility('internal')).toBe('internal');
    expect(visibility('client_visible')).toBe('client_visible');
  });

  it('rejects the exact value the seeded starters shipped with', () => {
    // 'client' is not in project_tasks_visibility_check; returning null lets the row land with
    // the column default instead of throwing halfway through the task tree.
    expect(visibility('client')).toBeNull();
  });

  it('rejects anything else, including near-misses and non-strings', () => {
    expect(visibility('Internal')).toBeNull();
    expect(visibility('')).toBeNull();
    expect(visibility(42)).toBeNull();
    expect(visibility(null)).toBeNull();
  });
});

describe('positiveQty', () => {
  it('honours quote_items_quantity_check (quantity > 0)', () => {
    expect(positiveQty(3)).toBe(3);
    expect(positiveQty('2.5')).toBe(2.5);
    expect(positiveQty(0)).toBe(1);
    expect(positiveQty(-4)).toBe(1);
    expect(positiveQty(undefined)).toBe(1);
    expect(positiveQty('not a number')).toBe(1);
  });
});

describe('depositPct', () => {
  it('honours quotes_deposit_pct_check (null, or 0 < pct <= 100)', () => {
    expect(depositPct(50)).toBe(50);
    expect(depositPct(100)).toBe(100);
    expect(depositPct(null)).toBeNull();
    expect(depositPct(undefined)).toBeNull();
    expect(depositPct(0)).toBeNull();
    expect(depositPct(-10)).toBeNull();
    expect(depositPct(101)).toBeNull();
    expect(depositPct('garbage')).toBeNull();
  });
});

describe('childRows', () => {
  it('returns object rows only', () => {
    const payload = { quote_items: [{ a: 1 }, null, 'x', 5, [1], { b: 2 }] } as Record<string, unknown>;
    expect(childRows(payload, 'quote_items')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('returns [] for a missing or non-array key rather than throwing', () => {
    expect(childRows({}, 'quote_items')).toEqual([]);
    expect(childRows({ quote_items: 'nope' } as Record<string, unknown>, 'quote_items')).toEqual([]);
    expect(childRows({ quote_items: null } as Record<string, unknown>, 'quote_items')).toEqual([]);
  });
});

describe('parentSelect — the empty-allowlist trap', () => {
  it('returns null for an empty allowlist, so no query is issued', () => {
    // `[].join(', ')` is `''`, and PostgREST reads `?select=` as `*` — verified against the live
    // API, which returned every column. That turned `hr_onboarding`'s deliberately empty parent
    // allowlist into "capture the whole employee row": salary, AMKA, clock_pin_hash, workspace_id.
    // The declaration said capture nothing and the query did the opposite.
    expect(parentSelect([])).toBeNull();
  });

  it('joins a non-empty allowlist', () => {
    expect(parentSelect(['a', 'b'])).toBe('a, b');
  });
});

describe('pickDeclared — the allowlist is enforced on the way out too', () => {
  const row = { title: 'x', monthly_salary: 4000, amka: '123', id: 'uuid', project_tasks: [{ t: 1 }] };

  it('drops anything not declared, whatever the query returned', () => {
    expect(pickDeclared(row, ['title'])).toEqual({ title: 'x' });
  });

  it('keeps declared child collections', () => {
    expect(pickDeclared(row, ['title'], ['project_tasks'])).toEqual({ title: 'x', project_tasks: [{ t: 1 }] });
  });

  it('an empty allowlist keeps nothing — not everything', () => {
    expect(pickDeclared(row, [])).toEqual({});
  });
});
