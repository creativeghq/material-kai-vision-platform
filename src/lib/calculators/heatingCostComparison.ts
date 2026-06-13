/**
 * Annual heating-cost comparison — pure, deterministic, no I/O.
 *
 * Faithful port of the operator's Google Sheet
 * "ΥΠΟΛΟΓΙΣΜΟΣ ΜΕΘΟΔΩΝ ΘΕΡΜΑΝΣΗΣ" (verified cell-by-cell, 2026-06-12). Every
 * default below reproduces the sheet to the euro for its example inputs
 * (200 m², 132 kWh/m²·yr → heat pump 4 COP cheapest at ~€1,455/yr).
 *
 * Sheet formula map (source of truth):
 *   G5 useful demand   = specificEnergy × area
 *   H5 delivered       = G5 × 1.16286            (distribution gross-up)
 *   oil litres         = H5 / 10.71              (burner-efficiency cell is unused in the sheet)
 *   gas kWh            = H5
 *   a/c kWh            = H5 / COP   (COP = 2 simple, 3 inverter)
 *   heat-pump kWh      = H5 / COP                (default 4)
 *   wood kg            = H5 / (efficiency × 6.0101) × 1.34   (1.34 = empirical wood factor)
 *   cost               = units × unitPrice
 *
 * The frontend page and the agent tool `calculate_heating_cost_comparison`
 * (mirror in supabase/functions/_shared/tools/calculator-tools.ts) both use
 * this — keep them in sync.
 */

export type AcType = 'inverter' | 'simple';
export type HeatingMethodKey = 'oil' | 'gas' | 'ac' | 'heat_pump' | 'energy_fireplace' | 'non_energy_fireplace';

export interface HeatingCostInput {
  floorAreaM2: number;
  /** Building specific energy, kWh/m²·yr (sheet example: 132). User-supplied. */
  specificEnergyKwhM2Yr: number;
  // Unit prices
  electricityPricePerKwh: number; // sheet 0.19
  oilPricePerLitre: number; // sheet 1.246
  gasPricePerKwh: number; // sheet 0.137
  woodPricePerKg: number; // sheet 0.54
  // Equipment
  heatPumpCop: number; // sheet 4
  acType: AcType; // inverter → COP 3, simple → COP 2
  // Advanced — defaults reproduce the sheet exactly
  distributionFactor?: number; // 1.16286
  oilCalorificKwhPerLitre?: number; // 10.71
  woodRawCalorificKwhPerKg?: number; // 6.0101 (= 119/19.8)
  energyFireplaceEfficiency?: number; // 0.85
  nonEnergyFireplaceEfficiency?: number; // 0.30
  woodEmpiricalFactor?: number; // 1.34
}

export interface HeatingMethodResult {
  key: HeatingMethodKey;
  label: string;
  /** Consumption per year in the method's native unit. */
  unitsPerYear: number;
  unitLabel: string; // 'L', 'kWh', 'kg'
  annualCostEur: number;
  /** Cheapest method gets rank 1. */
  rank: number;
  /** % more expensive than the cheapest method (0 for the cheapest). */
  pctVsCheapest: number;
}

export interface HeatingCostResult {
  usefulDemandKwh: number;
  deliveredEnergyKwh: number;
  methods: HeatingMethodResult[];
  cheapest: HeatingMethodResult;
  assumptions: Record<string, number | string>;
}

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const METHOD_LABELS: Record<HeatingMethodKey, string> = {
  oil: 'Heating oil',
  gas: 'Natural gas',
  ac: 'A/C (inverter)',
  heat_pump: 'Heat pump',
  energy_fireplace: 'Energy fireplace',
  non_energy_fireplace: 'Open fireplace',
};

