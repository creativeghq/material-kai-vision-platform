import { describe, it, expect } from 'vitest';

import { drawingChecks, runShortfall, unitStated, type KitchenLayout } from '@/lib/scene/kitchenComposition';
import { kitchenPlan } from '@/lib/scene/kitchenDrawings';

const run = (over: Partial<{ label: string; kind: string; width_mm: number; height_mm: number; elevation_mm: number; x_mm: number; y_mm: number; kitchen_layout: KitchenLayout | null }>) => ({
  id: 'r', label: 'Sink Wall', kind: 'kitchen_base', x_mm: 1140, y_mm: 300, rotation_deg: 0, width_mm: 2280, depth_mm: 600, height_mm: 900, elevation_mm: 0,
  kitchen_layout: null as KitchenLayout | null, ...over,
});

describe('a kitchen drawing says which figures were given and which were assumed', () => {
  const read: KitchenLayout = {
    source: 'read', confirmed: false,
    modules: [{ type: 'corner', width_mm: 600, printed: false }, { type: 'sink_base', width_mm: 1080, printed: true }, { type: 'corner', width_mm: 600, printed: false }],
  };

  it('a printed width is stated, an inferred one is assumed until a person confirms the run', () => {
    const dims = kitchenPlan([run({ kitchen_layout: read })]).dims.filter((d) => d.tone);
    expect(dims.map((d) => d.tone)).toEqual(['assumed', 'stated', 'assumed']);
    const confirmed = kitchenPlan([run({ kitchen_layout: { ...read, confirmed: true } })]).dims.filter((d) => d.tone);
    expect(confirmed.every((d) => d.tone === 'stated')).toBe(true);
    expect(unitStated(null, { type: 'door1', width_mm: 600, x_mm: 0 })).toBe(false);
  });

  it('a run its units do not cover is a conflict, drawn and failed, never stretched', () => {
    const short = run({ kitchen_layout: { modules: [{ type: 'sink_base', width_mm: 1000 }, { type: 'drawers', width_mm: 600 }] } });
    expect(runShortfall(short)).toEqual({ from_mm: 1600, to_mm: 2280 });
    expect(kitchenPlan([short]).conflicts).toHaveLength(1);
    const chain = drawingChecks([short]).find((c) => c.rule === 'Every chain closes on its run')!;
    expect(chain.ok).toBe(false);
    expect(chain.detail).toContain('68 cm not covered');
  });

  it('flags an unconfirmed read, a non-standard appliance and a wall run with nothing beneath it', () => {
    const checks = drawingChecks([
      run({ kitchen_layout: read }),
      run({ label: 'Fridge', kind: 'kitchen_tall', x_mm: 3000, width_mm: 910, height_mm: 2100, kitchen_layout: { modules: [{ type: 'fridge_housing', width_mm: 910 }] } }),
      run({ label: 'Upper Left', kind: 'kitchen_wall', x_mm: 6000, width_mm: 600, height_mm: 700, elevation_mm: 1450, kitchen_layout: { modules: [{ type: 'door1', width_mm: 600 }] } }),
    ]);
    const byRule = Object.fromEntries(checks.map((c) => [c.rule, c]));
    expect(byRule['Units confirmed by a person'].ok).toBe(false);
    expect(byRule['Appliances fit a standard opening'].detail).toContain('Fridge Housing 91 cm');
    expect(byRule['Wall units sit over a base run'].detail).toContain('Upper Left');
    expect(byRule['Heights are buildable'].ok).toBe(true);
  });

  it('a room with no kitchen has no kitchen checks', () => {
    expect(drawingChecks([run({ kind: 'sofa' })])).toEqual([]);
  });
});
