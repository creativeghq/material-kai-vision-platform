/**
 * The critical path method, and what a baseline measures.
 *
 * This replaced a longest-single-chain heuristic that was wrong in two ways: it reported ONE chain
 * when a real programme routinely has several equally critical, and it produced no FLOAT — the
 * number a site manager actually uses, because "this has four days of slack" is what decides
 * whether a late delivery matters.
 *
 * Pure functions over tasks and edges, so every case here is exact arithmetic rather than a
 * plausible-looking Gantt.
 */
import { describe, it, expect } from 'vitest';
import {
  computeNetwork, criticalPathIds, baselineVarianceDays,
  type ScheduleTask, type ScheduleEdge,
} from '@/modules/projects/lib/schedule';

/** A task of `days` duration starting on 2026-01-01, so durations are exact and readable. */
const task = (id: string, days: number, over: Partial<ScheduleTask> = {}): ScheduleTask => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const end = new Date(Date.UTC(2026, 0, 1));
  // durationDays is inclusive: same day start and end is one day.
  end.setUTCDate(end.getUTCDate() + Math.max(0, days - 1));
  return {
    id,
    title: id,
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    progress_pct: 0,
    is_milestone: false,
    ...over,
  };
};

const edge = (predecessor_id: string, successor_id: string): ScheduleEdge => ({ predecessor_id, successor_id });

describe('the critical path', () => {
  /**
   * A → B → D is 10 days; A → C → D is 8. B is critical, C has 2 days of float.
   *
   * The float is the whole point: the old heuristic would have named the long chain and said
   * nothing about C, so nobody could tell that C could slip two days for free.
   */
  it('gives every task its float, not just the longest chain', () => {
    const tasks = [task('A', 2), task('B', 5), task('C', 3), task('D', 3)];
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')];
    const net = computeNetwork(tasks, edges)!;

    expect(net.get('A')!.totalFloat).toBe(0);
    expect(net.get('B')!.totalFloat).toBe(0);
    expect(net.get('D')!.totalFloat).toBe(0);
    // 5-day B against 3-day C on parallel branches — C can slip two days without moving the end.
    expect(net.get('C')!.totalFloat).toBe(2);
    expect(net.get('C')!.isCritical).toBe(false);
  });

  it('reports every zero-float task as critical, not one chain', () => {
    // Two parallel branches of EQUAL length: both are critical, and a longest-chain walk could
    // only ever name one of them.
    const tasks = [task('A', 1), task('B', 4), task('C', 4), task('D', 1)];
    const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')];
    const critical = criticalPathIds(tasks, edges);
    expect([...critical].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('computes the early and late windows a Gantt would draw', () => {
    const tasks = [task('A', 3), task('B', 2)];
    const net = computeNetwork(tasks, [edge('A', 'B')])!;
    expect(net.get('A')).toMatchObject({ earlyStart: 0, earlyFinish: 3, lateStart: 0, lateFinish: 3 });
    expect(net.get('B')).toMatchObject({ earlyStart: 3, earlyFinish: 5, lateStart: 3, lateFinish: 5 });
  });

  it('returns null on a cycle rather than looping', () => {
    // The DB rejects cycles at write time, so null means the data is already inconsistent and the
    // caller should fall back — never spin.
    const tasks = [task('A', 1), task('B', 1)];
    expect(computeNetwork(tasks, [edge('A', 'B'), edge('B', 'A')])).toBeNull();
    expect(criticalPathIds(tasks, [edge('A', 'B'), edge('B', 'A')])).toEqual(new Set());
  });

  it('calls nothing critical when the programme has no duration', () => {
    // Every task zero-length would give every task zero float, marking the whole programme
    // critical — which tells nobody anything.
    const tasks = [
      { ...task('A', 0), start_date: null, end_date: null },
      { ...task('B', 0), start_date: null, end_date: null },
    ];
    expect(criticalPathIds(tasks, [edge('A', 'B')]).size).toBe(0);
  });

  it('ignores an edge naming a task outside the view', () => {
    // Filtering the task list must not silently change the critical path.
    const tasks = [task('A', 2), task('B', 3)];
    const net = computeNetwork(tasks, [edge('A', 'B'), edge('GHOST', 'B')])!;
    expect(net.get('B')!.earlyStart).toBe(2);
  });

  it('treats a milestone as zero duration without breaking the chain', () => {
    const tasks = [task('A', 4), task('M', 0, { is_milestone: true }), task('B', 2)];
    const net = computeNetwork(tasks, [edge('A', 'M'), edge('M', 'B')])!;
    expect(net.get('M')!.earlyStart).toBe(4);
    expect(net.get('M')!.earlyFinish).toBe(4);
    expect(net.get('B')!.earlyStart).toBe(4);
  });
});

describe('baseline variance', () => {
  it('measures days later than the baseline said', () => {
    const t = task('A', 1, { end_date: '2026-03-10', baseline_end_date: '2026-03-03' });
    expect(baselineVarianceDays(t)).toBe(7);
  });

  it('reports early as negative', () => {
    const t = task('A', 1, { end_date: '2026-03-01', baseline_end_date: '2026-03-03' });
    expect(baselineVarianceDays(t)).toBe(-2);
  });

  /**
   * The one that matters. A task with no baseline has not been MEASURED, and returning 0 would
   * make a project nobody has baselined look perfectly on track.
   */
  it('returns null with no baseline, never zero', () => {
    expect(baselineVarianceDays(task('A', 1, { baseline_end_date: null }))).toBeNull();
    expect(baselineVarianceDays(task('A', 1, { end_date: null, baseline_end_date: '2026-03-03' }))).toBeNull();
  });
});
