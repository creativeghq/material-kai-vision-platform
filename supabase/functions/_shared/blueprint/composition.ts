/**
 * Blueprint COMPOSITION — the one place a configured set of zones becomes metres, counts and money.
 *
 * WHY THIS EXISTS
 * ---------------
 * A blueprint used to describe a kitchen as three scalars (`run_length`, `wall_run_length`,
 * `worktop_length`) and price everything as `€/m × one of them`. That cannot say "four base units:
 * two 80cm doubles, one 60cm drawer bank with Blum runners, one 90cm sink base", so the starter
 * faked it with three hardcoded option groups — "Drawer unit 1", "Drawer unit 2", "Drawer unit 3" —
 * the same list copy-pasted three times. A kitchen could therefore have 0–3 drawer banks and never
 * four, wall units had no count, no material and no size of their own, and an island did not exist.
 *
 * A composition replaces the typed scalars with ZONES. A zone carries GLOBALS shared by everything
 * in it (height, depth, door model) and a list of MODULE ROWS (kind × width × how many). Its length
 * and counts are then DERIVED and published as formula variables under the same names the scalars
 * used — so every existing per-metre task line keeps resolving unchanged, now fed by a real
 * composition instead of a number somebody typed.
 *
 * TWO PRICING MODES, chosen per module type by whoever writes the blueprint:
 *   per_m      — width × the zone's rate (from its door-model global), the shape the existing
 *                price list is already in (Ecoline 74/m … Fenix 275/m). Nothing gets re-keyed.
 *   per_piece  — a flat price on the module type, for things that do not scale with width.
 * Both then add per-piece module OPTIONS (the drawer/runner set, a soft-close upgrade) as their own
 * transparent lines, because that is how a kitchen quote actually reads.
 *
 * ABSORPTION is the rule that stops double counting. An option_group bound to a zone global stops
 * being a priced line of its own: its money now flows through the zone's derived lines, and the
 * zone owns the selection. That also lets two zones (bottom and top units) bind the SAME price list
 * with INDEPENDENT selections — dark bottom, light top — without duplicating twelve rows.
 *
 * Every number here goes through `computeLinePricing`, the same function the flat task lines use.
 * There is no second pricing path. `src/utils/blueprintComposition.ts` mirrors this file for the
 * anonymous tool's optimistic preview and is held identical by tests/unit/blueprintComposition.test.ts.
 */

import { computeLinePricing, round2 } from './formula.ts';

// ── Schema (blueprints.composition_schema) ──────────────────────────────────

/** A price multiplier that kicks in past a size threshold. First band whose `up_to` >= value wins. */
export interface ZoneFactorBand {
  up_to: number;
  factor: number;
}

export interface ZoneGlobalDef {
  key: string;
  label: string;
  type: 'number' | 'option';
  /** display unit for a number global ('cm') */
  unit?: string;
  default?: number;
  /**
   * `type:'option'` — the blueprint option_group whose members are the choices. Binding it here
   * ABSORBS that group: it is no longer priced as a standalone line, and the selection moves onto
   * the zone (so two zones can bind one price list and choose differently).
   */
  option_group?: string;
  /** The option global whose chosen member supplies the zone's per-metre rate. At most one. */
  is_rate_source?: boolean;
  /** `type:'number'` — size bands that scale per-metre modules. Absent/empty = no effect (×1). */
  factors?: ZoneFactorBand[];
}

/**
 * What one piece of something is MADE of — the hardware bill nobody wants to count by hand.
 *
 * A module type declaring `{ doors: 2, shelves: 1, legs: 4 }` is what lets the schedule answer
 * "how many hinges do I order". Hinges are not listed here: they follow from the DOOR count and the
 * door's height (a 210cm larder door does not take two hinges), so the zone derives them from its
 * own band ladder rather than every module type restating the same rule.
 */
export interface Yields {
  doors?: number;
  drawers?: number;
  shelves?: number;
  legs?: number;
  /** Vertical handleless profiles this module contributes. */
  gola_vertical?: number;
  /** Anything else the blueprint wants counted; published as `total_<key>`. */
  [key: string]: number | undefined;
}

