/**
 * Filter definitions for the stocktake list. The tab had no field filters at all, so a warehouse
 * running monthly counts across several sites had to page through everything.
 */
import { CalendarDays, ClipboardList, Warehouse } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import type { StockCount } from '../services/stockService';

const STATUSES = ['draft', 'posted', 'cancelled'] as const;
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', posted: 'Posted', cancelled: 'Cancelled' };

export function buildStockCountFilters(rows: StockCount[]): FilterGroupDef[] {
  const counts = new Map<string, number>();
  for (const c of rows) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);

  return [
    {
      key: 'general', label: 'General', icon: ClipboardList,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search note / warehouse…',
          accessor: (c: StockCount) => [c.note, c.warehouse?.name],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts.get(s) ?? 0 })),
          accessor: (c: StockCount) => c.status,
        },
        {
          key: 'adjusted', type: 'bool', label: 'Adjustments',
          description: 'Posted counts that actually moved stock.',
          trueLabel: 'Adjusted stock', falseLabel: 'No adjustment',
          accessor: (c: StockCount) => Number(c.adjusted_lines ?? 0) > 0,
        },
      ],
    },
    {
      key: 'warehouse', label: 'Warehouse', icon: Warehouse,
      fields: [
        {
          key: 'warehouse', type: 'multi', label: 'Warehouse',
          options: optionsFromRows(rows, (c) => c.warehouse?.name ?? undefined),
          accessor: (c: StockCount) => c.warehouse?.name ?? undefined,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (c: StockCount) => c.created_at },
        { key: 'posted_at', type: 'dateRange', label: 'Posted', accessor: (c: StockCount) => c.posted_at },
      ],
    },
  ];
}
