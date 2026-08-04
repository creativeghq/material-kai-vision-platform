/**
 * MEP calculation checks.
 *
 * These numbers decide cable sizes and lighting counts, so the tests pin the
 * physics against hand-computed values rather than against whatever the code
 * currently returns. The rest guard the failure mode that matters: a missing or
 * nonsensical input must yield null, never a plausible zero that quietly passes
 * every limit check.
 */
import { describe, it, expect } from 'vitest';
import {
  voltageDrop,
  checkVoltageDrop,
  connectedLoad,
  lumenMethodLux,
  checkIlluminance,
  RHO_COPPER_70C,
  DEFAULT_DROP_LIMIT_PCT,
} from '../../src/utils/mepCalculations';

describe('voltageDrop', () => {
  it('matches the hand-computed single-phase figure', () => {
    // ΔU = 2 · 0.0225 · 25 m · 20 A / 2.5 mm² = 9.0 V on a 230 V supply → 3.913%
    const r = voltageDrop({ lengthM: 25, currentA: 20, csaMm2: 2.5, phases: 1 })!;
    expect(r.drop_v).toBeCloseTo(9.0, 6);
    expect(r.nominal_v).toBe(230);
    expect(r.drop_percent).toBeCloseTo(3.913, 3);
  });

  it('matches the hand-computed three-phase figure', () => {
    // ΔU = √3 · 0.0225 · 40 · 32 / 6 = 8.3138 V on 400 V → 2.078%
    const r = voltageDrop({ lengthM: 40, currentA: 32, csaMm2: 6, phases: 3 })!;
    expect(r.drop_v).toBeCloseTo(Math.sqrt(3) * RHO_COPPER_70C * 40 * 32 / 6, 9);
    expect(r.nominal_v).toBe(400);
    expect(r.drop_percent).toBeCloseTo(2.078, 3);
  });

  it('accounts for the return leg on single phase (factor 2, not 1)', () => {
    // The classic error is omitting the return conductor, halving every result
    // and passing limits that should fail.
    const r = voltageDrop({ lengthM: 10, currentA: 10, csaMm2: 1.5, phases: 1 })!;
    expect(r.drop_v).toBeCloseTo(2 * RHO_COPPER_70C * 10 * 10 / 1.5, 9);
  });

  it('scales linearly with length and inversely with conductor area', () => {
    const base = voltageDrop({ lengthM: 10, currentA: 16, csaMm2: 2.5, phases: 1 })!;
    const twiceAsLong = voltageDrop({ lengthM: 20, currentA: 16, csaMm2: 2.5, phases: 1 })!;
    const twiceAsThick = voltageDrop({ lengthM: 10, currentA: 16, csaMm2: 5, phases: 1 })!;
    expect(twiceAsLong.drop_v).toBeCloseTo(base.drop_v * 2, 9);
    expect(twiceAsThick.drop_v).toBeCloseTo(base.drop_v / 2, 9);
  });

  it('honours an explicit nominal voltage and resistivity', () => {
    const r = voltageDrop({ lengthM: 10, currentA: 10, csaMm2: 2.5, phases: 1, nominalV: 120, resistivity: 0.018 })!;
    expect(r.nominal_v).toBe(120);
    expect(r.drop_v).toBeCloseTo(2 * 0.018 * 10 * 10 / 2.5, 9);
  });

  it.each([
    ['zero length', { lengthM: 0, currentA: 16, csaMm2: 2.5, phases: 1 as const }],
    ['zero current', { lengthM: 10, currentA: 0, csaMm2: 2.5, phases: 1 as const }],
    ['zero csa', { lengthM: 10, currentA: 16, csaMm2: 0, phases: 1 as const }],
    ['negative length', { lengthM: -10, currentA: 16, csaMm2: 2.5, phases: 1 as const }],
    ['NaN current', { lengthM: 10, currentA: Number.NaN, csaMm2: 2.5, phases: 1 as const }],
  ])('returns null, never 0, for %s', (_label, input) => {
    expect(voltageDrop(input)).toBeNull();
  });

  it('rejects a phase count that is neither 1 nor 3', () => {
    expect(voltageDrop({ lengthM: 10, currentA: 16, csaMm2: 2.5, phases: 2 as never })).toBeNull();
  });
});

