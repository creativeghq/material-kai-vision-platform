/**
 * What a render costs in product (#447). The rule under every case: a missing input withholds the
 * number it feeds, and never stands in as zero — an under-ordered tile job is a second batch in a
 * different tone, and a short count is a valid number nothing downstream can question.
 */
import { describe, it, expect } from 'vitest';

import { computeCoverage, wastageFor, COVERAGE_GAP_LABEL, type CoverageInput } from '../../src/lib/surfaceRenderer';
import { packCoverageM2 } from '../../src/components/features/roomplanner/surfaceFormat';

const sixty = { widthCm: 60, lengthCm: 60 };

const base: CoverageInput = {
  surfaceWidthCm: 300,
  surfaceDepthCm: 400,
  format: sixty,
  formatAssumed: false,
  groutCm: 0.3,
  pattern: 'stack',
  wastagePercent: 10,
  m2PerBox: 1.44,
};

describe('coverage', () => {
  it('turns a 3 × 4 m floor into an order when every input is known', () => {
    const c = computeCoverage(base);
    expect(c.surfaceM2).toBe(12);
    expect(c.pieceM2).toBe(0.36);
    // 5 across × 7 down, the lattice count the renderer draws.
    expect(c.piecesNet).toBe(35);
    expect(c.piecesGross).toBe(39);
    expect(c.m2Gross).toBeCloseTo(14.04, 2);
    // 14.04 m² at 1.44 m² per box is 9.75 boxes — you buy 10.
    expect(c.boxes).toBe(10);
    expect(c.gaps).toEqual([]);
    expect(c.orderable).toBe(true);
  });

  it('an unset allowance withholds the order quantity instead of quietly using the short count', () => {
    const c = computeCoverage({ ...base, wastagePercent: null });
    expect(c.piecesNet).toBe(35);
    expect(c.piecesGross).toBeNull();
    expect(c.m2Gross).toBeNull();
    expect(c.boxes).toBeNull();
    expect(c.gaps).toContain('wastage_not_configured');
    expect(c.orderable).toBe(false);
  });

  it('a zero allowance is a DECISION and still orders — it is not the same as unset', () => {
    const c = computeCoverage({ ...base, wastagePercent: 0 });
    expect(c.piecesGross).toBe(35);
    expect(c.orderable).toBe(true);
    expect(c.gaps).toEqual([]);
  });

  it('no pack size costs the box count and nothing else', () => {
    const c = computeCoverage({ ...base, m2PerBox: null });
    expect(c.m2Gross).toBeCloseTo(14.04, 2);
    expect(c.boxes).toBeNull();
    expect(c.gaps).toEqual(['no_pack_size']);
    expect(c.orderable).toBe(false);
  });

  it('an assumed format still counts, but is never an order', () => {
    const c = computeCoverage({ ...base, formatAssumed: true });
    expect(c.piecesGross).toBe(39);
    expect(c.gaps).toContain('format_assumed');
    expect(c.orderable).toBe(false);
  });

  it('no format at all counts nothing and says so', () => {
    const c = computeCoverage({ ...base, format: null });
    expect(c.surfaceM2).toBe(12);
    expect(c.pieceM2).toBeNull();
    expect(c.piecesNet).toBeNull();
    expect(c.boxes).toBeNull();
    expect(c.gaps).toEqual(['no_format']);
    expect(c.orderable).toBe(false);
  });

  it('counts what the PATTERN touches, not a grid it does not lay in', () => {
    // 20 × 20 cm of wall in 10 × 20 planks. A row/column grid says 2. Herringbone actually touches
    // three: one horizontal, one vertical, one horizontal again on the diagonal.
    const square = { surfaceWidthCm: 20, surfaceDepthCm: 20, groutCm: 0 };
    const stack = computeCoverage({ ...base, ...square, format: { widthCm: 10, lengthCm: 20 }, pattern: 'stack' });
    const herring = computeCoverage({ ...base, ...square, format: { widthCm: 10, lengthCm: 20 }, pattern: 'herringbone' });
    expect(stack.piecesNet).toBe(2);
    expect(herring.piecesNet).toBe(3);
    expect(herring.piecesNet!).toBeGreaterThan(stack.piecesNet!);
  });

  it('turning the layout changes what it costs', () => {
    const straight = computeCoverage({ ...base, pattern: 'herringbone', format: { widthCm: 20, lengthCm: 120 } });
    const turned = computeCoverage({ ...base, pattern: 'herringbone', format: { widthCm: 20, lengthCm: 120 }, rotationDeg: 45 });
    expect(straight.piecesNet).toBeGreaterThan(0);
    expect(turned.piecesNet).toBeGreaterThan(0);
    // Not asserting which is larger — only that the turn is an INPUT, not silently discarded.
    expect(turned.piecesNet).not.toBe(straight.piecesNet);
  });

  it('never reports fewer pieces than the bare area needs', () => {
    for (const pattern of ['stack', 'offset_1_2', 'diagonal', 'herringbone', 'basket_weave'] as const) {
      const c = computeCoverage({ ...base, pattern });
      const bare = Math.ceil((300 * 400) / (60 * 60));
      expect(c.piecesNet, pattern).toBeGreaterThanOrEqual(bare);
    }
  });

  it('a small mosaic piece is a real area, not a rounded-away zero', () => {
    // round2 on the piece area made a 5 × 5 cm mosaic 0.00 m², so the order came back as 0 boxes
    // while still calling itself orderable: a valid, plausible, catastrophic number.
    const c = computeCoverage({ ...base, format: { widthCm: 5, lengthCm: 5 }, m2PerBox: 0.5 });
    expect(c.pieceM2).toBeGreaterThan(0);
    expect(c.piecesNet).toBeGreaterThan(1000);
    expect(c.m2Gross).toBeGreaterThan(11);
    expect(c.boxes).toBeGreaterThan(20);
    expect(c.orderable).toBe(true);
  });

  it('a 7.5 × 15 metro tile counts its area exactly, not to the nearest cent', () => {
    const c = computeCoverage({ ...base, format: { widthCm: 7.5, lengthCm: 15 }, wastagePercent: 0, m2PerBox: 1 });
    // 0.01125 m² a piece: rounding that to 0.01 under-counts the job by 11%.
    expect(c.m2Gross!).toBeCloseTo(c.piecesNet! * 0.01125, 2);
  });

  it('every gap has a sentence a reader can act on', () => {
    for (const gap of Object.keys(COVERAGE_GAP_LABEL)) {
      expect(COVERAGE_GAP_LABEL[gap as keyof typeof COVERAGE_GAP_LABEL].length).toBeGreaterThan(20);
    }
  });

  it('a pattern with no recorded rate is null, and a nonsense rate is not accepted as one', () => {
    expect(wastageFor({ stack: 8 }, 'stack')).toBe(8);
    expect(wastageFor({ stack: 8 }, 'herringbone')).toBeNull();
    expect(wastageFor({ herringbone: Number.NaN }, 'herringbone')).toBeNull();
    expect(wastageFor({ herringbone: -5 }, 'herringbone')).toBeNull();
    expect(wastageFor({}, 'stack')).toBeNull();
  });
});

