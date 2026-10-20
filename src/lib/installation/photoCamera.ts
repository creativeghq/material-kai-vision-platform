import { computeHomography, type Pt } from '@/lib/surfaceRenderer/homography';

export interface PhotoCamera {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fovDeg: number;
  aspect: number;
  focalPx: number;
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => scale(a, 1 / (norm(a) || 1));

function quaternionFromBasis(x: V3, y: V3, z: V3): [number, number, number, number] {
  const m00 = x[0]; const m01 = y[0]; const m02 = z[0];
  const m10 = x[1]; const m11 = y[1]; const m12 = z[1];
  const m20 = x[2]; const m21 = y[2]; const m22 = z[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

export function solvePhotoCamera(
  quadPx: [Pt, Pt, Pt, Pt],
  imageWidth: number,
  imageHeight: number,
  widthM: number,
  depthM: number,
): PhotoCamera | null {
  if (!(imageWidth > 0 && imageHeight > 0 && widthM > 0 && depthM > 0)) return null;
  let H;
  try {
    H = computeHomography([{ x: 0, y: 0 }, { x: widthM, y: 0 }, { x: widthM, y: depthM }, { x: 0, y: depthM }], quadPx);
  } catch {
    return null;
  }
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const col = (k: number): V3 => [H[k], H[3 + k], H[6 + k]];
  const g = (h: V3): V3 => [h[0] - cx * h[2], h[1] - cy * h[2], h[2]];
  const g1 = g(col(0));
  const g2 = g(col(1));
  const g3 = g(col(2));

  const longest = Math.max(imageWidth, imageHeight);
  const candidates: number[] = [];
  const denOrth = g1[2] * g2[2];
  if (Math.abs(denOrth) > 1e-12) candidates.push(-(g1[0] * g2[0] + g1[1] * g2[1]) / denOrth);
  const denNorm = g1[2] * g1[2] - g2[2] * g2[2];
  if (Math.abs(denNorm) > 1e-12) candidates.push((g2[0] * g2[0] + g2[1] * g2[1] - g1[0] * g1[0] - g1[1] * g1[1]) / denNorm);
  const plausible = candidates.filter((f2) => f2 > 0).map(Math.sqrt).filter((f) => f > 0.3 * longest && f < 5 * longest);
  const f = plausible.length ? plausible[0] : 1.1 * longest;

  const kinv = (v: V3): V3 => [v[0] / f, v[1] / f, v[2]];
  let r1 = kinv(g1);
  let r2 = kinv(g2);
  let t = kinv(g3);
  let lambda = 2 / (norm(r1) + norm(r2));
  if (t[2] * lambda < 0) lambda = -lambda;
  r1 = scale(r1, lambda);
  r2 = scale(r2, lambda);
  t = scale(t, lambda);
  r1 = unit(r1);
  r2 = unit(add(r2, scale(r1, -dot(r1, r2))));
  const up = scale(cross(r1, r2), -1);

  const tw = add(t, add(scale(r1, widthM / 2), scale(r2, depthM / 2)));
  const conv = (v: V3): V3 => [v[0], -v[1], -v[2]];
  const Rx = conv([r1[0], r1[1], r1[2]]);
  const Ry = conv([up[0], up[1], up[2]]);
  const Rz = conv([r2[0], r2[1], r2[2]]);
  const T = conv(tw);
  const camX: V3 = [Rx[0], Ry[0], Rz[0]];
  const camY: V3 = [Rx[1], Ry[1], Rz[1]];
  const camZ: V3 = [Rx[2], Ry[2], Rz[2]];
  const position: V3 = scale([dot(Rx, T), dot(Ry, T), dot(Rz, T)], -1);
  if (!position.every(Number.isFinite) || position[1] <= 0) return null;

  return {
    position,
    quaternion: quaternionFromBasis(camX, camY, camZ),
    fovDeg: (2 * Math.atan(imageHeight / 2 / f) * 180) / Math.PI,
    aspect: imageWidth / imageHeight,
    focalPx: f,
  };
}

export function projectFloorPoint(cam: PhotoCamera, imageWidth: number, imageHeight: number, x: number, z: number): Pt {
  const [qx, qy, qz, qw] = cam.quaternion;
  const c0: V3 = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw)];
  const c1: V3 = [2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)];
  const c2: V3 = [2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy)];
  const d: V3 = [x - cam.position[0], -cam.position[1], z - cam.position[2]];
  const depth = -dot(c2, d);
  return {
    x: imageWidth / 2 + (cam.focalPx * dot(c0, d)) / depth,
    y: imageHeight / 2 - (cam.focalPx * dot(c1, d)) / depth,
  };
}

