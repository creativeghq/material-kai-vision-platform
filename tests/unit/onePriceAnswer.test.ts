/**
 * One question, one answer: a price is RESOLVED in SQL and formatted in TypeScript (#405).
 *
 * `get_catalog_prices_for_workspace` used to re-derive the reseller branch itself instead of
 * calling `get_product_price_for_workspace`, the one ladder 15 call sites use — so it knew nothing
 * about customer overrides, level discounts, quantity breaks or custom category rules. And
 * `ProductStrip` threw away the `kind` it was given and inferred the label from `discount_pct > 0`,
 * which labelled a sub-account at 0% discount "Retail" when it was their buy price — a valid number nothing can see.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const hook = read('src/hooks/useCatalogPrices.ts');
const strip = read('src/components/features/ai/ProductStrip.tsx');
const discover = read('src/pages/DiscoverPage.tsx');
const priceLine = read('src/components/features/products/ProductPriceLine.tsx');

/** Every client surface that shows a catalog price. */
const SURFACES: Array<[string, string]> = [
  ['useCatalogPrices', hook],
  ['ProductStrip', strip],
  ['DiscoverPage', discover],
  ['ProductPriceLine', priceLine],
];

describe('no client surface recomputes a price from parts', () => {
  it.each(SURFACES)('%s does no pricing arithmetic of its own', (_name, src) => {
    // The shapes that mean "a price was assembled here": a discount applied to a base, a margin
    // taken off a cost, or a markup multiplied on. Formatting (toFixed) is fine; deriving is not.
    const derivations = [
      /\*\s*\(1\s*-\s*\w*[Dd]iscount/,
      /\(1\s*-\s*\w+\s*\/\s*\w+\)/,
      /list_?[Pp]rice\s*\*/,
      /cost\w*\s*\*\s*\(1\s*\+/,
      /markup/i,
    ];
    for (const re of derivations) {
      expect(src, `this surface derives a price itself: ${re}`).not.toMatch(re);
    }
  });

  it('every surface reads the resolver through the one hook or RPC', () => {
    expect(hook).toContain('get_catalog_prices_for_workspace');
    expect(discover, 'Discover builds its own price query').toContain('useCatalogPrices');
    expect(priceLine, 'the modal price line builds its own price query').toContain('useCatalogPrices');
    expect(strip).toContain('get_catalog_prices_for_workspace');
  });
});

describe('the label is stated, not inferred', () => {
  it('ProductStrip reads `kind` rather than guessing from the discount', () => {
    expect(strip, 'the price label is not read from `kind`').toMatch(/kind === 'your_price'/);
    // The defect: a sub-account at 0% discount had its BUY price labelled "Retail".
    expect(strip, 'the label is still inferred from the discount')
      .not.toMatch(/disc\s*>\s*0\s*\?\s*'Your price'/);
  });

  it('Discover does the same', () => {
    expect(discover).toMatch(/kind === 'your_price'/);
  });
});

describe('an unpriced product says so', () => {
  it('the hook carries `unpriced` rather than collapsing it to 0', () => {
    expect(hook).toContain('unpriced');
    // A missing price rendered as 0 reads as free — the silent-zero shape on a money number.
    expect(hook, 'a null price is defaulted to 0').not.toMatch(/price\s*\?\?\s*0/);
  });

  it('and the surfaces render an em dash for it', () => {
    for (const [name, src] of [['DiscoverPage', discover], ['ProductPriceLine', priceLine]] as const) {
      expect(src, `${name} has no absent-value rendering`).toMatch(/—/);
    }
  });

  it('a capped call is reported, never silently short', () => {
    // Returning 200 rows for 500 ids with no word about it renders the other 300 as unpriced.
    expect(hook).toContain('capped');
    expect(hook).toMatch(/asked/);
    expect(hook).toMatch(/returned/);
  });
});
