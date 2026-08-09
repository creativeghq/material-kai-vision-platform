/**
 * Room planner geometry guard (#321 M3, #259 Phase 1).
 *
 * Everything here fails *silently and plausibly*. A sofa clamped against the wrong wall, or a
 * rotated item whose footprint was computed unrotated so it hangs through a wall it visually
 * clears — all of those render as a perfectly normal-looking plan. There is no exception, no type
 * error, and no stored-data inconsistency for an integrity probe to find. The only way to know is
 * to assert the arithmetic.
 *
 * The rotation cases are the ones that matter. A 1.8 x 0.9 m sofa turned 90° occupies 0.9 x 1.8 m
 * of floor; clamping it against its unrotated width is how "it fitted on the plan" becomes "it does
 * not fit in the room".
 */
import { describe, it, expect } from 'vitest';
import {
  snapToGrid, rotatedExtent, clampToRoom, boundsOf, overlaps, overlappingPairs,
  occupiedAreaM2, fitScale, GRID_M,
} from '@/components/features/roomplanner/roomGeometry';

const sofa = (over: Partial<Parameters<typeof boundsOf>[0]> = {}) => ({
  xM: 2, yM: 2, rotationDeg: 0, widthM: 1.8, depthM: 0.9, ...over,
});

describe('snapToGrid', () => {
  it('rounds to the nearest 10 cm', () => {
    expect(snapToGrid(1.23)).toBe(1.2);
    expect(snapToGrid(1.27)).toBe(1.3);
    expect(snapToGrid(0)).toBe(0);
  });

  it('does not emit floating-point noise into the database', () => {
    // 0.1 * 3 is 0.30000000000000004 in IEEE754, and that value would be stored verbatim.
    expect(snapToGrid(0.3)).toBe(0.3);
    expect(String(snapToGrid(0.3))).toBe('0.3');
    expect(String(snapToGrid(2.7000000000000002))).toBe('2.7');
  });

  it('survives nonsense instead of poisoning the layout with NaN', () => {
    expect(snapToGrid(Number.NaN)).toBe(0);
    expect(snapToGrid(1.23, 0)).toBe(0);
  });

  it('honours a custom grid', () => {
    expect(snapToGrid(1.23, 0.25)).toBe(1.25);
  });

  it('exports the grid it defaults to, so the canvas draws the grid it snaps to', () => {
    expect(GRID_M).toBe(0.1);
  });
});

describe('rotatedExtent — the axis-aligned floor a rotated item actually occupies', () => {
  it('is unchanged at 0°', () => {
    expect(rotatedExtent({ widthM: 1.8, depthM: 0.9 }, 0)).toEqual({ widthM: 1.8, depthM: 0.9 });
  });

  it('swaps the axes at 90°', () => {
    const e = rotatedExtent({ widthM: 1.8, depthM: 0.9 }, 90);
    expect(e.widthM).toBeCloseTo(0.9, 6);
    expect(e.depthM).toBeCloseTo(1.8, 6);
  });

  it('is the same at 180° as at 0° — rotation is not a size change', () => {
    const e = rotatedExtent({ widthM: 1.8, depthM: 0.9 }, 180);
    expect(e.widthM).toBeCloseTo(1.8, 6);
    expect(e.depthM).toBeCloseTo(0.9, 6);
  });

  it('is LARGER than either axis at 45°, which is the case naive code gets wrong', () => {
    const e = rotatedExtent({ widthM: 1.8, depthM: 0.9 }, 45);
    expect(e.widthM).toBeGreaterThan(1.8);
    expect(e.depthM).toBeGreaterThan(0.9);
    expect(e.widthM).toBeCloseTo((1.8 + 0.9) * Math.SQRT1_2, 6);
  });

  it('treats negative rotation the same as positive', () => {
    expect(rotatedExtent({ widthM: 1.8, depthM: 0.9 }, -90).widthM)
      .toBeCloseTo(rotatedExtent({ widthM: 1.8, depthM: 0.9 }, 90).widthM, 6);
  });
});

