/** Filter definitions for the three CRM list tabs. */
import { Building2, Tags, User } from 'lucide-react';
import type { FilterGroupDef, FilterOption } from '@/components/core/filters';
import type { CrmCategoryKind } from '@/services/crmCategoriesService';
import { humanizeLabel } from '@/utils/humanize';
import { LIFECYCLE_STAGE_OPTIONS } from '@/modules/crm/crmConstants';
import { CLIENT_SUPPLIER_OPTIONS, PROFESSIONAL_TYPE_OPTIONS, STATUS_OPTIONS } from '../crmConstants';

const professionOptions = PROFESSIONAL_TYPE_OPTIONS as FilterOption[];
const statusOptions = STATUS_OPTIONS as FilterOption[];
const kindOptions = CLIENT_SUPPLIER_OPTIONS as FilterOption[];

/** The three lists a category can narrow, and the `crm_categories_summary` count that says so. */
export type CategoryFacetEntity = 'company' | 'contact' | 'user';

/** The `crm_categories_summary` shape this module needs — nothing more. */
export interface CategoryFacetRow {
  id: string;
  name: string;
  kind: CrmCategoryKind;
  is_active: boolean;
  user_count: number;
  contact_count: number;
  company_count: number;
}

const FACET_COUNT: Record<CategoryFacetEntity, (c: CategoryFacetRow) => number> = {
  company: (c) => c.company_count,
  contact: (c) => c.contact_count,
  user: (c) => c.user_count,
};

/** Category options for one list, as a FACET rather than a catalogue. */
export function categoryFacetOptions(
  categories: CategoryFacetRow[],
  entity: CategoryFacetEntity,
  opts: { kindAllowed?: (kind: CrmCategoryKind) => boolean; keep?: string } = {},
): FilterOption[] {
  const countOf = FACET_COUNT[entity];
  const kindAllowed = opts.kindAllowed ?? (() => true);
  return categories
    .filter((c) => c.id === opts.keep || (c.is_active && kindAllowed(c.kind) && countOf(c) > 0))
    .map((c) => ({ value: c.id, label: c.name, count: countOf(c), hint: humanizeLabel(c.kind) }));
}

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

/**
 * Membership options are FACETS, not a catalogue — the page passes only categories that
 * currently hold a member of this entity kind (see `categoryOptionsFor` in CRMPage). A
 * dimension that already has its own field on the tab is never repeated here: two controls
 * carrying the same vocabulary AND together, so "Suppliers" picked in both could return
 * fewer rows than either one alone.
 */
export function buildContactFilters(ctx: {
  categoryOptions: FilterOption[];
  companyNameOptions: FilterOption[];
}): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: User,
      fields: [
        { key: 'q', type: 'text', label: 'Search', placeholder: 'Search contacts…' },
        // No professional-type field: `crm_contacts.profession` is the FISCAL activity —
        // `partyFromCrm` puts it on the invoice as "Δραστηριότητα" — not an app segmentation
        // enum, so matching it `.eq` against the five-value vocabulary can only ever return
        // nothing. Segmentation lives in `contact_group`, the categories, and is_client/
        // is_supplier. Filtering contacts BY activity wants a free-text server-side ilike,
        // which the list endpoint does not offer yet — better absent than inert.
        { key: 'status', type: 'select', label: 'Status', options: statusOptions },
        // Server-backed (crm-api applies .eq on lifecycle_stage) — the rule in this file is
        // that a filter with no server support is worse than absent.
        {
          key: 'lifecycle_stage', type: 'select', label: 'Lifecycle stage',
          description: 'Funnel position: subscriber → lead → MQL → SQL → opportunity → customer.',
          options: LIFECYCLE_STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
        },
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
  professionOptions: FilterOption[];
}): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: Building2,
      fields: [
        { key: 'q', type: 'text', label: 'Search', placeholder: 'Search companies…' },
        {
          key: 'profession', type: 'select', label: 'Business activity',
          description: 'The ΑΑΔΕ activity (ΚΑΔ) recorded on the company.',
          options: ctx.professionOptions,
        },
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
