import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckSquare, ListTodo, Loader2, MessageSquare, Diamond } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { HubEmptyState, HubSegmented, type HubSegment } from '@/components/core/hub';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { warrantyClaimService, taskGateBlocks } from '@/modules/crm/services/warrantyClaimService';
import { projectsService, type MyTask, type TaskStatus } from '../services/projectsService';
import { TASK_PRIORITY_RANK, TASK_STATUSES, TASK_STATUS_LABEL, isTaskPriority } from '../taskVocabulary';
import { DueLabel, PriorityTag, daysFromToday } from '../components/tasks/taskBits';
import { TaskComments } from '../components/tasks/TaskDrawer';

type Scope = 'mine' | 'assigned';

const SCOPES: readonly HubSegment<Scope>[] = [
  { value: 'mine', label: 'All my work', title: 'Assigned to you, plus unassigned tasks in your projects' },
  { value: 'assigned', label: 'Assigned to me', title: 'Only tasks someone gave you' },
];

const GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'undated', label: 'No date' },
  { key: 'done', label: 'Done' },
] as const;
type GroupKey = (typeof GROUPS)[number]['key'];

function groupOf(t: MyTask): GroupKey {
  if (t.status === 'done') return 'done';
  const d = daysFromToday(t.due_date ?? t.end_date);
  if (d === null) return 'undated';
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 7) return 'week';
  return 'later';
}

/** Every task that is the caller's across all projects in the workspace, grouped by when it is due. */
export const MyTasksPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<MyTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [scope, setScope] = useState<Scope>('mine');
  const [showDone, setShowDone] = useState(false);
  const [discussing, setDiscussing] = useState<MyTask | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      setRows(await projectsService.listMyTasks(activeWorkspaceId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [activeWorkspaceId]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => (rows ?? []).filter((t) => scope === 'mine' || t.assigned_to_me), [rows, scope]);
  const grouped = useMemo(() => {
    const m = new Map<GroupKey, MyTask[]>();
    const rank = (t: MyTask) => (isTaskPriority(t.priority) ? TASK_PRIORITY_RANK[t.priority] : 9);
    for (const t of visible) {
      const g = groupOf(t);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(t);
    }
    for (const list of m.values()) list.sort((a, b) => rank(a) - rank(b));
    return m;
  }, [visible]);
  const openCount = visible.filter((t) => t.status !== 'done').length;

  const setStatus = async (t: MyTask, status: TaskStatus) => {
    if (status === 'done') {
      try {
        const gate = await warrantyClaimService.taskGate(t.id);
        if (taskGateBlocks(gate)) {
          toast({ title: 'Mandatory steps outstanding', description: gate.reason, variant: 'destructive' });
          return;
        }
      } catch (err) {
        toast({ title: 'Could not check the task', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
        return;
      }
    }
    setRows((prev) => prev?.map((r) => (r.id === t.id ? { ...r, status } : r)) ?? prev);
    try {
      await projectsService.setMyTaskStatus(t.id, status);
    } catch (err) {
      toast({ title: 'Failed to update task', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      void load();
    }
  };

  /** A project you own opens on the task; one you were only assigned into opens the discussion here. */
  const open = (t: MyTask) => {
    if (t.owns_project) navigate(`/projects/${t.project_id}?tab=tasks&task=${t.id}`);
    else setDiscussing(t);
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={ListTodo}
        title="My tasks"
        subtitle="Everything on your plate, across every project"
        breadcrumbs={[{ label: 'Projects', to: '/projects' }, { label: 'My tasks' }]}
      />
      <main className="space-y-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <HubSegmented options={SCOPES} value={scope} onChange={setScope} aria-label="Which tasks" />
          <span className="text-sm text-muted-foreground tabular-nums">{rows ? `${openCount} open` : ''}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide done' : 'Show done'}
          </Button>
        </div>

        {failed ? (
          <div className="dashboard-card p-6 text-sm text-amber-800 dark:text-amber-300">
            Your tasks could not be loaded. This is not the same as having none — try again.
            <Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>Retry</Button>
          </div>
        ) : rows === null ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : openCount === 0 && !showDone ? (
          <div className="dashboard-card">
            <HubEmptyState
              icon={CheckSquare}
              title="Nothing on your plate"
              description={scope === 'assigned'
                ? 'Nobody has assigned you a task. Unassigned tasks in your own projects are under "All my work".'
                : 'Tasks assigned to you, and unassigned tasks in projects you run, collect here.'}
              action={<Button onClick={() => navigate('/projects')}>Open Projects</Button>}
            />
          </div>
        ) : (
          GROUPS.filter((g) => (g.key !== 'done' || showDone) && (grouped.get(g.key)?.length ?? 0) > 0).map((g) => (
            <section key={g.key} className="dashboard-card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-hairline bg-surface-sunken px-4 py-2">
                <h2 className={cn('text-sm font-semibold font-sans', g.key === 'overdue' && 'text-destructive')}>{g.label}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">{grouped.get(g.key)!.length}</span>
              </header>
              <ul className="divide-y divide-hairline">
                {grouped.get(g.key)!.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-nowrap">
                    <Select value={t.status} onValueChange={(v) => void setStatus(t, v as TaskStatus)}>
                      <SelectTrigger className="h-7 w-[122px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => open(t)}
                        className={cn('block max-w-full truncate text-left text-sm font-medium hover:underline', t.status === 'done' && 'text-muted-foreground line-through')}
                      >
                        {t.is_milestone && <Diamond className="mr-1 inline h-3 w-3" aria-label="Milestone" />}
                        {t.title}
                      </button>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.owns_project
                          ? <Link to={`/projects/${t.project_id}?tab=tasks`} className="hover:text-foreground hover:underline">{t.project_name}</Link>
                          : t.project_name}
                        {t.parent_title && <> · {t.parent_title}</>}
                        {!t.assigned_to_me && <> · unassigned</>}
                      </p>
                    </div>
                    <PriorityTag priority={t.priority} />
                    {t.comment_count > 0 && (
                      <span className="flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
                        <MessageSquare className="h-3 w-3" aria-hidden="true" />{t.comment_count}
                      </span>
                    )}
                    <DueLabel date={t.due_date ?? t.end_date} done={t.status === 'done'} className="w-24 text-right text-xs" />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <Sheet open={!!discussing} onOpenChange={(v) => { if (!v) { setDiscussing(null); void load(); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {discussing && (
            <>
              <SheetHeader className="space-y-1">
                <SheetDescription className="text-xs">{discussing.project_name}</SheetDescription>
                <SheetTitle className="font-sans">{discussing.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <TaskComments taskId={discussing.id} onChanged={() => {}} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MyTasksPage;
