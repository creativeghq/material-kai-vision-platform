/** Which tile, or which joint, sits at a point on the plane. Pure maths in centimetres. */
import { PATTERN_LABELS, type Pattern } from './patternVocabulary';

export interface TileFormatCm {
  /** The short side. */
  widthCm: number;
  /** The long side. */
  lengthCm: number;
}

/** A format as recorded, in either order, the way the lattice wants it: short side first. */
export function normalizeFormat(aCm: number, bCm: number): TileFormatCm {
  return { widthCm: Math.min(aCm, bCm), lengthCm: Math.max(aCm, bCm) };
}

export interface TileHit {
  grout: false;
  /** Lattice coordinates of the piece, for per-piece variation. */
  i: number;
  j: number;
  /** Position within the face, along its LENGTH and its WIDTH, in [0, 1). */
  u: number;
  v: number;
}

export type Lookup = { grout: true } | TileHit;

const GROUT: Lookup = { grout: true };

/** Herringbone and basket weave need the length to be a whole number of widths; say so when it is not. */
export function patternWarning(format: TileFormatCm, pattern: Pattern): string | null {
  if (!['herringbone', 'diagonal_herringbone', 'basket_weave'].includes(pattern)) return null;
  const ratio = format.lengthCm / format.widthCm;
  const k = Math.max(2, Math.round(ratio));
  if (Math.abs(ratio - k) <= 0.15) return null;
  return `${PATTERN_LABELS[pattern]} needs a length of ${k} × the width; this ${format.widthCm} × ${format.lengthCm} cm piece is drawn as ${format.widthCm} × ${k * format.widthCm}.`;
}

function rotate(x: number, y: number, deg: number): [number, number] {
  if (deg === 0) return [x, y];
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c + y * s, -x * s + y * c];
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Running bond with each row shifted by `frac` of a pitch. Length runs along x. */
function running(x: number, y: number, W: number, L: number, g: number, frac: number): Lookup {
  const px = L + g;
  const py = W + g;
  const row = floorDiv(y, py);
  const ly = y - row * py;
  if (ly >= W) return GROUT;
  const shifted = x - row * frac * px;
  const col = floorDiv(shifted, px);
  const lx = shifted - col * px;
  if (lx >= L) return GROUT;
  return { grout: false, i: col, j: row, u: lx / L, v: ly / W };
}

/**
 * Herringbone on a lattice of width-cells: a piece spans k cells (k = length ÷ width). A cell
 * (cx, cy) belongs to a horizontal piece when (cx − cy) mod 2k < k, else to a vertical one.
 */
function herringbone(x: number, y: number, W: number, L: number, g: number): Lookup {
  const a = W + g;
  const k = Math.max(2, Math.round((L + g) / a));
  const faceL = k * a - g;
  const cx = floorDiv(x, a);
  const cy = floorDiv(y, a);
  const d = mod(cx - cy, 2 * k);
  if (d < k) {
    const ox = (cx - d) * a;
    const oy = cy * a;
    const lx = x - ox;
    const ly = y - oy;
    if (lx >= faceL || ly >= W) return GROUT;
    return { grout: false, i: cx - d, j: cy, u: lx / faceL, v: ly / W };
  }
  const ox = cx * a;
  const oy = (cy - (d - k)) * a;
  const lx = x - ox;
  const ly = y - oy;
  if (lx >= W || ly >= faceL) return GROUT;
  return { grout: false, i: cx, j: cy - (d - k), u: ly / faceL, v: lx / W };
}

/** Blocks of k pieces, alternating direction like a woven basket. */
function basketWeave(x: number, y: number, W: number, L: number, g: number): Lookup {
  const a = W + g;
  const k = Math.max(2, Math.round((L + g) / a));
  const faceL = k * a - g;
  const B = k * a;
  const bx = floorDiv(x, B);
  const by = floorDiv(y, B);
  const lx = x - bx * B;
  const ly = y - by * B;
  if (mod(bx + by, 2) === 0) {
    const row = floorDiv(ly, a);
    const ry = ly - row * a;
    if (lx >= faceL || ry >= W) return GROUT;
    return { grout: false, i: bx * k, j: by * k + row, u: lx / faceL, v: ry / W };
  }
  const col = floorDiv(lx, a);
  const rx = lx - col * a;
  if (rx >= W || ly >= faceL) return GROUT;
  return { grout: false, i: bx * k + col, j: by * k, u: ly / faceL, v: rx / W };
}

/**
 * The piece or joint at world point (x, y) cm. `rotationDeg` turns the whole layout; the
 * grout is the joint width in cm and lives at the far edge of every pitch.
 */
export function lookupAt(
  x: number,
  y: number,
  format: TileFormatCm,
  pattern: Pattern,
  groutCm: number,
  rotationDeg = 0,
): Lookup {
  const W = format.widthCm;
  const L = format.lengthCm;
  const g = Math.max(0, groutCm);
  let [rx, ry] = rotate(x, y, rotationDeg);
  switch (pattern) {
    case 'stack': return running(rx, ry, W, L, g, 0);
    case 'offset_1_2': return running(rx, ry, W, L, g, 0.5);
    case 'offset_1_3': return running(rx, ry, W, L, g, 1 / 3);
    case 'diagonal': [rx, ry] = rotate(rx, ry, 45); return running(rx, ry, W, L, g, 0);
    case 'herringbone': return herringbone(rx, ry, W, L, g);
    case 'diagonal_herringbone': [rx, ry] = rotate(rx, ry, 45); return herringbone(rx, ry, W, L, g);
    case 'basket_weave': return basketWeave(rx, ry, W, L, g);
  }
}

/** How many pieces a rectangle takes, counting every piece it touches — the ordering number. */
export function piecesToCover(widthCm: number, depthCm: number, format: TileFormatCm, groutCm: number): number {
  const across = Math.ceil(widthCm / (format.lengthCm + groutCm));
  const down = Math.ceil(depthCm / (format.widthCm + groutCm));
  return across * down;
}
