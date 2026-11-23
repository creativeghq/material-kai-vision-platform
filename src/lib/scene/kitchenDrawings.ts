import { DEFAULT_CONSTRUCTION, generateCabinet, type CabinetConstruction } from '@/lib/scene/cabinetPanels';
import {
  KITCHEN_KINDS, MODULE_LABELS, kitchenPieces, runModulesOf, spansBehind, zoneOfKind, type KitchenLayout, type OpeningLike, type WallLike,
} from '@/lib/scene/kitchenComposition';

export type Pt = [number, number];

export interface DrawRun {
  id: string; label: string; kind: string;
  x_mm: number; y_mm: number; rotation_deg: number; width_mm: number; depth_mm: number; height_mm: number; elevation_mm: number;
  kitchen_layout?: KitchenLayout | null;
}

export interface DimLine { a: Pt; b: Pt; offset: Pt; text: string }
export interface PlanDrawing {
  runs: Array<{ id: string; outline: Pt[]; units: Array<{ outline: Pt[]; label: string; hidden: boolean }> }>;
  dims: DimLine[];
}

const axes = (r: DrawRun) => {
  const a = (r.rotation_deg * Math.PI) / 180;
  return { axis: [Math.cos(a), Math.sin(a)] as Pt, front: [-Math.sin(a), Math.cos(a)] as Pt };
};
const at = (r: DrawRun, along: number, out: number): Pt => {
  const { axis, front } = axes(r);
  const u = along - r.width_mm / 2;
  return [r.x_mm + axis[0] * u + front[0] * out, r.y_mm + axis[1] * u + front[1] * out];
};
const rect = (r: DrawRun, x0: number, x1: number, z0: number, z1: number): Pt[] => [at(r, x0, z0), at(r, x1, z0), at(r, x1, z1), at(r, x0, z1)];
const cm = (mm: number) => `${Math.round(mm / 10)}`;

export function kitchenPlan(runs: DrawRun[]): PlanDrawing {
  const out: PlanDrawing = { runs: [], dims: [] };
  for (const r of runs) {
    if (!KITCHEN_KINDS.has(r.kind)) continue;
    const half = r.depth_mm / 2;
    const units = runModulesOf(r).filter((m) => m.type !== 'gap').map((m) => ({
      outline: rect(r, m.x_mm, m.x_mm + m.width_mm, -half, half),
      label: m.type === 'filler' || m.type === 'end_panel' ? '' : MODULE_LABELS[m.type] ?? m.type,
      hidden: r.kind === 'kitchen_wall',
    }));
    out.runs.push({ id: r.id, outline: rect(r, 0, r.width_mm, -half, half), units });
    const { front } = axes(r);
    const off = (k: number): Pt => [front[0] * (half + k), front[1] * (half + k)];
    const offset = r.kind === 'kitchen_wall' ? 0 : 1;
    if (!offset) continue;
    out.dims.push({ a: at(r, 0, 0), b: at(r, r.width_mm, 0), offset: off(450), text: cm(r.width_mm) });
    for (const m of runModulesOf(r)) {
      if (m.width_mm < 100) continue;
      out.dims.push({ a: at(r, m.x_mm, 0), b: at(r, m.x_mm + m.width_mm, 0), offset: off(220), text: cm(m.width_mm) });
    }
  }
  return out;
}

export type ElevationKind = 'carcass' | 'front' | 'handle' | 'appliance' | 'worktop' | 'plinth' | 'window';
export interface ElevationRect { x: number; y: number; w: number; h: number; kind: ElevationKind }
export interface Elevation { key: string; runs: string[]; width_mm: number; height_mm: number; rects: ElevationRect[]; dims: Array<{ x0: number; x1: number; y: number; text: string }>; heights: Array<{ y0: number; y1: number; text: string }> }

