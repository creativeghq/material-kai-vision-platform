import type { Pt } from '@/lib/surfaceRenderer/homography';
import { projectFloorPoint, solvePhotoCamera, type PhotoCamera } from './photoCamera';

type V3 = [number, number, number];
type M3 = [V3, V3, V3];

const mul = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const matMul = (a: M3, b: M3): M3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j])) as M3;
const transpose = (m: M3): M3 => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
const columns = (a: V3, b: V3, c: V3): M3 => [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]];

function fromQuat([x, y, z, w]: [number, number, number, number]): M3 {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function toQuat(m: M3): [number, number, number, number] {
  const t = m[0][0] + m[1][1] + m[2][2];
  if (t > 0) {
    const s = 0.5 / Math.sqrt(t + 1);
    return [(m[2][1] - m[1][2]) * s, (m[0][2] - m[2][0]) * s, (m[1][0] - m[0][1]) * s, 0.25 / s];
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
    return [0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
  }
  if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
    return [(m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
  }
  const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
  return [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s, (m[1][0] - m[0][1]) / s];
}

function solveRectangle(points: Array<{ x: number; y: number }>, imageWidth: number, imageHeight: number, sideA: number, sideB: number) {
  if (points.length !== 4) return null;
  const quad = points.map((p) => ({ x: p.x * imageWidth, y: p.y * imageHeight })) as [Pt, Pt, Pt, Pt];
  let cam: PhotoCamera | null = null;
  let bestError = Infinity;
  for (const winding of [[0, 1, 2, 3], [0, 3, 2, 1]]) {
    for (let start = 0; start < 4; start++) {
      const order = winding.map((_, i) => quad[winding[(i + start) % 4]]) as [Pt, Pt, Pt, Pt];
      const tried = solvePhotoCamera(order, imageWidth, imageHeight, sideA, sideB);
      if (!tried) continue;
      const error = order.reduce((sum, q) => sum + Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
        const p = projectFloorPoint(tried, imageWidth, imageHeight, (sx * sideA) / 2, (sz * sideB) / 2);
        return Math.hypot(p.x - q.x, p.y - q.y);
      })), 0);
      if (error < bestError) {
        bestError = error;
        cam = tried;
      }
    }
  }
  const solved = cam;
  if (!solved) return null;
  const corners: Array<[number, number]> = [[-sideA / 2, -sideB / 2], [sideA / 2, -sideB / 2], [sideA / 2, sideB / 2], [-sideA / 2, sideB / 2]];
  const world = quad.map((q) => corners.reduce((best, c) => {
    const p = projectFloorPoint(solved, imageWidth, imageHeight, c[0], c[1]);
    const b = projectFloorPoint(solved, imageWidth, imageHeight, best[0], best[1]);
    return Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(b.x - q.x, b.y - q.y) ? c : best;
  }, corners[0]));
  const dir = (a: [number, number], b: [number, number]): V3 => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, 0, dz / l];
  };
  return { cam: solved, first: dir(world[0], world[1]), second: dir(world[0], world[3]) };
}

function placed(cam: PhotoCamera, first: V3, second: V3, toFirst: V3, toSecond: V3, toNormal: V3, origin: V3): PhotoCamera {
  const m = matMul(columns(toFirst, toSecond, toNormal), transpose(columns(first, second, [0, 1, 0])));
  const p = mul(m, cam.position);
  return {
    ...cam,
    position: [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]],
    quaternion: toQuat(matMul(m, fromQuat(cam.quaternion))),
  };
}

export function cameraOnProduct(
  footprint: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number,
  widthM: number,
  depthM: number,
  center: { x: number; z: number },
): PhotoCamera | null {
  const s = solveRectangle(footprint, imageWidth, imageHeight, widthM, depthM);
  if (!s) return null;
  return placed(s.cam, s.first, s.second, [1, 0, 0], [0, 0, -1], [0, 1, 0], [center.x, 0, center.z]);
}

export function cameraOnFrontFace(
  front: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number,
  widthM: number,
  heightM: number,
  frontCenter: { x: number; y: number; z: number },
): PhotoCamera | null {
  const s = solveRectangle(front, imageWidth, imageHeight, widthM, heightM);
  if (!s) return null;
  return placed(s.cam, s.first, s.second, [1, 0, 0], [0, 1, 0], [0, 0, 1], [frontCenter.x, frontCenter.y, frontCenter.z]);
}