describe('pack size is read, never guessed', () => {
  it('prefers a recorded coverage, then converts sqft, then multiplies a piece count', () => {
    expect(packCoverageM2({ metadata: { m2_per_box: '1.44' } }, 0.36)).toBeCloseTo(1.44, 4);
    expect(packCoverageM2({ metadata: { sqft_per_box: '15.5' } }, 0.36)).toBeCloseTo(1.44, 2);
    expect(packCoverageM2({ attributes: { pieces_per_box: 4 } }, 0.36)).toBeCloseTo(1.44, 4);
    expect(packCoverageM2({ metadata: { planks_per_box: 8 } }, 0.24)).toBeCloseTo(1.92, 4);
    expect(packCoverageM2({ metadata: { coverage_per_roll_m2: 5.3 } }, null)).toBeCloseTo(5.3, 4);
  });

  it('returns null rather than a pack size nobody recorded', () => {
    expect(packCoverageM2({ metadata: {} }, 0.36)).toBeNull();
    expect(packCoverageM2({ metadata: { m2_per_box: 0 } }, 0.36)).toBeNull();
    expect(packCoverageM2({ metadata: { m2_per_box: 'about a box' } }, 0.36)).toBeNull();
    // A piece count with no piece area cannot become an area — that would be a guess.
    expect(packCoverageM2({ attributes: { pieces_per_box: 4 } }, null)).toBeNull();
  });
});
