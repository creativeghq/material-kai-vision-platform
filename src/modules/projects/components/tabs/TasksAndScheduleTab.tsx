/** Tasks as a list, a board, a calendar or a schedule — one set of rows, four views, one drawer. */
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, GanttChartSquare, KanbanSquare, List, Loader2, Plus } from 'lucide-react';
import { HubSegmented, type HubSegment } from '@/components/core/hub';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '../../services/projectsService';
import { TasksTab } from './TasksTab';
import { ScheduleTab } from './ScheduleTab';
import { TaskBoard } from '../tasks/TaskBoard';
import { TaskCalendar } from '../tasks/TaskCalendar';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { useProjectTasks } from '../tasks/useProjectTasks';

type View = 'list' | 'board' | 'calendar' | 'schedule';

const VIEWS: readonly HubSegment<View>[] = [
  { value: 'list', label: <span className="flex items-center gap-1.5"><List className="h-3.5 w-3.5" aria-hidden="true" />List</span>, title: 'List' },
  { value: 'board', label: <span className="flex items-center gap-1.5"><KanbanSquare className="h-3.5 w-3.5" aria-hidden="true" />Board</span>, title: 'Board' },
  { value: 'calendar', label: <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Calendar</span>, title: 'Calendar' },
  { value: 'schedule', label: <span className="flex items-center gap-1.5"><GanttChartSquare className="h-3.5 w-3.5" aria-hidden="true" />Schedule</span>, title: 'Schedule' },
];

const VIEW_PREF = 'projects.tasks.view';

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_PREF);
    return VIEWS.some((o) => o.value === v) ? (v as View) : 'list';
  } catch { return 'list'; }
}

export const TasksAndScheduleTab: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const [view, setView] = useState<View>(readView);
  const [sp, setSp] = useSearchParams();
  const state = useProjectTasks(projectId);
  const openTaskId = sp.get('task');

  const openTask = useCallback((id: string | null) => {
    setSp((prev) => {
      const p = new URLSearchParams(prev);
      if (id) p.set('task', id); else p.delete('task');
      return p;
    }, { replace: true });
  }, [setSp]);

  const choose = (v: View) => {
    // The Gantt writes through its own loader, so the shared rows are stale once you leave it.
    if (view === 'schedule' && v !== 'schedule') void state.reload();
    setView(v);
    try { localStorage.setItem(VIEW_PREF, v); } catch { /* not persisted */ }
  };

  // A deep-linked task opens in the list, never over the Gantt, whose rows the drawer cannot refresh.
  useEffect(() => {
    if (openTaskId && view === 'schedule') { setView('list'); void state.reload(); }
  }, [openTaskId, view, state.reload]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isOwner && (view === 'board' || view === 'calendar') && <QuickAdd projectId={projectId} onAdded={state.reload} />}
        <HubSegmented options={VIEWS} value={view} onChange={choose} aria-label="Task view" className="ml-auto" />
      </div>

      {view === 'list' && <TasksTab projectId={projectId} isOwner={isOwner} state={state} onOpenTask={openTask} />}
      {view === 'board' && (state.loading
        ? <Spinner />
        : <TaskBoard state={state} readOnly={!isOwner} onOpen={openTask} />)}
      {view === 'calendar' && (state.loading ? <Spinner /> : <TaskCalendar state={state} onOpen={openTask} />)}
      {/* The Gantt fetches dependencies the other views do not need, so it keeps its own loader. */}
      {view === 'schedule' && <ScheduleTab projectId={projectId} isOwner={isOwner} onShowList={() => choose('list')} />}

      {view !== 'schedule' && <TaskDrawer state={state} projectId={projectId} taskId={openTaskId} readOnly={!isOwner} onClose={() => openTask(null)} />}
    </div>
  );
};

const Spinner = () => (
  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
);

const QuickAdd: React.FC<{ projectId: string; onAdded: () => Promise<void> }> = ({ projectId, onAdded }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await projectsService.createTask({ project_id: projectId, title: title.trim() });
      setTitle('');
      await onAdded();
    } catch (err) {
      toast({ title: 'Failed to add task', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-[240px] flex-1 gap-2 sm:max-w-md">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
        placeholder="Add a task…"
        disabled={busy}
        className="h-9"
      />
      <Button size="sm" variant="outline" onClick={() => void add()} disabled={busy || !title.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1.5 h-4 w-4" />Add</>}
      </Button>
    </div>
  );
};

export default TasksAndScheduleTab;
