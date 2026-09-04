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
  /** What the programme said when the baseline was taken. Null until one is set. */
  baseline_start_date?: string | null;
  baseline_end_date?: string | null;
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

/** One task's place in the network: when it can run, when it must run, and the slack between. */
export interface TaskNetworkNode {
  id: string;
  /** Day offsets from the start of the network, in duration days. */
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  /** Days this task can slip without moving the end of the project. */
  totalFloat: number;
  /** Zero float — moving it moves the completion date. */
  isCritical: boolean;
}

/**
 * The critical path method: a forward pass for the earliest each task can run, a backward pass for
 * the latest it can run without delaying the project, and the float between them.
 *
 * This replaced a longest-single-chain heuristic. Two things were wrong with that: it reported ONE
 * chain when a real programme routinely has several equally critical ones, and it produced no
 * FLOAT — which is the number a site manager actually uses, because "this has four days of slack"
 * is what decides whether a late delivery matters.
 *
 * Still deliberately NOT a full planning engine: no calendars, no resource levelling, no lag, and
 * only finish-to-start is treated as a real constraint. Those change what a date MEANS, and
 * inventing them here would produce confident dates nobody agreed to.
 *
 * Returns null when the edges contain a cycle — the DB rejects those at write time, so null means
 * the data is already inconsistent and a caller should fall back rather than loop.
 */
export function computeNetwork(
  tasks: ScheduleTask[],
  edges: ScheduleEdge[],
): Map<string, TaskNetworkNode> | null {
  const order = topologicalOrder(tasks, edges);
  if (!order) return null;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = new Set(tasks.map((t) => t.id));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const t of tasks) { preds.set(t.id, []); succs.set(t.id, []); }
  for (const e of edges) {
    // An edge naming a task that is not in this view is ignored rather than treated as a missing
    // dependency — filtering the list must not silently change the critical path.
    if (!ids.has(e.predecessor_id) || !ids.has(e.successor_id)) continue;
    preds.get(e.successor_id)!.push(e.predecessor_id);
    succs.get(e.predecessor_id)!.push(e.successor_id);
  }

  const dur = (id: string) => durationDays(byId.get(id)!);

  // Forward pass — the earliest anything can happen.
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const start = Math.max(0, ...(preds.get(id) ?? []).map((p) => ef.get(p) ?? 0));
    es.set(id, start);
    ef.set(id, start + dur(id));
  }

  const projectEnd = Math.max(0, ...order.map((id) => ef.get(id) ?? 0));

  // A network with no duration at all has no critical path to speak of — every task would come
  // back with zero float, marking the whole programme critical, which tells nobody anything.
  if (projectEnd <= 0) return new Map();

  // Backward pass — the latest anything can happen without moving the end.
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const successors = succs.get(id) ?? [];
    const finish = successors.length === 0
      ? projectEnd
      : Math.min(...successors.map((sx) => ls.get(sx) ?? projectEnd));
    lf.set(id, finish);
    ls.set(id, finish - dur(id));
  }

  const out = new Map<string, TaskNetworkNode>();
  for (const id of order) {
    const totalFloat = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    out.set(id, {
      id,
      earlyStart: es.get(id) ?? 0,
      earlyFinish: ef.get(id) ?? 0,
      lateStart: ls.get(id) ?? 0,
      lateFinish: lf.get(id) ?? 0,
      totalFloat,
      isCritical: totalFloat === 0,
    });
  }
  return out;
}

/**
 * The critical tasks: every one with zero float, not merely the longest chain.
 *
 * Derived from `computeNetwork` rather than computed separately, so the highlighted bars and any
 * float shown beside them can never disagree about which tasks are critical.
 */
export function criticalPathIds(tasks: ScheduleTask[], edges: ScheduleEdge[]): Set<string> {
  const net = computeNetwork(tasks, edges);
  if (!net) return new Set();
  const out = new Set<string>();
  for (const n of net.values()) if (n.isCritical) out.add(n.id);
  return out;
}

/**
 * Days later than the baseline said, or null when there is no baseline to compare against.
 *
 * Negative means early. Null is NOT zero: a task with no baseline has not been measured, and
 * reporting it as on time is how a project with no baseline looks perfectly on track.
 */
export function baselineVarianceDays(t: ScheduleTask): number | null {
  const planned = parseDay(t.baseline_end_date ?? null);
  const actual = parseDay(t.end_date);
  if (planned == null || actual == null) return null;
  return Math.round((actual - planned) / DAY_MS);
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
