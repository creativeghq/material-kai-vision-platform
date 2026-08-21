/**
 * Calculator tools — deterministic, free, no upstream API.
 *
 * calculate_heat_pump_sizing: first-pass heat-pump capacity estimate. The math
 * here is a MIRROR of the canonical frontend module
 * src/lib/calculators/heatPumpSizing.ts (Deno can't import across the Vite
 * boundary — same manual-sync pattern as TOOLKITS_INDEX in toolkit-tools.ts).
 * Keep the two in sync when tuning constants.
 *
 * Emits a `heat_pump_sizing` chunk so AgentHub can render an inline result card.
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

type ChunkSink = ((chunk: any) => void) | undefined;

type InsulationLevel = 'none' | 'medium' | 'modern' | 'passive';
type ClimateZone = 'A' | 'B' | 'C' | 'D';
type EmitterType = 'underfloor' | 'fan_coil' | 'low_temp_radiator' | 'high_temp_radiator';
type GlazingExposure = 'low' | 'normal' | 'high';

const INDOOR_DESIGN_TEMP_C = 20;
const REFERENCE_CEILING_M = 2.7;

const BASE_W_PER_M2: Record<InsulationLevel, number> = { none: 90, medium: 70, modern: 50, passive: 25 };
const ZONE_FACTOR: Record<ClimateZone, number> = { A: 0.8, B: 0.9, C: 1.0, D: 1.15 };
const ZONE_DESIGN_TEMP_C: Record<ClimateZone, number> = { A: 2, B: 0, C: -2, D: -6 };
const REFERENCE_DELTA_T = INDOOR_DESIGN_TEMP_C - ZONE_DESIGN_TEMP_C.C; // 22
const GLAZING_FACTOR: Record<GlazingExposure, number> = { low: 0.95, normal: 1.0, high: 1.12 };
const EMITTER: Record<EmitterType, { flowTempC: number; note: string }> = {
  underfloor: { flowTempC: 35, note: 'Underfloor heating runs at ~35 °C — the lowest flow temp, so the heat pump achieves its best COP. Ideal pairing.' },
  fan_coil: { flowTempC: 45, note: 'Fan coils run at ~45 °C. Good COP and fast response; works well with most air-to-water units.' },
  low_temp_radiator: { flowTempC: 50, note: 'Low-temperature radiators need ~50 °C. Acceptable COP; make sure the radiators are sized for low-temp operation.' },
  high_temp_radiator: { flowTempC: 60, note: 'Existing high-temperature radiators need ~60 °C, which lowers COP. Consider a high-temperature heat pump or upsizing the radiators.' },
};
const DHW_KW_PER_OCCUPANT = 0.25;
const round1 = (n: number) => Math.round(n * 10) / 10;

function computeHeatPumpSizing(input: {
  floorAreaM2: number;
  ceilingHeightM?: number;
  insulationLevel: InsulationLevel;
  climateZone?: ClimateZone;
  designOutdoorTempC?: number;
  emitter: EmitterType;
  glazingExposure?: GlazingExposure;
  includeDhw?: boolean;
  occupants?: number;
}) {
  const area = Math.max(1, input.floorAreaM2 || 0);
  const ceiling = input.ceilingHeightM && input.ceilingHeightM > 0 ? input.ceilingHeightM : REFERENCE_CEILING_M;
  const baseW = BASE_W_PER_M2[input.insulationLevel];
  const glazingFactor = GLAZING_FACTOR[input.glazingExposure ?? 'normal'];
  const volumeFactor = ceiling / REFERENCE_CEILING_M;

  let zoneFactor: number;
  let climateBasis: string;
  if (typeof input.designOutdoorTempC === 'number') {
    const deltaT = INDOOR_DESIGN_TEMP_C - input.designOutdoorTempC;
    zoneFactor = Math.max(0.4, deltaT / REFERENCE_DELTA_T);
    climateBasis = `Design outdoor temperature ${round1(input.designOutdoorTempC)} °C (ΔT ${round1(deltaT)} K vs indoor ${INDOOR_DESIGN_TEMP_C} °C).`;
  } else {
    const zone = input.climateZone ?? 'C';
    zoneFactor = ZONE_FACTOR[zone];
    climateBasis = `Greek climate zone ${zone} (≈ ${ZONE_DESIGN_TEMP_C[zone]} °C design outdoor). Relative factor ${zoneFactor.toFixed(2)} vs zone C baseline.`;
  }

  const spaceHeatingKW = round1((baseW * area * volumeFactor * zoneFactor * glazingFactor) / 1000);
  const dhwKW = input.includeDhw ? round1(Math.max(1, input.occupants ?? 1) * DHW_KW_PER_OCCUPANT) : 0;
  const totalDesignKW = round1(spaceHeatingKW + dhwKW);
  const emitter = EMITTER[input.emitter];

  return {
    spaceHeatingKW,
    dhwKW,
    totalDesignKW,
    recommendedRange: { minKW: round1(totalDesignKW * 1.0), maxKW: round1(totalDesignKW * 1.15) },
    effectiveWattsPerM2: round1((spaceHeatingKW * 1000) / area),
    flowTempC: emitter.flowTempC,
    emitterNote: emitter.note,
    climateBasis,
    assumptions: {
      indoorTempC: INDOOR_DESIGN_TEMP_C,
      ceilingHeightM: ceiling,
      baseWattsPerM2: baseW,
      zoneFactor: round1(zoneFactor),
      glazingFactor,
      volumeFactor: round1(volumeFactor),
    },
    caveats: [
      'This is a first-pass estimate, not a substitute for a thermal-loss study per ΕΛΟΤ ΕΝ 12831 / ΤΟΤΕΕ 20701.',
      'Size close to the design load — oversizing a heat pump hurts COP and causes short-cycling.',
      input.includeDhw
        ? 'DHW is shown as a combined allowance; in practice it is usually handled by priority switching plus a cylinder, not added to peak space-heating output.'
        : 'Domestic hot water is not included — add a cylinder/allowance if the unit must also cover DHW.',
      'Confirm the emitter circuit can deliver the load at the listed flow temperature before final selection.',
    ],
  };
}

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
          .describe('none = pre-1980 no insulation; medium = post-1980 partial; modern = KENAK well-insulated; passive = passive house / nZEB.'),
        climate_zone: z.enum(['A', 'B', 'C', 'D']).optional().describe('Greek climate zone: A south/islands (warmest) … D mountainous (coldest). Default C.'),
        design_outdoor_temp_c: z.number().optional().describe('Advanced override: exact winter design outdoor temperature in °C. Supersedes climate_zone when given.'),
        emitter: z
          .enum(['underfloor', 'fan_coil', 'low_temp_radiator', 'high_temp_radiator'])
          .describe('Heat-emission system — drives required flow temperature and COP context.'),
        glazing_exposure: z.enum(['low', 'normal', 'high']).optional().describe('low = compact/few windows; normal; high = large glazing / many exposed walls. Default normal.'),
        include_dhw: z.boolean().optional().describe('Include a domestic-hot-water allowance in the combined sizing.'),
        occupants: z.number().int().positive().optional().describe('Occupant count — only used when include_dhw is true.'),
      }),
    },
  );
};

// ── Heating-cost comparison ───────────────────────────────────────────────
// MIRROR of src/lib/calculators/heatingCostComparison.ts — keep in sync.

type AcType = 'inverter' | 'simple';
const HEATING_METHOD_LABELS: Record<string, string> = {
  oil: 'Heating oil',
  gas: 'Natural gas',
  ac: 'A/C',
  heat_pump: 'Heat pump',
  energy_fireplace: 'Energy fireplace',
  non_energy_fireplace: 'Open fireplace',
};

function computeHeatingCostComparison(input: {
  floorAreaM2: number;
  specificEnergyKwhM2Yr: number;
  electricityPricePerKwh: number;
  oilPricePerLitre: number;
  gasPricePerKwh: number;
  woodPricePerKg: number;
  heatPumpCop: number;
  acType: AcType;
}) {
  const area = Math.max(1, input.floorAreaM2 || 0);
  const specific = Math.max(0, input.specificEnergyKwhM2Yr || 0);
  const distributionFactor = 1.16286;
  const oilCalorific = 10.71;
  const woodRawCalorific = 6.0101;
  const woodFactor = 1.34;
  const acCop = input.acType === 'simple' ? 2 : 3;

  const usefulDemandKwh = specific * area;
  const E = usefulDemandKwh * distributionFactor;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const raw = [
    { key: 'oil', label: HEATING_METHOD_LABELS.oil, units: E / oilCalorific, unitLabel: 'L', price: input.oilPricePerLitre },
    { key: 'gas', label: HEATING_METHOD_LABELS.gas, units: E, unitLabel: 'kWh', price: input.gasPricePerKwh },
    { key: 'ac', label: input.acType === 'simple' ? 'A/C (basic)' : 'A/C (inverter)', units: E / acCop, unitLabel: 'kWh', price: input.electricityPricePerKwh },
    { key: 'heat_pump', label: HEATING_METHOD_LABELS.heat_pump, units: E / Math.max(0.1, input.heatPumpCop || 4), unitLabel: 'kWh', price: input.electricityPricePerKwh },
    { key: 'energy_fireplace', label: HEATING_METHOD_LABELS.energy_fireplace, units: (E / (0.85 * woodRawCalorific)) * woodFactor, unitLabel: 'kg', price: input.woodPricePerKg },
    { key: 'non_energy_fireplace', label: HEATING_METHOD_LABELS.non_energy_fireplace, units: (E / (0.3 * woodRawCalorific)) * woodFactor, unitLabel: 'kg', price: input.woodPricePerKg },
  ].map((m) => ({ key: m.key, label: m.label, unitsPerYear: r2(m.units), unitLabel: m.unitLabel, annualCostEur: r2(m.units * m.price) }));

  const sorted = raw.sort((a, b) => a.annualCostEur - b.annualCostEur);
  const cheapest = sorted[0].annualCostEur;
  const methods = sorted.map((m, i) => ({
    ...m,
    rank: i + 1,
    pctVsCheapest: cheapest > 0 ? Math.round(((m.annualCostEur - cheapest) / cheapest) * 100) : 0,
  }));

  return { usefulDemandKwh: r2(usefulDemandKwh), deliveredEnergyKwh: r2(E), methods, cheapest: methods[0] };
}

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
    }) => {
      const result = computeHeatingCostComparison({
        floorAreaM2: input.floor_area_m2,
        specificEnergyKwhM2Yr: input.specific_energy_kwh_m2_yr,
        electricityPricePerKwh: input.electricity_price_per_kwh ?? 0.19,
        oilPricePerLitre: input.oil_price_per_litre ?? 1.246,
        gasPricePerKwh: input.gas_price_per_kwh ?? 0.137,
        woodPricePerKg: input.wood_price_per_kg ?? 0.54,
        heatPumpCop: input.heat_pump_cop ?? 4,
        acType: input.ac_type ?? 'inverter',
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
