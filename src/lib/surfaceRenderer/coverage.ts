/**
 * How much of a product a rendered surface takes (#447). Pure maths in centimetres and m².
 *
 * The geometry lives here because the embed computes it in a stranger's browser with no round
 * trip. The MONEY does not: a quote re-derives from the stored inputs, and this number is shown,
 * never trusted.
 */
import { round2 } from '@/utils/decimal';

/** Areas, not money: a small mosaic piece is a real 0.0025 m² and must not round to nothing. */
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/** Ceiling on lattice probes, so dragging a slider over a mosaic cannot stall the page. */
const MAX_LATTICE_SAMPLES = 40_000;

/**
 * How many distinct pieces the surface actually touches, by asking the LAYOUT rather than
 * assuming a grid. `piecesToCover` counts rows × columns, which is exact for a running bond and
 * materially short for herringbone, where one plank spans several cells diagonally.
 *
 * Sampling at half the short side means every piece gets probed; null when the piece is so small
 * that probing it would cost more than the answer is worth.
 */
function piecesTouched(
  widthCm: number, depthCm: number, format: TileFormatCm, groutCm: number,
  pattern: Pattern, rotationDeg: number,
): number | null {
  const step = format.widthCm / 2;
  if (!(step > 0)) return null;
  const nx = Math.ceil(widthCm / step) + 1;
  const ny = Math.ceil(depthCm / step) + 1;
  if (nx * ny > MAX_LATTICE_SAMPLES) return null;

  const seen = new Set<string>();
  for (let i = 0; i < nx; i++) {
    const x = Math.min(i * step, widthCm - 1e-6);
    for (let j = 0; j < ny; j++) {
      const y = Math.min(j * step, depthCm - 1e-6);
      const hit = lookupAt(x, y, format, pattern, groutCm, rotationDeg);
      if (!hit.grout) seen.add(`${hit.i}:${hit.j}`);
    }
  }
  return seen.size;
}

import type { Pattern } from './patternVocabulary';
import { lookupAt, type TileFormatCm } from './patterns';

/** Why a coverage figure is not an order quantity. Each one withholds a number rather than guessing it. */
export type CoverageGap = 'no_format' | 'format_assumed' | 'wastage_not_configured' | 'no_pack_size';

export const COVERAGE_GAP_LABEL: Record<CoverageGap, string> = {
  no_format: 'This product has no recorded size, so nothing can be counted.',
  format_assumed: 'The piece size is assumed, not recorded — confirm it before ordering.',
  wastage_not_configured: 'No cutting allowance is set for this pattern, so the order quantity is unknown.',
  no_pack_size: 'This product has no recorded pack size, so it cannot be counted in boxes.',
};

export interface CoverageInput {
  surfaceWidthCm: number;
  surfaceDepthCm: number;
  /** Null when the product records no size at all. */
  format: TileFormatCm | null;
  /** True when the format came from a default rather than the product. */
  formatAssumed: boolean;
  groutCm: number;
  pattern: Pattern;
  /** The layout turn. A 45 deg herringbone cuts differently from a straight one. */
  rotationDeg?: number;
  /** Null means nobody has set one. It is NOT zero. */
  wastagePercent: number | null;
  m2PerBox: number | null;
}

export interface Coverage {
  surfaceM2: number;
  pieceM2: number | null;
  /** Every piece the rectangle touches — edge cuts counted whole, as an order counts them. */
  piecesNet: number | null;
  wastagePercent: number | null;
  /** Net plus the pattern's cutting allowance. Null while that allowance is unknown. */
  piecesGross: number | null;
  m2Gross: number | null;
  boxes: number | null;
  gaps: CoverageGap[];
  /** Every input was known. Anything less and the figures above are an estimate, not an order. */
  orderable: boolean;
}

export function computeCoverage(input: CoverageInput): Coverage {
  const gaps: CoverageGap[] = [];
  const surfaceM2 = round2((input.surfaceWidthCm * input.surfaceDepthCm) / 10_000);

  if (!input.format || input.format.widthCm <= 0 || input.format.lengthCm <= 0) {
    return {
      surfaceM2, pieceM2: null, piecesNet: null, wastagePercent: input.wastagePercent,
      piecesGross: null, m2Gross: null, boxes: null, gaps: ['no_format'], orderable: false,
    };
  }
  if (input.formatAssumed) gaps.push('format_assumed');

  // Kept EXACT for the multiplication below. Rounding a 5×5 cm mosaic to 0.00 m² first made the
  // order 0 boxes while still reporting itself as orderable.
  const pieceArea = (input.format.widthCm * input.format.lengthCm) / 10_000;
  const pieceM2 = round4(pieceArea);
  // The larger of what the layout touches and what the bare area needs. Neither alone is safe:
  // sampling can miss a sliver thinner than half a piece at the edge, and the area figure ignores
  // that a cut piece is a whole piece you buy. Erring high is a returnable box; erring low is a
  // second delivery in a different tone.
  const byArea = Math.ceil((input.surfaceWidthCm * input.surfaceDepthCm) / (input.format.widthCm * input.format.lengthCm));
  const byLayout = piecesTouched(
    input.surfaceWidthCm, input.surfaceDepthCm, input.format, input.groutCm,
    input.pattern, input.rotationDeg ?? 0,
  );
  const piecesNet = Math.max(byArea, byLayout ?? 0);

  // A missing allowance withholds the order quantity instead of standing in as zero: laid in
  // herringbone, the net count is short by every diagonal cut, and a short delivery of tile is a
  // second batch in a different tone.
  if (input.wastagePercent === null) gaps.push('wastage_not_configured');
  const piecesGross = input.wastagePercent === null
    ? null
    : Math.ceil(piecesNet * (1 + input.wastagePercent / 100));
  const m2Gross = piecesGross === null ? null : round2(piecesGross * pieceArea);

  if (input.m2PerBox === null || input.m2PerBox <= 0) gaps.push('no_pack_size');
  const boxes = m2Gross === null || input.m2PerBox === null || input.m2PerBox <= 0
    ? null
    : Math.ceil(m2Gross / input.m2PerBox);

  return {
    surfaceM2, pieceM2, piecesNet, wastagePercent: input.wastagePercent,
    piecesGross, m2Gross, boxes, gaps, orderable: gaps.length === 0,
  };
}

/** The pattern a wastage rate is recorded against. Kept separate so a rate is never read off a label. */
export type WastageRates = Partial<Record<Pattern, number>>;

export function wastageFor(rates: WastageRates, pattern: Pattern): number | null {
  const v = rates[pattern];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}
