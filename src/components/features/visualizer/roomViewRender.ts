/** Several surfaces of one scene, each in its own product, drawn in one pass. Browser only. */
import {
  renderSurface, normalizeFormat, hexToRgb, pinPointForSurface,
  type Pattern, type Pt, type Raster, type RoomViewPin,
} from '@/lib/surfaceRenderer';
import type { VisualizerSurface, SurfaceProduct } from '@/services/visualizerService';
import { loadRaster, loadMaskFor } from './raster';

export interface LayerSpec {
  surface: VisualizerSurface;
  product: SurfaceProduct;
  pattern: Pattern;
  groutWidthMm: number;
  groutColorHex: string;
  rotationDeg: number;
}

/** Pixels a room view needs, loaded once and reused while the operator changes the spec. */
export class RoomViewAssets {
  private faces = new Map<string, Promise<Raster>>();
  private masks = new Map<string, Promise<Raster | null>>();

  constructor(readonly base: Raster) {}

  static async load(sceneImageUrl: string, maxSide = 1400): Promise<RoomViewAssets> {
    return new RoomViewAssets(await loadRaster(sceneImageUrl, maxSide));
  }

  face(url: string): Promise<Raster> {
    let p = this.faces.get(url);
    if (!p) { p = loadRaster(url, 512); this.faces.set(url, p); }
    return p;
  }

  /** A surface with no mask paints its whole quad. A mask that fails to load does the same, and says so. */
  mask(surface: VisualizerSurface): Promise<Raster | null> {
    if (!surface.maskUrl) return Promise.resolve(null);
    let p = this.masks.get(surface.maskUrl);
    if (!p) {
      p = loadMaskFor(surface.maskUrl, this.base.width, this.base.height).catch(() => null);
      this.masks.set(surface.maskUrl, p);
    }
    return p;
  }
}

const toPixels = (quad: Pt[], r: Raster) => quad.map((p) => ({ x: p.x * r.width, y: p.y * r.height })) as [Pt, Pt, Pt, Pt];

function painted(mask: Raster | null): (p: Pt) => boolean {
  if (!mask) return () => true;
  return (p) => {
    const x = Math.min(mask.width - 1, Math.max(0, Math.floor(p.x * mask.width)));
    const y = Math.min(mask.height - 1, Math.max(0, Math.floor(p.y * mask.height)));
    const k = (y * mask.width + x) * 4;
    const a = mask.data[k + 3];
    if (a < 255) return a > 127;
    return 0.2126 * mask.data[k] + 0.7152 * mask.data[k + 1] + 0.0722 * mask.data[k + 2] > 127;
  };
}

/** The composed picture plus one pin per finished surface. Layers are drawn in the order given. */
export async function renderRoomView(
  assets: RoomViewAssets,
  layers: LayerSpec[],
  opts: { supersample?: 1 | 2 } = {},
): Promise<{ raster: Raster; pins: RoomViewPin[] }> {
  let out = assets.base;
  const pins: RoomViewPin[] = [];
  for (const layer of layers) {
    if (!layer.product.texture.url) continue;
    const [face, mask] = await Promise.all([assets.face(layer.product.texture.url), assets.mask(layer.surface)]);
    const format = normalizeFormat(layer.product.texture.tileWidthM * 100, layer.product.texture.tileLengthM * 100);
    out = renderSurface(
      out,
      { quad: toPixels(layer.surface.quad, out), widthCm: layer.surface.width_cm, depthCm: layer.surface.depth_cm, mask },
      {
        face, format, pattern: layer.pattern, groutWidthMm: layer.groutWidthMm,
        groutColor: hexToRgb(layer.groutColorHex), rotationDeg: layer.rotationDeg,
      },
      { supersample: opts.supersample ?? 2 },
    );
    const at = pinPointForSurface(layer.surface.quad, painted(mask));
    pins.push({ surface_key: layer.surface.key, product_id: layer.product.id, x: round4(at.x), y: round4(at.y) });
  }
  return { raster: out, pins };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
