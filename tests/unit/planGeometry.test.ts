/**
 * Plan geometry math.
 *
 * This module converts a picture into measurements, and every number it returns
 * feeds something that spends money or gets built — cable lengths, pipe runs,
 * fixture counts. The failure mode that matters is not a crash; it is a
 * plausible-looking wrong number. So the tests below concentrate on:
 *
 *   • degenerate calibration returning null rather than 0 (a 0 scale would make
 *     every derived length "0 mm" and read as a legitimate answer)
 *   • malformed jsonb degrading to empty geometry instead of throwing
 *   • the metres-vs-millimetres slip, which is the classic 1000x error
 */
import { describe, it, expect } from 'vitest';
import {
  PLAN_GEOMETRY_VERSION,
  parsePlanGeometry,
  calibrateFromLine,
  withCalibration,
  mmPerPx,
  isCalibrated,
  pxToMm,
  mmToPx,
  normalizedToMm,
  mmToNormalized,
  impliedAreaSqm,
  checkAreaAgainstBrief,
  wallLengthMm,
  totalWallRunM,
  EMPTY_PLAN_GEOMETRY,
  type PlanGeometry,
} from '../../src/utils/planGeometry';

describe('calibrateFromLine', () => {
  it('derives mm-per-pixel from a horizontal line', () => {
    // 200px line declared as 4000mm → 20 mm/px
    expect(calibrateFromLine({ x1: 0, y1: 0, x2: 200, y2: 0, real_mm: 4000 })).toBe(20);
  });

  it('uses true distance for a diagonal line, not the bounding box', () => {
    // 3-4-5 triangle: 300,400 → 500px. 5000mm / 500px = 10 mm/px
    expect(calibrateFromLine({ x1: 0, y1: 0, x2: 300, y2: 400, real_mm: 5000 })).toBe(10);
  });

  it('is direction-independent', () => {
    const a = calibrateFromLine({ x1: 10, y1: 10, x2: 110, y2: 10, real_mm: 1000 });
    const b = calibrateFromLine({ x1: 110, y1: 10, x2: 10, y2: 10, real_mm: 1000 });
    expect(a).toBe(b);
  });

  // The whole point of returning null: a 0 here would silently zero every
  // downstream length while still typechecking as a number.
  it.each([
    ['zero-length line (stray click)', { x1: 50, y1: 50, x2: 50, y2: 50, real_mm: 1000 }],
    ['sub-pixel line', { x1: 50, y1: 50, x2: 50.4, y2: 50, real_mm: 1000 }],
    ['zero real length', { x1: 0, y1: 0, x2: 200, y2: 0, real_mm: 0 }],
    ['negative real length', { x1: 0, y1: 0, x2: 200, y2: 0, real_mm: -4000 }],
    ['NaN real length', { x1: 0, y1: 0, x2: 200, y2: 0, real_mm: Number.NaN }],
  ])('returns null, never 0, for %s', (_label, cal) => {
    expect(calibrateFromLine(cal)).toBeNull();
  });

  it('withCalibration refuses to store an unusable scale', () => {
    const bad = withCalibration(EMPTY_PLAN_GEOMETRY, { x1: 0, y1: 0, x2: 0, y2: 0, real_mm: 1000 });
    expect(bad).toBeNull();
  });

  it('withCalibration keeps the evidence alongside the answer', () => {
    const cal = { x1: 0, y1: 0, x2: 100, y2: 0, real_mm: 2500 };
    const g = withCalibration(EMPTY_PLAN_GEOMETRY, cal)!;
    expect(g.scale?.mm_per_px).toBe(25);
    // Re-derivable: the stored calibration must reproduce the stored scale.
    expect(calibrateFromLine(g.scale!.calibration!)).toBe(g.scale!.mm_per_px);
  });
});

