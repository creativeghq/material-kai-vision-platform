import React, { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Home, ListChecks, MessageSquare, Eye, Diamond } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';
import type { ProjectTaskWithSubtasks, TaskStatus } from '../../services/projectsService';
import { TASK_STATUSES, TASK_STATUS_BADGE, TASK_STATUS_LABEL, TASK_PRIORITY_RANK, isTaskPriority } from '../../taskVocabulary';
import { AssigneeDot, DueLabel, PriorityTag } from './taskBits';
import type { ProjectTasksState } from './useProjectTasks';

/** Tasks as columns by status. Drag a card to another column to change its status. */
export const TaskBoard: React.FC<{
  state: ProjectTasksState;
  readOnly: boolean;
  onOpen: (taskId: string) => void;
}> = ({ state, readOnly, onOpen }) => {
  const { tasks, rooms, commentCounts, changeStatus, assigneeName } = state;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks a card up; Enter is left to open it.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const byStatus = useMemo(() => {
    const m: Record<TaskStatus, ProjectTaskWithSubtasks[]> = { todo: [], in_progress: [], blocked: [], done: [] };
    for (const t of tasks) m[t.status].push(t);
    const rank = (t: ProjectTaskWithSubtasks) => (isTaskPriority(t.priority) ? TASK_PRIORITY_RANK[t.priority] : 9);
    for (const k of TASK_STATUSES) {
      if (k === 'done') continue;
      m[k].sort((a, b) => rank(a) - rank(b) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    }
    return m;
  }, [tasks]);

  const roomName = (id: string | null) => (id ? rooms.find((r) => r.id === id)?.name ?? null : null);
  const dragging = draggingId ? tasks.find((t) => t.id === draggingId) ?? null : null;

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    const to = e.over?.id as TaskStatus | undefined;
    const task = tasks.find((t) => t.id === String(e.active.id));
    if (!to || !task || task.status === to) return;
    void changeStatus(task.id, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
      onDragCancel={() => setDraggingId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUSES.map((s) => (
          <Column key={s} status={s} count={byStatus[s].length} disabled={readOnly} dragging={draggingId !== null}>
            {byStatus[s].length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                {readOnly ? 'Nothing here' : 'Drop a task here'}
              </p>
            ) : byStatus[s].map((t) => (
              <Card
                key={t.id}
                task={t}
                disabled={readOnly}
                roomName={roomName(t.room_id)}
                assignee={assigneeName(t)}
                comments={commentCounts?.get(t.id) ?? null}
                onOpen={() => onOpen(t.id)}
              />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="w-[260px] rotate-1 rounded-md border border-primary bg-card p-3 shadow-overlay">
            <div className="truncate text-sm font-semibold">{dragging.title}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

const Column: React.FC<{
  status: TaskStatus; count: number; disabled: boolean; dragging: boolean; children: React.ReactNode;
}> = ({ status, count, disabled, dragging, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });
  return (
    <section
      ref={setNodeRef}
      aria-label={TASK_STATUS_LABEL[status]}
      className={cn(
        'flex w-[272px] shrink-0 flex-col rounded-md border border-hairline bg-surface-sunken',
        dragging && !disabled && 'border-dashed',
        isOver && 'border-primary',
      )}
    >
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <Badge variant={TASK_STATUS_BADGE[status]} className="text-[11px]">{TASK_STATUS_LABEL[status]}</Badge>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </header>
      <div className="flex flex-col gap-2 p-2">{children}</div>
    </section>
  );
};

const Card: React.FC<{
  task: ProjectTaskWithSubtasks;
  disabled: boolean;
  roomName: string | null;
  assignee: string | null;
  comments: number | null;
  onOpen: () => void;
}> = ({ task, disabled, roomName, assignee, comments, onOpen }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled });
  const done = task.status === 'done';
  const subPct = task.subtask_total_count > 0 ? Math.round((task.subtask_done_count / task.subtask_total_count) * 100) : null;
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onOpen(); return; }
        listeners?.onKeyDown?.(e);
      }}
      className={cn(
        'panel-interactive cursor-pointer rounded-md border border-hairline bg-card p-3 text-left',
        isDragging && 'opacity-40',
      )}
    >
      {(task.priority || task.is_milestone) && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <PriorityTag priority={task.priority} />
          {task.is_milestone && (
            <Badge variant="secondary" className="gap-1 text-[11px]"><Diamond className="h-3 w-3" aria-hidden="true" />Milestone</Badge>
          )}
        </div>
      )}
      <p className={cn('text-sm font-semibold leading-snug', done && 'text-muted-foreground line-through')}>{task.title}</p>
      {roomName && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Home className="h-3 w-3" aria-hidden="true" />{roomName}</p>
      )}
      {subPct !== null && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" aria-hidden="true" />Subtasks</span>
            <span className="tabular-nums">{task.subtask_done_count}/{task.subtask_total_count}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-sm bg-surface-sunken">
            <div className="h-full bg-primary" style={{ width: `${subPct}%` }} />
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs">
        <DueLabel date={task.due_date ?? task.end_date} done={done} />
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          {task.visibility === 'client_visible' && <Eye className="h-3 w-3" aria-label="Client visible" />}
          {comments !== null && comments > 0 && (
            <span className="flex items-center gap-0.5 tabular-nums"><MessageSquare className="h-3 w-3" aria-hidden="true" />{comments}</span>
          )}
          <AssigneeDot name={assignee} />
        </span>
      </div>
    </div>
  );
};
