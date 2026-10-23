import type { GuidePart, GuidePlacement, GuideSpot, InstallationGuideData, Vec3 } from './guideSchema';

export type Quat = [number, number, number, number];

export interface BuildPose {
  pos: Vec3;
  quat: Quat;
}

export interface BuildItem {
  key: string;
  partId: string;
  partIndex: number;
  instance: number;
  kind: 'panel' | 'hardware';
  step: number;
  t0: number;
  ta: number;
  size: Vec3;
  kit: BuildPose;
  approach: Vec3;
  target: BuildPose;
  host: number | null;
  spin: boolean;
  placed: boolean;
  weight: number;
  explode: Vec3;
  motion?: 'swing' | 'slide' | 'tap';
  pivot?: Vec3;
  forward?: Vec3;
}

export interface KitCard {
  partId: string;
  pos: Vec3;
  width: number;
  depth: number;
  label: string;
  code: string;
}

export interface CameraShot {
  target: Vec3;
  yaw: number;
  pitch: number;
  dist: number;
}

export interface GuideBuild {
  items: BuildItem[];
  cards: KitCard[];
  steps: number;
  stepSeconds: number[];
  hardwareTotal: number;
  panelTotal: number;
  hasAssembly: boolean;
  product: { center: Vec3; size: Vec3 };
  kitBounds: { center: Vec3; size: Vec3 };
  ghost: Array<{ center: Vec3; size: Vec3 }>;
  cameras: CameraShot[];
  finalCamera: CameraShot;
  explodedCamera: CameraShot;
}

const M = 0.01;
const MAX_HARDWARE_RENDERED = 60;
const DEFAULT_PANEL_CM: Vec3 = { x: 60, y: 1.8, z: 40 };
const HARDWARE_DEFAULT_CM = 4;
const HARDWARE_VISUAL_SCALE = 1.6;
const PANEL_SECONDS = 2.4;
const HARDWARE_SECONDS = 0.9;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vec3, k: number): Vec3 => v(a.x * k, a.y * k, a.z * k);
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const lerp3 = (a: Vec3, b: Vec3, t: number) => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const AXES = ['x', 'y', 'z'] as const;

export const IDENTITY: Quat = [0, 0, 0, 1];
const axisAngle = (ax: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [ax.x * s, ax.y * s, ax.z * s, Math.cos(angle / 2)];
};
export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const rotate = (q: Quat, p: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const ix = w * p.x + y * p.z - z * p.y;
  const iy = w * p.y + z * p.x - x * p.z;
  const iz = w * p.z + x * p.y - y * p.x;
  const iw = -x * p.x - y * p.y - z * p.z;
  return v(
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  );
};
const slerp = (a: Quat, b: Quat, t: number): Quat => {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Quat = cos < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  cos = Math.abs(cos);
  if (cos > 0.9995) {
    const r: Quat = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t];
    const n = Math.hypot(...r) || 1;
    return [r[0] / n, r[1] / n, r[2] / n, r[3] / n];
  }
  const th = Math.acos(cos);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb];
};

type Axis = typeof AXES[number];
type Box = { center: Vec3; size: Vec3 };
const smallestAxis = (s: Vec3): Axis => (s.x <= s.y && s.x <= s.z ? 'x' : s.y <= s.z ? 'y' : 'z');
const largestAxis = (s: Vec3): Axis => (s.x >= s.y && s.x >= s.z ? 'x' : s.y >= s.z ? 'y' : 'z');
const unit = (a: Axis, sign = 1): Vec3 => v(a === 'x' ? sign : 0, a === 'y' ? sign : 0, a === 'z' ? sign : 0);
const outwardQuat = (a: Axis, sign: number): Quat => {
  const t = unit(a, sign);
  if (t.y > 0.5) return IDENTITY;
  if (t.y < -0.5) return axisAngle(v(1, 0, 0), Math.PI);
  return axisAngle(v(t.z, 0, -t.x), Math.PI / 2);
};
const flatQuat = (s: Vec3): Quat => {
  const a = smallestAxis(s);
  return a === 'x' ? axisAngle(v(0, 0, 1), Math.PI / 2) : a === 'z' ? axisAngle(v(1, 0, 0), -Math.PI / 2) : IDENTITY;
};
const alongQuat = (a: Axis): Quat => (a === 'x' ? axisAngle(v(0, 0, 1), Math.PI / 2) : a === 'z' ? axisAngle(v(1, 0, 0), Math.PI / 2) : IDENTITY);
const flatFootprint = (s: Vec3): { w: number; d: number; h: number } => {
  const a = smallestAxis(s);
  if (a === 'x') return { w: s.y, d: s.z, h: s.x };
  if (a === 'z') return { w: s.x, d: s.y, h: s.z };
  return { w: s.x, d: s.z, h: s.y };
};
const lying = alongQuat('x');

function partSizeCm(part: GuidePart): Vec3 {
  const s = part.size_cm;
  if (s.x > 0 && s.y > 0 && s.z > 0) return s;
  if (part.kind === 'panel') return DEFAULT_PANEL_CM;
  const longest = Math.max(s.x, s.y, s.z) || HARDWARE_DEFAULT_CM;
  return v(longest * 0.3, longest, longest * 0.3);
}