export function computeHeatingCostComparison(input: HeatingCostInput): HeatingCostResult {
  const area = Math.max(1, input.floorAreaM2 || 0);
  const specific = Math.max(0, input.specificEnergyKwhM2Yr || 0);

  const distributionFactor = input.distributionFactor ?? 1.16286;
  const oilCalorific = input.oilCalorificKwhPerLitre ?? 10.71;
  const woodRawCalorific = input.woodRawCalorificKwhPerKg ?? 6.0101;
  const energyFpEff = input.energyFireplaceEfficiency ?? 0.85;
  const nonEnergyFpEff = input.nonEnergyFireplaceEfficiency ?? 0.3;
  const woodFactor = input.woodEmpiricalFactor ?? 1.34;
  const acCop = input.acType === 'simple' ? 2 : 3;

  const usefulDemandKwh = specific * area; // G5
  const deliveredEnergyKwh = usefulDemandKwh * distributionFactor; // H5
  const E = deliveredEnergyKwh;

  const raw: Array<Omit<HeatingMethodResult, 'rank' | 'pctVsCheapest'>> = [];

  // Oil — litres = E / calorific; cost = litres × price (burner eff unused, as in sheet)
  {
    const litres = E / oilCalorific;
    raw.push({ key: 'oil', label: METHOD_LABELS.oil, unitsPerYear: round(litres), unitLabel: 'L', annualCostEur: round(litres * input.oilPricePerLitre) });
  }
  // Gas — kWh = E
  {
    const kwh = E;
    raw.push({ key: 'gas', label: METHOD_LABELS.gas, unitsPerYear: round(kwh), unitLabel: 'kWh', annualCostEur: round(kwh * input.gasPricePerKwh) });
  }
  // A/C — kWh = E / COP
  {
    const kwh = E / acCop;
    raw.push({
      key: 'ac',
      label: input.acType === 'simple' ? 'A/C (basic)' : 'A/C (inverter)',
      unitsPerYear: round(kwh),
      unitLabel: 'kWh',
      annualCostEur: round(kwh * input.electricityPricePerKwh),
    });
  }
  // Heat pump — kWh = E / COP
  {
    const cop = Math.max(0.1, input.heatPumpCop || 4);
    const kwh = E / cop;
    raw.push({ key: 'heat_pump', label: METHOD_LABELS.heat_pump, unitsPerYear: round(kwh), unitLabel: 'kWh', annualCostEur: round(kwh * input.electricityPricePerKwh) });
  }
  // Energy fireplace — kg = E / (eff × rawCalorific) × 1.34
  {
    const effCalorific = energyFpEff * woodRawCalorific;
    const kg = (E / effCalorific) * woodFactor;
    raw.push({ key: 'energy_fireplace', label: METHOD_LABELS.energy_fireplace, unitsPerYear: round(kg), unitLabel: 'kg', annualCostEur: round(kg * input.woodPricePerKg) });
  }
  // Open / non-energy fireplace
  {
    const effCalorific = nonEnergyFpEff * woodRawCalorific;
    const kg = (E / effCalorific) * woodFactor;
    raw.push({ key: 'non_energy_fireplace', label: METHOD_LABELS.non_energy_fireplace, unitsPerYear: round(kg), unitLabel: 'kg', annualCostEur: round(kg * input.woodPricePerKg) });
  }

  const sorted = [...raw].sort((a, b) => a.annualCostEur - b.annualCostEur);
  const cheapestCost = sorted[0]?.annualCostEur || 0;
  const methods: HeatingMethodResult[] = sorted.map((m, i) => ({
    ...m,
    rank: i + 1,
    pctVsCheapest: cheapestCost > 0 ? Math.round(((m.annualCostEur - cheapestCost) / cheapestCost) * 100) : 0,
  }));

  return {
    usefulDemandKwh: round(usefulDemandKwh),
    deliveredEnergyKwh: round(deliveredEnergyKwh),
    methods,
    cheapest: methods[0],
    assumptions: {
      distributionFactor,
      oilCalorificKwhPerLitre: oilCalorific,
      woodRawCalorificKwhPerKg: woodRawCalorific,
      energyFireplaceEfficiency: energyFpEff,
      nonEnergyFireplaceEfficiency: nonEnergyFpEff,
      woodEmpiricalFactor: woodFactor,
      acCop,
    },
  };
}
