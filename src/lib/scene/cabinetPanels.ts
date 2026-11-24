/** A kitchen cabinet as the boards it is cut from (#604). One panel list feeds the 3D view, the cut list and the price. */

export type CabinetZone = 'base' | 'wall' | 'tall' | 'highboard' | 'island';

export type BoardSlot = 'carcass' | 'fronts' | 'back' | 'plinth';

export type PanelRole =
  | 'side' | 'bottom' | 'top' | 'rail' | 'back' | 'shelf' | 'plinth' | 'end_panel'
  | 'door' | 'drawer_front' | 'lift_door' | 'fixed_front'
  | 'drawer_side' | 'drawer_end' | 'drawer_bottom';

export interface CabinetConstruction {
  carcass_mm: number;
  back_mm: number;
  front_mm: number;
  plinth_mm: number;
  plinth_setback_mm: number;
  front_gap_mm: number;
  shelf_setback_mm: number;
  rail_mm: number;
  drawer_box_mm: number;
  drawer_clearance_mm: number;
}

export const DEFAULT_CONSTRUCTION: CabinetConstruction = {
  carcass_mm: 18,
  back_mm: 3,
  front_mm: 18,
  plinth_mm: 100,
  plinth_setback_mm: 50,
  front_gap_mm: 3,
  shelf_setback_mm: 20,
  rail_mm: 100,
  drawer_box_mm: 16,
  drawer_clearance_mm: 26,
};

export interface FrontRow {
  kind: 'doors' | 'drawers' | 'lift' | 'corner' | 'fixed' | 'opening' | 'open';
  count?: number;
  height_mm?: number;
  share?: number;
}

export interface ModuleRecipe {
  carcass?: boolean;
  top?: 'panel' | 'rails';
  fronts: FrontRow[];
  shelves?: number;
  end_panel?: boolean;
}

export const MODULE_RECIPES: Record<string, ModuleRecipe> = {
  door1: { fronts: [{ kind: 'doors', count: 1 }], shelves: 1 },
  door2: { fronts: [{ kind: 'doors', count: 2 }], shelves: 1 },
  drawers: { fronts: [{ kind: 'drawers', count: 3 }], shelves: 0 },
  sink_base: { top: 'rails', fronts: [{ kind: 'doors', count: 2 }], shelves: 0 },
  corner: { fronts: [{ kind: 'corner', count: 1 }], shelves: 1 },
  waste_base: { fronts: [{ kind: 'drawers', count: 1 }], shelves: 0 },
  end_panel: { carcass: false, end_panel: true, fronts: [] },
  filler: { carcass: false, fronts: [{ kind: 'fixed', count: 1 }] },
  dishwasher_housing: { carcass: false, fronts: [{ kind: 'fixed', count: 1 }] },
  oven_base: { fronts: [{ kind: 'drawers', count: 1, height_mm: 120 }, { kind: 'opening' }], shelves: 0 },
  appliance_base: { carcass: false, fronts: [{ kind: 'opening' }] },
  lift_up: { fronts: [{ kind: 'lift', count: 1 }], shelves: 1 },
  extractor: { fronts: [{ kind: 'lift', count: 1 }], shelves: 0 },
  open_shelf: { fronts: [{ kind: 'open' }], shelves: 2 },
  larder: { fronts: [{ kind: 'doors', count: 1, share: 0.64 }, { kind: 'doors', count: 1, share: 0.36 }], shelves: 5 },
  oven_housing: {
    fronts: [{ kind: 'drawers', count: 2, height_mm: 560 }, { kind: 'opening', height_mm: 600 }, { kind: 'doors', count: 1 }],
    shelves: 1,
  },
  fridge_housing: { fronts: [{ kind: 'doors', count: 1, share: 0.62 }, { kind: 'doors', count: 1, share: 0.38 }], shelves: 0 },
  highboard: { fronts: [{ kind: 'doors', count: 2 }], shelves: 2 },
  highboard_drawers: { fronts: [{ kind: 'drawers', count: 3, share: 0.5 }, { kind: 'doors', count: 1, share: 0.5 }], shelves: 1 },
  appliance_highboard: { fronts: [{ kind: 'opening', height_mm: 600 }, { kind: 'doors', count: 1 }], shelves: 0 },
};