function hardwareDims(part: GuidePart): Vec3 {
  const s = partSizeCm(part);
  const sorted = [s.x, s.y, s.z].sort((a, b) => b - a);
  const length = Math.min(Math.max(sorted[0], 2.5), 30) * M * HARDWARE_VISUAL_SCALE;
  const radius = Math.min(Math.max(sorted[1] / 2, 0.45), 6) * M * HARDWARE_VISUAL_SCALE;
  return v(radius * 2, length, radius * 2);
}

function bounds(boxes: Box[]): Box {
  if (boxes.length === 0) return { center: v(0, 0, 0), size: v(0, 0, 0) };
  const lo = v(Infinity, Infinity, Infinity);
  const hi = v(-Infinity, -Infinity, -Infinity);
  for (const b of boxes) {
    for (const k of AXES) {
      lo[k] = Math.min(lo[k], b.center[k] - b.size[k] / 2);
      hi[k] = Math.max(hi[k], b.center[k] + b.size[k] / 2);
    }
  }
  return { center: scale(add(lo, hi), 0.5), size: v(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) };
}

function contact(a: Box, b: Box, slack: number): Box | null {
  const lo = v(0, 0, 0);
  const hi = v(0, 0, 0);
  for (const k of AXES) {
    lo[k] = Math.max(a.center[k] - a.size[k] / 2, b.center[k] - b.size[k] / 2) - slack;
    hi[k] = Math.min(a.center[k] + a.size[k] / 2, b.center[k] + b.size[k] / 2) + slack;
    if (hi[k] < lo[k]) return null;
  }
  return { center: scale(add(lo, hi), 0.5), size: sub(hi, lo) };
}

function shotFor(b: Box, yaw: number, pitch: number, minDist = 0.9): CameraShot {
  const r = Math.max(len(b.size) / 2, 0.2);
  return { target: b.center, yaw, pitch, dist: Math.max(minDist, r * 2.3 + 0.35) };
}

const FOOT = /foot|feet|leg|glide|socket|levell?ing/i;
const HINGE = /hinge|mounting plate/i;
const KNOB = /knob|handle|pull/i;
const NAIL = /nail/i;
const SCREW = /screw/i;
const SEAT = /screw|bolt|nail|cam/i;
const DOWEL = /dowel|pin/i;
const FLAT = /rail|runner|slide|bar|rod|strip|bracket|plate/i;
const isHinge = (name: string) => HINGE.test(name) && !SCREW.test(name);

function spotOn(host: BuildItem, spot: GuideSpot, centre: Vec3): { offset: Vec3; normal: Axis; sign: number } {
  const s = host.size;
  const thin = smallestAxis(s);
  const inward = Math.sign(centre[thin] - host.target.pos[thin]) || 1;
  const across: Axis = thin === 'y' ? 'x' : thin === 'x' ? 'z' : 'x';
  const down: Axis = thin === 'y' ? 'z' : 'y';
  const downSign = down === 'y' ? -1 : 1;
  const offset = v(0, 0, 0);
  const along = (axis: Axis, f: number, sign = 1) => { offset[axis] = sign * (f - 0.5) * s[axis] * 0.94; };
  if (spot.where === 'inner' || spot.where === 'outer') {
    const sign = spot.where === 'inner' ? inward : -inward;
    offset[thin] = (sign * s[thin]) / 2;
    along(across, spot.u);
    along(down, spot.v, downSign);
    return { offset, normal: thin, sign };
  }
  if (spot.where === 'top' || spot.where === 'bottom') {
    const sign = (spot.where === 'top' ? -1 : 1) * downSign;
    offset[down] = (sign * s[down]) / 2;
    along(across, spot.u);
    return { offset, normal: down, sign };
  }
  const sign = spot.where === 'left' ? -1 : 1;
  offset[across] = (sign * s[across]) / 2;
  along(down, spot.v, downSign);
  return { offset, normal: across, sign };
}