describe('clampToRoom', () => {
  const room = { widthM: 5, depthM: 4 };

  it('leaves an item that already fits where it is', () => {
    expect(clampToRoom(sofa(), room)).toEqual({ xM: 2, yM: 2 });
  });

  it('pulls an item back inside by half its width, not to the wall itself', () => {
    expect(clampToRoom(sofa({ xM: 99 }), room).xM).toBeCloseTo(5 - 0.9, 6);
    expect(clampToRoom(sofa({ xM: -99 }), room).xM).toBeCloseTo(0.9, 6);
  });

  // The rotation case: at 90° the sofa is 0.9 wide and 1.8 deep, so its limits swap.
  it('clamps a rotated item against its ROTATED extent', () => {
    const rotated = sofa({ rotationDeg: 90, xM: 99, yM: 99 });
    const { xM, yM } = clampToRoom(rotated, room);
    expect(xM).toBeCloseTo(5 - 0.45, 6);   // half of 0.9
    expect(yM).toBeCloseTo(4 - 0.9, 6);    // half of 1.8
  });

  it('centres an item too large for the room instead of jamming it into a corner', () => {
    const huge = sofa({ widthM: 12, depthM: 0.9, xM: 0 });
    expect(clampToRoom(huge, room).xM).toBe(2.5);
  });
});

describe('overlaps', () => {
  it('detects two items in the same place', () => {
    expect(overlaps(sofa(), sofa())).toBe(true);
  });

  it('does not flag items that merely touch — flush furniture is normal', () => {
    const a = sofa({ xM: 1 });                 // spans 0.1 … 1.9
    const b = sofa({ xM: 1 + 1.8 });           // spans 1.9 … 3.7
    expect(overlaps(a, b)).toBe(false);
  });

  it('flags a genuine overlap, however small', () => {
    const a = sofa({ xM: 1 });
    const b = sofa({ xM: 1 + 1.7 });
    expect(overlaps(a, b)).toBe(true);
  });

  it('accounts for rotation — turning an item can create an overlap', () => {
    const a = sofa({ xM: 2, yM: 2 });                       // 1.8 x 0.9
    const b = sofa({ xM: 2, yM: 3.0, rotationDeg: 0 });     // clear: 0.9 gap between centres
    expect(overlaps(a, b)).toBe(false);
    const bRotated = { ...b, rotationDeg: 90 };             // now 0.9 x 1.8 → reaches back
    expect(overlaps(a, bRotated)).toBe(true);
  });
});

describe('overlappingPairs', () => {
  it('returns every colliding pair once, by index', () => {
    const items = [sofa({ xM: 1 }), sofa({ xM: 1.2 }), sofa({ xM: 4.5 })];
    expect(overlappingPairs(items)).toEqual([[0, 1]]);
  });

  it('is empty for a tidy room', () => {
    expect(overlappingPairs([sofa({ xM: 1 }), sofa({ xM: 4 })])).toEqual([]);
  });
});

describe('occupiedAreaM2', () => {
  it('sums footprint areas', () => {
    expect(occupiedAreaM2([sofa(), sofa()])).toBe(3.24); // 1.8*0.9 = 1.62 each
  });

  it('grows for a rotated item, because its axis-aligned footprint does', () => {
    expect(occupiedAreaM2([sofa({ rotationDeg: 45 })]))
      .toBeGreaterThan(occupiedAreaM2([sofa()]));
  });

  it('is zero for an empty room', () => {
    expect(occupiedAreaM2([])).toBe(0);
  });
});

describe('fitScale', () => {
  it('fits by the tighter axis so the room never overflows its box', () => {
    // 5 x 4 m room in a 500 x 300 box, 24 px padding → usable 452 x 252.
    const s = fitScale({ widthM: 5, depthM: 4 }, 500, 300);
    expect(s).toBeCloseTo(Math.min(452 / 5, 252 / 4), 6);
    expect(5 * s).toBeLessThanOrEqual(452);
    expect(4 * s).toBeLessThanOrEqual(252);
  });

  it('stays positive for a box smaller than its own padding', () => {
    expect(fitScale({ widthM: 5, depthM: 4 }, 10, 10)).toBeGreaterThan(0);
  });
});