export const PLINTH_ZONES: ReadonlySet<CabinetZone> = new Set(['base', 'tall', 'highboard', 'island']);

export type Vec3 = [number, number, number];

/** A board, in mm. `pos` is its centre in cabinet space: x across (centred), y up from the floor, z forward from the carcass back. */
export interface Panel {
  role: PanelRole;
  slot: BoardSlot;
  size: Vec3;
  pos: Vec3;
  rot?: Vec3;
  edge_mm: number;
}

export interface Fitting {
  kind: 'handle' | 'knob' | 'gola' | 'appliance';
  size: Vec3;
  pos: Vec3;
  rot?: Vec3;
}

export interface CabinetSpec {
  zone: CabinetZone;
  type: string;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  construction?: Partial<CabinetConstruction>;
  recipe?: ModuleRecipe | null;
  open?: number;
  drawers?: number;
  hardware?: string;
}

export interface Cabinet {
  panels: Panel[];
  fittings: Fitting[];
  size: Vec3;
  carcass_bottom_mm: number;
}

export function recipeFor(type: string, override?: ModuleRecipe | null): ModuleRecipe | null {
  return override ?? MODULE_RECIPES[type] ?? null;
}

const DOOR_SWING = Math.PI * 0.55;
const DRAWER_TRAVEL = 0.75;

function place(pivot: Vec3, p: Vec3, rot: Vec3): Vec3 {
  const [rx, ry] = rot;
  const y1 = p[1] * Math.cos(rx) - p[2] * Math.sin(rx);
  const z1 = p[1] * Math.sin(rx) + p[2] * Math.cos(rx);
  const x2 = p[0] * Math.cos(ry) + z1 * Math.sin(ry);
  const z2 = -p[0] * Math.sin(ry) + z1 * Math.cos(ry);
  return [pivot[0] + x2, pivot[1] + y1, pivot[2] + z2];
}

export function rowHeights(rows: FrontRow[], total: number): number[] {
  const fixed = rows.reduce((s, r) => s + (r.height_mm ?? 0), 0);
  const free = Math.max(0, total - fixed);
  const shares = rows.map((r) => (r.height_mm != null ? 0 : r.share ?? 1));
  const shareSum = shares.reduce((a, b) => a + b, 0) || 1;
  return rows.map((r, i) => (r.height_mm != null ? Math.min(r.height_mm, total) : (free * shares[i]) / shareSum));
}

