/**
 * Filter definitions for the Finance AR / AP aging lists.
 *
 * The two lists share one row shape (`AgingRow`), so they share one builder — only the
 * category side (income vs expense) and the search placeholder differ. The age bucket is a
 * plain `select` field so the clickable BucketCards row and the filter modal edit the SAME
 * value and can never disagree.
 */
import { CalendarDays, Coins, FileText, Tags, Users } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import { ageBucketLabel, type AgeBucket, type AgingRow } from '@/modules/finance/services/financeService';
import { humanizeLabel } from '@/utils/humanize';
import type { FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

/** Key of the age-bucket field — shared by BucketCards and the modal. */
export const AGE_BUCKET_KEY = 'age_bucket';

/** Every bucket a row can carry, not just the five with KPI cards. */
const ALL_AGE_BUCKETS: AgeBucket[] = ['current', '0-30', '31-60', '61-90', '90+', 'no_due_date', 'paid'];

/** Round the observed maximum up so the slider ends aren't pinned to a single real row. */
function amountBounds(rows: AgingRow[], pick: (r: AgingRow) => number): { min: number; max: number } {
  const max = rows.reduce((m, r) => Math.max(m, Number(pick(r)) || 0), 0);
  return { min: 0, max: Math.max(Math.ceil(max / 10) * 10, 10) };
}

export function buildAgingFilters(
  side: 'ar' | 'ap',
  ctx: { rows: AgingRow[]; categories: FinanceCategory[] },
): FilterGroupDef[] {
  const { rows, categories } = ctx;
  const total = amountBounds(rows, (r) => r.total);
  const due = amountBounds(rows, (r) => r.amount_due);
  // Real categories only — see documentFilters: the "Uncategorized" sentinel read as a category
  // the operator never created.
  const categoryOptions: FilterOption[] = categories.map((c) => ({ value: c.id, label: c.name }));

  return [
    {
      key: 'general', label: 'General', icon: FileText,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: side === 'ar' ? 'Search customer / Number…' : 'Search supplier / Bill #…',
          accessor: (r: AgingRow) => [r.party_name, r.internal_number, r.supplier_bill_number, r.description, r.category_name],
        },
        {
          key: AGE_BUCKET_KEY, type: 'select', label: 'Age bucket',
          description: 'Same value the bucket cards above set.',
          options: ALL_AGE_BUCKETS.map((b) => ({ value: b, label: ageBucketLabel(b) })),
          accessor: (r: AgingRow) => r.age_bucket,
        },
        {
          key: 'entry_kind', type: 'multi', label: 'Entry kind',
          description: 'An issued document, or a confirmed order that is not invoiced yet.',
          options: [
            { value: 'invoice', label: side === 'ar' ? 'Invoice' : 'Supplier bill' },
            { value: 'order', label: 'Order — not invoiced' },
            ...(side === 'ar' ? [{ value: 'credit', label: 'Customer credit (overpayment)' }] : []),
            { value: 'manual', label: 'Manual entry' },
          ],
          accessor: (r: AgingRow) => r.entry_kind ?? 'invoice',
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: optionsFromRows(rows, (r) => r.status, humanizeLabel),
          accessor: (r: AgingRow) => r.status,
        },
      ],
    },
    {
      key: 'party', label: side === 'ar' ? 'Customer' : 'Supplier', icon: Users,
      fields: [
        {
          key: 'party', type: 'multi', label: side === 'ar' ? 'Customer' : 'Supplier',
          options: optionsFromRows(rows, (r) => r.party_name),
          accessor: (r: AgingRow) => r.party_name,
        },
      ],
    },
    {
      key: 'classification', label: 'Classification', icon: Tags,
      fields: [
        {
          key: 'category', type: 'multi', label: 'Category',
          options: categoryOptions,
          accessor: (r: AgingRow) => r.category_id ?? undefined,
        },
      ],
    },
    {
      key: 'amounts', label: 'Amounts', icon: Coins,
      fields: [
        { key: 'total', type: 'range', label: 'Total', min: total.min, max: total.max, accessor: (r: AgingRow) => r.total },
        { key: 'amount_due', type: 'range', label: 'Still due', min: due.min, max: due.max, accessor: (r: AgingRow) => r.amount_due },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        {
          key: 'due_at', type: 'dateRange', label: 'Due date',
          description: 'For an un-invoiced order this is its expected payment date.',
          accessor: (r: AgingRow) => r.due_at,
        },
        { key: 'issued_at', type: 'dateRange', label: 'Issue date', accessor: (r: AgingRow) => r.issued_at },
      ],
    },
  ];
}
