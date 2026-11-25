export type Vec3 = [number, number, number];
export interface Cut { x: number; z: number; w: number; d: number }

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slabAround(pos: Vec3, size: Vec3, cut: Cut | null): Array<{ pos: Vec3; size: Vec3 }> {
  if (!cut) return [{ pos, size }];
  const [px, py, pz] = pos;
  const [w, t, d] = size;
  const l = px - w / 2;
  const r = px + w / 2;
  const b = pz - d / 2;
  const f = pz + d / 2;
  const cl = cut.x - cut.w / 2;
  const cr = cut.x + cut.w / 2;
  const cb = cut.z - cut.d / 2;
  const cf = cut.z + cut.d / 2;
  if (cl <= l || cr >= r || cb <= b || cf >= f) return [{ pos, size }];
  const piece = (x0: number, x1: number, z0: number, z1: number) => ({ pos: [(x0 + x1) / 2, py, (z0 + z1) / 2] as Vec3, size: [x1 - x0, t, z1 - z0] as Vec3 });
  return [piece(l, cl, b, f), piece(cr, r, b, f), piece(cl, cr, b, cb), piece(cl, cr, cf, f)];
}

export const bowlFor = (moduleW: number, runD: number) => ({ w: Math.min(0.72, moduleW - 0.14), d: Math.min(0.42, runD - 0.2) });
