/**
 * How a supplier invoice line is READ — the one copy, and the defects it replaced.
 *
 * Two screens receive stock from a myDATA line: `ReceiveToWarehouseDialog` (the modal on an
 * expense) and `PendingProductsCard` (the intake queue). They had each answered the same six
 * questions and disagreed on four of them. Every case below is one of those disagreements, so
 * the test doubles as the record of which answer is right and why.
 *
 * The live line these are drawn from — ΤΔΑ10 1791, 2026-08-04:
 *   { quantity: 4.1, measurement_unit: 4, item_code: "11-3331-60-1", vat_category: 1,
 *     net_value: 100.48, item_description: "ΠΑΓΚΟΣ EGGER H3331 ST10 300/3 P3 IDRO 4100x600x38mm" }
 * The queue read three of those six fields and filed the line as 4.1 PIECES of a product whose
 * supplier code it had invented, at a cost that did not multiply back to the invoice.
 */
import { describe, it, expect } from 'vitest';

import {
  VAT_PCT_BY_CATEGORY, vatPctForCategory, resolveIntakeUnit, resolveSupplierCode,
  unitCostFromNet, netValueDrift, unitQuantityIssue, priceFromMarkup, markupFromPrice,
  netListPrice,
} from '@/modules/finance/utils/intakeLine';

/** The line above, as `inbound_documents.lines` stores it. */
const EGGER = {
  quantity: 4.1,
  measurement_unit: 4,
  item_code: '11-3331-60-1',
  vat_category: 1,
  net_value: 100.48,
};

describe('the unit is what the document states, not what its prose suggests', () => {
  it('takes the AADE code over both the model and the parser', () => {
    const r = resolveIntakeUnit({ code: EGGER.measurement_unit, modelUnit: 'pcs', parsedUnit: 'pcs' });
    expect(r.unit).toBe('m');
    expect(r.statedByAade).toBe(true);
    // The reason is shown to the operator; it has to say WHERE the answer came from, because
    // "pcs" and "m" are equally confident-looking in a form field.
    expect(r.reason).toMatch(/AADE/);
  });

  it('falls back to the model only when the document omitted the code', () => {
    const r = resolveIntakeUnit({ code: null, modelUnit: 'm2', parsedUnit: 'pcs' });
    expect(r.unit).toBe('m2');
    expect(r.statedByAade).toBe(false);
  });

  it('normalises whatever the model invented', () => {
    // Left as free text, the queue accumulated 'ml', 'gr', 'ltr', 'BIG BAG' and 'σάκι'.
    // Aliases resolve; the rest at least pass through a single chokepoint.
    expect(resolveIntakeUnit({ modelUnit: 'τεμ' }).unit).toBe('pcs');
    expect(resolveIntakeUnit({ modelUnit: 'sqm' }).unit).toBe('m2');
  });

  it('falls back to the parser, then to pieces, and says so either way', () => {
    expect(resolveIntakeUnit({ parsedUnit: 'm', parsedReason: 'Fractional quantity.' }).unit).toBe('m');
    const bare = resolveIntakeUnit({});
    expect(bare.unit).toBe('pcs');
    expect(bare.reason).toMatch(/did not state a unit/);
  });

  it('an unknown code is not a unit — it must not silently become pieces', () => {
    // A 7th code would mean AADE published one. Guessing would file stock in the wrong unit;
    // falling through to the description at least keeps the guess visible as a guess.
    expect(resolveIntakeUnit({ code: 99, modelUnit: 'kg' }).unit).toBe('kg');
    expect(resolveIntakeUnit({ code: 99, modelUnit: 'kg' }).statedByAade).toBe(false);
  });
});

describe('the supplier code is theirs, not one we found in their prose', () => {
  it('prefers item_code over anything scraped from the description', () => {
    // The parser reads "H3331" out of the text. That string becomes products.external_sku and
    // supplier_products.supplier_sku — the keys the NEXT invoice matches on — so a guess here
    // forks the catalog one delivery later, and makes the 1.0 "supplier item code matches"
    // score that auto-approve acts on unreachable for the code the supplier actually prints.
    expect(resolveSupplierCode(EGGER.item_code, 'H3331')).toBe('11-3331-60-1');
  });

  it('uses the parsed code only when the line carries none', () => {
    expect(resolveSupplierCode(null, 'H3331')).toBe('H3331');
    expect(resolveSupplierCode('   ', 'H3331')).toBe('H3331');
    expect(resolveSupplierCode(null, null)).toBe('');
  });
});

