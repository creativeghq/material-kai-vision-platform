import type { Pattern } from '@/lib/surfaceRenderer/patternVocabulary';

export interface LatticePiece {
  cx: number;
  cy: number;
  length: number;
  width: number;
  vertical: boolean;
  j: number;
}

export interface PlacedPiece {
  cx: number;
  cz: number;
  length: number;
  width: number;
  angle: number;
  j: number;
  corners: Array<[number, number]>;
}

const rot = (x: number, y: number, deg: number): [number, number] => {
  if (deg === 0) return [x, y];
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c + y * s, -x * s + y * c];
};

export const herringboneK = (W: number, L: number, g: number) => Math.max(2, Math.round((L + g) / (W + g)));

function latticePieces(pattern: Pattern, W: number, L: number, g: number, lo: [number, number], hi: [number, number]): LatticePiece[] {
  const out: LatticePiece[] = [];
  const running = (frac: number) => {
    const px = L + g;
    const py = W + g;
    for (let row = Math.floor(lo[1] / py) - 1; row * py <= hi[1]; row++) {
      const shift = row * frac * px;
      for (let col = Math.floor((lo[0] - shift) / px) - 1; col * px + shift <= hi[0]; col++) {
        out.push({ cx: col * px + shift + L / 2, cy: row * py + W / 2, length: L, width: W, vertical: false, j: row });
      }
    }
  };
  const a = W + g;
  const k = herringboneK(W, L, g);
  const faceL = k * a - g;
  switch (pattern) {
    case 'stack':
    case 'diagonal':
      running(0);
      break;
    case 'offset_1_2':
      running(0.5);
      break;
    case 'offset_1_3':
      running(1 / 3);
      break;
    case 'herringbone':
    case 'diagonal_herringbone':
      for (let cy = Math.floor(lo[1] / a) - k - 1; cy * a <= hi[1] + a; cy++) {
        for (let cx = Math.floor(lo[0] / a) - k - 1; cx * a <= hi[0] + a; cx++) {
          const d = (((cx - cy) % (2 * k)) + 2 * k) % (2 * k);
          if (d === 0) out.push({ cx: cx * a + faceL / 2, cy: cy * a + W / 2, length: faceL, width: W, vertical: false, j: cy });
          else if (d === 2 * k - 1) out.push({ cx: cx * a + W / 2, cy: cy * a + faceL / 2, length: faceL, width: W, vertical: true, j: cy });
        }
      }
      break;
    case 'basket_weave': {
      const B = k * a;
      for (let by = Math.floor(lo[1] / B) - 1; by * B <= hi[1]; by++) {
        for (let bx = Math.floor(lo[0] / B) - 1; bx * B <= hi[0]; bx++) {
          for (let n = 0; n < k; n++) {
            if ((((bx + by) % 2) + 2) % 2 === 0) out.push({ cx: bx * B + faceL / 2, cy: by * B + n * a + W / 2, length: faceL, width: W, vertical: false, j: by * k + n });
            else out.push({ cx: bx * B + n * a + W / 2, cy: by * B + faceL / 2, length: faceL, width: W, vertical: true, j: by * k });
          }
        }
      }
      break;
    }
  }
  return out;
}

export interface LayoutFrame {
  originX: number;
  originZ: number;
  rotationDeg: number;
}

export const totalTurn = (pattern: Pattern, rotationDeg: number) =>
  rotationDeg + (pattern === 'diagonal' || pattern === 'diagonal_herringbone' ? 45 : 0);

export function layPattern(
  pattern: Pattern,
  widthMm: number,
  lengthMm: number,
  jointMm: number,
  frame: LayoutFrame,
  area: { x0: number; z0: number; x1: number; z1: number },
): PlacedPiece[] {
  const W = Math.min(widthMm, lengthMm);
  const L = Math.max(widthMm, lengthMm);
  const turn = totalTurn(pattern, frame.rotationDeg);
  const toLattice = (x: number, z: number) => rot(x - frame.originX, z - frame.originZ, turn);
  const toRoom = (u: number, v: number): [number, number] => {
    const [x, z] = rot(u, v, -turn);
    return [x + frame.originX, z + frame.originZ];
  };
  const cornersL = [toLattice(area.x0, area.z0), toLattice(area.x1, area.z0), toLattice(area.x1, area.z1), toLattice(area.x0, area.z1)];
  const lo: [number, number] = [Math.min(...cornersL.map((c) => c[0])) - L, Math.min(...cornersL.map((c) => c[1])) - L];
  const hi: [number, number] = [Math.max(...cornersL.map((c) => c[0])) + L, Math.max(...cornersL.map((c) => c[1])) + L];

  const placed: PlacedPiece[] = [];
  for (const p of latticePieces(pattern, W, L, Math.max(0, jointMm), lo, hi)) {
    const hl = (p.vertical ? p.width : p.length) / 2;
    const hw = (p.vertical ? p.length : p.width) / 2;
    const corners = ([[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]] as const).map(([du, dv]) => toRoom(p.cx + du, p.cy + dv));
    if (!overlaps(corners, area)) continue;
    const [cx, cz] = toRoom(p.cx, p.cy);
    const angle = (-(turn + (p.vertical ? 90 : 0)) * Math.PI) / 180;
    placed.push({ cx, cz, length: p.length, width: p.width, angle, j: p.j, corners });
  }
  return placed;
}

function overlaps(corners: Array<[number, number]>, a: { x0: number; z0: number; x1: number; z1: number }): boolean {
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  if (Math.max(...xs) <= a.x0 + 0.5 || Math.min(...xs) >= a.x1 - 0.5 || Math.max(...zs) <= a.z0 + 0.5 || Math.min(...zs) >= a.z1 - 0.5) return false;
  const rect: Array<[number, number]> = [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[(i + 1) % 4];
    const nx = z1 - z0;
    const nz = -(x1 - x0);
    const proj = (pts: Array<[number, number]>) => pts.map(([x, z]) => x * nx + z * nz);
    const pa = proj(corners);
    const pb = proj(rect);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
  }
  return true;
}

export function clipSegment(
  p0: [number, number],
  p1: [number, number],
  a: { x0: number; z0: number; x1: number; z1: number },
): [[number, number], [number, number]] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = p1[0] - p0[0];
  const dz = p1[1] - p0[1];
  const checks: Array<[number, number]> = [[-dx, p0[0] - a.x0], [dx, a.x1 - p0[0]], [-dz, p0[1] - a.z0], [dz, a.z1 - p0[1]]];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  if (t1 - t0 < 1e-9) return null;
  return [[p0[0] + t0 * dx, p0[1] + t0 * dz], [p0[0] + t1 * dx, p0[1] + t1 * dz]];
}
