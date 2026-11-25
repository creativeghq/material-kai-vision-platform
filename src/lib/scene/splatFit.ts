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

export const MAX_MODEL_SPLATS = 100_000;
const MIN_OPACITY = 0.1;

export function thinSplats(opacity: ArrayLike<number>, max = MAX_MODEL_SPLATS): { keep: Uint32Array; grow: number } {
  const solid: number[] = [];
  for (let i = 0; i < opacity.length; i++) if (opacity[i] >= MIN_OPACITY) solid.push(i);
  if (solid.length <= max) return { keep: Uint32Array.from(solid), grow: 1 };
  const step = solid.length / max;
  const keep = Uint32Array.from({ length: max }, (_, i) => solid[Math.floor(i * step)]);
  return { keep, grow: Math.sqrt(step) };
}
