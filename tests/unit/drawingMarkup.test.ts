/**
 * Drawing markup — the arithmetic that decides where a cloud lands and what a line measures.
 *
 * Both failures here are silent. A pixel coordinate stored instead of a normalised one still
 * renders a perfectly good-looking cloud, just on the wrong part of the sheet, and the person
 * reading it queries the wrong detail. A measurement taken off an uncalibrated sheet is a valid
 * number in a takeoff for a quantity nobody established.
 */
import { describe, it, expect } from 'vitest';
import {
  toNormalised, toPixels, calibrationFactor, normalisedDistance, measuredLength, measuredArea,
  isCompleteGeometry, boxRect, MIN_POINTS,
} from '@/modules/projects/lib/drawingMarkup';

// A1 landscape, near enough: 841 × 594, so width ÷ height ≈ 1.4158.
const A1 = 841 / 594;

describe('coordinates survive a different render', () => {
  it('round-trips through a completely different canvas size', () => {
    // The whole point. A markup drawn on a laptop must land in the same place on a site tablet
    // rendering the same sheet at a third of the width.
    const drawnOn = { width: 1200, height: 848 };
    const openedOn = { width: 400, height: 283 };
    const n = toNormalised(600, 424, drawnOn);
    expect(n.x).toBeCloseTo(0.5, 6);
    const back = toPixels(n, openedOn);
    expect(back.x).toBeCloseTo(200, 6);
    expect(back.y).toBeCloseTo(141.5, 1);
  });

  it('clamps a drag that leaves the sheet instead of storing a point off the page', () => {
    // x = 1.4 is not on the drawing at all, and it would render off-screen for ever with nothing
    // to say why.
    const rect = { width: 1000, height: 700 };
    expect(toNormalised(1400, -50, rect)).toEqual({ x: 1, y: 0 });
  });

  it('survives a zero-sized canvas without producing NaN', () => {
    // A render that has not laid out yet: NaN coordinates would be stored and never render again.
    expect(toNormalised(10, 10, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('distance is corrected for the page shape', () => {
  it('a vertical span is not counted as a horizontal one on a landscape sheet', () => {
    const horizontal = normalisedDistance({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, A1);
    const vertical = normalisedDistance({ x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, A1);
    // Plain Pythagoras on normalised coordinates would call these equal, which on A1 is wrong by
    // about 40% — the exact error that puts a wall in a takeoff at the wrong length.
    expect(horizontal).toBeCloseTo(0.5, 6);
    expect(vertical).toBeCloseTo(0.5 / A1, 6);
    expect(vertical).toBeLessThan(horizontal);
  });

  it('falls back to square rather than dividing by zero on a missing aspect', () => {
    expect(normalisedDistance({ x: 0, y: 0 }, { x: 0, y: 1 }, 0)).toBeCloseTo(1, 6);
  });
});

describe('calibration', () => {
  it('turns a known length into a factor the rest of the sheet uses', () => {
    // The operator drags along a wall they know is 10m: half the page width.
    const f = calibrationFactor({ x: 0.2, y: 0.5 }, { x: 0.7, y: 0.5 }, 10, A1);
    expect(f).toBeCloseTo(20, 6); // 10m over 0.5 page widths
    // A different line on the same sheet then measures correctly without being recalibrated.
    expect(measuredLength([{ x: 0, y: 0.5 }, { x: 0.25, y: 0.5 }], f, A1)).toBeCloseTo(5, 3);
  });

  it('calibrates correctly off a VERTICAL known line too', () => {
    // The bug this catches: deriving the factor from raw normalised y would make every subsequent
    // horizontal measurement wrong by the aspect ratio, on a sheet that calibrated perfectly.
    const f = calibrationFactor({ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.1 + 0.5 * A1 }, 10, A1);
    expect(f).toBeCloseTo(20, 6);
    expect(measuredLength([{ x: 0, y: 0 }, { x: 0.5, y: 0 }], f, A1)).toBeCloseTo(10, 3);
  });

  it('refuses a zero-length drag rather than returning a factor', () => {
    // A factor from a zero drag is Infinity or 0, and either makes every measurement on the sheet
    // nonsense while looking like a calibrated drawing.
    expect(calibrationFactor({ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 }, 10, A1)).toBeNull();
  });

  it('refuses a zero or negative known length', () => {
    expect(calibrationFactor({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0, A1)).toBeNull();
    expect(calibrationFactor({ x: 0, y: 0 }, { x: 0.5, y: 0 }, -4, A1)).toBeNull();
    expect(calibrationFactor({ x: 0, y: 0 }, { x: 0.5, y: 0 }, Number.NaN, A1)).toBeNull();
  });

  it('refuses a missing page aspect', () => {
    expect(calibrationFactor({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 10, 0)).toBeNull();
  });
});

describe('an uncalibrated sheet measures NOTHING, not zero', () => {
  it('returns null with no factor', () => {
    // A zero in a takeoff is a plausible quantity, which is why this must never be one.
    expect(measuredLength([{ x: 0, y: 0 }, { x: 1, y: 0 }], null, A1)).toBeNull();
    expect(measuredLength([{ x: 0, y: 0 }, { x: 1, y: 0 }], undefined, A1)).toBeNull();
    expect(measuredArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], null, A1)).toBeNull();
  });

  it('returns null on a factor of zero rather than measuring everything as nothing', () => {
    expect(measuredLength([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0, A1)).toBeNull();
  });

  it('returns null for a line with fewer than two points', () => {
    expect(measuredLength([{ x: 0.3, y: 0.3 }], 20, A1)).toBeNull();
  });
});

describe('measurement', () => {
  it('adds up a multi-segment run', () => {
    const f = 20;
    const run = measuredLength(
      [{ x: 0, y: 0.5 }, { x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }], f, A1,
    );
    expect(run).toBeCloseTo(10, 3);
  });

  it('measures an area with the same aspect correction', () => {
    // A square on the SHEET is 0.5 wide by 0.5 × aspect tall in normalised coordinates; at 20
    // units per page width that is 10m × 10m.
    const f = 20;
    const square = [
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.1 },
      { x: 0.6, y: 0.1 + 0.5 * A1 },
      { x: 0.1, y: 0.1 + 0.5 * A1 },
    ];
    expect(measuredArea(square, f, A1)).toBeCloseTo(100, 1);
  });

  it('gives the same area whichever way round the polygon was drawn', () => {
    const f = 20;
    const pts = [
      { x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 },
      { x: 0.6, y: 0.1 + 0.5 * A1 }, { x: 0.1, y: 0.1 + 0.5 * A1 },
    ];
    expect(measuredArea(pts, f, A1)).toBeCloseTo(measuredArea([...pts].reverse(), f, A1)!, 6);
  });

  it('refuses an area from fewer than three points', () => {
    expect(measuredArea([{ x: 0, y: 0 }, { x: 1, y: 1 }], 20, A1)).toBeNull();
  });
});

describe('a markup is not saved half-drawn', () => {
  it('knows how many points each kind needs', () => {
    expect(MIN_POINTS).toEqual({ box: 2, cloud: 3, arrow: 2, text: 1, measure: 2 });
  });

  it('rejects a stray click as a box', () => {
    expect(isCompleteGeometry('box', { points: [{ x: 0.2, y: 0.2 }] })).toBe(false);
    expect(isCompleteGeometry('box', { points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }] })).toBe(true);
  });

  it('accepts a single point as a text pin, which is what one is', () => {
    expect(isCompleteGeometry('text', { points: [{ x: 0.2, y: 0.2 }] })).toBe(true);
  });

  it('rejects missing or malformed geometry outright', () => {
    expect(isCompleteGeometry('cloud', null)).toBe(false);
    expect(isCompleteGeometry('cloud', undefined)).toBe(false);
    expect(isCompleteGeometry('cloud', { points: [] })).toBe(false);
  });
});

describe('a box normalises whichever way it was dragged', () => {
  it('bottom-right to top-left gives the same rectangle', () => {
    const a = boxRect({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.5 });
    const b = boxRect({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.2 });
    expect(a).toEqual(b);
    // Compared loosely: the two drag directions reach the same rectangle through different
    // subtractions, so pinning a float artefact would be testing IEEE-754, not the function.
    expect(a.x).toBeCloseTo(0.2, 9);
    expect(a.y).toBeCloseTo(0.2, 9);
    expect(a.w).toBeCloseTo(0.4, 9);
    expect(a.h).toBeCloseTo(0.3, 9);
  });
});