describe('cost, and how far it drifts from the invoice', () => {
  it('is the net over the quantity, to the cent', () => {
    expect(unitCostFromNet(EGGER.net_value, EGGER.quantity)).toBe(24.51);
  });

  it('reports the rounding gap rather than hiding it', () => {
    // 24.51 × 4.1 = 100.491 against a stated 100.48. One line is an artefact; a page of them is
    // a ledger that no longer reconciles with the invoices behind it — and neither number was
    // ever on screen.
    expect(netValueDrift(100.48, 4.1, 24.51)).toBe(0.01);
  });

  it('is silent when the arithmetic agrees', () => {
    expect(netValueDrift(100, 4, 25)).toBeNull();
    expect(netValueDrift(null, 4, 25)).toBeNull();
  });

  it('has no cost to state when the quantity is zero or missing', () => {
    expect(unitCostFromNet(100.48, 0)).toBeNull();
    expect(unitCostFromNet(100.48, null)).toBeNull();
    expect(unitCostFromNet(null, 4.1)).toBeNull();
  });
});

describe('a quantity that cannot exist in its unit', () => {
  it('flags a fractional count of discrete things', () => {
    expect(unitQuantityIssue('pcs', 4.1)).toMatch(/not a whole number/);
    expect(unitQuantityIssue('box', 2.5)).toMatch(/not a whole number/);
  });

  it('says nothing about units that are legitimately fractional', () => {
    // The warning has to stay rare to stay read: 4.1 m, 17.92 m² and 0.5 kg are all ordinary.
    expect(unitQuantityIssue('m', 4.1)).toBeNull();
    expect(unitQuantityIssue('m2', 17.92)).toBeNull();
    expect(unitQuantityIssue('kg', 0.5)).toBeNull();
    expect(unitQuantityIssue('pcs', 4)).toBeNull();
    expect(unitQuantityIssue('pcs', null)).toBeNull();
  });
});

describe('markup and sale price are two views of one number', () => {
  it('goes both ways', () => {
    expect(priceFromMarkup(24.51, 30)).toBe(31.86);
    // NOT exactly 30 back: the price is rounded to the cent on the way out, so the markup it
    // implies is 29.99. Pinned rather than smoothed over — the operator sees both numbers, and
    // a helper that quietly "corrected" the second one would be inventing a margin nobody set.
    expect(markupFromPrice(24.51, 31.86)).toBe(29.99);
    expect(priceFromMarkup(100, 25)).toBe(125);
    expect(markupFromPrice(100, 125)).toBe(25);
  });

  it('has no answer without a cost to measure against', () => {
    expect(priceFromMarkup(null, 30)).toBeNull();
    expect(markupFromPrice(0, 31.86)).toBeNull();
    expect(markupFromPrice(24.51, null)).toBeNull();
  });
});

describe('netting a VAT-inclusive price before it becomes list_price', () => {
  it('nets by the line’s own VAT category', () => {
    const r = netListPrice({ typed: 124, vatCategory: 1, pricesIncludeVat: true });
    expect(r.ok && r.net).toBe(100);
    expect(r.ok && r.vatPct).toBe(24);
  });

  it('leaves an ex-VAT price alone', () => {
    const r = netListPrice({ typed: 100, vatCategory: 1, pricesIncludeVat: false });
    expect(r.ok && r.net).toBe(100);
  });

  it('REFUSES rather than storing the gross figure when no category is set', () => {
    // The defect this replaced: both copies returned the typed number unchanged here, so a
    // gross price landed in list_price as if it were net and every quote built on it was 24%
    // high. In the modal the category is seeded from the line so it was near-unreachable; in
    // the queue the field defaulted to blank, which made this the DEFAULT path.
    const r = netListPrice({ typed: 124, vatCategory: '', pricesIncludeVat: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('vat_category_required');
  });

  it('an unknown category is not a rate', () => {
    expect(netListPrice({ typed: 124, vatCategory: 42, pricesIncludeVat: true }).ok).toBe(false);
  });

  it('has nothing to net when nothing was typed', () => {
    const r = netListPrice({ typed: null, vatCategory: '', pricesIncludeVat: true });
    expect(r.ok && r.net).toBeNull();
  });

  it('category 7 and 8 are 0%, which is a RATE and not a missing one', () => {
    // Exempt lines exist and net to themselves. Treating 0 as absent would refuse them.
    expect(vatPctForCategory(7)).toBe(0);
    const r = netListPrice({ typed: 100, vatCategory: 7, pricesIncludeVat: true });
    expect(r.ok && r.net).toBe(100);
  });

  it('has a percent for every AADE category and none for a blank', () => {
    expect(Object.keys(VAT_PCT_BY_CATEGORY)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(vatPctForCategory(null)).toBeNull();
    expect(vatPctForCategory('')).toBeNull();
  });
});
