/**
 * One implementation per money primitive.
 *
 * CLAUDE.md states the rule for derived money quantities ("one derivation per money quantity"), but
 * the same disease had spread through the plumbing underneath it, where nobody was looking because
 * each copy is two lines long and obviously correct in isolation:
 *
 *   round2      13 declarations, TWO different results. The canonical pair nudged by Number.EPSILON
 *               so 1.005 -> 1.01; the eleven local `r2` copies did not, so the same subtotal rounded
 *               differently depending on which file computed it.
 *   formatMoney  6 declarations. The canonical pins `en-IE`; five copies in the projects module
 *               passed `undefined`, so one euro amount rendered "EUR 1,234.56" and another
 *               "1.234,56 EUR" purely from the viewer's browser language. One also dashed a real
 *               zero because it tested falsiness.
 *   VAT on net   9 open-coded `net * pct / 100` sites, next to a module whose header claimed to be
 *               the only place that arithmetic lived.
 *   remainder    `amount - sum(allocations)` in three TS sites and three SQL functions, disagreeing
 *               on WHICH column to sum -- see paymentSweepWiring.test.ts.
 *
 * None of these were reported by a user. They are all latent: every copy agrees on the common path
 * and diverges only at a half-cent, a non-English browser, or a cross-currency settlement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { round2, formatMoney } from '@/utils/decimal';
import { vatOf, vatOfRaw } from '@/modules/finance/lib/vatMath';

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((p) => ({ path: p.replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));
const rel = (p: string) => p.slice(p.indexOf('/src/') + 1);

describe('round2 is declared once', () => {
  it('no file re-implements cent rounding', () => {
    const offenders = FILES.filter(({ path, src }) =>
      !path.endsWith('/src/utils/decimal.ts')
      && /(const\s+(r2|round2)\s*=\s*\(|function\s+round2\s*\()/.test(src))
      .map(({ path }) => rel(path));
    expect(offenders, 'import { round2 } from "@/utils/decimal" instead').toEqual([]);
  });

  it('rounds a half cent up — the behaviour the local copies lost', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0)).toBe(0);
  });
});

describe('formatMoney is declared once', () => {
  it('any file declaring it must be delegating to the canonical one', () => {
    const offenders = FILES.filter(({ path, src }) =>
      !path.endsWith('/src/utils/decimal.ts')
      && /(const\s+formatMoney\s*=|function\s+formatMoney\s*\()/.test(src)
      && !/from '@\/utils\/decimal'/.test(src))
      .map(({ path }) => rel(path));
    expect(offenders, 'import { formatMoney } from "@/utils/decimal" instead').toEqual([]);
  });

  it('pins the locale so an amount reads the same for every viewer', () => {
    // Non-breaking space in the Intl output — compare on the digits, not the separator byte.
    expect(formatMoney(1234.5, 'EUR')).toContain('1,234.50');
    expect(formatMoney(null)).toBe('—');
    // Zero is an amount, not "unknown" — one replaced copy dashed it.
    expect(formatMoney(0, 'EUR')).toContain('0.00');
  });
});

describe('VAT on a net figure comes from vatMath', () => {
  it('vatOf rounds, vatOfRaw does not — both from one formula', () => {
    expect(vatOf(100, 24)).toBe(24);
    expect(vatOf(0.05, 24)).toBe(0.01);
    expect(vatOfRaw(0.05, 24)).toBeCloseTo(0.012, 6);
    expect(vatOf(100, 0)).toBe(0);
  });

  it('is not confused with extracting VAT out of a gross figure', async () => {
    const { extractVat } = await import('@/modules/finance/lib/vatMath');
    // 124 gross at 24% holds 24 of VAT; 124 NET at 24% attracts 29.76. Writing the wrong one is a
    // silent misfiling, which is why both live in one module rather than at each call site.
    expect(extractVat(124, 24)).toBe(24);
    expect(vatOf(124, 24)).toBe(29.76);
  });
});
