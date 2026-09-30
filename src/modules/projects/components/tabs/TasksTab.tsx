import React, { useRef, useState } from 'react';
import {
  Plus,
  Loader2,
  CheckSquare,
  ChevronRight,
  ChevronDown,
  Trash2,
  Circle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  Home,
  User as UserIcon,
} from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  projectsService,
  type ProjectTaskWithSubtasks,
  type ProjectTask,
  type TaskStatus,
  type TaskVisibility,
} from '../../services/projectsService';
import { TASK_STATUSES, TASK_STATUS_LABEL } from '../../taskVocabulary';
import { NO_ASSIGNEE, assigneePatch, type ProjectTasksState } from '../tasks/useProjectTasks';
import { PriorityTag, daysFromToday } from '../tasks/taskBits';

interface TasksTabProps {
  projectId: string;
  /** Collaborators see client_visible tasks (filtered by RLS) but can't add/edit/delete. */
  isOwner?: boolean;
  state: ProjectTasksState;
  onOpenTask: (taskId: string) => void;
}

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-blue-600 dark:text-blue-300" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />,
  blocked: <AlertTriangle className="h-4 w-4 text-amber-800 dark:text-amber-300" />,
};

export const TasksTab: React.FC<TasksTabProps> = ({ projectId, isOwner = true, state, onOpenTask }) => {
  const { toast } = useToast();
  const { tasks, rooms, assignees, loading, reload: load, changeStatus } = state;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [newTitle, setNewTitle] = useState('');
  // The add field is always on screen above the list; the empty state points at it.
  const titleRef = useRef<HTMLInputElement>(null);
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddTask = async () => {
    if (!newTitle.trim()) return;
    try {
      setCreating(true);
      await projectsService.createTask({
        project_id: projectId,
        title: newTitle.trim(),
        room_id: newRoomId || null,
        sort_order: tasks.length,
      });
      setNewTitle('');
      setNewRoomId('');
      await load();
    } catch (_err) {
      toast({ title: 'Failed to add task', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleAddSubtask = async (parentId: string, title: string) => {
    if (!title.trim()) return;
    try {
      await projectsService.createTask({
        project_id: projectId,
        parent_task_id: parentId,
        title: title.trim(),
      });
      await load();
    } catch (err) {
      toast({ title: 'Failed to add subtask', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  const handleStatusChange = (id: string, status: TaskStatus) => { void changeStatus(id, status); };

  const handleVisibilityToggle = async (task: ProjectTask) => {
    try {
      const next: TaskVisibility = task.visibility === 'internal' ? 'client_visible' : 'internal';
      await projectsService.updateTask(task.id, { visibility: next });
      await load();
    } catch (_err) {
      toast({ title: 'Failed to update visibility', variant: 'destructive' });
    }
  };

  /**
   * Give the task to somebody, or to nobody. The two columns are mutually exclusive — the DB CHECK
   * refuses both at once — so the one not chosen is explicitly cleared rather than left behind.
   */
  const handleAssign = async (taskId: string, value: string) => {
    try {
      await projectsService.updateTask(taskId, assigneePatch(value));
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to assign the task', description: err?.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string, hasSubtasks: boolean) => {
    const msg = hasSubtasks ? 'Delete this task and all its subtasks?' : 'Delete this task?';
    if (!confirm(msg)) return;
    try {
      await projectsService.deleteTask(id);
      await load();
    } catch (_err) {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    }
  };

  const roomName = (id: string | null) => {
    if (!id) return null;
    return rooms.find(r => r.id === id)?.name || null;
  };

  return (
    <div className="space-y-4">
      {/* Add task — owner-only. Collaborators read filtered (client_visible) list only. */}
      {isOwner && (
      <Card className="dashboard-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              ref={titleRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }}
              placeholder="Add a task..."
              disabled={creating}
              className="flex-1"
            />
            {rooms.length > 0 && (
              <Select value={newRoomId || 'NONE'} onValueChange={v => setNewRoomId(v === 'NONE' ? '' : v)} disabled={creating}>
                <SelectTrigger className="sm:w-44"><SelectValue placeholder="Room (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No room</SelectItem>
                  {rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button onClick={handleAddTask} disabled={creating || !newTitle.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />Add</>}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="dashboard-card">
          <CardContent className="p-0">
            {/*
              A collaborator sees only the client-visible subset, so their empty screen is a
              different fact ("nothing has been shared") with no action they could take — the
              owner controls what is shared. Only the owner gets the add affordance.
            */}
            <HubEmptyState
              icon={CheckSquare}
              title={isOwner ? 'No tasks yet' : 'Nothing shared with you yet'}
              description={isOwner
                ? 'Track the work on this project — tasks can hang off a room, and each one can be shared with the client or kept internal.'
                : 'Tasks appear here once the project owner marks them visible to you.'}
              action={isOwner ? (
                <Button size="sm" onClick={() => titleRef.current?.focus()}><Plus className="h-4 w-4 mr-2" />Add a task</Button>
              ) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="dashboard-card">
          <CardContent className="p-0">
            <ul className="divide-y divide-hairline">
              {tasks.map(parent => (
                <TaskRow
                  key={parent.id}
                  task={parent}
                  expanded={expanded.has(parent.id)}
                  onToggleExpand={() => toggleExpand(parent.id)}
                  onStatusChange={(s) => handleStatusChange(parent.id, s)}
                  onVisibilityToggle={() => handleVisibilityToggle(parent)}
                  onDelete={() => handleDelete(parent.id, parent.subtasks.length > 0)}
                  roomName={roomName(parent.room_id)}
                  assignees={assignees}
                  onAssign={(v) => handleAssign(parent.id, v)}
                  onAddSubtask={(title) => handleAddSubtask(parent.id, title)}
                  onSubtaskStatusChange={(id, s) => handleStatusChange(id, s)}
                  onSubtaskVisibilityToggle={(t) => handleVisibilityToggle(t)}
                  onSubtaskDelete={(id) => handleDelete(id, false)}
                  onOpen={onOpenTask}
                  readOnly={!isOwner}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};


interface TaskRowProps {
  task: ProjectTaskWithSubtasks;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (s: TaskStatus) => void;
  onVisibilityToggle: () => void;
  onDelete: () => void;
  roomName: string | null;
  assignees: Array<{ kind: 'employee' | 'member'; id: string; name: string }>;
  onAssign: (value: string) => void;
  onAddSubtask: (title: string) => void;
  onSubtaskStatusChange: (id: string, s: TaskStatus) => void;
  onSubtaskVisibilityToggle: (t: ProjectTask) => void;
  onSubtaskDelete: (id: string) => void;
  onOpen: (taskId: string) => void;
  /** Collaborator view — disables status changes, visibility toggle, delete, add-subtask. */
  readOnly?: boolean;
}

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  expanded,
  onToggleExpand,
  onStatusChange,
  onVisibilityToggle,
  onDelete,
  roomName,
  assignees,
  onAssign,
  onAddSubtask,
  onSubtaskStatusChange,
  onSubtaskVisibilityToggle,
  onSubtaskDelete,
  onOpen,
  readOnly = false,
}) => {
  const [subtaskInput, setSubtaskInput] = useState('');
  const hasSubtasks = task.subtasks.length > 0;
  const days = daysFromToday(task.due_date);
  const assigneeValue = task.assignee_employee_id
    ? `employee:${task.assignee_employee_id}`
    : task.assignee_id ? `member:${task.assignee_id}` : NO_ASSIGNEE;
  const assigneeName = assignees.find((a) => `${a.kind}:${a.id}` === assigneeValue)?.name ?? null;

  return (
    <li>
      <div className="p-3 sm:p-4 hover:bg-muted/40 transition-colors">
        <div className="flex items-start gap-3">
          {readOnly ? (
            <span className="h-7 w-7 flex items-center justify-center shrink-0" title={TASK_STATUS_LABEL[task.status]}>
              {STATUS_ICON[task.status]}
            </span>
          ) : (
            <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
              <SelectTrigger className="h-7 w-7 p-0 border-none bg-transparent hover:bg-muted/60 [&>svg]:hidden flex items-center justify-center shrink-0">
                <span className="flex items-center justify-center">{STATUS_ICON[task.status]}</span>
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">{STATUS_ICON[s]}{TASK_STATUS_LABEL[s]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className={`text-left font-medium hover:underline ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}
              >
                {task.title}
              </button>
              <PriorityTag priority={task.priority} />
              {hasSubtasks && (
                <Badge variant="outline" className="text-xs">
                  {task.subtask_done_count} / {task.subtask_total_count}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {roomName && (
                <span className="flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  {roomName}
                </span>
              )}
              {task.due_date && (
                <span className={days !== null && days < 0 ? 'text-destructive' : days !== null && days <= 3 ? 'text-amber-800 dark:text-amber-300' : ''}>
                  {days === null ? formatDate(task.due_date) :
                    days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
                </span>
              )}
              {task.visibility === 'client_visible' && (
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <Eye className="h-3 w-3" />
                  Client visible
                </span>
              )}
              {readOnly ? (
                assigneeName && (
                  <span className="flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    {assigneeName}
                  </span>
                )
              ) : (
                <Select value={assigneeValue} onValueChange={onAssign}>
                  <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-1 text-xs hover:bg-muted/60">
                    <UserIcon className="h-3 w-3" />
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ASSIGNEE}>Unassigned</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!readOnly && (
              <>
                <Button variant="ghost" size="sm" onClick={onVisibilityToggle} title={task.visibility === 'internal' ? 'Show to client' : 'Hide from client'}>
                  {task.visibility === 'client_visible' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
            {(task.subtasks.length > 0 || !readOnly) && (
              <Button variant="ghost" size="sm" onClick={onToggleExpand}>
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pl-7 space-y-1.5 border-l-2 border-primary/20 ml-3">
            {task.subtasks.map(sub => {
              const subDays = daysFromToday(sub.due_date);
              return (
                <div key={sub.id} className="flex items-start gap-2 py-1.5">
                  {readOnly ? (
                    <span className="h-6 w-6 flex items-center justify-center shrink-0" title={TASK_STATUS_LABEL[sub.status]}>
                      {STATUS_ICON[sub.status]}
                    </span>
                  ) : (
                    <Select value={sub.status} onValueChange={(v) => onSubtaskStatusChange(sub.id, v as TaskStatus)}>
                      <SelectTrigger className="h-6 w-6 p-0 border-none bg-transparent hover:bg-muted/60 [&>svg]:hidden flex items-center justify-center shrink-0">
                        <span className="flex items-center justify-center">{STATUS_ICON[sub.status]}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map(s => (
                          <SelectItem key={s} value={s}>
                            <span className="flex items-center gap-2">{STATUS_ICON[s]}{TASK_STATUS_LABEL[s]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(sub.id)}
                      className={`text-left text-sm hover:underline ${sub.status === 'done' ? 'line-through text-muted-foreground' : ''}`}
                    >
                      {sub.title}
                    </button>
                    {(sub.due_date || sub.visibility === 'client_visible') && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {sub.due_date && (
                          <span className={subDays !== null && subDays < 0 ? 'text-destructive' : subDays !== null && subDays <= 3 ? 'text-amber-800 dark:text-amber-300' : ''}>
                            {subDays === null ? '' : subDays < 0 ? `${Math.abs(subDays)}d overdue` : subDays === 0 ? 'Today' : `${subDays}d left`}
                          </span>
                        )}
                        {sub.visibility === 'client_visible' && (
                          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                            <Eye className="h-3 w-3" />Client visible
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {!readOnly && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => onSubtaskVisibilityToggle(sub)}>
                        {sub.visibility === 'client_visible' ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onSubtaskDelete(sub.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
            {!readOnly && (
              <div className="flex gap-2 pt-1">
                <Input
                  value={subtaskInput}
                  onChange={e => setSubtaskInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onAddSubtask(subtaskInput);
                      setSubtaskInput('');
                    }
                  }}
                  placeholder="Add a subtask..."
                  className="h-8 text-sm flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { onAddSubtask(subtaskInput); setSubtaskInput(''); }}
                  disabled={!subtaskInput.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
};