export interface ModuleOptionChoice {
  value: string;
  label: string;
  /** Flat amount added per module PIECE. 0/absent = included. */
  price?: number;
  /**
   * What choosing this adds to the schedule, per module piece. A "3 drawers - Blum" runner set
   * yields `{ drawers: 3, runner_sets: 1 }`, which is how the model stops treating `blum_3` as an
   * opaque string and starts knowing three drawer boxes have to be ordered.
   */
  yields?: Yields;
}

export interface ModuleOptionDef {
  key: string;
  label: string;
  default?: string;
  choices: ModuleOptionChoice[];
}

export interface ModuleTypeDef {
  key: string;
  label: string;
  default_width_cm: number;
  /** `per_m`: width × zone rate × size factors. `per_piece`: flat `unit_price` each. */
  price_mode: 'per_m' | 'per_piece';
  /** `per_piece` only. */
  unit_price?: number;
  margin_pct?: number;
  options?: ModuleOptionDef[];
  /** What one piece of this module is made of. Feeds the hardware schedule. */
  yields?: Yields;
  /** Fillers and end panels take no run length. Default true. */
  counts_length?: boolean;
  /** Width is fixed by the module type (a 15cm pull-out larder) — the configurator locks the field. */
  fixed_width?: boolean;
}

export interface ZoneDef {
  key: string;
  label: string;
  /** `units`: a list of modules, length derived from their widths. `surface`: one length × a material rate. */
  kind: 'units' | 'surface';
  /** An island is not in every kitchen. Optional zones start off unless `enabled_by_default`. */
  optional?: boolean;
  enabled_by_default?: boolean;
  globals: ZoneGlobalDef[];
  modules: ModuleTypeDef[];
  /** `surface` only — inherit length from this zone's key unless the config overrides it. */
  length_from?: string;
  /** Publish the zone length under this formula variable. Defaults to `<key>_length`. */
  length_var?: string;
  /** Publish the zone unit count under this variable. Defaults to `<key>_units`. */
  count_var?: string;
  /** Shown above the modules list in the configurator. */
  hint?: string;
  /**
   * The units a fresh configuration starts with. A configurator that opens empty shows a confident
   * €0 and asks the visitor to design a kitchen from nothing; opening on a typical run they then
   * adjust is the difference between a lead and a bounce. The blueprint decides what typical is.
   */
  default_modules?: Array<{ type: string; width_cm?: number; qty?: number; options?: Record<string, string> }>;
  /**
   * Hinges per door, by door height. A 72cm base door takes two; a 210cm larder door takes four or
   * five, and counting them all as two is how a kitchen arrives on site short of hinges.
   * Absent = 2 per door, which is right for base and wall units and wrong for tall ones.
   */
  hinge_bands?: Array<{ up_to: number; count: number }>;
  /** Which numeric global holds the DOOR height for `hinge_bands`. Defaults to `height`. */
  door_height_global?: string;
  /**
   * What one RUN of this zone needs regardless of how many units are in it — the two end caps that
   * close a gola profile, a run-length plinth. Applied once per enabled zone.
   */
  run_yields?: Yields;
}

// ── Configuration (project_plans.composition) ───────────────────────────────

export interface ZoneModuleRow {
  id: string;
  type: string;
  width_cm: number;
  qty: number;
  options?: Record<string, string>;
}

export interface ZoneConfig {
  enabled?: boolean;
  /** number globals hold a number; option globals hold the chosen item's id. */
  globals?: Record<string, number | string>;
  modules?: ZoneModuleRow[];
  /** `surface` only — overrides the inherited length. */
  length_m?: number;
}

export type Composition = Record<string, ZoneConfig>;

// ── Derivation output ───────────────────────────────────────────────────────

export interface DerivedLine {
  /** Stable within one derivation: `<zone>:<row>` / `<zone>:<row>:<option>`. Not a DB id. */
  key: string;
  zone_key: string;
  zone_label: string;
  label: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  line_kind: 'labor' | 'materials' | 'both';
}

export interface DerivedZone {
  key: string;
  label: string;
  enabled: boolean;
  length_m: number;
  unit_count: number;
  total: number;
  /** What this zone alone contributes to the hardware schedule. */
  yields: Record<string, number>;
}

/** One row of the hardware schedule: how many of a thing the configured kitchen needs. */
export interface ScheduleRow {
  key: string;
  label: string;
  quantity: number;
  unit: string;
}

