// GENERATED MIRROR of src/lib/scene/kitchenComposition.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

interface ZoneModuleRow { id: string; type: string; width_cm: number; qty: number; options?: Record<string, string> }
interface ZoneConfig { enabled?: boolean; globals?: Record<string, number | string | string[]>; modules?: ZoneModuleRow[]; length_m?: number; appliances?: unknown[] }
export type RoomComposition = Record<string, ZoneConfig>;

export type RunZone = 'base' | 'wall' | 'tall' | 'island';

export interface RunModule { type: string; width_mm: number; options?: Record<string, string> }

export interface KitchenLayout { modules: RunModule[]; seating_mm?: number; source?: 'read'; confirmed?: boolean }

export interface KitchenObject {
  id: string; kind: string; width_mm: number; depth_mm: number; height_mm: number;
  removed_at?: string | null; kitchen_layout?: KitchenLayout | null;
}

export const KITCHEN_KINDS = new Set(['kitchen_base', 'sink', 'kitchen_wall', 'kitchen_tall', 'island']);

const ZONE_OF: Record<string, RunZone> = {
  kitchen_base: 'base', sink: 'base', kitchen_wall: 'wall', kitchen_tall: 'tall', island: 'island',
};

export const zoneOfKind = (kind: string): RunZone | null => ZONE_OF[kind] ?? null;

export const ZONE_MODULES: Record<RunZone, readonly string[]> = {
  base: ['door1', 'door2', 'drawers', 'sink_base', 'corner', 'waste_base', 'dishwasher_housing', 'oven_base', 'appliance_base', 'end_panel', 'filler', 'gap'],
  island: ['door2', 'drawers', 'sink_base', 'end_panel', 'filler', 'gap'],
  wall: ['door1', 'door2', 'lift_up', 'extractor', 'open_shelf', 'filler', 'gap'],
  tall: ['larder', 'oven_housing', 'fridge_housing', 'filler', 'gap'],
};

export const MODULE_LABELS: Record<string, string> = {
  door1: '1-Door Unit', door2: '2-Door Unit', drawers: 'Drawer Bank', sink_base: 'Sink Base', corner: 'Corner Unit',
  waste_base: 'Waste Bin Unit', dishwasher_housing: 'Dishwasher Housing', oven_base: 'Under-Worktop Oven',
  appliance_base: 'Appliance Space', end_panel: 'End Panel', filler: 'Filler', gap: 'Empty Space', lift_up: 'Lift-Up Unit',
  extractor: 'Extractor Housing', open_shelf: 'Open Shelf', larder: 'Larder', oven_housing: 'Oven Housing', fridge_housing: 'Fridge Housing',
};

export const KITCHEN_MODULE_TYPES = [
  'door1', 'door2', 'drawers', 'sink_base', 'corner', 'waste_base', 'dishwasher_housing', 'oven_base', 'appliance_base', 'end_panel',
  'filler', 'gap', 'lift_up', 'extractor', 'open_shelf', 'larder', 'oven_housing', 'fridge_housing',
] as const;

const END_PANEL_MM = 18;
const MIN_UNIT_MM = 150;
const MAX_UNIT_MM = 1200;
const MAX_FILLER_MM = 150;
const UNIT_WIDTHS = [900, 800, 600, 500, 450, 400, 300];

export interface RunSpan { kind: 'door' | 'window' | 'opening'; from_mm: number; to_mm: number; sill_mm: number; head_mm: number }

export interface RunContext {
  zone: RunZone;
  width_mm: number;
  bottom_mm: number;
  top_mm: number;
  behind?: RunSpan[];
}

export interface PlacedModule extends RunModule { x_mm: number; auto?: boolean }
export interface Placement { built: PlacedModule[]; rejected: Array<{ module: RunModule; reason: string }>; issues: string[] }

const label = (t: string) => MODULE_LABELS[t] ?? t;
const mm = (n: number) => `${Math.round(n / 10)} cm`;

