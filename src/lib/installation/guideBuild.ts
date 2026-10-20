import type { GuidePart, InstallationGuideData, Vec3 } from './guideSchema';

export interface BuildPose {
  pos: Vec3;
  rot: Vec3;
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
  target: BuildPose;
  spin: boolean;
  placed: boolean;
  weight: number;
  explode: Vec3;
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
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: Vec3, k: number): Vec3 => v(a.x * k, a.y * k, a.z * k);
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

type Axis = 'x' | 'y' | 'z';
const smallestAxis = (s: Vec3): Axis => (s.x <= s.y && s.x <= s.z ? 'x' : s.y <= s.z ? 'y' : 'z');
const flatRot = (s: Vec3): Vec3 => {
  const a = smallestAxis(s);
  return a === 'x' ? v(0, 0, Math.PI / 2) : a === 'z' ? v(-Math.PI / 2, 0, 0) : v(0, 0, 0);
};
const flatFootprint = (s: Vec3): { w: number; d: number; h: number } => {
  const a = smallestAxis(s);
  if (a === 'x') return { w: s.y, d: s.z, h: s.x };
  if (a === 'z') return { w: s.x, d: s.y, h: s.z };
  return { w: s.x, d: s.z, h: s.y };
};
const hardwareAlong = (panel: Vec3): Vec3 => {
  const a = smallestAxis(panel);
  return a === 'x' ? v(0, 0, Math.PI / 2) : a === 'z' ? v(Math.PI / 2, 0, 0) : v(0, 0, 0);
};

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
  const length = Math.min(Math.max(sorted[0], 0.8), 30) * M;
  const radius = Math.min(Math.max(sorted[1] / 2, 0.25), 6) * M;
  return v(radius * 2, length, radius * 2);
}

function bounds(boxes: Array<{ center: Vec3; size: Vec3 }>): { center: Vec3; size: Vec3 } {
  if (boxes.length === 0) return { center: v(0, 0, 0), size: v(0, 0, 0) };
  const lo = v(Infinity, Infinity, Infinity);
  const hi = v(-Infinity, -Infinity, -Infinity);
  for (const b of boxes) {
    for (const k of ['x', 'y', 'z'] as const) {
      lo[k] = Math.min(lo[k], b.center[k] - b.size[k] / 2);
      hi[k] = Math.max(hi[k], b.center[k] + b.size[k] / 2);
    }
  }
  return { center: scale(add(lo, hi), 0.5), size: v(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) };
}

