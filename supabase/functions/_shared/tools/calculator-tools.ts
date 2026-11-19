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
  buildTileFloorPlan, DEFAULT_TILE_FLOOR, floorMaterialsKg, suggestBackButter, suggestedTrowelNotchMm, TILE_FLOOR_LIMITS,
} from '../installation/tileFloorTemplate.generated.ts';
import { callerDbClient } from '../caller-client.ts';
import { serviceClient } from '../supabase-client.ts';
import { resolveProjectId } from '../assessment.ts';
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

// ── Tile floor: quantity of a product, from typed rooms or a confirmed drawing takeoff ──
type TileRoom = { label: string; area_m2: number; width_m: number | null; depth_m: number | null; source: string };
type TileProduct = { id: string; name: string; size_keys: string[] | null };

/** "60x120", "60 × 120 cm", "600x1200 mm" → mm, long side first. A bare pair is centimetres. */
function parseSizeMm(text: string | null | undefined): { lengthMm: number; widthMm: number } | null {
  const m = String(text ?? '').match(/(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/);
  if (!m) return null;
  const f = m[3] === 'mm' ? 1 : 10;
  const a = Number(m[1].replace(',', '.')) * f;
  const b = Number(m[2].replace(',', '.')) * f;
  return a > 0 && b > 0 ? { lengthMm: Math.max(a, b), widthMm: Math.min(a, b) } : null;
}

export const createTileInstallationTool = (
  onChunk: ChunkSink,
  ctx: { userId: string; workspaceId: string | null; jwt?: string },
) => {
  return tool(
    async (input: {
      product_id?: string;
      product_name?: string;
      size?: string;
      tile_length_mm?: number;
      tile_width_mm?: number;
      rooms?: { label?: string; width_m?: number; depth_m?: number; area_m2?: number }[];
      project_id?: string;
      project_name?: string;
      pattern?: Pattern;
      joint_mm?: number;
      wastage_percent?: number;
      tile_thickness_mm?: number;
      trowel_notch_mm?: number;
      back_butter?: boolean;
    }) => {
      if (!ctx.workspaceId || !ctx.jwt) {
        return JSON.stringify({ success: false, error: 'Tile quantities need a signed-in workspace session.' });
      }
      const db = callerDbClient(ctx.jwt, ctx.userId, ctx.workspaceId);

      // The product and its size: the box size is recorded per size, so a multi-size series needs one named.
      let product: TileProduct | null = null;
      if (input.product_id || input.product_name) {
        let q = db.from('products').select('id, name, size_keys').eq('workspace_id', ctx.workspaceId).limit(5);
        q = input.product_id ? q.eq('id', input.product_id) : q.ilike('name', `%${(input.product_name ?? '').trim()}%`);
        const { data: found, error: pErr } = await q;
        if (pErr) return JSON.stringify({ success: false, error: `Product lookup failed: ${pErr.message}` });
        if (!found?.length) return JSON.stringify({ success: false, error: `No product matches "${input.product_name ?? input.product_id}". Ask which product, or run material_search first.` });
        if (found.length > 1 && !input.product_id) {
          return JSON.stringify({ success: false, error: 'Several products match; ask the user which one.', candidates: found.map((p: any) => ({ id: p.id, name: p.name })) });
        }
        product = found[0] as TileProduct;
      }
      const sizes = product?.size_keys ?? [];
      const sizeText = input.size ?? (sizes.length === 1 ? sizes[0] : null);
      if (product && sizes.length > 1 && !input.size) {
        return JSON.stringify({ success: false, needs_size: true, error: `${product.name} comes in several sizes; ask which one.`, sizes });
      }
      const tileMm = parseSizeMm(sizeText)
        ?? (input.tile_length_mm && input.tile_width_mm
          ? { lengthMm: Math.max(input.tile_length_mm, input.tile_width_mm), widthMm: Math.min(input.tile_length_mm, input.tile_width_mm) }
          : null);
      if (!tileMm) {
        return JSON.stringify({ success: false, error: product ? `${product.name} records no size; ask for the tile size.` : 'Name a product, or give the tile size.' });
      }

      // The rooms: typed, or the areas a person confirmed on the project's drawings. Never measured here.
      let rooms: TileRoom[] = [];
      let roomsFrom: string;
      const notes: string[] = [];
      if (input.rooms?.length) {
        const bad = input.rooms.findIndex((r) => !(r.width_m && r.depth_m) && !(r.area_m2 && r.area_m2 > 0));
        if (bad >= 0) return JSON.stringify({ success: false, error: `${input.rooms[bad].label ?? `Room ${bad + 1}`} needs a width and depth, or a floor area.` });
        rooms = input.rooms.map((r, i) => {
          const sides = r.width_m && r.depth_m ? { width_m: r.width_m, depth_m: r.depth_m } : { width_m: null, depth_m: null };
          return {
            label: r.label?.trim() || `Room ${i + 1}`, area_m2: sides.width_m ? sides.width_m * sides.depth_m! : r.area_m2!,
            ...sides, source: 'stated',
          };
        });
        roomsFrom = 'the room sizes given';
      } else if (input.project_id || input.project_name) {
        const projectId = await resolveProjectId(serviceClient(), ctx.userId, ctx.workspaceId, input.project_id, input.project_name);
        if (!projectId) return JSON.stringify({ success: false, error: `No project matching "${input.project_name ?? input.project_id}" in this workspace.` });
        const { data: rows, error: tErr } = await db.rpc('project_takeoff_room_areas', { p_project_id: projectId });
        if (tErr) return JSON.stringify({ success: false, error: `The drawing takeoff could not be read: ${tErr.message}` });
        const all = (rows ?? []) as { drawing: string; label: string | null; source: 'schedule' | 'plan'; area_m2: number | null }[];
        // A printed room schedule and the measured plan count the SAME rooms two ways: use one, never both.
        const useSource = all.some((r) => r.source === 'schedule') ? 'schedule' : 'plan';
        const chosen = all.filter((r) => r.source === useSource);
        const unscaled = chosen.filter((r) => r.area_m2 == null);
        if (all.some((r) => r.source !== useSource)) notes.push(`The drawings also carry measured room areas; the printed room schedule was used, not both.`);
        if (unscaled.length) notes.push(`${unscaled.length} confirmed room(s) have no scale on their sheet and were left out: ${unscaled.map((r) => r.label ?? r.drawing).join(', ')}.`);
        rooms = chosen.filter((r) => r.area_m2 != null).map((r) => ({
          label: r.label || r.drawing, area_m2: Number(r.area_m2), width_m: null, depth_m: null, source: `drawing ${r.drawing}`,
        }));
        if (!rooms.length) {
          return JSON.stringify({
            success: false, needs_rooms: true,
            error: 'This project has no rooms marked on its floor-plan drawing yet. Give the room sizes (or attach the plan so they can be read off it), or mark the rooms on the drawing in the project.',
            url: `/projects/${projectId}?tab=documents`,
          });
        }
        roomsFrom = 'the confirmed drawing takeoff';
      } else {
        return JSON.stringify({ success: false, needs_rooms: true, error: 'Give the room dimensions, or the project whose drawings have confirmed room areas.' });
      }
      const areaM2 = Math.round(rooms.reduce((s, r) => s + r.area_m2, 0) * 100) / 100;
      const pattern = input.pattern ?? DEFAULT_TILE_FLOOR.pattern;

      // The cutting allowance: stated, else the workspace's rate for this pattern, else the product/category default in SQL.
      let wastage: number | null = input.wastage_percent ?? null;
      if (wastage == null) {
        const { data: rate } = await db.from('surface_pattern_wastage').select('percent')
          .eq('workspace_id', ctx.workspaceId).eq('pattern', pattern).maybeSingle();
        if (rate?.percent != null && Number.isFinite(Number(rate.percent))) wastage = Number(rate.percent);
      }

      let order: Record<string, unknown> | null = null;
      if (product) {
        const { data: q, error: qErr } = await db.rpc('tile_line_quantity', {
          p_product: product.id, p_requested: areaM2, p_wastage_percent: wastage, p_format: sizeText,
        });
        if (qErr) return JSON.stringify({ success: false, error: `The order quantity could not be derived: ${qErr.message}` });
        order = q as Record<string, unknown>;
      } else {
        notes.push('No product was named, so there is no box size: the quantity is in m² only.');
      }

      // Installation materials and steps. The tile COUNT is the order's, above — never this engine's.
      const longSide = tileMm.lengthMm;
      const setting = {
        tileLengthMm: tileMm.lengthMm,
        tileWidthMm: tileMm.widthMm,
        tileThicknessMm: input.tile_thickness_mm ?? DEFAULT_TILE_FLOOR.tileThicknessMm,
        jointMm: input.joint_mm ?? DEFAULT_TILE_FLOOR.jointMm,
        trowelNotchMm: input.trowel_notch_mm ?? suggestedTrowelNotchMm(longSide),
        backButter: input.back_butter ?? suggestBackButter(longSide),
      };
      const materials = floorMaterialsKg(areaM2, setting);
      let spacers: number | null = 0;
      let steps: { title: string; instruction: string; wait: string | null }[] = [];
      const warnings = new Set<string>();
      for (const r of rooms) {
        if (r.width_m == null || r.depth_m == null) { spacers = null; continue; }
        const plan = buildTileFloorPlan({ ...DEFAULT_TILE_FLOOR, ...setting, areaWidthM: r.width_m, areaDepthM: r.depth_m, pattern });
        const errors = plan.issues.filter((i) => i.level === 'error').map((i) => i.message);
        if (errors.length) return JSON.stringify({ success: false, error: `${r.label}: ${errors.join(' ')}` });
        for (const w of plan.issues.filter((i) => i.level === 'warning')) warnings.add(w.message);
        if (spacers !== null) spacers += plan.quantities.spacers;
        if (!steps.length) steps = plan.steps.map((s) => ({ title: s.title, instruction: s.instruction, wait: s.wait ?? null }));
      }

      const result = {
        product: product ? { id: product.id, name: product.name, size: sizeText } : null,
        tile: { length_mm: tileMm.lengthMm, width_mm: tileMm.widthMm },
        pattern: PATTERN_LABELS[pattern],
        rooms: rooms.map((r) => ({ label: r.label, area_m2: Math.round(r.area_m2 * 100) / 100, source: r.source })),
        rooms_from: roomsFrom,
        area_m2: areaM2,
        wastage_percent: (order?.wastage_percent as number | null | undefined) ?? wastage,
        order,
        adhesive_kg: Math.round(materials.adhesiveKg * 10) / 10,
        grout_kg: Math.round(materials.groutKg * 10) / 10,
        spacers,
        trowel_notch_mm: setting.trowelNotchMm,
        joint_mm: setting.jointMm,
        steps,
        warnings: [...warnings],
        notes,
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
        'How much of a TILE PRODUCT a floor needs, in whole boxes, plus adhesive, grout and the laying steps. Deterministic, free — no external API. '
        + 'The order quantity is the platform\'s own derivation (the same one a quote line uses), so never compute tiles or boxes yourself. '
        + 'Rooms come from EITHER `rooms` (width × depth, or a floor area) OR a project whose floor-plan drawing has rooms marked and confirmed. '
        + 'When the user ATTACHES a floor plan: read the room dimensions or areas PRINTED on it, list them back and get the user\'s OK, then pass them as `rooms`. '
        + 'Never estimate a size that is not printed (do not measure by eye or from the drawing\'s scale) — ask the user for that room instead. '
        + 'To also SHOW the tile on the plan, call generate_gemini with the plan and the tile attached (its floor-plan render / 3D modes). '
        + 'Name the product (product_name or product_id); a series with several sizes needs `size`. Report `order.reason`, `order.box_m2_estimated` and every entry in `notes` and `warnings`. '
        + `Rooms typed as dimensions are ${TILE_FLOOR_LIMITS.areaM.min}–${TILE_FLOOR_LIMITS.areaM.max} m per side; split a larger floor into rectangles.`,
      schema: z.object({
        product_id: z.string().optional().describe('The tile product id, when known.'),
        product_name: z.string().optional().describe('The tile product name to match (partial is fine).'),
        size: z.string().optional().describe('The size, e.g. "60x120" (cm). Required when the product comes in several sizes.'),
        tile_length_mm: z.number().min(TILE_FLOOR_LIMITS.tileMm.min).max(TILE_FLOOR_LIMITS.tileMm.max).optional().describe('Only without a product: tile long side in mm.'),
        tile_width_mm: z.number().min(TILE_FLOOR_LIMITS.tileMm.min).max(TILE_FLOOR_LIMITS.tileMm.max).optional().describe('Only without a product: tile short side in mm.'),
        rooms: z.array(z.object({
          label: z.string().optional().describe('Room name, e.g. "Kitchen".'),
          width_m: z.number().min(TILE_FLOOR_LIMITS.areaM.min).max(TILE_FLOOR_LIMITS.areaM.max).optional().describe('Room width in metres.'),
          depth_m: z.number().min(TILE_FLOOR_LIMITS.areaM.min).max(TILE_FLOOR_LIMITS.areaM.max).optional().describe('Room depth in metres.'),
          area_m2: z.number().positive().optional().describe('Floor area in m², when the plan prints an area rather than sides.'),
        })).optional().describe('Rooms as stated or as printed on an attached plan (confirmed by the user). Omit when using a project drawing.'),
        project_id: z.string().optional().describe('Use the confirmed room areas on this project\'s drawings.'),
        project_name: z.string().optional().describe('The project name, when the id is not known.'),
        pattern: z.enum(PATTERNS).optional().describe(`Laying pattern, one of: ${PATTERNS.join(' | ')}. Default stack.`),
        joint_mm: z.number().min(TILE_FLOOR_LIMITS.jointMm.min).max(TILE_FLOOR_LIMITS.jointMm.max).optional().describe(`Grout joint width in mm (default ${DEFAULT_TILE_FLOOR.jointMm}).`),
        wastage_percent: z.number().min(0).max(50).optional().describe('Cutting allowance %, only when the user states one; otherwise the workspace and product defaults apply.'),
        tile_thickness_mm: z.number().min(TILE_FLOOR_LIMITS.thicknessMm.min).max(TILE_FLOOR_LIMITS.thicknessMm.max).optional().describe(`Tile thickness in mm (default ${DEFAULT_TILE_FLOOR.tileThicknessMm}).`),
        trowel_notch_mm: z.number().min(TILE_FLOOR_LIMITS.notchMm.min).max(TILE_FLOOR_LIMITS.notchMm.max).optional().describe('Trowel notch in mm. Omit to use the size suggested for the tile.'),
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
