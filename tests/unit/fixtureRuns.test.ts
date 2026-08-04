/**
 * Run geometry — pipe / cable / circuit lengths.
 *
 * A run length becomes a cable order, a pipe cut list and (in Phase 4) a voltage
 * drop. The dangerous failure is not a crash but a confident wrong number, so
 * these tests concentrate on:
 *
 *   • length returning null, never 0, when the backdrop carries no scale
 *   • vertices actually lengthening the path (a run around a corner is longer
 *     than the straight line, and billing the straight line under-orders cable)
 *   • orphaned runs being pruned rather than silently skipped forever
 */
import { describe, it, expect } from 'vitest';
import {
  runLengthMm,
  totalRunLengthMm,
  pruneOrphanRuns,
  newRunId,
  ELECTRICAL_RUN_DEFS,
  PLUMBING_RUN_DEFS,
  LIGHTING_RUN_DEFS,
  type FixtureRun,
  type RunEndpoint,
} from '../../src/utils/fixtureRuns';

const symbols: RunEndpoint[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 1, y: 0 },
  { id: 'c', x: 1, y: 1 },
];

const RECT = { kind: 'rect', width_mm: 4000, height_mm: 3000 };
const UPLOAD = { kind: 'upload' };

const run = (over: Partial<FixtureRun> = {}): FixtureRun => ({
  id: 'r1', kind: 'socket_circuit', from: 'a', to: 'b', ...over,
});

describe('runLengthMm', () => {
  it('measures a straight run across a rect backdrop', () => {
    // a(0,0) → b(1,0) spans the full 4000mm width.
    expect(runLengthMm(run(), symbols, RECT)).toBe(4000);
  });

  it('uses both axes, not just the wider one', () => {
    // b(1,0) → c(1,1) spans the 3000mm height.
    expect(runLengthMm(run({ from: 'b', to: 'c' }), symbols, RECT)).toBe(3000);
  });

  it('a diagonal is the true distance, not the bounding box', () => {
    // a(0,0) → c(1,1) over 4000×3000 → 5000mm (3-4-5).
    expect(runLengthMm(run({ from: 'a', to: 'c' }), symbols, RECT)).toBe(5000);
  });

  it('counts vertices — a run around a corner is longer than the straight line', () => {
    const straight = runLengthMm(run({ from: 'a', to: 'c' }), symbols, RECT)!;
    // Same endpoints, routed via b(1,0): 4000 across + 3000 down = 7000.
    const routed = runLengthMm(
      run({ from: 'a', to: 'c', vertices: [{ x: 1, y: 0 }] }),
      symbols,
      RECT,
    )!;
    expect(routed).toBe(7000);
    // The dangerous bug would be ignoring vertices and under-ordering cable.
    expect(routed).toBeGreaterThan(straight);
  });

  // Null, not 0 — a zero total reads as "no cable needed" and orders nothing.
  it('returns null when the backdrop is an uploaded image with no scale', () => {
    expect(runLengthMm(run(), symbols, UPLOAD)).toBeNull();
  });

  it('returns null when rect dimensions are missing', () => {
    expect(runLengthMm(run(), symbols, { kind: 'rect' })).toBeNull();
    expect(runLengthMm(run(), symbols, { kind: 'rect', width_mm: 4000 })).toBeNull();
  });

  it('returns null when an endpoint no longer exists', () => {
    expect(runLengthMm(run({ to: 'deleted' }), symbols, RECT)).toBeNull();
  });
});

describe('totalRunLengthMm', () => {
  it('sums measurable runs', () => {
    const runs = [run(), run({ id: 'r2', from: 'b', to: 'c' })];
    expect(totalRunLengthMm(runs, symbols, RECT)).toBe(7000);
  });

  // All-or-nothing: a total that silently omits an unmeasurable run looks
  // complete while under-representing the job.
  it('is null if ANY run is unmeasurable, not a partial sum', () => {
    const runs = [run(), run({ id: 'r2', from: 'b', to: 'gone' })];
    expect(totalRunLengthMm(runs, symbols, RECT)).toBeNull();
  });

  it('is null with no runs at all — not 0', () => {
    expect(totalRunLengthMm([], symbols, RECT)).toBeNull();
  });
});

describe('pruneOrphanRuns', () => {
  it('drops runs whose endpoint was deleted', () => {
    const runs = [run(), run({ id: 'r2', to: 'gone' })];
    expect(pruneOrphanRuns(runs, symbols).map((r) => r.id)).toEqual(['r1']);
  });

  it('drops a run when its ORIGIN was deleted, not just its target', () => {
    expect(pruneOrphanRuns([run({ from: 'gone' })], symbols)).toEqual([]);
  });

  it('keeps everything when nothing is orphaned', () => {
    const runs = [run(), run({ id: 'r2', from: 'b', to: 'c' })];
    expect(pruneOrphanRuns(runs, symbols)).toHaveLength(2);
  });

  it('is empty-safe', () => {
    expect(pruneOrphanRuns([], symbols)).toEqual([]);
    expect(pruneOrphanRuns([run()], [])).toEqual([]);
  });
});

describe('run ids', () => {
  it('are unique across rapid successive calls', () => {
    // Date.now() alone collides inside a tick; the sequence counter is what
    // makes two runs drawn in the same millisecond distinguishable.
    const ids = new Set(Array.from({ length: 200 }, () => newRunId()));
    expect(ids.size).toBe(200);
  });
});

describe('run palettes', () => {
  it('every kind is unique within its discipline', () => {
    for (const defs of [ELECTRICAL_RUN_DEFS, PLUMBING_RUN_DEFS, LIGHTING_RUN_DEFS]) {
      const kinds = defs.map((d) => d.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it('every kind has a style in the PDF builder', async () => {
    // Drift here means a run renders as an anonymous grey line on the drawing —
    // on a services plan that reads as a different service entirely.
    const { readFileSync } = await import('node:fs');
    const builders = readFileSync('supabase/functions/generate-moodboard-sheet-pdf/builders.ts', 'utf8');
    const styled = new Set(
      [...builders.matchAll(/^\s{2}([a-z_]+):\s*\{\s*rgb:/gm)].map((m) => m[1]),
    );
    const all = [...ELECTRICAL_RUN_DEFS, ...PLUMBING_RUN_DEFS, ...LIGHTING_RUN_DEFS];
    const missing = all.map((d) => d.kind).filter((k) => !styled.has(k));
    expect(missing, 'run kinds with no RUN_STYLES entry').toEqual([]);
  });
});
