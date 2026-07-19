/**
 * Behavioral guard for the `record_expense` agent tool's money-split
 * (supabase/functions/_shared/finance/expense-math.ts).
 *
 * The edge tool imports the SAME `computeExpenseSplit` these tests exercise, so this guards the
 * real net/VAT/total that lands on the supplier_bills row — not a copy. The tool's Supabase
 * writes and date defaulting stay in Deno and are covered by the prod smoke check
 * (`db.expense-tool.schema`); the risky arithmetic + validation live here and are covered below.
 */
import { describe, it, expect } from 'vitest';
import { computeExpenseSplit, round2 } from '../../supabase/functions/_shared/finance/expense-math.ts';

const ok = (amount: number, extra: Record<string, unknown> = {}) =>
  computeExpenseSplit({ amount, category: 'Rent', payee: 'Landlord', ...extra });

describe('round2 (expense-math copy)', () => {
  it('rounds to cents and nudges the half-down float case', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(100.004)).toBe(100.00);
    expect(round2(NaN)).toBe(0);
  });
});

describe('computeExpenseSplit — happy path', () => {
  it('splits a VAT-inclusive total into net + VAT', () => {
    const r = ok(124, { vat_amount: 24 });
    expect(r).toEqual({ ok: true, total: 124, vat: 24, net: 100, currency: 'EUR' });
  });

  it('treats an omitted VAT as 0 → net equals total', () => {
    expect(ok(500)).toEqual({ ok: true, total: 500, vat: 0, net: 500, currency: 'EUR' });
  });

  it('net + VAT always reconstructs the total to the cent', () => {
    const r = ok(249.99, { vat_amount: 48.39 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.net).toBe(201.60);
      expect(r.vat).toBe(48.39);
      expect(round2(r.net + r.vat)).toBe(r.total);
    }
  });

  it('rounds messy inputs to cents', () => {
    const r = ok(100.005, { vat_amount: 19.005 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.total).toBe(100.01);
      expect(r.vat).toBe(19.01);
      expect(r.net).toBe(81.00);
    }
  });
});

describe('computeExpenseSplit — currency normalization', () => {
  it('defaults to EUR and upper-cases', () => {
    expect(ok(10).ok && (ok(10) as { currency: string }).currency).toBe('EUR');
    expect(ok(10, { currency: 'usd' }).ok && (ok(10, { currency: 'usd' }) as { currency: string }).currency).toBe('USD');
  });
});

describe('computeExpenseSplit — VAT clamping', () => {
  it('clamps a negative VAT to 0', () => {
    const r = ok(120, { vat_amount: -5 });
    expect(r).toMatchObject({ ok: true, vat: 0, net: 120 });
  });
});

describe('computeExpenseSplit — validation order (first failure wins)', () => {
  it('rejects a non-positive amount before anything else', () => {
    expect(computeExpenseSplit({ amount: 0, category: '', payee: '' }))
      .toEqual({ ok: false, error: 'Amount (total incl. VAT) must be greater than zero.' });
    expect(computeExpenseSplit({ amount: -10, category: 'Rent', payee: 'X' }).ok).toBe(false);
    expect(computeExpenseSplit({ amount: NaN, category: 'Rent', payee: 'X' }).ok).toBe(false);
  });

  it('requires a category once the amount is valid', () => {
    expect(computeExpenseSplit({ amount: 100, category: '   ', payee: 'X' }))
      .toEqual({ ok: false, error: 'A category is required (e.g. Rent, Utilities).' });
  });

  it('requires a payee once amount + category are valid', () => {
    expect(computeExpenseSplit({ amount: 100, category: 'Rent', payee: '  ' }))
      .toEqual({ ok: false, error: 'A supplier / payee name is required.' });
  });

  it('rejects VAT greater than the total (net would go negative)', () => {
    expect(ok(100, { vat_amount: 150 }))
      .toEqual({ ok: false, error: 'VAT cannot exceed the total amount.' });
  });

  it('allows VAT exactly equal to the total (net = 0)', () => {
    expect(ok(100, { vat_amount: 100 })).toMatchObject({ ok: true, net: 0, vat: 100 });
  });
});
