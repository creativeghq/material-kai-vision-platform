import { describe, it, expect } from 'vitest';
import { parseDecimal, parseDecimalOr } from '../../src/utils/decimal';

// Guards the EU/US locale money-parsing rules in src/utils/decimal.ts. The bug this
// prevents is real and expensive: "2.249,86" (Greek/EU) → 2.25 under naive parseFloat,
// silently turning €2,249.86 into €2.25 (see [[project_decimal_parsing_2026_06_26]]).
describe('parseDecimal', () => {
  it('parses EU format (dot thousands, comma decimal)', () => {
    expect(parseDecimal('2.249,86')).toBe(2249.86);
    expect(parseDecimal('1.234.567,89')).toBe(1234567.89);
    expect(parseDecimal('€ 1.500,50')).toBe(1500.5);
    expect(parseDecimal('-2.249,86')).toBe(-2249.86);
  });

  it('parses US format (comma thousands, dot decimal)', () => {
    expect(parseDecimal('2,249.86')).toBe(2249.86);
    expect(parseDecimal('1,234,567.89')).toBe(1234567.89);
  });

  it('treats a lone comma as the decimal separator', () => {
    expect(parseDecimal('2249,86')).toBe(2249.86);
  });

  it('treats a lone dot as the decimal separator (keeps machine-formatted values intact)', () => {
    expect(parseDecimal('2249.86')).toBe(2249.86);
    // 3-decimal DB values must survive untouched — this is the parseFloat-superset contract.
    expect(parseDecimal('12.999')).toBe(12.999);
  });

  it('treats a repeated single separator type as grouping (integer result)', () => {
    expect(parseDecimal('1.234.567')).toBe(1234567);
    expect(parseDecimal('1,234,567')).toBe(1234567);
  });

  it('passes through finite numbers and rejects non-finite ones', () => {
    expect(parseDecimal(2249.86)).toBe(2249.86);
    expect(parseDecimal(0)).toBe(0);
    expect(parseDecimal(Infinity)).toBeNull();
    expect(parseDecimal(NaN)).toBeNull();
  });

  it('returns null for empty / non-numeric input so callers can tell "blank" from 0', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('€')).toBeNull();
  });

  it('strips currency symbols, spaces and stray characters', () => {
    expect(parseDecimal('  $1,000.00 ')).toBe(1000);
    expect(parseDecimal('1 500,25 €')).toBe(1500.25);
  });
});

describe('parseDecimalOr', () => {
  it('falls back to 0 (or a given default) instead of null', () => {
    expect(parseDecimalOr('')).toBe(0);
    expect(parseDecimalOr('abc', 5)).toBe(5);
    expect(parseDecimalOr('2.249,86')).toBe(2249.86);
    // A real zero must NOT be replaced by the fallback.
    expect(parseDecimalOr('0', 99)).toBe(0);
  });
});
