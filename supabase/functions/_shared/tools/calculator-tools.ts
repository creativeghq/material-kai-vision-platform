/** Calculator tools — deterministic, free, no upstream API. */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import { computeBlueprint, resolveSelection } from '../blueprint/compute.ts';
import {
  computeHeatPumpSizing,
  type ClimateZone, type EmitterType, type GlazingExposure, type InsulationLevel,
} from '../calculators/heatPumpSizing.generated.ts';
import { computeHeatingCostComparison, HEATING_COST_DEFAULTS, type AcType } from '../calculators/heatingCostComparison.generated.ts';
import {
  buildTileFloorPlan, DEFAULT_TILE_FLOOR, suggestBackButter, suggestedTrowelNotchMm, TILE_FLOOR_LIMITS,
} from '../installation/tileFloorTemplate.generated.ts';
import { PATTERNS, PATTERN_LABELS, type Pattern } from '../surfacePatterns.generated.ts';

type ChunkSink = ((chunk: any) => void) | undefined;

export const createHeatPumpSizingTool = (onChunk: ChunkSink) => {
  return tool(
    async (input: {
      floor_area_m2: number;
      ceiling_height_m?: number;
      insulation_level: InsulationLevel;
      climate_zone?: ClimateZone;
      design_outdoor_temp_c?: number;
      emitter: EmitterType;
      glazing_exposure?: GlazingExposure;
      include_dhw?: boolean;
      occupants?: number;
    }) => {
      const result = computeHeatPumpSizing({
        floorAreaM2: input.floor_area_m2,
        ceilingHeightM: input.ceiling_height_m,
        insulationLevel: input.insulation_level,
        climateZone: input.climate_zone,
        designOutdoorTempC: input.design_outdoor_temp_c,
        emitter: input.emitter,
        glazingExposure: input.glazing_exposure,
        includeDhw: input.include_dhw,
        occupants: input.occupants,
      });

      try {
        onChunk?.({ type: 'heat_pump_sizing', input, result });
      } catch {
        /* stream may be closed */
      }

      return JSON.stringify({ success: true, ...result });
    },
    {
      name: 'calculate_heat_pump_sizing',
      description:
        'Estimate the heat-pump capacity (kW) a space needs. Deterministic, free, instant — no external API. ' +
        'Use when a user asks how big a heat pump they need, or to size space heating for a room/home. ' +
        'Returns space-heating load, optional DHW allowance, a recommended unit-output range, the required flow temperature for the chosen emitter, and caveats. ' +
        'Always present the result as a first-pass estimate, not a substitute for a ΕΛΟΤ ΕΝ 12831 / ΤΟΤΕΕ study. ' +
        'Ask the user for missing key inputs (area, insulation, climate zone, emitter) rather than guessing.',
      schema: z.object({
        floor_area_m2: z.number().positive().describe('Heated floor area in square metres.'),
        ceiling_height_m: z.number().positive().optional().describe('Clear ceiling height in metres (default 2.7).'),
        insulation_level: z
          .enum(['none', 'medium', 'modern', 'passive'])
          // Spelling out the everyday synonyms because the model reaches for them: it sent
          // "average" and the call was rejected by zod before the calculator ever ran.
          .describe('One of exactly: none | medium | modern | passive. none = pre-1980 no insulation; medium = post-1980 partial (use this for "average", "typical", "standard", "some insulation"); modern = KENAK well-insulated; passive = passive house / nZEB.'),
        climate_zone: z.enum(['A', 'B', 'C', 'D']).optional().describe('Greek climate zone: A south/islands (warmest) … D mountainous (coldest). Default C.'),
        design_outdoor_temp_c: z.number().optional().describe('Advanced override: exact winter design outdoor temperature in °C. Supersedes climate_zone when given.'),
        emitter: z
          .enum(['underfloor', 'fan_coil', 'low_temp_radiator', 'high_temp_radiator'])
          // "radiators" on its own is NOT mappable and must not be guessed: low-temp runs at
          // ~50 °C and high-temp at ~70 °C, which changes the flow temperature, the COP and the
          // recommended unit. Guessing here produces a confident number for the wrong system —
          // so the model is told to ask instead. (It sent bare "radiators" and zod rejected it,
          // which is the correct outcome; this makes the next attempt land.)
          .describe('One of exactly: underfloor | fan_coil | low_temp_radiator | high_temp_radiator. Drives required flow temperature and COP context. "Underfloor heating" → underfloor; "fan coils" → fan_coil. If the user just says "radiators", ASK whether they are sized for low-temperature (~50 °C) or conventional high-temperature (~70 °C) operation — do not pick one.'),
        glazing_exposure: z.enum(['low', 'normal', 'high']).optional().describe('low = compact/few windows; normal; high = large glazing / many exposed walls. Default normal.'),
        include_dhw: z.boolean().optional().describe('Include a domestic-hot-water allowance in the combined sizing.'),
        occupants: z.number().int().positive().optional().describe('Occupant count — only used when include_dhw is true.'),
      }),
    },
  );
};