/** The only writer of a run's units: each is built or refused with its rule; only a small remainder is filled. */
export function placeRun(modules: RunModule[], ctx: RunContext): Placement {
  const built: PlacedModule[] = [];
  const rejected: Placement['rejected'] = [];
  const issues: string[] = [];
  const allowed = ZONE_MODULES[ctx.zone];
  const behind = ctx.behind ?? [];
  let x = 0;
  modules.forEach((m, i) => {
    const width = m.type === 'end_panel' ? END_PANEL_MM : Math.round(m.width_mm);
    const reject = (reason: string) => rejected.push({ module: m, reason });
    if (!allowed.includes(m.type)) return reject(`${label(m.type)} cannot go in ${ctx.zone === 'island' ? 'an island' : `a ${ctx.zone} run`}.`);
    if (m.type === 'filler' && (width < 1 || width > MAX_FILLER_MM)) return reject(`A filler is 1–${MAX_FILLER_MM / 10} cm; ${mm(width)} is a unit.`);
    if (!['filler', 'gap', 'end_panel'].includes(m.type) && (width < MIN_UNIT_MM || width > MAX_UNIT_MM)) {
      return reject(`${label(m.type)} at ${mm(width)}: units are ${MIN_UNIT_MM / 10}–${MAX_UNIT_MM / 10} cm wide.`);
    }
    if (x + width > ctx.width_mm + 1) return reject(`${label(m.type)} (${mm(width)}) does not fit: ${mm(Math.max(0, ctx.width_mm - x))} of the run is left.`);
    if (m.type === 'corner' && i !== 0 && i !== modules.length - 1) return reject('A corner unit goes at one end of a run.');
    if (m.type !== 'gap') {
      for (const s of behind) {
        const across = x < s.to_mm && x + width > s.from_mm;
        const upDown = ctx.bottom_mm < s.head_mm && ctx.top_mm > s.sill_mm;
        if (!across || !upDown) continue;
        if (s.kind === 'door' || s.kind === 'opening') return reject(`${label(m.type)} would block the ${s.kind} behind it.`);
        if (ctx.zone !== 'base' && ctx.zone !== 'island') return reject(`${label(m.type)} would cover the window behind it.`);
        issues.push(`The worktop stands above the window sill behind ${label(m.type)}.`);
      }
    }
    built.push({ ...m, width_mm: width, x_mm: x });
    x += width;
  });
  const left = Math.round(ctx.width_mm - x);
  if (left > 0 && left <= MAX_FILLER_MM && built.length) built.push({ type: 'filler', width_mm: left, x_mm: x, auto: true });
  else if (left > MAX_FILLER_MM) issues.push(`${mm(left)} of the run is empty.`);
  const sink = built.findIndex((b) => b.type === 'sink_base');
  const dishwasher = built.findIndex((b) => b.type === 'dishwasher_housing');
  if (sink >= 0 && dishwasher >= 0 && Math.abs(sink - dishwasher) !== 1) issues.push('The dishwasher is not next to the sink, so its waste runs further.');
  return { built, rejected, issues: Array.from(new Set(issues)) };
}

function fillWidths(len: number): number[] {
  const step = 50;
  const n = Math.floor(len / step);
  const units = UNIT_WIDTHS.map((w) => w / step);
  const best: Array<number[] | null> = Array(n + 1).fill(null);
  best[0] = [];
  for (let i = 1; i <= n; i++) {
    for (const u of units) {
      const prev = i - u >= 0 ? best[i - u] : null;
      if (prev && (!best[i] || prev.length + 1 < best[i]!.length)) best[i] = [...prev, u * step];
    }
  }
  for (let i = n; i >= 0; i--) if (best[i]) return [...best[i]!].sort((a, b) => b - a);
  return [];
}

