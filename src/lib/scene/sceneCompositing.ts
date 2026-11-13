import { dilateMask, hexToRgb, maskBox, maskForColour } from './sceneGeometry';

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    img.onload = () => { if (typeof src !== 'string') URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { if (typeof src !== 'string') URL.revokeObjectURL(url); reject(new Error('An image could not be loaded.')); };
    img.src = url;
  });
}

function pixels(img: HTMLImageElement): { data: Uint8ClampedArray; width: number; height: number } {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
}

export interface ObjectMask { canvas: HTMLCanvasElement; box: { x0: number; y0: number; x1: number; y1: number; coverage: number } | null }

export async function objectMask(passes: Array<{ image: HTMLImageElement; hex: string }>, grow = 0.02): Promise<ObjectMask> {
  const first = pixels(passes[0].image);
  const { width, height } = first;
  let union: Uint8Array = new Uint8Array(width * height);
  for (const p of passes) {
    const rgb = hexToRgb(p.hex);
    if (!rgb) continue;
    const px = p.image === passes[0].image ? first : pixels(p.image);
    if (px.width !== width || px.height !== height) continue;
    const m = maskForColour(px.data, rgb, 48);
    for (let i = 0; i < m.length; i++) if (m[i]) union[i] = 1;
  }
  const box = maskBox(union, width, height);
  union = dilateMask(union, width, height, Math.max(2, Math.round(Math.max(width, height) * grow)));
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < union.length; i++) {
    img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = union[i] ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, box };
}

export async function compositeMasked(base: HTMLImageElement, edited: HTMLImageElement, mask: HTMLCanvasElement, featherPx = 6): Promise<Blob> {
  const w = base.naturalWidth;
  const h = base.naturalHeight;
  const layer = document.createElement('canvas');
  layer.width = w; layer.height = h;
  const lctx = layer.getContext('2d')!;
  lctx.drawImage(edited, 0, 0, w, h);
  lctx.globalCompositeOperation = 'destination-in';
  lctx.filter = `blur(${featherPx}px)`;
  lctx.drawImage(mask, 0, 0, w, h);
  lctx.filter = 'none';

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d')!;
  octx.drawImage(base, 0, 0, w, h);
  octx.drawImage(layer, 0, 0);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('The edit could not be composed.'))), 'image/jpeg', 0.92));
}
