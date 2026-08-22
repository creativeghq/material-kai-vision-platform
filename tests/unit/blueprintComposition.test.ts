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
  optionFlags,
  defaultComposition,
  deriveComposition,
  derivePlanComposition,
  hasComposition,
  rateChoices,
  rateItemsFromTables,
  snapshotRateTables,
  declaredYieldKeys,
  SERVICE_YIELD_KEYS,
  yieldMeta,
  zoneEnabled,
} from '../../supabase/functions/_shared/blueprint/composition';
import type { Composition, ZoneDef } from '../../supabase/functions/_shared/blueprint/composition';
import { computeBlueprint } from '../../supabase/functions/_shared/blueprint/compute';
import { compositionRows } from '../../supabase/functions/_shared/blueprint/plan-rows';
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
    hinge_bands: [{ up_to: 90, count: 2 }, { up_to: 999, count: 5 }],
    modules: [
      { key: 'door2', label: '2-door', default_width_cm: 80, price_mode: 'per_m', yields: { doors: 2, shelves: 1, legs: 4 } },
      {
        key: 'drawers', label: 'Drawer bank', default_width_cm: 60, price_mode: 'per_m',
        yields: { legs: 4 },
        options: [{
          key: 'runners', label: 'Drawer set', default: 'g2',
          choices: [
            { value: 'g2', label: 'Grass 2', price: 80, yields: { drawers: 2, runner_sets: 1 } },
            { value: 'b3', label: 'Blum 3', price: 145, yields: { drawers: 3, runner_sets: 1 } },
            { value: 'free', label: 'Included', yields: { drawers: 2, runner_sets: 1 } },
          ],
        }],
      },
      { key: 'corner', label: 'Corner unit', default_width_cm: 90, price_mode: 'per_m', yields: { doors: 1, shelves: 1, legs: 4 } },
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

/** A layout with N corner units, so a suggestion derived from base_corner_count has something to read. */
const cornerCfg = (corners: number): Composition => cfg({
  base: { globals: { door_model: 'posh', height: 72 }, modules: [
    { id: 'r1', type: 'door2', width_cm: 80, qty: 2 },
    ...(corners > 0 ? [{ id: 'c1', type: 'corner', width_cm: 90, qty: corners }] : []),
  ] },
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

describe('hardware schedule', () => {
  const drawerCfg = (runners: string, qty = 1) => cfg({
    base: {
      globals: { door_model: 'posh', height: 72 },
      modules: [
        { id: 'r1', type: 'door2', width_cm: 80, qty: 2 },
        { id: 'd1', type: 'drawers', width_cm: 60, qty, options: { runners } },
      ],
    },
  });

  it('counts what the units are made of, per piece', () => {
    // 2 × 2-door: 4 doors, 2 shelves, 8 legs. Plus a drawer bank: 4 more legs.
    const vars = deriveComposition(schema, drawerCfg('g2'), items).vars;
    expect(vars.base_doors).toBe(4);
    expect(vars.base_shelves).toBe(2);
    expect(vars.base_legs).toBe(12);
  });

  it('takes the drawer count from the runner CHOICE, not the bank count', () => {
    // The whole reason `grass_3` stopped being an opaque string: three banks of three drawers is
    // nine drawer boxes to order, and the old model could only ever say "three drawer units".
    expect(deriveComposition(schema, drawerCfg('b3', 3), items).vars.total_drawers).toBe(9);
    expect(deriveComposition(schema, drawerCfg('g2', 3), items).vars.total_drawers).toBe(6);
    expect(deriveComposition(schema, drawerCfg('b3', 3), items).vars.total_runner_sets).toBe(3);
  });

  it('counts a free choice yields — no extra charge is not no drawer boxes', () => {
    expect(deriveComposition(schema, drawerCfg('free'), items).vars.total_drawers).toBe(2);
  });

  it('derives hinges from the door HEIGHT, not two per door everywhere', () => {
    // A 210cm larder door does not take two hinges, and a kitchen that assumes it does arrives on
    // site short. 4 doors × 2 at 72cm; the same 4 doors × 5 once the zone is full height.
    expect(deriveComposition(schema, cfg(), items).vars.base_hinges).toBe(8);
    const tall = cfg({ base: { globals: { door_model: 'posh', height: 210 }, modules: [{ id: 'r1', type: 'door2', width_cm: 80, qty: 2 }] } });
    expect(deriveComposition(schema, tall, items).vars.base_hinges).toBe(20);
  });

  it('publishes run totals a per-run fitting can be counted from', () => {
    const vars = deriveComposition(schema, cfg(), items).vars;
    expect(vars.total_units).toBe(3);   // 2 base + 1 wall
    expect(vars.total_runs).toBe(2);    // two runs with units in them
    expect(vars.total_run_length).toBe(2.4);
  });

  it('renders a schedule of everything non-zero, and nothing that is zero', () => {
    const d = deriveComposition(schema, cfg(), items);
    const byKey = Object.fromEntries(d.schedule.map((r) => [r.key, r]));
    expect(byKey.hinges).toMatchObject({ quantity: 8, unit: 'pcs' });
    expect(byKey.drawers).toBeUndefined();  // no drawer bank in this configuration
  });
});

describe('a line conditional on a choice', () => {
  it('publishes opt_<key> for the chosen member and 0 for the others', () => {
    const flags = optionFlags([
      { option_key: 'handles', is_selected: true },
      { option_key: 'gola', is_selected: false },
    ]);
    expect(flags).toEqual({ opt_handles: 1, opt_gola: 0 });
  });

  it('never lets a later unselected row flip a selected key back to 0', () => {
    // Two members can share a key across zones; seeing one selected is enough.
    expect(optionFlags([
      { option_key: 'gola', is_selected: true },
      { option_key: 'gola', is_selected: false },
    ]).opt_gola).toBe(1);
  });

  it('switches every gola part on and off together', () => {
    // The bug this replaces: the base rail was in the pick-one group and the WALL rail was a
    // separate toggle defaulting off, so choosing handleless fitted the bottom and silently left
    // the top with no profile.
    const golaItems = [
      ...items,
      { id: 'hsec', parent_id: null, sort_order: 1, kind: 'section', label: 'Hardware' },
      { id: 'h-std', parent_id: 'hsec', sort_order: 0, kind: 'task', label: 'Handles', option_group: 'Handle system', option_key: 'handles', tier: 'good', is_allowance: true, allowance_amount: 0, margin_pct: 0 },
      { id: 'h-gola', parent_id: 'hsec', sort_order: 1, kind: 'task', label: 'Gola profile', unit: 'm', option_group: 'Handle system', option_key: 'gola', quantity_formula: '= total_run_length', material_cost: 25, margin_pct: 0 },
      { id: 'h-vert', parent_id: 'hsec', sort_order: 2, kind: 'task', label: 'Gola verticals', unit: 'pcs', quantity_formula: '= opt_gola * total_units', is_schedule: true, default_selected: true, margin_pct: 0 },
      { id: 'h-cap', parent_id: 'hsec', sort_order: 3, kind: 'task', label: 'Gola end caps', unit: 'pcs', quantity_formula: '= opt_gola * total_runs * 2', is_schedule: true, default_selected: true, margin_pct: 0 },
    ];
    const qty = (sel: Set<string> | null, label: string) =>
      computeBlueprint(golaItems, {}, sel, { schema, config: cfg() })
        .sections.flatMap((s) => s.tasks).find((t) => t.label === label)!.quantity;

    // Standard handles is the tier:'good' default — every gola part is 0, not "some of them".
    expect(qty(null, 'Gola verticals')).toBe(0);
    expect(qty(null, 'Gola end caps')).toBe(0);

    const gola = new Set(['h-gola']);
    expect(qty(gola, 'Gola verticals')).toBe(3);
    expect(qty(gola, 'Gola end caps')).toBe(4);
  });
});

describe('a schedule line is a count, not a price', () => {
  const withSchedule = [
    ...items,
    { id: 'hsec', parent_id: null, sort_order: 1, kind: 'section', label: 'Hardware' },
    { id: 'hinges', parent_id: 'hsec', sort_order: 0, kind: 'task', label: 'Hinges', unit: 'pcs', quantity_formula: '= total_hinges', is_schedule: true, default_selected: true, margin_pct: 0 },
    { id: 'doors', parent_id: 'hsec', sort_order: 1, kind: 'task', label: 'Door fronts', unit: 'pcs', quantity_formula: '= total_doors', is_schedule: true, default_selected: true, margin_pct: 0 },
    { id: 'shelves', parent_id: 'hsec', sort_order: 2, kind: 'task', label: 'Shelves', unit: 'pcs', quantity_formula: '= total_shelves', is_schedule: true, default_selected: true, margin_pct: 0 },
    { id: 'legs', parent_id: 'hsec', sort_order: 3, kind: 'task', label: 'Legs', unit: 'pcs', quantity_formula: '= total_legs', is_schedule: true, default_selected: true, margin_pct: 0 },
  ];

  it('carries its derived quantity', () => {
    const c = computeBlueprint(withSchedule, {}, null, { schema, config: cfg() });
    const hinges = c.sections.flatMap((s) => s.tasks).find((t) => t.label === 'Hinges')!;
    expect(hinges.quantity).toBe(8);
    expect(hinges.is_schedule).toBe(true);
  });

  it('adds nothing to the plan subtotal', () => {
    // The schedule counts; the quote prices. A hardware line quietly inflating the plan total is
    // the same number arriving twice by the time it reaches the quote.
    const without = computeBlueprint(items, {}, null, { schema, config: cfg() }).subtotal;
    const withIt = computeBlueprint(withSchedule, {}, null, { schema, config: cfg() }).subtotal;
    expect(withIt).toBe(without);
  });

  it('stays at 0 when no rate is set, rather than inventing one', () => {
    // material_cost NULL means NOT PRICED YET and must never render as a confident 0.00 line —
    // the plan UI and the quote both key off the null, so the two states have to stay distinct.
    const c = computeBlueprint(withSchedule, {}, null, { schema, config: cfg() });
    const hinges = c.sections.flatMap((s) => s.tasks).find((t) => t.label === 'Hinges')!;
    expect(hinges.unit_price).toBe(0);
    expect(hinges.line_total).toBe(0);
    expect(withSchedule.find((i) => i.id === 'hinges')!.material_cost).toBeUndefined();
  });

  it('raises an issue when a derived count reaches no schedule line at all', () => {
    // 8 hinges derived and nothing counting them is the silent-zero shape in another hat: the
    // kitchen needs them, the schedule says nothing, and the workshop finds out on fitting day.
    const partial = withSchedule.filter((i) => i.id !== 'hinges');
    const issues = computeBlueprint(partial, {}, null, { schema, config: cfg() }).composition!.issues;
    expect(issues.some((i) => i.includes('total_hinges'))).toBe(true);
    // ...and with every total consumed, it says nothing.
    expect(computeBlueprint(withSchedule, {}, null, { schema, config: cfg() }).composition!.issues).toEqual([]);
  });
});

describe('the anonymous starters payload carries every column the client reads', () => {
  // WHY: `public-project-plan → starters` selects an EXPLICIT column list, and the client's
  // seedPlanItems reads `bi.<column>` off what comes back. A column added to the table and to the
  // client but not to that list fails in total silence — which is exactly what happened when
  // is_schedule and option_key shipped: hardware counts rendered as on/off switches, and
  // `opt_gola` was never published, so every gola line's formula failed and fell back to its
  // default quantity of 0. No error, no empty result, just four fittings that quietly stopped
  // existing. The required set is DERIVED from the client rather than restated here, so this
  // cannot pass by being updated in lockstep with the bug.
  const CLIENT = readFileSync('src/utils/blueprintCompute.ts', 'utf8');
  const FN = readFileSync('supabase/functions/public-project-plan/index.ts', 'utf8');

  const columnsClientReads = Array.from(new Set(
    Array.from(CLIENT.matchAll(/\bbi\.([a-z_]+)/g)).map((m) => m[1]),
  )).sort();

  const startersSelect = (() => {
    const idx = FN.indexOf(".from('blueprint_items')");
    expect(idx).toBeGreaterThan(-1);
    const after = FN.slice(idx, idx + 1200);
    const m = after.match(/\.select\('([^']+)'\)/);
    expect(m).toBeTruthy();
    return m![1].split(',').map((c) => c.trim());
  })();

  it('reads at least one column, or the derivation below is vacuous', () => {
    expect(columnsClientReads.length).toBeGreaterThan(10);
  });

  it('selects every column seedPlanItems reads', () => {
    const missing = columnsClientReads.filter((c) => !startersSelect.includes(c));
    expect(missing).toEqual([]);
  });
});

describe('an accessory is a count, not a switch', () => {
  // WHY: these lines used to be ALLOWANCES, and computeLinePricing returns an allowance's lump sum
  // whatever the quantity says. That is what pinned every accessory at exactly one — you could not
  // ask for three wire baskets, and a quantity field would have lied if you had. They are ordinary
  // per-piece material lines now, so the quantity finally means something.
  const accessories = [
    ...items,
    { id: 'asec', parent_id: null, sort_order: 1, kind: 'section', label: 'Accessories' },
    { id: 'basket', parent_id: 'asec', sort_order: 0, kind: 'task', label: 'Wire basket', unit: 'pcs', material_cost: 35, margin_pct: 0, is_allowance: false, default_quantity: 1, default_selected: false },
    // The shape this replaces, kept so the difference is visible rather than asserted from memory.
    { id: 'old', parent_id: 'asec', sort_order: 1, kind: 'task', label: 'Old-style allowance', unit: 'pcs', is_allowance: true, allowance_amount: 35, margin_pct: 0, default_quantity: 3, default_selected: true },
  ];
  const find = (label: string, rows = accessories, sel: Set<string> | null = null) =>
    computeBlueprint(rows, {}, sel, { schema, config: cornerCfg(1) })
      .sections.flatMap((s) => s.tasks).find((t) => t.label === label)!;

  it('multiplies by the quantity', () => {
    // 3 baskets at 35 is 105. The old allowance shape returns 35 for the same quantity of 3 —
    // which is exactly why an accessory could never be counted.
    const three = accessories.map((i) => (i.id === 'basket' ? { ...i, default_quantity: 3 } : i));
    expect(find('Wire basket', three, new Set(['basket'])).line_total).toBe(105);
    expect(find('Old-style allowance').line_total).toBe(35);
  });

  it('costs nothing while it is not selected, but still shows what one costs', () => {
    expect(find('Wire basket').line_total).toBe(0);
    expect(find('Wire basket').unit_price).toBe(35);
  });
});

describe('what the layout implies', () => {
  const lemans = (extra: Record<string, unknown> = {}) => [
    ...items,
    { id: 'asec', parent_id: null, sort_order: 1, kind: 'section', label: 'Accessories' },
    {
      id: 'lemans', parent_id: 'asec', sort_order: 0, kind: 'task', label: 'Le Mans', unit: 'pcs',
      material_cost: 302, margin_pct: 0, default_quantity: 1, default_selected: false,
      suggests_quantity: '= base_corner_count', ...extra,
    },
  ];
  const task = (rows: Record<string, unknown>[], corners: number, label = 'Le Mans') =>
    computeBlueprint(rows, {}, null, { schema, config: cornerCfg(corners) })
      .sections.flatMap((s) => s.tasks).find((x) => x.label === label)!;

  it('reports the quantity the composition derives', () => {
    expect(task(lemans(), 2).suggested_quantity).toBe(2);
    // No corner units at all: the suggestion is zero, which is what lets "5 Le Mans in a kitchen
    // with no corners" be visible instead of silently accepted.
    expect(task(lemans(), 0).suggested_quantity).toBe(0);
  });

  it('suggests without driving — the quantity is still the caller’s', () => {
    // The distinction from quantity_formula: that one DERIVES the quantity and locks the field.
    // A mechanism count is a judgement (one corner may stay plain shelves), so the suggestion must
    // never overwrite what was asked for.
    const t = task(lemans({ default_selected: true }), 3);
    expect(t.suggested_quantity).toBe(3);
    expect(t.quantity).toBe(1);
    expect(t.line_total).toBe(302);
  });

  it('says nothing when the line does not ask', () => {
    expect(task(items, 1, 'Installation').suggested_quantity).toBeUndefined();
  });

  it('stays silent rather than guessing when the formula cannot resolve', () => {
    // An unknown variable must not collapse to 0 — that would read as "your layout has no corners",
    // which is a confident wrong answer where saying nothing is the honest one.
    const t = task(lemans({ default_selected: true, suggests_quantity: '= no_such_variable' }), 2);
    expect(t.suggested_quantity).toBeUndefined();
  });
});

// ── Appliances ──────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS
// ---------------
// An appliance is the one thing in a kitchen whose PRICE and whose CONSEQUENCES come apart. "I
// already have a fridge-freezer" is the commonest answer on a kitchen survey; it takes the money to
// zero and changes nothing at all about the 60cm aperture, the socket behind it or the tall housing
// it goes in. Every failure mode below is silent by construction — a €0 line is a valid line, an
// uncounted socket is a plausible absence, and a fridge placed in a tall unit that the layout does
// not contain produces a perfectly confident total.

const OVENS = 'Oven model';

const applianceItems: Record<string, any>[] = [
  ...items,
  { id: 'oven-basic', parent_id: 'sec', sort_order: 10, kind: 'task', label: 'Basic oven', unit: 'pcs', option_group: OVENS, tier: 'good', material_cost: 400, margin_pct: 0 },
  { id: 'oven-posh', parent_id: 'sec', sort_order: 11, kind: 'task', label: 'Pyrolytic oven', unit: 'pcs', option_group: OVENS, material_cost: 900, margin_pct: 0 },
];

const kitchen: ZoneDef[] = [
  {
    key: 'base', label: 'Bottom units', kind: 'units', length_var: 'run_length',
    globals: [{ key: 'door_model', label: 'Door model', type: 'option', option_group: RATES, is_rate_source: true }],
    modules: [
      { key: 'door2', label: '2-door', default_width_cm: 80, price_mode: 'per_m' },
      { key: 'dw_housing', label: 'Dishwasher housing', default_width_cm: 60, price_mode: 'per_m' },
    ],
  },
  {
    key: 'tall', label: 'Tall units', kind: 'units', length_var: 'tall_length',
    globals: [{ key: 'door_model', label: 'Door model', type: 'option', option_group: RATES, is_rate_source: true }],
    modules: [{ key: 'tall_housing', label: 'Tall appliance housing', default_width_cm: 60, price_mode: 'per_m' }],
  },
  {
    key: 'appliances', label: 'Appliances', kind: 'appliances',
    globals: [{
      key: 'energy', label: 'Energy available', type: 'choice', multi: true, default: ['electricity'],
      choices: [{ value: 'electricity', label: 'Electricity' }, { value: 'gas', label: 'Gas' }],
    }],
    appliances: [
      {
        key: 'fridge', label: 'Fridge-freezer', width_cm: 60, unit_price: 700, requires: { socket: 1 },
        placements: [
          { value: 'tall', label: 'In a tall unit', price: 120, housing: { zone: 'tall', module: 'tall_housing' } },
          { value: 'standalone', label: 'Stand alone' },
        ],
      },
      {
        key: 'dishwasher', label: 'Dishwasher', width_cm: 60, unit_price: 500,
        requires: { socket: 1, water_in: 1, waste_out: 1 },
        placements: [{ value: 'under', label: 'Under the worktop', price: 90, housing: { zone: 'base', module: 'dw_housing' } }],
      },
      { key: 'hob_gas', label: 'Gas hob', unit_price: 300, energy: 'gas', requires: { gas_point: 1, worktop_cutout: 1 } },
      { key: 'oven', label: 'Built-in oven', option_group: OVENS, requires: { socket_dedicated: 1 } },
      {
        key: 'hood', label: 'Cooker hood', unit_price: 250, requires: { socket: 1 },
        options: [{
          key: 'venting', label: 'Venting', default: 'extract',
          choices: [
            { value: 'extract', label: 'Extraction to outside', price: 60, yields: { duct_run: 1 } },
            { value: 'recirc', label: 'Recirculation', yields: { carbon_filter: 1 } },
          ],
        }],
      },
      { key: 'small', label: 'Worktop appliance', default_supply: 'existing', requires: { socket: 1 } },
    ],
    default_appliances: [{ type: 'fridge' }, { type: 'small', qty: 4 }],
  },
  {
    key: 'bar', label: 'Breakfast bar', kind: 'surface', length_var: 'bar_length',
    globals: [
      { key: 'diners', label: 'People dining', type: 'number', default: 4 },
      { key: 'material', label: 'Material', type: 'option', option_group: SURFACES, is_rate_source: true },
    ],
    seats: { global: 'diners', cm_per_seat: 60, min_cm: 120 },
    modules: [],
  },
];

/** A kitchen with two base units and whichever appliances the case under test cares about. */
const kcfg = (appliances: Record<string, any>[], over: Composition = {}): Composition => ({
  base: { globals: { door_model: 'posh' }, modules: [
    { id: 'b1', type: 'door2', width_cm: 80, qty: 2 },
    { id: 'b2', type: 'dw_housing', width_cm: 60, qty: 1 },
  ] },
  tall: { globals: { door_model: 'posh' }, modules: [{ id: 't1', type: 'tall_housing', width_cm: 60, qty: 1 }] },
  appliances: { globals: { energy: ['electricity'] }, appliances: appliances as never },
  bar: { globals: { diners: 4, material: 'hpl' } },
  ...over,
});

const appliance = (over: Record<string, any>) => ({ id: 'a1', supply: 'ours', qty: 1, ...over });

describe('an appliance is priced by who supplies it and by nothing else', () => {
  const fridge = (supply: string, placement = 'standalone') =>
    deriveComposition(kitchen, kcfg([appliance({ type: 'fridge', supply, placement })]), applianceItems);

  it('charges for one we supply and nothing for one the customer owns', () => {
    expect(fridge('ours').appliances[0].total).toBe(700);
    expect(fridge('existing').appliances[0].total).toBe(0);
  });

  it('books the same connections either way — this is the whole point', () => {
    // A €0 line is a valid line, so nothing downstream can tell "the customer owns it" from
    // "nobody thought about it". The socket is what proves the appliance was actually planned.
    expect(fridge('ours').appliances[0].requires).toEqual({ socket: 1 });
    expect(fridge('existing').appliances[0].requires).toEqual({ socket: 1 });
    expect(fridge('existing').vars.total_socket).toBe(1);
  });

  it('still charges the housing and the fitting for an appliance we did not sell', () => {
    // The aperture is cut, the door is hung on it and the trap is plumbed in regardless of whose
    // dishwasher it is. Only the machine itself follows the supply answer.
    expect(fridge('ours', 'tall').appliances[0].total).toBe(820);
    expect(fridge('existing', 'tall').appliances[0].total).toBe(120);
  });

  it('multiplies both the money and the connections by the quantity', () => {
    const d = deriveComposition(
      kitchen,
      kcfg([appliance({ type: 'small', supply: 'existing', qty: 4 })]),
      applianceItems,
    );
    expect(d.appliances[0].total).toBe(0);
    expect(d.vars.total_socket).toBe(4);
  });

  it('prices a model list per piece and defaults it to the good tier', () => {
    const d = deriveComposition(kitchen, kcfg([appliance({ type: 'oven' })]), applianceItems);
    expect(d.appliances[0].total).toBe(400);
    expect(d.appliances[0].model_label).toBe('Basic oven');
    const posh = deriveComposition(kitchen, kcfg([appliance({ type: 'oven', model: 'oven-posh' })]), applianceItems);
    expect(posh.appliances[0].total).toBe(900);
  });

  it('refuses to bill an unpriced appliance at nothing', () => {
    // Absent is not zero. `worktop_appliance` carries no price and no model list, so undertaking
    // to supply one has to say so — silently charging 0 for a machine we have promised to buy is
    // the same wrong-number-that-looks-right the schedule's NULL rate exists to avoid.
    const unpriced = deriveComposition(kitchen, kcfg([appliance({ type: 'small', supply: 'ours' })]), applianceItems);
    expect(unpriced.issues.some((i) => i.includes('Worktop appliance') && i.includes('no price'))).toBe(true);
    // …and the same row costed to the customer says nothing, because nobody is buying it.
    const owned = deriveComposition(kitchen, kcfg([appliance({ type: 'small', supply: 'existing' })]), applianceItems);
    expect(owned.issues.some((i) => i.includes('no price'))).toBe(false);
  });

  it('treats an explicit zero as included, not as unpriced', () => {
    const free: ZoneDef[] = kitchen.map((z) => (z.key !== 'appliances' ? z : {
      ...z,
      appliances: (z.appliances ?? []).map((a) => (a.key === 'small' ? { ...a, unit_price: 0 } : a)),
    }));
    const d = deriveComposition(free, kcfg([appliance({ type: 'small', supply: 'ours' })]), applianceItems);
    expect(d.issues.some((i) => i.includes('no price'))).toBe(false);
  });

  it('never prices an appliance model list twice', () => {
    // Same absorption trap as a zone's door-model list: the oven's money arrives through the
    // appliance line, so the list must stop being a pick-one choice in the flat scope.
    expect(absorbedGroups(kitchen)).toContain(OVENS);
    const flat = computeBlueprint(applianceItems, {}, null, { schema: kitchen, config: kcfg([appliance({ type: 'oven' })]) })
      .sections.flatMap((s) => s.tasks).map((t) => t.label);
    expect(flat).not.toContain('Basic oven');
    expect(flat).not.toContain('Pyrolytic oven');
  });
});

describe('an appliance choice costs money only when it is ours, and counts always', () => {
  const hood = (supply: string, venting: string) =>
    deriveComposition(kitchen, kcfg([appliance({ type: 'hood', supply, options: { venting } })]), applianceItems);

  it('adds the option price to one we supply', () => {
    expect(hood('ours', 'extract').appliances[0].total).toBe(310);
  });

  it('runs the duct for a hood the customer already owns', () => {
    // Extraction vs recirculation is a hole through a wall or a filter in a box. Which of the two
    // it is has nothing to do with who paid for the hood.
    expect(hood('existing', 'extract').appliances[0].total).toBe(0);
    expect(hood('existing', 'extract').vars.total_duct_run).toBe(1);
  });

  it('swaps the consequence with the choice', () => {
    const recirc = hood('ours', 'recirc');
    expect(recirc.vars.total_carbon_filter).toBe(1);
    // An explicit 0, not a missing variable: a `= total_duct_run` line has to read "no duct" here
    // rather than fail closed and fall back to its stored default.
    expect(recirc.vars.total_duct_run).toBe(0);
    expect(recirc.appliances[0].total).toBe(250);
    expect(recirc.schedule.some((r) => r.key === 'duct_run')).toBe(false);
  });
});

describe('the layout has to be able to hold the appliances', () => {
  it('names the missing cabinet rather than quietly adding one', () => {
    // Inserting a tall housing on the customer's behalf would change their price without them
    // asking; pricing the fridge anyway would produce a confident total for a kitchen that cannot
    // be built. Saying so is the only honest option.
    const noTall = kcfg([appliance({ type: 'fridge', placement: 'tall' })], {
      tall: { globals: { door_model: 'posh' }, modules: [] },
    });
    const issues = deriveComposition(kitchen, noTall, applianceItems).issues;
    expect(issues.some((i) => i.includes('Fridge-freezer') && i.includes('Tall appliance housing') && i.includes('Tall units'))).toBe(true);
  });

  it('counts the demand, not just the presence', () => {
    // One housing and two fridges is the same problem as no housing at all, and it is the shape a
    // presence check cannot see.
    const two = kcfg([appliance({ type: 'fridge', placement: 'tall', qty: 2 })]);
    expect(deriveComposition(kitchen, two, applianceItems).issues.some((i) => i.includes('the layout has 1'))).toBe(true);
  });

  it('says nothing when the housing is there', () => {
    const ok = kcfg([appliance({ type: 'fridge', placement: 'tall' })]);
    expect(deriveComposition(kitchen, ok, applianceItems).issues.some((i) => i.includes('Tall appliance housing'))).toBe(false);
  });

  it('raises nothing for a placement that needs no cabinet', () => {
    const free = kcfg([appliance({ type: 'fridge', placement: 'standalone' })]);
    expect(deriveComposition(kitchen, free, applianceItems).issues).toEqual([]);
  });
});

describe('an appliance cannot run on a supply the property does not have', () => {
  const hob = (energy: string[]) => deriveComposition(
    kitchen,
    kcfg([appliance({ type: 'hob_gas' })], { appliances: { globals: { energy }, appliances: [appliance({ type: 'hob_gas' })] as never } }),
    applianceItems,
  );

  it('flags a gas hob in an all-electric kitchen', () => {
    expect(hob(['electricity']).issues.some((i) => i.includes('Gas hob') && i.includes('gas'))).toBe(true);
  });

  it('stays quiet once the gas is listed', () => {
    expect(hob(['electricity', 'gas']).issues.some((i) => i.includes('Gas hob'))).toBe(false);
  });
});

describe('a spec answer is not a price list', () => {
  it('publishes a flag per answer so a formula can react to one', () => {
    const d = deriveComposition(kitchen, kcfg([]), applianceItems);
    expect(d.vars.appliances_energy_electricity).toBe(1);
    expect(d.vars.appliances_energy_gas).toBe(0);
  });

  it('holds several answers at once', () => {
    const both = kcfg([], { appliances: { globals: { energy: ['electricity', 'gas'] }, appliances: [] } });
    const d = deriveComposition(kitchen, both, applianceItems);
    expect(d.vars.appliances_energy_gas).toBe(1);
  });

  it('absorbs nothing — a choice global owns no option_group', () => {
    expect(absorbedGroups(kitchen).sort()).toEqual([RATES, SURFACES, OVENS].sort());
  });

  it('publishes zeroes for a zone that is switched off, never nothing', () => {
    const off: ZoneDef[] = kitchen.map((z) => (z.key === 'appliances' ? { ...z, optional: true } : z));
    const d = deriveComposition(off, kcfg([], { appliances: { enabled: false, globals: { energy: ['gas'] }, appliances: [] } }), applianceItems);
    expect(d.vars.appliances_energy_gas).toBe(0);
    expect(d.vars.appliances_enabled).toBe(0);
  });
});

describe('a breakfast bar is as long as the people at it', () => {
  const bar = (over: Record<string, any>) =>
    deriveComposition(kitchen, kcfg([], { bar: { globals: { diners: 4, material: 'hpl' }, ...over } }), applianceItems);

  it('derives the length from the seat count', () => {
    expect(bar({}).vars.bar_length).toBe(2.4);
    expect(bar({}).vars.bar_seats).toBe(4);
  });

  it('never goes below the minimum a bar can be built at', () => {
    expect(bar({ globals: { diners: 1, material: 'hpl' } }).vars.bar_length).toBe(1.2);
  });

  it('lets an explicit length win, the way it does over an inherited run', () => {
    expect(bar({ length_m: 3 }).vars.bar_length).toBe(3);
  });
});

describe('appliances are not a run', () => {
  it('leaves the run totals alone', () => {
    // `total_runs` drives the gola end caps. Counting an appliance zone as a run would put two
    // more profile caps on a kitchen for the crime of owning a fridge.
    const d = deriveComposition(kitchen, kcfg([appliance({ type: 'fridge', placement: 'standalone' })]), applianceItems);
    expect(d.vars.total_runs).toBe(2);   // bottom units + tall units
    expect(d.vars.total_units).toBe(4);  // 2 doors + 1 dishwasher housing + 1 tall housing
  });
});

describe('the services schedule', () => {
  it('reaches the schedule under the same labels the hardware does', () => {
    const d = deriveComposition(kitchen, kcfg([appliance({ type: 'dishwasher', supply: 'existing', placement: 'under' })]), applianceItems);
    const byKey = Object.fromEntries(d.schedule.map((r) => [r.key, r]));
    expect(byKey.socket).toMatchObject({ quantity: 1, label: 'Power sockets', unit: 'pcs' });
    expect(byKey.water_in.quantity).toBe(1);
    expect(byKey.waste_out.quantity).toBe(1);
  });

  it('publishes a zero for a key the schema can produce but this kitchen does not', () => {
    // The trap: `addYields` skips zeros, so `total_gas_point` would be UNDEFINED on an all-electric
    // kitchen — and a `= total_gas_point` line does not evaluate to 0 when its variable is missing,
    // it fails closed and falls back to whatever default quantity is stored on it. A wrong number
    // wearing the face of a right one, on a line nobody is looking at.
    const d = deriveComposition(kitchen, kcfg([appliance({ type: 'fridge', supply: 'existing', placement: 'standalone' })]), applianceItems);
    expect(d.vars.total_gas_point).toBe(0);
    expect(d.vars.total_carbon_filter).toBe(0);
    expect(d.vars.total_socket).toBe(1);
    // …and a zero stays OUT of the rendered schedule, which reports what to order.
    expect(d.schedule.some((r) => r.key === 'gas_point')).toBe(false);
  });

  it('knows every key the schema declares', () => {
    const keys = declaredYieldKeys(kitchen);
    expect(keys).toContain('socket');
    expect(keys).toContain('gas_point');
    expect(keys).toContain('duct_run');
    expect(keys).toContain('carbon_filter');
    // …including one no module or appliance ever writes down: hinges follow from the DOOR count,
    // so a schema with doors in it can produce them even though nothing declares them.
    expect(declaredYieldKeys(schema)).toContain('hinges');
    expect(keys).not.toContain('hinges');   // this fixture's modules carry no doors
  });

  it('gives every service key a real name, so the two lists cannot drift apart', () => {
    // SERVICE_YIELD_KEYS splits the schedule for the two audiences that read it; a key in that set
    // with no label would reach the electrician as a titleised variable name.
    for (const key of SERVICE_YIELD_KEYS) {
      const titleised = key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
      expect(yieldMeta(key).label).not.toBe(titleised);
    }
  });

  it('raises the same completeness issue as a hinge nobody counts', () => {
    // Nine sockets derived and no line counting them is the silent-zero shape: the kitchen needs
    // first-fix electrics, the schedule says nothing, and the electrician finds out on site.
    const issues = computeBlueprint(applianceItems, {}, null, {
      schema: kitchen,
      config: kcfg([appliance({ type: 'dishwasher', placement: 'under' })]),
    }).composition!.issues;
    expect(issues.some((i) => i.includes('total_socket'))).toBe(true);
    expect(issues.some((i) => i.includes('total_waste_out'))).toBe(true);
  });
});

describe('defaults — the appliances a kitchen usually has', () => {
  const seeded = defaultComposition(kitchen, applianceItems);

  it('opens on the blueprint’s typical appliance list', () => {
    expect(seeded.appliances.appliances).toHaveLength(2);
    expect(seeded.appliances.appliances![0]).toMatchObject({ type: 'fridge', supply: 'ours', placement: 'tall', qty: 1 });
  });

  it('starts an appliance most people already own on “I have one”', () => {
    // Defaulting a kettle to "we supply" quietly adds a kettle to somebody's kitchen quote.
    expect(seeded.appliances.appliances![1]).toMatchObject({ type: 'small', supply: 'existing', qty: 4 });
  });

  it('seeds a multi answer as a list and a single one as a value', () => {
    expect(seeded.appliances.globals!.energy).toEqual(['electricity']);
  });

  it('resolves an appliance model list to the good tier, never to nothing', () => {
    const withOven = defaultComposition(
      [{ ...kitchen[2], default_appliances: [{ type: 'oven' }] }],
      applianceItems,
    );
    expect(withOven.appliances.appliances![0].model).toBe('oven-basic');
  });
});

describe('what a PLAN says about the configuration', () => {
  // WHY: the plan rows are what a quote, a material list, a version and a change order are all
  // built from. A configuration detail that does not become a row here exists nowhere the fitter
  // will ever look — and the details most likely to be dropped are the ones worth nothing.
  let n = 0;
  const rowsFor = (cfg: Composition) => {
    n = 0;
    return compositionRows(deriveComposition(kitchen, cfg, applianceItems), 0, () => `id-${n++}`);
  };

  it('gives each priced zone a section and its lines', () => {
    const rows = rowsFor(kcfg([]));
    const sections = rows.filter((r) => r.kind === 'section').map((r) => r.label);
    expect(sections).toContain('Bottom units');
    expect(rows.every((r) => r.source === 'composition')).toBe(true);
  });

  it('carries an appliance the customer owns into the plan, priced at nothing', () => {
    // The €0 blind spot in its last hiding place: this row has no money in it, so every filter
    // that keeps a quote tidy drops it — taking with it the fact that a 60cm aperture and a socket
    // have to be left for a machine we are not selling.
    const rows = rowsFor(kcfg([appliance({ type: 'fridge', supply: 'existing', placement: 'tall' })]));
    const scope = rows.find((r) => r.label.includes('supplied by the client'));
    expect(scope).toBeTruthy();
    expect(scope!.label).toContain('Fridge-freezer');
    expect(scope!.label).toContain('in a tall unit');
    expect(scope!.quantity).toBe(1);
    // The fitting is a SEPARATE, priced row: we hang the door and cut the aperture whoever bought
    // the machine, so the two must not collapse into one line.
    const fitting = rows.find((r) => r.label === 'Fridge-freezer — In a tall unit');
    expect(fitting?.material_cost).toBe(120);
  });

  it('marks it a schedule row, so it can never move the money', () => {
    const scope = rowsFor(kcfg([appliance({ type: 'fridge', supply: 'existing', placement: 'tall' })]))
      .find((r) => r.label.includes('supplied by the client'))!;
    expect(scope.is_schedule).toBe(true);
    // 0 because somebody else is buying it, NOT null — a null rate prints "needs a price"
    // downstream, and nobody needs to price the customer's own fridge.
    expect(scope.material_cost).toBe(0);
  });

  it('still opens the appliance section when every appliance is the customer’s own', () => {
    // The zone prices nothing at all in this case, and the old rule skipped a zone with no lines.
    const rows = rowsFor(kcfg([appliance({ type: 'fridge', supply: 'existing', placement: 'standalone' })]));
    expect(rows.some((r) => r.kind === 'section' && r.label === 'Appliances')).toBe(true);
  });

  it('says nothing about a zone that is off', () => {
    const off: ZoneDef[] = kitchen.map((z) => (z.key === 'appliances' ? { ...z, optional: true } : z));
    const derived = deriveComposition(off, kcfg([appliance({ type: 'fridge', supply: 'existing' })], {
      appliances: { enabled: false, globals: {}, appliances: [appliance({ type: 'fridge', supply: 'existing' })] as never },
    }), applianceItems);
    expect(compositionRows(derived, 0, () => 'x').some((r) => r.label === 'Appliances')).toBe(false);
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
