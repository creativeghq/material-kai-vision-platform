/** Pixel size read from an image's own header bytes (PNG, JPEG, WebP, GIF) — never from the page's markup. */

export interface ImageSize { width: number; height: number }

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return sized(be32(b, 16), be32(b, 20));
}

function jpeg(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    const len = be16(b, i + 2);
    if (len < 2) return null;
    // SOF0–SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range and do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return null;
      return sized(be16(b, i + 7), be16(b, i + 5));
    }
    i += 2 + len;
  }
  return null;
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X') return sized(le24(b, 24) + 1, le24(b, 27) + 1);
  return null;
}

/** Null when the bytes are not a format this reads or the header is cut short — unknown, never a guess. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return png(b);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF') return webp(b);
  if (b.length >= 10 && ascii(b, 0, 4) === 'GIF8') return sized(le16(b, 6), le16(b, 8));
  return null;
}
