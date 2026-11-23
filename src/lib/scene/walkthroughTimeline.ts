export type V3 = [number, number, number];
export interface Pose { position: V3; target: V3; fov: number }
export interface WalkRoom { centre: [number, number]; far: [number, number]; focus?: [number, number] | null }
export interface WalkFrame { pose: Pose; walls: number; objects: number; dip: number; render: number; room: number }

const EYE = 1.6;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const span01 = (p: number, a: number, b: number) => ease((p - a) / (b - a));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixV = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mixPose = (a: Pose, b: Pose, t: number): Pose => ({ position: mixV(a.position, b.position, t), target: mixV(a.target, b.target, t), fov: mix(a.fov, b.fov, t) });

export function roomPoses(r: WalkRoom): [Pose, Pose] {
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

export function walkthroughFrame(p: number, span: number, rooms: WalkRoom[], finalPose: Pose | null): WalkFrame {
  const top: Pose = { position: [0, span * 1.7, 0.001], target: [0, 0, 0], fov: 42 };
  const three: Pose = { position: [span * 0.85, span * 0.95, span * 0.95], target: [0, 0.3, 0], fov: 45 };
  const end = finalPose ?? three;
  const walls = mix(0.02, 1, span01(p, 0.05, 0.25));
  const objects = span01(p, 0.2, 0.35);
  if (p < 0.35 || !rooms.length) {
    const t = rooms.length ? span01(p, 0.12, 0.35) : span01(p, 0.12, 0.9);
    const pose = mixPose(top, rooms.length ? three : end, t);
    return { pose, walls, objects, dip: 0, render: rooms.length ? 0 : span01(p, 0.9, 1), room: -1 };
  }
  if (p < 0.85) {
    const per = 0.5 / rooms.length;
    const i = Math.min(rooms.length - 1, Math.floor((p - 0.35) / per));
    const local = (p - 0.35 - i * per) / per;
    const [a, b] = roomPoses(rooms[i]);
    const dip = local < 0.15 ? 1 - local / 0.15 : local > 0.9 ? (local - 0.9) / 0.1 : 0;
    return { pose: mixPose(a, b, ease(local)), walls: 1, objects: 1, dip: clamp01(dip), room: i, render: 0 };
  }
  const t = (p - 0.85) / 0.15;
  return { pose: end, walls: 1, objects: 1, dip: clamp01(1 - t / 0.25), room: rooms.length, render: span01(p, 0.9, 1) };
}