export function autoLayout(kind: string, ctx: RunContext): RunModule[] {
  const out: RunModule[] = [];
  const unit = (w: number): string => {
    if (ctx.zone === 'tall') return 'larder';
    if (ctx.zone === 'island') return w >= 600 ? 'door2' : 'drawers';
    return w >= 600 ? 'door2' : 'door1';
  };
  const fill = (len: number, first?: string) => {
    fillWidths(len).forEach((w, i) => out.push({ type: i === 0 && first && w >= 400 ? first : unit(w), width_mm: w }));
  };
  if (ctx.zone === 'wall') {
    const blocked = (ctx.behind ?? [])
      .filter((s) => ctx.bottom_mm < s.head_mm && ctx.top_mm > s.sill_mm)
      .map((s) => [Math.max(0, s.from_mm), Math.min(ctx.width_mm, s.to_mm)] as [number, number])
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    const used = () => out.reduce((s, m) => s + m.width_mm, 0);
    for (const [a, b] of blocked) {
      if (a > used()) fill(a - used());
      if (b > used()) out.push({ type: 'gap', width_mm: Math.round(b - used()) });
    }
    fill(ctx.width_mm - used());
    return out;
  }
  let len = ctx.width_mm;
  if (ctx.zone === 'island') { out.push({ type: 'end_panel', width_mm: END_PANEL_MM }); len -= 2 * END_PANEL_MM; }
  if (kind === 'sink' && len >= 600) {
    const sinkW = len >= 900 ? 900 : len >= 800 ? 800 : 600;
    out.push({ type: 'sink_base', width_mm: sinkW });
    len -= sinkW;
    if (len >= 600) { out.push({ type: 'dishwasher_housing', width_mm: 600 }); len -= 600; }
    fill(len);
  } else {
    fill(len, ctx.zone === 'tall' ? undefined : 'drawers');
  }
  if (ctx.zone === 'island') out.push({ type: 'end_panel', width_mm: END_PANEL_MM });
  return out;
}

export function runContext(o: Pick<KitchenObject, 'kind' | 'width_mm' | 'height_mm'> & { elevation_mm?: number }, behind: RunSpan[] = []): RunContext | null {
  const zone = ZONE_OF[o.kind];
  if (!zone) return null;
  const bottom = o.elevation_mm ?? 0;
  return { zone, width_mm: o.width_mm, bottom_mm: bottom, top_mm: bottom + o.height_mm, behind };
}

export function runModulesOf(o: Pick<KitchenObject, 'kind' | 'width_mm' | 'height_mm' | 'kitchen_layout'> & { elevation_mm?: number }): PlacedModule[] {
  const ctx = runContext(o);
  if (!ctx) return [];
  const stored = o.kitchen_layout?.modules;
  return placeRun(stored && stored.length ? stored : autoLayout(o.kind, ctx), { ...ctx, behind: [] }).built;
}

export interface WallLike { x1_mm: number; y1_mm: number; x2_mm: number; y2_mm: number; thickness_mm: number }
export interface OpeningLike { wall_id: string; kind: string; offset_mm: number; width_mm: number; sill_mm: number; head_mm: number }

export function spansBehind(
  o: { x_mm: number; y_mm: number; rotation_deg: number; width_mm: number; depth_mm: number },
  walls: Array<WallLike & { id: string }>,
  openings: OpeningLike[],
): RunSpan[] {
  const r = (o.rotation_deg * Math.PI) / 180;
  const axis: [number, number] = [Math.cos(r), Math.sin(r)];
  const front: [number, number] = [-Math.sin(r), Math.cos(r)];
  const spans: RunSpan[] = [];
  for (const op of openings) {
    const w = walls.find((x) => x.id === op.wall_id);
    if (!w) continue;
    const dx = w.x2_mm - w.x1_mm;
    const dy = w.y2_mm - w.y1_mm;
    const len = Math.hypot(dx, dy) || 1;
    const u: [number, number] = [dx / len, dy / len];
    if (Math.abs(u[0] * axis[0] + u[1] * axis[1]) < 0.95) continue;
    const at = (d: number): [number, number] => [w.x1_mm + u[0] * d - o.x_mm, w.y1_mm + u[1] * d - o.y_mm];
    const mid = at(op.offset_mm + op.width_mm / 2);
    const back = mid[0] * front[0] + mid[1] * front[1];
    if (back > -o.depth_mm / 2 + 150 || back < -o.depth_mm / 2 - w.thickness_mm - 250) continue;
    const t = [at(op.offset_mm), at(op.offset_mm + op.width_mm)].map((p) => p[0] * axis[0] + p[1] * axis[1] + o.width_mm / 2);
    const kind = op.kind === 'window' ? 'window' : op.kind === 'door' ? 'door' : 'opening';
    spans.push({ kind, from_mm: Math.min(t[0], t[1]), to_mm: Math.max(t[0], t[1]), sill_mm: op.sill_mm, head_mm: op.head_mm });
  }
  return spans;
}