function mountFor(
  name: string,
  host: BuildItem,
  index: number,
  count: number,
  centre: Vec3,
): { offset: Vec3; normal: Axis; sign: number } | null {
  const s = host.size;
  const thin = smallestAxis(s);
  const toCentre = (a: Axis) => Math.sign(centre[a] - host.target.pos[a]) || 1;
  if (FOOT.test(name)) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
    const [cx, cz] = index < corners.length ? corners[index] : [0, 0];
    return { offset: v(cx * (s.x / 2 - 0.05), -s.y / 2, cz * (s.z / 2 - 0.05)), normal: 'y', sign: -1 };
  }
  if (isHinge(name)) {
    const reach = s.y / 2 - Math.min(0.12, s.y / 4);
    const along = count > 2 ? reach - (2 * reach * (index % count)) / (count - 1) : ((index % 2) === 0 ? 1 : -1) * reach;
    if (thin === 'z') return { offset: v(-s.x / 2 + 0.035, along, -s.z / 2), normal: 'z', sign: -1 };
    const sign = thin === 'x' ? toCentre('x') : 1;
    return { offset: v(thin === 'x' ? (sign * s.x) / 2 : 0, along, s.z / 2 - 0.035), normal: thin, sign };
  }
  if (KNOB.test(name)) {
    return { offset: v(s.x / 2 - 0.05 - index * Math.min(0.1, s.x / 4), s.y / 2 - Math.min(0.08, s.y / 4), s.z / 2), normal: 'z', sign: 1 };
  }
  if (NAIL.test(name)) {
    const sign = -toCentre(thin);
    const run = largestAxis(v(thin === 'x' ? 0 : s.x, thin === 'y' ? 0 : s.y, thin === 'z' ? 0 : s.z));
    const across: Axis = AXES.find((a) => a !== thin && a !== run)!;
    const rowCount = Math.max(1, Math.ceil(count / 3));
    const row = index % 3;
    const col = Math.floor(index / 3);
    const offset = v(0, 0, 0);
    offset[thin] = (sign * s[thin]) / 2;
    offset[run] = ((col + 0.5) / rowCount - 0.5) * s[run] * 0.9;
    offset[across] = (row - 1) * (s[across] / 2 - 0.03);
    return { offset, normal: thin, sign };
  }
  return null;
}

type Placed = GuidePlacement & { center: Vec3; size: Vec3 };

const REVEAL = 0.003;
const NEAR = 0.1;

function fitFronts(guide: InstallationGuideData, placed: Placed[]): void {
  const name = (pl: Placed) => guide.parts.find((p) => p.id === pl.part_id)?.name ?? '';
  const isFront = (pl: Placed) => smallestAxis(pl.size) === 'z' && /door|front/i.test(name(pl));
  const lo = (pl: Placed, a: Axis) => pl.center[a] - pl.size[a] / 2;
  const hi = (pl: Placed, a: Axis) => pl.center[a] + pl.size[a] / 2;
  const fronts = placed.filter(isFront);
  const frame = placed.filter((pl) => !isFront(pl) && smallestAxis(pl.size) === 'x');
  if (fronts.length === 0 || frame.length < 2) return;
  const x0 = Math.min(...frame.map((pl) => lo(pl, 'x')));
  const x1 = Math.max(...frame.map((pl) => hi(pl, 'x')));
  const y0 = Math.min(...frame.map((pl) => lo(pl, 'y')));
  const y1 = Math.max(...frame.map((pl) => hi(pl, 'y')));
  const face = Math.max(...placed.filter((pl) => !isFront(pl)).map((pl) => hi(pl, 'z')));
  const lines = [x0, x1, ...frame.filter((pl) => lo(pl, 'x') > x0 + 0.001 && hi(pl, 'x') < x1 - 0.001).map((pl) => pl.center.x)];
  const snap = (x: number, outward: -1 | 1) => {
    const line = lines.reduce((b, l) => (Math.abs(l - x) < Math.abs(b - x) ? l : b), lines[0]);
    if (Math.abs(line - x) > NEAR) return x;
    return line === x0 || line === x1 ? line : line - outward * (REVEAL / 2);
  };
  const set = (pl: Placed, a: Axis, from: number, to: number) => {
    pl.center = { ...pl.center, [a]: (from + to) / 2 };
    pl.size = { ...pl.size, [a]: Math.max(0.01, to - from) };
  };
  for (const pl of fronts) {
    set(pl, 'x', snap(lo(pl, 'x'), -1), snap(hi(pl, 'x'), 1));
    pl.center = { ...pl.center, z: face + pl.size.z / 2 };
  }
  const columns: Placed[][] = [];
  for (const pl of [...fronts].sort((a, b) => a.center.x - b.center.x)) {
    const col = columns.find((c) => Math.min(hi(c[0], 'x'), hi(pl, 'x')) - Math.max(lo(c[0], 'x'), lo(pl, 'x')) > pl.size.x * 0.5);
    if (col) col.push(pl);
    else columns.push([pl]);
  }
  for (const col of columns) {
    col.sort((a, b) => a.center.y - b.center.y);
    const gaps = col.slice(1).map((pl, i) => Math.abs(lo(pl, 'y') - hi(col[i], 'y')));
    if (lo(col[0], 'y') - y0 > NEAR || y1 - hi(col[col.length - 1], 'y') > NEAR || gaps.some((g) => g > NEAR)) continue;
    const total = col.reduce((n, pl) => n + pl.size.y, 0);
    const room = y1 - y0 - REVEAL * (col.length - 1);
    let y = y0;
    for (const pl of col) {
      const h = (pl.size.y / total) * room;
      set(pl, 'y', y, y + h);
      y += h + REVEAL;
    }
  }
}

