/**
 * Filter definitions for the two quote list surfaces.
 *
 * Both used to expose a single status control and nothing else — the customer list a bespoke
 * Popover+Command, the admin list a status-tag `Select`. Neither could be narrowed by date,
 * value or owner. Option lists with no fixed enum (currency, requester) are derived from the
 * loaded rows so they carry live counts.
 */
import { CalendarDays, Coins, FileText, Tags } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { QuoteWithItems, StatusTag } from '../services/QuotesService';

const QUOTE_STATUSES = ['draft', 'submitted', 'quoted', 'accepted', 'rejected', 'expired'] as const;

const statusOptions = (rows: QuoteWithItems[]): FilterOption[] => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return QUOTE_STATUSES.map((s) => ({ value: s, label: humanizeLabel(s), count: counts.get(s) ?? 0 }));
};

/** Widen the observed totals so the slider ends aren't pinned to real rows. */
function bounds(rows: QuoteWithItems[], pick: (r: QuoteWithItems) => any): { min: number; max: number } {
  const nums = rows.map(pick).map(Number).filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums, 0) : 0;
  return { min: 0, max: Math.max(Math.ceil(max / 10) * 10, 10) };
}

/** Customer-facing /quotes list. */
export function buildQuoteFilters(rows: QuoteWithItems[]): FilterGroupDef[] {
  const total = bounds(rows, (r) => r.grand_total);
  const items = bounds(rows, (r) => r.total_items);
  return [
    {
      key: 'general', label: 'General', icon: FileText,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search name / number…',
          accessor: (r: QuoteWithItems) => [r.name, r.quote_number, r.notes],
        },
        { key: 'status', type: 'multi', label: 'Status', options: statusOptions(rows), accessor: (r: QuoteWithItems) => r.status },
      ],
    },
    {
      key: 'classification', label: 'Classification', icon: Tags,
      fields: [
        {
          key: 'currency', type: 'multi', label: 'Currency',
          options: optionsFromRows(rows, (r) => r.currency),
          accessor: (r: QuoteWithItems) => r.currency,
        },
        {
          // `customer_name` is resolved from the CRM FK on read (quotesService.getUserQuotes),
          // so this can be a real picker instead of the has/hasn't flag it started as.
          key: 'customer', type: 'multi', label: 'Customer',
          description: 'CRM company or contact the quote is addressed to.',
          options: [
            { value: NONE_VALUE, label: 'No customer' },
            ...optionsFromRows(rows, (r) => r.customer_name ?? undefined),
          ],
          accessor: (r: QuoteWithItems) => r.customer_name ?? undefined,
        },
      ],
    },
    {
      key: 'amounts', label: 'Amounts', icon: Coins,
      fields: [
        { key: 'grand_total', type: 'range', label: 'Total', min: total.min, max: total.max, accessor: (r: QuoteWithItems) => r.grand_total },
        { key: 'total_items', type: 'range', label: 'Items', min: items.min, max: items.max, step: 1, accessor: (r: QuoteWithItems) => r.total_items },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (r: QuoteWithItems) => r.created_at },
        { key: 'expires_at', type: 'dateRange', label: 'Expires', accessor: (r: QuoteWithItems) => r.expires_at },
      ],
    },
  ];
}

/** Admin /quotes/requests/manage list. Status tags come from the DB table, not an enum. */
export function buildQuoteRequestFilters(
  rows: QuoteWithItems[],
  ctx: { statusTags: StatusTag[]; requesterName: (userId: string) => string },
): FilterGroupDef[] {
  const total = bounds(rows, (r) => r.grand_total);
  const tagOptions: FilterOption[] = [
    { value: NONE_VALUE, label: 'No tag' },
    ...ctx.statusTags.map((t) => ({ value: t.id, label: t.name })),
  ];
  return [
    {
      key: 'general', label: 'General', icon: FileText,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search name / number…',
          accessor: (r: QuoteWithItems) => [r.name, r.quote_number, r.notes, r.custom_request_text],
        },
        { key: 'status', type: 'multi', label: 'Status', options: statusOptions(rows), accessor: (r: QuoteWithItems) => r.status },
      ],
    },
    {
      key: 'classification', label: 'Classification', icon: Tags,
      fields: [
        {
          key: 'status_tag', type: 'multi', label: 'Status tag',
          description: 'Workflow tag assigned by the team.',
          options: tagOptions,
          accessor: (r: QuoteWithItems) => r.status_tag_id ?? undefined,
        },
        {
          key: 'requester', type: 'multi', label: 'Requester',
          options: optionsFromRows(rows, (r) => r.user_id, ctx.requesterName),
          accessor: (r: QuoteWithItems) => r.user_id,
        },
      ],
    },
    {
      key: 'amounts', label: 'Amounts', icon: Coins,
      fields: [
        { key: 'grand_total', type: 'range', label: 'Total', min: total.min, max: total.max, accessor: (r: QuoteWithItems) => r.grand_total },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (r: QuoteWithItems) => r.created_at },
        { key: 'expires_at', type: 'dateRange', label: 'Expires', accessor: (r: QuoteWithItems) => r.expires_at },
      ],
    },
  ];
}
