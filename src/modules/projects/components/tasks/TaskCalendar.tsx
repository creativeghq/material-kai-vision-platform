import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';
import { toLocalISODate, todayLocalISO } from '@/utils/datetime';
import type { ProjectTask } from '../../services/projectsService';
import { TASK_STATUS_BADGE } from '../../taskVocabulary';
import type { ProjectTasksState } from './useProjectTasks';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CHIP_TONE: Record<string, string> = {
  neutral: 'border-hairline bg-surface-sunken text-foreground',
  info: 'border-[hsl(var(--info)/0.25)] bg-[hsl(var(--info-bg))] text-[hsl(var(--info))]',
  warning: 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]',
  success: 'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-bg))] text-[hsl(var(--success))] line-through',
};

/** A task's calendar day: its deadline, else the end of its planned span. */
const dayOf = (t: ProjectTask) => (t.due_date ?? t.end_date)?.slice(0, 10) ?? null;

/** Month grid of tasks by due date (Monday-first). Undated tasks are counted, not hidden. */
export const TaskCalendar: React.FC<{ state: ProjectTasksState; onOpen: (taskId: string) => void }> = ({ state, onOpen }) => {
  const { allTasks } = state;
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = todayLocalISO();
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  const byDay = useMemo(() => {
    const m = new Map<string, ProjectTask[]>();
    for (const t of allTasks) {
      const d = dayOf(t);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(t);
    }
    return m;
  }, [allTasks]);
  const undated = allTasks.filter((t) => !dayOf(t)).length;

  const cells = useMemo(() => {
    const first = new Date(cursor);
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((lead + daysInMonth) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);

  const shift = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="dashboard-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-sunken px-3 py-2">
        <h3 className="text-sm font-semibold">{monthLabel}</h3>
        <span className="text-xs text-muted-foreground">
          {undated > 0 ? `${undated} ${undated === 1 ? 'task has' : 'tasks have'} no date` : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
          <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="table-scroll">
        <div className="grid min-w-[640px] grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div key={w} className="border-b border-hairline px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">{w}</div>
          ))}
          {cells.map((d) => {
            const iso = toLocalISODate(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const items = byDay.get(iso) ?? [];
            const shown = expandedDays.has(iso) ? items : items.slice(0, 3);
            return (
              <div
                key={iso}
                className={cn('min-h-[92px] border-b border-r border-hairline p-1.5', !inMonth && 'bg-surface-sunken/60')}
              >
                <div className={cn(
                  'mb-1 text-[11px] tabular-nums',
                  inMonth ? 'text-foreground' : 'text-muted-foreground',
                  iso === today && 'font-semibold text-primary',
                )}
                >
                  {d.getDate()}
                </div>
                <div className="space-y-1">
                  {shown.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpen(t.id)}
                      className={cn('block w-full truncate rounded-sm border px-1.5 py-0.5 text-left text-[11px]', CHIP_TONE[TASK_STATUS_BADGE[t.status]])}
                      title={t.title}
                    >
                      {t.is_milestone ? '◆ ' : ''}{t.title}
                    </button>
                  ))}
                  {items.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDays((prev) => {
                        const next = new Set(prev);
                        if (next.has(iso)) next.delete(iso); else next.add(iso);
                        return next;
                      })}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {expandedDays.has(iso) ? 'Show less' : `+${items.length - 3} more`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
