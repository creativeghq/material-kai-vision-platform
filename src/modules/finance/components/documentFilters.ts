/**
 * Filter definitions for the Finance documents list, one set per document type.
 *
 * Before this, every document type shared a single search box + category `Select` — so a
 * payment could not be narrowed by direction, method, date or amount, and credit notes /
 * delivery notes / cheques had no filters at all. Each type now declares the dimensions it
 * actually has; option lists with no fixed enum are derived from the loaded rows so they
 * carry live counts.
 */
import { CalendarDays, Coins, FileText, Tags } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import { paymentMethodLabel } from '@/modules/finance/services/financeService';
import { mydataTypeName, mydataTypeRank } from '@/modules/finance/components/mydataTypes';
import { humanizeLabel } from '@/utils/humanize';
import type { FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

export type DocFilterType =
  | 'invoices' | 'receipts' | 'credit_notes' | 'payments'
  | 'delivery_notes' | 'cheques' | 'expenses';

/** Widen the observed amounts a little so the slider ends aren't pinned to real rows. */
function amountBounds(rows: any[], pick: (r: any) => any): { min: number; max: number } {
  const nums = rows.map(pick).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { min: 0, max: 1000 };
  const max = Math.max(...nums, 0);
  return { min: 0, max: Math.max(Math.ceil(max / 10) * 10, 10) };
}

const categoryOptions = (categories: FinanceCategory[]): FilterOption[] => [
  { value: NONE_VALUE, label: 'Uncategorized' },
  ...categories.map((c) => ({ value: c.id, label: c.name })),
];

const statusOptions = (rows: any[], key = 'status') => optionsFromRows(rows, (r) => r[key], humanizeLabel);

/**
 * myDATA type options read as their NAME with the code as the secondary line — a bare "1.1"
 * is unfilterable for anyone who hasn't memorised the AADE table. Ordered numerically, so
 * "2.1" precedes "11.1" (a label sort puts those the wrong way round).
 */
const mydataTypeOptions = (rows: any[], accessor: (r: any) => any, labels: Record<string, string>): FilterOption[] =>
  optionsFromRows(rows, accessor, (code) => mydataTypeName(code, labels))
    .map((o) => ({ ...o, hint: `AADE code ${o.value}` }))
    .sort((a, b) => mydataTypeRank(a.value) - mydataTypeRank(b.value));

export function buildDocumentFilters(
  type: DocFilterType,
  ctx: {
    rows: any[];
    categories: FinanceCategory[];
    categoryName: (id: any) => string;
    /** myDATA code → name, from `useMydataTypeLabels()`. Empty until the lookup lands. */
    mydataTypes?: Record<string, string>;
  },
): FilterGroupDef[] {
  const { rows, categories, categoryName, mydataTypes = {} } = ctx;

  switch (type) {
    case 'payments': {
      const amount = amountBounds(rows, (r) => r.amount);
      const allocatedOf = (r: any) => (r.allocations ?? []).reduce((s: number, a: any) => s + Number(a.amount ?? 0), 0);
      return [
        {
          key: 'general', label: 'General', icon: FileText,
          fields: [
            {
              key: 'q', type: 'text', label: 'Search',
              placeholder: 'Search reference / Counterparty…',
              accessor: (r) => [r.reference, r.counterparty_name, r.method && paymentMethodLabel(r.method)],
            },
            {
              key: 'direction', type: 'multi', label: 'Direction',
              options: [{ value: 'in', label: 'Received' }, { value: 'out', label: 'Paid / Refund' }],
              accessor: (r) => r.direction,
            },
            {
              key: 'method', type: 'multi', label: 'Payment method',
              options: optionsFromRows(rows, (r) => r.method, paymentMethodLabel),
              accessor: (r) => r.method,
            },
          ],
        },
        {
          key: 'classification', label: 'Classification', icon: Tags,
          fields: [
            {
              key: 'category', type: 'multi', label: 'Category',
              description: 'Finance category assigned to the payment.',
              options: categoryOptions(categories),
              accessor: (r) => r.category_id ?? undefined,
            },
            {
              key: 'currency', type: 'multi', label: 'Currency',
              options: optionsFromRows(rows, (r) => r.currency),
              accessor: (r) => r.currency,
            },
          ],
        },
        {
          key: 'amounts', label: 'Amounts', icon: Coins,
          fields: [
            { key: 'amount', type: 'range', label: 'Amount', unit: '', min: amount.min, max: amount.max, accessor: (r) => r.amount },
            {
              key: 'unallocated', type: 'bool', label: 'Allocation',
              description: 'Fully allocated to documents, or still carrying an open balance.',
              trueLabel: 'Has unallocated', falseLabel: 'Fully allocated',
              accessor: (r) => allocatedOf(r) < Number(r.amount ?? 0) - 0.005,
            },
          ],
        },
        {
          key: 'dates', label: 'Dates', icon: CalendarDays,
          fields: [{ key: 'paid_at', type: 'dateRange', label: 'Payment date', accessor: (r) => r.paid_at }],
        },
      ];
    }

    case 'invoices':
    case 'receipts': {
      const total = amountBounds(rows, (r) => r.total);
      return [
        {
          key: 'general', label: 'General', icon: FileText,
          fields: [
            {
              key: 'q', type: 'text', label: 'Search',
              placeholder: 'Search number / Customer…',
              accessor: (r) => [r.internal_number, r.customer_name, categoryName(r.category_id)],
            },
            { key: 'status', type: 'multi', label: 'Status', options: statusOptions(rows), accessor: (r) => r.status },
            {
              key: 'fiscal', type: 'bool', label: 'myDATA',
              description: 'Whether the document has been transmitted to AADE.',
              trueLabel: 'Transmitted', falseLabel: 'Not transmitted',
              accessor: (r) => r.fiscal_status === 'accepted' || r.fiscal_status === 'offline',
            },
          ],
        },
        {
          key: 'classification', label: 'Classification', icon: Tags,
          fields: [
            { key: 'category', type: 'multi', label: 'Category', options: categoryOptions(categories), accessor: (r) => r.category_id ?? undefined },
            { key: 'currency', type: 'multi', label: 'Currency', options: optionsFromRows(rows, (r) => r.currency), accessor: (r) => r.currency },
          ],
        },
        {
          key: 'amounts', label: 'Amounts', icon: Coins,
          fields: [
            { key: 'total', type: 'range', label: 'Total', min: total.min, max: total.max, accessor: (r) => r.total },
            {
              key: 'outstanding', type: 'bool', label: 'Balance',
              trueLabel: 'Has amount due', falseLabel: 'Settled',
              accessor: (r) => Number(r.amount_due ?? 0) > 0.005,
            },
          ],
        },
        {
          key: 'dates', label: 'Dates', icon: CalendarDays,
          fields: [
            { key: 'issued_at', type: 'dateRange', label: 'Issue date', accessor: (r) => r.issued_at },
            { key: 'due_at', type: 'dateRange', label: 'Due date', accessor: (r) => r.due_at ?? r.due_date },
          ],
        },
      ];
    }

    case 'credit_notes': {
      const total = amountBounds(rows, (r) => r.total ?? r.amount);
      return [
        {
          key: 'general', label: 'General', icon: FileText,
          fields: [
            {
              key: 'q', type: 'text', label: 'Search',
              placeholder: 'Search number / Reason…',
              accessor: (r) => [r.credit_note_number, r.reason],
            },
            {
              key: 'document_type', type: 'multi', label: 'Type',
              options: mydataTypeOptions(rows, (r) => r.document_type, mydataTypes),
              accessor: (r) => r.document_type,
            },
            {
              key: 'fiscal', type: 'bool', label: 'myDATA',
              trueLabel: 'Transmitted', falseLabel: 'Not transmitted',
              accessor: (r) => r.fiscal_status === 'accepted' || r.fiscal_status === 'offline',
            },
            {
              key: 'linked', type: 'bool', label: 'Linked invoice',
              trueLabel: 'Linked', falseLabel: 'Standalone',
              accessor: (r) => !!r.invoice_id,
            },
          ],
        },
        {
          key: 'amounts', label: 'Amounts', icon: Coins,
          fields: [{ key: 'total', type: 'range', label: 'Amount', min: total.min, max: total.max, accessor: (r) => r.total ?? r.amount }],
        },
        {
          key: 'dates', label: 'Dates', icon: CalendarDays,
          fields: [{ key: 'issued_at', type: 'dateRange', label: 'Issue date', accessor: (r) => r.issued_at }],
        },
      ];
    }

    case 'expenses': {
      const total = amountBounds(rows, (r) => r.total_gross);
      return [
        {
          key: 'general', label: 'General', icon: FileText,
          fields: [
            {
              key: 'q', type: 'text', label: 'Search',
              placeholder: 'Search supplier / VAT / document type…',
              // The type name as well as its code — nobody searches for "2.1".
              accessor: (r) => [r.issuer_name, r.issuer_vat, r.doc_type, r.doc_type && mydataTypeName(r.doc_type, mydataTypes)],
            },
            { key: 'status', type: 'multi', label: 'Status', options: statusOptions(rows), accessor: (r) => r.status },
            {
              key: 'doc_type', type: 'multi', label: 'Document type',
              options: mydataTypeOptions(rows, (r) => r.doc_type, mydataTypes),
              accessor: (r) => r.doc_type,
            },
          ],
        },
        {
          key: 'classification', label: 'Classification', icon: Tags,
          fields: [
            { key: 'category', type: 'multi', label: 'Category', options: categoryOptions(categories), accessor: (r) => r.category_id ?? undefined },
            {
              key: 'issuer', type: 'multi', label: 'Issuer',
              options: optionsFromRows(rows, (r) => r.issuer_name),
              accessor: (r) => r.issuer_name,
            },
          ],
        },
        {
          key: 'amounts', label: 'Amounts', icon: Coins,
          fields: [{ key: 'total_gross', type: 'range', label: 'Total', min: total.min, max: total.max, accessor: (r) => r.total_gross }],
        },
        {
          key: 'dates', label: 'Dates', icon: CalendarDays,
          fields: [{ key: 'issue_date', type: 'dateRange', label: 'Issue date', accessor: (r) => r.issue_date }],
        },
      ];
    }

    case 'delivery_notes':
      return [
        {
          key: 'general', label: 'General', icon: FileText,
          fields: [
            { key: 'q', type: 'text', label: 'Search', placeholder: 'Search note number…', accessor: (r) => r.delivery_note_number },
            {
              key: 'kind', type: 'multi', label: 'Kind',
              options: [{ value: 'dispatch', label: 'Dispatch' }, { value: 'receipt', label: 'Receipt' }],
              accessor: (r) => r.kind,
            },
            { key: 'status', type: 'multi', label: 'Status', options: statusOptions(rows), accessor: (r) => r.status },
            {
              key: 'fiscal', type: 'bool', label: 'myDATA',
              trueLabel: 'Transmitted', falseLabel: 'Not transmitted',
              accessor: (r) => !!r.fiscal_mark,
            },
          ],
        },
        {
          key: 'dates', label: 'Dates', icon: CalendarDays,
          fields: [{ key: 'issued_at', type: 'dateRange', label: 'Date', accessor: (r) => r.issued_at ?? r.created_at }],
        },
      ];

    case 'cheques': {
      const amount = amountBounds(rows, (r) => r.amount);
      return [
        {
          key: 'general', label: 'General', icon: FileText,
          fields: [
            { key: 'q', type: 'text', label: 'Search', placeholder: 'Search cheque no. / bank…', accessor: (r) => [r.cheque_number, r.bank] },
            {
              key: 'direction', type: 'multi', label: 'Direction',
              options: [{ value: 'in', label: 'Received' }, { value: 'out', label: 'Issued' }],
              accessor: (r) => r.direction,
            },
            { key: 'status', type: 'multi', label: 'Status', options: statusOptions(rows), accessor: (r) => r.status },
            { key: 'bank', type: 'multi', label: 'Bank', options: optionsFromRows(rows, (r) => r.bank), accessor: (r) => r.bank },
            {
              key: 'overdue', type: 'bool', label: 'Overdue',
              description: 'Still pending past its due date.',
              trueLabel: 'Overdue only', falseLabel: 'Not overdue',
              accessor: (r) => r.status === 'pending' && !!r.due_date && new Date(r.due_date) < new Date(),
            },
          ],
        },
        {
          key: 'amounts', label: 'Amounts', icon: Coins,
          fields: [{ key: 'amount', type: 'range', label: 'Amount', min: amount.min, max: amount.max, accessor: (r) => r.amount }],
        },
        {
          key: 'dates', label: 'Dates', icon: CalendarDays,
          fields: [{ key: 'due_date', type: 'dateRange', label: 'Due date', accessor: (r) => r.due_date }],
        },
      ];
    }

    default:
      return [];
  }
}
