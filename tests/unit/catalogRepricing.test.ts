import { describe, it, expect } from 'vitest';

import {
  r2, rederiveFromUnitPrice, lineReconciles, absorbCent, scaleToTargetNet,
  type CatalogLine,
} from '../../supabase/functions/_shared/catalog-repricing';

/**
 * Catalog line arithmetic (#352 A13).
 *
 * `adjust_catalog_pricing` scaled `price`, `net_value` and `discount_value` INDEPENDENTLY by the
 * same factor, each rounded to 2dp on its own, and the three stopped reconciling. Every figure
 * was a valid number, so nothing raised and no typecheck could see it — the customer's document
 * simply did not add up.
 *
 * The arithmetic lived inline in a tool closure, which is why it could be wrong for as long as
 * it was: there was nowhere to put a worked example. This file is that example.
 */

const line = (over: Partial<CatalogLine> = {}): CatalogLine => ({
  price: 10, quantity: 1, discountPct: 0, discountValue: null, net: 10, ...over,
});

describe('#352 A13 — the audit\'s worked case', () => {
  // price 33.33 x qty 3 − discount 10.00 = net 89.99, retargeted to net 100.
  // The old code stored price 37.04, discount 11.11, net 100.00 — and 37.04 x 3 − 11.11
  // is 100.01, so the printed line contradicted its own total.
  const before: CatalogLine = {
    price: 33.33, quantity: 3, discountPct: 10, discountValue: 10.00, net: 89.99,
  };

  it('the starting line reconciles', () => {
    // 33.33 x 3 = 99.99, − 10.00 = 89.99. If this drifts the rest of the case means nothing.
    expect(lineReconciles(before)).toBe(true);
  });

  it('after retargeting to 100, the line still adds up', () => {
    const { lines } = scaleToTargetNet([before], 100);
    const after = lines[0];
    expect(lineReconciles(after)).toBe(true);
    expect(r2(r2(after.price! * after.quantity) - Number(after.discountValue))).toBe(after.net);
  });

  it('and the total is exactly the target', () => {
    const { lines, remainderCents } = scaleToTargetNet([before], 100);
    expect(r2(lines.reduce((a, l) => a + l.net, 0))).toBe(100);
    expect(remainderCents).toBe(0);
  });

  it('the specific old output is no longer produced', () => {
    // The exact triple the audit found: 37.04 / 11.11 / 100.00, which does not reconcile.
    const { lines } = scaleToTargetNet([before], 100);
    const bad = lines[0].price === 37.04 && lines[0].discountValue === 11.11 && lines[0].net === 100.00;
    expect(bad, 'reproduced the non-reconciling triple from the audit').toBe(false);
  });
});

describe('#352 A13 — one independent figure per line', () => {
  it('the unit price drives the discount and the net', () => {
    const out = rederiveFromUnitPrice({ price: 20, quantity: 4, discountPct: 25, discountValue: 5, net: 999 });
    expect(out.discountValue).toBe(20); // 25% of 80
    expect(out.net).toBe(60);
  });

  it('a line with no unit price is left alone', () => {
    // Nothing printed can contradict a bare net, so net IS the independent figure there.
    const l = line({ price: null, net: 42 });
    expect(rederiveFromUnitPrice(l)).toEqual(l);
    expect(lineReconciles(l)).toBe(true);
  });

  it('a line with no discount at all does not grow one', () => {
    const out = rederiveFromUnitPrice({ price: 12.5, quantity: 2, discountPct: 0, discountValue: null, net: 0 });
    expect(out.discountValue).toBeNull();
    expect(out.net).toBe(25);
  });
});

