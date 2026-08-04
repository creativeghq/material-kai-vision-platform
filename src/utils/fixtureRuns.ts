/**
 * Runs — the pipes, cables and circuits joining symbols on a services plan.
 *
 * This is the primitive the plans never had. Until now every sheet was a scatter
 * of independent points, which is why nothing downstream could be computed: you
 * cannot size a pipe or find a voltage drop without knowing what connects to
 * what, and how far it travels.
 *
 * Kept out of FixtureSymbolCanvas deliberately. The canvas imports the Supabase
 * client for its product search, and pure geometry that decides how much cable
 * someone orders should be testable without a database.
 */

export interface FixtureRun {
  id: string;
  kind: string;
  /** Symbol id the run starts at. */
  from: string;
  /** Symbol id the run ends at. */
  to: string;
  /** Intermediate corners, so a run follows walls instead of cutting through them. */
  vertices?: Array<{ x: number; y: number }>;
  label?: string;
}

export interface RunDef {
  kind: string;
  label: string;
  /** Rendered dash pattern. Empty = solid. */
  dash?: number[];
  color: string;
}

/** Minimal shape runLengthMm needs — avoids depending on the full symbol type. */
export interface RunEndpoint {
  id?: string;
  x: number;
  y: number;
}

export const ELECTRICAL_RUN_DEFS: RunDef[] = [
  { kind: 'lighting_circuit',  label: 'Lighting circuit', color: '#f59e0b' },
  { kind: 'socket_circuit',    label: 'Socket circuit',   color: '#3b82f6' },
  { kind: 'dedicated_circuit', label: 'Dedicated',        color: '#ef4444', dash: [4, 2] },
  { kind: 'switch_leg',        label: 'Switch leg',       color: '#a78bfa', dash: [2, 2] },
];

export const PLUMBING_RUN_DEFS: RunDef[] = [
  { kind: 'cold_supply', label: 'Cold supply',  color: '#3b82f6' },
  { kind: 'hot_supply',  label: 'Hot supply',   color: '#ef4444' },
  { kind: 'waste',       label: 'Waste / soil', color: '#78716c', dash: [5, 3] },
];

export const LIGHTING_RUN_DEFS: RunDef[] = [
  { kind: 'lighting_circuit', label: 'Circuit',    color: '#f59e0b' },
  { kind: 'switch_leg',       label: 'Switch leg', color: '#a78bfa', dash: [2, 2] },
];

let runSeq = 0;
/** Unique within a sheet. Date.now() alone collides inside a single tick. */
export function newRunId(): string {
  runSeq += 1;
  return `r${Date.now().toString(36)}${runSeq.toString(36)}`;
}

/**
 * Real length of a run in millimetres, or null when the backdrop carries no scale.
 *
 * Returns null rather than 0 on purpose. A rect backdrop has exact dimensions so
 * the length is real; an uploaded image has none, and inventing one would put a
 * confident wrong number in front of someone about to buy cable. A zero would be
 * worse still — it reads as "no cable needed".
 */
export function runLengthMm(
  run: FixtureRun,
  symbols: RunEndpoint[],
  backdrop: { kind: string; width_mm?: number; height_mm?: number },
): number | null {
  if (backdrop.kind !== 'rect' || !backdrop.width_mm || !backdrop.height_mm) return null;
  const a = symbols.find((s) => s.id === run.from);
  const b = symbols.find((s) => s.id === run.to);
  if (!a || !b) return null;
  const pts = [a, ...(run.vertices ?? []), b];
  let mm = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i].x - pts[i - 1].x) * backdrop.width_mm;
    const dy = (pts[i].y - pts[i - 1].y) * backdrop.height_mm;
    mm += Math.hypot(dx, dy);
  }
  return mm;
}

/**
 * Total run length, or null if ANY run is unmeasurable.
 *
 * All-or-nothing on purpose: summing only the measurable runs would report a
 * total that looks complete while silently omitting part of the job.
 */
export function totalRunLengthMm(
  runs: FixtureRun[],
  symbols: RunEndpoint[],
  backdrop: { kind: string; width_mm?: number; height_mm?: number },
): number | null {
  if (runs.length === 0) return null;
  let mm = 0;
  for (const r of runs) {
    const len = runLengthMm(r, symbols, backdrop);
    if (len === null) return null;
    mm += len;
  }
  return mm;
}

/** Drop runs whose endpoints no longer exist — a deleted symbol orphans its runs. */
export function pruneOrphanRuns(runs: FixtureRun[], symbols: RunEndpoint[]): FixtureRun[] {
  const ids = new Set(symbols.map((s) => s.id));
  return runs.filter((r) => ids.has(r.from) && ids.has(r.to));
}
