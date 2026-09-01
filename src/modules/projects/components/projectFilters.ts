/**
 * Filter definitions for the projects list.
 *
 * Archived is a field like any other, seeded to `false` so the default view hides archived
 * projects — not a lone "Show archived" toggle, which leaves a designer with 40 projects no
 * way to narrow by client, budget or deadline.
 */
import { CalendarDays, Coins, FolderKanban, Tags, UserRound, Users } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
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

  // Built from the rows rather than from project_categories, so the facet offers exactly the
  // kinds actually in use — a workspace with 12 categories and 3 in play gets 3 options, not 12
  // of which 9 are dead ends. `NONE_VALUE` covers uncategorised, which is a normal state here.
  const categories = new Map<string, FilterOption>();
  for (const p of rows) {
    const c = p.category;
    if (!c?.id) continue;
    const existing = categories.get(c.id);
    if (existing) existing.count = (existing.count ?? 0) + 1;
    else categories.set(c.id, { value: c.id, label: c.label, count: 1 });
  }
  const uncategorised = rows.filter((p) => !p.category_id).length;
  const categoryOptions: FilterOption[] = [
    ...(uncategorised > 0 ? [{ value: NONE_VALUE, label: 'No category', count: uncategorised }] : []),
    ...[...categories.values()].sort((a, b) => a.label.localeCompare(b.label)),
  ];

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
      key: 'category', label: 'Category', icon: Tags,
      fields: [
        {
          key: 'category', type: 'multi', label: 'Category',
          description: 'The kind of work — managed from Categories on the projects list.',
          options: categoryOptions,
          accessor: (p: ProjectWithClient) => p.category_id ?? undefined,
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
      key: 'owner', label: 'Owner', icon: UserRound,
      fields: [
        {
          // The list now returns collaborator-shared projects too (RLS was always wider than the
          // old user_id filter), so who owns a project is a real dimension rather than a constant.
          key: 'owner', type: 'multi', label: 'Owned by',
          options: optionsFromRows(rows, (p) => p.owner_name ?? undefined),
          accessor: (p: ProjectWithClient) => p.owner_name ?? undefined,
        },
        {
          key: 'is_mine', type: 'bool', label: 'Ownership',
          description: 'Projects you own, versus ones shared with you as a collaborator.',
          trueLabel: 'Mine', falseLabel: 'Shared with me',
          accessor: (p: ProjectWithClient) => p.is_mine !== false,
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
