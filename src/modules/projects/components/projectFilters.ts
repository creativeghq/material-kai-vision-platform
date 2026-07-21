/**
 * Filter definitions for the projects list.
 *
 * The list previously had a single "Show archived" toggle, so a designer with 40 projects had
 * no way to narrow by client, budget or deadline. Archived is now a field like any other, seeded
 * to `false` so the default view still hides archived projects.
 */
import { CalendarDays, Coins, FolderKanban, Users } from 'lucide-react';
import { NONE_VALUE, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import type { ProjectStatus, ProjectWithClient } from '../services/projectsService';

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

/** Stable id for the client dimension — a project is tied to a company XOR a contact. */
const clientKey = (p: ProjectWithClient) => p.client_company_id ?? p.client_contact_id ?? undefined;

const clientName = (p: ProjectWithClient): string => {
  if (p.client_company?.name) return p.client_company.name;
  const c = p.client_contact;
  if (!c) return '';
  return c.name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || '';
};

export function buildProjectFilters(rows: ProjectWithClient[]): FilterGroupDef[] {
  const statusCounts = new Map<string, number>();
  for (const p of rows) statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);

  const clients = new Map<string, FilterOption>();
  for (const p of rows) {
    const key = clientKey(p);
    if (!key) continue;
    const existing = clients.get(key);
    if (existing) existing.count = (existing.count ?? 0) + 1;
    else clients.set(key, { value: key, label: clientName(p) || 'Unnamed client', count: 1 });
  }
  const clientOptions: FilterOption[] = [
    { value: NONE_VALUE, label: 'No client' },
    ...[...clients.values()].sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const currencies = new Map<string, number>();
  for (const p of rows) currencies.set(p.budget_currency, (currencies.get(p.budget_currency) ?? 0) + 1);

  const budgets = rows.map((p) => Number(p.budget_amount)).filter((n) => Number.isFinite(n) && n > 0);
  const budgetMax = Math.max(budgets.length ? Math.ceil(Math.max(...budgets) / 100) * 100 : 0, 1000);

  return [
    {
      key: 'general', label: 'General', icon: FolderKanban,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search name / client…',
          accessor: (p: ProjectWithClient) => [p.name, p.description, clientName(p)],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: STATUS_OPTIONS.map((o) => ({ ...o, count: statusCounts.get(o.value) ?? 0 })),
          accessor: (p: ProjectWithClient) => p.status,
        },
        {
          key: 'archived', type: 'bool', label: 'Archived',
          description: 'Archived projects are hidden by default.',
          trueLabel: 'Archived only', falseLabel: 'Hide archived',
          accessor: (p: ProjectWithClient) => p.status === 'archived',
        },
      ],
    },
    {
      key: 'client', label: 'Client', icon: Users,
      fields: [
        {
          key: 'client', type: 'multi', label: 'Client',
          description: 'The CRM company or contact the project is billed to.',
          options: clientOptions,
          accessor: clientKey,
        },
      ],
    },
    {
      key: 'budget', label: 'Budget', icon: Coins,
      fields: [
        {
          key: 'budget_amount', type: 'range', label: 'Budget',
          min: 0, max: budgetMax,
          accessor: (p: ProjectWithClient) => p.budget_amount ?? 0,
        },
        {
          key: 'budget_currency', type: 'multi', label: 'Currency',
          options: [...currencies.entries()].map(([value, count]) => ({ value, label: value, count })),
          accessor: (p: ProjectWithClient) => p.budget_currency,
        },
        {
          key: 'over_budget', type: 'bool', label: 'Budget health',
          trueLabel: 'Over budget', falseLabel: 'Within budget',
          accessor: (p: ProjectWithClient) => Number(p.budget_amount ?? 0) > 0 && Number(p.actual_amount ?? 0) > Number(p.budget_amount),
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'deadline', type: 'dateRange', label: 'Deadline', accessor: (p: ProjectWithClient) => p.deadline },
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (p: ProjectWithClient) => p.created_at },
        { key: 'last_activity_at', type: 'dateRange', label: 'Last activity', accessor: (p: ProjectWithClient) => p.last_activity_at },
      ],
    },
  ];
}
