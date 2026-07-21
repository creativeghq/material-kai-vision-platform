/**
 * Filter definitions for the project timeline.
 *
 * The chip row only ever offered the five event categories; recency and free text — the two
 * things you actually reach for on a 200-event feed — had no control at all.
 */
import { CalendarDays, Activity } from 'lucide-react';
import type { FilterGroupDef } from '@/components/core/filters';
import type { ProjectEvent } from '../../services/projectsService';

/** Category → the trigger-emitted event_types it covers (Phase 3 migration). */
export const EVENT_CATEGORIES: Array<{ label: string; events: string[] }> = [
  { label: 'Project', events: ['project.created', 'project.status_changed', 'project.budget_changed', 'project.deadline_changed'] },
  { label: 'Rooms', events: ['room.added', 'room.removed'] },
  { label: 'Moodboards', events: ['moodboard.attached', 'moodboard.detached'] },
  { label: 'Quotes', events: ['quote.attached', 'quote.detached', 'quote.status_changed', 'quote.revised'] },
  { label: 'Tasks', events: ['task.created', 'task.completed', 'task.deleted', 'subtask.created', 'subtask.completed', 'subtask.deleted'] },
];

const CATEGORY_OF = new Map<string, string>(
  EVENT_CATEGORIES.flatMap((g) => g.events.map((e) => [e, g.label] as const)),
);

export function buildTimelineFilters(
  events: ProjectEvent[],
  describe: (e: ProjectEvent) => string,
): FilterGroupDef[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const c = CATEGORY_OF.get(e.event_type);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [
    {
      key: 'activity', label: 'Activity', icon: Activity,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search activity…',
          accessor: (e: ProjectEvent) => [describe(e), e.event_type],
        },
        {
          key: 'category', type: 'multi', label: 'Category',
          options: EVENT_CATEGORIES.map((g) => ({ value: g.label, label: g.label, count: counts.get(g.label) ?? 0 })),
          accessor: (e: ProjectEvent) => CATEGORY_OF.get(e.event_type),
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [{ key: 'occurred_at', type: 'dateRange', label: 'When', accessor: (e: ProjectEvent) => e.occurred_at }],
    },
  ];
}
