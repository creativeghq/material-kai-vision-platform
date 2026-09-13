/** Browser side of the renderer: images in, canvases out. The maths lives in src/lib/surfaceRenderer. */
import { raster, type Raster } from '@/lib/surfaceRenderer';

/**
 * Decode an image URL into pixels, downscaled so the longer side is at most `maxSide`. Cross-origin
 * images need CORS headers; a photo the browser cannot read rejects, and the caller says so.
 */
export function loadRaster(url: string, maxSide = 1400): Promise<Raster> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No 2D canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, w, h);
        resolve(raster(w, h, data.data));
      } catch {
        reject(new Error('The browser is not allowed to read this image (no CORS header on its host)'));
      }
    };
    img.onerror = () => reject(new Error('The image could not be loaded'));
    img.src = url;
  });
}

/** A mask decoded at the size of the photo it belongs to. */
export async function loadMaskFor(url: string, width: number, height: number): Promise<Raster> {
  const m = await loadRaster(url, Math.max(width, height));
  if (m.width === width && m.height === height) return m;
  const src = document.createElement('canvas');
  src.width = m.width;
  src.height = m.height;
  src.getContext('2d')!.putImageData(new ImageData(m.data, m.width, m.height), 0, 0);
  const dst = document.createElement('canvas');
  dst.width = width;
  dst.height = height;
  const ctx = dst.getContext('2d')!;
  ctx.drawImage(src, 0, 0, width, height);
  return raster(width, height, ctx.getImageData(0, 0, width, height).data);
}

export function drawRaster(canvas: HTMLCanvasElement, r: Raster): void {
  canvas.width = r.width;
  canvas.height = r.height;
  canvas.getContext('2d')?.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
}

export function rasterToBlob(r: Raster): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawRaster(canvas, r);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the render'))), 'image/png');
  });
}
