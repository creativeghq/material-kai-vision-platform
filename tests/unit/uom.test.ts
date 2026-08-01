/**
 * Unit-of-measure conversion.
 *
 * The scenario these exist for: a 1200×2400 gypsum board is 2.88 m², invoiced by the square
 * metre, counted by the piece and shipped by the pallet. Before the ladder existed a supplier
 * line of 288 m² added 288 PIECES to the stock row, because `record_stock_movement` takes a bare
 * number and no unit. 288 is a perfectly valid quantity — no constraint, no typecheck and no
 * integrity probe could see that it was 2.88× wrong.
 *
 * Two properties matter more than the arithmetic:
 *   1. An unknown conversion returns NULL, never the input. A silent 1:1 fallback IS the bug.
 *   2. Rounding happens on the result, not the factor — 1/2.88 rounded first, times 288, is
 *      99.999936 boards.
 */
import { describe, it, expect } from 'vitest';
import { convertToBase, convertPrice, availableUnits, type ProductUom } from '@/lib/uom';

/** A board: 2.88 m² each, 1 to a box, 50 boxes to a pallet, counted in pieces. */
const BOARD: ProductUom = {
  base_unit: 'pcs',
  factors: { pcs: 1, box: 1, pallet: 50, m2: 1 / 2.88 },
  m2_per_piece: 2.88,
  pieces_per_box: 1,
  boxes_per_pallet: 50,
  pieces_per_pallet: 50,
  m2_per_box: 2.88,
  m2_per_pallet: 144,
  kg_per_piece: null,
};

/** The same product before anyone filled in the packaging — geometry unknown. */
const UNKNOWN: ProductUom = {
  base_unit: 'pcs',
  factors: { pcs: 1 },
  m2_per_piece: null, pieces_per_box: null, boxes_per_pallet: null,
  pieces_per_pallet: null, m2_per_box: null, m2_per_pallet: null, kg_per_piece: null,
};

describe('convertToBase', () => {
  it('turns a square-metre supplier line into a count of boards', () => {
    expect(convertToBase(BOARD, 288, 'm2')).toBe(100);
    expect(convertToBase(BOARD, 144, 'm2')).toBe(50);
    expect(convertToBase(BOARD, 2.88, 'm2')).toBe(1);
  });

  it('rounds the result, not the factor', () => {
    // The regression: rounding 1/2.88 to 6dp before multiplying gives 99.999936 boards.
    expect(convertToBase(BOARD, 288, 'm2')).not.toBe(99.999936);
    expect(Number.isInteger(convertToBase(BOARD, 288, 'm2') as number)).toBe(true);
  });

  it('converts pallets and boxes', () => {
    expect(convertToBase(BOARD, 2, 'pallet')).toBe(100);
    expect(convertToBase(BOARD, 7, 'box')).toBe(7);
  });

  it('passes the base unit and an unstated unit straight through', () => {
    expect(convertToBase(BOARD, 12, 'pcs')).toBe(12);
    expect(convertToBase(BOARD, 12, null)).toBe(12);
    expect(convertToBase(BOARD, 12, '')).toBe(12);
  });

  it('returns null — NOT the input — when the conversion is unknown', () => {
    // The single most important assertion in this file.
    expect(convertToBase(BOARD, 10, 'lt')).toBeNull();
    expect(convertToBase(UNKNOWN, 288, 'm2')).toBeNull();
    expect(convertToBase(UNKNOWN, 2, 'pallet')).toBeNull();
    expect(convertToBase(null, 5, 'pcs')).toBeNull();
  });

  it('returns null for a non-finite quantity rather than propagating NaN', () => {
    expect(convertToBase(BOARD, Number.NaN, 'm2')).toBeNull();
    expect(convertToBase(BOARD, Number.POSITIVE_INFINITY, 'm2')).toBeNull();
  });
});

describe('convertPrice', () => {
  it('restates a pallet price as a price per board', () => {
    // €450 a pallet, 50 boards to a pallet.
    expect(convertPrice(BOARD, 450, 'pallet', 'pcs')).toBe(9);
  });

  it('restates a per-board price as a price per square metre', () => {
    // €12 a board over 2.88 m² is €4.17/m².
    expect(convertPrice(BOARD, 12, 'pcs', 'm2')).toBe(4.17);
  });

  it('is identity for the same unit', () => {
    expect(convertPrice(BOARD, 12, 'pcs', 'pcs')).toBe(12);
  });

  it('returns null when either side is unrelatable, rather than quoting a wrong price', () => {
    expect(convertPrice(BOARD, 450, 'lt', 'pcs')).toBeNull();
    expect(convertPrice(UNKNOWN, 450, 'pallet', 'pcs')).toBeNull();
  });
});

describe('availableUnits', () => {
  it('lists the base unit first', () => {
    expect(availableUnits(BOARD)[0]).toBe('pcs');
    expect(availableUnits(BOARD)).toEqual(expect.arrayContaining(['m2', 'box', 'pallet']));
  });

  it('offers only the base unit when nothing else is known', () => {
    expect(availableUnits(UNKNOWN)).toEqual(['pcs']);
  });
});