// ── Heating-cost comparison ───────────────────────────────────────────────
export const createHeatingCostComparisonTool = (onChunk: ChunkSink) => {
  return tool(
    async (input: {
      floor_area_m2: number;
      specific_energy_kwh_m2_yr: number;
      electricity_price_per_kwh?: number;
      oil_price_per_litre?: number;
      gas_price_per_kwh?: number;
      wood_price_per_kg?: number;
      heat_pump_cop?: number;
      ac_type?: AcType;
      distribution_factor?: number;
      oil_calorific_kwh_per_litre?: number;
      wood_calorific_kwh_per_kg?: number;
      energy_fireplace_efficiency?: number;
      open_fireplace_efficiency?: number;
    }) => {
      // The canonical model owns the defaults AND the physical constants; passing an
      // `undefined` through is what lets it keep owning them. The old copy re-declared every
      // default here, which is how the two started answering differently.
      const result = computeHeatingCostComparison({
        floorAreaM2: input.floor_area_m2,
        specificEnergyKwhM2Yr: input.specific_energy_kwh_m2_yr,
        electricityPricePerKwh: input.electricity_price_per_kwh ?? HEATING_COST_DEFAULTS.electricityPricePerKwh,
        oilPricePerLitre: input.oil_price_per_litre ?? HEATING_COST_DEFAULTS.oilPricePerLitre,
        gasPricePerKwh: input.gas_price_per_kwh ?? HEATING_COST_DEFAULTS.gasPricePerKwh,
        woodPricePerKg: input.wood_price_per_kg ?? HEATING_COST_DEFAULTS.woodPricePerKg,
        heatPumpCop: input.heat_pump_cop ?? HEATING_COST_DEFAULTS.heatPumpCop,
        acType: input.ac_type ?? 'inverter',
        // Physical constants the ΠΕΑ may state differently for a given building. The web
        // calculator has always accepted these; the agent silently could not.
        distributionFactor: input.distribution_factor,
        oilCalorificKwhPerLitre: input.oil_calorific_kwh_per_litre,
        woodRawCalorificKwhPerKg: input.wood_calorific_kwh_per_kg,
        energyFireplaceEfficiency: input.energy_fireplace_efficiency,
        nonEnergyFireplaceEfficiency: input.open_fireplace_efficiency,
      });

      try {
        onChunk?.({ type: 'heating_cost_comparison', input, result });
      } catch {
        /* stream may be closed */
      }

      return JSON.stringify({ success: true, ...result });
    },
    {
      name: 'calculate_heating_cost_comparison',
      description:
        'Compare the ANNUAL RUNNING COST of six heating methods (heating oil, natural gas, A/C, heat pump, energy fireplace, open fireplace) for one dwelling. Deterministic, free, instant — no external API. ' +
        'Use when a user asks which heating method is cheapest to run, or to compare heating running costs. ' +
        'Requires floor area + the building energy intensity (kWh/m²·yr, from the ΠΕΑ). Unit prices and the heat-pump COP have sensible Greek-market defaults but should be overridden when the user gives them. ' +
        'Returns each method ranked by yearly cost with consumption per year. Running cost only — excludes equipment + installation.',
      schema: z.object({
        floor_area_m2: z.number().positive().describe('Heated floor area in m².'),
        specific_energy_kwh_m2_yr: z.number().positive().describe("Building energy intensity in kWh/m² per year (from the ΠΕΑ energy certificate). Typical ~40–60 well-insulated, ~70–90 partial, ~90–120 uninsulated."),
        electricity_price_per_kwh: z.number().optional().describe(`€/kWh electricity (default ${HEATING_COST_DEFAULTS.electricityPricePerKwh}).`),
        oil_price_per_litre: z.number().optional().describe(`€/litre heating oil (default ${HEATING_COST_DEFAULTS.oilPricePerLitre}).`),
        gas_price_per_kwh: z.number().optional().describe(`€/kWh natural gas (default ${HEATING_COST_DEFAULTS.gasPricePerKwh}).`),
        wood_price_per_kg: z.number().optional().describe(`€/kg firewood (default ${HEATING_COST_DEFAULTS.woodPricePerKg}).`),
        heat_pump_cop: z.number().optional().describe(`Heat-pump seasonal COP (default ${HEATING_COST_DEFAULTS.heatPumpCop}).`),
        ac_type: z.enum(['inverter', 'simple']).optional().describe('A/C type: inverter (COP 3) or simple (COP 2). Default inverter.'),
        distribution_factor: z.number().optional().describe('Distribution/emission losses multiplier on useful demand (default 1.16286).'),
        oil_calorific_kwh_per_litre: z.number().optional().describe('Heating-oil calorific value in kWh/litre (default 10.71).'),
        wood_calorific_kwh_per_kg: z.number().optional().describe('Raw firewood calorific value in kWh/kg (default 6.0101).'),
        energy_fireplace_efficiency: z.number().optional().describe('Energy-fireplace efficiency, 0–1 (default 0.85).'),
        open_fireplace_efficiency: z.number().optional().describe('Open-fireplace efficiency, 0–1 (default 0.3).'),
      }),
    },
  );
};