export function generateCabinet(spec: CabinetSpec): Cabinet | null {
  const recipe = recipeFor(spec.type, spec.recipe);
  if (!recipe) return null;
  const c: CabinetConstruction = { ...DEFAULT_CONSTRUCTION, ...(spec.construction ?? {}) };
  const W = Math.max(0, spec.width_mm);
  const H = Math.max(0, spec.height_mm);
  const D = Math.max(0, spec.depth_mm);
  const t = c.carcass_mm;
  const open = Math.min(1, Math.max(0, spec.open ?? 0));
  const P = PLINTH_ZONES.has(spec.zone) ? c.plinth_mm : 0;
  const top = P + H;
  const panels: Panel[] = [];
  const fittings: Fitting[] = [];
  const add = (p: Panel) => { if (p.size.every((v) => v > 0)) panels.push(p); };

  if (recipe.end_panel) {
    add({ role: 'end_panel', slot: 'fronts', size: [c.front_mm, top, D + c.front_mm], pos: [0, top / 2, (D + c.front_mm) / 2], edge_mm: top + D + c.front_mm });
    return { panels, fittings, size: [c.front_mm, top, D + c.front_mm], carcass_bottom_mm: P };
  }

  const carcass = recipe.carcass !== false && W > 2 * t;
  const inner = W - 2 * t;
  if (carcass) {
    for (const sx of [-1, 1]) add({ role: 'side', slot: 'carcass', size: [t, H, D], pos: [sx * (W / 2 - t / 2), P + H / 2, D / 2], edge_mm: H });
    add({ role: 'bottom', slot: 'carcass', size: [inner, t, D], pos: [0, P + t / 2, D / 2], edge_mm: inner });
    if ((recipe.top ?? (spec.zone === 'base' || spec.zone === 'island' ? 'rails' : 'panel')) === 'rails') {
      add({ role: 'rail', slot: 'carcass', size: [inner, t, c.rail_mm], pos: [0, top - t / 2, D - c.rail_mm / 2], edge_mm: inner });
      add({ role: 'rail', slot: 'carcass', size: [inner, t, c.rail_mm], pos: [0, top - t / 2, c.back_mm + c.rail_mm / 2], edge_mm: 0 });
    } else {
      add({ role: 'top', slot: 'carcass', size: [inner, t, D], pos: [0, top - t / 2, D / 2], edge_mm: inner });
    }
    if (c.back_mm > 0) add({ role: 'back', slot: 'back', size: [W, H, c.back_mm], pos: [0, P + H / 2, c.back_mm / 2], edge_mm: 0 });
    const shelves = Math.max(0, Math.round(recipe.shelves ?? 0));
    const shelfD = D - c.back_mm - c.shelf_setback_mm;
    for (let i = 1; i <= shelves; i++) {
      add({ role: 'shelf', slot: 'carcass', size: [inner, t, shelfD], pos: [0, P + t + ((H - 2 * t) * i) / (shelves + 1), c.back_mm + shelfD / 2], edge_mm: inner });
    }
  }
  if (P > 0) add({ role: 'plinth', slot: 'plinth', size: [W, P, t], pos: [0, P / 2, D - c.plinth_setback_mm], edge_mm: 0 });

  const g = c.front_gap_mm;
  const fz = D + c.front_mm / 2;
  const hardware = spec.hardware ?? 'bar_handles';
  const handle = (role: PanelRole, fw: number, fh: number, pivot: Vec3, local: Vec3, rot: Vec3, hingeSide: -1 | 0 | 1) => {
    if (hardware === 'push_to_open' || hardware === 'gola') return;
    const lift = role === 'lift_door';
    const drawer = role === 'drawer_front';
    const wallish = spec.zone === 'wall';
    let hx = local[0];
    let hy = local[1];
    if (hardware === 'edge_pull') {
      hy = local[1] + (wallish ? -fh / 2 + 6 : fh / 2 - 6);
      fittings.push({ kind: 'handle', size: [Math.min(fw - 40, 400), 12, 22], pos: place(pivot, [hx, hy, local[2] + c.front_mm / 2 + 4], rot), rot });
      return;
    }
    if (drawer || lift) {
      hy = local[1] + (lift ? -fh / 2 + 40 : fh / 2 - Math.min(40, fh / 4));
    } else {
      hx = local[0] - hingeSide * (fw / 2 - 40);
      hy = local[1] + (wallish ? -fh / 2 + 80 : fh / 2 - 80);
    }
    const z = local[2] + c.front_mm / 2 + 14;
    if (hardware === 'knobs') {
      fittings.push({ kind: 'knob', size: [28, 28, 26], pos: place(pivot, [hx, hy, z], rot), rot });
      return;
    }
    const along = drawer || lift;
    const len = Math.min(along ? fw * 0.5 : fh * 0.5, 192);
    fittings.push({ kind: 'handle', size: along ? [len, 12, 26] : [12, len, 26], pos: place(pivot, [hx, hy, z], rot), rot });
  };

  const frontBottom = P;
  const heights = rowHeights(recipe.fronts, H);
  let y = frontBottom;
  let gola = false;
  recipe.fronts.forEach((row, ri) => {
    const rh = heights[ri];
    const y0 = y;
    y += rh;
    if (row.kind === 'open') return;
    if (row.kind === 'opening') {
      fittings.push({ kind: 'appliance', size: [W - 2 * g, rh - 2 * g, 20], pos: [0, y0 + rh / 2, D - 10] });
      return;
    }
    const count = row.kind === 'drawers' ? Math.max(1, Math.round(spec.drawers ?? row.count ?? 1)) : Math.max(1, Math.round(row.count ?? 1));
    if (row.kind === 'drawers') {
      const fh = rh / count;
      for (let k = 0; k < count; k++) {
        const fy = y0 + fh * (k + 0.5);
        const slide = open * DRAWER_TRAVEL * D;
        const front: Panel = { role: 'drawer_front', slot: 'fronts', size: [W - g, fh - g, c.front_mm], pos: [0, fy, fz + slide], edge_mm: 2 * (W - g + fh - g) };
        add(front);
        handle('drawer_front', W - g, fh - g, [0, 0, 0], front.pos, [0, 0, 0], 0);
        if (hardware === 'gola' && k < count - 1) gola = true;
        if (carcass && inner > 2 * c.drawer_clearance_mm) {
          const bw = inner - c.drawer_clearance_mm;
          const bh = Math.max(60, Math.min(fh - 50, 200));
          const bd = Math.max(250, D - c.back_mm - 30);
          const bt = c.drawer_box_mm;
          const by = fy - fh / 2 + 25 + bh / 2;
          const bz = D - bd / 2 - 5 + slide;
          for (const sx of [-1, 1]) add({ role: 'drawer_side', slot: 'carcass', size: [bt, bh, bd], pos: [sx * (bw / 2 - bt / 2), by, bz], edge_mm: bd });
          for (const sz of [-1, 1]) add({ role: 'drawer_end', slot: 'carcass', size: [bw - 2 * bt, bh, bt], pos: [0, by, bz + sz * (bd / 2 - bt / 2)], edge_mm: bw - 2 * bt });
          add({ role: 'drawer_bottom', slot: 'back', size: [bw - 2 * bt, Math.max(3, c.back_mm), bd - 2 * bt], pos: [0, by - bh / 2 + 6, bz], edge_mm: 0 });
        }
      }
      return;
    }
    if (row.kind === 'lift') {
      const angle = open * DOOR_SWING;
      const pivot: Vec3 = [0, y0 + rh - g / 2, fz];
      const rot: Vec3 = [-angle, 0, 0];
      const fh = rh - g;
      const local: Vec3 = [0, -fh / 2, 0];
      add({ role: 'lift_door', slot: 'fronts', size: [W - g, fh, c.front_mm], pos: place(pivot, local, rot), rot, edge_mm: 2 * (W - g + fh) });
      handle('lift_door', W - g, fh, pivot, local, rot, 0);
      return;
    }
    if (row.kind === 'fixed') {
      add({ role: 'fixed_front', slot: 'fronts', size: [W - g, rh - g, c.front_mm], pos: [0, y0 + rh / 2, fz], edge_mm: 2 * (W - g + rh - g) });
      return;
    }
    const corner = row.kind === 'corner';
    const leaves = corner ? 1 : count;
    const span = corner ? W / 2 : W;
    if (corner) add({ role: 'fixed_front', slot: 'fronts', size: [W / 2 - g, rh - g, c.front_mm], pos: [W / 4, y0 + rh / 2, fz], edge_mm: 2 * (W / 2 - g + rh - g) });
    const lw = span / leaves;
    for (let k = 0; k < leaves; k++) {
      const x0 = -W / 2 + lw * k;
      const hingeSide: -1 | 1 = leaves === 2 && k === 1 ? 1 : -1;
      const hx = hingeSide === -1 ? x0 + g / 2 : x0 + lw - g / 2;
      const angle = open * DOOR_SWING;
      const rot: Vec3 = [0, hingeSide === -1 ? -angle : angle, 0];
      const fw = lw - g;
      const fh = rh - g;
      const pivot: Vec3 = [hx, y0 + rh / 2, fz];
      const local: Vec3 = [-hingeSide * (fw / 2), 0, 0];
      add({ role: 'door', slot: 'fronts', size: [fw, fh, c.front_mm], pos: place(pivot, local, rot), rot, edge_mm: 2 * (fw + fh) });
      handle('door', fw, fh, pivot, local, rot, hingeSide);
    }
  });
  if (hardware === 'gola' && (spec.zone === 'base' || spec.zone === 'island' || gola)) {
    fittings.push({ kind: 'gola', size: [W, 40, 20], pos: [0, top - 28, D + c.front_mm / 2] });
  }

  const fronts = recipe.fronts.length > 0 && !recipe.fronts.every((r) => r.kind === 'open');
  return { panels, fittings, size: [W, top, D + (fronts ? c.front_mm : 0)], carcass_bottom_mm: P };
}

