export type V3 = [number, number, number];
export interface Pose { position: V3; target: V3; fov: number }
export interface WalkRoom { centre: [number, number]; far: [number, number]; focus?: [number, number] | null; corners?: Array<[number, number]>; shot?: Pose | null }
export interface WalkFrame { pose: Pose; walls: number; objects: number; dip: number; render: number; room: number; shot: number }

const EYE = 1.6;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const span01 = (p: number, a: number, b: number) => ease((p - a) / (b - a));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixV = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mixPose = (a: Pose, b: Pose, t: number): Pose => ({ position: mixV(a.position, b.position, t), target: mixV(a.target, b.target, t), fov: mix(a.fov, b.fov, t) });

function cornerPoses(r: WalkRoom, corners: Array<[number, number]>): [Pose, Pose] {
  const [cx, cz] = r.centre;
  const [tx, tz] = r.focus ?? r.centre;
  const [kx, kz] = corners.reduce((best, c) => (Math.hypot(c[0] - tx, c[1] - tz) > Math.hypot(best[0] - tx, best[1] - tz) ? c : best), corners[0]);
  const inset = Math.min(0.45, Math.hypot(cx - kx, cz - kz) * 0.3) / Math.max(1e-6, Math.hypot(cx - kx, cz - kz));
  const sx = kx + (cx - kx) * inset;
  const sz = kz + (cz - kz) * inset;
  const target: V3 = [tx, 1.1, tz];
  return [
    { position: [sx, EYE, sz], target, fov: 64 },
    { position: [sx + (tx - sx) * 0.18, EYE, sz + (tz - sz) * 0.18], target, fov: 64 },
  ];
}

export function roomPoses(r: WalkRoom): [Pose, Pose] {
  if (r.shot) {
    const { position: [px, py, pz], target: [tx, , tz] } = r.shot;
    const len = Math.max(1e-6, Math.hypot(tx - px, tz - pz));
    return [{ position: [px - ((tx - px) / len) * 0.5, py, pz - ((tz - pz) / len) * 0.5], target: r.shot.target, fov: r.shot.fov + 6 }, r.shot];
  }
  if (r.corners && r.corners.length >= 3) return cornerPoses(r, r.corners);
  const [cx, cz] = r.centre;
  const reach = Math.hypot(r.far[0] - cx, r.far[1] - cz);
  if (r.focus && Math.hypot(r.focus[0] - cx, r.focus[1] - cz) > 0.15) {
    const [fx, fz] = r.focus;
    const len = Math.hypot(cx - fx, cz - fz);
    const ux = (cx - fx) / len;
    const uz = (cz - fz) / len;
    const target: V3 = [fx, 1.0, fz];
    return [
      { position: [cx + ux * reach * 0.55, EYE, cz + uz * reach * 0.55], target, fov: 62 },
      { position: [cx + ux * reach * 0.2, EYE, cz + uz * reach * 0.2], target, fov: 62 },
    ];
  }
  const sx = cx + (r.far[0] - cx) * 0.6;
  const sz = cz + (r.far[1] - cz) * 0.6;
  const ex = cx + (cx - sx) * 0.25;
  const ez = cz + (cz - sz) * 0.25;
  const look = (x: number, z: number): V3 => [x + (cx - sx) * 2, EYE - 0.15, z + (cz - sz) * 2];
  return [
    { position: [sx, EYE, sz], target: look(sx, sz), fov: 62 },
    { position: [ex, EYE, ez], target: look(ex, ez), fov: 62 },
  ];
}

export function fitFov(fov: number, aspect: number, designAspect = 1.5): number {
  if (aspect >= designAspect) return fov;
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * designAspect / Math.max(0.2, aspect));
  return Math.min(110, (half * 360) / Math.PI);
}

export function walkthroughFrame(p: number, span: number, rooms: WalkRoom[], finalPose: Pose | null): WalkFrame {
  const top: Pose = { position: [0, span * 1.7, 0.001], target: [0, 0, 0], fov: 42 };
  const three: Pose = { position: [span * 0.85, span * 0.95, span * 0.95], target: [0, 0.3, 0], fov: 45 };
  const end = finalPose ?? three;
  const walls = mix(0.02, 1, span01(p, 0.05, 0.25));
  const objects = span01(p, 0.2, 0.35);
  if (p < 0.35 || !rooms.length) {
    const t = rooms.length ? span01(p, 0.12, 0.35) : span01(p, 0.12, 0.9);
    const pose = mixPose(top, rooms.length ? three : end, t);
    return { pose, walls, objects, dip: 0, render: rooms.length ? 0 : span01(p, 0.9, 1), room: -1, shot: 0 };
  }
  if (p < 0.85) {
    const per = 0.5 / rooms.length;
    const i = Math.min(rooms.length - 1, Math.floor((p - 0.35) / per));
    const local = (p - 0.35 - i * per) / per;
    const [a, b] = roomPoses(rooms[i]);
    const dip = local < 0.15 ? 1 - local / 0.15 : local > 0.9 ? (local - 0.9) / 0.1 : 0;
    const shot = rooms[i].shot ? span01(local, 0.5, 0.68) : 0;
    const pose = mixPose(a, b, rooms[i].shot ? ease(local / 0.5) : ease(local));
    return { pose, walls: 1, objects: 1, dip: clamp01(dip), room: i, render: 0, shot };
  }
  const t = (p - 0.85) / 0.15;
  return { pose: end, walls: 1, objects: 1, dip: clamp01(1 - t / 0.25), room: rooms.length, render: finalPose ? span01(p, 0.9, 1) : 0, shot: 0 };
}
