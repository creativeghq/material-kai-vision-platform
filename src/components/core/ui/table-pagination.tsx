// Standard table footer: "Showing 21–40 of 137" + numbered page buttons.
// House rule: long tables paginate with NUMBERED pages, never "Load more" — an append-forever
// list makes it impossible to tell how much data exists, to jump to older rows, or to keep your
// place after a re-render. `SmartPagination` renders the numbers (with ellipsis past 7 pages);
// this wraps it with the row-range readout and hides itself when there's only one page.
import React from 'react';
import { SmartPagination } from '@/components/core/ui/smart-pagination';

/** Default rows per page for every paginated table in the app. */
export const TABLE_PAGE_SIZE = 20;

interface TablePaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total row count across all pages (not the current page's length). */
  total: number;
  /** Rows per page. Defaults to TABLE_PAGE_SIZE. */
  pageSize?: number;
  onPageChange: (page: number) => void;
  /** Noun for the row-count readout, e.g. "invoices". Defaults to "rows". */
  label?: string;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  total,
  pageSize = TABLE_PAGE_SIZE,
  onPageChange,
  label = 'rows',
  className,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Nothing to page through — render the count only, so a short table stays quiet.
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={[
        'flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className ?? '',
      ].join(' ')}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {from}–{to} of {total} {label}
      </p>
      {totalPages > 1 && (
        <SmartPagination currentPage={page} totalPages={totalPages} onPageChange={onPageChange} />
      )}
    </div>
  );
};

/**
 * Client-side slice for tables that already hold every row in memory.
 * Server-paged tables should NOT use this — they pass their own `total` from the query count.
 */
export function paginate<T>(rows: T[], page: number, pageSize = TABLE_PAGE_SIZE): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

/**
 * Clamp a page number when the underlying row count shrinks (filter applied, row deleted).
 * Without this, filtering a 5-page table while on page 5 shows an empty table with no way back.
 */
export function clampPage(page: number, total: number, pageSize = TABLE_PAGE_SIZE): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / pageSize)));
}