export interface CutListEntry {
  slot: BoardSlot;
  pieces: number;
  area_m2: number;
  edge_m: number;
}

export function cutList(panelLists: Panel[][]): CutListEntry[] {
  const acc = new Map<BoardSlot, CutListEntry>();
  for (const list of panelLists) {
    for (const p of list) {
      const [a, b] = [...p.size].sort((x, y) => y - x);
      const e = acc.get(p.slot) ?? { slot: p.slot, pieces: 0, area_m2: 0, edge_m: 0 };
      e.pieces += 1;
      e.area_m2 += (a * b) / 1e6;
      e.edge_m += p.edge_mm / 1000;
      acc.set(p.slot, e);
    }
  }
  return Array.from(acc.values()).map((e) => ({ ...e, area_m2: Math.round(e.area_m2 * 100) / 100, edge_m: Math.round(e.edge_m * 100) / 100 }));
}

export function cutListYields(entries: CutListEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    out[`board_m2_${e.slot}`] = (out[`board_m2_${e.slot}`] ?? 0) + e.area_m2;
    if (e.edge_m > 0) out[`edge_m_${e.slot}`] = (out[`edge_m_${e.slot}`] ?? 0) + e.edge_m;
  }
  return out;
}

export const CUT_LIST_KEYS = ['board_m2_carcass', 'board_m2_fronts', 'board_m2_back', 'board_m2_plinth', 'edge_m_carcass', 'edge_m_fronts'] as const;

