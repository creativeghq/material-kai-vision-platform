/** Intrinsic size of an image, read from its header bytes. */

export interface ImageSize {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, len: number) =>
  String.fromCharCode(...b.subarray(i, i + len));

/** PNG: 8-byte signature, then an IHDR chunk whose width/height are big-endian uint32. */
function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || ascii(b, 1, 3) !== 'PNG') return null;
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** GIF: 'GIF87a'/'GIF89a', then little-endian uint16 logical screen width/height. */
function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || ascii(b, 0, 4) !== 'GIF8') return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

/**
 * JPEG: walk the segment chain to a Start-Of-Frame marker, which carries the size.
 * Every SOF except the DHT/DAC/RST/SOS markers that share the 0xC0 block counts — a progressive
 * JPEG (SOF2) is as common as a baseline one, and reading only SOF0 misses it.
 */
function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; } // resync past padding
    const marker = b[i + 1];
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan — no SOF found
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    i += 2 + len;
  }
  return null;
}

/** WebP: RIFF container with three possible frame chunks, each storing the size differently. */
function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') {
    // Extended: canvas size is stored minus one, as 24-bit little-endian.
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  if (chunk === 'VP8 ') {
    // Lossy: 3-byte frame tag, 3-byte start code (0x9d 0x01 0x2a), then two 14-bit sizes.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // Lossless: 0x2f signature, then 14 bits width-1 and 14 bits height-1, packed LSB-first.
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** The intrinsic size of an image, or null when the format is not one we can read. */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  if (!bytes || bytes.length < 10) return null;
  const size = pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes) ?? gifSize(bytes);
  if (!size || !(size.width > 0) || !(size.height > 0)) return null;
  return size;
}

/**
 * The candidate closest to this image's shape, compared in log space so 3:2 and 2:3 are the same
 * distance from square. `candidates` is passed in rather than restated here: the supported set is
 * declared once, by the client that talks to the model (`IMAGE_ASPECT_RATIOS` in ai-client.ts).
 */
export function nearestAspectRatio<T extends string>(
  size: ImageSize,
  candidates: readonly T[],
): T | null {
  if (!size || !(size.width > 0) || !(size.height > 0) || candidates.length === 0) return null;
  const target = Math.log(size.width / size.height);
  let best: T | null = null;
  let bestDelta = Infinity;
  for (const c of candidates) {
    const [w, h] = c.split(':').map(Number);
    if (!(w > 0) || !(h > 0)) continue;
    const delta = Math.abs(Math.log(w / h) - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = c;
    }
  }
  return best;
}

/** Convenience: the aspect ratio of these bytes, or null when the size cannot be read. */
export function aspectRatioOfImage<T extends string>(
  bytes: Uint8Array,
  candidates: readonly T[],
): T | null {
  const size = readImageSize(bytes);
  return size ? nearestAspectRatio(size, candidates) : null;
}
