/**
 * MEP calculations — the step that turns a drawing into a check.
 *
 * SCOPE, AND WHY IT IS NARROW.
 *
 * Everything here is derived from first principles: Ohm's law for voltage drop,
 * arithmetic for connected load, the lumen method for average illuminance. Every
 * coefficient a standard would normally supply — utilisation factor, maintenance
 * factor, diversity, conductor resistivity — is an explicit INPUT with a stated
 * default, never a number invented inside a lookup table.
 *
 * Deliberately NOT implemented:
 *   • pipe sizing (EN 806-3) and drainage gradients (EN 12056) — both require
 *     loading-unit and diameter tables that cannot be derived, only transcribed;
 *   • cable current-carrying capacity and its correction factors (IEC/HD 60364
 *     Appendix B) — same reason;
 *   • diversity factors — convention, not physics.
 *
 * A fabricated table would produce a number that looks authoritative and is
 * wrong, which is worse than no number at all. Those need a source the user
 * trusts, so the functions here answer only what arithmetic can answer, and
 * return null everywhere an input is missing.
 *
 * NOTHING HERE IS A SUBSTITUTE FOR A QUALIFIED ENGINEER'S SIGN-OFF. These are
 * sanity checks that catch the obviously-wrong before it reaches site.
 */

/** Copper resistivity, Ω·mm²/m, at ~70 °C conductor operating temperature. */
export const RHO_COPPER_70C = 0.0225;
/** Aluminium equivalent, for completeness. */
export const RHO_ALUMINIUM_70C = 0.036;

export type Phases = 1 | 3;

export interface VoltageDropInput {
  /** One-way run length in metres. The formula accounts for the return leg. */
  lengthM: number;
  /** Design current in amperes. */
  currentA: number;
  /** Conductor cross-sectional area in mm². */
  csaMm2: number;
  phases: Phases;
  /** Nominal voltage. Defaults to 230 V single-phase / 400 V three-phase. */
  nominalV?: number;
  /** Ω·mm²/m. Defaults to copper at operating temperature. */
  resistivity?: number;
}

export interface VoltageDropResult {
  drop_v: number;
  drop_percent: number;
  nominal_v: number;
}

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Voltage drop along a run.
 *
 *   single phase: ΔU = 2 · ρ · L · I / S     (out and back)
 *   three phase:  ΔU = √3 · ρ · L · I / S
 *
 * Returns null on any non-positive or missing input. A zero drop is a perfectly
 * plausible-looking answer and would silently pass every limit check.
 */
export function voltageDrop(input: VoltageDropInput): VoltageDropResult | null {
  const { lengthM, currentA, csaMm2, phases } = input;
  if (!isPos(lengthM) || !isPos(currentA) || !isPos(csaMm2)) return null;
  if (phases !== 1 && phases !== 3) return null;

  const rho = isPos(input.resistivity) ? input.resistivity : RHO_COPPER_70C;
  const nominal = isPos(input.nominalV) ? input.nominalV : (phases === 3 ? 400 : 230);

  const factor = phases === 3 ? Math.sqrt(3) : 2;
  const dropV = (factor * rho * lengthM * currentA) / csaMm2;

  return {
    drop_v: dropV,
    drop_percent: (dropV / nominal) * 100,
    nominal_v: nominal,
  };
}

/**
 * Conventional voltage-drop limits, as PERCENT of nominal.
 *
 * These are the widely-used installation figures (3% lighting, 5% other) rather
 * than a quotation from any one national annex — limits vary by jurisdiction and
 * by where the origin of the installation is taken. Treat as a default to be
 * confirmed, which is why every call can override them.
 */
export const DEFAULT_DROP_LIMIT_PCT = { lighting: 3, power: 5 } as const;

export type Verdict = 'pass' | 'fail';

export interface LimitCheck {
  value: number;
  limit: number;
  verdict: Verdict;
  /** What the number was judged against, so a result is never an unexplained word. */
  basis: string;
}

export function checkVoltageDrop(
  result: VoltageDropResult | null,
  limitPct: number,
  basis = 'conventional installation limit — confirm against your national annex',
): LimitCheck | null {
  if (!result || !isPos(limitPct)) return null;
  return {
    value: result.drop_percent,
    limit: limitPct,
    verdict: result.drop_percent <= limitPct ? 'pass' : 'fail',
    basis,
  };
}

export interface ConnectedLoad {
  total_w: number;
  current_a: number;
  nominal_v: number;
}

/**
 * Connected load — the raw arithmetic sum, with NO diversity applied.
 *
 * Diversity is a convention that varies by installation type; applying an
 * invented factor would understate the load and undersize the protection. The
 * caller applies it knowingly or not at all.
 */
export function connectedLoad(wattages: number[], phases: Phases = 1, nominalV?: number): ConnectedLoad | null {
  const usable = wattages.filter(isPos);
  if (usable.length === 0) return null;
  const nominal = isPos(nominalV) ? nominalV : (phases === 3 ? 400 : 230);
  const totalW = usable.reduce((a, b) => a + b, 0);
  const currentA = phases === 3 ? totalW / (Math.sqrt(3) * nominal) : totalW / nominal;
  return { total_w: totalW, current_a: currentA, nominal_v: nominal };
}

export interface LumenMethodInput {
  /** Sum of the initial luminous flux of every luminaire, in lumens. */
  totalLumens: number;
  areaM2: number;
  /**
   * Utilisation factor — the fraction of emitted flux reaching the working
   * plane. Depends on room geometry and surface reflectances; it comes from the
   * luminaire's own photometric data, so it MUST be supplied, not guessed.
   */
  utilisationFactor: number;
  /** Maintenance factor (lamp lumen depreciation + dirt). Typically 0.8. */
  maintenanceFactor: number;
}

/**
 * Average maintained illuminance by the lumen method:
 *
 *   E = (Φ_total · UF · MF) / A
 *
 * This is an AVERAGE over the working plane. It says nothing about uniformity or
 * glare, both of which need per-luminaire photometric distribution — which is
 * exactly what DIALux has and this does not. Do not read a passing average as
 * "the lighting design is compliant".
 */
export function lumenMethodLux(input: LumenMethodInput): number | null {
  const { totalLumens, areaM2, utilisationFactor, maintenanceFactor } = input;
  if (!isPos(totalLumens) || !isPos(areaM2)) return null;
  // Both factors are fractions in (0, 1]; anything else is a mis-entered value
  // rather than an unusual room.
  if (!isPos(utilisationFactor) || utilisationFactor > 1) return null;
  if (!isPos(maintenanceFactor) || maintenanceFactor > 1) return null;
  return (totalLumens * utilisationFactor * maintenanceFactor) / areaM2;
}

export function checkIlluminance(
  lux: number | null,
  targetLux: number,
  basis = 'target task illuminance — EN 12464-1 gives values per task, confirm the right one',
): LimitCheck | null {
  if (lux === null || !isPos(targetLux)) return null;
  return {
    value: lux,
    limit: targetLux,
    // Illuminance is a floor, not a ceiling — more light passes.
    verdict: lux >= targetLux ? 'pass' : 'fail',
    basis,
  };
}
