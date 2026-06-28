import { describe, it, expect } from 'vitest';
import * as edge from '../../supabase/functions/_shared/blueprint/formula';
import * as mirror from '../../src/utils/blueprintFormula';

// The Blueprint estimating math has TWO copies on purpose: the edge function
// (project-plan-engine) is the authoritative writer; the Vite frontend keeps a
// "byte-identical mirror" at src/utils/blueprintFormula.ts for optimistic preview.
// These tests pin the math AND assert the two copies never drift (a silent drift
// would show the customer one price and persist a different one).
const { evaluateFormula, computeLinePricing, round2 } = edge;

describe('evaluateFormula', () => {
  const dims = { floor_area: 6, wall_area: 24, n_points: 5 };

  it('evaluates a bare number (the common literal-quantity case)', () => {
    expect(evaluateFormula('5', {})).toEqual({ value: 5, ok: true });
    expect(evaluateFormula('= 12.5', {})).toEqual({ value: 12.5, ok: true });
    expect(evaluateFormula('-3', {})).toEqual({ value: -3, ok: true });
  });

  it('resolves named dimensions and arithmetic with correct precedence', () => {
    expect(evaluateFormula('= floor_area + wall_area', dims).value).toBe(30);
    expect(evaluateFormula('= n_points * 1.1', dims).value).toBeCloseTo(5.5, 10);
    expect(evaluateFormula('= floor_area + wall_area * 2', dims).value).toBe(54); // * before +
    expect(evaluateFormula('= (floor_area + wall_area) * 2', dims).value).toBe(60);
  });

  it('supports the whitelisted functions', () => {
    expect(evaluateFormula('= ceil(floor_area * 1.1)', dims).value).toBe(7);
    expect(evaluateFormula('= floor(5.9)', {}).value).toBe(5);
    expect(evaluateFormula('= round(5.5)', {}).value).toBe(6);
    expect(evaluateFormula('= max(floor_area, wall_area)', dims).value).toBe(24);
    expect(evaluateFormula('= min(floor_area, wall_area)', dims).value).toBe(6);
    expect(evaluateFormula('= abs(0 - n_points)', dims).value).toBe(5);
    expect(evaluateFormula('= sqrt(16)', {}).value).toBe(4);
  });

  it('fails closed on empty, unknown vars, unknown funcs, and bad syntax', () => {
    expect(evaluateFormula('', dims).ok).toBe(false);
    expect(evaluateFormula(null, dims).ok).toBe(false);
    expect(evaluateFormula(undefined, dims).ok).toBe(false);
    expect(evaluateFormula('= missing_var * 2', dims).ok).toBe(false);
    expect(evaluateFormula('= bogus(1)', dims).ok).toBe(false);
    expect(evaluateFormula('= 1 +', dims).ok).toBe(false);
    expect(evaluateFormula('= 1 ** 2', dims).ok).toBe(false); // not a whitelisted operator
    expect(evaluateFormula('= floor_area floor_area', dims).ok).toBe(false); // trailing tokens
  });

  it('rejects non-finite results (e.g. divide by zero)', () => {
    expect(evaluateFormula('= 1 / 0', {}).ok).toBe(false);
  });

  it('never throws on hostile input — always returns a result object', () => {
    for (const f of ['<script>', '1;2', '() => 1', 'a.b', '0x10', '/*x*/']) {
      expect(() => evaluateFormula(f, dims)).not.toThrow();
      expect(evaluateFormula(f, dims).ok).toBe(false);
    }
  });
});

describe('round2', () => {
  it('rounds to 2 decimals, EPSILON-safe', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(10)).toBe(10);
  });
});

describe('computeLinePricing', () => {
  it('material + labor, marked up by margin, times quantity', () => {
    // base = 10 + 5 = 15; unit = 15 * 1.20 = 18; line = 18 * 3 = 54
    expect(computeLinePricing({ material_cost: 10, labor_rate: 5, margin_pct: 20, quantity: 3 }))
      .toEqual({ unit_price: 18, line_total: 54 });
  });

  it('falls back to resolved_* costs when no per-line override is given', () => {
    expect(computeLinePricing({ resolved_material: 8, resolved_labor: 2, margin_pct: 0, quantity: 2 }))
      .toEqual({ unit_price: 10, line_total: 20 });
  });

  it('an allowance line IS its amount and ignores quantity', () => {
    expect(computeLinePricing({ is_allowance: true, allowance_amount: 250, quantity: 99 }))
      .toEqual({ unit_price: 250, line_total: 250 });
  });

  it('an unselected option row keeps unit_price for display but contributes 0 to the total', () => {
    expect(computeLinePricing({ material_cost: 10, labor_rate: 5, margin_pct: 20, quantity: 3, is_selected: false }))
      .toEqual({ unit_price: 18, line_total: 0 });
    expect(computeLinePricing({ is_allowance: true, allowance_amount: 250, quantity: 1, is_selected: false }))
      .toEqual({ unit_price: 250, line_total: 0 });
  });

  it('treats missing costs/margin as zero', () => {
    expect(computeLinePricing({ quantity: 5 })).toEqual({ unit_price: 0, line_total: 0 });
  });
});

// The whole reason the mirror exists: it must compute identically to the edge source.
describe('edge ⇄ frontend mirror parity', () => {
  const dims = { floor_area: 6.5, wall_area: 23.7, n_points: 5, ceiling_h: 2.7 };
  const formulas = [
    '5', '= 12.5', '= floor_area + wall_area', '= n_points * 1.1',
    '= (floor_area + wall_area) * 2', '= ceil(floor_area * 1.15)',
    '= max(floor_area, min(wall_area, 20))', '= missing', '= 1 /', '',
  ];

  it('evaluateFormula agrees on every sample', () => {
    for (const f of formulas) {
      expect(mirror.evaluateFormula(f, dims)).toEqual(edge.evaluateFormula(f, dims));
    }
  });

  it('computeLinePricing agrees on representative inputs', () => {
    const cases = [
      { material_cost: 10.5, labor_rate: 5.25, margin_pct: 18, quantity: 3.3 },
      { resolved_material: 8, resolved_labor: 2, margin_pct: 0, quantity: 2 },
      { is_allowance: true, allowance_amount: 249.99, quantity: 7 },
      { material_cost: 10, labor_rate: 5, margin_pct: 20, quantity: 3, is_selected: false },
      { quantity: 5 },
    ];
    for (const c of cases) {
      expect(mirror.computeLinePricing(c)).toEqual(edge.computeLinePricing(c));
    }
  });

  it('round2 agrees', () => {
    for (const n of [1.005, 2.675, 1.234, 10, 0.1 + 0.2]) {
      expect(mirror.round2(n)).toBe(edge.round2(n));
    }
  });
});