export interface KitchenPiece {
  zone: RunZone;
  type: string;
  width_mm: number;
  x_mm: number;
  height_mm: number;
  depth_mm: number;
}

export function kitchenPieces(
  o: Pick<KitchenObject, 'kind' | 'width_mm' | 'depth_mm' | 'height_mm' | 'kitchen_layout'>,
  build: { plinth_mm: number; front_mm: number; worktop_mm: number },
): KitchenPiece[] {
  const zone = ZONE_OF[o.kind];
  if (!zone) return [];
  const floor = zone === 'base' || zone === 'island';
  const height = o.height_mm - (floor ? build.plinth_mm + build.worktop_mm : zone === 'tall' ? build.plinth_mm : 0);
  const depth = o.depth_mm - build.front_mm;
  return runModulesOf(o)
    .filter((m) => m.type !== 'gap')
    .map((m) => ({
      zone, type: m.type, width_mm: m.width_mm, x_mm: -o.width_mm / 2 + m.x_mm + m.width_mm / 2,
      height_mm: Math.max(100, height), depth_mm: Math.max(100, depth),
    }));
}

const cm = (n: number) => Math.round(n / 10);

export function kitchenCompositionFromRoom(objects: KitchenObject[], previous: RoomComposition = {}): RoomComposition {
  let seq = 1;
  const zones: Record<RunZone, { rows: ZoneModuleRow[]; height: number[]; depth: number[]; run: number }> = {
    base: { rows: [], height: [], depth: [], run: 0 }, wall: { rows: [], height: [], depth: [], run: 0 },
    tall: { rows: [], height: [], depth: [], run: 0 }, island: { rows: [], height: [], depth: [], run: 0 },
  };
  for (const o of objects) {
    if (o.removed_at || !KITCHEN_KINDS.has(o.kind)) continue;
    const z = ZONE_OF[o.kind];
    const grouped = new Map<string, ZoneModuleRow>();
    for (const m of runModulesOf(o)) {
      if (m.type === 'gap') continue;
      const key = `${m.type}:${cm(m.width_mm)}:${JSON.stringify(m.options ?? {})}`;
      const row = grouped.get(key);
      if (row) row.qty += 1;
      else grouped.set(key, { id: `room-${seq++}`, type: m.type, width_cm: cm(m.width_mm), qty: 1, ...(m.options ? { options: m.options } : {}) });
    }
    zones[z].rows.push(...grouped.values());
    zones[z].run += cm(o.width_mm);
    zones[z].height.push(z === 'base' || z === 'island' ? cm(o.height_mm) - 14 : cm(o.height_mm));
    zones[z].depth.push(cm(o.depth_mm));
  }
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const out: RoomComposition = {};
  for (const key of ['base', 'wall', 'tall', 'island'] as const) {
    const z = zones[key];
    const keep = previous[key]?.globals ?? {};
    out[key] = z.rows.length
      ? { enabled: true, modules: z.rows, globals: { ...keep, height: Math.max(30, avg(z.height)), depth: Math.max(20, avg(z.depth)) } }
      : { enabled: false, modules: [], globals: keep };
  }
  const worktop = zones.base.run / 100;
  const islandTop = zones.island.run / 100;
  out.worktop = { ...(previous.worktop ?? {}), enabled: worktop > 0, length_m: Math.round(worktop * 100) / 100 };
  out.island_worktop = { ...(previous.island_worktop ?? {}), enabled: islandTop > 0, length_m: Math.round(islandTop * 100) / 100 };
  for (const key of ['highboard', 'bar', 'appliances']) out[key] = previous[key] ?? { enabled: false };
  for (const key of Object.keys(previous)) if (!(key in out)) out[key] = previous[key];
  return out;
}

export const kitchenSignature = (objects: KitchenObject[]) =>
  objects.filter((o) => !o.removed_at && KITCHEN_KINDS.has(o.kind))
    .map((o) => `${o.id}:${o.kind}:${cm(o.width_mm)}:${cm(o.depth_mm)}:${cm(o.height_mm)}:${JSON.stringify(o.kitchen_layout ?? null)}`).sort().join('|');