function drawerBox(guide: InstallationGuideData, placed: Placed[], product: Box): Placed[] {
  const front = placed.find((pl) => /drawer/i.test(guide.parts.find((p) => p.id === pl.part_id)?.name ?? '') && smallestAxis(pl.size) === 'z');
  if (!front) return [];
  const t = 0.012;
  const w = front.size.x - 0.05;
  const h = Math.max(0.06, front.size.y * 0.75);
  const back = product.center.z - product.size.z / 2 + 0.02;
  const z1 = front.center.z - front.size.z / 2;
  const d = z1 - back;
  if (d < 0.1) return [];
  const zc = (z1 + back) / 2;
  const { x, y } = front.center;
  const shapes = [
    { center: v(x - w / 2 + t / 2, y, zc), size: v(t, h, d) },
    { center: v(x + w / 2 - t / 2, y, zc), size: v(t, h, d) },
    { center: v(x, y - h / 2 + t / 2, zc), size: v(w - 2 * t, t, d) },
    { center: v(x, y, back + t / 2), size: v(w - 2 * t, h, t) },
  ];
  const out: Placed[] = [];
  let next = 0;
  for (const part of guide.parts) {
    if (part.kind !== 'panel' && part.kind !== 'fitting') continue;
    if (!/drawer|runner/i.test(part.name) || placed.some((pl) => pl.part_id === part.id)) continue;
    for (let k = 0; k < part.quantity; k++) {
      const runner = /runner|slide|rail/i.test(part.name);
      const shape = runner
        ? { center: v(x - w / 2 - 0.006, y - h / 2 + 0.015, zc), size: v(0.01, 0.025, d) }
        : shapes[next++];
      if (!shape) break;
      out.push({ step: front.step, part_id: part.id, instance: k + 1, center_cm: scale(shape.center, 100), extent_cm: scale(shape.size, 100), ...shape });
    }
  }
  return out;
}