export interface DerivedComposition {
  /** Merge OVER the plan's typed dimensions before evaluating any formula. */
  vars: Record<string, number>;
  lines: DerivedLine[];
  zones: DerivedZone[];
  /** option_groups owned by a zone global — never price these as standalone lines. */
  absorbed_groups: string[];
  total: number;
  /**
   * Why a zone priced at zero. Emptiness is ambiguous — "no door model chosen" and "no modules
   * added" are different problems and the configurator must be able to say which.
   */
  issues: string[];
  /**
   * The hardware schedule, summed across every enabled zone: doors, drawers, hinges, shelves, legs,
   * gola profiles. Quantities only — these are priced when the plan becomes a quote, because a
   * client is not quoted thirty hinges but a workshop absolutely has to order them.
   */
  schedule: ScheduleRow[];
}

/** Display names + units for the yields the schedule knows about. Anything else falls back. */
const YIELD_LABELS: Record<string, { label: string; unit: string }> = {
  doors: { label: 'Doors', unit: 'pcs' },
  drawers: { label: 'Drawer boxes', unit: 'pcs' },
  hinges: { label: 'Hinges', unit: 'pcs' },
  shelves: { label: 'Shelves', unit: 'pcs' },
  legs: { label: 'Cabinet legs', unit: 'pcs' },
  runner_sets: { label: 'Drawer runner sets', unit: 'set' },
  gola_vertical: { label: 'Gola vertical profile', unit: 'pcs' },
  gola_end_cap: { label: 'Gola end caps', unit: 'pcs' },
  gola_joiner: { label: 'Gola corner joiners', unit: 'pcs' },
};

const titleise = (key: string) =>
  key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The subset of a blueprint_item / project_plan_item this module needs to read a rate off. */
export interface RateItemLike {
  id: string;
  label: string;
  kind?: string;
  sort_order?: number;
  option_group?: string | null;
  tier?: string | null;
  unit?: string | null;
  material_cost?: number | null;
  labor_rate?: number | null;
  margin_pct?: number | null;
  is_allowance?: boolean;
  allowance_amount?: number | null;
}

