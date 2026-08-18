/**
 * Project schedule (WS3 #285) — a Gantt over `project_tasks`.
 *
 * Bars, milestone diamonds, dependency arrows, progress fill, and drag-to-move. The scheduling
 * maths lives in `../../lib/schedule` (pure + unit-tested); this file is layout and interaction.
 *
 * `TimelineTab` is the append-only audit log and stays as it is — this is the plan, that is the
 * history. They answer different questions and are deliberately not merged.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, GanttChartSquare, Diamond, Link2, Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  projectsService, type ProjectTask, type ProjectTaskDependency,
} from '../../services/projectsService';
import {
  criticalPathIds, rollupProgress, scheduleWindow, barGeometry, shiftTask,
  parseDay, type ScheduleTask,
} from '../../lib/schedule';
import { todayLocalISO } from '@/utils/datetime';

const ROW_H = 36;
const PX_PER_DAY = 26;
const DAY_MS = 86_400_000;

const toScheduleTask = (t: ProjectTask): ScheduleTask => ({
  id: t.id, title: t.title,
  start_date: t.start_date, end_date: t.end_date,
  progress_pct: t.progress_pct ?? 0, is_milestone: t.is_milestone ?? false,
});

export const ScheduleTab: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [deps, setDeps] = useState<ProjectTaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [drag, setDrag] = useState<{ id: string; startX: number; deltaDays: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [taskTree, dependencies] = await Promise.all([
        projectsService.listTasks(projectId),
        projectsService.listTaskDependencies(projectId),
      ]);
      // The Gantt is flat: subtasks are schedulable rows in their own right, so parents and
      // subtasks are both listed rather than nesting (a nested bar chart hides the child dates).
      const flat: ProjectTask[] = [];
      for (const parent of taskTree) {
        flat.push(parent);
        for (const sub of parent.subtasks) flat.push(sub);
      }
      setTasks(flat);
      setDeps(dependencies);
    } catch (err: any) {
      toast({ title: 'Failed to load schedule', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  const scheduleTasks = useMemo(() => tasks.map(toScheduleTask), [tasks]);
  const win = useMemo(() => scheduleWindow(scheduleTasks), [scheduleTasks]);
  const critical = useMemo(() => criticalPathIds(scheduleTasks, deps), [scheduleTasks, deps]);
  const completion = useMemo(() => rollupProgress(scheduleTasks), [scheduleTasks]);
  const timelineWidth = win.days * PX_PER_DAY;
  const rowIndex = useMemo(() => new Map(tasks.map((t, i) => [t.id, i])), [tasks]);

  // ---- drag to move a bar -------------------------------------------------
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.startX;
      setDrag((d) => (d ? { ...d, deltaDays: Math.round(dx / PX_PER_DAY) } : d));
    };
    const onUp = async () => {
      const current = drag;
      setDrag(null);
      if (!current || current.deltaDays === 0) return;
      const task = tasks.find((t) => t.id === current.id);
      if (!task) return;
      const shifted = shiftTask(toScheduleTask(task), current.deltaDays);
      if (!shifted) return;
      // Optimistic: the bar has already followed the cursor, so snapping back on every save
      // would read as a glitch. Reload on failure instead.
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...shifted } : t)));
      try {
        await projectsService.updateTask(task.id, shifted);
      } catch (err: any) {
        toast({ title: 'Could not move task', description: err?.message, variant: 'destructive' });
        void load();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, tasks, toast, load]);

  // ---- month ticks --------------------------------------------------------
  const monthTicks = useMemo(() => {
    const ticks: { left: number; label: string }[] = [];
    const d = new Date(win.start);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() < win.start + win.days * DAY_MS) {
      ticks.push({
        left: ((d.getTime() - win.start) / DAY_MS) * PX_PER_DAY,
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return ticks;
  }, [win]);

  const todayLeft = useMemo(() => {
    const today = Date.parse(`${todayLocalISO()}T00:00:00Z`);
    const offset = ((today - win.start) / DAY_MS) * PX_PER_DAY;
    return offset >= 0 && offset <= timelineWidth ? offset : null;
  }, [win, timelineWidth]);

  // ---- dependency arrows --------------------------------------------------
  const arrows = useMemo(() => {
    const byId = new Map(scheduleTasks.map((t) => [t.id, t]));
    const out: { d: string; key: string }[] = [];
    for (const dep of deps) {
      const from = byId.get(dep.predecessor_id);
      const to = byId.get(dep.successor_id);
      if (!from || !to) continue;
      const fg = barGeometry(from, win);
      const tg = barGeometry(to, win);
      const fr = rowIndex.get(dep.predecessor_id);
      const tr = rowIndex.get(dep.successor_id);
      if (!fg || !tg || fr == null || tr == null) continue;

      const x1 = (fg.left + fg.width) * timelineWidth;
      const y1 = fr * ROW_H + ROW_H / 2;
      const x2 = tg.left * timelineWidth;
      const y2 = tr * ROW_H + ROW_H / 2;
      // Elbow: out of the predecessor, down/up to the successor's row, then into its start.
      const mid = Math.max(x1 + 8, x2 - 8);
      out.push({ key: dep.id, d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}` });
    }
    return out;
  }, [deps, scheduleTasks, win, rowIndex, timelineWidth]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const scheduled = scheduleTasks.filter((t) => t.start_date);

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <GanttChartSquare className="h-4 w-4 text-primary" /> Schedule
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {scheduled.length} of {tasks.length} tasks scheduled
              {critical.size > 0 && <> · longest chain highlighted</>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Completion</p>
            <p className="text-xl font-medium">{completion}%</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No tasks yet. Add them in the Tasks tab, then give them dates here.
            </p>
          ) : (
            <div className="flex">
              {/* Task names — fixed, so they stay readable while the timeline scrolls. */}
              <div className="shrink-0 border-r border-hairline" style={{ width: 224 }}>
                <div className="h-8 border-b border-hairline" />
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => isOwner && setEditing(t)}
                    className="flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-white/5 disabled:cursor-default"
                    style={{ height: ROW_H }}
                    disabled={!isOwner}
                  >
                    {t.is_milestone && <Diamond className="h-3 w-3 shrink-0 text-amber-400" />}
                    <span className={`truncate ${t.parent_task_id ? 'pl-3 text-muted-foreground' : ''}`}>{t.title}</span>
                  </button>
                ))}
              </div>

              {/* Timeline */}
              <div className="min-w-0 flex-1 overflow-x-auto" ref={timelineRef}>
                <div className="relative" style={{ width: timelineWidth }}>
                  {/* month header */}
                  <div className="relative h-8 border-b border-hairline">
                    {monthTicks.map((m) => (
                      <div key={m.label + m.left} className="absolute top-0 h-full border-l border-hairline pl-1 text-[10px] leading-8 text-muted-foreground" style={{ left: m.left }}>
                        {m.label}
                      </div>
                    ))}
                  </div>

                  <div className="relative" style={{ height: tasks.length * ROW_H }}>
                    {/* gridlines */}
                    {monthTicks.map((m) => (
                      <div key={`g-${m.left}`} className="absolute top-0 bottom-0 border-l border-white/5" style={{ left: m.left }} />
                    ))}
                    {todayLeft != null && (
                      <div className="absolute top-0 bottom-0 border-l border-primary/60" style={{ left: todayLeft }} title="Today" />
                    )}

                    {/* dependency arrows, behind the bars */}
                    <svg className="pointer-events-none absolute inset-0" width={timelineWidth} height={tasks.length * ROW_H}>
                      <defs>
                        <marker id="dep-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                          <path d="M0,0 L6,3 L0,6 z" className="fill-muted-foreground" />
                        </marker>
                      </defs>
                      {arrows.map((a) => (
                        <path key={a.key} d={a.d} fill="none" strokeWidth={1} markerEnd="url(#dep-arrow)"
                          className="stroke-muted-foreground/50" />
                      ))}
                    </svg>

                    {/* bars */}
                    {tasks.map((t, i) => {
                      const st = toScheduleTask(t);
                      const g = barGeometry(st, win);
                      if (!g) return null;
                      const dragging = drag?.id === t.id;
                      const offset = dragging ? drag!.deltaDays * PX_PER_DAY : 0;
                      const left = g.left * timelineWidth + offset;
                      const width = g.width * timelineWidth;
                      const isCritical = critical.has(t.id);

                      if (st.is_milestone) {
                        return (
                          // Dragging reschedules; Enter/Space opens the same edit dialog, so the
                          // milestone is reachable without a mouse instead of being a diamond only
                          // a pointer can operate.
                          <div
                            key={t.id}
                            role="button"
                            tabIndex={isOwner ? 0 : -1}
                            aria-label={`Milestone: ${t.title}, ${t.start_date}`}
                            onMouseDown={(e) => isOwner && setDrag({ id: t.id, startX: e.clientX, deltaDays: 0 })}
                            onKeyDown={(e) => {
                              if (isOwner && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEditing(t); }
                            }}
                            className={`absolute ${isOwner ? 'cursor-grab' : ''}`}
                            style={{ left: left - 6, top: i * ROW_H + ROW_H / 2 - 6, width: 12, height: 12 }}
                            title={`${t.title} — ${t.start_date}`}
                          >
                            <div className={`h-3 w-3 rotate-45 ${isCritical ? 'bg-primary' : 'bg-amber-400'}`} />
                          </div>
                        );
                      }
                      return (
                        <div
                          key={t.id}
                          role="button"
                          tabIndex={isOwner ? 0 : -1}
                          aria-label={`${t.title}: ${t.start_date} to ${t.end_date}, ${st.progress_pct}% complete`}
                          onMouseDown={(e) => isOwner && setDrag({ id: t.id, startX: e.clientX, deltaDays: 0 })}
                          onClick={() => !dragging && isOwner && setEditing(t)}
                          onKeyDown={(e) => {
                            if (isOwner && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEditing(t); }
                          }}
                          className={`absolute overflow-hidden rounded-md ${isOwner ? 'cursor-grab' : ''} ${
                            isCritical ? 'bg-primary/30 ring-1 ring-primary/60' : 'bg-white/10'
                          }`}
                          style={{ left, width, top: i * ROW_H + 8, height: ROW_H - 16 }}
                          title={`${t.title} — ${t.start_date} → ${t.end_date} (${st.progress_pct}%)`}
                        >
                          <div
                            className={isCritical ? 'h-full bg-primary/70' : 'h-full bg-white/25'}
                            style={{ width: `${Math.min(100, Math.max(0, st.progress_pct))}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <ScheduleEditDialog
          task={editing}
          allTasks={tasks}
          deps={deps}
          projectId={projectId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const ScheduleEditDialog: React.FC<{
  task: ProjectTask;
  allTasks: ProjectTask[];
  deps: ProjectTaskDependency[];
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ task, allTasks, deps, projectId, onClose, onSaved }) => {
  const { toast } = useToast();
  const [start, setStart] = useState(task.start_date ?? '');
  const [end, setEnd] = useState(task.end_date ?? '');
  const [progress, setProgress] = useState(String(task.progress_pct ?? 0));
  const [milestone, setMilestone] = useState(task.is_milestone ?? false);
  const [predecessor, setPredecessor] = useState('');
  const [saving, setSaving] = useState(false);

  const myDeps = deps.filter((d) => d.successor_id === task.id);
  const titleById = new Map(allTasks.map((t) => [t.id, t.title]));

  const save = async () => {
    const pct = Number(progress);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast({ title: 'Progress must be between 0 and 100', variant: 'destructive' }); return;
    }
    if (start && end && parseDay(end)! < parseDay(start)!) {
      toast({ title: 'End date is before the start date', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await projectsService.updateTask(task.id, {
        start_date: start || null,
        // A milestone is a point in time: it keeps a single date so the diamond cannot smear
        // into a bar if someone had previously given it a range.
        end_date: milestone ? (start || null) : (end || null),
        progress_pct: Math.round(pct),
        is_milestone: milestone,
      });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  const addDep = async () => {
    if (!predecessor) return;
    try {
      await projectsService.addTaskDependency(projectId, predecessor, task.id);
      setPredecessor('');
      onSaved();
    } catch (err: any) {
      // The DB refuses cycles; surface that plainly rather than as a raw constraint name.
      const cyclic = /cycle/i.test(err?.message ?? '');
      toast({
        title: cyclic ? 'That would create a loop' : 'Could not add dependency',
        description: cyclic ? 'This task already comes before the one you picked.' : err?.message,
        variant: 'destructive',
      });
    }
  };

  const removeDep = async (id: string) => {
    try { await projectsService.removeTaskDependency(id); onSaved(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  // Anything already downstream of this task would form a loop; the DB would reject it, so it is
  // not offered. This is a UX filter only — the DB trigger remains the actual guarantee.
  const downstream = useMemo(() => {
    const forward = new Map<string, string[]>();
    for (const d of deps) {
      if (!forward.has(d.predecessor_id)) forward.set(d.predecessor_id, []);
      forward.get(d.predecessor_id)!.push(d.successor_id);
    }
    const seen = new Set<string>([task.id]);
    const stack = [task.id];
    while (stack.length) {
      for (const n of forward.get(stack.pop()!) ?? []) {
        if (!seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    return seen;
  }, [deps, task.id]);

  const candidates = allTasks.filter(
    (t) => !downstream.has(t.id) && !myDeps.some((d) => d.predecessor_id === t.id),
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="truncate">{task.title}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={milestone} onCheckedChange={(v) => setMilestone(!!v)} />
            Milestone (a single dated point, no duration)
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input type="date" className="h-9" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            {!milestone && (
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input type="date" className="h-9" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
              </div>
            )}
          </div>

          {!milestone && (
            <div className="space-y-1">
              <Label className="text-xs">Progress %</Label>
              <Input type="text" inputMode="numeric" className="h-9" value={progress} onChange={(e) => setProgress(e.target.value)} />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Link2 className="h-3 w-3" /> Runs after</Label>
            {myDeps.length > 0 && (
              <div className="rounded-md border border-white/10 divide-y divide-hairline mb-2">
                {myDeps.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{titleById.get(d.predecessor_id) ?? 'Unknown task'}</span>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeDep(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <select
                className="h-9 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-sm"
                value={predecessor}
                onChange={(e) => setPredecessor(e.target.value)}
              >
                <option value="">Add a predecessor…</option>
                {candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <Button size="sm" variant="outline" className="rounded-full" onClick={addDep} disabled={!predecessor}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleTab;
