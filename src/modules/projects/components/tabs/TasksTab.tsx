import React, { useCallback, useEffect, useState } from 'react';
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
} from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
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
import {
  projectsService,
  type ProjectTaskWithSubtasks,
  type ProjectTask,
  type ProjectRoom,
  type TaskStatus,
  type TaskVisibility,
} from '../../services/projectsService';

interface TasksTabProps {
  projectId: string;
  /** Collaborators see client_visible tasks (filtered by RLS) but can't add/edit/delete. */
  isOwner?: boolean;
}

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-blue-300" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-300" />,
  blocked: <AlertTriangle className="h-4 w-4 text-amber-300" />,
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];

const daysUntil = (date: string | null) => {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const TasksTab: React.FC<TasksTabProps> = ({ projectId, isOwner = true }) => {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ProjectTaskWithSubtasks[]>([]);
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [newTitle, setNewTitle] = useState('');
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [t, r] = await Promise.all([
        projectsService.listTasks(projectId),
        projectsService.listRooms(projectId),
      ]);
      setTasks(t);
      setRooms(r);
    } catch (err) {
      toast({ title: 'Failed to load tasks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

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
    } catch (err) {
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

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    try {
      await projectsService.updateTask(id, { status });
      await load();
    } catch (err) {
      toast({ title: 'Failed to update task', variant: 'destructive' });
    }
  };

  const handleVisibilityToggle = async (task: ProjectTask) => {
    try {
      const next: TaskVisibility = task.visibility === 'internal' ? 'client_visible' : 'internal';
      await projectsService.updateTask(task.id, { visibility: next });
      await load();
    } catch (err) {
      toast({ title: 'Failed to update visibility', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string, hasSubtasks: boolean) => {
    const msg = hasSubtasks ? 'Delete this task and all its subtasks?' : 'Delete this task?';
    if (!confirm(msg)) return;
    try {
      await projectsService.deleteTask(id);
      await load();
    } catch (err) {
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

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="dashboard-card">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <CheckSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            {isOwner ? 'No tasks yet. Add one above to start tracking work.' : 'No tasks have been shared with you yet.'}
          </CardContent>
        </Card>
      ) : (
        <Card className="dashboard-card">
          <CardContent className="p-0">
            <ul className="divide-y divide-white/8">
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
                  onAddSubtask={(title) => handleAddSubtask(parent.id, title)}
                  onSubtaskStatusChange={(id, s) => handleStatusChange(id, s)}
                  onSubtaskVisibilityToggle={(t) => handleVisibilityToggle(t)}
                  onSubtaskDelete={(id) => handleDelete(id, false)}
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

// =====================================================
// TaskRow (parent task with optional expanded subtask list)
// =====================================================

interface TaskRowProps {
  task: ProjectTaskWithSubtasks;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (s: TaskStatus) => void;
  onVisibilityToggle: () => void;
  onDelete: () => void;
  roomName: string | null;
  onAddSubtask: (title: string) => void;
  onSubtaskStatusChange: (id: string, s: TaskStatus) => void;
  onSubtaskVisibilityToggle: (t: ProjectTask) => void;
  onSubtaskDelete: (id: string) => void;
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
  onAddSubtask,
  onSubtaskStatusChange,
  onSubtaskVisibilityToggle,
  onSubtaskDelete,
  readOnly = false,
}) => {
  const [subtaskInput, setSubtaskInput] = useState('');
  const hasSubtasks = task.subtasks.length > 0;
  const days = daysUntil(task.due_date);

  return (
    <li>
      <div className="p-3 sm:p-4 hover:bg-muted/40 transition-colors">
        <div className="flex items-start gap-3">
          {/* Status toggle (rotates through todo → in_progress → done → blocked → todo).
              Collaborators get a read-only icon — no Select. */}
          {readOnly ? (
            <span className="h-7 w-7 flex items-center justify-center shrink-0" title={STATUS_LABEL[task.status]}>
              {STATUS_ICON[task.status]}
            </span>
          ) : (
            <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
              <SelectTrigger className="h-7 w-7 p-0 border-none bg-transparent hover:bg-muted/60 [&>svg]:hidden flex items-center justify-center shrink-0">
                <span className="flex items-center justify-center">{STATUS_ICON[task.status]}</span>
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map(s => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">{STATUS_ICON[s]}{STATUS_LABEL[s]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </p>
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
                <span className={days !== null && days < 0 ? 'text-destructive' : days !== null && days <= 3 ? 'text-amber-300' : ''}>
                  {days === null ? new Date(task.due_date).toLocaleDateString() :
                    days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
                </span>
              )}
              {task.visibility === 'client_visible' && (
                <span className="flex items-center gap-1 text-emerald-300">
                  <Eye className="h-3 w-3" />
                  Client visible
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
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

        {/* Subtasks */}
        {expanded && (
          <div className="mt-3 pl-7 space-y-1.5 border-l-2 border-primary/20 ml-3">
            {task.subtasks.map(sub => {
              const subDays = daysUntil(sub.due_date);
              return (
                <div key={sub.id} className="flex items-start gap-2 py-1.5">
                  {readOnly ? (
                    <span className="h-6 w-6 flex items-center justify-center shrink-0" title={STATUS_LABEL[sub.status]}>
                      {STATUS_ICON[sub.status]}
                    </span>
                  ) : (
                    <Select value={sub.status} onValueChange={(v) => onSubtaskStatusChange(sub.id, v as TaskStatus)}>
                      <SelectTrigger className="h-6 w-6 p-0 border-none bg-transparent hover:bg-muted/60 [&>svg]:hidden flex items-center justify-center shrink-0">
                        <span className="flex items-center justify-center">{STATUS_ICON[sub.status]}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_ORDER.map(s => (
                          <SelectItem key={s} value={s}>
                            <span className="flex items-center gap-2">{STATUS_ICON[s]}{STATUS_LABEL[s]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${sub.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      {sub.title}
                    </p>
                    {(sub.due_date || sub.visibility === 'client_visible') && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {sub.due_date && (
                          <span className={subDays !== null && subDays < 0 ? 'text-destructive' : subDays !== null && subDays <= 3 ? 'text-amber-300' : ''}>
                            {subDays === null ? '' : subDays < 0 ? `${Math.abs(subDays)}d overdue` : subDays === 0 ? 'Today' : `${subDays}d left`}
                          </span>
                        )}
                        {sub.visibility === 'client_visible' && (
                          <span className="flex items-center gap-1 text-emerald-300">
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