export interface RateChoice {
  id: string;
  label: string;
  unit_price: number;
  unit: string | null;
  tier: string | null;
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Every member of an option_group, with the per-unit price the zone would charge for it. */
export function rateChoices(items: RateItemLike[], optionGroup: string | null | undefined): RateChoice[] {
  if (!optionGroup) return [];
  return items
    .filter((i) => (i.kind ?? 'task') === 'task' && i.option_group === optionGroup)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((i) => ({
      id: i.id,
      label: i.label,
      unit: i.unit ?? null,
      tier: i.tier ?? null,
      unit_price: computeLinePricing({
        is_allowance: i.is_allowance,
        allowance_amount: i.allowance_amount,
        material_cost: i.material_cost,
        labor_rate: i.labor_rate,
        margin_pct: i.margin_pct,
        quantity: 1,
        is_selected: true,
      }).unit_price,
    }));
}

/** The member a zone global points at, falling back to tier:'good' then the first — never nothing. */
function resolveRateChoice(
  items: RateItemLike[],
  optionGroup: string | null | undefined,
  chosenId: unknown,
): RateChoice | null {
  const choices = rateChoices(items, optionGroup);
  if (!choices.length) return null;
  const wanted = typeof chosenId === 'string' ? choices.find((c) => c.id === chosenId) : undefined;
  return wanted ?? choices.find((c) => c.tier === 'good') ?? choices[0];
}

/** Product of every size band that applies. A global with no bands contributes ×1. */
function sizeFactor(zone: ZoneDef, globals: Record<string, number | string>): number {
  let factor = 1;
  for (const g of asArray<ZoneGlobalDef>(zone.globals)) {
    if (g.type !== 'number') continue;
    const bands = asArray<ZoneFactorBand>(g.factors);
    if (!bands.length) continue;
    const value = num(globals[g.key], num(g.default));
    const band = [...bands]
      .sort((a, b) => num(a.up_to) - num(b.up_to))
      .find((b) => value <= num(b.up_to));
    factor *= band ? num(band.factor, 1) : num(bands[bands.length - 1]?.factor, 1);
  }
  return factor;
}

/** Hinges one door of this height needs. No ladder = 2, right for base and wall, wrong for tall. */
function hingesPerDoor(zone: ZoneDef, globals: Record<string, number | string>): number {
  const bands = asArray<{ up_to: number; count: number }>(zone.hinge_bands);
  if (!bands.length) return 2;
  const height = num(
    globals[zone.door_height_global || 'height'],
    num(asArray<ZoneGlobalDef>(zone.globals).find((g) => g.key === (zone.door_height_global || 'height'))?.default),
  );
  const band = [...bands].sort((a, b) => num(a.up_to) - num(b.up_to)).find((b) => height <= num(b.up_to));
  return band ? num(band.count, 2) : num(bands[bands.length - 1]?.count, 2);
}

/** Add `src × times` into `into`. Undefined/NaN contribute nothing rather than poisoning the total. */
function addYields(into: Record<string, number>, src: Yields | undefined, times: number) {
  for (const [key, value] of Object.entries(src ?? {})) {
    const n = num(value) * times;
    if (n !== 0) into[key] = (into[key] ?? 0) + n;
  }
}

/** A zone is on unless it is optional and switched off. */
export function zoneEnabled(zone: ZoneDef, cfg: ZoneConfig | undefined): boolean {
  if (!zone.optional) return true;
  return cfg?.enabled ?? zone.enabled_by_default ?? false;
}

const lengthVarOf = (z: ZoneDef) => z.length_var || `${z.key}_length`;
const countVarOf = (z: ZoneDef) => z.count_var || `${z.key}_units`;

/**
 * A fresh, valid configuration: every global at its default, the zone's `default_modules` laid out,
 * optional zones off unless the schema says otherwise.
 *
 * `makeId` exists because this runs on both sides of the wire and the ids only have to be unique
 * within one configuration — the caller supplies whatever its runtime has.
 */
export function defaultComposition(
  schema: ZoneDef[],
  items: RateItemLike[] = [],
  makeId: (zoneKey: string, index: number) => string = (z, i) => `${z}-${i}`,
): Composition {
  const out: Composition = {};
  for (const zone of asArray<ZoneDef>(schema)) {
    const globals: Record<string, number | string> = {};
    for (const g of asArray<ZoneGlobalDef>(zone.globals)) {
      if (g.type === 'number') globals[g.key] = num(g.default);
      else {
        const pick = resolveRateChoice(items, g.option_group, undefined);
        if (pick) globals[g.key] = pick.id;
      }
    }
    const byKey: Record<string, ModuleTypeDef> = {};
    for (const m of asArray<ModuleTypeDef>(zone.modules)) byKey[m.key] = m;
    const modules: ZoneModuleRow[] = [];
    asArray<NonNullable<ZoneDef['default_modules']>[number]>(zone.default_modules).forEach((seed, idx) => {
      const mod = byKey[seed.type];
      if (!mod) return;
      const options: Record<string, string> = { ...(seed.options ?? {}) };
      for (const opt of asArray<ModuleOptionDef>(mod.options)) {
        if (options[opt.key] == null) {
          const fallback = opt.default ?? asArray<ModuleOptionChoice>(opt.choices)[0]?.value;
          if (fallback != null) options[opt.key] = fallback;
        }
      }
      modules.push({
        id: makeId(zone.key, idx),
        type: seed.type,
        width_cm: num(seed.width_cm, mod.default_width_cm),
        qty: Math.max(1, Math.round(num(seed.qty, 1))),
        options,
      });
    });
    out[zone.key] = {
      enabled: zone.optional ? (zone.enabled_by_default ?? false) : true,
      globals,
      modules,
    };
  }
  return out;
}

/** The option_groups a schema takes ownership of. Their items must never be priced on their own. */
export function absorbedGroups(schema: ZoneDef[]): string[] {
  const out = new Set<string>();
  for (const zone of asArray<ZoneDef>(schema)) {
    for (const g of asArray<ZoneGlobalDef>(zone.globals)) {
      if (g.type === 'option' && g.option_group) out.add(g.option_group);
    }
  }
  return Array.from(out);
}

/**
 * Zones + what the customer configured → formula variables and priced lines.
 *
 * Pure. `items` supplies only the RATES a zone global points at; nothing here reads or writes a row.
 */
export function deriveComposition(
  schema: ZoneDef[],
  config: Composition | null | undefined,
  items: RateItemLike[] = [],
): DerivedComposition {
  const zones = asArray<ZoneDef>(schema);
  const cfgAll = (config ?? {}) as Composition;
  const vars: Record<string, number> = {};
  const lines: DerivedLine[] = [];
  const derivedZones: DerivedZone[] = [];
  const issues: string[] = [];
  const lengthByZone: Record<string, number> = {};
  const scheduleTotals: Record<string, number> = {};
  let total = 0;

  const emit = (line: Omit<DerivedLine, 'line_total' | 'unit_price'>, rate: number, marginPct: number) => {
    const { unit_price, line_total } = computeLinePricing({
      material_cost: rate,
      margin_pct: marginPct,
      quantity: line.quantity,
      is_selected: true,
    });
    lines.push({ ...line, unit_price, line_total });
    total += line_total;
    return line_total;
  };

  // Pass 1 — `units` zones. A surface can inherit its length from one of these, so they resolve first.
  for (const zone of zones) {
    if (zone.kind !== 'units') continue;
    const cfg = cfgAll[zone.key] ?? {};
    const enabled = zoneEnabled(zone, cfg);
    const globals = (cfg.globals ?? {}) as Record<string, number | string>;
    const modulesByKey: Record<string, ModuleTypeDef> = {};
    for (const m of asArray<ModuleTypeDef>(zone.modules)) modulesByKey[m.key] = m;

    const rateGlobal = asArray<ZoneGlobalDef>(zone.globals).find((g) => g.type === 'option' && g.is_rate_source)
      ?? asArray<ZoneGlobalDef>(zone.globals).find((g) => g.type === 'option');
    const rateChoice = rateGlobal ? resolveRateChoice(items, rateGlobal.option_group, globals[rateGlobal.key]) : null;
    const factor = sizeFactor(zone, globals);

    let length = 0;
    let count = 0;
    let zoneTotal = 0;
    const perType: Record<string, number> = {};
    const zoneYields: Record<string, number> = {};

    if (enabled) {
      const rows = asArray<ZoneModuleRow>(cfg.modules);
      for (const row of rows) {
        const mod = modulesByKey[row.type];
        if (!mod) continue;
        const qty = Math.max(0, Math.round(num(row.qty, 1)));
        if (qty === 0) continue;
        const widthM = Math.max(0, num(row.width_cm, mod.default_width_cm)) / 100;
        count += qty;
        perType[mod.key] = (perType[mod.key] ?? 0) + qty;
        if (mod.counts_length !== false) length += widthM * qty;
        addYields(zoneYields, mod.yields, qty);

        if (mod.price_mode === 'per_piece') {
          zoneTotal += emit({
            key: `${zone.key}:${row.id}`,
            zone_key: zone.key,
            zone_label: zone.label,
            label: `${zone.label} — ${mod.label}${widthM > 0 ? ` ${Math.round(widthM * 100)}cm` : ''}`,
            unit: 'pcs',
            quantity: qty,
            line_kind: 'materials',
          }, num(mod.unit_price), num(mod.margin_pct));
        } else {
          if (!rateChoice) {
            issues.push(`${zone.label}: no ${rateGlobal?.label ?? 'material'} chosen — its units price at 0.`);
          }
          const metres = round2(widthM * qty);
          zoneTotal += emit({
            key: `${zone.key}:${row.id}`,
            zone_key: zone.key,
            zone_label: zone.label,
            label: `${zone.label} — ${mod.label} ${Math.round(widthM * 100)}cm${rateChoice ? ` · ${rateChoice.label}` : ''}`,
            unit: 'm',
            quantity: metres,
            line_kind: 'materials',
          }, round2(num(rateChoice?.unit_price) * factor), num(mod.margin_pct));
        }

        // Per-piece module options (the runner set, a soft-close upgrade) stay their own line:
        // a kitchen quote reads "3-drawer bank, Blum runners €145", not one opaque number.
        for (const opt of asArray<ModuleOptionDef>(mod.options)) {
          const chosen = (row.options ?? {})[opt.key] ?? opt.default;
          const choice = asArray<ModuleOptionChoice>(opt.choices).find((c) => c.value === chosen);
          // Yields count even when the choice is free: "no extra charge" is not "no drawer boxes".
          addYields(zoneYields, choice?.yields, qty);
          const price = num(choice?.price);
          if (!choice || price === 0) continue;
          zoneTotal += emit({
            key: `${zone.key}:${row.id}:${opt.key}`,
            zone_key: zone.key,
            zone_label: zone.label,
            label: `${mod.label} — ${choice.label}`,
            unit: 'pcs',
            quantity: qty,
            line_kind: 'materials',
          }, price, num(mod.margin_pct));
        }
      }
      if (rows.length === 0) issues.push(`${zone.label}: no units added yet.`);
      // Whatever one RUN needs regardless of unit count — the two caps that close a gola profile.
      if (count > 0) addYields(zoneYields, zone.run_yields, 1);
      // Hinges follow the doors and the door HEIGHT, so the rule lives once here rather than being
      // restated (and eventually contradicted) by every module type that has a door.
      const doors = zoneYields.doors ?? 0;
      if (doors > 0) zoneYields.hinges = (zoneYields.hinges ?? 0) + doors * hingesPerDoor(zone, globals);
    }

    length = round2(length);
    lengthByZone[zone.key] = length;
    vars[lengthVarOf(zone)] = length;
    vars[countVarOf(zone)] = count;
    vars[`${zone.key}_enabled`] = enabled ? 1 : 0;
    for (const m of asArray<ModuleTypeDef>(zone.modules)) vars[`${zone.key}_${m.key}_count`] = perType[m.key] ?? 0;
    for (const g of asArray<ZoneGlobalDef>(zone.globals)) {
      if (g.type === 'number') vars[`${zone.key}_${g.key}`] = enabled ? num(globals[g.key], num(g.default)) : 0;
    }
    for (const [key, value] of Object.entries(zoneYields)) vars[`${zone.key}_${key}`] = value;
    addYields(scheduleTotals, zoneYields, 1);
    derivedZones.push({ key: zone.key, label: zone.label, enabled, length_m: length, unit_count: count, total: round2(zoneTotal), yields: zoneYields });
  }

  // Pass 2 — `surface` zones (worktop, splashback, island top): one length × a material rate.
  for (const zone of zones) {
    if (zone.kind !== 'surface') continue;
    const cfg = cfgAll[zone.key] ?? {};
    const enabled = zoneEnabled(zone, cfg);
    const globals = (cfg.globals ?? {}) as Record<string, number | string>;
    const rateGlobal = asArray<ZoneGlobalDef>(zone.globals).find((g) => g.type === 'option' && g.is_rate_source)
      ?? asArray<ZoneGlobalDef>(zone.globals).find((g) => g.type === 'option');
    const rateChoice = rateGlobal ? resolveRateChoice(items, rateGlobal.option_group, globals[rateGlobal.key]) : null;
    const factor = sizeFactor(zone, globals);

    const inherited = zone.length_from ? num(lengthByZone[zone.length_from]) : 0;
    const length = enabled ? round2(cfg.length_m != null ? num(cfg.length_m) : inherited) : 0;
    let zoneTotal = 0;

    if (enabled && length > 0) {
      if (!rateChoice) issues.push(`${zone.label}: no ${rateGlobal?.label ?? 'material'} chosen — it prices at 0.`);
      zoneTotal += emit({
        key: `${zone.key}:surface`,
        zone_key: zone.key,
        zone_label: zone.label,
        label: `${zone.label}${rateChoice ? ` — ${rateChoice.label}` : ''}`,
        unit: 'm',
        quantity: length,
        line_kind: 'both',
      }, round2(num(rateChoice?.unit_price) * factor), 0);
    }

    lengthByZone[zone.key] = length;
    vars[lengthVarOf(zone)] = length;
    vars[`${zone.key}_enabled`] = enabled ? 1 : 0;
    for (const g of asArray<ZoneGlobalDef>(zone.globals)) {
      if (g.type === 'number') vars[`${zone.key}_${g.key}`] = enabled ? num(globals[g.key], num(g.default)) : 0;
    }
    derivedZones.push({ key: zone.key, label: zone.label, enabled, length_m: length, unit_count: 0, total: round2(zoneTotal), yields: {} });
  }

  // Totals are published BOTH as formula variables (`total_hinges`, so a schedule line can be an
  // ordinary blueprint task with a formula) and as a rendered schedule.
  const schedule: ScheduleRow[] = [];
  for (const [key, quantity] of Object.entries(scheduleTotals)) {
    vars[`total_${key}`] = round2(quantity);
    if (quantity === 0) continue;
    const meta = YIELD_LABELS[key];
    schedule.push({ key, label: meta?.label ?? titleise(key), quantity: round2(quantity), unit: meta?.unit ?? 'pcs' });
  }
  schedule.sort((a, b) => a.label.localeCompare(b.label));
  // Run-level totals, for anything fitted along every zone at once — a handleless profile runs the
  // length of each run, needs a vertical between units and a cap at each open end, so all three
  // shapes have to be expressible in a formula.
  const liveRuns = derivedZones.filter((z) => z.enabled && z.unit_count > 0);
  vars.total_run_length = round2(liveRuns.reduce((sum, z) => sum + z.length_m, 0));
  vars.total_units = liveRuns.reduce((sum, z) => sum + z.unit_count, 0);
  vars.total_runs = liveRuns.length;

  return {
    vars,
    lines,
    zones: derivedZones,
    absorbed_groups: absorbedGroups(zones),
    total: round2(total),
    issues,
    schedule,
  };
}

/**
 * `opt_<option_key> = 1 | 0` for every option_group member carrying a stable key.
 *
 * This is what makes a line CONDITIONAL ON A CHOICE, which the flat scope could not express: gola
 * needs four lines on at once (horizontal profile, verticals, end caps, joiners) and an option_group
 * is pick-one, so they cannot be members of it. They are ordinary lines multiplied by `opt_gola`
 * instead — `= opt_gola * total_run_length` — and switching to standard handles zeroes all four
 * together, rather than leaving the top units with no profile because somebody forgot a switch.
 *
 * Keyed off `option_key` rather than the label because renaming "Gola (handleless)" must not
 * silently zero every gola line in every plan.
 */
export function optionFlags(items: Array<{ option_key?: string | null; is_selected?: boolean }>): Record<string, number> {
  const flags: Record<string, number> = {};
  for (const it of items) {
    if (!it.option_key) continue;
    // A member seen selected wins: the same key must never be flipped back to 0 by a later row.
    flags[`opt_${it.option_key}`] = it.is_selected ? 1 : (flags[`opt_${it.option_key}`] ?? 0);
  }
  return flags;
}

/** True when the blueprint drives itself off zones rather than typed scalars. */
export function hasComposition(schema: unknown): boolean {
  return Array.isArray(schema) && schema.length > 0;
}

// ── Plan-side snapshot ──────────────────────────────────────────────────────

/**
 * What a PLAN stores: the zones it was imported with, what the customer configured, and a frozen
 * copy of the rate tables its zone globals point at.
 *
 * The rate tables are snapshotted rather than looked up because the blueprint's option_group rows
 * are ABSORBED — they are not carried into the plan as lines, so there is nothing left to read a
 * rate off. Freezing them also makes a plan behave the way a quote must: re-opening one next month
 * re-prices at the rates it was quoted on, not at whatever the price list has since become.
 */
export interface PlanComposition {
  schema: ZoneDef[];
  config: Composition;
  rate_tables: Record<string, RateChoice[]>;
}

/** Freeze every absorbed option_group's members and their per-unit prices. */
export function snapshotRateTables(schema: ZoneDef[], items: RateItemLike[]): Record<string, RateChoice[]> {
  const out: Record<string, RateChoice[]> = {};
  for (const group of absorbedGroups(schema)) out[group] = rateChoices(items, group);
  return out;
}

/** Frozen rate tables back into the shape `deriveComposition` reads rates from. */
export function rateItemsFromTables(tables: Record<string, RateChoice[]> | null | undefined): RateItemLike[] {
  const out: RateItemLike[] = [];
  for (const [group, choices] of Object.entries(tables ?? {})) {
    (choices ?? []).forEach((c, idx) => {
      out.push({
        id: c.id,
        label: c.label,
        kind: 'task',
        sort_order: idx,
        option_group: group,
        tier: c.tier ?? null,
        unit: c.unit ?? null,
        // The snapshot already carries the margin-applied price, so it re-derives to itself.
        material_cost: c.unit_price,
        margin_pct: 0,
      });
    });
  }
  return out;
}

/** A plan's stored composition → its derived variables and lines. Empty/absent is not an error. */
export function derivePlanComposition(comp: PlanComposition | null | undefined): DerivedComposition | null {
  if (!comp || !hasComposition(comp.schema)) return null;
  return deriveComposition(comp.schema, comp.config, rateItemsFromTables(comp.rate_tables));
}