export const PART_LABELS: Record<PanelRole, string> = {
  side: 'Side', bottom: 'Bottom', top: 'Top', rail: 'Rail', back: 'Back Panel', shelf: 'Shelf', plinth: 'Plinth', end_panel: 'End Panel',
  door: 'Door', drawer_front: 'Drawer Front', lift_door: 'Lift-Up Door', fixed_front: 'Fixed Front',
  drawer_side: 'Drawer Side', drawer_end: 'Drawer Front/Back', drawer_bottom: 'Drawer Bottom',
};

export const STANDARD_BOARD_MM: readonly [number, number] = [2800, 2070];

export interface AssemblyPart {
  no: number; role: PanelRole; slot: BoardSlot; qty: number;
  length_mm: number; width_mm: number; thickness_mm: number;
  band_long: number | null; band_short: number | null;
}

export interface AssemblyCheck { rule: string; ok: boolean; detail: string }

export interface AssemblyPiece { zone: CabinetZone; type: string; width_mm: number; height_mm: number; depth_mm: number; stated: boolean; where: string; boards?: Partial<Record<BoardSlot, string>> }

export interface CabinetAssembly {
  key: string; zone: CabinetZone; type: string; width_mm: number; height_mm: number; depth_mm: number;
  count: number; where: string[]; stated: boolean; boards: Partial<Record<BoardSlot, string>>;
  cabinet: Cabinet; parts: AssemblyPart[]; panel_part: number[];
  hardware: { handles: number; knobs: number; drawer_runners: number; doors: number; lift_stays: number };
  checks: AssemblyCheck[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function edgeBanding(p: Panel): { long: number; short: number } | null {
  const [a, b] = [...p.size].sort((x, y) => y - x);
  if (p.edge_mm <= 0) return { long: 0, short: 0 };
  for (const long of [2, 1, 0]) for (const short of [2, 1, 0]) if (Math.abs(long * a + short * b - p.edge_mm) < 0.5) return { long, short };
  return null;
}

export function cabinetAssemblies(pieces: AssemblyPiece[], construction: Partial<CabinetConstruction> = {}, board: readonly [number, number] = STANDARD_BOARD_MM): CabinetAssembly[] {
  const c: CabinetConstruction = { ...DEFAULT_CONSTRUCTION, ...construction };
  const out = new Map<string, CabinetAssembly>();
  for (const pc of pieces) {
    const key = `${pc.zone}:${pc.type}:${Math.round(pc.width_mm)}x${Math.round(pc.height_mm)}x${Math.round(pc.depth_mm)}:${JSON.stringify(pc.boards ?? {})}`;
    const seen = out.get(key);
    if (seen) { seen.count += 1; seen.where.push(pc.where); seen.stated = seen.stated && pc.stated; continue; }
    const cabinet = generateCabinet({ zone: pc.zone, type: pc.type, width_mm: pc.width_mm, height_mm: pc.height_mm, depth_mm: pc.depth_mm, construction: c });
    if (!cabinet || !cabinet.panels.length) continue;
    const parts: AssemblyPart[] = [];
    const panel_part = cabinet.panels.map((p) => {
      const [a, b, t] = [...p.size].sort((x, y) => y - x);
      const band = edgeBanding(p);
      const hit = parts.find((q) => q.role === p.role && q.slot === p.slot && q.length_mm === r1(a) && q.width_mm === r1(b) && q.thickness_mm === r1(t) && q.band_long === (band?.long ?? null) && q.band_short === (band?.short ?? null));
      if (hit) { hit.qty += 1; return hit.no; }
      const no = parts.length + 1;
      parts.push({ no, role: p.role, slot: p.slot, qty: 1, length_mm: r1(a), width_mm: r1(b), thickness_mm: r1(t), band_long: band?.long ?? null, band_short: band?.short ?? null });
      return no;
    });
    const count = (k: Fitting['kind']) => cabinet.fittings.filter((f) => f.kind === k).length;
    const drawerFronts = cabinet.panels.filter((p) => p.role === 'drawer_front');
    const hardware = {
      handles: count('handle'), knobs: count('knob'), drawer_runners: cabinet.panels.filter((p) => p.role === 'drawer_bottom').length,
      doors: cabinet.panels.filter((p) => p.role === 'door').length, lift_stays: cabinet.panels.filter((p) => p.role === 'lift_door').length,
    };
    const oversize = parts.filter((p) => p.length_mm > board[0] || p.width_mm > board[1]);
    const unbanded = parts.filter((p) => p.band_long == null);
    const sides = cabinet.panels.filter((p) => p.role === 'drawer_side');
    const boxIssues: string[] = [];
    sides.forEach((s, i) => {
      if (i % 2) return;
      const front = drawerFronts[i / 2];
      if (front && s.size[1] + 25 > front.size[1]) boxIssues.push(`box ${s.size[1]} mm high behind a ${r1(front.size[1])} mm front`);
      if (s.size[2] > pc.depth_mm - c.back_mm - 5) boxIssues.push(`box ${s.size[2]} mm deep in a ${pc.depth_mm} mm carcass`);
    });
    const checks: AssemblyCheck[] = [
      { rule: 'Every Panel Fits a Standard Board', ok: !oversize.length, detail: oversize.length ? `Part ${oversize.map((p) => `${p.no} (${p.length_mm} × ${p.width_mm})`).join(', ')} is larger than a ${board[0]} × ${board[1]} mm board; it needs a joint or a bigger sheet.` : `Largest part ${Math.max(...parts.map((p) => p.length_mm))} mm.` },
      { rule: 'Edge Banding Resolves to Whole Edges', ok: !unbanded.length, detail: unbanded.length ? `Part ${unbanded.map((p) => p.no).join(', ')}: the banded length does not match whole edges; band it from the panel, not this sheet.` : 'Every banded length is whole edges of its part.' },
      ...(sides.length ? [{ rule: 'Drawer Boxes Fit Their Fronts and the Carcass', ok: !boxIssues.length, detail: boxIssues.length ? [...new Set(boxIssues)].join('; ') : `${sides.length / 2} boxes, each inside its front and the carcass depth.` }] : []),
      { rule: 'Cabinet Size Stated by a Person', ok: pc.stated, detail: pc.stated ? 'The width is from a confirmed layout.' : 'The width is assumed (≈); confirm the layout before cutting.' },
    ];
    out.set(key, { key, zone: pc.zone, type: pc.type, width_mm: pc.width_mm, height_mm: pc.height_mm, depth_mm: pc.depth_mm, count: 1, where: [pc.where], stated: pc.stated, boards: pc.boards ?? {}, cabinet, parts, panel_part, hardware, checks });
  }
  return [...out.values()];
}
