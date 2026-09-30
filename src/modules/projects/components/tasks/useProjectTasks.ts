import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { warrantyClaimService, taskGateBlocks } from '@/modules/crm/services/warrantyClaimService';
import {
  projectsService,
  type ProjectRoom,
  type ProjectTask,
  type ProjectTaskWithSubtasks,
  type TaskStatus,
  type UpdateTaskInput,
} from '../../services/projectsService';

export interface TaskAssignee { kind: 'employee' | 'member'; id: string; name: string }

export const NO_ASSIGNEE = '__unassigned__';

export function assigneeKey(t: Pick<ProjectTask, 'assignee_id' | 'assignee_employee_id'>): string {
  if (t.assignee_employee_id) return `employee:${t.assignee_employee_id}`;
  if (t.assignee_id) return `member:${t.assignee_id}`;
  return NO_ASSIGNEE;
}

/** The select value back to the column pair; the DB CHECK refuses both set at once. */
export function assigneePatch(value: string): Pick<UpdateTaskInput, 'assignee_id' | 'assignee_employee_id'> {
  const [kind, id] = value === NO_ASSIGNEE ? [null, null] : value.split(':');
  return {
    assignee_id: kind === 'member' ? id : null,
    assignee_employee_id: kind === 'employee' ? id : null,
  };
}

/** One copy of a project's tasks for every view — List, Board, Calendar and the drawer. */
export function useProjectTasks(projectId: string) {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ProjectTaskWithSubtasks[]>([]);
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [assigneesFailed, setAssigneesFailed] = useState(false);
  // null = the count read failed: render nothing rather than a confident 0.
  const [commentCounts, setCommentCounts] = useState<Map<string, number> | null>(new Map());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([projectsService.listTasks(projectId), projectsService.listRooms(projectId)]);
      setTasks(t);
      setRooms(r);
    } catch {
      toast({ title: 'Failed to load tasks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    projectsService.taskCommentCounts(projectId).then(setCommentCounts).catch(() => setCommentCounts(null));
  }, [projectId, toast]);

  useEffect(() => { setLoading(true); void reload(); }, [reload]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    projectsService.listTaskAssignees(activeWorkspaceId)
      .then((rows) => { if (!cancelled) { setAssignees(rows); setAssigneesFailed(false); } })
      .catch(() => { if (!cancelled) { setAssignees([]); setAssigneesFailed(true); } });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  const allTasks = useMemo(() => tasks.flatMap((t) => [t as ProjectTask, ...t.subtasks]), [tasks]);

  const assigneeName = useCallback((t: ProjectTask): string | null => {
    const key = assigneeKey(t);
    return assignees.find((a) => `${a.kind}:${a.id}` === key)?.name ?? null;
  }, [assignees]);

  const patchLocal = useCallback((id: string, patch: Partial<ProjectTask>) => {
    setTasks((prev) => prev.map((p) => (p.id === id
      ? { ...p, ...patch }
      : { ...p, subtasks: p.subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)) })));
  }, []);

  const update = useCallback(async (id: string, patch: UpdateTaskInput): Promise<boolean> => {
    try {
      await projectsService.updateTask(id, patch);
      await reload();
      return true;
    } catch (err) {
      toast({ title: 'Failed to update task', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      await reload();
      return false;
    }
  }, [reload, toast]);

  /** Optimistic, gated on mandatory steps before completing (#437). */
  const changeStatus = useCallback(async (id: string, status: TaskStatus): Promise<boolean> => {
    if (status === 'done') {
      try {
        const gate = await warrantyClaimService.taskGate(id);
        if (taskGateBlocks(gate)) {
          toast({ title: 'Mandatory steps outstanding', description: gate.reason, variant: 'destructive' });
          return false;
        }
      } catch (err) {
        toast({ title: 'Could not check the task', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
        return false;
      }
    }
    patchLocal(id, { status });
    return update(id, { status });
  }, [patchLocal, update, toast]);

  return {
    tasks, allTasks, rooms, assignees, assigneesFailed, commentCounts, loading, reload, update, changeStatus, assigneeName,
  };
}

export type ProjectTasksState = ReturnType<typeof useProjectTasks>;
