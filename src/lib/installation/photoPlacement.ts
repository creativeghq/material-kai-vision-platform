import type { Pt } from '@/lib/surfaceRenderer/homography';
import { projectFloorPoint, solvePhotoCamera, type PhotoCamera } from './photoCamera';

export function cameraOnProduct(
  footprint: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number,
  widthM: number,
  depthM: number,
  center: { x: number; z: number },
): PhotoCamera | null {
  if (footprint.length !== 4) return null;
  const quad = footprint.map((p) => ({ x: p.x * imageWidth, y: p.y * imageHeight })) as [Pt, Pt, Pt, Pt];
  let cam: PhotoCamera | null = null;
  let bestError = Infinity;
  for (const winding of [[0, 1, 2, 3], [0, 3, 2, 1]]) {
    for (let start = 0; start < 4; start++) {
      const order = winding.map((_, i) => quad[winding[(i + start) % 4]]) as [Pt, Pt, Pt, Pt];
      const tried = solvePhotoCamera(order, imageWidth, imageHeight, widthM, depthM);
      if (!tried) continue;
      const error = order.reduce((sum, q) => sum + Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
        const p = projectFloorPoint(tried, imageWidth, imageHeight, (sx * widthM) / 2, (sz * depthM) / 2);
        return Math.hypot(p.x - q.x, p.y - q.y);
      })), 0);
      if (error < bestError) {
        bestError = error;
        cam = tried;
      }
    }
  }
  if (!cam) return null;
  const corners: Array<[number, number]> = [[-widthM / 2, -depthM / 2], [widthM / 2, -depthM / 2], [widthM / 2, depthM / 2], [-widthM / 2, depthM / 2]];
  const world = quad.map((q) => corners.reduce((best, c) => {
    const p = projectFloorPoint(cam, imageWidth, imageHeight, c[0], c[1]);
    const b = projectFloorPoint(cam, imageWidth, imageHeight, best[0], best[1]);
    return Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(b.x - q.x, b.y - q.y) ? c : best;
  }, corners[0]));
  const rx = world[1][0] - world[0][0];
  const rz = world[1][1] - world[0][1];
  if (Math.hypot(rx, rz) < 1e-6) return null;
  const phi = Math.atan2(rz, rx);
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const [px, py, pz] = cam.position;
  const position: [number, number, number] = [px * cos + pz * sin + center.x, py, -px * sin + pz * cos + center.z];
  const h = [0, Math.sin(phi / 2), 0, Math.cos(phi / 2)];
  const [qx, qy, qz, qw] = cam.quaternion;
  const quaternion: [number, number, number, number] = [
    h[3] * qx + h[0] * qw + h[1] * qz - h[2] * qy,
    h[3] * qy - h[0] * qz + h[1] * qw + h[2] * qx,
    h[3] * qz + h[0] * qy - h[1] * qx + h[2] * qw,
    h[3] * qw - h[0] * qx - h[1] * qy - h[2] * qz,
  ];
  return { ...cam, position, quaternion };
}
