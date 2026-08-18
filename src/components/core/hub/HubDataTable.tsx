import React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';

export interface HubColumn<Row> {
  /** Stable key — also the sort key reported to `onSortChange`. */
  id: string;
  header: React.ReactNode;
  /** Cell renderer. Return a string/number and it is rendered as-is. */
  cell: (row: Row) => React.ReactNode;
  /** Right-align numeric columns. Money and counts ALWAYS align right. */
  align?: 'left' | 'right';
  sortable?: boolean;
  /** Tailwind width class, e.g. `w-40`. Prefer leaving it off. */
  width?: string;
  /** Hide below the given breakpoint instead of pushing the table into scroll. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface HubSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

interface HubDataTableProps<Row> {
  rows: Row[];
  columns: HubColumn<Row>[];
  /** Stable identity for a row — used for keys and for selection. */
  rowId: (row: Row) => string;
  /** Whole-row click (navigate to the record). Renders rows as pointer targets. */
  onRowClick?: (row: Row) => void;

  /** Pass BOTH to enable the selection column. */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;

  sort?: HubSort;
  onSortChange?: (sort: HubSort) => void;

  loading?: boolean;
  /** Shown when `rows` is empty and not loading. */
  empty?: React.ReactNode;
  /** Footer band — pagination, totals, bulk actions. */
  footer?: React.ReactNode;
  className?: string;
}

const HIDE_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const;

/**
 * DATA TABLE — the list surface: selection, sorting, loading, empty, footer.
 *
 * Everything here exists because a hand-rolled table in this codebase kept
 * missing one of them:
 *
 *  - **The sort affordance is always visible**, greyed until used. A caret that
 *    only appears on hover is undiscoverable on touch and invisible to anyone
 *    scanning for "can I sort this at all".
 *  - **Numeric columns align right and use `tabular-nums`.** Proportional digits
 *    make a column of money impossible to compare down the page, because the
 *    decimal points do not line up.
 *  - **Loading renders skeleton ROWS, not a spinner.** The table keeps its shape,
 *    so nothing below it jumps when the data lands.
 *  - **Empty is a state, not a blank area.** A table body with nothing in it and
 *    no message is indistinguishable from one that failed to load.
 *  - **The header checkbox reports a partial selection** as `indeterminate`,
 *    which is the only honest answer when some rows on the page are picked.
 */
export function HubDataTable<Row>({
  rows,
  columns,
  rowId,
  onRowClick,
  selected,
  onSelectedChange,
  sort,
  onSortChange,
  loading = false,
  empty,
  footer,
  className,
}: HubDataTableProps<Row>) {
  const selectable = !!selected && !!onSelectedChange;
  const pageIds = React.useMemo(() => rows.map(rowId), [rows, rowId]);
  const selectedOnPage = selected ? pageIds.filter((id) => selected.has(id)).length : 0;
  const allOnPageSelected = selectable && rows.length > 0 && selectedOnPage === rows.length;
  const someOnPageSelected = selectable && selectedOnPage > 0 && !allOnPageSelected;

  const toggleAll = () => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    onSelectedChange(next);
  };

  const toggleOne = (id: string) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const handleSort = (col: HubColumn<Row>) => {
    if (!col.sortable || !onSortChange) return;
    const isCurrent = sort?.columnId === col.id;
    onSortChange({
      columnId: col.id,
      direction: isCurrent && sort?.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className={cn('overflow-hidden rounded-md border border-hairline bg-card', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead>
                <Checkbox
                  checked={allOnPageSelected || (someOnPageSelected ? 'indeterminate' : false)}
                  onCheckedChange={toggleAll}
                  aria-label={allOnPageSelected ? 'Deselect all rows' : 'Select all rows'}
                  disabled={rows.length === 0}
                />
              </TableHead>
            )}
            {columns.map((col) => {
              const isSorted = sort?.columnId === col.id;
              return (
                <TableHead
                  key={col.id}
                  className={cn(
                    col.width,
                    col.align === 'right' && 'text-right',
                    col.hideBelow && HIDE_BELOW[col.hideBelow],
                  )}
                  aria-sort={
                    isSorted ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className={cn(
                        'group inline-flex items-center gap-1 rounded-xs transition-colors hover:text-foreground',
                        col.align === 'right' && 'flex-row-reverse',
                        isSorted && 'text-foreground',
                      )}
                    >
                      {col.header}
                      {isSorted ? (
                        sort?.direction === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-35 group-hover:opacity-70" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                {selectable && (
                  <TableCell>
                    <div className="skeleton h-4 w-4 rounded-xs" />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.id} className={cn(col.hideBelow && HIDE_BELOW[col.hideBelow])}>
                    <div
                      className={cn(
                        'skeleton h-3.5 rounded-xs',
                        col.align === 'right' ? 'ml-auto w-12' : 'w-24',
                      )}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!loading && rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="py-10 text-center">
                {empty ?? <span className="text-sm text-muted-foreground">No results.</span>}
              </TableCell>
            </TableRow>
          )}

          {!loading &&
            rows.map((row) => {
              const id = rowId(row);
              const isSelected = !!selected?.has(id);
              return (
                <TableRow
                  key={id}
                  data-state={isSelected ? 'selected' : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    // Clicking the checkbox must not also fire the row's navigate.
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(id)}
                        aria-label={isSelected ? 'Deselect row' : 'Select row'}
                      />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(
                        col.align === 'right' && 'text-right tabular-nums',
                        col.hideBelow && HIDE_BELOW[col.hideBelow],
                      )}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
        </TableBody>
      </Table>

      {footer && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * The primary cell of a row: the value you click to open the record. Rendered
 * in the accent colour so a scan down the table shows exactly one entry point
 * per row — which is what every list in a CRM is for.
 */
export const HubCellLink: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <span className={cn('font-semibold text-primary hover:underline', className)}>{children}</span>
);

/** A cell with no value. Never render an empty cell — a blank one reads as a bug. */
export const HubCellEmpty: React.FC = () => (
  <span className="text-muted-foreground" aria-label="No value">
    —
  </span>
);