// ── Kitchen cost ──────────────────────────────────────────────────────────

const KITCHEN_PROJECT_TYPE = 'kitchen_cabinets';

export const createKitchenCostTool = (supabase: any, onChunk: ChunkSink) => {
  return tool(
    async (input: {
      run_length_m: number;
      wall_run_length_m?: number;
      worktop_length_m?: number;
      options?: string[];
      extras?: string[];
    }) => {
      const { data: bp } = await supabase
        .from('blueprints')
        .select('id, title, source_currency, dimensions_schema')
        .eq('project_type', KITCHEN_PROJECT_TYPE)
        .eq('is_platform_starter', true)
        .eq('status', 'active')
        .maybeSingle();
      if (!bp) return JSON.stringify({ success: false, error: 'The kitchen price list is not configured yet.' });

      const { data: items } = await supabase
        .from('blueprint_items').select('*').eq('blueprint_id', bp.id).order('sort_order');
      const rows = (items ?? []) as Record<string, any>[];
      const currency = bp.source_currency || 'EUR';

      const schema = (bp.dimensions_schema ?? []) as { key: string; label?: string; unit?: string; default?: number }[];
      const dims: Record<string, number> = {};
      for (const d of schema) dims[d.key] = Number(d.default ?? 0);
      // Lengths are FORMULA variables, not schema dims — the schema stopped declaring them when zones
      // arrived, and gating on `k in dims` dropped every supplied length, so each line silently fell
      // back to its default_quantity (a 2.5 m run priced as 6 m). An unstated length is 0, and said.
      const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
      const run = num(input.run_length_m) ?? 0;
      const lengths: Record<string, { value: number; assumed: string | null }> = {
        run_length: { value: run, assumed: null },
        wall_run_length: num(input.wall_run_length_m) != null
          ? { value: num(input.wall_run_length_m)!, assumed: null }
          : { value: 0, assumed: 'No wall units priced (none stated).' },
        worktop_length: num(input.worktop_length_m) != null
          ? { value: num(input.worktop_length_m)!, assumed: null }
          : { value: run, assumed: `Worktop priced at the base run length (${run} m).` },
        tall_run_length: { value: 0, assumed: null },
        island_length: { value: 0, assumed: null },
        highboard_length: { value: 0, assumed: null },
      };
      for (const [k, v] of Object.entries(lengths)) dims[k] = v.value;
      const assumptions = Object.values(lengths).map((v) => v.assumed).filter(Boolean) as string[];

      const extraLines = rows.filter((r) => r.kind === 'task' && !r.option_group);
      const { selected, unmatched } = resolveSelection(rows, { options: input.options, extras: input.extras });

      const computed = computeBlueprint(rows, dims, selected);
      const allTasks = computed.sections.flatMap((s) => s.tasks).concat(computed.ungrouped);
      const byId = new Map(allTasks.map((t) => [t.id, t]));

      // What each alternative would cost for THIS kitchen — unit_price is per metre for a
      // measured line, so the agent needs the resolved total to compare finishes honestly.
      const priceOf = (t: { is_allowance: boolean; unit_price: number; quantity: number }) =>
        Math.round((t.is_allowance ? t.unit_price : t.unit_price * t.quantity) * 100) / 100;

      const options: Record<string, { label: string; unit_price: number; unit: string | null; total_for_this_kitchen: number }[]> = {};
      for (const t of allTasks) {
        if (!t.option_group) continue;
        (options[t.option_group] ||= []).push({
          label: t.label,
          unit_price: t.unit_price,
          unit: t.is_allowance ? null : t.unit,
          total_for_this_kitchen: priceOf(t),
        });
      }

      const availableExtras = extraLines
        .filter((r) => r.default_selected === false)
        .map((r) => {
          const t = byId.get(r.id);
          return {
            label: r.label,
            unit_price: t?.unit_price ?? 0,
            unit: t?.is_allowance ? null : (t?.unit ?? null),
            total_for_this_kitchen: t ? priceOf(t) : 0,
            included: !!t?.selected,
          };
        });

      const result = {
        currency,
        dimensions: schema.map((d) => ({ label: d.label ?? d.key, value: dims[d.key], unit: d.unit ?? null })),
        subtotal: computed.subtotal,
        chosen: allTasks.filter((t) => t.selected && t.option_group).map((t) => ({ group: t.option_group, label: t.label })),
        sections: computed.sections
          .filter((s) => s.tasks.some((t) => t.selected && t.line_total > 0))
          .map((s) => ({
            section: s.label,
            total: s.total,
            lines: s.tasks.filter((t) => t.selected && t.line_total > 0).map((t) => ({
              label: t.label, quantity: t.quantity, unit: t.unit,
              unit_price: t.unit_price, line_total: t.line_total,
            })),
          })),
        available: { options, extras: availableExtras },
        unmatched,
        assumptions,
        price_basis: 'Platform starter price list for INDOOR fitted kitchens (per running metre). Appliances, sink, tap and delivery are not included.',
      };

      try {
        onChunk?.({ type: 'kitchen_cost', input, result });
      } catch {
        /* stream may be closed */
      }

      return JSON.stringify({ success: true, ...result });
    },
    {
      name: 'calculate_kitchen_cost',
      description:
        'Price an INDOOR fitted kitchen from its running metres and finishes, using the live price list. Deterministic, free, instant — no external API. '
        + 'Use when someone asks what a new kitchen costs, or to compare finishes and worktops. '
        + 'NEVER use it for an outdoor kitchen, an aluminium/stainless carcass, or a package that includes appliances: the list holds none of those, so the total would describe a different kitchen. Say there is no price list for it instead. '
        + 'Report every entry in `assumptions` alongside the figure. '
        + 'Call it FIRST with only run_length_m: the result lists every available model, worktop and add-on with what each would cost for that kitchen. Then call again with the ones the user picked — never guess a model name. '
        + 'ALWAYS check `unmatched` in the result: anything listed there was NOT applied and the standard default was priced instead, so correct the user rather than presenting the total as the spec they asked for. '
        + 'Present the figure as a ballpark excluding VAT, with appliances and sink not included, subject to a survey.',
      schema: z.object({
        run_length_m: z.number().positive().describe('Total length of the base cabinet run, in metres — add up the walls the kitchen runs along.'),
        wall_run_length_m: z.number().nonnegative().optional().describe('Length of the wall/hanging unit run, in metres. Defaults to the price list default.'),
        worktop_length_m: z.number().nonnegative().optional().describe('Worktop length, in metres. Defaults to the price list default.'),
        options: z.array(z.string()).optional().describe('Single-choice selections by name, e.g. a cabinet model ("Fenix") or a worktop ("HPL laminate"). At most one per choice group; omit to price the standard default.'),
        extras: z.array(z.string()).optional().describe('Optional add-ons to include, by name, e.g. "Le Mans corner unit — eco" or "Removal & disposal of old kitchen".'),
      }),
    },
  );
};

