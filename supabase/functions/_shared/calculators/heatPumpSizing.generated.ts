// GENERATED MIRROR of src/lib/calculators/heatPumpSizing.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * Heat-pump sizing estimator — pure, deterministic, no I/O.
 *
 * Canonical source of truth for the calculation. The `/tools/heat-pump` page
 * imports it directly (runs client-side, instant, no backend). The agent tool
 * `calculate_heat_pump_sizing` keeps a MIRROR of this logic in
 * `supabase/functions/_shared/tools/calculator-tools.ts` (Deno can't import
 * across the Vite boundary) — keep the two in sync. Same pattern as the
 * TOOLKITS_INDEX mirror in toolkit-tools.ts.
 *
 * IMPORTANT: these are COARSE PLANNING FIGURES for a first estimate, not a
 * substitute for a proper thermal-loss study (ΕΛΟΤ ΕΝ 12831 / ΤΟΤΕΕ 20701).
 * The W/m² baselines are midpoints of the commonly-cited ranges for Northern
 * Greek dwellings; the climate-zone factors are a relative adjustment around
 * those baselines. A professional should always confirm with a real ΠΕΑ/study.
 */

export type InsulationLevel = 'none' | 'medium' | 'modern' | 'passive';
export type ClimateZone = 'A' | 'B' | 'C' | 'D';
export type EmitterType =
  | 'underfloor'
  | 'fan_coil'
  | 'low_temp_radiator'
  | 'high_temp_radiator';
export type GlazingExposure = 'low' | 'normal' | 'high';

export interface HeatPumpSizingInput {
  /** Heated floor area, m². */
  floorAreaM2: number;
  /** Clear ceiling height, m. Reference is 2.7 m. */
  ceilingHeightM?: number;
  /** Building envelope quality. */
  insulationLevel: InsulationLevel;
  /** Greek climate zone (A warmest … D coldest). Ignored if designOutdoorTempC set. */
  climateZone?: ClimateZone;
  /**
   * Advanced override: exact winter design outdoor temperature (°C) from the
   * local ΤΟΤΕΕ table. When provided it supersedes `climateZone`.
   */
  designOutdoorTempC?: number;
  /** Heat-emission system — drives required flow temperature + COP context. */
  emitter: EmitterType;
  /** Large glazing / many exposed walls increase the load. */
  glazingExposure?: GlazingExposure;
  /** Include domestic hot water in the combined sizing. */
  includeDhw?: boolean;
  /** Occupants — only used when includeDhw is true. */
  occupants?: number;
}

export interface HeatPumpSizingResult {
  spaceHeatingKW: number;
  dhwKW: number;
  totalDesignKW: number;
  /** Suggested unit nominal-output selection range at the design point. */
  recommendedRange: { minKW: number; maxKW: number };
  /** Effective whole-building specific load after all factors, W/m². */
  effectiveWattsPerM2: number;
  flowTempC: number;
  /** COP-impact context for the chosen emitter. */
  emitterNote: string;
  /** What drove the climate adjustment. */
  climateBasis: string;
  assumptions: {
    indoorTempC: number;
    ceilingHeightM: number;
    baseWattsPerM2: number;
    zoneFactor: number;
    glazingFactor: number;
    volumeFactor: number;
  };
  caveats: string[];
}

// ── Tunable model constants ──────────────────────────────────────────────

const INDOOR_DESIGN_TEMP_C = 20;
const REFERENCE_CEILING_M = 2.7;

/** Midpoints of the commonly-cited W/m² ranges for N. Greece (≈ zone C). */
const BASE_W_PER_M2: Record<InsulationLevel, number> = {
  none: 90, // pre-1980, no insulation
  medium: 70, // post-1980, partial insulation
  modern: 50, // KENAK-era, well insulated
  passive: 25, // passive house / nZEB
};

/** Relative climate factor anchored to zone C = 1.00 (the baseline market). */
const ZONE_FACTOR: Record<ClimateZone, number> = {
  A: 0.8,
  B: 0.9,
  C: 1.0,
  D: 1.15,
};

/** Representative winter design outdoor temp per zone (°C) — display only. */
const ZONE_DESIGN_TEMP_C: Record<ClimateZone, number> = {
  A: 2,
  B: 0,
  C: -2,
  D: -6,
};
/** ΔT the baseline W/m² figures assume (indoor 20 − zone C design −2). */
const REFERENCE_DELTA_T = INDOOR_DESIGN_TEMP_C - ZONE_DESIGN_TEMP_C.C; // 22

const GLAZING_FACTOR: Record<GlazingExposure, number> = {
  low: 0.95,
  normal: 1.0,
  high: 1.12,
};

