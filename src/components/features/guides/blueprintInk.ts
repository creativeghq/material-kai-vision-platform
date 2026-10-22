/** Turn a crop of a black-on-white manual drawing into solid white linework, thickened by `grow` pixels. */
export function blueprintInk(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number, grow = 1): HTMLCanvasElement {
  const out = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return out;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, w, h);
  } catch {
    return out;
  }
  const px = img.data;
  const ink = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < ink.length; i += 4, p++) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    ink[p] = lum < 170 ? 255 - lum : 0;
  }
  const grown = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = 0;
      for (let dy = -grow; dy <= grow; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -grow; dx <= grow; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = ink[yy * w + xx];
          if (v > best) best = v;
        }
      }
      grown[y * w + x] = best;
    }
  }
  for (let i = 0, p = 0; p < grown.length; i += 4, p++) {
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = grown[p] ? Math.min(255, 110 + grown[p] * 1.4) : 0;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