// ── Tile floor installation ───────────────────────────────────────────────
export const createTileInstallationTool = (onChunk: ChunkSink) => {
  return tool(
    async (input: {
      room_width_m: number;
      room_depth_m: number;
      tile_length_mm: number;
      tile_width_mm: number;
      tile_thickness_mm?: number;
      joint_mm?: number;
      perimeter_gap_mm?: number;
      trowel_notch_mm?: number;
      pattern?: Pattern;
      prime?: boolean;
      back_butter?: boolean;
    }) => {
      const longSide = Math.max(input.tile_length_mm, input.tile_width_mm);
      const plan = buildTileFloorPlan({
        ...DEFAULT_TILE_FLOOR,
        areaWidthM: input.room_width_m,
        areaDepthM: input.room_depth_m,
        tileLengthMm: input.tile_length_mm,
        tileWidthMm: input.tile_width_mm,
        tileThicknessMm: input.tile_thickness_mm ?? DEFAULT_TILE_FLOOR.tileThicknessMm,
        jointMm: input.joint_mm ?? DEFAULT_TILE_FLOOR.jointMm,
        perimeterGapMm: input.perimeter_gap_mm ?? DEFAULT_TILE_FLOOR.perimeterGapMm,
        trowelNotchMm: input.trowel_notch_mm ?? suggestedTrowelNotchMm(longSide),
        pattern: input.pattern ?? DEFAULT_TILE_FLOOR.pattern,
        prime: input.prime ?? DEFAULT_TILE_FLOOR.prime,
        backButter: input.back_butter ?? suggestBackButter(longSide),
      });

      const errors = plan.issues.filter((i) => i.level === 'error').map((i) => i.message);
      if (errors.length) return JSON.stringify({ success: false, error: errors.join(' '), issues: errors });

      const p = plan.params;
      const result = {
        room: { width_m: p.areaWidthM, depth_m: p.areaDepthM },
        tile: { length_mm: p.tileLengthMm, width_mm: p.tileWidthMm, thickness_mm: p.tileThicknessMm },
        pattern: PATTERN_LABELS[p.pattern],
        joint_mm: p.jointMm,
        trowel_notch_mm: p.trowelNotchMm,
        prime: p.prime,
        back_butter: p.backButter,
        quantities: plan.quantities,
        steps: plan.steps.map((s) => ({ title: s.title, instruction: s.instruction, tools: s.tools, wait: s.wait ?? null, warning: s.warning ?? null })),
        warnings: plan.issues.filter((i) => i.level === 'warning').map((i) => i.message),
      };

      try {
        onChunk?.({ type: 'tile_installation', input, result });
      } catch {
        /* stream may be closed */
      }

      return JSON.stringify({ success: true, ...result });
    },
    {
      name: 'plan_tile_installation',
      description:
        'Plan laying a TILED FLOOR in one rectangular room: how many tiles to buy (incl. cuts and spare), spacers, adhesive and grout in kg, and the step-by-step installation with cure times. Deterministic, free, instant — no external API. '
        + `Use when someone asks how many tiles, how much adhesive or grout, or how to lay a floor. Rooms are ${TILE_FLOOR_LIMITS.areaM.min}–${TILE_FLOOR_LIMITS.areaM.max} m per side; split a larger or L-shaped floor into rectangles and call once per rectangle. `
        + 'Floors only — not walls. Report every entry in `warnings`. The visual 3D walkthrough lives at Tools → Tile Installation Guide (/tools/tile-installation).',
      schema: z.object({
        room_width_m: z.number().min(TILE_FLOOR_LIMITS.areaM.min).max(TILE_FLOOR_LIMITS.areaM.max).describe('Room width in metres (the tile length runs along it).'),
        room_depth_m: z.number().min(TILE_FLOOR_LIMITS.areaM.min).max(TILE_FLOOR_LIMITS.areaM.max).describe('Room depth in metres.'),
        tile_length_mm: z.number().min(TILE_FLOOR_LIMITS.tileMm.min).max(TILE_FLOOR_LIMITS.tileMm.max).describe('Tile long side in millimetres (a "60x120" tile is 1200).'),
        tile_width_mm: z.number().min(TILE_FLOOR_LIMITS.tileMm.min).max(TILE_FLOOR_LIMITS.tileMm.max).describe('Tile short side in millimetres (a "60x120" tile is 600).'),
        tile_thickness_mm: z.number().min(TILE_FLOOR_LIMITS.thicknessMm.min).max(TILE_FLOOR_LIMITS.thicknessMm.max).optional().describe(`Tile thickness in mm (default ${DEFAULT_TILE_FLOOR.tileThicknessMm}).`),
        joint_mm: z.number().min(TILE_FLOOR_LIMITS.jointMm.min).max(TILE_FLOOR_LIMITS.jointMm.max).optional().describe(`Grout joint width in mm (default ${DEFAULT_TILE_FLOOR.jointMm}).`),
        perimeter_gap_mm: z.number().min(TILE_FLOOR_LIMITS.gapMm.min).max(TILE_FLOOR_LIMITS.gapMm.max).optional().describe(`Movement gap at the walls in mm (default ${DEFAULT_TILE_FLOOR.perimeterGapMm}).`),
        trowel_notch_mm: z.number().min(TILE_FLOOR_LIMITS.notchMm.min).max(TILE_FLOOR_LIMITS.notchMm.max).optional().describe('Trowel notch in mm. Omit to use the size suggested for the tile.'),
        pattern: z.enum(PATTERNS).optional().describe(`Laying pattern, one of: ${PATTERNS.join(' | ')}. Default stack.`),
        prime: z.boolean().optional().describe('Prime the screed first (default yes).'),
        back_butter: z.boolean().optional().describe('Back-butter each tile. Omit to use the suggestion for the tile size (yes from 60 cm).'),
      }),
    },
  );
};

