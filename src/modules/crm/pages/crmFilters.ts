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
import type { CrmCategoryKind } from '@/services/crmCategoriesService';
import { humanizeLabel } from '@/utils/humanize';
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

/**
 * Category options for one list, as a FACET rather than a catalogue.
 *
 * A category is offered only when it currently holds a member of that entity kind — only when
 * ticking it can actually narrow this list — and the count rides along on the option so an
 * empty result is visible before the click.
 *
 * This is what the companies tab was getting wrong: it offered every non-industry category,
 * and most of them can never contain a company at all. `crm_resync_auto_category_members`
 * fills `role` categories with platform USERS and `employment` categories with CONTACTS, and
 * the lead_status / lead_source vocabulary only ever tags contacts. The handful that did match
 * were the "Suppliers" professional-type category — the same word as the Relationship filter
 * one group up, holding 3 of the 35 companies flagged `is_supplier`.
 *
 * `keep` is the value currently applied: an active filter must stay visible in the modal even
 * if its last member just left the category, or it goes on filtering the table with no
 * checkbox left to untick.
 */
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
//
// And no `professionOptions` — the shared five-value enum — for the same reason one step
// further in: on a COMPANY, `profession` does NOT hold that vocabulary. The ΑΑΔΕ enrichment
// writes the primary ΚΑΔ activity description into it ("ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ…"), and
// the server matches the column with `.eq`, so every option the enum offered matched zero
// rows, every time. The field below filters the same column on the values it actually holds,
// derived by the page from the company lookup.
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
