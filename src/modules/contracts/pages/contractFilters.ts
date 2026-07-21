/**
 * Filter definitions for the contracts list.
 *
 * The context tabs (All / Finance / HR / Projects) stay as navigation — they change which set
 * the server returns. Everything within a context (status, counterparty, type, value, dates)
 * lives in the modal.
 */
import { CalendarDays, Coins, FileSignature, Users } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { Contract, ContractStatus } from '@/services/contractsService';

const STATUSES: ContractStatus[] = ['draft', 'sent', 'signed', 'declined', 'void'];

export function buildContractFilters(rows: Contract[]): FilterGroupDef[] {
  const statusCounts = new Map<string, number>();
  for (const c of rows) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);

  const values = rows.map((c) => Number(c.value)).filter((n) => Number.isFinite(n) && n > 0);
  const valueMax = Math.max(values.length ? Math.ceil(Math.max(...values) / 100) * 100 : 0, 1000);

  return [
    {
      key: 'general', label: 'General', icon: FileSignature,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search title / counterparty…',
          accessor: (c: Contract) => [c.title, c.counterparty_name, c.counterparty_email, c.contract_type],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: STATUSES.map((s) => ({ value: s, label: humanizeLabel(s), count: statusCounts.get(s) ?? 0 })),
          accessor: (c: Contract) => c.status,
        },
        {
          key: 'contract_type', type: 'multi', label: 'Type',
          options: optionsFromRows(rows, (c) => c.contract_type ?? undefined, humanizeLabel),
          accessor: (c: Contract) => c.contract_type ?? undefined,
        },
      ],
    },
    {
      key: 'counterparty', label: 'Counterparty', icon: Users,
      fields: [
        {
          key: 'counterparty_name', type: 'multi', label: 'Counterparty',
          description: 'Contracts created from an entity record may carry no free-text counterparty.',
          options: [{ value: NONE_VALUE, label: 'None recorded' }, ...optionsFromRows(rows, (c) => c.counterparty_name ?? undefined)],
          accessor: (c: Contract) => c.counterparty_name ?? undefined,
        },
      ],
    },
    {
      key: 'value', label: 'Value', icon: Coins,
      fields: [
        { key: 'value', type: 'range', label: 'Contract value', min: 0, max: valueMax, accessor: (c: Contract) => c.value ?? 0 },
        {
          key: 'currency', type: 'multi', label: 'Currency',
          options: optionsFromRows(rows, (c) => c.currency ?? undefined),
          accessor: (c: Contract) => c.currency ?? undefined,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'effective_date', type: 'dateRange', label: 'Effective', accessor: (c: Contract) => c.effective_date },
        { key: 'expiry_date', type: 'dateRange', label: 'Expires', accessor: (c: Contract) => c.expiry_date },
        { key: 'signed_at', type: 'dateRange', label: 'Signed', accessor: (c: Contract) => c.signed_at },
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (c: Contract) => c.created_at },
      ],
    },
  ];
}