// ── Renovation project plan ───────────────────────────────────────────────
export const createProjectPlanEstimateTool = (supabase: any, onChunk: ChunkSink) => {
  return tool(
    async (input: {
      project_type?: string;
      dimensions?: Record<string, number>;
      options?: string[];
      extras?: string[];
    }) => {
      const { data: starters, error } = await supabase
        .from('blueprints')
        .select('id, title, project_type, source_currency, dimensions_schema')
        .eq('is_platform_starter', true)
        .eq('status', 'active')
        .neq('project_type', KITCHEN_PROJECT_TYPE)
        .order('title');
      if (error) return JSON.stringify({ success: false, error: `The renovation price lists could not be read: ${error.message}` });
      type Dim = { key: string; label?: string; unit?: string; default?: number; role?: string };
      const list = (starters ?? []) as { id: string; title: string; project_type: string; source_currency: string | null; dimensions_schema: Dim[] | null }[];
      const templates = list.map((s) => ({
        project_type: s.project_type,
        title: s.title,
        dimensions: (s.dimensions_schema ?? []).map((d) => ({ key: d.key, label: d.label ?? d.key, unit: d.unit ?? null, default: d.default ?? 0 })),
      }));

      if (input.project_type === KITCHEN_PROJECT_TYPE) {
        return JSON.stringify({ success: false, error: 'A fitted kitchen is priced by calculate_kitchen_cost, not by this tool.' });
      }
      const bp = list.find((s) => s.project_type === input.project_type);
      if (!bp) {
        return JSON.stringify({
          success: true,
          needs_project_type: true,
          message: input.project_type
            ? `There is no price list for "${input.project_type}". Pick one of these and call again.`
            : 'Pick one of these project types and call again with its dimensions.',
          templates,
        });
      }

      const { data: items, error: itemsError } = await supabase
        .from('blueprint_items').select('*').eq('blueprint_id', bp.id).order('sort_order');
      if (itemsError) return JSON.stringify({ success: false, error: `The ${bp.title} price list could not be read: ${itemsError.message}` });
      const rows = (items ?? []) as Record<string, any>[];
      if (!rows.some((r) => r.kind === 'task')) {
        return JSON.stringify({ success: false, error: `The ${bp.title} price list has no priced lines yet.` });
      }

      const schema = bp.dimensions_schema ?? [];
      const dims: Record<string, number> = {};
      const assumptions: string[] = [];
      const ignored: string[] = [];
      for (const d of schema) {
        const given = input.dimensions?.[d.key];
        if (given != null && Number.isFinite(Number(given)) && Number(given) >= 0) {
          dims[d.key] = Number(given);
        } else {
          dims[d.key] = Number(d.default ?? 0);
          if (d.role !== 'budget') assumptions.push(`${d.label ?? d.key} not stated — priced at the default ${dims[d.key]}${d.unit ? ` ${d.unit}` : ''}.`);
        }
      }
      for (const k of Object.keys(input.dimensions ?? {})) if (!schema.some((d) => d.key === k)) ignored.push(k);

      const { selected, unmatched } = resolveSelection(rows, { options: input.options, extras: input.extras });
      const hasPicks = (input.options?.length ?? 0) + (input.extras?.length ?? 0) > 0;
      const computed = computeBlueprint(rows, dims, hasPicks ? selected : null);
      const allTasks = computed.sections.flatMap((s) => s.tasks).concat(computed.ungrouped);
      const currency = bp.source_currency || 'EUR';

      // An unselected line has line_total 0, so an alternative is priced from its own rate.
      const priceOf = (t: { is_allowance: boolean; unit_price: number; quantity: number }) =>
        Math.round((t.is_allowance ? t.unit_price : t.unit_price * t.quantity) * 100) / 100;
      const options: Record<string, { label: string; total_for_this_project: number; selected: boolean }[]> = {};
      for (const t of allTasks) {
        if (!t.option_group) continue;
        (options[t.option_group] ||= []).push({ label: t.label, total_for_this_project: priceOf(t), selected: t.selected });
      }
      const extras = allTasks
        .filter((t) => !t.option_group && rows.find((r) => r.id === t.id)?.default_selected === false)
        .map((t) => ({ label: t.label, total_for_this_project: priceOf(t), included: t.selected }));

      const result = {
        project_type: bp.project_type,
        title: bp.title,
        currency,
        dimensions: schema.map((d) => ({ key: d.key, label: d.label ?? d.key, value: dims[d.key], unit: d.unit ?? null })),
        subtotal: computed.subtotal,
        sections: computed.sections
          .filter((s) => s.tasks.some((t) => t.selected && t.line_total > 0))
          .map((s) => ({
            section: s.label,
            total: s.total,
            lines: s.tasks.filter((t) => t.selected && t.line_total > 0).map((t) => ({
              label: t.label, quantity: t.quantity, unit: t.unit, unit_price: t.unit_price, line_total: t.line_total,
            })),
          })),
        available: { options, extras },
        unmatched,
        ignored_dimensions: ignored,
        assumptions,
        price_basis: `Platform starter price list for ${bp.title}, at standard rates. Excludes VAT; your own rates will differ.`,
      };

      try {
        onChunk?.({ type: 'project_plan_estimate', input, result });
      } catch {
        /* stream may be closed */
      }

      return JSON.stringify({ success: true, ...result });
    },
    {
      name: 'estimate_project_plan',
      description:
        'Price the full scope of works for a RENOVATION (e.g. full home renovation, bathroom, repaint) off the live platform price lists, section by section. Deterministic, free, instant — no external API. '
        + 'Call it FIRST with no project_type: the result lists every available project type with the dimensions it needs. Then call with a project_type and the dimensions the user gave — never invent one. '
        + 'A fitted kitchen is NOT priced here; use calculate_kitchen_cost. '
        + 'Report every entry in `assumptions` (a dimension priced at its default), `unmatched` (a choice not in the list) and `ignored_dimensions` alongside the figure. '
        + 'Present the total as a ballpark at standard rates, excluding VAT. The editable version lives at Tools → Project Plan Estimator (/tools/project-plan).',
      schema: z.object({
        project_type: z.string().optional().describe('The project_type of one template from the first call, e.g. "full_home_renovation". Omit to list the templates.'),
        dimensions: z.record(z.number()).optional().describe('Dimension values keyed by the template\'s dimension key, e.g. { "floor_area": 85, "n_bathrooms": 1 }. Unstated keys use the template default.'),
        options: z.array(z.string()).optional().describe('Single-choice selections by name, as listed under available.options in an earlier result.'),
        extras: z.array(z.string()).optional().describe('Optional add-ons to include, by name, as listed under available.extras in an earlier result.'),
      }),
    },
  );
};
