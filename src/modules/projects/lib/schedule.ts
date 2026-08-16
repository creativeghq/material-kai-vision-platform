/**
 * Project schedule maths (WS3 #285) — kept pure and separate from the Gantt component so it can
 * be tested directly. Deliberately NOT full CPM: no calendars, no resource levelling, no lag, and
 * only finish-to-start is treated as a real constraint (the other three dep types are stored but
 * scheduled as FS). That is the documented v1 scope.
 */
import { todayLocalISO } from '@/utils/datetime';

export interface ScheduleTask {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  progress_pct: number;
  is_milestone: boolean;
}

export interface ScheduleEdge {
  predecessor_id: string;
  successor_id: string;
}

const DAY_MS = 86_400_000;

/** Parse a `YYYY-MM-DD` date as UTC midnight — local parsing shifts the bar by a day in some zones. */
export function parseDay(d: string | null): number | null {
  if (!d) return null;
  const ms = Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

export function toDayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive span in days: a task starting and ending the same day lasts 1 day. Milestones are 0. */
export function durationDays(t: ScheduleTask): number {
  if (t.is_milestone) return 0;
  const s = parseDay(t.start_date);
  const e = parseDay(t.end_date);
  if (s == null || e == null) return 0;
  return Math.max(0, Math.round((e - s) / DAY_MS)) + 1;
}

/**
 * Topological order, or `null` when the edges contain a cycle.
 *
 * The DB rejects cycles at write time, so `null` here means the data is already inconsistent —
 * callers fall back to input order rather than looping forever. Edges pointing at unknown task
 * ids (a task filtered out of the view) are ignored rather than treated as a missing dependency.
 */
export function topologicalOrder(tasks: ScheduleTask[], edges: ScheduleEdge[]): string[] | null {
  const ids = new Set(tasks.map((t) => t.id));
  const indegree = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const t of tasks) { indegree.set(t.id, 0); next.set(t.id, []); }

  for (const e of edges) {
    if (!ids.has(e.predecessor_id) || !ids.has(e.successor_id)) continue;
    next.get(e.predecessor_id)!.push(e.successor_id);
    indegree.set(e.successor_id, (indegree.get(e.successor_id) ?? 0) + 1);
  }

  const queue = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of next.get(id) ?? []) {
      const d = (indegree.get(s) ?? 0) - 1;
      indegree.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  return order.length === tasks.length ? order : null;
}

/**
 * The longest chain by duration — the naive critical path. Returns the set of task ids on it.
 *
 * "Critical" here means "on the longest dependency chain", not "has zero float against a deadline";
 * without a project finish date those are different questions and only the first is answerable.
 */
export function criticalPathIds(tasks: ScheduleTask[], edges: ScheduleEdge[]): Set<string> {
  const order = topologicalOrder(tasks, edges);
  if (!order || order.length === 0) return new Set();

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = new Set(tasks.map((t) => t.id));
  const preds = new Map<string, string[]>();
  for (const t of tasks) preds.set(t.id, []);
  for (const e of edges) {
    if (!ids.has(e.predecessor_id) || !ids.has(e.successor_id)) continue;
    preds.get(e.successor_id)!.push(e.predecessor_id);
  }

  const dist = new Map<string, number>();
  const cameFrom = new Map<string, string | null>();
  for (const id of order) {
    const own = durationDays(byId.get(id)!);
    let best = 0;
    let bestFrom: string | null = null;
    for (const p of preds.get(id) ?? []) {
      const d = dist.get(p) ?? 0;
      if (d > best) { best = d; bestFrom = p; }
    }
    dist.set(id, best + own);
    cameFrom.set(id, bestFrom);
  }

  let tail: string | null = null;
  let max = -1;
  for (const [id, d] of dist) if (d > max) { max = d; tail = id; }
  if (tail == null || max <= 0) return new Set();

  const path = new Set<string>();
  let cur: string | null = tail;
  while (cur) { path.add(cur); cur = cameFrom.get(cur) ?? null; }
  return path;
}

/**
 * Project completion %, duration-weighted so a two-month task counts for more than a one-day one.
 *
 * Milestones have zero duration and would vanish under pure weighting, so they are weighted as a
 * single day. Tasks with no dates fall back to one day each — otherwise a schedule where nobody
 * has filled in dates yet reports 0% forever regardless of real progress.
 */
export function rollupProgress(tasks: ScheduleTask[]): number {
  if (tasks.length === 0) return 0;
  let weighted = 0;
  let total = 0;
  for (const t of tasks) {
    const w = Math.max(1, durationDays(t));
    weighted += w * Math.min(100, Math.max(0, t.progress_pct ?? 0));
    total += w;
  }
  return total === 0 ? 0 : Math.round(weighted / total);
}

/**
 * The window the chart spans, padded so bars never touch the edge. Falls back to a month around
 * today when nothing is scheduled yet.
 */
export function scheduleWindow(tasks: ScheduleTask[]): { start: number; end: number; days: number } {
  const points: number[] = [];
  for (const t of tasks) {
    const s = parseDay(t.start_date);
    const e = parseDay(t.end_date);
    if (s != null) points.push(s);
    if (e != null) points.push(e);
  }
  const today = Date.parse(`${todayLocalISO()}T00:00:00Z`);
  let start = points.length ? Math.min(...points) : today - 7 * DAY_MS;
  let end = points.length ? Math.max(...points) : today + 21 * DAY_MS;
  start -= 2 * DAY_MS;
  end += 2 * DAY_MS;
  const days = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  return { start, end, days };
}

/** Fractional column offset/width for a bar, as a 0..1 share of the window. */
export function barGeometry(
  t: ScheduleTask, win: { start: number; days: number },
): { left: number; width: number } | null {
  const s = parseDay(t.start_date);
  const e = parseDay(t.end_date) ?? s;
  if (s == null || e == null) return null;
  const offsetDays = Math.round((s - win.start) / DAY_MS);
  const spanDays = t.is_milestone ? 1 : Math.max(1, Math.round((e - s) / DAY_MS) + 1);
  return { left: offsetDays / win.days, width: spanDays / win.days };
}

/** Shift a task's span by whole days, keeping its duration. Used by bar dragging. */
export function shiftTask(t: ScheduleTask, deltaDays: number): { start_date: string; end_date: string } | null {
  const s = parseDay(t.start_date);
  if (s == null) return null;
  const e = parseDay(t.end_date) ?? s;
  return {
    start_date: toDayString(s + deltaDays * DAY_MS),
    end_date: toDayString(e + deltaDays * DAY_MS),
  };
}
