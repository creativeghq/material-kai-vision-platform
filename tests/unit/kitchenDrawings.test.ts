/** Guards the kitchen drawing set (#604 phase 5): the plan's dimension chains and the elevations come from the same units as the 3D view and the price. */

import { describe, it, expect } from 'vitest';

import { kitchenElevations, kitchenPlan, type DrawRun } from '../../src/lib/scene/kitchenDrawings';
import { runModulesOf } from '../../src/lib/scene/kitchenComposition';

const sink: DrawRun = { id: 'b', label: 'Sink Run', kind: 'sink', x_mm: 2100, y_mm: 360, rotation_deg: 0, width_mm: 3000, depth_mm: 600, height_mm: 900, elevation_mm: 0 };
const wall: DrawRun = {
  id: 'w', label: 'Wall Units', kind: 'kitchen_wall', x_mm: 2100, y_mm: 235, rotation_deg: 0, width_mm: 3000, depth_mm: 350, height_mm: 720, elevation_mm: 1450,
  kitchen_layout: { modules: [{ type: 'door2', width_mm: 800 }, { type: 'gap', width_mm: 1200 }, { type: 'door2', width_mm: 1000 }] },
};
const island: DrawRun = { id: 'i', label: 'Island', kind: 'island', x_mm: 2200, y_mm: 2100, rotation_deg: 0, width_mm: 1800, depth_mm: 900, height_mm: 900, elevation_mm: 0 };
const walls = [{ id: 'a', x1_mm: 0, y1_mm: 0, x2_mm: 4000, y2_mm: 0, thickness_mm: 120 }];
const openings = [{ wall_id: 'a', kind: 'window', offset_mm: 1500, width_mm: 1000, sill_mm: 1000, head_mm: 2100 }];

describe('kitchen plan', () => {
  const plan = kitchenPlan([sink, wall]);
  it('draws every unit of every run, wall units dashed', () => {
    expect(plan.runs).toHaveLength(2);
    expect(plan.runs[0].units).toHaveLength(runModulesOf(sink).length);
    expect(plan.runs[1].units.every((u) => u.hidden)).toBe(true);
  });
  it('chains the floor run: the overall length and every unit', () => {
    const texts = plan.dims.map((d) => d.text);
    expect(texts).toContain('300');
    const units = runModulesOf(sink).filter((m) => m.width_mm >= 100).map((m) => String(Math.round(m.width_mm / 10)));
    expect(texts.filter((t) => t !== '300')).toEqual(units);
  });
});

describe('kitchen elevations', () => {
  const elevations = kitchenElevations([sink, wall, island], walls, openings);
  it('puts the runs on one wall in one elevation, and the island in its own', () => {
    expect(elevations).toHaveLength(2);
    expect(elevations[0].runs).toEqual(['Sink Run', 'Wall Units']);
    expect(elevations[1].runs).toEqual(['Island']);
  });
  it('shows the window behind the wall run, clear of the wall units', () => {
    const e = elevations[0];
    const win = e.rects.find((r) => r.kind === 'window')!;
    expect(win).toMatchObject({ x: 900, w: 1000, y: 1000, h: 1100 });
    const wallFronts = e.rects.filter((r) => r.kind === 'front' && r.y >= 1450);
    expect(wallFronts.every((r) => r.x + r.w <= win.x + 1 || r.x >= win.x + win.w - 1)).toBe(true);
  });
  it('draws a worktop on the floor run and dimensions its height', () => {
    expect(elevations[0].rects.some((r) => r.kind === 'worktop' && r.y + r.h === 900)).toBe(true);
    expect(elevations[0].heights.map((h) => h.text)).toEqual(['90', '72']);
  });
});
