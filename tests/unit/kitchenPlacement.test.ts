/** Guards the kitchen placement engine (#604 phase 3): the one writer of a run's units, refusing with the rule it applied. */

import { describe, it, expect } from 'vitest';

import {
  autoLayout, kitchenCompositionFromRoom, kitchenPieces, placeRun, runContext, runModulesOf, spansBehind, type RunContext,
} from '../../src/lib/scene/kitchenComposition';

const base: RunContext = { zone: 'base', width_mm: 2400, bottom_mm: 0, top_mm: 900, behind: [] };
const wall: RunContext = { zone: 'wall', width_mm: 2400, bottom_mm: 1450, top_mm: 2170, behind: [] };

describe('placeRun', () => {
  it('builds units left to right and closes a small remainder with a filler', () => {
    const r = placeRun([{ type: 'drawers', width_mm: 600 }, { type: 'door2', width_mm: 800 }, { type: 'door2', width_mm: 960 }], base);
    expect(r.rejected).toEqual([]);
    expect(r.built.map((m) => m.x_mm)).toEqual([0, 600, 1400, 2360]);
    expect(r.built[3]).toMatchObject({ type: 'filler', width_mm: 40, auto: true });
  });

  it('refuses a unit that does not fit, and says how much was left', () => {
    const r = placeRun([{ type: 'door2', width_mm: 1200 }, { type: 'door2', width_mm: 1200 }, { type: 'door1', width_mm: 450 }], base);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toMatch(/does not fit: 0 cm/);
  });

  it('refuses a unit from the wrong run and a width no cabinet has', () => {
    const r = placeRun([{ type: 'larder', width_mm: 600 }, { type: 'door1', width_mm: 100 }], base);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      expect.stringMatching(/cannot go in a base run/),
      expect.stringMatching(/15–120 cm/),
    ]);
  });

  it('keeps a corner unit at an end of the run', () => {
    const r = placeRun([{ type: 'door2', width_mm: 800 }, { type: 'corner', width_mm: 900 }, { type: 'door2', width_mm: 600 }], base);
    expect(r.rejected[0].reason).toMatch(/corner unit goes at one end/);
  });

  it('refuses a wall unit over a window, and a base unit across a door', () => {
    const window = { kind: 'window' as const, from_mm: 800, to_mm: 1600, sill_mm: 1000, head_mm: 2100 };
    const r = placeRun([{ type: 'door2', width_mm: 800 }, { type: 'door2', width_mm: 800 }], { ...wall, behind: [window] });
    expect(r.built).toHaveLength(1);
    expect(r.rejected[0].reason).toMatch(/cover the window/);
    const door = { kind: 'door' as const, from_mm: 0, to_mm: 900, sill_mm: 0, head_mm: 2100 };
    expect(placeRun([{ type: 'door2', width_mm: 800 }], { ...base, behind: [door] }).rejected[0].reason).toMatch(/block the door/);
  });

  it('lets a base unit stand under a window but says when the worktop is above the sill', () => {
    const window = { kind: 'window' as const, from_mm: 0, to_mm: 900, sill_mm: 850, head_mm: 2100 };
    const r = placeRun([{ type: 'sink_base', width_mm: 900 }], { ...base, behind: [window] });
    expect(r.rejected).toEqual([]);
    expect(r.issues.some((i) => i.includes('above the window sill'))).toBe(true);
  });

  it('notices a dishwasher that is not beside the sink', () => {
    const r = placeRun([{ type: 'sink_base', width_mm: 900 }, { type: 'drawers', width_mm: 600 }, { type: 'dishwasher_housing', width_mm: 600 }], base);
    expect(r.issues.some((i) => i.includes('dishwasher is not next to the sink'))).toBe(true);
  });
});

describe('autoLayout', () => {
  it('fills a base run in standard widths with no refusals', () => {
    for (const w of [1200, 2400, 3150, 3600]) {
      const ctx = { ...base, width_mm: w };
      const r = placeRun(autoLayout('kitchen_base', ctx), ctx);
      expect(r.rejected).toEqual([]);
      expect(r.built.reduce((s, m) => s + m.width_mm, 0)).toBe(w);
    }
  });

  it('puts the dishwasher beside the sink', () => {
    const mods = autoLayout('sink', { ...base, width_mm: 2400 });
    expect(mods.slice(0, 2).map((m) => m.type)).toEqual(['sink_base', 'dishwasher_housing']);
  });

  it('leaves the window clear on a wall run', () => {
    const behind = [{ kind: 'window' as const, from_mm: 900, to_mm: 1700, sill_mm: 1000, head_mm: 2100 }];
    const ctx = { ...wall, behind };
    const r = placeRun(autoLayout('kitchen_wall', ctx), ctx);
    expect(r.rejected).toEqual([]);
    const units = r.built.filter((m) => m.type !== 'gap');
    expect(units.every((m) => m.x_mm + m.width_mm <= 900 || m.x_mm >= 1700)).toBe(true);
  });
});

