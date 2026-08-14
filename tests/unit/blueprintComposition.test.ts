/**
 * Guards the zone composition — how a configured kitchen becomes metres, counts and money.
 *
 * WHY THIS EXISTS
 * ---------------
 * Composition introduces a SECOND source of quantity next to the typed dimensions, and a second
 * source of a number is exactly the shape that has cost this platform the most (see the money
 * derivation rules in CLAUDE.md). Two failure modes are silent by construction and both are
 * pinned here:
 *
 *  1. DOUBLE COUNTING. A zone prices its units through its own derived lines. The option_group its
 *     door-model global is bound to must therefore stop being priced as a line of its own. Miss
 *     that and every cabinet front is charged twice — and the result is a valid number, so no
 *     typecheck and no integrity probe can see it.
 *  2. MIRROR DRIFT. The derivation exists twice: the edge copy writes persisted plan money, the
 *     frontend copy drives the anonymous configurator's live total. If they disagree, the price a
 *     visitor is shown is not the price that gets recorded. The mirror is GENERATED, and the last
 *     test here catches a hand edit locally. In CI it is a belt-and-braces check rather than a
 *     gate — `npm run gen:all` runs before `npm test` and commits any drift back, so a hand-edited
 *     mirror is overwritten there rather than failing the build. That is the intended outcome for
 *     a generated file; the test is what stops you shipping one before the push.
 *
 * It asserts RULES and RELATIONSHIPS, never the starter's actual rates — those live in the DB and
 * are meant to be edited in the admin, so a test pinning them would fail on every legitimate
 * re-price.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  absorbedGroups,
  defaultComposition,
  deriveComposition,
  derivePlanComposition,
  hasComposition,
  rateChoices,
  rateItemsFromTables,
  snapshotRateTables,
  zoneEnabled,
} from '../../supabase/functions/_shared/blueprint/composition';
import type { Composition, ZoneDef } from '../../supabase/functions/_shared/blueprint/composition';
import { computeBlueprint } from '../../supabase/functions/_shared/blueprint/compute';
import { expectedMirror, SOURCE, TARGET } from '../../scripts/gen-blueprint-mirror.mjs';

// A miniature kitchen carrying every shape that matters: a per-metre rate table two zones share,
// a per-piece module, a module option, an optional zone, and a surface that follows another zone.
const RATES = 'Cabinet model';
const SURFACES = 'Worktop';

const items: Record<string, any>[] = [
  { id: 'sec', parent_id: null, sort_order: 0, kind: 'section', label: 'Cabinets' },
  { id: 'cheap', parent_id: 'sec', sort_order: 0, kind: 'task', label: 'Cheap', unit: 'm', option_group: RATES, material_cost: 100, margin_pct: 0, quantity_formula: '= run_length', default_quantity: 1 },
  { id: 'posh', parent_id: 'sec', sort_order: 1, kind: 'task', label: 'Posh', unit: 'm', option_group: RATES, tier: 'good', material_cost: 200, margin_pct: 0, quantity_formula: '= run_length', default_quantity: 1 },
  { id: 'hpl', parent_id: 'sec', sort_order: 2, kind: 'task', label: 'HPL top', unit: 'm', option_group: SURFACES, tier: 'good', material_cost: 50, margin_pct: 0, quantity_formula: '= worktop_length', default_quantity: 1 },
  { id: 'stone', parent_id: 'sec', sort_order: 3, kind: 'task', label: 'Stone top', unit: 'm', option_group: SURFACES, material_cost: 125, margin_pct: 0, quantity_formula: '= worktop_length', default_quantity: 1 },
  // An ordinary per-metre service line. It must keep working off the DERIVED run length.
  { id: 'fit', parent_id: 'sec', sort_order: 4, kind: 'task', label: 'Installation', unit: 'm', labor_rate: 10, margin_pct: 0, quantity_formula: '= run_length', default_quantity: 1, default_selected: true },
];

const schema: ZoneDef[] = [
  {
    key: 'base', label: 'Bottom units', kind: 'units', length_var: 'run_length',
    globals: [
      { key: 'door_model', label: 'Door model', type: 'option', option_group: RATES, is_rate_source: true },
      { key: 'height', label: 'Height', type: 'number', unit: 'cm', default: 72 },
    ],
    modules: [
      { key: 'door2', label: '2-door', default_width_cm: 80, price_mode: 'per_m' },
      {
        key: 'drawers', label: 'Drawer bank', default_width_cm: 60, price_mode: 'per_m',
        options: [{
          key: 'runners', label: 'Drawer set', default: 'g2',
          choices: [{ value: 'g2', label: 'Grass 2', price: 80 }, { value: 'b3', label: 'Blum 3', price: 145 }],
        }],
      },
      { key: 'panel', label: 'End panel', default_width_cm: 0, price_mode: 'per_piece', unit_price: 45, counts_length: false },
    ],
    default_modules: [{ type: 'door2', width_cm: 80, qty: 2 }],
  },
  {
    key: 'wall', label: 'Top units', kind: 'units', length_var: 'wall_run_length',
    globals: [{ key: 'door_model', label: 'Door model', type: 'option', option_group: RATES, is_rate_source: true }],
    modules: [{ key: 'door2', label: '2-door', default_width_cm: 80, price_mode: 'per_m' }],
  },
  {
    key: 'island', label: 'Island', kind: 'units', optional: true, length_var: 'island_length',
    globals: [{ key: 'door_model', label: 'Door model', type: 'option', option_group: RATES, is_rate_source: true }],
    modules: [{ key: 'door2', label: '2-door', default_width_cm: 80, price_mode: 'per_m' }],
  },
  {
    key: 'worktop', label: 'Worktop', kind: 'surface', length_from: 'base', length_var: 'worktop_length',
    globals: [{ key: 'material', label: 'Material', type: 'option', option_group: SURFACES, is_rate_source: true }],
    modules: [],
  },
];

const cfg = (over: Composition = {}): Composition => ({
  base: { globals: { door_model: 'posh', height: 72 }, modules: [{ id: 'r1', type: 'door2', width_cm: 80, qty: 2 }] },
  wall: { globals: { door_model: 'cheap' }, modules: [{ id: 'r2', type: 'door2', width_cm: 80, qty: 1 }] },
  worktop: { globals: { material: 'hpl' } },
  ...over,
});

describe('zone composition — quantities', () => {
  it('derives a zone length from its module widths, not from a typed number', () => {
    // 2 × 80cm = 1.60 m, published under the variable the old scalar used.
    expect(deriveComposition(schema, cfg(), items).vars.run_length).toBe(1.6);
  });

  it('publishes counts and per-type counts so a formula can price per unit', () => {
    const vars = deriveComposition(schema, cfg(), items).vars;
    expect(vars.base_units).toBe(2);
    expect(vars.base_door2_count).toBe(2);
    expect(vars.base_drawers_count).toBe(0);
  });

  it('lets a surface follow another zone, and lets an explicit length override it', () => {
    expect(deriveComposition(schema, cfg(), items).vars.worktop_length).toBe(1.6);
    const over = cfg({ worktop: { globals: { material: 'hpl' }, length_m: 4.2 } });
    expect(deriveComposition(schema, over, items).vars.worktop_length).toBe(4.2);
  });

  it('excludes modules that take no run length', () => {
    // A decorative end panel is charged but adds no metres — otherwise it inflates installation.
    const withPanel = cfg({
      base: { globals: { door_model: 'posh' }, modules: [
        { id: 'r1', type: 'door2', width_cm: 80, qty: 2 },
        { id: 'r3', type: 'panel', width_cm: 0, qty: 2 },
      ] },
    });
    const d = deriveComposition(schema, withPanel, items);
    expect(d.vars.run_length).toBe(1.6);
    expect(d.vars.base_units).toBe(4);
  });

  it('zeroes an optional zone that is switched off, rather than omitting its variable', () => {
    // A missing variable makes every formula referencing it fail and silently fall back to its
    // default quantity; an explicit 0 makes the same formula evaluate to the truth.
    const d = deriveComposition(schema, cfg(), items);
    expect(d.vars.island_length).toBe(0);
    expect(d.vars.island_enabled).toBe(0);
    expect(zoneEnabled(schema[2], undefined)).toBe(false);
  });
});

describe('zone composition — money', () => {
  const rate = (id: string) => rateChoices(items, RATES).find((c) => c.id === id)!.unit_price;

  it('prices a per-metre module as width × the zone rate', () => {
    const d = deriveComposition(schema, cfg(), items);
    const base = d.lines.find((l) => l.key === 'base:r1')!;
    expect(base.quantity).toBe(1.6);
    expect(base.unit_price).toBe(rate('posh'));
    expect(base.line_total).toBe(1.6 * 200);
  });

  it('lets two zones share one price list and still choose differently', () => {
    // The whole point of binding rather than duplicating: dark bottom, light top, one rate table.
    const d = deriveComposition(schema, cfg(), items);
    expect(d.lines.find((l) => l.key === 'base:r1')!.unit_price).toBe(rate('posh'));
    expect(d.lines.find((l) => l.key === 'wall:r2')!.unit_price).toBe(rate('cheap'));
  });

  it('prices a per-piece module flat, ignoring its width', () => {
    const withPanel = cfg({
      base: { globals: { door_model: 'posh' }, modules: [{ id: 'p', type: 'panel', width_cm: 0, qty: 3 }] },
    });
    const line = deriveComposition(schema, withPanel, items).lines.find((l) => l.key === 'base:p')!;
    expect(line.unit).toBe('pcs');
    expect(line.quantity).toBe(3);
    expect(line.line_total).toBe(135);
  });

  it('bills a module option once per piece, as its own line', () => {
    // A quote reads "3-drawer bank, Blum runners €145", not one opaque number.
    const withDrawers = cfg({
      base: { globals: { door_model: 'posh' }, modules: [{ id: 'd', type: 'drawers', width_cm: 60, qty: 2, options: { runners: 'b3' } }] },
    });
    const d = deriveComposition(schema, withDrawers, items);
    const opt = d.lines.find((l) => l.key === 'base:d:runners')!;
    expect(opt.quantity).toBe(2);
    expect(opt.line_total).toBe(290);
    // and the carcass is still charged per metre on top
    expect(d.lines.find((l) => l.key === 'base:d')!.line_total).toBe(1.2 * 200);
  });

  it('applies a size band to per-metre modules only', () => {
    const banded: ZoneDef[] = [{
      ...schema[0],
      globals: [
        { key: 'door_model', label: 'Door model', type: 'option', option_group: RATES, is_rate_source: true },
        { key: 'height', label: 'Height', type: 'number', unit: 'cm', default: 72, factors: [{ up_to: 72, factor: 1 }, { up_to: 999, factor: 1.25 }] },
      ],
    }];
    const tall = { base: { globals: { door_model: 'posh', height: 90 }, modules: [{ id: 'r1', type: 'door2', width_cm: 80, qty: 1 }] } };
    const short = { base: { globals: { door_model: 'posh', height: 72 }, modules: [{ id: 'r1', type: 'door2', width_cm: 80, qty: 1 }] } };
    expect(deriveComposition(banded, tall, items).lines[0].unit_price).toBe(250);
    expect(deriveComposition(banded, short, items).lines[0].unit_price).toBe(200);
  });

  it('says WHICH zone is unpriced instead of showing a confident zero', () => {
    const noPick = cfg({ base: { globals: {}, modules: [] } });
    const d = deriveComposition(schema, noPick, items);
    // No modules is a different problem from no material chosen, and the configurator has to
    // be able to tell the customer which one it is.
    expect(d.issues.some((i) => i.includes('Bottom units'))).toBe(true);
  });
});

describe('absorption — the double-count trap', () => {
  it('reports every option_group a zone global owns', () => {
    expect(absorbedGroups(schema).sort()).toEqual([RATES, SURFACES].sort());
  });

  it('does not also price an absorbed group as a standalone line', () => {
    const computed = computeBlueprint(items, {}, null, { schema, config: cfg() });
    const flatLabels = computed.sections.flatMap((s) => s.tasks).map((t) => t.label);
    // The rate-table rows are gone from the flat scope entirely...
    expect(flatLabels).not.toContain('Cheap');
    expect(flatLabels).not.toContain('Posh');
    expect(flatLabels).not.toContain('Stone top');
    // ...while their money still arrives, through the zone lines.
    expect(computed.subtotal).toBeGreaterThan(0);
  });

  it('charges a zone exactly once — the trap in one number', () => {
    const computed = computeBlueprint(items, {}, null, { schema, config: cfg() });
    const derived = deriveComposition(schema, cfg(), items);
    // base 1.6m × 200 + wall 0.8m × 100 + worktop 1.6m × 50 = 320 + 80 + 80 = 480
    expect(derived.total).toBe(480);
    // installation is the only surviving flat line: 1.6m × 10 = 16
    expect(computed.subtotal).toBe(496);
  });

  it('feeds the surviving flat lines the DERIVED length, not the typed one', () => {
    // `dims` deliberately carries a wrong run_length; the composition must win.
    const computed = computeBlueprint(items, { run_length: 99 }, null, { schema, config: cfg() });
    const fit = computed.sections.flatMap((s) => s.tasks).find((t) => t.label === 'Installation')!;
    expect(fit.quantity).toBe(1.6);
  });

  it('leaves a blueprint with no zones exactly as it was', () => {
    const before = computeBlueprint(items, { run_length: 4, worktop_length: 4 }, null);
    const after = computeBlueprint(items, { run_length: 4, worktop_length: 4 }, null, { schema: [], config: {} });
    expect(after.subtotal).toBe(before.subtotal);
    expect(after.composition).toBeUndefined();
    expect(hasComposition([])).toBe(false);
  });
});

describe('defaults', () => {
  it('opens on the blueprint’s typical kitchen, not on an empty €0', () => {
    const seeded = defaultComposition(schema, items);
    expect(seeded.base.modules).toHaveLength(1);
    expect(seeded.base.modules![0]).toMatchObject({ type: 'door2', width_cm: 80, qty: 2 });
    expect(deriveComposition(schema, seeded, items).vars.run_length).toBe(1.6);
  });

  it('resolves an unset option global to the tier:good member, never to nothing', () => {
    const seeded = defaultComposition(schema, items);
    expect(seeded.base.globals!.door_model).toBe('posh');
    expect(seeded.worktop.globals!.material).toBe('hpl');
  });

  it('starts optional zones off and fills every module option with its default', () => {
    const seeded = defaultComposition(schema, items);
    expect(seeded.island.enabled).toBe(false);
    const withDrawer = defaultComposition(
      [{ ...schema[0], default_modules: [{ type: 'drawers' }] }],
      items,
    );
    expect(withDrawer.base.modules![0].options).toEqual({ runners: 'g2' });
  });
});

describe('a plan freezes the rates it was quoted on', () => {
  it('re-derives to the same money from the snapshot alone, with no blueprint present', () => {
    const plan = { schema, config: cfg(), rate_tables: snapshotRateTables(schema, items) };
    expect(derivePlanComposition(plan)!.total).toBe(deriveComposition(schema, cfg(), items).total);
  });

  it('keeps a live quote on its old price when the blueprint is re-priced', () => {
    const plan = { schema, config: cfg(), rate_tables: snapshotRateTables(schema, items) };
    const quotedAt = derivePlanComposition(plan)!.total;
    // The admin doubles the price list afterwards.
    const repriced = items.map((i) => (i.id === 'posh' ? { ...i, material_cost: 400 } : i));
    expect(deriveComposition(schema, cfg(), repriced).total).toBeGreaterThan(quotedAt);
    expect(derivePlanComposition(plan)!.total).toBe(quotedAt);
  });

  it('round-trips the frozen tables back into rate items without re-applying margin', () => {
    const withMargin = items.map((i) => (i.option_group === RATES ? { ...i, margin_pct: 20 } : i));
    const tables = snapshotRateTables(schema, withMargin);
    const back = rateItemsFromTables(tables);
    const direct = rateChoices(withMargin, RATES).find((c) => c.id === 'posh')!.unit_price;
    expect(rateChoices(back, RATES).find((c) => c.id === 'posh')!.unit_price).toBe(direct);
  });
});

/** The one line the generator is allowed to rewrite: Deno resolves a file, Vite resolves a module. */
const EDGE_IMPORT = "import { computeLinePricing, round2 } from './formula.ts';";
const WEB_IMPORT = "import { computeLinePricing, round2 } from './blueprintFormula';";

describe('edge ⇄ frontend mirror parity', () => {
  it('the checked-in mirror is exactly what the generator produces', () => {
    // Not "behaves the same on a corpus" — byte equality, because the frontend copy exists only to
    // show a visitor the number the edge copy will record. Anything less than byte equality leaves
    // room for the shown price and the recorded price to differ.
    expect(readFileSync(TARGET, 'utf8')).toBe(expectedMirror());
  });

  it('differs from the edge copy in the module resolution ONLY', () => {
    // Pins what the generator is allowed to rewrite. If this ever needs widening, the two copies
    // have started to diverge in behaviour and the generated-mirror approach no longer holds.
    const edge = readFileSync(SOURCE, 'utf8');
    const mirror = readFileSync(TARGET, 'utf8');
    expect(edge).toContain(EDGE_IMPORT);
    expect(mirror).toContain(WEB_IMPORT);
    expect(mirror).not.toContain(EDGE_IMPORT);
    // Swap that one line back and the mirror IS the edge copy behind its banner. Nothing else
    // may differ: the two files are one derivation living in two module systems.
    expect(mirror.replace(WEB_IMPORT, EDGE_IMPORT).endsWith(edge)).toBe(true);
  });
});
