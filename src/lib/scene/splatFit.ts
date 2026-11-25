export interface Extent { x: number; y: number; z: number }

const MAX_STRETCH = 1.8;

export const MODEL_FRONT_TURN_DEG = -90;

export const isMeshModel = (url: string): boolean => /\.glb(?:[?#]|$)/i.test(url);

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

const CROWD_CELLS = 48;
const CROWD_MIN = 14;

export function crowded(xyz: Float32Array, opacity: ArrayLike<number>): Uint8Array {
  const n = opacity.length;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) if (opacity[i] >= MIN_OPACITY) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], xyz[i * 3 + a]); hi[a] = Math.max(hi[a], xyz[i * 3 + a]); }
  const cell = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-6) / CROWD_CELLS;
  const S = CROWD_CELLS + 3;
  const grid = new Uint32Array(S * S * S);
  const at = (i: number, a: number) => 1 + Math.floor((xyz[i * 3 + a] - lo[a]) / cell);
  const key = (x: number, y: number, z: number) => (x * S + y) * S + z;
  for (let i = 0; i < n; i++) if (opacity[i] >= MIN_OPACITY) grid[key(at(i, 0), at(i, 1), at(i, 2))]++;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (opacity[i] < MIN_OPACITY) continue;
    const x = at(i, 0); const y = at(i, 1); const z = at(i, 2);
    const near = grid[key(x, y, z)] + grid[key(x - 1, y, z)] + grid[key(x + 1, y, z)] + grid[key(x, y - 1, z)] + grid[key(x, y + 1, z)] + grid[key(x, y, z - 1)] + grid[key(x, y, z + 1)];
    out[i] = near >= CROWD_MIN ? 1 : 0;
  }
  return out;
}

export function thinSplats(opacity: ArrayLike<number>, max = MAX_MODEL_SPLATS, allowed?: Uint8Array): { keep: Uint32Array; grow: number } {
  const solid: number[] = [];
  for (let i = 0; i < opacity.length; i++) if (opacity[i] >= MIN_OPACITY && (!allowed || allowed[i])) solid.push(i);
  if (solid.length <= max) return { keep: Uint32Array.from(solid), grow: 1 };
  const step = solid.length / max;
  const keep = Uint32Array.from({ length: max }, (_, i) => solid[Math.floor(i * step)]);
  return { keep, grow: Math.sqrt(step) };
}