describe('parsePlanGeometry', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not geometry'],
    ['an array', []],
    ['a number', 42],
  ])('degrades %s to empty geometry rather than throwing', (_label, raw) => {
    expect(parsePlanGeometry(raw)).toEqual(EMPTY_PLAN_GEOMETRY);
  });

  it('keeps well-formed walls and drops malformed ones', () => {
    const g = parsePlanGeometry({
      version: 1,
      walls: [
        { id: 'w1', x1: 0, y1: 0, x2: 4000, y2: 0 },
        { id: 'w2', x1: 0, y1: 0, x2: 'oops', y2: 0 },
        { x1: 0, y1: 0, x2: 1, y2: 1 },
        null,
      ],
      openings: [],
    });
    expect(g.walls.map((w) => w.id)).toEqual(['w1']);
  });

  it('drops openings whose wall no longer exists', () => {
    const g = parsePlanGeometry({
      version: 1,
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 4000, y2: 0 }],
      openings: [
        { id: 'o1', wall_id: 'w1', offset_mm: 500, width_mm: 900, kind: 'door' },
        { id: 'o2', wall_id: 'deleted', offset_mm: 500, width_mm: 900, kind: 'window' },
      ],
    });
    expect(g.openings.map((o) => o.id)).toEqual(['o1']);
  });

  it('rejects a non-positive scale instead of storing it', () => {
    expect(parsePlanGeometry({ scale: { mm_per_px: 0 }, walls: [], openings: [] }).scale).toBeUndefined();
    expect(parsePlanGeometry({ scale: { mm_per_px: -5 }, walls: [], openings: [] }).scale).toBeUndefined();
  });

  it('keeps a valid scale even when the calibration evidence is corrupt', () => {
    // The scale is still usable; we just lose the ability to re-derive it.
    const g = parsePlanGeometry({
      scale: { mm_per_px: 12.5, calibration: { x1: 0, y1: 0, x2: 'x', y2: 0, real_mm: 100 } },
      walls: [], openings: [],
    });
    expect(g.scale?.mm_per_px).toBe(12.5);
    expect(g.scale?.calibration).toBeUndefined();
  });

  it('defaults the version when absent', () => {
    expect(parsePlanGeometry({ walls: [], openings: [] }).version).toBe(PLAN_GEOMETRY_VERSION);
  });
});

describe('scale accessors', () => {
  it('reports an uncalibrated plan as such', () => {
    expect(mmPerPx(EMPTY_PLAN_GEOMETRY)).toBeNull();
    expect(isCalibrated(EMPTY_PLAN_GEOMETRY)).toBe(false);
  });

  it('round-trips px and mm', () => {
    expect(pxToMm(100, 20)).toBe(2000);
    expect(mmToPx(2000, 20)).toBe(100);
  });
});

describe('normalized ↔ mm boundary conversion', () => {
  // Existing lighting/plumbing/electrical sheets store symbols as [0..1] over
  // the backdrop. These two must be exact inverses or every migrated symbol
  // drifts across the plan.
  it('round-trips through the backdrop extent', () => {
    const extentPx = 800;
    const scale = 5; // mm per px → 4000mm wide backdrop
    const mm = normalizedToMm(0.25, extentPx, scale);
    expect(mm).toBe(1000);
    expect(mmToNormalized(mm, extentPx, scale)).toBe(0.25);
  });

  it('maps the extremes to the backdrop edges', () => {
    expect(normalizedToMm(0, 800, 5)).toBe(0);
    expect(normalizedToMm(1, 800, 5)).toBe(4000);
  });

  it('does not divide by zero on a degenerate extent', () => {
    expect(mmToNormalized(1000, 0, 5)).toBe(0);
  });
});

describe('area cross-check against the brief', () => {
  it('computes implied area from backdrop pixels', () => {
    // 800x600 px at 5 mm/px → 4.0m x 3.0m = 12 m²
    expect(impliedAreaSqm(800, 600, 5)).toBe(12);
  });

  it('returns null rather than 0 for a degenerate backdrop', () => {
    expect(impliedAreaSqm(0, 600, 5)).toBeNull();
    expect(impliedAreaSqm(800, 600, 0)).toBeNull();
  });

  it('accepts a calibration close to the brief', () => {
    expect(checkAreaAgainstBrief(42, 40)?.suspicious).toBe(false);
  });

  // The classic slip: the user types the reference length in metres ("4")
  // where millimetres were asked for ("4000"), scaling everything by 1/1000
  // in length and 1/1,000,000 in area.
  it('flags a metres-for-millimetres calibration', () => {
    expect(checkAreaAgainstBrief(0.000012, 12)?.suspicious).toBe(true);
  });

  it('flags a calibration that implies an order of magnitude too much', () => {
    expect(checkAreaAgainstBrief(400, 40)?.suspicious).toBe(true);
  });

  it('reports the ratio so the warning can be specific', () => {
    expect(checkAreaAgainstBrief(400, 40)?.ratio).toBe(10);
  });

  it('returns null when there is nothing to compare against', () => {
    expect(checkAreaAgainstBrief(12, 0)).toBeNull();
    expect(checkAreaAgainstBrief(0, 40)).toBeNull();
  });
});

describe('derived wall quantities', () => {
  const geometry: PlanGeometry = {
    version: 1,
    walls: [
      { id: 'w1', x1: 0, y1: 0, x2: 4000, y2: 0 },
      { id: 'w2', x1: 4000, y1: 0, x2: 4000, y2: 3000 },
    ],
    openings: [],
  };

  it('measures a single wall in mm', () => {
    expect(wallLengthMm(geometry.walls[0])).toBe(4000);
  });

  it('totals the traced run in metres', () => {
    expect(totalWallRunM(geometry)).toBe(7);
  });

  it('is 0 for an untraced plan — not NaN', () => {
    expect(totalWallRunM(EMPTY_PLAN_GEOMETRY)).toBe(0);
  });
});