export function buildGuide(guide: InstallationGuideData): GuideBuild {
  const stepCount = Math.max(1, guide.steps.length - 1);
  const hasAssembly = guide.assembly.available && guide.assembly.placements.length > 0;

  const placements = hasAssembly ? guide.assembly.placements.map((p) => ({
    ...p,
    center: scale(p.center_cm, M),
    size: scale(p.extent_cm, M),
  })) : [];
  const productBox = hasAssembly
    ? bounds(placements)
    : { center: v(0, 0.4, 0), size: v(0.8, 0.8, 0.6) };
  const lift = hasAssembly ? -(productBox.center.y - productBox.size.y / 2) : 0;
  for (const p of placements) p.center = add(p.center, v(-productBox.center.x, lift, -productBox.center.z));
  if (hasAssembly) fitFronts(guide, placements);
  const product = hasAssembly ? bounds(placements) : productBox;
  if (hasAssembly) placements.push(...drawerBox(guide, placements, product));

  const slotsOf = new Map<string, number[]>();
  guide.steps.forEach((s, i) => {
    for (const u of s.parts_used) {
      const list = slotsOf.get(u.part_id) ?? [];
      for (let k = 0; k < u.quantity; k++) list.push(Math.max(i, 1));
      slotsOf.set(u.part_id, list);
    }
  });

  const rowWidth = Math.max(2.2, product.size.x * 1.7);
  const kitZ0 = product.center.z + product.size.z / 2 + 0.55;
  let cursorX = -rowWidth / 2;
  let cursorZ = kitZ0;
  let rowDepth = 0;
  const place = (w: number, d: number): Vec3 => {
    if (cursorX + w > rowWidth / 2 && cursorX > -rowWidth / 2) {
      cursorX = -rowWidth / 2;
      cursorZ += rowDepth + 0.1;
      rowDepth = 0;
    }
    const at = v(cursorX + w / 2, 0, cursorZ + d / 2);
    cursorX += w + 0.1;
    rowDepth = Math.max(rowDepth, d);
    return at;
  };

  const items: BuildItem[] = [];
  const cards: KitCard[] = [];
  const stackAt = v(product.center.x + product.size.x / 2 + 0.45, 0, product.center.z);
  let stackHeight = 0;

  const panels = guide.parts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.kind === 'panel' || p.kind === 'fitting')
    .sort((a, b) => {
      const fa = flatFootprint(partSizeCm(a.p));
      const fb = flatFootprint(partSizeCm(b.p));
      return fb.w * fb.d - fa.w * fa.d;
    });
  for (const { p, i } of panels) {
    const slots = slotsOf.get(p.id) ?? [];
    const own = placements
      .filter((pl) => pl.part_id === p.id)
      .sort((a, b) => a.step - b.step || a.instance - b.instance);
    for (let k = 0; k < p.quantity; k++) {
      const pl = own[k] ?? null;
      const size = pl ? pl.size : scale(partSizeCm(p), M);
      const foot = flatFootprint(size);
      const kitPos = place(foot.w, foot.d);
      const step = Math.min(stepCount, Math.max(1, slots[k] ?? (pl ? pl.step : stepCount)));
      let target: BuildPose;
      if (pl) {
        target = { pos: pl.center, quat: IDENTITY };
      } else {
        target = { pos: add(stackAt, v(0, stackHeight + foot.h / 2, 0)), quat: flatQuat(size) };
        stackHeight += foot.h + 0.01;
      }
      const drop = pl ? Math.max(0.25, size.y * 0.35) : 0.2;
      items.push({
        key: `${p.id}#${k}`, partId: p.id, partIndex: i, instance: k, kind: 'panel', step, t0: 0, ta: 0,
        size, kit: { pos: add(kitPos, v(0, foot.h / 2, 0)), quat: flatQuat(size) },
        approach: add(target.pos, v(0, drop, 0)), target, host: null, spin: false,
        placed: !!pl, explode: v(0, 0, 0), weight: 1,
      });
    }
  }

  cursorX = -rowWidth / 2;
  cursorZ += rowDepth + 0.25;
  rowDepth = 0;
  const panelIdx = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.kind === 'panel');
  const boxOf = (it: BuildItem): Box => ({ center: it.target.pos, size: it.size });

  const isFront = (it: BuildItem) => smallestAxis(it.size) === 'z' && /door|front/i.test(guide.parts[it.partIndex]?.name ?? '');
  const jointFor = (host: BuildItem): { box: Box; normal: Axis; sign: number } | null => {
    let best: { box: Box; area: number; other: BuildItem } | null = null;
    for (const { it: other } of panelIdx) {
      if (other === host || !other.placed || (isFront(other) && !isFront(host))) continue;
      const c = contact(boxOf(host), boxOf(other), 0.012);
      if (!c) continue;
      const dims = AXES.map((a) => c.size[a]).sort((a, b) => b - a);
      const area = dims[0] * dims[1];
      if (!best || area > best.area) best = { box: c, area, other };
    }
    if (!best) return null;
    const normal = smallestAxis(best.box.size);
    const sign = Math.sign(best.other.target.pos[normal] - host.target.pos[normal]) || 1;
    return { box: best.box, normal, sign };
  };

  const faceUp = new Map<number, Vec3>();
  let footDrop = 0;
  const hingeSpots = new Map<number, { pos: Vec3; normal: Axis; sign: number; step: number }[]>();
  const fitOrder = guide.parts.map((p, i) => ({ p, i })).sort((a, b) => Number(isHinge(b.p.name)) - Number(isHinge(a.p.name)));
  fitOrder.forEach(({ p, i }) => {
    if (p.kind !== 'hardware' && p.kind !== 'accessory') return;
    const shown = Math.min(p.quantity, MAX_HARDWARE_RENDERED);
    const dims = hardwareDims(p);
    const pitch = Math.max(dims.y * 1.3, 0.045);
    const cols = Math.ceil(Math.sqrt(shown));
    const rows = Math.ceil(shown / cols);
    const cardW = cols * pitch + 0.06;
    const cardD = rows * pitch + 0.1;
    const cardAt = place(cardW, cardD);
    cards.push({ partId: p.id, pos: cardAt, width: cardW, depth: cardD, label: `${p.quantity}x`, code: p.code });
    const uses = guide.steps.flatMap((s, si) => s.parts_used.filter((u) => u.part_id === p.id).map((u) => ({ ...u, step: Math.max(si, 1) })));
    const kitOf = (n: number) => {
      const c = n % cols;
      const r = Math.floor(n / cols);
      return add(cardAt, v((c - (cols - 1) / 2) * pitch, dims.x / 2 + 0.002, (r - (rows - 1) / 2) * pitch));
    };
    let unitIndex = 0;
    const mounted = new Map<number, number>();
    for (const use of uses) {
      const named = panelIdx.filter(({ it }) => it.partId === use.fixes_to && it.placed);
      const sameStep = panelIdx.filter(({ it }) => it.step === use.step && it.placed);
      const pool = named.length ? named : sameStep.length ? sameStep : panelIdx.filter(({ it }) => it.placed && it.step <= use.step);
      const upcoming = pool.filter(({ it }) => it.step >= use.step).sort((a, b) => a.it.step - b.it.step);
      const flat = panelIdx.filter(({ it }) => it.placed && smallestAxis(it.size) === 'y');
      const under = flat.length ? flat : pool;
      const lowest = Math.min(...under.map(({ it }) => it.target.pos.y - it.size.y / 2));
      const hosts = FOOT.test(p.name) && under.length
        ? under.filter(({ it }) => it.target.pos.y - it.size.y / 2 < lowest + 0.02)
        : upcoming.length ? upcoming.filter(({ it }) => it.step === upcoming[0].it.step) : pool.slice(-1);
      for (let k = 0; k < use.quantity && unitIndex < shown; k++, unitIndex++) {
        const kitPos = kitOf(unitIndex);
        let item: BuildItem;
        if (hosts.length && hasAssembly) {
          const { it: h, idx: hostIndex } = hosts[k % hosts.length];
          const localIndex = Math.floor(k / hosts.length);
          const per = Math.max(1, Math.ceil(use.quantity / hosts.length));
          const nth = mounted.get(hostIndex) ?? 0;
          mounted.set(hostIndex, nth + 1);
          const drawn = use.spots?.length && use.fixes_to === h.partId ? use.spots[nth % use.spots.length] : null;
          const mount = drawn ? spotOn(h, drawn, product.center) : mountFor(p.name, h, nth, Math.max(per, nth + 1), product.center);
          const spots = mount ? [] : (hingeSpots.get(hostIndex) ?? []).filter((sp) => sp.step === use.step);
          const onHinge = SCREW.test(p.name) && spots.length ? spots[nth % spots.length] : null;
          const joint = mount || onHinge ? null : jointFor(h);
          const pos = { ...h.target.pos };
          let normal: Axis;
          let sign: number;
          if (mount) {
            normal = mount.normal;
            sign = mount.sign;
            for (const a of AXES) pos[a] = h.target.pos[a] + mount.offset[a];
            if (isHinge(p.name)) hingeSpots.set(hostIndex, [...(hingeSpots.get(hostIndex) ?? []), { pos: { ...pos }, normal, sign, step: use.step }]);
          } else if (onHinge) {
            normal = onHinge.normal;
            sign = onHinge.sign;
            const across = AXES.find((a) => a !== normal)!;
            for (const a of AXES) pos[a] = onHinge.pos[a];
            pos[across] += (Math.floor(nth / spots.length) % 2 === 0 ? 1 : -1) * 0.018;
          } else if (joint) {
            normal = joint.normal;
            sign = joint.sign;
            const flat = v(normal === 'x' ? 0 : joint.box.size.x, normal === 'y' ? 0 : joint.box.size.y, normal === 'z' ? 0 : joint.box.size.z);
            const run = largestAxis(flat);
            for (const a of AXES) pos[a] = joint.box.center[a];
            pos[run] += ((localIndex + 0.5) / per - 0.5) * joint.box.size[run] * 0.8;
          } else {
            normal = smallestAxis(h.size);
            sign = -Math.sign(h.target.pos[normal] - product.center[normal]) || 1;
            const flat = v(normal === 'x' ? 0 : h.size.x, normal === 'y' ? 0 : h.size.y, normal === 'z' ? 0 : h.size.z);
            const run = largestAxis(flat);
            pos[run] += ((localIndex + 0.5) / per - 0.5) * h.size[run] * 0.8;
            pos[normal] += sign * (h.size[normal] / 2);
          }
          if (use.step <= h.step && !faceUp.has(hostIndex) && normal === smallestAxis(h.size)) faceUp.set(hostIndex, unit(normal, sign));
          const long = FLAT.test(p.name) && !isHinge(p.name);
          if (long) {
            normal = smallestAxis(h.size);
            sign = -Math.sign(h.target.pos[normal] - product.center[normal]) || 1;
            pos[normal] = h.target.pos[normal] + sign * (h.size[normal] / 2);
          }
          const along = largestAxis(v(normal === 'x' ? 0 : h.size.x, normal === 'y' ? 0 : h.size.y, normal === 'z' ? 0 : h.size.z));
          if (long) {
            for (const a of AXES) {
              if (a === normal) continue;
              const room = Math.max(0, h.size[a] / 2 - (a === along ? dims.y : dims.x) / 2);
              pos[a] = Math.min(h.target.pos[a] + room, Math.max(h.target.pos[a] - room, pos[a]));
            }
          }
          const shallow = normal === smallestAxis(h.size) ? Math.min(dims.y * 0.2, h.size[normal] * 0.45) : dims.y * 0.2;
          const embed = FOOT.test(p.name) || isHinge(p.name) || long ? shallow
            : SEAT.test(p.name) ? dims.y - Math.min(0.004, dims.y * 0.15)
            : DOWEL.test(p.name) ? dims.y / 2 : shallow;
          const seated = add(pos, scale(unit(normal, sign), long ? dims.x / 2 : dims.y / 2 - embed));
          if (!FOOT.test(p.name) && !KNOB.test(p.name)) {
            const axis = long ? along : normal;
            for (const a of AXES) {
              const half = a === axis ? dims.y / 2 : dims.x / 2;
              const over = seated[a] + half - (product.center[a] + product.size[a] / 2);
              const under = product.center[a] - product.size[a] / 2 - (seated[a] - half);
              if (over > 0) seated[a] -= over;
              else if (under > 0) seated[a] += under;
            }
          }
          if (mount && FOOT.test(p.name)) footDrop = Math.max(footDrop, dims.y - embed);
          const local = sub(seated, h.target.pos);
          item = {
            key: `${p.id}#${unitIndex}`, partId: p.id, partIndex: i, instance: unitIndex, kind: 'hardware', step: use.step,
            t0: 0, ta: 0, size: dims, kit: { pos: kitPos, quat: lying },
            approach: add(local, scale(unit(normal, sign), long ? 0.08 : dims.y * 1.8 + 0.05)),
            target: { pos: local, quat: long ? outwardQuat(along, 1) : outwardQuat(normal, sign) }, host: hostIndex,
            spin: /screw|cam|bolt|lock|foot|leg/i.test(p.name), placed: true, explode: v(0, 0, 0), weight: 1,
          };
        } else {
          const spot = add(stackAt, v(0.25 + (unitIndex % 6) * 0.05, dims.x / 2, -0.2 + Math.floor(unitIndex / 6) * 0.05));
          item = {
            key: `${p.id}#${unitIndex}`, partId: p.id, partIndex: i, instance: unitIndex, kind: 'hardware', step: use.step,
            t0: 0, ta: 0, size: dims, kit: { pos: kitPos, quat: lying }, approach: add(spot, v(0, 0.12, 0)),
            target: { pos: spot, quat: lying }, host: null, spin: false, placed: false, explode: v(0, 0, 0), weight: 1,
          };
        }
        items.push(item);
      }
    }
    for (; unitIndex < shown; unitIndex++) {
      const kitPos = kitOf(unitIndex);
      items.push({
        key: `${p.id}#${unitIndex}`, partId: p.id, partIndex: i, instance: unitIndex, kind: 'hardware', step: stepCount + 1,
        t0: Infinity, ta: Infinity, size: dims, kit: { pos: kitPos, quat: lying }, approach: kitPos,
        target: { pos: kitPos, quat: lying }, host: null, spin: false, placed: false, explode: v(0, 0, 0), weight: 0,
      });
    }
    const used = uses.reduce((n, u) => n + u.quantity, 0);
    const rendered = items.filter((it) => it.partId === p.id && it.weight > 0);
    for (const it of rendered) it.weight = used / rendered.length;
  });

  if (footDrop > 0) {
    for (const it of items) {
      if (it.kind !== 'panel' || !it.placed) continue;
      it.target = { ...it.target, pos: add(it.target.pos, v(0, footDrop, 0)) };
      it.approach = add(it.approach, v(0, footDrop, 0));
    }
    product.center = add(product.center, v(0, footDrop, 0));
  }

  for (const it of items) {
    const name = guide.parts[it.partIndex]?.name ?? '';
    if (it.kind === 'panel' && it.placed) {
      const fwd = Math.sign(it.target.pos.z - product.center.z) || 1;
      if (/door/i.test(name) && !/drawer/i.test(name) && smallestAxis(it.size) === 'z') {
        it.motion = 'swing';
        it.pivot = v(-it.size.x / 2, 0, -fwd * it.size.z / 2);
        it.forward = v(0, 0, fwd);
      } else if (/drawer/i.test(name)) {
        it.motion = 'slide';
        it.forward = v(0, 0, fwd);
      }
    } else if (it.kind === 'hardware' && it.host !== null && /dowel|nail/i.test(name)) {
      it.motion = 'tap';
    }
  }

  for (const [idx, face] of faceUp) {
    if (rotate(items[idx].kit.quat, face).y < 0) items[idx].kit.quat = qmul(axisAngle(v(1, 0, 0), Math.PI), items[idx].kit.quat);
  }

  const stepSeconds: number[] = [0];
  for (let s = 1; s <= stepCount; s++) {
    const rank = (it: BuildItem) => (it.kind === 'panel' ? 1 : it.host !== null && items[it.host].step === s ? 0 : 2);
    const group = items.filter((it) => it.step === s)
      .sort((a, b) => rank(a) - rank(b) || a.instance - b.instance);
    const cost = (it: BuildItem) => (it.kind === 'panel' ? PANEL_SECONDS : HARDWARE_SECONDS);
    const total = group.reduce((n, it) => n + cost(it), 0);
    stepSeconds.push(Math.min(40, Math.max(3, total + 1.2)));
    let at = s - 1 + 0.06;
    const span = 0.88;
    for (const it of group) {
      const slot = total > 0 ? (cost(it) / total) * span : span;
      it.t0 = at;
      it.ta = Math.min(at + slot * 0.94, s - 0.03);
      at += slot;
    }
  }
  for (const it of items) {
    if (it.kind !== 'panel') continue;
    const raw = sub(it.target.pos, product.center);
    const d = v(raw.x, raw.y, raw.z < 0 ? raw.z * 0.25 : raw.z);
    const l = len(d) || 1;
    it.explode = scale(d, (0.35 * Math.max(product.size.x, product.size.y, product.size.z, 0.5)) / l);
  }

  const kitBoxes = items.map((it) => ({ center: it.kit.pos, size: it.size }));
  const kitBounds = bounds([...kitBoxes, ...cards.map((c) => ({ center: c.pos, size: v(c.width, 0.01, c.depth) }))]);
  const firstWork = items.reduce((m, it) => (Number.isFinite(it.t0) ? Math.min(m, it.step) : m), Infinity);
  const kitShot = shotFor(bounds([kitBounds, product]), -0.45, 0.62, 1.4);
  const cameras: CameraShot[] = guide.steps.map((_, s) => {
    if (s === 0 || s < firstWork) return kitShot;
    const group = items.filter((it) => it.step === s);
    if (group.length === 0) return shotFor(product, -0.5, 0.42);
    const settled = { items } as GuideBuild;
    const b = bounds(group.map((it) => ({ center: poseAt(settled, it, s, 0).pos, size: it.size })));
    const work = { center: b.center, size: v(Math.max(b.size.x, 0.6), Math.max(b.size.y, 0.4), Math.max(b.size.z, 0.6)) };
    return shotFor(work, -0.5 + (s % 2 ? 0.1 : -0.1), 0.5, 1.3);
  });

  return {
    items,
    cards,
    steps: stepCount,
    stepSeconds,
    hardwareTotal: Math.round(items.filter((it) => it.kind === 'hardware').reduce((n, it) => n + it.weight, 0)),
    panelTotal: items.filter((it) => it.kind === 'panel').length,
    hasAssembly,
    product,
    kitBounds,
    ghost: placements.map((p) => ({ center: p.center, size: p.size })),
    cameras,
    finalCamera: shotFor(product, -0.5, 0.18, 1.2),
    explodedCamera: shotFor({ center: product.center, size: scale(product.size, 2.1) }, -0.55, 0.3, 1.6),
  };
}