interface EmitterSpec {
  flowTempC: number;
  note: string;
}
const EMITTER: Record<EmitterType, EmitterSpec> = {
  underfloor: {
    flowTempC: 35,
    note: 'Underfloor heating runs at ~35 °C — the lowest flow temp, so the heat pump achieves its best COP. Ideal pairing.',
  },
  fan_coil: {
    flowTempC: 45,
    note: 'Fan coils run at ~45 °C. Good COP and fast response; works well with most air-to-water units.',
  },
  low_temp_radiator: {
    flowTempC: 50,
    note: 'Low-temperature radiators need ~50 °C. Acceptable COP; make sure the radiators are sized for low-temp operation.',
  },
  high_temp_radiator: {
    flowTempC: 60,
    note: 'Existing high-temperature radiators need ~60 °C, which lowers COP. Consider a high-temperature heat pump or upsizing the radiators.',
  },
};

/** Per-occupant DHW design allowance, kW (priority-switched in practice). */
const DHW_KW_PER_OCCUPANT = 0.25;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeHeatPumpSizing(input: HeatPumpSizingInput): HeatPumpSizingResult {
  const area = Math.max(1, input.floorAreaM2 || 0);
  const ceiling = input.ceilingHeightM && input.ceilingHeightM > 0 ? input.ceilingHeightM : REFERENCE_CEILING_M;
  const baseW = BASE_W_PER_M2[input.insulationLevel];
  const glazingFactor = GLAZING_FACTOR[input.glazingExposure ?? 'normal'];
  const volumeFactor = ceiling / REFERENCE_CEILING_M;

  // Climate adjustment: explicit design temp wins; otherwise the zone factor.
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

  const spaceHeatingW = baseW * area * volumeFactor * zoneFactor * glazingFactor;
  const spaceHeatingKW = round1(spaceHeatingW / 1000);

  const dhwKW = input.includeDhw
    ? round1(Math.max(1, input.occupants ?? 1) * DHW_KW_PER_OCCUPANT)
    : 0;

  const totalDesignKW = round1(spaceHeatingKW + dhwKW);
  const recommendedRange = {
    minKW: round1(totalDesignKW * 1.0),
    maxKW: round1(totalDesignKW * 1.15),
  };
  const effectiveWattsPerM2 = round1((spaceHeatingKW * 1000) / area);

  const emitter = EMITTER[input.emitter];

  const caveats = [
    'This is a first-pass estimate, not a substitute for a thermal-loss study per EN 12831 / TOTEE 20701.',
    'Size close to the design load — oversizing a heat pump hurts COP and causes short-cycling.',
    input.includeDhw
      ? 'DHW is shown as a combined allowance; in practice it is usually handled by priority switching plus a cylinder, not added to peak space-heating output.'
      : 'Domestic hot water is not included — add a cylinder/allowance if the unit must also cover DHW.',
    'Confirm the emitter circuit can deliver the load at the listed flow temperature before final selection.',
  ];

  return {
    spaceHeatingKW,
    dhwKW,
    totalDesignKW,
    recommendedRange,
    effectiveWattsPerM2,
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
    caveats,
  };
}

// ── UI label helpers (shared by the page + any future surface) ────────────

export const INSULATION_OPTIONS: Array<{ value: InsulationLevel; label: string; hint: string }> = [
  { value: 'none', label: 'No insulation (pre-1980)', hint: '≈ 90 W/m²' },
  { value: 'medium', label: 'Partial / post-1980', hint: '≈ 70 W/m²' },
  { value: 'modern', label: 'Well insulated (KENAK)', hint: '≈ 50 W/m²' },
  { value: 'passive', label: 'Passive house / nZEB', hint: '≈ 25 W/m²' },
];

export const ZONE_OPTIONS: Array<{ value: ClimateZone; label: string }> = [
  { value: 'A', label: 'A — South / islands (warmest)' },
  { value: 'B', label: 'B — Athens / central coast' },
  { value: 'C', label: 'C — Northern Greece' },
  { value: 'D', label: 'D — Mountainous (coldest)' },
];

export const EMITTER_OPTIONS: Array<{ value: EmitterType; label: string }> = [
  { value: 'underfloor', label: 'Underfloor heating (35 °C)' },
  { value: 'fan_coil', label: 'Fan coils (45 °C)' },
  { value: 'low_temp_radiator', label: 'Low-temp radiators (50 °C)' },
  { value: 'high_temp_radiator', label: 'Existing radiators (60 °C)' },
];

export const GLAZING_OPTIONS: Array<{ value: GlazingExposure; label: string }> = [
  { value: 'low', label: 'Compact, few windows' },
  { value: 'normal', label: 'Typical' },
  { value: 'high', label: 'Large glazing / exposed' },
];
