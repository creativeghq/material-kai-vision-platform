/**
 * The CRM list filters offer categories as FACETS, not as a catalogue.
 *
 * The bug this pins: `?tab=companies` → Filters → Membership → Category listed every
 * non-industry category — access roles, HR employment, lead status, lead source — none of
 * which can hold a company at all (`crm_resync_auto_category_members` fills `role` with
 * platform users and `employment` with contacts). The only ones that matched were the
 * professional-type "Suppliers" category, restating the Relationship filter one group up
 * with a fraction of its rows. Picking any of the rest returned an empty table with no
 * explanation.
 *
 * Two rules, both easy to undo by "just passing all the categories in":
 *   1. A filter option must be able to narrow the list it is offered on.
 *   2. A category whose membership is DERIVED is never offered for hand assignment.
 */
import { describe, it, expect } from 'vitest';

import { categoryFacetOptions, type CategoryFacetRow } from '../../src/modules/crm/pages/crmFilters';
import { AUTO_CATEGORY_KINDS, isHandAssignableKind, type CrmCategoryKind } from '../../src/services/crmCategoryKinds';

const cat = (
  id: string,
  kind: CrmCategoryKind,
  counts: { user?: number; contact?: number; company?: number } = {},
  is_active = true,
): CategoryFacetRow => ({
  id,
  name: `${kind}:${id}`,
  kind,
  is_active,
  user_count: counts.user ?? 0,
  contact_count: counts.contact ?? 0,
  company_count: counts.company ?? 0,
});

/** A slice of the real vocabulary: what /admin/crm actually held when this was found. */
const CATEGORIES: CategoryFacetRow[] = [
  cat('tiles', 'industry', { company: 6 }),
  cat('lighting', 'industry', { company: 8 }),
  cat('empty-industry', 'industry'),
  cat('suppliers', 'professional_type', { company: 3, user: 1 }),
  cat('architects', 'professional_type'),
  cat('sales-managers', 'role', { user: 4 }),
  cat('hr-active', 'employment', { contact: 2 }),
  cat('lead-new', 'lead_status'),
  cat('lead-website', 'lead_source'),
  cat('vip', 'manual', { contact: 5, company: 1 }),
];

const values = (opts: { value: string }[]) => opts.map((o) => o.value);

describe('categoryFacetOptions — an option must be able to narrow the list', () => {
  it('drops every category that holds no company from the companies list', () => {
    const opts = categoryFacetOptions(CATEGORIES, 'company');
    // role / employment / lead_* / empty categories can only ever return an empty table.
    expect(values(opts).sort()).toEqual(['lighting', 'suppliers', 'tiles', 'vip']);
  });

  it('drops every category that holds no contact from the contacts list', () => {
    const opts = categoryFacetOptions(CATEGORIES, 'contact');
    expect(values(opts).sort()).toEqual(['hr-active', 'vip']);
  });

  it('counts the entity being filtered, not the total membership', () => {
    // 'suppliers' holds 3 companies and 1 user — the companies list must show 3, not 4.
    const opt = categoryFacetOptions(CATEGORIES, 'company').find((o) => o.value === 'suppliers');
    expect(opt?.count).toBe(3);
  });

  it('never lists the same category under two fields on one tab', () => {
    // Industry has its own field, so the generic Category field must exclude that kind.
    const industry = categoryFacetOptions(CATEGORIES, 'company', { kindAllowed: (k) => k === 'industry' });
    const generic = categoryFacetOptions(CATEGORIES, 'company', { kindAllowed: (k) => k !== 'industry' });
    const overlap = values(industry).filter((v) => values(generic).includes(v));
    expect(overlap).toEqual([]);
  });

  it('hides inactive categories', () => {
    const withRetired = [...CATEGORIES, cat('retired', 'manual', { company: 4 }, false)];
    expect(values(categoryFacetOptions(withRetired, 'company'))).not.toContain('retired');
  });

  it('keeps the APPLIED value even after its last member leaves', () => {
    // Otherwise the filter goes on constraining the table with no checkbox left to untick.
    const opts = categoryFacetOptions(CATEGORIES, 'company', { keep: 'lead-new' });
    expect(values(opts)).toContain('lead-new');
    expect(categoryFacetOptions(CATEGORIES, 'company', { keep: 'lead-new' })
      .find((o) => o.value === 'lead-new')?.count).toBe(0);
  });
});

describe('isHandAssignableKind — derived membership is never typed by hand', () => {
  it('refuses the kinds crm_resync_auto_category_members owns', () => {
    // The resync only deletes rows it wrote (source='auto'), so a manual row here is permanent.
    for (const kind of AUTO_CATEGORY_KINDS) expect(isHandAssignableKind(kind)).toBe(false);
    expect([...AUTO_CATEGORY_KINDS].sort()).toEqual(['employment', 'role']);
  });

  it('allows the kinds an operator owns', () => {
    for (const kind of ['manual', 'industry', 'lead_status', 'lead_source', 'professional_type'] as const) {
      expect(isHandAssignableKind(kind)).toBe(true);
    }
  });
});