export const stepAt = (x: number, steps: number) => Math.max(0, Math.min(steps, Math.ceil(x - 1e-6)));

export function countsAt(build: GuideBuild, x: number): { hardware: number; panels: number } {
  let hardware = 0;
  let panels = 0;
  for (const it of build.items) {
    if (x < it.ta - 1e-6) continue;
    if (it.kind === 'hardware') hardware += it.weight;
    else panels++;
  }
  return { hardware: Math.round(hardware), panels };
}

export function partCountAt(build: GuideBuild, partId: string, x: number): number {
  return Math.round(build.items.filter((it) => it.partId === partId && x >= it.ta - 1e-6).reduce((n, it) => n + it.weight, 0));
}

export function partUsedTotal(build: GuideBuild, partId: string): number {
  return Math.round(build.items.filter((it) => it.partId === partId).reduce((n, it) => n + it.weight, 0));
}

export function activeItemAt(build: GuideBuild, x: number): BuildItem | null {
  let active: BuildItem | null = null;
  for (const it of build.items) {
    if (x > it.t0 && x < it.ta + 0.01 && (!active || it.t0 > active.t0)) active = it;
  }
  return active;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const SPLIT = 0.62;

export interface LivePose extends BuildPose {
  moving: boolean;
  spinAngle: number;
  destination: Vec3;
  outward: Vec3;
}

const SWING_OPEN = Math.PI * 0.42;
const SLIDE_OUT = 0.42;
const Y_AXIS = v(0, 1, 0);

function openPose(it: BuildItem, targetPos: Vec3, targetQuat: Quat, open: number): BuildPose {
  if (it.motion === 'swing' && it.pivot && it.forward) {
    const turn = axisAngle(Y_AXIS, -it.forward.z * SWING_OPEN * open);
    const offset = add(it.pivot, rotate(turn, scale(it.pivot, -1)));
    return { pos: add(targetPos, rotate(targetQuat, offset)), quat: qmul(targetQuat, turn) };
  }
  return { pos: add(targetPos, scale(it.forward ?? v(0, 0, 1), SLIDE_OUT * open)), quat: targetQuat };
}

const tapped = (b: number) => {
  const k = Math.min(b, 0.9999) * 3;
  const hit = k - Math.floor(k);
  return (Math.floor(k) + (hit < 0.55 ? 0 : ease((hit - 0.55) / 0.45))) / 3;
};

export function poseAt(build: GuideBuild, it: BuildItem, x: number, explode: number): LivePose {
  let targetPos: Vec3;
  let targetQuat: Quat;
  let approach: Vec3;
  if (it.host !== null) {
    const host = poseAt(build, build.items[it.host], x, explode);
    targetPos = add(host.pos, rotate(host.quat, it.target.pos));
    targetQuat = qmul(host.quat, it.target.quat);
    approach = add(host.pos, rotate(host.quat, it.approach));
  } else {
    const ex = it.placed && it.kind === 'panel' ? scale(it.explode, explode) : v(0, 0, 0);
    targetPos = add(it.target.pos, ex);
    targetQuat = it.target.quat;
    approach = add(it.approach, ex);
  }
  const opens = it.motion === 'swing' || it.motion === 'slide';
  const ajar = opens ? openPose(it, targetPos, targetQuat, 1) : null;
  if (ajar) approach = ajar.pos;
  const outward = sub(approach, targetPos);
  if (!(x > it.t0)) return { ...it.kit, moving: false, spinAngle: 0, destination: approach, outward };
  if (x >= it.ta) return { pos: targetPos, quat: targetQuat, moving: false, spinAngle: 0, destination: targetPos, outward };
  const u = Math.min(Math.max((x - it.t0) / Math.max(it.ta - it.t0, 1e-4), 0), 1);
  if (u < SPLIT) {
    const a = ease(u / SPLIT);
    const pos = lerp3(it.kit.pos, approach, a);
    pos.y += Math.sin(Math.PI * a) * (it.kind === 'panel' ? 0.3 : 0.15);
    return { pos, quat: slerp(it.kit.quat, ajar ? ajar.quat : targetQuat, Math.min(1, a * 1.3)), moving: true, spinAngle: 0, destination: approach, outward };
  }
  const b = (u - SPLIT) / (1 - SPLIT);
  if (opens) {
    const pose = openPose(it, targetPos, targetQuat, 1 - ease(b));
    return { ...pose, moving: true, spinAngle: 0, destination: targetPos, outward };
  }
  return {
    pos: lerp3(approach, targetPos, it.kind === 'panel' ? ease(b) : it.motion === 'tap' ? tapped(b) : b),
    quat: targetQuat,
    moving: true,
    spinAngle: it.spin ? b * Math.PI * 8 : 0,
    destination: targetPos,
    outward,
  };
}
