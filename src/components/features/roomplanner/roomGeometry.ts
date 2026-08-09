/**
 * Room planner geometry (#321 M3, #259 Phase 1).
 *
 * Pure, React-free, metres in and metres out. Every number the planner stores is a real-world
 * measurement — there is no pixel unit anywhere in the model, because a layout that only means
 * something at one zoom level is not a plan. Pixels exist solely in `metresToPx`, at the edge.
 *
 * Separated from the canvas component because this is the part that can be *wrong* in ways nobody
 * sees: an item that clamps to the wrong edge, a rotated sofa whose footprint is computed
 * unrotated and so overlaps a wall it visually clears. Those all render happily.
 */

export interface Footprint {
  widthM: number;
  depthM: number;
}

export interface Placement extends Footprint {
  /** Centre of the item, metres from the room's top-left corner. */
  xM: number;
  yM: number;
  rotationDeg: number;
}

export interface RoomSize {
  widthM: number;
  depthM: number;
}

/** Default grid, in metres. 10 cm is fine enough to look deliberate, coarse enough to snap cleanly. */
export const GRID_M = 0.1;

/** Round to the nearest grid step. */
export function snapToGrid(valueM: number, gridM: number = GRID_M): number {
  if (!Number.isFinite(valueM) || gridM <= 0) return 0;
  // Rounded to 4 dp because 0.30000000000000004 is a real thing and it reaches the database.
  return Math.round(Math.round(valueM / gridM) * gridM * 10000) / 10000;
}

/**
 * The AXIS-ALIGNED footprint of a rotated item.
 *
 * A 1.8 x 0.9 m sofa turned 90° occupies 0.9 x 1.8 m of floor, and at 45° it occupies more than
 * either. Clamping or overlap-testing against the unrotated footprint is the bug that lets a
 * rotated item hang through a wall while looking fine on screen.
 */
export function rotatedExtent(fp: Footprint, rotationDeg: number): Footprint {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    widthM: fp.widthM * cos + fp.depthM * sin,
    depthM: fp.widthM * sin + fp.depthM * cos,
  };
}

/**
 * Keep an item's centre inside the room, accounting for its rotated extent.
 *
 * An item larger than the room in one axis is centred on that axis rather than pushed to a corner:
 * there is no valid position, and centring at least shows the overflow symmetrically instead of
 * pretending one wall is the problem.
 */
export function clampToRoom(placement: Placement, room: RoomSize): { xM: number; yM: number } {
  const extent = rotatedExtent(placement, placement.rotationDeg);
  const halfW = extent.widthM / 2;
  const halfD = extent.depthM / 2;

  const minX = halfW;
  const maxX = room.widthM - halfW;
  const minY = halfD;
  const maxY = room.depthM - halfD;

  return {
    xM: minX > maxX ? room.widthM / 2 : Math.min(Math.max(placement.xM, minX), maxX),
    yM: minY > maxY ? room.depthM / 2 : Math.min(Math.max(placement.yM, minY), maxY),
  };
}

/** Axis-aligned bounds of a placement, in metres. */
export function boundsOf(p: Placement): { left: number; right: number; top: number; bottom: number } {
  const e = rotatedExtent(p, p.rotationDeg);
  return {
    left: p.xM - e.widthM / 2,
    right: p.xM + e.widthM / 2,
    top: p.yM - e.depthM / 2,
    bottom: p.yM + e.depthM / 2,
  };
}

/**
 * Do two placements overlap on the floor?
 *
 * Axis-aligned approximation of the rotated extents — deliberately conservative: it can report an
 * overlap for two diagonally-rotated pieces that would just miss. For a planner that is the right
 * error, because the warning is advisory and a false "these touch" costs a glance, while a missed
 * one costs a delivery.
 *
 * Touching edges do not count as overlapping; furniture pushed flush against furniture is a normal
 * arrangement, not a mistake.
 */
export function overlaps(a: Placement, b: Placement): boolean {
  const A = boundsOf(a);
  const B = boundsOf(b);
  return A.left < B.right && A.right > B.left && A.top < B.bottom && A.bottom > B.top;
}

/** Indices of every pair that overlaps. Used to flag items, not to prevent placement. */
export function overlappingPairs(items: Placement[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (overlaps(items[i], items[j])) out.push([i, j]);
    }
  }
  return out;
}

/** Floor area an arrangement covers, m². Ignores overlap, so it is an upper bound. */
export function occupiedAreaM2(items: Placement[]): number {
  const total = items.reduce((sum, p) => {
    const e = rotatedExtent(p, p.rotationDeg);
    return sum + e.widthM * e.depthM;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** Metres → pixels for rendering. The ONLY place a pixel exists. */
export function metresToPx(valueM: number, pxPerM: number): number {
  return valueM * pxPerM;
}

/**
 * Scale that fits a room into a canvas box, with padding.
 *
 * Returned rather than assumed so the canvas and the item layer cannot disagree about scale —
 * two components computing "px per metre" independently is how a plan ends up with furniture
 * drawn at a different scale than its own room.
 */
export function fitScale(room: RoomSize, boxW: number, boxH: number, paddingPx = 24): number {
  const usableW = Math.max(boxW - paddingPx * 2, 1);
  const usableH = Math.max(boxH - paddingPx * 2, 1);
  return Math.min(usableW / room.widthM, usableH / room.depthM);
}
