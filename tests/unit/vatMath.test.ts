/**
 * Behavioral guard for the finance VAT/currency math (@/modules/finance/lib/vatMath).
 *
 * This is the money- and compliance-sensitive core the recent finance/expense work leans on:
 * every invoice, credit note and expense line derives its net/VAT split and its myDATA VAT
 * category from these pure functions. The functions are re-exported by financeService and used
 * on the credit-note path, so these assertions guard REAL production behavior, not a copy.
 */
import { describe, it, expect } from 'vitest';
import { round2, extractNet, extractVat, vatCategory, VAT_PCT_TO_CATEGORY } from '@/modules/finance/lib/vatMath';

describe('round2', () => {
  it('rounds to cents', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(1.239)).toBe(1.24);
  });

  it('nudges the binary-float half-down case up (1.005 → 1.01)', () => {
    // Plain Math.round(1.005*100)/100 yields 1.00 because 1.005 is stored as 1.00499…;
    // the Number.EPSILON nudge is exactly what fixes this. Regression lock.
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });

  it('coerces junk to 0', () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(undefined as unknown as number)).toBe(0);
    expect(round2(null as unknown as number)).toBe(0);
  });
});

describe('extractNet / extractVat — VAT-inclusive gross → net + VAT', () => {
  // Each Greek rate: a gross that the split must reconstruct exactly.
  const cases: Array<{ gross: number; pct: number; net: number; vat: number }> = [
    { gross: 124, pct: 24, net: 100, vat: 24 },
    { gross: 113, pct: 13, net: 100, vat: 13 },
    { gross: 106, pct: 6, net: 100, vat: 6 },
    { gross: 117, pct: 17, net: 100, vat: 17 },
    { gross: 109, pct: 9, net: 100, vat: 9 },
    { gross: 104, pct: 4, net: 100, vat: 4 },
    { gross: 100, pct: 0, net: 100, vat: 0 },
  ];

  it.each(cases)('$pct%: gross $gross → net $net + VAT $vat', ({ gross, pct, net, vat }) => {
    expect(round2(extractNet(gross, pct))).toBe(net);
    expect(extractVat(gross, pct)).toBe(vat);
  });

  it('net + VAT always reconstructs the gross (to the cent)', () => {
    for (const { gross, pct } of cases) {
      expect(round2(round2(extractNet(gross, pct)) + extractVat(gross, pct))).toBe(gross);
    }
  });

  it('handles a messy real-world gross', () => {
    // €249.99 incl. 24% VAT
    const net = round2(extractNet(249.99, 24));
    const vat = extractVat(249.99, 24);
    expect(net).toBe(201.60);
    expect(vat).toBe(48.39);
    expect(round2(net + vat)).toBe(249.99);
  });

  it('0% leaves gross untouched as net', () => {
    expect(round2(extractNet(500, 0))).toBe(500);
    expect(extractVat(500, 0)).toBe(0);
  });
});

describe('vatCategory — rate → myDATA category (island-rate regression lock)', () => {
  it('maps each standard + island rate to the exact category', () => {
    expect(vatCategory(24)).toBe(1);
    expect(vatCategory(13)).toBe(2);
    expect(vatCategory(6)).toBe(3);
    // The island rates a `>=` ladder would mislabel — the whole reason the map is exact.
    expect(vatCategory(17)).toBe(4);
    expect(vatCategory(9)).toBe(5);
    expect(vatCategory(4)).toBe(6);
    expect(vatCategory(0)).toBe(7);
  });

  it('does NOT collapse island rates into the nearest standard band', () => {
    // A ladder (pct >= 13 ? 2 : pct >= 6 ? 3 : …) would send 9% → cat 3 and 17% → cat 1.
    expect(vatCategory(9)).not.toBe(3);
    expect(vatCategory(17)).not.toBe(1);
    expect(vatCategory(4)).not.toBe(3);
  });

  it('rounds a near-integer rate before lookup', () => {
    expect(vatCategory(23.9998)).toBe(1);
    expect(vatCategory(9.0001)).toBe(5);
  });

  it('falls back to category 7 (0%/exempt) for an unknown rate', () => {
    expect(vatCategory(7)).toBe(7);   // 7% is not a real Greek band → exempt fallback
    expect(vatCategory(99)).toBe(7);
    expect(vatCategory(NaN)).toBe(7);
  });

  it('the map is frozen (mutation is a bug that must not silently drift)', () => {
    expect(Object.isFrozen(VAT_PCT_TO_CATEGORY)).toBe(true);
  });
});
