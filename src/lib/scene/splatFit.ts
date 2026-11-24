export interface Extent { x: number; y: number; z: number }

const MAX_STRETCH = 1.8;

export const MODEL_FRONT_TURN_DEG = -90;

export function fitModel(e: Extent, w: number, d: number, h: number): [number, number, number] {
  const sx = Math.max(e.z, 1e-6);
  const sz = Math.max(e.x, 1e-6);
  const sy = Math.max(e.y, 1e-6);
  const raw = [w / sx, h / sy, d / sz];
  const g = Math.cbrt(raw[0] * raw[1] * raw[2]);
  const k = raw.map((v) => Math.min(g * MAX_STRETCH, Math.max(g / MAX_STRETCH, v)));
  const u = Math.min(w / (sx * k[0]), h / (sy * k[1]), d / (sz * k[2]));
  return [k[0] * u, k[1] * u, k[2] * u];
}
