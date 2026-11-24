// GENERATED MIRROR of src/lib/scene/kitchenComposition.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

interface ZoneModuleRow { id: string; type: string; width_cm: number; qty: number; options?: Record<string, string> }
interface ZoneConfig { enabled?: boolean; globals?: Record<string, number | string | string[]>; modules?: ZoneModuleRow[]; length_m?: number; appliances?: unknown[] }
export type RoomComposition = Record<string, ZoneConfig>;

export type RunZone = 'base' | 'wall' | 'tall' | 'island';

export interface RunModule { type: string; width_mm: number; options?: Record<string, string>; printed?: boolean }

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

export function assemblyPiecesOf(
  o: Pick<KitchenObject, 'kind' | 'width_mm' | 'depth_mm' | 'height_mm' | 'kitchen_layout'> & { label: string },
  build: { plinth_mm: number; front_mm: number; worktop_mm: number },
): Array<KitchenPiece & { stated: boolean; where: string }> {
  const modules = runModulesOf(o).filter((m) => m.type !== 'gap');
  return kitchenPieces(o, build).map((p, i) => ({ ...p, stated: modules[i] ? unitStated(o.kitchen_layout, modules[i]) : false, where: `${o.label} #${i + 1}` }));
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

export function unitStated(layout: KitchenLayout | null | undefined, m: PlacedModule): boolean {
  if (m.auto || !layout?.modules?.length) return false;
  return layout.source !== 'read' || layout.confirmed === true || m.printed === true;
}

export function runShortfall(o: Pick<KitchenObject, 'kind' | 'width_mm' | 'height_mm' | 'kitchen_layout'>): { from_mm: number; to_mm: number } | null {
  const built = runModulesOf(o).filter((m) => !m.auto);
  const end = built.reduce((x, m) => Math.max(x, m.x_mm + m.width_mm), 0);
  return built.length && o.width_mm - end > MAX_FILLER_MM ? { from_mm: end, to_mm: o.width_mm } : null;
}

export interface DrawingCheck { rule: string; ok: boolean; detail: string }

const STANDARD_APPLIANCE_MM: Record<string, number[]> = { dishwasher_housing: [450, 600], oven_base: [600], oven_housing: [600], fridge_housing: [600, 700, 900], extractor: [600, 900] };

export function drawingChecks(runs: Array<Pick<KitchenObject, 'kind' | 'width_mm' | 'height_mm' | 'kitchen_layout'> & { label: string; elevation_mm?: number; x_mm: number; y_mm: number; rotation_deg: number; depth_mm: number }>): DrawingCheck[] {
  const kitchen = runs.filter((r) => KITCHEN_KINDS.has(r.kind));
  if (!kitchen.length) return [];
  const out: DrawingCheck[] = [];
  const add = (rule: string, bad: string[], good: string) => out.push({ rule, ok: !bad.length, detail: bad.length ? bad.join(' ') : good });
  const cmOf = (n: number) => `${Math.round(n / 10)}`;

  const unconfirmed = kitchen.filter((r) => r.kitchen_layout?.source === 'read' && !r.kitchen_layout.confirmed).map((r) => r.label);
  const auto = kitchen.filter((r) => !r.kitchen_layout?.modules?.length).map((r) => r.label);
  add('Units confirmed by a person', [
    ...(unconfirmed.length ? [`Read from the drawing, not confirmed: ${unconfirmed.join(', ')}.`] : []),
    ...(auto.length ? [`Laid out automatically, no unit stated: ${auto.join(', ')}.`] : []),
  ], 'Every run was laid out or confirmed by a person.');

  const assumed = kitchen.flatMap((r) => runModulesOf(r).filter((m) => m.type !== 'gap' && m.type !== 'end_panel' && !unitStated(r.kitchen_layout, m))
    .map((m) => `${r.label}: ${MODULE_LABELS[m.type] ?? m.type} ≈${cmOf(m.width_mm)}`));
  add('Every width is stated', assumed.length ? [`Assumed, drawn grey with ≈: ${assumed.slice(0, 12).join('; ')}${assumed.length > 12 ? '…' : ''}.`] : [], 'Every unit width was printed or confirmed.');

  const open = kitchen.map((r) => ({ r, gap: runShortfall(r) })).filter((x) => x.gap).map(({ r, gap }) => `${r.label}: ${cmOf(gap!.to_mm - gap!.from_mm)} cm not covered by units (hatched red).`);
  const refused = kitchen.flatMap((r) => {
    const ctx = runContext(r);
    const stored = r.kitchen_layout?.modules;
    return ctx && stored?.length ? placeRun(stored, { ...ctx, behind: [] }).rejected.map((x) => `${r.label}: ${x.reason}`) : [];
  });
  add('Every chain closes on its run', [...open, ...refused], 'The units of every run add up to its length.');

  const odd = kitchen.flatMap((r) => runModulesOf(r).filter((m) => STANDARD_APPLIANCE_MM[m.type] && !STANDARD_APPLIANCE_MM[m.type].includes(m.width_mm))
    .map((m) => `${r.label}: ${MODULE_LABELS[m.type]} ${cmOf(m.width_mm)} cm (usual ${STANDARD_APPLIANCE_MM[m.type].map(cmOf).join(' or ')}).`));
  add('Appliances fit a standard opening', odd, 'Every appliance space is a standard width.');

  const heightBad = kitchen.flatMap((r) => {
    const z = zoneOfKind(r.kind);
    if ((z === 'base' || z === 'island') && (r.height_mm < 820 || r.height_mm > 960)) return [`${r.label}: worktop at ${cmOf(r.height_mm)} cm.`];
    if (z === 'wall' && (r.elevation_mm ?? 0) < 1300) return [`${r.label}: wall units start ${cmOf(r.elevation_mm ?? 0)} cm above the floor.`];
    return [];
  });
  add('Heights are buildable', heightBad, 'Worktop and wall-unit heights are within the usual range.');

  const axis = (r: { rotation_deg: number }) => { const a = (r.rotation_deg * Math.PI) / 180; return [Math.cos(a), Math.sin(a)] as const; };
  const floating = kitchen.filter((w) => w.kind === 'kitchen_wall').filter((w) => {
    const [ax, ay] = axis(w);
    const c = w.x_mm * ax + w.y_mm * ay;
    return !kitchen.some((b) => (zoneOfKind(b.kind) === 'base') && Math.abs(((b.rotation_deg - w.rotation_deg) % 360 + 360) % 360) < 3
      && Math.hypot(b.x_mm - w.x_mm, b.y_mm - w.y_mm) < Math.max(b.width_mm, w.width_mm)
      && Math.abs((b.x_mm * ax + b.y_mm * ay) - c) < (b.width_mm + w.width_mm) / 2);
  }).map((w) => `${w.label} has no base run beneath it on the same wall.`);
  add('Wall units sit over a base run', floating, 'Every wall run stands over a base run.');
  return out;
}

export type ServiceKey = 'socket' | 'socket_dedicated' | 'water_in' | 'waste_out' | 'gas_point' | 'duct_run' | 'carbon_filter';
export type ServiceTone = 'stated' | 'assumed';
export interface ServicePoint { key: ServiceKey; x_mm: number; height_mm: number; serves: string; note: string; tone: ServiceTone; height_tone: ServiceTone }
export interface RunServices { label: string; kind: string; width_mm: number; points: ServicePoint[] }

type ServiceRule = { key: ServiceKey; height_mm: number; at: 'centre' | 'beside' | 'sink' | 'top'; note: string };

export const SERVICE_DEFAULTS: Record<string, ServiceRule[]> = {
  sink_base: [{ key: 'water_in', height_mm: 500, at: 'centre', note: 'Hot and Cold' }, { key: 'waste_out', height_mm: 400, at: 'centre', note: 'Sink Trap' }],
  dishwasher_housing: [
    { key: 'socket_dedicated', height_mm: 300, at: 'beside', note: 'Behind the Next Unit' },
    { key: 'water_in', height_mm: 500, at: 'sink', note: 'Cold Valve' },
    { key: 'waste_out', height_mm: 400, at: 'sink', note: 'Onto the Sink Trap' },
  ],
  oven_base: [{ key: 'socket_dedicated', height_mm: 1100, at: 'beside', note: 'Cooker Circuit Isolator' }],
  oven_base_gas: [{ key: 'gas_point', height_mm: 500, at: 'centre', note: 'Hob Gas Valve' }, { key: 'socket', height_mm: 300, at: 'beside', note: 'Ignition' }],
  oven_housing: [{ key: 'socket_dedicated', height_mm: 1100, at: 'beside', note: 'Oven Circuit Isolator' }],
  fridge_housing: [{ key: 'socket', height_mm: 300, at: 'beside', note: 'Behind the Next Unit' }],
  appliance_base: [{ key: 'socket', height_mm: 300, at: 'beside', note: 'Appliance Not Stated' }],
  extractor: [{ key: 'socket', height_mm: 2000, at: 'centre', note: 'Above the Hood' }, { key: 'duct_run', height_mm: 0, at: 'top', note: 'To Ceiling or Outside Wall' }],
  extractor_recirculating: [{ key: 'socket', height_mm: 2000, at: 'centre', note: 'Above the Hood' }, { key: 'carbon_filter', height_mm: 0, at: 'top', note: 'Recirculating' }],
};

export const WORKTOP_SOCKETS = { height_mm: 1100, spacing_mm: 1200, clear_mm: 300, beside_mm: 300, note: 'Double Socket' } as const;
const DEFAULT_WALL_TOP_MM = 2150;
const WET_OR_HOT = new Set(['sink_base', 'oven_base']);
const NOT_A_UNIT = new Set(['gap', 'filler', 'end_panel']);

const serviceVariant = (m: RunModule) =>
  m.type === 'oven_base' && m.options?.fuel === 'gas' ? 'oven_base_gas'
    : m.type === 'extractor' && m.options?.extraction === 'recirculation' ? 'extractor_recirculating' : m.type;

type ServiceRun = Pick<KitchenObject, 'kind' | 'width_mm' | 'height_mm' | 'kitchen_layout'> & { label: string; elevation_mm?: number };

export function runServicePoints(r: ServiceRun): ServicePoint[] {
  if (!KITCHEN_KINDS.has(r.kind)) return [];
  const solid = runModulesOf(r).filter((m) => !NOT_A_UNIT.has(m.type));
  const stated = (m: PlacedModule): ServiceTone => (unitStated(r.kitchen_layout, m) ? 'stated' : 'assumed');
  const centre = (m: PlacedModule) => m.x_mm + m.width_mm / 2;
  const sink = solid.find((m) => m.type === 'sink_base');
  const points: ServicePoint[] = [];
  for (const [i, m] of solid.entries()) {
    for (const rule of SERVICE_DEFAULTS[serviceVariant(m)] ?? []) {
      let x = centre(m);
      let tone = stated(m);
      if (rule.at === 'beside') {
        const next = [solid[i - 1], solid[i + 1]].filter((n): n is PlacedModule => !!n);
        const pick = next.find((n) => !SERVICE_DEFAULTS[n.type]) ?? next[0];
        x = pick ? centre(pick) : m.x_mm + m.width_mm + WORKTOP_SOCKETS.beside_mm;
        if (pick && stated(pick) === 'assumed') tone = 'assumed';
      } else if (rule.at === 'sink' && sink) {
        x = sink.x_mm < m.x_mm ? sink.x_mm + sink.width_mm - 100 : sink.x_mm + 100;
        if (stated(sink) === 'assumed') tone = 'assumed';
      }
      const height = rule.at === 'top' ? (r.elevation_mm ? r.elevation_mm + r.height_mm : DEFAULT_WALL_TOP_MM) : rule.height_mm;
      points.push({ key: rule.key, x_mm: Math.round(x), height_mm: height, serves: MODULE_LABELS[m.type] ?? m.type, note: rule.note, tone, height_tone: 'assumed' });
    }
  }
  if (zoneOfKind(r.kind) === 'base') {
    const blocked = solid.filter((m) => WET_OR_HOT.has(m.type)).map((m) => [m.x_mm - WORKTOP_SOCKETS.clear_mm, m.x_mm + m.width_mm + WORKTOP_SOCKETS.clear_mm]);
    let last = -Infinity;
    for (let x = 150; x <= r.width_mm - 150; x += 50) {
      const under = solid.find((m) => x >= m.x_mm && x <= m.x_mm + m.width_mm);
      if (!under || blocked.some(([a, b]) => x > a && x < b) || x - last < WORKTOP_SOCKETS.spacing_mm) continue;
      last = x;
      points.push({ key: 'socket', x_mm: x, height_mm: WORKTOP_SOCKETS.height_mm, serves: 'Worktop', note: WORKTOP_SOCKETS.note, tone: stated(under), height_tone: 'assumed' });
    }
  }
  return points.sort((a, b) => a.x_mm - b.x_mm);
}

export function servicePoints(runs: ServiceRun[]): RunServices[] {
  return runs.filter((r) => KITCHEN_KINDS.has(r.kind)).map((r) => ({ label: r.label, kind: r.kind, width_mm: r.width_mm, points: runServicePoints(r) }));
}

export function serviceCounts(runs: ServiceRun[]): Partial<Record<ServiceKey, number>> {
  const out: Partial<Record<ServiceKey, number>> = {};
  for (const p of servicePoints(runs).flatMap((r) => r.points)) out[p.key] = (out[p.key] ?? 0) + 1;
  return out;
}

export function serviceChecks(runs: ServiceRun[]): DrawingCheck[] {
  const kitchen = runs.filter((r) => KITCHEN_KINDS.has(r.kind));
  if (!kitchen.length) return [];
  const out: DrawingCheck[] = [];
  const add = (rule: string, bad: string[], good: string) => out.push({ rule, ok: !bad.length, detail: bad.length ? bad.join(' ') : good });
  const cmOf = (n: number) => `${Math.round(n / 10)}`;
  const all = kitchen.map((r) => ({ r, solid: runModulesOf(r).filter((m) => !NOT_A_UNIT.has(m.type)), points: runServicePoints(r) }));

  const missing = all.flatMap(({ r, solid, points }) => solid.flatMap((m) => {
    if (m.type === 'appliance_base') return [`${r.label}: the Appliance Space at ${cmOf(m.x_mm)} cm does not say which appliance, so only a socket is drawn.`];
    const label = MODULE_LABELS[m.type] ?? m.type;
    const lacking = (SERVICE_DEFAULTS[serviceVariant(m)] ?? []).filter((rule) => !points.some((p) => p.key === rule.key && p.serves === label)).map((rule) => rule.key);
    return lacking.length ? [`${r.label}: ${label} has no ${lacking.join(', ')}.`] : [];
  }));
  add('Every Appliance Has Its Connections', missing, 'Every appliance has its power, water, waste and extraction drawn.');

  const close = all.flatMap(({ r, solid, points }) => {
    const hot = solid.filter((m) => WET_OR_HOT.has(m.type));
    return points.filter((p) => (p.key === 'socket' || p.key === 'socket_dedicated') && p.height_mm >= 850 && p.height_mm < 1500)
      .flatMap((p) => hot.filter((m) => p.x_mm > m.x_mm - WORKTOP_SOCKETS.clear_mm && p.x_mm < m.x_mm + m.width_mm + WORKTOP_SOCKETS.clear_mm)
        .map((m) => `${r.label}: ${p.note} at ${cmOf(p.x_mm)} cm is within ${cmOf(WORKTOP_SOCKETS.clear_mm)} cm of the ${MODULE_LABELS[m.type]}.`));
  });
  add('Sockets Clear of Sink and Hob', close, `Every socket above the worktop is at least ${cmOf(WORKTOP_SOCKETS.clear_mm)} cm from the sink and hob.`);

  const drains = all.flatMap(({ r, solid }) => solid.filter((m) => m.type === 'dishwasher_housing').flatMap((d) => {
    const sinks = solid.filter((m) => m.type === 'sink_base');
    if (!sinks.length) return [`${r.label}: the dishwasher has no sink on its run to drain into.`];
    const gap = Math.min(...sinks.map((s) => Math.max(0, s.x_mm - (d.x_mm + d.width_mm), d.x_mm - (s.x_mm + s.width_mm))));
    return gap > 600 ? [`${r.label}: the dishwasher is ${cmOf(gap)} cm from the sink; its waste should run no further than one unit.`] : [];
  }));
  add('Dishwasher Drains Beside the Sink', drains, 'Every dishwasher sits within one unit of a sink.');

  const bare = all.filter(({ r, points }) => zoneOfKind(r.kind) === 'base' && r.width_mm >= WORKTOP_SOCKETS.spacing_mm && !points.some((p) => p.serves === 'Worktop'))
    .map(({ r }) => `${r.label}: no place on the worktop is ${cmOf(WORKTOP_SOCKETS.clear_mm)} cm clear of the sink and hob for a socket.`);
  add('Worktop Has Sockets', bare, 'Every base run has worktop sockets clear of the sink and hob.');

  const assumed = all.reduce((n, x) => n + x.points.filter((p) => p.height_tone === 'assumed').length, 0);
  add('Heights Confirmed by a Person', assumed ? [`${assumed} service heights are trade defaults (drawn grey with ≈); expected until the electrician or plumber confirms them on site.`] : [], 'Every service height was set by a person.');
  return out;
}
