/**
 * The project status vocabulary as the UI speaks it — ONE copy.
 *
 * The list page and the detail page each carried their own `STATUS_LABELS` + `STATUS_TONES`
 * (raw palette pairs on an outline badge). Two copies of a five-value map drift the way every
 * other duplicated vocabulary here has: a label edited on one screen and not the other. The
 * tone is a semantic Badge variant rather than a palette pair, so it is measured for contrast
 * on all four themes once, in the primitive.
 */
import type { ProjectStatus } from './services/projectsService';

export const PROJECT_STATUS_ORDER: readonly ProjectStatus[] = [
  'planning', 'in_progress', 'on_hold', 'completed', 'archived',
] as const;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

export type ProjectStatusBadgeVariant = 'info' | 'success' | 'warning' | 'secondary' | 'neutral';

/**
 * Reads as a lifecycle: planning (blue) → in progress (green) → on hold (amber) → completed
 * (quiet, foreground) → archived (quiet, muted). Completed and archived are both finished; the
 * difference is whether it still belongs in the default view, and the label carries that.
 */
export const PROJECT_STATUS_BADGE: Record<ProjectStatus, ProjectStatusBadgeVariant> = {
  planning: 'info',
  in_progress: 'success',
  on_hold: 'warning',
  completed: 'secondary',
  archived: 'neutral',
};
