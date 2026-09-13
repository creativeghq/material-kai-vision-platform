/**
 * Draw a tiled material onto one surface of a photo. Deterministic: the same inputs give the
 * same pixels, nothing is generated and nothing leaves the browser.
 */
import { computeHomography, invertHomography, applyHomography, insideQuad, type Pt } from './homography';
import { lookupAt, type TileFormatCm } from './patterns';
import type { Pattern } from './patternVocabulary';

/** RGBA pixels, the shape of an ImageData without needing a browser to make one. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export function raster(width: number, height: number, data?: Uint8ClampedArray<ArrayBuffer>): Raster {
  return { width, height, data: data ?? new Uint8ClampedArray(width * height * 4) };
}

/** A flat rectangle of the room as it appears in the photo. Corners in pixels: far-left, far-right, near-right, near-left. */
export interface SurfaceSpec {
  quad: [Pt, Pt, Pt, Pt];
  /** Real size of that rectangle, in centimetres: along the far edge, and from far to near. */
  widthCm: number;
  depthCm: number;
  /** Same size as the photo; a pixel is painted where the mask is light. Null = the whole quad. */
  mask?: Raster | null;
}

export interface MaterialSpec {
  /** The face of one piece. Its longer side is taken as the piece's length. */
  face: Raster;
  format: TileFormatCm;
  pattern: Pattern;
  groutWidthMm: number;
  groutColor: [number, number, number];
  rotationDeg: number;
}

export interface RenderOptions {
  /** 2 averages four sub-samples per pixel; joints stop shimmering, at four times the work. */
  supersample?: 1 | 2;
  /** Multiply by the photo's own shading so shadows and sunlight survive the new surface. */
  keepLighting?: boolean;
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** The rectangle the surface's quad stands for, in world centimetres, same corner order. */
export function worldRect(widthCm: number, depthCm: number): [Pt, Pt, Pt, Pt] {
  return [{ x: 0, y: 0 }, { x: widthCm, y: 0 }, { x: widthCm, y: depthCm }, { x: 0, y: depthCm }];
}

function maskAllows(mask: Raster | null | undefined, x: number, y: number): boolean {
  if (!mask) return true;
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
  const k = (y * mask.width + x) * 4;
  // Alpha where the mask has one, else luminance: white = paint, black = keep.
  const a = mask.data[k + 3];
  if (a < 255) return a > 127;
  return lum(mask.data[k], mask.data[k + 1], mask.data[k + 2]) > 127;
}

/** Face pixel at (u along length, v along width), with the longer image side as the length. */
function sampleFace(face: Raster, u: number, v: number, landscape: boolean): [number, number, number] {
  const fx = landscape ? u : v;
  const fy = landscape ? v : u;
  const x = Math.min(face.width - 1, Math.max(0, Math.floor(fx * face.width)));
  const y = Math.min(face.height - 1, Math.max(0, Math.floor(fy * face.height)));
  const k = (y * face.width + x) * 4;
  return [face.data[k], face.data[k + 1], face.data[k + 2]];
}

/**
 * Returns a copy of `base` with the surface re-tiled. Pixels outside the quad (and outside the
 * mask) are untouched; inside, each pixel is mapped back to the plane, looked up in the pattern
 * lattice, coloured from the face or the grout, and shaded by the photo's own light.
 */
export function renderSurface(
  base: Raster,
  surface: SurfaceSpec,
  material: MaterialSpec,
  opts: RenderOptions = {},
): Raster {
  const ss = opts.supersample ?? 1;
  const keepLighting = opts.keepLighting ?? true;
  const out = raster(base.width, base.height, new Uint8ClampedArray(base.data));
  const H = computeHomography(worldRect(surface.widthCm, surface.depthCm), surface.quad);
  const Hinv = invertHomography(H);
  const landscape = material.face.width >= material.face.height;
  const groutCm = material.groutWidthMm / 10;

  const xs = surface.quad.map((p) => p.x);
  const ys = surface.quad.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(base.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(base.height - 1, Math.ceil(Math.max(...ys)));

  // The photo's average brightness inside the surface: shading is relative to it, so the new
  // material reads at its own tone and only the photo's light and shadow are carried over.
  let sum = 0;
  let n = 0;
  for (let y = y0; y <= y1; y += 3) {
    for (let x = x0; x <= x1; x += 3) {
      if (!insideQuad({ x: x + 0.5, y: y + 0.5 }, surface.quad) || !maskAllows(surface.mask, x, y)) continue;
      const k = (y * base.width + x) * 4;
      sum += lum(base.data[k], base.data[k + 1], base.data[k + 2]);
      n++;
    }
  }
  const meanLum = n > 0 ? sum / n : 128;

  const steps = ss === 2 ? [0.25, 0.75] : [0.5];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!maskAllows(surface.mask, x, y)) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (const dy of steps) {
        for (const dx of steps) {
          const p = { x: x + dx, y: y + dy };
          if (!insideQuad(p, surface.quad)) continue;
          const w = applyHomography(Hinv, p);
          const hit = lookupAt(w.x, w.y, material.format, material.pattern, groutCm, material.rotationDeg);
          const c = hit.grout === true ? material.groutColor : sampleFace(material.face, hit.u, hit.v, landscape);
          r += c[0];
          g += c[1];
          b += c[2];
          hits++;
        }
      }
      if (hits === 0) continue;
      const k = (y * base.width + x) * 4;
      let shade = 1;
      if (keepLighting) {
        const l = lum(base.data[k], base.data[k + 1], base.data[k + 2]);
        shade = Math.min(1.8, Math.max(0.2, (l + 8) / (meanLum + 8)));
      }
      out.data[k] = Math.min(255, (r / hits) * shade);
      out.data[k + 1] = Math.min(255, (g / hits) * shade);
      out.data[k + 2] = Math.min(255, (b / hits) * shade);
      out.data[k + 3] = 255;
    }
  }
  return out;
}
