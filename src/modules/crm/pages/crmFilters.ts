/**
 * Filter definitions for the three CRM list tabs.
 *
 * The CRM lists are HYBRID and the field defs encode which half each dimension belongs to:
 *
 *  - Users are client-side (one edge-function payload), so every field carries an
 *    `accessor` and `applyFilters` does the matching.
 *  - Contacts / companies are SERVER-paged through crm-api, which takes its own
 *    `CrmListFilters` shape (and an `ids[]` allowlist for membership dimensions the client
 *    resolves itself). Those fields therefore carry NEITHER `accessor` NOR `column`:
 *    `applyFilters` passes them through untouched and the page reads them out of `values`
 *    to build the request. Giving them a `column` would be wrong — there is no supabase
 *    query builder on that path at all.
 *
 * The old `ANY = '__any__'` sentinel is gone: an unset value is "no filter".
 */
import { Building2, Tags, User } from 'lucide-react';
import type { FilterGroupDef, FilterOption } from '@/components/core/filters';
import { CLIENT_SUPPLIER_OPTIONS, PROFESSIONAL_TYPE_OPTIONS, STATUS_OPTIONS } from '../crmConstants';

const professionOptions = PROFESSIONAL_TYPE_OPTIONS as FilterOption[];
const statusOptions = STATUS_OPTIONS as FilterOption[];
const kindOptions = CLIENT_SUPPLIER_OPTIONS as FilterOption[];

export function buildUserFilters(ctx: {
  roleOptions: FilterOption[];
  subscriptionOptions: FilterOption[];
}): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: User,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search by email…',
          accessor: (u) => [u.email, u.user_id],
        },
        { key: 'status', type: 'multi', label: 'Status', options: statusOptions, accessor: (u) => u.status },
        {
          key: 'profession', type: 'multi', label: 'Professional type',
          options: professionOptions, accessor: (u) => u.professional_type,
        },
      ],
    },
    {
      key: 'account', label: 'Account', icon: Tags,
      fields: [
        { key: 'role', type: 'multi', label: 'Role', options: ctx.roleOptions, accessor: (u) => u.role_id },
        {
          key: 'subscription', type: 'multi', label: 'Plan',
          options: ctx.subscriptionOptions, accessor: (u) => u.subscription_tier,
        },
      ],
    },
  ];
}

export function buildContactFilters(ctx: {
  categoryOptions: FilterOption[];
  companyNameOptions: FilterOption[];
}): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: User,
      fields: [
        { key: 'q', type: 'text', label: 'Search', placeholder: 'Search contacts…' },
        { key: 'profession', type: 'select', label: 'Professional type', options: professionOptions },
        { key: 'status', type: 'select', label: 'Status', options: statusOptions },
        { key: 'kind', type: 'select', label: 'Relationship', options: kindOptions },
      ],
    },
    {
      key: 'membership', label: 'Membership', icon: Tags,
      fields: [
        {
          key: 'company', type: 'select', label: 'Attached company',
          description: 'Resolved to a contact-id allowlist across the company junction.',
          options: ctx.companyNameOptions,
        },
        {
          key: 'category', type: 'select', label: 'Category',
          description: 'Resolved to a contact-id allowlist from the category members.',
          options: ctx.categoryOptions,
        },
      ],
    },
  ];
}

// No `status` filter: crm_companies has no status column, so it could only ever match zero
// rows (or 400 server-side). Deliberately absent rather than shipped inert.
export function buildCompanyFilters(ctx: {
  categoryOptions: FilterOption[];
  industryOptions: FilterOption[];
}): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: Building2,
      fields: [
        { key: 'q', type: 'text', label: 'Search', placeholder: 'Search companies…' },
        { key: 'profession', type: 'select', label: 'Professional type', options: professionOptions },
        { key: 'kind', type: 'select', label: 'Relationship', options: kindOptions },
      ],
    },
    {
      key: 'membership', label: 'Membership', icon: Tags,
      fields: [
        {
          key: 'industry', type: 'select', label: 'Industry',
          description: 'Resolved to a company-id allowlist from the industry category members.',
          options: ctx.industryOptions,
        },
        {
          key: 'category', type: 'select', label: 'Category',
          description: 'Resolved to a company-id allowlist from the category members.',
          options: ctx.categoryOptions,
        },
      ],
    },
  ];
}
