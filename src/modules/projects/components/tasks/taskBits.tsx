import React from 'react';
import { Flag } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/materialCategories';
import { formatDate } from '@/utils/datetime';
import { TASK_PRIORITY_BADGE, TASK_PRIORITY_LABEL, isTaskPriority } from '../../taskVocabulary';

/** Whole days from the operator's today to a `YYYY-MM-DD`, both read as LOCAL dates. */
export function daysFromToday(date: string | null | undefined): number | null {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export const PriorityTag: React.FC<{ priority: string | null | undefined; className?: string }> = ({ priority, className }) => {
  if (!isTaskPriority(priority)) return null;
  return (
    <Badge variant={TASK_PRIORITY_BADGE[priority]} className={cn('gap-1 text-[11px]', className)}>
      <Flag className="h-3 w-3" aria-hidden="true" />
      {TASK_PRIORITY_LABEL[priority]}
    </Badge>
  );
};

export const DueLabel: React.FC<{ date: string | null; done?: boolean; className?: string }> = ({ date, done, className }) => {
  const days = daysFromToday(date);
  if (days === null || !date) return null;
  const tone = done ? 'text-muted-foreground'
    : days < 0 ? 'text-destructive'
    : days <= 3 ? 'text-amber-800 dark:text-amber-300'
    : 'text-muted-foreground';
  const text = done ? formatDate(date)
    : days < 0 ? `${Math.abs(days)}d overdue`
    : days === 0 ? 'Today'
    : days === 1 ? 'Tomorrow'
    : days <= 14 ? `${days}d left`
    : formatDate(date);
  return <span className={cn('tabular-nums', tone, className)} title={formatDate(date)}>{text}</span>;
};

/** Initials circle for an assignee who may have no login (HR roster), so no profile photo lookup. */
export const AssigneeDot: React.FC<{ name: string | null; className?: string }> = ({ name, className }) => {
  if (!name) return null;
  return (
    <span
      title={name}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-sunken text-[10px] font-semibold text-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
};
