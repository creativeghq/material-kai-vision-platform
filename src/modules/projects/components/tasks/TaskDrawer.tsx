import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Loader2, MessageSquare, Plus, Send, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { UserAvatar } from '@/components/core/ui/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDisplayProfile } from '@/hooks/useDisplayProfile';
import { useToast } from '@/hooks/use-toast';
import { formatDate, timeAgo } from '@/utils/datetime';
import { cn } from '@/lib/utils';
import { projectsService, type ProjectTask, type TaskComment, type TaskStatus } from '../../services/projectsService';
import {
  TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, isTaskPriority,
} from '../../taskVocabulary';
import { timeTrackingService } from '@/modules/finance/services/timeTrackingService';
import { LogTimeDialog } from '../LogTimeDialog';
import { NO_ASSIGNEE, assigneeKey, assigneePatch, type ProjectTasksState } from './useProjectTasks';

const NO_PRIORITY = '__none__';
const NO_ROOM = '__none__';

/** Everything about one task: properties, description, subtasks, time and the internal discussion. */
export const TaskDrawer: React.FC<{
  state: ProjectTasksState;
  projectId: string;
  taskId: string | null;
  readOnly: boolean;
  onClose: () => void;
}> = ({ state, projectId, taskId, readOnly, onClose }) => {
  const { allTasks, tasks, rooms, assignees, update, changeStatus, reload } = state;
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const task = taskId ? allTasks.find((t) => t.id === taskId) ?? null : null;
  const parent = task?.parent_task_id ? allTasks.find((t) => t.id === task.parent_task_id) ?? null : null;
  const subtasks = task && !task.parent_task_id ? tasks.find((t) => t.id === task.id)?.subtasks ?? [] : [];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  // The open task's unsaved text. Escape and switching tasks fire no blur, so it is flushed on those too.
  const draft = useRef<{ id: string; title: string; description: string; savedTitle: string; savedDescription: string } | null>(null);
  const flush = useCallback(() => {
    const d = draft.current;
    if (!d || readOnly) return;
    const nextTitle = d.title.trim();
    if (nextTitle && nextTitle !== d.savedTitle) { d.savedTitle = nextTitle; void update(d.id, { title: nextTitle }); }
    const nextDescription = d.description.trim();
    if (nextDescription !== d.savedDescription) { d.savedDescription = nextDescription; void update(d.id, { description: nextDescription || null }); }
  }, [readOnly, update]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    const t = task?.title ?? '';
    const desc = task?.description ?? '';
    setTitle(t);
    setDescription(desc);
    draft.current = task ? { id: task.id, title: t, description: desc, savedTitle: t, savedDescription: desc.trim() } : null;
    return () => flushRef.current();
    // Only when the task changes, not on every reload of the same one mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const loadSeq = useRef(0);
  const loadMinutes = useCallback(() => {
    if (!taskId || readOnly) return;
    const seq = ++loadSeq.current;
    timeTrackingService.taskMinutes(taskId)
      .then((m) => { if (seq === loadSeq.current) setMinutes(m); })
      .catch(() => { if (seq === loadSeq.current) setMinutes(null); });
  }, [taskId, readOnly]);
  useEffect(() => { setMinutes(null); loadMinutes(); }, [loadMinutes]);

  const editTitle = (v: string) => { setTitle(v); if (draft.current) draft.current.title = v; };
  const editDescription = (v: string) => { setDescription(v); if (draft.current) draft.current.description = v; };
  const saveTitle = () => {
    if (!title.trim() && task) editTitle(draft.current?.savedTitle ?? task.title);
    flush();
  };
  const addSubtask = async () => {
    if (!task || !newSubtask.trim()) return;
    try {
      await projectsService.createTask({ project_id: projectId, parent_task_id: task.id, title: newSubtask.trim() });
      setNewSubtask('');
      await reload();
    } catch (err) {
      toast({ title: 'Failed to add subtask', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  return (
    <Sheet open={!!taskId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {!task ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {state.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'This task no longer exists, or is not shared with you.'}
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-1 border-b border-hairline p-5 pr-12">
              <SheetDescription className="text-xs">
                {parent ? <>Subtask of <span className="text-foreground">{parent.title}</span></> : task.is_milestone ? 'Milestone' : 'Task'}
              </SheetDescription>
              <SheetTitle className="sr-only">{task.title}</SheetTitle>
              {readOnly ? (
                <p className="text-lg font-semibold leading-snug">{task.title}</p>
              ) : (
                <Input
                  value={title}
                  onChange={(e) => editTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="h-auto border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                  aria-label="Task title"
                />
              )}
            </SheetHeader>

            <div className="space-y-6 p-5">
              <dl className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2 text-sm">
                <Prop label="Status">
                  <Select value={task.status} disabled={readOnly} onValueChange={(v) => void changeStatus(task.id, v as TaskStatus)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </Prop>
                <Prop label="Priority">
                  <Select
                    value={isTaskPriority(task.priority) ? task.priority : NO_PRIORITY}
                    disabled={readOnly}
                    onValueChange={(v) => void update(task.id, { priority: v === NO_PRIORITY ? null : (v as ProjectTask['priority']) })}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PRIORITY}>Not set</SelectItem>
                      {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Prop>
                <Prop label="Assignee">
                  <Select value={assigneeKey(task)} disabled={readOnly} onValueChange={(v) => void update(task.id, assigneePatch(v))}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ASSIGNEE}>Unassigned</SelectItem>
                      {assignees.map((a) => <SelectItem key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Prop>
                <Prop label="Start">
                  <DateField value={task.start_date} readOnly={readOnly} onChange={(v) => void update(task.id, { start_date: v })} />
                </Prop>
                <Prop label="Due">
                  <DateField value={task.due_date} readOnly={readOnly} onChange={(v) => void update(task.id, { due_date: v })} />
                </Prop>
                {rooms.length > 0 && !task.parent_task_id && (
                  <Prop label="Room">
                    <Select value={task.room_id ?? NO_ROOM} disabled={readOnly} onValueChange={(v) => void update(task.id, { room_id: v === NO_ROOM ? null : v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ROOM}>No room</SelectItem>
                        {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Prop>
                )}
                {!readOnly && (
                  <Prop label="Client">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={task.visibility === 'client_visible'}
                        onCheckedChange={(v) => void update(task.id, { visibility: v ? 'client_visible' : 'internal' })}
                      />
                      Visible to the client
                    </label>
                  </Prop>
                )}
                {!readOnly && (
                  <Prop label="Time logged">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{minutes === null ? '—' : formatMinutes(minutes)}</span>
                      {activeWorkspaceId && (
                        <Button variant="outline" size="sm" className="h-7" onClick={() => setLogOpen(true)}>
                          <Clock className="mr-1.5 h-3.5 w-3.5" />Log time
                        </Button>
                      )}
                    </div>
                  </Prop>
                )}
              </dl>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">Description</h4>
                {readOnly ? (
                  <p className="whitespace-pre-wrap text-sm">{task.description || '—'}</p>
                ) : (
                  <Textarea
                    value={description}
                    onChange={(e) => editDescription(e.target.value)}
                    onBlur={flush}
                    placeholder="What needs doing, and what does done look like?"
                    rows={4}
                  />
                )}
              </section>

              {!task.parent_task_id && (subtasks.length > 0 || !readOnly) && (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    Subtasks {subtasks.length > 0 && <span className="tabular-nums">· {subtasks.filter((s) => s.status === 'done').length}/{subtasks.length}</span>}
                  </h4>
                  <ul className="space-y-1">
                    {subtasks.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={s.status === 'done'}
                          disabled={readOnly}
                          onCheckedChange={(v) => void changeStatus(s.id, v ? 'done' : 'todo')}
                          aria-label={`Complete ${s.title}`}
                        />
                        <span className={cn('flex-1', s.status === 'done' && 'text-muted-foreground line-through')}>{s.title}</span>
                      </li>
                    ))}
                  </ul>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Input
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addSubtask(); } }}
                        placeholder="Add a subtask…"
                        className="h-8 text-sm"
                      />
                      <Button variant="outline" size="sm" className="h-8" onClick={() => void addSubtask()} disabled={!newSubtask.trim()} aria-label="Add subtask">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </section>
              )}

              {!readOnly && <TaskComments taskId={task.id} onChanged={() => void reload()} />}

              <p className="text-[11px] text-muted-foreground">
                Created {formatDate(task.created_at)}
                {task.completed_at && <> · Completed {formatDate(task.completed_at)}</>}
              </p>
            </div>

            {activeWorkspaceId && (
              <LogTimeDialog
                open={logOpen}
                onOpenChange={setLogOpen}
                workspaceId={activeWorkspaceId}
                projectId={projectId}
                taskId={task.id}
                onLogged={loadMinutes}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

function formatMinutes(m: number): string {
  if (m === 0) return 'None yet';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
}

const Prop: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd>{children}</dd>
  </>
);

const DateField: React.FC<{ value: string | null; readOnly: boolean; onChange: (v: string | null) => void }> = ({ value, readOnly, onChange }) => {
  if (readOnly) return <span>{value ? formatDate(value) : '—'}</span>;
  return (
    <Input
      type="date"
      className="h-8 w-44"
      value={value?.slice(0, 10) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
};

export const TaskComments: React.FC<{ taskId: string; onChanged: () => void }> = ({ taskId, onChanged }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<TaskComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    projectsService.listTaskComments(taskId)
      .then((rows) => { if (mine === seq.current) { setItems(rows); setFailed(false); } })
      .catch(() => { if (mine === seq.current) setFailed(true); });
  }, [taskId]);
  useEffect(() => { setItems(null); load(); }, [load]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await projectsService.addTaskComment(taskId, draft);
      setDraft('');
      load();
      onChanged();
    } catch (err) {
      toast({ title: 'Comment not posted', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await projectsService.deleteTaskComment(id);
      load();
      onChanged();
    } catch (err) {
      toast({ title: 'Could not delete the comment', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  return (
    <section className="space-y-3 border-t border-hairline pt-5">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />Comments
        <span className="font-normal">· internal, never shown to the client</span>
      </h4>
      {failed ? (
        <p className="text-sm text-amber-800 dark:text-amber-300">Comments could not be loaded.</p>
      ) : items === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : items.length > 0 && (
        <ul className="space-y-3">
          {items.map((c) => <CommentRow key={c.id} comment={c} mine={c.author_id === user?.id} onDelete={() => void remove(c.id)} />)}
        </ul>
      )}
      <div className="flex items-start gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
          placeholder={items?.length ? 'Add a comment…' : 'Start the discussion — a question, or a note for whoever picks this up'}
          rows={2}
          maxLength={5000}
        />
        <Button size="sm" onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="Post comment">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
};

const CommentRow: React.FC<{ comment: TaskComment; mine: boolean; onDelete: () => void }> = ({ comment, mine, onDelete }) => {
  const profile = useDisplayProfile(comment.author_id);
  return (
    <li className="group flex gap-2.5">
      <UserAvatar userId={comment.author_id} className="h-7 w-7" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-semibold text-foreground">{mine ? 'You' : profile?.fullName ?? 'Team member'}</span>
          <span className="text-muted-foreground" title={formatDate(comment.created_at)}>{timeAgo(comment.created_at)}</span>
          {comment.edited_at && <span className="text-muted-foreground">· edited</span>}
          {mine && (
            <button type="button" onClick={onDelete} className="ml-auto text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100" aria-label="Delete comment">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
      </div>
    </li>
  );
};
