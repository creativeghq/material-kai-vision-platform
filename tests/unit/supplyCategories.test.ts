import { describe, expect, it } from 'vitest';

import { blankedSource } from '../helpers/sourceIndex';

const PICKER = 'src/components/business/crm/SupplyCategorySelect.tsx';
const SERVICE = 'src/services/crmCategoriesService.ts';
const INDUSTRY = 'src/components/business/crm/IndustrySelect.tsx';
const ASSIGNMENT = 'src/components/business/catalogs/CategoryAssignmentPicker.tsx';
const CONTACT_PAGE = 'src/modules/crm/pages/ContactDetailPage.tsx';
const COMPANY_PAGE = 'src/modules/crm/pages/CompanyDetailPage.tsx';

const code = blankedSource;

describe('the supply vocabulary comes from the product-import registry', () => {
  it('the picker names no product category of its own', () => {
    const body = code(PICKER);
    for (const name of ['Tiles', 'Lighting', 'Sanitary', 'Appliances', 'Kitchen', 'Furniture']) {
      expect(body, `${PICKER} hardcodes the product category "${name}"`).not.toContain(`'${name}'`);
      expect(body).not.toContain(`"${name}"`);
    }
  });

  it('the options are read through the service, not assembled in the component', () => {
    expect(code(PICKER)).toContain('crmCategoriesService.listSupplyCategories()');
  });

  it('the service reads material_categories for the vocabulary and the match', () => {
    const body = code(SERVICE);
    expect(body).toContain("from('material_categories')");
    expect(body).toContain('material_category_id');
  });
});

describe('the industry scope has one writer per surface and cannot clobber other lists', () => {
  it('every picker reconciles WITHIN its own scope — a full replace would delete what the picker beside it just wrote', () => {
    for (const p of [PICKER, INDUSTRY, ASSIGNMENT]) {
      const body = code(p);
      expect(body, `${p} writes with the replace-everything setter`)
        .not.toMatch(/setMembershipsFor(Contact|Company)\(/);
      expect(body).toMatch(/set(Company|Contact)MembershipsWithinScope\(/);
    }
  });

  it('every company-side writer of the industry scope also refreshes the denormalized label', () => {
    let checked = 0;
    for (const p of [PICKER, INDUSTRY]) {
      const body = code(p);
      if (!/setCompanyMembershipsWithinScope\(/.test(body)) continue;
      checked += 1;
      expect(body, `${p} updates company industry memberships without refreshing crm_companies.industry`)
        .toContain('companiesAPI.updateCompany(');
    }
    expect(checked, 'no company-side industry writer was found to check').toBe(2);
  });
});

describe('the picker is mounted where the ask was', () => {
  it('both CRM detail pages render it', () => {
    for (const p of [CONTACT_PAGE, COMPANY_PAGE]) {
      expect(code(p), `${p} does not mount SupplyCategorySelect`).toContain('<SupplyCategorySelect');
    }
  });
});

describe('a failed read never reads as an empty selection', () => {
  it('the within-scope reconcile binds its read error — an empty `existing` re-inserts everything and deletes nothing', () => {
    const body = code(SERVICE);
    const fn = body.slice(body.indexOf('private async setMembershipsWithinScope'));
    const head = fn.slice(0, fn.indexOf('const existingIds'));
    expect(head).toContain('if (readError) throw readError;');
  });
});
