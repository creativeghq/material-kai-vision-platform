import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * DATA TABLE primitives.
 *
 * The table is the most-used surface in this platform, so it carries the
 * density rules for everything else:
 *
 *  - **Rows are separated by a hairline, not by a fill.** Zebra striping and
 *    tinted rows both consume the one visual channel a table needs to keep
 *    free — the row's own status colour.
 *  - **The header is a sunken strip with a hard bottom rule**, and it sticks.
 *    A scrolled table whose header has left the viewport is an unreadable grid
 *    of numbers; this is the single most valuable 3 lines in the file.
 *  - **Header labels are 11px semibold, not uppercase.** Uppercase kills word
 *    shape, which is exactly the cue you use to find a column at a glance.
 *  - **Cell padding is 12px/10px.** The old 16px/16px row was ~56px tall, so a
 *    laptop viewport showed nine rows of a hundred-row list.
 *
 * `Table` renders its own horizontal scroll container. Never wrap it in
 * `overflow-hidden` — see tests/unit/responsiveTableOverflow.test.ts for what
 * that costs on a phone.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto">
    <table
      ref={ref}
      className={cn('w-full caption-bottom border-collapse text-sm', className)}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'sticky top-0 z-10 bg-surface-sunken [&_tr]:border-0',
      // The rule lives on the <th> (border-b) rather than the <thead>: a
      // sticky <thead>'s own border is painted at its ORIGINAL position by
      // most engines, so it detaches from the strip as soon as you scroll.
      '[&_th]:border-b [&_th]:border-hairline',
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-hairline bg-surface-sunken font-semibold [&>tr]:last:border-b-0',
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-hairline transition-colors hover:bg-surface-hover data-[state=selected]:bg-primary/10',
      className,
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-9 whitespace-nowrap px-3 text-left align-middle text-[11px] font-semibold tracking-wide text-muted-foreground [&:has([role=checkbox])]:w-9 [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-3 py-2.5 align-middle text-sm [&:has([role=checkbox])]:w-9 [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-3 text-xs text-muted-foreground', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