describe('spansBehind', () => {
  const walls = [{ id: 'w', x1_mm: 0, y1_mm: 0, x2_mm: 4000, y2_mm: 0, thickness_mm: 100 }];
  const openings = [{ wall_id: 'w', kind: 'window', offset_mm: 1500, width_mm: 1000, sill_mm: 900, head_mm: 2100 }];
  it('finds the window in the wall behind a run and measures it from the run’s left end', () => {
    const run = { x_mm: 2000, y_mm: 350, rotation_deg: 0, width_mm: 2400, depth_mm: 600 };
    const [s] = spansBehind(run, walls, openings);
    expect(s).toMatchObject({ kind: 'window', sill_mm: 900 });
    expect(s.from_mm).toBeCloseTo(700, 5);
    expect(s.to_mm).toBeCloseTo(1700, 5);
  });

  it('ignores a wall that is in front of the run or across it', () => {
    expect(spansBehind({ x_mm: 2000, y_mm: -1500, rotation_deg: 0, width_mm: 2400, depth_mm: 600 }, walls, openings)).toEqual([]);
    expect(spansBehind({ x_mm: 2000, y_mm: 350, rotation_deg: 90, width_mm: 2400, depth_mm: 600 }, walls, openings)).toEqual([]);
  });
});

describe('a stored layout is what is drawn and what is priced', () => {
  const run = {
    id: 'r', kind: 'kitchen_base', width_mm: 2400, depth_mm: 600, height_mm: 900,
    kitchen_layout: { modules: [{ type: 'drawers', width_mm: 600 }, { type: 'oven_base', width_mm: 600 }, { type: 'door2', width_mm: 1200 }] },
  };
  it('draws the stored units', () => {
    expect(kitchenPieces(run, { plinth_mm: 100, front_mm: 18, worktop_mm: 40 }).map((p) => p.type)).toEqual(['drawers', 'oven_base', 'door2']);
  });
  it('prices the stored units', () => {
    const c = kitchenCompositionFromRoom([run]);
    expect(c.base.modules?.map((m) => `${m.type}:${m.width_cm}`)).toEqual(['drawers:60', 'oven_base:60', 'door2:120']);
  });
  it('falls back to the auto layout when nothing is stored, the same for drawing and price', () => {
    const bare = { ...run, kitchen_layout: null };
    const drawn = kitchenPieces(bare, { plinth_mm: 100, front_mm: 18, worktop_mm: 40 }).map((p) => p.type);
    const ctx = runContext(bare)!;
    expect(drawn).toEqual(runModulesOf(bare).map((m) => m.type));
    expect(placeRun(autoLayout('kitchen_base', ctx), ctx).built.map((m) => m.type)).toEqual(drawn);
  });
});

describe('units read from a drawing', () => {
  it('keeps printed units, drops nameless or widthless ones, and gives every object a list', async () => {
    const { sanitizeSceneRead } = await import('../../src/lib/scene/sceneReadSchema');
    const read = sanitizeSceneRead({
      read_ok: true,
      rooms: [{ name: 'K', outline: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }] }],
      objects: [
        { label: 'Sink run', kind: 'sink', units: [{ type: 'sink_base', width_mm: 900 }, { type: '', width_mm: 600 }, { type: 'door2', width_mm: 0 }] },
        { label: 'Sofa', kind: 'sofa' },
      ],
    });
    expect(read.objects[0].units).toEqual([{ type: 'sink_base', width_mm: 900 }]);
    expect(read.objects[1].units).toEqual([]);
  });
});

describe('a board decor is laid at its recorded repeat', () => {
  it('reads "W x L" and a single size in mm, and nothing else', async () => {
    const { decorRepeatM, resolveFinish } = await import('../../src/lib/scene/sceneSurfaces');
    expect(decorRepeatM({ metadata: { decor_repeat_mm: '1300x2800' } })).toEqual([1.3, 2.8]);
    expect(decorRepeatM({ metadata: { decor_repeat_mm: '600' } })).toEqual([0.6, 0.6]);
    expect(decorRepeatM({ metadata: { decor_repeat_mm: '' } })).toBeNull();
    expect(decorRepeatM({ metadata: {} })).toBeNull();
    const board = { id: 'b', name: 'Oak 18mm', imageUrl: 'https://x/oak.jpg', attributes: null, metadata: { decor_repeat_mm: '1300x2800' } };
    const f = resolveFinish({ colour_hex: null }, board)!;
    expect([f.tileW, f.tileL, f.jointed]).toEqual([1.3, 2.8, false]);
  });
});