describe('#352 A13 — the rounding remainder never breaks a line', () => {
  it('a cent is absorbed by the discount, keeping the line consistent', () => {
    const out = absorbCent({ price: 10, quantity: 3, discountPct: 10, discountValue: 3, net: 27 }, 0.01)!;
    expect(out).not.toBeNull();
    expect(out.discountValue).toBe(2.99);
    expect(out.net).toBe(27.01);
    expect(lineReconciles(out)).toBe(true);
  });

  it('a discount is never pushed negative to win a cent', () => {
    // A negative discount prints as a surcharge in the Discount column — a worse lie than the
    // one this module removes.
    expect(absorbCent({ price: 10, quantity: 1, discountPct: 0, discountValue: 0, net: 10 }, 0.01)).toBeNull();
  });

  it('a price-less line absorbs on its net', () => {
    const out = absorbCent(line({ price: null, net: 10 }), -0.01)!;
    expect(out.net).toBe(9.99);
  });

  it('every line still reconciles across a messy multi-line retarget', () => {
    // Mixed quantities and discount percentages are what produce a remainder in the first place.
    const lines: CatalogLine[] = [
      { price: 33.33, quantity: 3, discountPct: 10, discountValue: 10.00, net: 89.99 },
      { price: 7.77, quantity: 7, discountPct: 5, discountValue: 2.72, net: 51.67 },
      { price: 1.11, quantity: 9, discountPct: 12.5, discountValue: 1.25, net: 8.74 },
      { price: null, quantity: 1, discountPct: 0, discountValue: null, net: 15.5 },
    ];
    const { lines: out, remainderCents } = scaleToTargetNet(lines, 250);
    for (const l of out) expect(lineReconciles(l), `line ${JSON.stringify(l)} does not add up`).toBe(true);
    expect(remainderCents).toBe(0);
    expect(r2(out.reduce((a, l) => a + l.net, 0))).toBe(250);
  });

  it('it terminates and REPORTS when no line can absorb', () => {
    // Every line has a unit price and a zero discount, so no cent can move without breaking a
    // printed figure. Being a cent off target beats a document that contradicts itself — and
    // the loop must not spin forever trying.
    const lines: CatalogLine[] = [
      { price: 3.33, quantity: 3, discountPct: 0, discountValue: null, net: 9.99 },
      { price: 1.11, quantity: 3, discountPct: 0, discountValue: null, net: 3.33 },
    ];
    const { lines: out, remainderCents } = scaleToTargetNet(lines, 100);
    for (const l of out) expect(lineReconciles(l)).toBe(true);
    expect(Math.abs(remainderCents)).toBeLessThan(5);
  });
});

describe('#352 A13 — scaling basics still hold', () => {
  it('scaling up and down both land on target', () => {
    const base: CatalogLine[] = [
      { price: 100, quantity: 1, discountPct: 10, discountValue: 10, net: 90 },
      { price: 50, quantity: 2, discountPct: 10, discountValue: 10, net: 90 },
    ];
    for (const target of [360, 90, 1000]) {
      const { lines, remainderCents } = scaleToTargetNet(base, target);
      expect(remainderCents, `target ${target}`).toBe(0);
      expect(r2(lines.reduce((a, l) => a + l.net, 0)), `target ${target}`).toBe(target);
      for (const l of lines) expect(lineReconciles(l)).toBe(true);
    }
  });

  it('a zero-net catalog is refused rather than divided by zero', () => {
    const { lines, remainderCents } = scaleToTargetNet([line({ price: 0, net: 0 })], 100);
    expect(remainderCents).toBe(0);
    expect(lines[0].net).toBe(0);
  });

  it('discount PERCENTAGES survive the scale', () => {
    // The tool's promise is that each line "keeps its discount %", so the document still reads
    // as a genuine re-quote rather than one hand-edited line.
    const { lines } = scaleToTargetNet(
      [{ price: 40, quantity: 2, discountPct: 25, discountValue: 20, net: 60 }],
      120,
    );
    const l = lines[0];
    const gross = r2(l.price! * l.quantity);
    expect(r2(Number(l.discountValue) / gross * 100)).toBe(25);
  });
});
