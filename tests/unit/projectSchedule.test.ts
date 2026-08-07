/**
 * WS3 (#285) schedule maths.
 *
 * The scheduling code is the kind that looks obviously right and is off by one: inclusive vs
 * exclusive day spans, local-vs-UTC date parsing that shifts a bar across a timezone boundary, and
 * a topological sort that spins forever on a cycle. Each of those gets a test here.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDay, toDayString, durationDays, topologicalOrder, criticalPathIds,
  rollupProgress, scheduleWindow, barGeometry, shiftTask,
  type ScheduleTask, type ScheduleEdge,
} from '@/modules/projects/lib/schedule';

const task = (id: string, over: Partial<ScheduleTask> = {}): ScheduleTask => ({
  id, title: id, start_date: null, end_date: null, progress_pct: 0, is_milestone: false, ...over,
});

describe('date handling', () => {
  it('parses YYYY-MM-DD as UTC, not local time', () => {
    // Parsed locally, `2026-03-01` becomes Feb 28 23:00 UTC in CET and the bar renders a day early.
    expect(toDayString(parseDay('2026-03-01')!)).toBe('2026-03-01');
    expect(toDayString(parseDay('2026-01-01')!)).toBe('2026-01-01');
  });

  it('returns null for missing or malformed dates', () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay('not-a-date')).toBeNull();
  });

  it('counts a same-day task as one day, not zero', () => {
    expect(durationDays(task('a', { start_date: '2026-03-01', end_date: '2026-03-01' }))).toBe(1);
    expect(durationDays(task('a', { start_date: '2026-03-01', end_date: '2026-03-05' }))).toBe(5);
  });

  it('gives milestones zero duration regardless of dates', () => {
    expect(durationDays(task('m', { start_date: '2026-03-01', end_date: '2026-03-09', is_milestone: true }))).toBe(0);
  });
});

describe('topologicalOrder', () => {
  it('orders predecessors before successors', () => {
    const tasks = [task('c'), task('a'), task('b')];
    const edges: ScheduleEdge[] = [
      { predecessor_id: 'a', successor_id: 'b' },
      { predecessor_id: 'b', successor_id: 'c' },
    ];
    const order = topologicalOrder(tasks, edges)!;
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('returns null on a cycle instead of looping forever', () => {
    const tasks = [task('a'), task('b')];
    const edges: ScheduleEdge[] = [
      { predecessor_id: 'a', successor_id: 'b' },
      { predecessor_id: 'b', successor_id: 'a' },
    ];
    expect(topologicalOrder(tasks, edges)).toBeNull();
  });

  it('ignores edges pointing at tasks that are not in the view', () => {
    const tasks = [task('a')];
    const edges: ScheduleEdge[] = [{ predecessor_id: 'a', successor_id: 'ghost' }];
    expect(topologicalOrder(tasks, edges)).toEqual(['a']);
  });
});

describe('criticalPathIds', () => {
  it('picks the longest chain, not the one with most tasks', () => {
    // a(10d) -> b(10d) is 20 days over two tasks;
    // c(1d) -> d(1d) -> e(1d) is 3 days over three. The longer chain wins.
    const tasks = [
      task('a', { start_date: '2026-03-01', end_date: '2026-03-10' }),
      task('b', { start_date: '2026-03-11', end_date: '2026-03-20' }),
      task('c', { start_date: '2026-03-01', end_date: '2026-03-01' }),
      task('d', { start_date: '2026-03-02', end_date: '2026-03-02' }),
      task('e', { start_date: '2026-03-03', end_date: '2026-03-03' }),
    ];
    const edges: ScheduleEdge[] = [
      { predecessor_id: 'a', successor_id: 'b' },
      { predecessor_id: 'c', successor_id: 'd' },
      { predecessor_id: 'd', successor_id: 'e' },
    ];
    const cp = criticalPathIds(tasks, edges);
    expect([...cp].sort()).toEqual(['a', 'b']);
  });

  it('returns an empty set when nothing has dates', () => {
    expect(criticalPathIds([task('a'), task('b')], []).size).toBe(0);
  });

  it('does not throw on cyclic data', () => {
    const tasks = [task('a', { start_date: '2026-03-01', end_date: '2026-03-02' })];
    const edges: ScheduleEdge[] = [{ predecessor_id: 'a', successor_id: 'a' }];
    expect(() => criticalPathIds(tasks, edges)).not.toThrow();
  });
});

describe('rollupProgress', () => {
  it('weights by duration rather than task count', () => {
    // A 100%-done 1-day task should not drag a 0%-done 99-day task to 50%.
    const tasks = [
      task('long', { start_date: '2026-01-01', end_date: '2026-04-09', progress_pct: 0 }),
      task('short', { start_date: '2026-01-01', end_date: '2026-01-01', progress_pct: 100 }),
    ];
    expect(rollupProgress(tasks)).toBe(1);
  });

  it('falls back to equal weight when no task has dates', () => {
    const tasks = [task('a', { progress_pct: 100 }), task('b', { progress_pct: 0 })];
    expect(rollupProgress(tasks)).toBe(50);
  });

  it('is 0 for an empty project and clamps out-of-range values', () => {
    expect(rollupProgress([])).toBe(0);
    expect(rollupProgress([task('a', { progress_pct: 150 })])).toBe(100);
    expect(rollupProgress([task('a', { progress_pct: -20 })])).toBe(0);
  });
});

describe('bar geometry', () => {
  it('places a bar proportionally inside the window', () => {
    const tasks = [task('a', { start_date: '2026-03-01', end_date: '2026-03-10' })];
    const win = scheduleWindow(tasks);
    const g = barGeometry(tasks[0], win)!;
    expect(g.left).toBeGreaterThan(0);
    expect(g.left + g.width).toBeLessThanOrEqual(1);
  });

  it('gives a milestone a non-zero width so it stays clickable', () => {
    const t = task('m', { start_date: '2026-03-05', end_date: '2026-03-05', is_milestone: true });
    const win = scheduleWindow([t]);
    expect(barGeometry(t, win)!.width).toBeGreaterThan(0);
  });

  it('returns null for an unscheduled task', () => {
    expect(barGeometry(task('a'), scheduleWindow([]))).toBeNull();
  });

  it('still produces a usable window when nothing is scheduled', () => {
    const win = scheduleWindow([]);
    expect(win.days).toBeGreaterThan(1);
    expect(win.end).toBeGreaterThan(win.start);
  });
});

describe('shiftTask', () => {
  it('moves both ends and preserves duration', () => {
    const t = task('a', { start_date: '2026-03-01', end_date: '2026-03-05' });
    expect(shiftTask(t, 3)).toEqual({ start_date: '2026-03-04', end_date: '2026-03-08' });
    expect(shiftTask(t, -1)).toEqual({ start_date: '2026-02-28', end_date: '2026-03-04' });
  });

  it('crosses a month and a year boundary correctly', () => {
    const t = task('a', { start_date: '2026-12-30', end_date: '2026-12-31' });
    expect(shiftTask(t, 2)).toEqual({ start_date: '2027-01-01', end_date: '2027-01-02' });
  });

  it('returns null for a task with no start date', () => {
    expect(shiftTask(task('a'), 3)).toBeNull();
  });
});
