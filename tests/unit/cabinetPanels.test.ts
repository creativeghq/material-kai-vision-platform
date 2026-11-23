/** Guards the board-built cabinet (#604 phase 1): the panels, the cut list, the open state, and the cut list in the schedule. */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_CONSTRUCTION, MODULE_RECIPES, cutList, cutListYields, generateCabinet, rowHeights, type CabinetZone,
} from '../../src/lib/scene/cabinetPanels';
import { deriveComposition, type ZoneDef } from '../../supabase/functions/_shared/blueprint/composition';

const base = (type: string, width_mm: number, extra: Record<string, unknown> = {}) =>
  generateCabinet({ zone: 'base', type, width_mm, height_mm: 720, depth_mm: 560, ...extra })!;

describe('a 2-door base unit is the boards a workshop cuts', () => {
  const cab = base('door2', 800);
  const roles = (r: string) => cab.panels.filter((p) => p.role === r);

  it('has two sides, a bottom, two rails, a back, one shelf, a plinth and two doors', () => {
    expect(roles('side')).toHaveLength(2);
    expect(roles('bottom')).toHaveLength(1);
    expect(roles('rail')).toHaveLength(2);
    expect(roles('top')).toHaveLength(0);
    expect(roles('back')).toHaveLength(1);
    expect(roles('shelf')).toHaveLength(1);
    expect(roles('plinth')).toHaveLength(1);
    expect(roles('door')).toHaveLength(2);
  });

  it('cuts the bottom between the sides and the doors one gap short', () => {
    const t = DEFAULT_CONSTRUCTION.carcass_mm;
    expect(roles('bottom')[0].size[0]).toBe(800 - 2 * t);
    expect(roles('door')[0].size[0]).toBe(400 - DEFAULT_CONSTRUCTION.front_gap_mm);
    expect(roles('door')[0].size[1]).toBe(720 - DEFAULT_CONSTRUCTION.front_gap_mm);
  });

  it('reconciles with a hand count', () => {
    // sides 2×720×560 + bottom 764×560 + rails 2×764×100 + shelf 764×537 = 1.797 m²; banded 1440+764+764+764 mm.
    const byslot = Object.fromEntries(cutList([cab.panels]).map((e) => [e.slot, e]));
    expect(byslot.carcass.area_m2).toBe(1.8);
    expect(byslot.carcass.edge_m).toBe(3.73);
    expect(byslot.back.area_m2).toBe(0.58);
    expect(byslot.plinth.area_m2).toBe(0.08);
    expect(byslot.fronts.area_m2).toBe(0.57);
    expect(byslot.fronts.edge_m).toBe(4.46);
  });

  it('stands on its plinth: the carcass starts at plinth height', () => {
    expect(cab.carcass_bottom_mm).toBe(DEFAULT_CONSTRUCTION.plinth_mm);
    expect(cab.size[1]).toBe(DEFAULT_CONSTRUCTION.plinth_mm + 720);
  });
});

describe('fronts', () => {
  it('takes the drawer count from the runner choice', () => {
    const cab = base('drawers', 600, { drawers: 4 });
    expect(cab.panels.filter((p) => p.role === 'drawer_front')).toHaveLength(4);
    expect(cab.panels.filter((p) => p.role === 'drawer_side')).toHaveLength(8);
    expect(cab.panels.filter((p) => p.role === 'drawer_bottom')).toHaveLength(4);
  });

  it('a wall unit has a top panel, no plinth, and is not on the floor', () => {
    const cab = generateCabinet({ zone: 'wall', type: 'door1', width_mm: 450, height_mm: 720, depth_mm: 350 })!;
    expect(cab.panels.some((p) => p.role === 'top')).toBe(true);
    expect(cab.panels.some((p) => p.role === 'plinth')).toBe(false);
    expect(cab.carcass_bottom_mm).toBe(0);
  });

  it('a fixed band keeps its height and the rest share what is left', () => {
    expect(rowHeights([{ kind: 'drawers', height_mm: 120 }, { kind: 'opening' }], 720)).toEqual([120, 600]);
    expect(rowHeights([{ kind: 'doors', share: 3 }, { kind: 'doors', share: 1 }], 800)).toEqual([600, 200]);
  });

  it('an under-worktop oven housing leaves an opening for the oven', () => {
    const cab = base('oven_base', 600);
    expect(cab.fittings.filter((f) => f.kind === 'appliance')).toHaveLength(1);
  });

  it('handleless fronts carry no handles', () => {
    const cab = base('door2', 800, { hardware: 'gola' });
    expect(cab.fittings.some((f) => f.kind === 'handle' || f.kind === 'knob')).toBe(false);
    expect(cab.fittings.some((f) => f.kind === 'gola')).toBe(true);
  });
});

describe('open state', () => {
  it('a door swings about its hinge edge, forward', () => {
    const closed = base('door1', 450);
    const open = base('door1', 450, { open: 1 });
    const c = closed.panels.find((p) => p.role === 'door')!;
    const o = open.panels.find((p) => p.role === 'door')!;
    expect(o.pos[2]).toBeGreaterThan(c.pos[2] + 100);
    const hingeX = -225 + DEFAULT_CONSTRUCTION.front_gap_mm / 2;
    const half = c.size[0] / 2;
    expect(Math.hypot(o.pos[0] - hingeX, o.pos[2] - c.pos[2])).toBeCloseTo(half, 5);
  });

  it('drawers slide out with their boxes, and opening changes nothing in the cut list', () => {
    const closed = base('drawers', 600);
    const open = base('drawers', 600, { open: 1 });
    const front = (cab: typeof closed) => cab.panels.find((p) => p.role === 'drawer_front')!.pos[2];
    const box = (cab: typeof closed) => cab.panels.find((p) => p.role === 'drawer_side')!.pos[2];
    expect(front(open) - front(closed)).toBeCloseTo(box(open) - box(closed), 5);
    expect(cutList([open.panels])).toEqual(cutList([closed.panels]));
  });
});

