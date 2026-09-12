/**
 * A table header that both SORTS and SEGMENTS its own column.
 *
 * The label sorts, and clicking again flips it; a `segment` adds a funnel listing the
 * values actually present with their counts. Options are derived from the rows by the
 * caller — a segment offering a value no row has is a dead end, and one missing a
 * value that IS there hides rows with no way to reach them.
 */
import React from 'react';
import { Filter } from 'lucide-react';

import { cn } from '@/lib/utils';
import { TableHead } from '@/components/core/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';

export interface TableSort<K extends string> {
  key: K;
  dir: 'asc' | 'desc';
}

export interface TableSegmentOption {
  value: string;
  label: string;
  count: number;
}

export interface TableSegment {
  /** Values present in the data, with how many rows each covers. */
  options: TableSegmentOption[];
  /** Currently selected values. Empty = no filter on this column. */
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Column noun for the menu heading, e.g. "position". */
  label?: string;
}

interface TableColumnHeaderProps<K extends string> {
  children: React.ReactNode;
  /** Omit to render a plain, unsortable header. */
  sortKey?: K;
  sort?: TableSort<K>;
  onSort?: (key: K) => void;
  segment?: TableSegment;
  align?: 'left' | 'right';
  className?: string;
}

export function TableColumnHeader<K extends string>({
  children,
  sortKey,
  sort,
  onSort,
  segment,
  align = 'left',
  className,
}: TableColumnHeaderProps<K>) {
  const sorted = sortKey !== undefined && sort?.key === sortKey;
  const active = (segment?.selected.length ?? 0) > 0;

  const toggle = (value: string) => {
    if (!segment) return;
    segment.onChange(
      segment.selected.includes(value)
        ? segment.selected.filter((v) => v !== value)
        : [...segment.selected, value],
    );
  };

  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {sortKey !== undefined && onSort ? (
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            aria-sort={sorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            className={cn('inline-flex items-center gap-1 hover:text-foreground', sorted && 'text-foreground')}
          >
            {children}
            <span aria-hidden="true" className="text-[10px] leading-none">
              {sorted ? (sort?.dir === 'asc' ? '▲' : '▼') : ''}
            </span>
          </button>
        ) : (
          <span>{children}</span>
        )}

        {segment && segment.options.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Filter by ${segment.label ?? 'this column'}`}
                className={cn(
                  'rounded-xs p-0.5 transition-colors hover:bg-surface-hover hover:text-foreground',
                  active ? 'text-primary' : 'text-muted-foreground/60',
                )}
              >
                <Filter className={cn('h-3 w-3', active && 'fill-current')} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align={align === 'right' ? 'end' : 'start'} className="w-56 p-1">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {segment.label ?? 'Filter'}
                </span>
                {active && (
                  <button
                    type="button"
                    onClick={() => segment.onChange([])}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {segment.options.map((o) => {
                  const on = segment.selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggle(o.value)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-xs hover:bg-surface-hover',
                        on && 'text-foreground',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border text-[9px] leading-none',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-hairline',
                        )}
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className="flex-1 truncate">{o.label}</span>
                      <span className="tabular-nums text-[11px] text-muted-foreground">{o.count}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </span>
    </TableHead>
  );
}

/** Flip direction on the same column; a new column starts high-to-low unless it reads as text. */
export function nextSort<K extends string>(current: TableSort<K>, key: K, textKeys: readonly K[] = []): TableSort<K> {
  if (current.key === key) return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' };
  return { key, dir: textKeys.includes(key) ? 'asc' : 'desc' };
}

/** Count each value present in `rows`, in the order `order` gives (unknown values last). */
export function segmentOptions<T>(
  rows: T[],
  valueOf: (row: T) => string | null | undefined,
  labels: Record<string, string> = {},
  order: readonly string[] = [],
): TableSegmentOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = valueOf(row);
    if (v == null || v === '') continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const rank = (v: string) => {
    const i = order.indexOf(v);
    return i === -1 ? order.length : i;
  };
  return [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: labels[value] ?? value, count }));
}
