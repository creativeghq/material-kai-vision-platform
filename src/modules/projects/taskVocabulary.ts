/** Task status + priority vocabularies. Mirror `project_tasks_status_check` / `project_tasks_priority_check`. */

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export type TaskStatusValue = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatusValue, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

export const TASK_STATUS_BADGE: Record<TaskStatusValue, 'neutral' | 'info' | 'warning' | 'success'> = {
  todo: 'neutral',
  in_progress: 'info',
  blocked: 'warning',
  done: 'success',
};

export const TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const TASK_PRIORITY_BADGE: Record<TaskPriority, 'error' | 'warning' | 'info' | 'neutral'> = {
  urgent: 'error',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function isTaskPriority(v: unknown): v is TaskPriority {
  return typeof v === 'string' && (TASK_PRIORITIES as readonly string[]).includes(v);
}