describe('checkVoltageDrop', () => {
  it('passes at exactly the limit', () => {
    const r = { drop_v: 6.9, drop_percent: 3, nominal_v: 230 };
    expect(checkVoltageDrop(r, DEFAULT_DROP_LIMIT_PCT.lighting)!.verdict).toBe('pass');
  });

  it('fails above the limit', () => {
    const r = { drop_v: 9.0, drop_percent: 3.913, nominal_v: 230 };
    expect(checkVoltageDrop(r, DEFAULT_DROP_LIMIT_PCT.lighting)!.verdict).toBe('fail');
    expect(checkVoltageDrop(r, DEFAULT_DROP_LIMIT_PCT.power)!.verdict).toBe('pass');
  });

  it('always states what it judged against', () => {
    const r = { drop_v: 1, drop_percent: 1, nominal_v: 230 };
    expect(checkVoltageDrop(r, 3)!.basis).toMatch(/\S/);
  });

  it('is null when there is nothing to check', () => {
    expect(checkVoltageDrop(null, 3)).toBeNull();
    expect(checkVoltageDrop({ drop_v: 1, drop_percent: 1, nominal_v: 230 }, 0)).toBeNull();
  });
});

describe('connectedLoad', () => {
  it('sums wattage and derives single-phase current', () => {
    const r = connectedLoad([1000, 1300], 1)!;
    expect(r.total_w).toBe(2300);
    expect(r.current_a).toBeCloseTo(10, 9); // 2300 W / 230 V
  });

  it('derives three-phase current across √3', () => {
    const r = connectedLoad([6928.2], 3)!;
    expect(r.current_a).toBeCloseTo(6928.2 / (Math.sqrt(3) * 400), 9);
  });

  it('ignores non-positive entries rather than letting them cancel real load', () => {
    expect(connectedLoad([1000, 0, -50, Number.NaN], 1)!.total_w).toBe(1000);
  });

  it('is null when nothing usable was supplied', () => {
    expect(connectedLoad([], 1)).toBeNull();
    expect(connectedLoad([0, -1], 1)).toBeNull();
  });
});

describe('lumenMethodLux', () => {
  it('matches the hand-computed average', () => {
    // 6 × 3000 lm = 18000; × 0.5 UF × 0.8 MF = 7200 lm over 12 m² → 600 lx
    expect(lumenMethodLux({ totalLumens: 18000, areaM2: 12, utilisationFactor: 0.5, maintenanceFactor: 0.8 }))
      .toBeCloseTo(600, 9);
  });

  // A factor above 1 means someone typed a percentage. Silently accepting 80
  // instead of 0.8 would overstate illuminance a hundredfold.
  it.each([
    ['utilisation factor above 1', { utilisationFactor: 80, maintenanceFactor: 0.8 }],
    ['maintenance factor above 1', { utilisationFactor: 0.5, maintenanceFactor: 80 }],
    ['zero utilisation factor', { utilisationFactor: 0, maintenanceFactor: 0.8 }],
  ])('returns null for %s', (_label, factors) => {
    expect(lumenMethodLux({ totalLumens: 18000, areaM2: 12, ...factors })).toBeNull();
  });

  it('is null without lumens or area', () => {
    expect(lumenMethodLux({ totalLumens: 0, areaM2: 12, utilisationFactor: 0.5, maintenanceFactor: 0.8 })).toBeNull();
    expect(lumenMethodLux({ totalLumens: 18000, areaM2: 0, utilisationFactor: 0.5, maintenanceFactor: 0.8 })).toBeNull();
  });
});

describe('checkIlluminance', () => {
  // Illuminance is a floor, not a ceiling — the comparison runs the opposite way
  // to voltage drop, and getting it backwards would pass every dark room.
  it('passes when at or above target', () => {
    expect(checkIlluminance(600, 500)!.verdict).toBe('pass');
    expect(checkIlluminance(500, 500)!.verdict).toBe('pass');
  });

  it('fails when below target', () => {
    expect(checkIlluminance(400, 500)!.verdict).toBe('fail');
  });

  it('is null when there is nothing to check', () => {
    expect(checkIlluminance(null, 500)).toBeNull();
    expect(checkIlluminance(600, 0)).toBeNull();
  });
});
