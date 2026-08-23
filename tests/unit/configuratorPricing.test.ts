/**
 * A flat per-metre line prices off the DERIVED run length (#382).
 *
 * THE DEFECT THIS EXISTS FOR. `<materialkai-configurator>` seeded its flat scope against the
 * blueprint's typed dimension defaults and let `composeEstimate` do the rest. That reads correctly
 * — `composeEstimate` does return merged `dims` — but it prices the flat items exactly as they are
 * handed in, so installation was billed on a run length that appeared nowhere on screen.
 *
 * Caught by running the built widget against the live endpoint on 2026-08-23, not by any check in
 * this repo: a 1.60 m layout with a 10/m fitting rate showed 490 where the blueprint derives 496.
 * Both are valid numbers, both typecheck, and the zone half was right the whole time — which is
 * what makes the ordering worth a test rather than a comment.
 */
import { describe, expect, it } from 'vitest';

import type { Composition, RateItemLike, ZoneDef } from '../../src/utils/blueprintComposition';
import { computeConfiguratorEstimate } from '../../src/embed/configuratorPricing';

const RATES = 'Cabinet model';

/** One zone, one rate table, and one flat line priced per metre of that zone's derived run. */
const SCHEMA: ZoneDef[] = [{
  key: 'base',
  label: 'Bottom units',
  kind: 'units',
  length_var: 'run_length',
  globals: [{ key: 'door_model', label: 'Door model', type: 'option', option_group: RATES, is_rate_source: true }],
  modules: [{ key: 'door2', label: '2-door', default_width_cm: 80, price_mode: 'per_m' }],
  default_modules: [{ type: 'door2', width_cm: 80, qty: 2 }],
} as ZoneDef];

const ITEMS = [
  { id: 'sec', parent_id: null, sort_order: 0, kind: 'section', label: 'Cabinets', margin_pct: 0 },
  { id: 'cheap', parent_id: 'sec', sort_order: 0, kind: 'task', label: 'Cheap door', unit: 'm', option_group: RATES, material_cost: 100, margin_pct: 0, quantity_formula: '= run_length', default_quantity: 1 },
  { id: 'posh', parent_id: 'sec', sort_order: 1, kind: 'task', label: 'Posh door', unit: 'm', option_group: RATES, tier: 'good', material_cost: 300, margin_pct: 0, quantity_formula: '= run_length', default_quantity: 1 },
  // The line that broke: OUTSIDE every zone, priced per metre of a variable a zone publishes.
  { id: 'fit', parent_id: 'sec', sort_order: 2, kind: 'task', label: 'Installation', unit: 'm', labor_rate: 10, margin_pct: 0, quantity_formula: '= run_length', default_quantity: 1, default_selected: true },
] as unknown as RateItemLike[];

const CONFIG: Composition = {
  base: { globals: { door_model: 'posh' }, modules: [{ id: 'r1', type: 'door2', width_cm: 80, qty: 2 }] },
};

describe('a flat per-metre line follows the layout', () => {
  it('derives the run length from the module widths', () => {
    const c = computeConfiguratorEstimate(SCHEMA, CONFIG, ITEMS, {});
    // 2 x 80cm, published under the variable the old typed scalar used.
    expect(c?.derived.vars.run_length).toBe(1.6);
  });

  it('prices installation on the derived metres, not on default_quantity', () => {
    const c = computeConfiguratorEstimate(SCHEMA, CONFIG, ITEMS, {});
    // 1.6 m x 10/m = 16. The bug produced 10 — the formula falling back to a quantity of 1
    // because run_length was not in scope when the flat items were seeded.
    expect(c!.subtotal - c!.derived.total).toBe(16);
  });

  it('scales with the layout rather than staying put', () => {
    const wider: Composition = {
      base: { globals: { door_model: 'posh' }, modules: [{ id: 'r1', type: 'door2', width_cm: 80, qty: 4 }] },
    };
    const a = computeConfiguratorEstimate(SCHEMA, CONFIG, ITEMS, {})!;
    const b = computeConfiguratorEstimate(SCHEMA, wider, ITEMS, {})!;
    // Double the units, double the flat per-metre line. The seeded-once bug pinned it at 10 for
    // every layout, which is invisible until somebody checks two of them.
    expect(b.subtotal - b.derived.total).toBe((a.subtotal - a.derived.total) * 2);
  });

  it('absorbs the option group the zone global owns, so cabinets are not charged twice', () => {
    const c = computeConfiguratorEstimate(SCHEMA, CONFIG, ITEMS, {})!;
    expect(c.derived.absorbed_groups).toContain(RATES);
    // The zone prices the run itself: 1.6 m x 300 = 480.
    expect(c.derived.total).toBe(480);
    // ...and the rate table's members contribute nothing on their own.
    expect(c.subtotal).toBe(496);
  });
});