describe('every library recipe builds', () => {
  const zones: Record<string, CabinetZone> = {
    lift_up: 'wall', extractor: 'wall', open_shelf: 'wall', larder: 'tall', oven_housing: 'tall', fridge_housing: 'tall',
    highboard: 'highboard', highboard_drawers: 'highboard', appliance_highboard: 'highboard',
  };
  for (const type of Object.keys(MODULE_RECIPES)) {
    it(type, () => {
      const zone = zones[type] ?? 'base';
      const height = zone === 'tall' ? 2100 : zone === 'highboard' ? 1300 : 720;
      const cab = generateCabinet({ zone, type, width_mm: 600, height_mm: height, depth_mm: zone === 'wall' ? 350 : 560 })!;
      expect(cab.panels.length).toBeGreaterThan(0);
      for (const p of cab.panels) {
        expect(p.size.every((v) => v > 0)).toBe(true);
        expect(p.pos[1]).toBeGreaterThanOrEqual(0);
        expect(p.pos[1]).toBeLessThanOrEqual(cab.size[1]);
      }
    });
  }

  it('an unknown module type is not drawn as a cabinet', () => {
    expect(generateCabinet({ zone: 'base', type: 'nope', width_mm: 600, height_mm: 720, depth_mm: 560 })).toBeNull();
  });
});

describe('the cut list joins the schedule only for a zone built from boards', () => {
  const zone = (construction?: Record<string, number>): ZoneDef => ({
    key: 'base', label: 'Bottom units', kind: 'units', modules: [
      { key: 'door2', label: '2-door cabinet', default_width_cm: 80, price_mode: 'per_piece', unit_price: 100 },
      { key: 'mystery', label: 'Mystery unit', default_width_cm: 60, price_mode: 'per_piece', unit_price: 100 },
    ],
    globals: [{ key: 'height', label: 'Height', type: 'number', default: 72 }, { key: 'depth', label: 'Depth', type: 'number', default: 56 }],
    ...(construction ? { construction } : {}),
  });
  const config = { base: { enabled: true, modules: [{ id: 'a', type: 'door2', width_cm: 80, qty: 2 }] } };

  it('publishes board area and edge tape per slot, multiplied by quantity', () => {
    const derived = deriveComposition([zone({})], config);
    const one = cutListYields(cutList([base('door2', 800).panels]));
    expect(derived.vars.total_board_m2_carcass).toBeCloseTo(one.board_m2_carcass * 2, 2);
    expect(derived.vars.total_edge_m_fronts).toBeCloseTo(one.edge_m_fronts * 2, 2);
    expect(derived.schedule.find((r) => r.key === 'board_m2_fronts')?.unit).toBe('m²');
  });

  it('a thicker carcass board changes the cut, not the fronts', () => {
    const thin = deriveComposition([zone({})], config).vars;
    const thick = deriveComposition([zone({ carcass_mm: 25 })], config).vars;
    expect(thick.total_board_m2_carcass).not.toBe(thin.total_board_m2_carcass);
    expect(thick.total_board_m2_fronts).toBe(thin.total_board_m2_fronts);
  });

  it('says so when a module has no recipe', () => {
    const derived = deriveComposition([zone({})], { base: { enabled: true, modules: [{ id: 'm', type: 'mystery', width_cm: 60, qty: 1 }] } });
    expect(derived.issues.some((i) => i.includes('Mystery unit') && i.includes('cut list'))).toBe(true);
  });

  it('publishes nothing for a zone that is not built from boards', () => {
    const derived = deriveComposition([zone()], config);
    expect(derived.schedule.some((r) => r.key.startsWith('board_m2_'))).toBe(false);
    expect(derived.vars.total_board_m2_carcass).toBeUndefined();
  });
});

describe('a kitchen object in the 3D room is drawn from its cabinets', () => {
  it('fits its true-size box, closed, and the open doors come forward out of it', async () => {
    const { buildKitchenGeometry } = await import('../../src/components/features/scenestudio/cabinetMesh');
    const { Box3 } = await import('three');
    const [w, d, h] = [2.4, 0.6, 0.9];
    const bounds = (open: number) => {
      const geo = buildKitchenGeometry('kitchen_base', w, d, h, { open, hardware: 'push_to_open' })!;
      const box = new Box3();
      for (const s of geo.slots) { s.geometry.computeBoundingBox(); box.union(s.geometry.boundingBox!); }
      geo.dispose();
      return box;
    };
    const closed = bounds(0);
    expect(closed.min.x).toBeGreaterThanOrEqual(-w / 2 - 1e-6);
    expect(closed.max.x).toBeLessThanOrEqual(w / 2 + 1e-6);
    expect(closed.min.z).toBeGreaterThanOrEqual(-d / 2 - 1e-6);
    expect(closed.max.z).toBeLessThanOrEqual(d / 2 + 1e-6);
    expect(closed.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(closed.max.y).toBeLessThanOrEqual(h - 0.04 + 1e-6);
    expect(bounds(1).max.z).toBeGreaterThan(d / 2 + 0.2);
  });

  it('is nothing for an object that is not a kitchen unit', async () => {
    const { buildKitchenGeometry } = await import('../../src/components/features/scenestudio/cabinetMesh');
    expect(buildKitchenGeometry('sofa', 2, 0.9, 0.8, { open: 0, hardware: 'bar_handles' })).toBeNull();
  });
});
