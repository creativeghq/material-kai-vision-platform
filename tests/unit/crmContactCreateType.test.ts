/** A create chip that lands on a list, and a form that opens with no role picked, fail the same way: the click "worked" and the record is wrong. */
import { describe, it, expect } from 'vitest';
import { posix, strippedSource, sourceIndex } from '../helpers/sourceIndex';
import { LAUNCHER_ACTIONS } from '@/config/launcher-sections';
import { CONTACT_TYPE_OPTIONS, NEW_PARTY_KINDS } from '@/modules/crm/contactType';

const CRM_PAGE = 'src/modules/crm/pages/CRMPage.tsx';
const CONTACT_PAGE = 'src/modules/crm/pages/ContactDetailPage.tsx';
const MODAL = 'src/modules/crm/components/AddPartyModal.tsx';
const INDEX = sourceIndex({ roots: ['src'] });

describe('launcher create actions', () => {
  it('every ?new= value is acted on where it is read', () => {
    const windows = INDEX.stripped().flatMap(([, src]) =>
      [...src.matchAll(/get\(\s*['"]new['"]\s*\)/g)].map((m) => src.slice(m.index!, m.index! + 400)));
    const inert: string[] = [];
    for (const [id, actions] of Object.entries(LAUNCHER_ACTIONS)) {
      for (const a of actions) {
        const value = new URLSearchParams(a.to.split('?')[1] ?? '').get('new');
        if (!value) continue;
        if (!windows.some((w) => w.includes(`'${value}'`) || w.includes(`"${value}"`))) {
          inert.push(`${id} → "${a.label}" (${a.to}): no page acts on new=${value}`);
        }
      }
    }
    expect(inert, inert.join('\n')).toEqual([]);
  });
});

describe('one picker asks what kind of party', () => {
  it('nothing but the modal reaches either blank form', () => {
    expect(strippedSource(CRM_PAGE)).toContain('AddPartyModal');
    for (const route of ['/crm/contacts/new', '/crm/companies/new']) {
      const bypass = INDEX.stripped()
        .filter(([, src]) => new RegExp(`['"\`]${route}['"\`]`).test(src))
        .map(([file]) => posix(file))
        .filter((f) => f !== MODAL);
      expect(bypass, `these skip the type question the modal exists to ask: ${bypass.join(', ')}`).toEqual([]);
    }
  });

  it('the twin pickers are gone, not merely unused', () => {
    const twins = INDEX.stripped()
      .map(([file]) => posix(file))
      .filter((f) => /components\/Add(Contact|Company)Modal\.tsx$/.test(f));
    expect(twins, `a second party picker is back: ${twins.join(', ')}`).toEqual([]);
  });

  it('the form seeds itself from the choice', () => {
    expect(strippedSource(CONTACT_PAGE)).toMatch(/location\.state[\s\S]{0,120}prefill/);
    expect(strippedSource(MODAL)).toMatch(/state:\s*\{\s*prefill/);
  });

  it('every kind states both the side of the trade and the VAT treatment', () => {
    const legal = new Set<string | null>([...CONTACT_TYPE_OPTIONS.map((o) => o.value), null]);
    for (const kind of NEW_PARTY_KINDS) {
      expect(kind.contactPrefill.is_client, `${kind.id} leaves is_client unset`).toBeTypeOf('boolean');
      expect(kind.contactPrefill.is_supplier, `${kind.id} leaves is_supplier unset`).toBeTypeOf('boolean');
      expect(legal.has(kind.contactPrefill.contact_type ?? null), `${kind.id}: ${kind.contactPrefill.contact_type}`).toBe(true);
    }
    const invoiced = NEW_PARTY_KINDS.filter((k) => k.contactPrefill.contact_type === 'company');
    expect(invoiced.length, 'no kind produces a contact that can be invoiced as a business').toBeGreaterThan(0);
  });

  it('every business kind runs the registry lookup and names both roles', () => {
    const business = NEW_PARTY_KINDS.filter((k) => k.group === 'business');
    expect(business.length, 'no kind creates a business').toBeGreaterThan(0);
    for (const kind of business) {
      expect(kind.entity, `${kind.id} is a business that writes a contact row`).toBe('company');
      expect(kind.companyRoles?.is_customer, `${kind.id} leaves is_customer unset`).toBeTypeOf('boolean');
      expect(kind.companyRoles?.is_supplier, `${kind.id} leaves is_supplier unset`).toBeTypeOf('boolean');
    }
    const body = strippedSource(MODAL);
    expect(body).toContain('CompanyIdentityLookup');
    expect(body, 'a company is created without the identity payload derivation').toContain('companyIdentityPayload');
  });

  it('the sole-trader route keeps the resolved identity', () => {
    const body = strippedSource(MODAL);
    const route = body.slice(body.indexOf('createSoleTrader'));
    expect(route).toContain('/crm/contacts/new');
    expect(route).toContain('vat_number');
    expect(route, 'company-only columns would be sprayed onto a contact insert').toContain('narrowToContactFields');
  });
});
