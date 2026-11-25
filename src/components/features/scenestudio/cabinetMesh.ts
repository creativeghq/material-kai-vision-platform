/** Kitchen objects drawn from their boards (#604): one merged geometry per board slot per run, UVs in metres so a decor lays at its real size. */
import { createContext } from 'react';
import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEFAULT_CONSTRUCTION, generateCabinet, type BoardSlot, type CabinetConstruction, type Fitting, type Vec3 } from '@/lib/scene/cabinetPanels';
import { kitchenPieces, type KitchenLayout } from '@/lib/scene/kitchenComposition';

export interface CabinetView {
  /** 0 closed … 1 open. */
  open: number;
  hardware: string;
  construction?: Partial<CabinetConstruction>;
}

export const CabinetViewContext = createContext<CabinetView>({ open: 0, hardware: 'bar_handles' });

/** The worktop thickness the scene's kitchen objects are read with; the worktop itself is drawn by objectParts. */
export const SCENE_WORKTOP_MM = 40;

export type FittingGroup = 'metal' | 'gola' | 'appliance';

export interface KitchenGeometry {
  slots: Array<{ slot: BoardSlot; geometry: BufferGeometry }>;
  fittings: Array<{ group: FittingGroup; geometry: BufferGeometry }>;
  /** Where each module stands along the run, metres. */
  spots: Array<{ type: string; x: number; w: number }>;
  openings: Array<{ type: string; pos: Vec3; size: Vec3 }>;
  dispose(): void;
}

const FITTING_GROUP: Record<Fitting['kind'], FittingGroup> = { handle: 'metal', knob: 'metal', gola: 'gola', appliance: 'appliance' };

/** A box whose UVs run in metres along each face, placed by centre and Euler rotation (mm in, metres out). */
function placedBox(size: Vec3, pos: Vec3, rot: Vec3 | undefined, offset: Vec3): BufferGeometry {
  const [sx, sy, sz] = size.map((v) => v / 1000);
  const g = new BoxGeometry(sx, sy, sz);
  const uv = g.getAttribute('uv');
  const faceDims: Array<[number, number]> = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let i = 0; i < uv.count; i++) {
    const [du, dv] = faceDims[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * du, uv.getY(i) * dv);
  }
  const q = new Quaternion().setFromEuler(new Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, 0, 'YXZ'));
  const p = new Vector3((pos[0] + offset[0]) / 1000, (pos[1] + offset[1]) / 1000, (pos[2] + offset[2]) / 1000);
  g.applyMatrix4(new Matrix4().compose(p, q, new Vector3(1, 1, 1)));
  return g;
}

/** Every cabinet one kitchen object stands for, in object space: x centred, y up from its base, front at +d/2. */
export function buildKitchenGeometry(kind: string, w: number, d: number, h: number, view: CabinetView, layout?: KitchenLayout | null): KitchenGeometry | null {
  const c = { ...DEFAULT_CONSTRUCTION, ...(view.construction ?? {}) };
  const pieces = kitchenPieces(
    { kind, width_mm: w * 1000, depth_mm: d * 1000, height_mm: h * 1000, kitchen_layout: layout },
    { plinth_mm: c.plinth_mm, front_mm: c.front_mm, worktop_mm: SCENE_WORKTOP_MM },
  );
  if (!pieces.length) return null;
  const bySlot = new Map<BoardSlot, BufferGeometry[]>();
  const byGroup = new Map<FittingGroup, BufferGeometry[]>();
  const openings: KitchenGeometry['openings'] = [];
  for (const piece of pieces) {
    const cab = generateCabinet({
      zone: piece.zone, type: piece.type, width_mm: piece.width_mm, height_mm: piece.height_mm, depth_mm: piece.depth_mm,
      construction: c, open: view.open, hardware: view.hardware,
    });
    if (!cab) continue;
    const offset: Vec3 = [piece.x_mm, 0, -d * 500];
    for (const p of cab.panels) {
      const list = bySlot.get(p.slot) ?? [];
      list.push(placedBox(p.size, p.pos, p.rot, offset));
      bySlot.set(p.slot, list);
    }
    for (const f of cab.fittings) {
      const group = FITTING_GROUP[f.kind];
      const list = byGroup.get(group) ?? [];
      list.push(placedBox(f.size, f.pos, f.rot, offset));
      byGroup.set(group, list);
      if (f.kind === 'appliance') openings.push({ type: piece.type, pos: f.pos.map((v, i) => (v + offset[i]) / 1000) as Vec3, size: f.size.map((v) => v / 1000) as Vec3 });
    }
  }
  const merge = (parts: BufferGeometry[]) => {
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    return merged;
  };
  const slots = Array.from(bySlot, ([slot, parts]) => ({ slot, geometry: merge(parts) }));
  const fittings = Array.from(byGroup, ([group, parts]) => ({ group, geometry: merge(parts) }));
  return {
    slots,
    fittings,
    spots: pieces.map((p) => ({ type: p.type, x: p.x_mm / 1000, w: p.width_mm / 1000 })),
    openings,
    dispose() {
      for (const s of slots) s.geometry.dispose();
      for (const f of fittings) f.geometry.dispose();
    },
  };
}
