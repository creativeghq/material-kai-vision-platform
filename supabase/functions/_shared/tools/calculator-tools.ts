/**
 * Calculator tools — deterministic, free, no upstream API.
 *
 * THE MATH IS NOT HERE. Both models are imported from GENERATED mirrors of the canonical
 * frontend modules (`src/lib/calculators/*.ts`), produced by `npm run vocab:mirror` and held
 * byte-identical by tests/unit/vocabularyMirrors.test.ts.
 *
 * This file used to carry a second implementation of each, under a header reading "keep the two
 * in sync" — a convention, which is precisely what the mirror script exists to replace. The
 * heat-pump constants happened to still agree; the heating-cost pair had already diverged, with
 * the tool hardcoding the calorific values and efficiencies the canonical version accepts as
 * overrides, so `/tools/heat-pump` could be told "our oil is 10.2 kWh/L" and the agent could not.
 * A duplicated DERIVATION is the same defect shape as a duplicated vocabulary and worse to
 * detect: both answers are plausible numbers (#395).
 *
 * Each tool emits its result chunk so AgentHub can render an inline card.
 */

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
import { computeHeatingCostComparison, type AcType } from '../calculators/heatingCostComparison.generated.ts';

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
        electricityPricePerKwh: input.electricity_price_per_kwh ?? 0.19,
        oilPricePerLitre: input.oil_price_per_litre ?? 1.246,
        gasPricePerKwh: input.gas_price_per_kwh ?? 0.137,
        woodPricePerKg: input.wood_price_per_kg ?? 0.54,
        heatPumpCop: input.heat_pump_cop ?? 4,
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
        electricity_price_per_kwh: z.number().optional().describe('€/kWh electricity (default 0.19).'),
        oil_price_per_litre: z.number().optional().describe('€/litre heating oil (default 1.246).'),
        gas_price_per_kwh: z.number().optional().describe('€/kWh natural gas (default 0.137).'),
        wood_price_per_kg: z.number().optional().describe('€/kg firewood (default 0.54).'),
        heat_pump_cop: z.number().optional().describe('Heat-pump seasonal COP (default 4).'),
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
//
// UNLIKE the two calculators above, this one holds NO rates. Kitchen pricing lives in the
// `kitchen_cabinets` platform-starter blueprint, which is also what /tools/kitchen-cost and the
// projects Plan tab read — so re-pricing in the Blueprints admin moves all three at once, and a
// mirrored copy here would immediately become a second, wrong source.
//
// For the same reason the schema carries NO enum of models or worktops: those are rows. The tool
// matches free text against the blueprint's own labels and REPORTS what it could not match, so
// the agent corrects itself instead of silently quoting the default. The only structural coupling
// is the three dimension keys, and an unknown one is ignored rather than assumed.

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
      const supplied: Record<string, number | undefined> = {
        run_length: input.run_length_m,
        wall_run_length: input.wall_run_length_m,
        worktop_length: input.worktop_length_m,
      };
      for (const [k, v] of Object.entries(supplied)) {
        if (v != null && Number.isFinite(Number(v)) && Number(v) >= 0 && k in dims) dims[k] = Number(v);
      }

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
        'Price a fitted kitchen from its running metres and finishes, using the live price list. Deterministic, free, instant — no external API. '
        + 'Use when someone asks what a new kitchen costs, or to compare finishes and worktops. '
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
