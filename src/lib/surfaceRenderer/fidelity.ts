/**
 * Did the photoreal pass keep the product's colour? (#447)
 *
 * "Change nothing" is a request, not a guarantee: a generative model re-synthesises the image
 * rather than compositing ours, and a tile is bought on its colour. So the surface is MEASURED
 * before and after, and a shift is reported rather than assumed absent.
 */
import { insideQuad, type Pt } from './homography';
import type { Raster } from './render';

/**
 * CIE76 ΔE at which a shift stops being rounding and starts being a different tile. ~1 is the
 * threshold of visibility under ideal conditions; 6 is comfortably "a person would call that a
 * different colour" while leaving room for the relighting we actually asked for.
 */
export const PHOTOREAL_DELTA_E_LIMIT = 6;

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

const labF = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB to CIE L*a*b* under D65, so a comparison is perceptual rather than a raw channel delta. */
export function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a: [number, number, number], b: [number, number, number]): number {
  const la = rgbToLab(a);
  const lb = rgbToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/**
 * Average colour inside a surface, sampled on a grid. `quad` is NORMALISED (0..1) so the same
 * surface can be measured on two images of different sizes — which is the point, since the model
 * may hand back a different resolution.
 */
export function meanColorInQuad(
  image: Raster,
  normalizedQuad: [Pt, Pt, Pt, Pt],
  samples = 64,
): [number, number, number] | null {
  const quad = normalizedQuad.map((p) => ({ x: p.x * image.width, y: p.y * image.height })) as [Pt, Pt, Pt, Pt];
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(image.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(image.height - 1, Math.ceil(Math.max(...ys)));
  if (x1 <= x0 || y1 <= y0) return null;

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const x = Math.round(x0 + ((x1 - x0) * (i + 0.5)) / samples);
      const y = Math.round(y0 + ((y1 - y0) * (j + 0.5)) / samples);
      if (!insideQuad({ x, y }, quad)) continue;
      const k = (y * image.width + x) * 4;
      r += image.data[k];
      g += image.data[k + 1];
      b += image.data[k + 2];
      n++;
    }
  }
  if (n === 0) return null;
  return [r / n, g / n, b / n];
}

export type FidelityVerdict = 'held' | 'shifted' | 'unmeasured';

export interface Fidelity {
  verdict: FidelityVerdict;
  deltaE: number | null;
}

/**
 * Compare the surface in our render against the surface in the model's. An unmeasurable pair is
 * `unmeasured`, never `held` — failing to check is not evidence that nothing moved.
 */
export function compareSurfaceFidelity(
  ours: Raster,
  theirs: Raster,
  normalizedQuad: [Pt, Pt, Pt, Pt],
): Fidelity {
  const a = meanColorInQuad(ours, normalizedQuad);
  const b = meanColorInQuad(theirs, normalizedQuad);
  if (!a || !b) return { verdict: 'unmeasured', deltaE: null };
  const d = deltaE(a, b);
  return { verdict: d > PHOTOREAL_DELTA_E_LIMIT ? 'shifted' : 'held', deltaE: Math.round(d * 10) / 10 };
}