function shotFor(b: { center: Vec3; size: Vec3 }, yaw: number, pitch: number, minDist = 0.9): CameraShot {
  const r = Math.max(len(b.size) / 2, 0.2);
  return { target: b.center, yaw, pitch, dist: Math.max(minDist, r * 2.3 + 0.35) };
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
  const product = hasAssembly ? bounds(placements) : productBox;

  const stepOf = new Map<string, number[]>();
  guide.steps.forEach((s, i) => {
    for (const u of s.parts_used) {
      const list = stepOf.get(u.part_id) ?? [];
      for (let k = 0; k < u.quantity; k++) list.push(Math.max(i, 1));
      stepOf.set(u.part_id, list);
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
      cursorZ += rowDepth + 0.08;
      rowDepth = 0;
    }
    const at = v(cursorX + w / 2, 0, cursorZ + d / 2);
    cursorX += w + 0.08;
    rowDepth = Math.max(rowDepth, d);
    return at;
  };

  const items: BuildItem[] = [];
  const cards: KitCard[] = [];
  const usedPlacement = new Set<number>();
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
    const steps = stepOf.get(p.id) ?? [];
    for (let k = 0; k < p.quantity; k++) {
      const pi = placements.findIndex((pl, idx) => !usedPlacement.has(idx) && pl.part_id === p.id);
      const pl = pi >= 0 ? placements[pi] : null;
      if (pi >= 0) usedPlacement.add(pi);
      const size = pl ? pl.size : scale(partSizeCm(p), M);
      const foot = flatFootprint(size);
      const kitPos = place(foot.w, foot.d);
      const step = pl ? Math.max(pl.step, 1) : steps[k] ?? stepCount;
      let target: BuildPose;
      if (pl) {
        target = { pos: pl.center, rot: v(0, 0, 0) };
      } else {
        target = { pos: add(stackAt, v(0, stackHeight + foot.h / 2, 0)), rot: flatRot(size) };
        stackHeight += foot.h + 0.01;
      }
      items.push({
        key: `${p.id}#${k}`, partId: p.id, partIndex: i, instance: k, kind: 'panel', step, t0: 0, ta: 0,
        size, kit: { pos: add(kitPos, v(0, foot.h / 2, 0)), rot: flatRot(size) }, target, spin: false,
        placed: !!pl, explode: v(0, 0, 0), weight: 1,
      });
    }
  }

  cursorX = -rowWidth / 2;
  cursorZ += rowDepth + 0.25;
  rowDepth = 0;
  const panelItems = items.filter((it) => it.kind === 'panel');
  guide.parts.forEach((p, i) => {
    if (p.kind !== 'hardware' && p.kind !== 'accessory') return;
    const shown = Math.min(p.quantity, MAX_HARDWARE_RENDERED);
    const dims = hardwareDims(p);
    const pitch = Math.max(dims.y * 1.3, 0.035);
    const cols = Math.ceil(Math.sqrt(shown));
    const rows = Math.ceil(shown / cols);
    const cardW = cols * pitch + 0.06;
    const cardD = rows * pitch + 0.1;
    const cardAt = place(cardW, cardD);
    cards.push({ partId: p.id, pos: cardAt, width: cardW, depth: cardD, label: `${p.quantity}x`, code: p.code });
    const uses = guide.steps.flatMap((s, si) => s.parts_used.filter((u) => u.part_id === p.id).map((u) => ({ ...u, step: Math.max(si, 1) })));
    let unit = 0;
    for (const use of uses) {
      const host = panelItems.filter((it) => it.partId === use.fixes_to && it.placed);
      const fallbackHost = panelItems.filter((it) => it.step === use.step && it.placed);
      const hosts = host.length ? host : fallbackHost;
      for (let k = 0; k < use.quantity && unit < shown; k++, unit++) {
        const c = unit % cols;
        const r = Math.floor(unit / cols);
        const kitPos = add(cardAt, v((c - (cols - 1) / 2) * pitch, dims.x / 2 + 0.002, (r - (rows - 1) / 2) * pitch));
        let target: BuildPose;
        if (hosts.length && hasAssembly) {
          const h = hosts[k % hosts.length];
          const local = Math.floor(k / hosts.length);
          const per = Math.max(1, Math.ceil(use.quantity / hosts.length));
          const axis = smallestAxis(h.size);
          const longAxis: Axis = (['x', 'y', 'z'] as const).filter((a) => a !== axis).sort((a, b) => h.size[b] - h.size[a])[0];
          const otherAxis: Axis = (['x', 'y', 'z'] as const).find((a) => a !== axis && a !== longAxis)!;
          const pos = { ...h.target.pos };
          pos[longAxis] += ((local + 0.5) / per - 0.5) * h.size[longAxis] * 0.9;
          pos[otherAxis] += (local % 2 === 0 ? 0.38 : -0.38) * h.size[otherAxis];
          const toward = -Math.sign(h.target.pos[axis] - product.center[axis]) || 1;
          pos[axis] += toward * (h.size[axis] / 2 + dims.y * 0.15);
          target = { pos, rot: hardwareAlong(h.size) };
        } else {
          target = { pos: add(stackAt, v(0.25 + (unit % 6) * 0.04, dims.x / 2, -0.2 + Math.floor(unit / 6) * 0.04)), rot: v(0, 0, Math.PI / 2) };
        }
        items.push({
          key: `${p.id}#${unit}`, partId: p.id, partIndex: i, instance: unit, kind: 'hardware', step: use.step,
          t0: 0, ta: 0, size: dims, kit: { pos: kitPos, rot: v(0, 0, Math.PI / 2) }, target,
          spin: /screw|cam|bolt|lock/i.test(p.name), placed: hasAssembly && hosts.length > 0, explode: v(0, 0, 0), weight: 1,
        });
      }
    }
    for (; unit < shown; unit++) {
      const c = unit % cols;
      const r = Math.floor(unit / cols);
      const kitPos = add(cardAt, v((c - (cols - 1) / 2) * pitch, dims.x / 2 + 0.002, (r - (rows - 1) / 2) * pitch));
      items.push({
        key: `${p.id}#${unit}`, partId: p.id, partIndex: i, instance: unit, kind: 'hardware', step: stepCount + 1,
        t0: Infinity, ta: Infinity, size: dims, kit: { pos: kitPos, rot: v(0, 0, Math.PI / 2) },
        target: { pos: kitPos, rot: v(0, 0, Math.PI / 2) }, spin: false, placed: false, explode: v(0, 0, 0), weight: 0,
      });
    }
    const used = uses.reduce((n, u) => n + u.quantity, 0);
    const rendered = items.filter((it) => it.partId === p.id && it.weight > 0);
    for (const it of rendered) it.weight = used / rendered.length;
  });

  for (let s = 1; s <= stepCount; s++) {
    const group = items.filter((it) => it.step === s)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'panel' ? -1 : 1));
    const n = group.length;
    group.forEach((it, idx) => {
      const travel = Math.min(0.45, Math.max(0.08, (0.9 / Math.max(n, 1)) * 2.2));
      it.t0 = s - 1 + 0.05 + (0.9 - travel) * (n > 1 ? idx / (n - 1) : 0);
      it.ta = Math.min(it.t0 + travel, s - 0.02);
    });
  }
  for (const it of items) {
    const raw = v(it.target.pos.x - product.center.x, it.target.pos.y - product.center.y, it.target.pos.z - product.center.z);
    const d = v(raw.x, raw.y, raw.z < 0 ? raw.z * 0.25 : raw.z);
    const l = len(d) || 1;
    const k = (it.kind === 'hardware' ? 0.5 : 0.35) * Math.max(product.size.x, product.size.y, product.size.z, 0.5);
    it.explode = scale(d, k / l);
  }

  const kitBoxes = items.map((it) => ({ center: it.kit.pos, size: it.size }));
  const kitBounds = bounds([...kitBoxes, ...cards.map((c) => ({ center: c.pos, size: v(c.width, 0.01, c.depth) }))]);
  const cameras: CameraShot[] = guide.steps.map((_, s) => {
    if (s === 0) return shotFor(bounds([kitBounds, product]), -0.45, 0.62, 1.4);
    const group = items.filter((it) => it.step === s);
    if (group.length === 0) return shotFor(product, -0.5, 0.42);
    const b = bounds(group.flatMap((it) => [{ center: it.target.pos, size: it.size }]));
    const shot = shotFor(b, -0.5 + (s % 2 ? 0.1 : -0.1), 0.42);
    const whole = shotFor(product, -0.5, 0.42);
    return { ...shot, target: { x: (b.center.x + product.center.x) / 2, y: (b.center.y + product.center.y) / 2, z: (b.center.z + product.center.z) / 2 }, dist: Math.max(shot.dist, whole.dist * 0.85) };
  });

  return {
    items,
    cards,
    steps: stepCount,
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

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function poseAt(it: BuildItem, x: number, explode: number): BuildPose & { moving: boolean; spinAngle: number } {
  const ex = scale(it.explode, explode);
  if (!(x > it.t0)) return { ...it.kit, moving: false, spinAngle: 0 };
  if (x >= it.ta) {
    return { pos: add(it.target.pos, it.placed ? ex : v(0, 0, 0)), rot: it.target.rot, moving: false, spinAngle: 0 };
  }
  const u = ease((x - it.t0) / Math.max(it.ta - it.t0, 1e-4));
  const arc = Math.sin(Math.PI * u) * (it.kind === 'panel' ? 0.35 : 0.18);
  const pos = v(
    it.kit.pos.x + (it.target.pos.x - it.kit.pos.x) * u,
    it.kit.pos.y + (it.target.pos.y - it.kit.pos.y) * u + arc,
    it.kit.pos.z + (it.target.pos.z - it.kit.pos.z) * u,
  );
  const rot = v(
    it.kit.rot.x + (it.target.rot.x - it.kit.rot.x) * u,
    it.kit.rot.y + (it.target.rot.y - it.kit.rot.y) * u,
    it.kit.rot.z + (it.target.rot.z - it.kit.rot.z) * u,
  );
  const spinAngle = it.spin && u > 0.6 ? ((u - 0.6) / 0.4) * Math.PI * 6 : 0;
  return { pos, rot, moving: true, spinAngle };
}
