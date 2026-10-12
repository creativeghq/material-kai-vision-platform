export type DueReason = 'position_drop' | 'clicks_drop' | 'not_indexed' | 'age';

interface DueFacts {
  due_reason: string | null;
  age_days: number;
  refresh_interval_days: number;
  main_query?: string | null;
  position_now?: number | null;
  position_prev?: number | null;
  clicks_now?: number | null;
  clicks_prev?: number | null;
}

export function dueReasonText(f: DueFacts): string {
  switch (f.due_reason as DueReason | null) {
    case 'position_drop':
      return f.position_now == null
        ? `Dropped out of the results for "${f.main_query ?? 'its main query'}"`
        : `Slipped from position ${f.position_prev} to ${f.position_now} on "${f.main_query ?? 'its main query'}"`;
    case 'clicks_drop':
      return `Clicks fell from ${f.clicks_prev} to ${f.clicks_now} over 28 days`;
    case 'not_indexed':
      return 'No Search Console rows 28 days after publishing — check it is indexed';
    case 'age':
      return `${f.age_days} days old, refreshed every ${f.refresh_interval_days}`;
    default:
      return f.due_reason ? `Due (${f.due_reason})` : 'Not due';
  }
}
