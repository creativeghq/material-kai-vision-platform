/**
 * The deterministic surface renderer (#447 Phase 1): a homography that round-trips, a lattice
 * that counts pieces the way an order does, and a render that touches only the surface.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  computeHomography, applyHomography, invertHomography, insideQuad,
  lookupAt, piecesToCover, patternWarning, normalizeFormat, PATTERNS,
  renderSurface, worldRect, raster,
  parseRenderState, serializeRenderState, DEFAULT_RENDER_STATE, hexToRgb,
  type Pt,
} from '../../src/lib/surfaceRenderer';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('the homography', () => {
  const world = worldRect(300, 400);
  const quad: [Pt, Pt, Pt, Pt] = [{ x: 120, y: 200 }, { x: 520, y: 200 }, { x: 640, y: 480 }, { x: 0, y: 480 }];

  it('maps each world corner onto its image corner, and back', () => {
    const H = computeHomography(world, quad);
    const Hinv = invertHomography(H);
    world.forEach((w, i) => {
      const p = applyHomography(H, w);
      expect(close(p.x, quad[i].x, 1e-6) && close(p.y, quad[i].y, 1e-6)).toBe(true);
      const back = applyHomography(Hinv, p);
      expect(close(back.x, w.x, 1e-6) && close(back.y, w.y, 1e-6)).toBe(true);
    });
  });

  it('keeps straight lines straight — the far edge midpoint lands on the far edge', () => {
    const H = computeHomography(world, quad);
    const mid = applyHomography(H, { x: 150, y: 0 });
    expect(close(mid.y, 200, 1e-6)).toBe(true);
  });

  it('refuses a quad that does not span a plane', () => {
    expect(() => computeHomography(world, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])).toThrow();
  });

  it('knows inside from outside for either winding', () => {
    expect(insideQuad({ x: 300, y: 300 }, quad)).toBe(true);
    expect(insideQuad({ x: 50, y: 210 }, quad)).toBe(false);
    expect(insideQuad({ x: 300, y: 300 }, [...quad].reverse() as [Pt, Pt, Pt, Pt])).toBe(true);
  });
});

describe('the lattice', () => {
  const sixty = { widthCm: 60, lengthCm: 60 };
  const plank = { widthCm: 20, lengthCm: 120 };

  it('a 3 m × 4 m floor in 60×60 with 3 mm joints takes 35 pieces (5 across, 7 down)', () => {
    expect(piecesToCover(300, 400, sixty, 0.3)).toBe(35);
  });

  it('stack bond: the joint sits at the end of every pitch and the next piece starts after it', () => {
    const a = lookupAt(10, 10, sixty, 'stack', 0.3);
    expect(a).toMatchObject({ grout: false, i: 0, j: 0 });
    expect(lookupAt(60.1, 10, sixty, 'stack', 0.3)).toEqual({ grout: true });
    expect(lookupAt(60.4, 10, sixty, 'stack', 0.3)).toMatchObject({ grout: false, i: 1, j: 0 });
    expect(lookupAt(10, 60.4, sixty, 'stack', 0.3)).toMatchObject({ grout: false, i: 0, j: 1 });
  });

  it('offset ½: the second row starts half a pitch later', () => {
    const rowOne = lookupAt(10, 70, sixty, 'offset_1_2', 0);
    expect(rowOne).toMatchObject({ grout: false, i: -1, j: 1 });
    expect(lookupAt(40, 70, sixty, 'offset_1_2', 0)).toMatchObject({ i: 0, j: 1 });
  });

  it('herringbone: pieces alternate direction on the diagonal and every point is one piece or a joint', () => {
    const h = lookupAt(10, 5, plank, 'herringbone', 0);
    expect(h).toMatchObject({ grout: false, i: 0, j: 0 });
    // Six widths along x at row 0 is the next lattice block: (6 − 0) mod 12 = 6 → vertical.
    const v = lookupAt(125, 5, plank, 'herringbone', 0);
    expect(v.grout).toBe(false);
    // u runs along the LENGTH in both orientations, so a face never streaks sideways.
    const horiz = lookupAt(115, 5, plank, 'herringbone', 0);
    if (horiz.grout) throw new Error('expected a piece');
    expect(horiz.u).toBeGreaterThan(0.9);
    expect(horiz.v).toBeLessThan(0.3);
  });

  it('basket weave: neighbouring blocks run the opposite way', () => {
    const a = lookupAt(10, 5, plank, 'basket_weave', 0);
    const b = lookupAt(130, 5, plank, 'basket_weave', 0);
    if (a.grout || b.grout) throw new Error('expected pieces');
    // In block (0,0) the length runs along x; in block (1,0) it runs along y.
    expect(a.u).toBeCloseTo(10 / 120, 3);
    expect(b.u).toBeCloseTo(5 / 120, 3);
  });

  it('rotation turns the whole layout', () => {
    const straight = lookupAt(60.1, 10, sixty, 'stack', 0.3, 0);
    const turned = lookupAt(60.1, 10, sixty, 'stack', 0.3, 90);
    expect(straight).toEqual({ grout: true });
    expect(turned.grout).toBe(false);
  });

  it('says when a pattern cannot be laid in a format, rather than laying it wrong silently', () => {
    expect(patternWarning({ widthCm: 60, lengthCm: 90 }, 'herringbone')).toMatch(/needs a length of 2 × the width/);
    expect(patternWarning(plank, 'herringbone')).toBeNull();
    expect(patternWarning({ widthCm: 60, lengthCm: 90 }, 'stack')).toBeNull();
    for (const p of PATTERNS) expect(typeof lookupAt(1, 1, sixty, p, 0.3).grout).toBe('boolean');
  });
});

describe('the render', () => {
  const W = 16;
  const Hh = 12;
  const base = raster(W, Hh);
  for (let i = 0; i < W * Hh; i++) {
    base.data[i * 4] = 100; base.data[i * 4 + 1] = 100; base.data[i * 4 + 2] = 100; base.data[i * 4 + 3] = 255;
  }
  const face = raster(2, 2);
  for (let i = 0; i < 4; i++) { face.data[i * 4] = 200; face.data[i * 4 + 1] = 40; face.data[i * 4 + 2] = 40; face.data[i * 4 + 3] = 255; }
  const quad: [Pt, Pt, Pt, Pt] = [{ x: 4, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 10 }, { x: 4, y: 10 }];

  it('paints inside the surface and leaves the rest of the photo untouched', () => {
    const out = renderSurface(base, { quad, widthCm: 80, depthCm: 60 }, {
      face, format: { widthCm: 20, lengthCm: 20 }, pattern: 'stack', groutWidthMm: 0, groutColor: [0, 0, 0], rotationDeg: 0,
    }, { keepLighting: false });
    const px = (x: number, y: number) => Array.from(out.data.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
    expect(px(0, 0)).toEqual([100, 100, 100]);
    expect(px(15, 11)).toEqual([100, 100, 100]);
    expect(px(6, 6)).toEqual([200, 40, 40]);
    expect(base.data[(6 * W + 6) * 4]).toBe(100);
  });

  it('draws the joints in the grout colour', () => {
    const out = renderSurface(base, { quad, widthCm: 80, depthCm: 60 }, {
      face, format: { widthCm: 40, lengthCm: 40 }, pattern: 'stack', groutWidthMm: 400, groutColor: [0, 0, 255], rotationDeg: 0,
    }, { keepLighting: false });
    // A 40 cm joint after a 40 cm piece across an 80 cm-wide quad: the right half is joint.
    const k = (7 * W + 11) * 4;
    expect(Array.from(out.data.slice(k, k + 3))).toEqual([0, 0, 255]);
  });

  it('honours a mask: a masked-out pixel inside the quad keeps the photo', () => {
    const mask = raster(W, Hh);
    for (let i = 0; i < W * Hh; i++) { mask.data[i * 4 + 3] = 255; mask.data[i * 4] = 255; mask.data[i * 4 + 1] = 255; mask.data[i * 4 + 2] = 255; }
    const hole = (6 * W + 6) * 4;
    mask.data[hole] = 0; mask.data[hole + 1] = 0; mask.data[hole + 2] = 0;
    const out = renderSurface(base, { quad, widthCm: 80, depthCm: 60, mask }, {
      face, format: { widthCm: 20, lengthCm: 20 }, pattern: 'stack', groutWidthMm: 0, groutColor: [0, 0, 0], rotationDeg: 0,
    }, { keepLighting: false });
    expect(Array.from(out.data.slice(hole, hole + 3))).toEqual([100, 100, 100]);
    expect(out.data[(7 * W + 7) * 4]).toBe(200);
  });

  it('keeps the photo\'s shading: a darker pixel of the surface stays darker', () => {
    const shaded = raster(W, Hh, new Uint8ClampedArray(base.data));
    const dark = (8 * W + 8) * 4;
    shaded.data[dark] = 30; shaded.data[dark + 1] = 30; shaded.data[dark + 2] = 30;
    const out = renderSurface(shaded, { quad, widthCm: 80, depthCm: 60 }, {
      face, format: { widthCm: 20, lengthCm: 20 }, pattern: 'stack', groutWidthMm: 0, groutColor: [0, 0, 0], rotationDeg: 0,
    });
    expect(out.data[dark]).toBeLessThan(out.data[(6 * W + 6) * 4]);
  });
});

describe('the URL state', () => {
  it('round-trips, and rejects what it does not understand instead of rendering it', () => {
    const s = { ...DEFAULT_RENDER_STATE, sceneId: 'a', surfaceKey: 'floor', productId: 'p', pattern: 'herringbone' as const, groutWidthMm: 2, groutColorHex: '#333333', rotationDeg: 45 };
    expect(parseRenderState(serializeRenderState(s))).toEqual(s);
    const bad = parseRenderState(new URLSearchParams('pattern=zigzag&grout=99&groutColor=red&rot=-90'));
    expect(bad.pattern).toBe('stack');
    expect(bad.groutWidthMm).toBe(3);
    expect(bad.groutColorHex).toBe(DEFAULT_RENDER_STATE.groutColorHex);
    expect(bad.rotationDeg).toBe(270);
    expect(hexToRgb('#ff0080')).toEqual([255, 0, 128]);
  });
});

describe('the renderer stays deterministic', () => {
  it('imports no provider, no network and no React', () => {
    const dir = join(process.cwd(), 'src/lib/surfaceRenderer');
    for (const f of readdirSync(dir)) {
      const src = stripComments(readFileSync(join(dir, f), 'utf8'));
      expect(src, f).not.toMatch(/fetch\(|supabase|anthropic|gemini|replicate|from 'react'|XMLHttpRequest/i);
    }
  });
});

describe('a recorded format reaches the lattice short side first', () => {
  it('normalizeFormat orders either way round', () => {
    expect(normalizeFormat(120, 60)).toEqual({ widthCm: 60, lengthCm: 120 });
    expect(normalizeFormat(60, 120)).toEqual({ widthCm: 60, lengthCm: 120 });
    expect(normalizeFormat(60, 60)).toEqual({ widthCm: 60, lengthCm: 60 });
  });
});