export function kitchenElevations(
  runs: DrawRun[], walls: Array<WallLike & { id: string }> = [], openings: OpeningLike[] = [], construction: Partial<CabinetConstruction> = {}, worktopMm = 40,
): Elevation[] {
  const c = { ...DEFAULT_CONSTRUCTION, ...construction };
  const groups = new Map<string, DrawRun[]>();
  for (const r of runs) {
    if (!KITCHEN_KINDS.has(r.kind) || r.kind === 'island') continue;
    const { front } = axes(r);
    const back = r.x_mm * front[0] + r.y_mm * front[1] - r.depth_mm / 2;
    const rot = ((Math.round(r.rotation_deg) % 360) + 360) % 360;
    const key = [...groups.keys()].find((k) => {
      const [kr, kb] = k.split(':').map(Number);
      return kr === rot && Math.abs(kb - back) < 400;
    }) ?? `${rot}:${Math.round(back)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const islands = runs.filter((r) => r.kind === 'island');
  for (const r of islands) groups.set(`island:${r.id}`, [r]);

  const elevations: Elevation[] = [];
  for (const [key, list] of groups) {
    const { axis } = axes(list[0]);
    const left = (r: DrawRun) => (r.x_mm * axis[0] + r.y_mm * axis[1]) - r.width_mm / 2;
    const origin = Math.min(...list.map(left));
    const rects: ElevationRect[] = [];
    const dims: Elevation['dims'] = [];
    let width = 0;
    let height = 0;
    const windows = new Set<string>();
    for (const r of list) {
      const x0 = left(r) - origin;
      if (r.kind !== 'island') {
        for (const sp of spansBehind(r, walls, openings)) {
          const key = `${Math.round(x0 + sp.from_mm)}:${Math.round(sp.sill_mm)}`;
          if (windows.has(key)) continue;
          windows.add(key);
          rects.push({ x: x0 + sp.from_mm, y: sp.sill_mm, w: sp.to_mm - sp.from_mm, h: sp.head_mm - sp.sill_mm, kind: 'window' });
          height = Math.max(height, sp.head_mm);
        }
      }
      width = Math.max(width, x0 + r.width_mm);
      const zone = zoneOfKind(r.kind)!;
      const lift = r.kind === 'kitchen_wall' ? r.elevation_mm : 0;
      height = Math.max(height, lift + r.height_mm);
      for (const p of kitchenPieces(r, { plinth_mm: c.plinth_mm, front_mm: c.front_mm, worktop_mm: worktopMm })) {
        const cab = generateCabinet({ zone: p.zone, type: p.type, width_mm: p.width_mm, height_mm: p.height_mm, depth_mm: p.depth_mm, construction: c });
        if (!cab) continue;
        const px = x0 + r.width_mm / 2 + p.x_mm;
        rects.push({ x: px - p.width_mm / 2, y: lift + cab.carcass_bottom_mm, w: p.width_mm, h: p.height_mm, kind: 'carcass' });
        for (const q of cab.panels) {
          if (q.role === 'plinth') rects.push({ x: px - q.size[0] / 2, y: lift, w: q.size[0], h: q.size[1], kind: 'plinth' });
          if (['door', 'drawer_front', 'lift_door', 'fixed_front', 'end_panel'].includes(q.role)) {
            rects.push({ x: px + q.pos[0] - q.size[0] / 2, y: lift + q.pos[1] - q.size[1] / 2, w: q.size[0], h: q.size[1], kind: 'front' });
          }
        }
        for (const f of cab.fittings) {
          const kind = f.kind === 'appliance' ? 'appliance' : 'handle';
          rects.push({ x: px + f.pos[0] - f.size[0] / 2, y: lift + f.pos[1] - f.size[1] / 2, w: f.size[0], h: f.size[1], kind });
        }
      }
      if (zone === 'base' || zone === 'island') rects.push({ x: x0, y: r.height_mm - worktopMm, w: r.width_mm, h: worktopMm, kind: 'worktop' });
      if (r.kind !== 'kitchen_wall') {
        dims.push({ x0, x1: x0 + r.width_mm, y: -150, text: cm(r.width_mm) });
        for (const m of runModulesOf(r)) {
          if (m.width_mm >= 100 && m.type !== 'gap') dims.push({ x0: x0 + m.x_mm, x1: x0 + m.x_mm + m.width_mm, y: -350, text: cm(m.width_mm) });
        }
      }
    }
    const heights: Elevation['heights'] = [];
    const base = list.find((r) => r.kind !== 'kitchen_wall' && r.kind !== 'kitchen_tall');
    if (base) heights.push({ y0: 0, y1: base.height_mm, text: cm(base.height_mm) });
    const wall = list.find((r) => r.kind === 'kitchen_wall');
    if (wall) heights.push({ y0: wall.elevation_mm, y1: wall.elevation_mm + wall.height_mm, text: cm(wall.height_mm) });
    elevations.push({ key, runs: list.map((r) => r.label), width_mm: width, height_mm: height, rects, dims, heights });
  }
  return elevations;
}
