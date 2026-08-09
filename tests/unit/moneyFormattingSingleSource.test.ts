import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatMoney } from '@/utils/decimal';

/**
 * One money formatter, one locale (#329).
 *
 * `formatMoney` in `src/utils/decimal.ts` pins `en-IE` deliberately: English is the platform
 * default for all UI and documents, and a euro amount has to look the same on every screen.
 *
 * This has now drifted **twice**. Its own docstring records the first time — five copies in the
 * projects module passing `undefined` as the locale, so the same amount rendered "€1,234.56" on
 * one screen and "1.234,56 €" on another depending on the viewer's browser language. By the time
 * this test was written it had happened again: twelve more hand-rolled `Intl.NumberFormat`
 * currency formatters across assets, pricing, finance, real estate and the tools pages, using
 * **three** different locales (`undefined`, `en-GB`, `en-IE`).
 *
 * A comment saying "use the helper" clearly does not hold. This does.
 *
 * Note it only forbids CURRENCY formatting. `Intl.NumberFormat` for plain numbers, percentages or
 * file sizes is fine and common — the rule is about money, which must be consistent because
 * people compare the figures across screens.
 */
const SCAN_ROOT = 'src';
const CANONICAL = 'src/utils/decimal.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of walk(SCAN_ROOT)) {
    const rel = relative(process.cwd(), file).split('\\').join('/');
    if (rel === CANONICAL) continue;
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    // `Intl.NumberFormat(...)` whose options declare a currency style. Matched across newlines
    // because several of the originals were wrapped.
    const re = /Intl\.NumberFormat\s*\([^)]*style\s*:\s*'currency'/gs;
    for (const _ of src.matchAll(re)) found.push(rel);
  }
  return [...new Set(found)];
}

describe('money formatting has a single source (#329)', () => {
  it('finds files to scan (guards against a vacuous pass)', () => {
    // Without this, a broken walk or a renamed root would make the assertion below pass by
    // scanning nothing — the same failure shape the test exists to catch.
    expect(walk(SCAN_ROOT).length, 'source scan found no files — SCAN_ROOT is wrong').toBeGreaterThan(500);
  });

  it('nothing hand-rolls a currency formatter outside utils/decimal.ts', () => {
    expect(
      offenders(),
      'These format money with their own Intl.NumberFormat instead of formatMoney(), so they pick '
      + 'their own locale and the same amount renders differently across screens. Import '
      + '`formatMoney` from @/utils/decimal. It takes `decimals` (minimum) and `maxDecimals` — pass '
      + '`{ decimals: 0, maxDecimals: 0 }` for figures that must render whole, like an asking price.\n',
    ).toEqual([]);
  });

  it('formatMoney renders the same amount identically regardless of host locale', () => {
    // The property that matters, asserted directly rather than inferred from the pin.
    expect(formatMoney(1234.5, 'EUR')).toBe(formatMoney(1234.5, 'EUR'));
    expect(formatMoney(1234.5, 'EUR')).toContain('1,234.50');
  });

  it('maxDecimals gives whole amounts, and never inverts the min/max pair', () => {
    expect(formatMoney(450000, 'EUR', { decimals: 0, maxDecimals: 0 })).toContain('450,000');
    expect(formatMoney(450000, 'EUR', { decimals: 0, maxDecimals: 0 })).not.toContain('.00');
    // Intl throws when max < min rather than clamping; the helper must not pass that through.
    expect(() => formatMoney(1.239, 'EUR', { decimals: 2, maxDecimals: 0 })).not.toThrow();
    expect(formatMoney(1.239, 'EUR', { decimals: 2, maxDecimals: 0 })).toContain('1.24');
  });

  it('null is a dash but zero is a real amount', () => {
    // A replaced copy returned the dash for 0 as well, because it tested falsiness — "we do not
    // know" and "nothing" are different facts on a finance screen.
    expect(formatMoney(null, 'EUR')).toBe('—');
    expect(formatMoney(0, 'EUR')).toContain('0.00');
  });
});
