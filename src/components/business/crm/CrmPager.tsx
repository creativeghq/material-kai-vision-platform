import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/core/ui/button';

interface CrmPagerProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total number of (filtered) rows across all pages. */
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Client-side table pager — slices an already-loaded, already-filtered list.
 * Renders nothing when everything fits on a single page.
 */
export const CrmPager: React.FC<CrmPagerProps> = ({ page, pageSize, total, onPageChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-1 pt-3 text-sm text-muted-foreground">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4 mr-1" />Prev
        </Button>
        <span className="px-2 tabular-nums">Page {page} / {pageCount}</span>
        <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Next<ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};
