/**
 * Drawing markup geometry and scale — the arithmetic, on its own, testable without a canvas.
 *
 * ONE RULE holds the whole thing up: coordinates are normalised 0–1 against the page, never
 * pixels. A pixel coordinate is meaningless the moment anybody opens the drawing at a different
 * zoom, on a different screen, or at a different render DPI — the cloud lands somewhere else on
 * the sheet, still looking like a perfectly good markup, and the person reading it queries the
 * wrong detail. Nothing raises: a wrong coordinate is a valid coordinate.
 *
 * The second rule is about the scale. It is set by drawing a line of KNOWN length, never read off
 * the title block: a sheet printed "1:50" survives being photocopied at 90%, and the drawing does
 * not. An uncalibrated sheet measures NOTHING — never zero.
 */

export interface NormPoint {
  /** 0–1 across the page width. */
  x: number;
  /** 0–1 down the page height. */
  y: number;
}

export interface MarkupGeometry {
  points: NormPoint[];
}

export const MARKUP_KINDS = ['box', 'cloud', 'arrow', 'text', 'measure'] as const;
export type MarkupKind = (typeof MARKUP_KINDS)[number];

/** How many points each kind needs before it is a real markup rather than a stray click. */
export const MIN_POINTS: Record<MarkupKind, number> = {
  box: 2, cloud: 3, arrow: 2, text: 1, measure: 2,
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Screen pixels to page-normalised coordinates.
 *
 * Clamped, because a drag that leaves the canvas should stop at the edge of the sheet rather than
 * store a point off the page — a markup at x = 1.4 is not on the drawing at all, and it would
 * render off-screen for ever after with nothing to say why.
 */
export function toNormalised(
  px: number, py: number, rect: { width: number; height: number },
): NormPoint {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  return { x: clamp01(px / rect.width), y: clamp01(py / rect.height) };
}

/** Page-normalised back to pixels on whatever this render happens to be. */
export function toPixels(
  p: NormPoint, rect: { width: number; height: number },
): { x: number; y: number } {
  return { x: p.x * rect.width, y: p.y * rect.height };
}

export function isCompleteGeometry(kind: MarkupKind, g: MarkupGeometry | null | undefined): boolean {
  return !!g && Array.isArray(g.points) && g.points.length >= MIN_POINTS[kind];
}

/**
 * The calibration: how many real-world units one unit of normalised page WIDTH represents.
 *
 * Width, not height — the two normalised axes have different pixel lengths unless the page is
 * square, so a factor derived from one and applied to the other measures a vertical line wrong by
 * the aspect ratio. Every length below is computed in width units and scaled once.
 *
 * Returns null rather than a number when the inputs cannot produce one. A calibration of zero, or
 * from a zero-length drag, would make every measurement on the sheet zero — which is the silent
 * zero, in a takeoff, where a zero is a plausible quantity.
 */
export function calibrationFactor(
  a: NormPoint, b: NormPoint, knownLength: number, pageAspect: number,
): number | null {
  if (!(knownLength > 0) || !Number.isFinite(knownLength)) return null;
  if (!(pageAspect > 0) || !Number.isFinite(pageAspect)) return null;
  const d = normalisedDistance(a, b, pageAspect);
  if (!(d > 0)) return null;
  return knownLength / d;
}

/**
 * Distance between two normalised points, in units of page WIDTH.
 *
 * `pageAspect` is width ÷ height. The y difference is divided by it so a vertical span of 0.5 on a
 * landscape sheet is not counted as the same distance as a horizontal one — which is exactly what
 * plain Pythagoras on normalised coordinates would do, and it would be wrong by up to 40% on A1.
 */
export function normalisedDistance(a: NormPoint, b: NormPoint, pageAspect: number): number {
  const dx = b.x - a.x;
  const dy = (b.y - a.y) / (pageAspect > 0 ? pageAspect : 1);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * A measured length, or null when the sheet has not been calibrated.
 *
 * Null, never 0, and never a guess from the title block. An unmeasured line in a takeoff that
 * reads as zero is a quantity nobody ordered.
 */
export function measuredLength(
  points: readonly NormPoint[],
  factor: number | null | undefined,
  pageAspect: number,
): number | null {
  if (factor == null || !(factor > 0)) return null;
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += normalisedDistance(points[i - 1], points[i], pageAspect);
  }
  return Math.round(total * factor * 1000) / 1000;
}

/**
 * The area of a closed normalised polygon in real units², or null when uncalibrated.
 *
 * The shoelace formula, with the y terms un-squashed by the aspect first — the same correction as
 * `normalisedDistance`, for the same reason.
 */
export function measuredArea(
  points: readonly NormPoint[],
  factor: number | null | undefined,
  pageAspect: number,
): number | null {
  if (factor == null || !(factor > 0)) return null;
  if (points.length < 3) return null;
  const asp = pageAspect > 0 ? pageAspect : 1;
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    twice += p.x * (q.y / asp) - q.x * (p.y / asp);
  }
  return Math.round(Math.abs(twice / 2) * factor * factor * 1000) / 1000;
}

/** The two corners of a box, in the order a canvas wants them, whichever way it was dragged. */
export function boxRect(a: NormPoint, b: NormPoint): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}
