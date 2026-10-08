/** Reads a PNG's size and whether it can hold transparency, from the header alone. */
export interface PngInfo {
  width: number;
  height: number;
  hasAlpha: boolean;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function pngInfo(bytes: Uint8Array): PngInfo | null {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const u32 = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const type = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (type(12) !== 'IHDR') return null;
  const width = u32(16);
  const height = u32(20);
  const colorType = bytes[25];
  let hasAlpha = colorType === 4 || colorType === 6;
  for (let o = 8; !hasAlpha && o + 8 <= bytes.length;) {
    const len = u32(o);
    const t = type(o + 4);
    if (t === 'tRNS') hasAlpha = true;
    if (t === 'IDAT' || t === 'IEND') break;
    o += 12 + len;
  }
  return width > 0 && height > 0 ? { width, height, hasAlpha } : null;
}
