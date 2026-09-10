/**
 * A company can be a vendor, a buyer, a landlord or a tenant — on the SCREEN, not just in the
 * schema (#376).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { partyColumns, partyRefOf } from '../../src/components/business/crm/partyRef';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const src = (p: string) => stripComments(read(p));

const PICKER = 'src/components/business/crm/PartySearchDropdown.tsx';
const PURE = 'src/components/business/crm/partyRef.ts';
const WORKBENCH = 'src/modules/real-estate/pages/PropertyWorkbench.tsx';
const API = 'supabase/functions/real-estate-api/index.ts';
const RBAC = 'supabase/functions/real-estate-api/rbac.ts';

/** The deal counterparties: the pairs a company must be able to occupy. */
const PAIRS: Array<[string, string]> = [
  ['vendor_company_id', 'vendor_contact_id'],
  ['tenant_company_id', 'tenant_contact_id'],
  ['landlord_company_id', 'landlord_contact_id'],
  ['buyer_company_id', 'buyer_contact_id'],
];

describe('#376 — a counterparty is one thing, and the pair moves together', () => {
  it('reads the stored pair, preferring neither', () => {
    expect(partyRefOf('c-1', null)).toEqual({ kind: 'company', id: 'c-1' });
    expect(partyRefOf(null, 'p-1')).toEqual({ kind: 'contact', id: 'p-1' });
    expect(partyRefOf(null, null)).toBeNull();
    expect(partyRefOf(undefined, undefined)).toBeNull();
  });

  it('writing one half NULLS the other', () => {
    // The whole point. Setting a company on a field that held a contact without clearing the
    // contact leaves both set, and `properties_vendor_one_party` rejects it with a raw 23514.
    expect(partyColumns('vendor_company_id', 'vendor_contact_id', { kind: 'company', id: 'c-1' }))
      .toEqual({ vendor_company_id: 'c-1', vendor_contact_id: null });
    expect(partyColumns('vendor_company_id', 'vendor_contact_id', { kind: 'contact', id: 'p-1' }))
      .toEqual({ vendor_company_id: null, vendor_contact_id: 'p-1' });
    // Clearing clears BOTH — a counterparty is legitimately optional.
    expect(partyColumns('vendor_company_id', 'vendor_contact_id', null))
      .toEqual({ vendor_company_id: null, vendor_contact_id: null });
  });

  it('the pair rules are free of the Supabase client, so they are testable directly', () => {
    // Not a style point: this test imports them. A helper that drags the client in can only be
    // grepped for, and a grep cannot tell you that `partyColumns` actually nulls the other half.
    const pure = src(PURE);
    expect(pure).not.toMatch(/from '@\/integrations\/supabase\/client'/);
    expect(pure).not.toMatch(/^import /m);
  });

  it('the picker searches both tables, through the folded column', () => {
    // A raw `ilike` on `name` is the accent-sensitive bug crmPartySearch.test.ts exists to keep
    // out: `Κώστας` would not find `ΚΩΣΤΑΣ`, and the operator concludes they are not in the system.
    const picker = src(PICKER);
    expect(picker).toMatch(/from\('crm_companies'\)/);
    expect(picker).toMatch(/from\('crm_contacts'\)/);
    expect((picker.match(/ilike\(CRM_SEARCH_COLUMN, foldedLike\(q\)\)/g) || []).length).toBe(2);
  });
});

describe('#376 — the deal counterparties can be a company end to end', () => {
  it('the workbench offers a party picker, not a contact-only one, on every deal field', () => {
    const wb = src(WORKBENCH);
    for (const [companyKey, contactKey] of PAIRS) {
      expect(wb, `${companyKey} is never written by the workbench`).toContain(companyKey);
      // The contact half must still be reachable — this widens the field, it does not replace it.
      expect(wb, `${contactKey} disappeared`).toContain(contactKey);
    }
    expect(wb).toMatch(/PartySearchDropdown/);
  });

  it('the property write allowlist carries the company half', () => {
    // `PROPERTY_WRITABLE` is what stops mass assignment, so a column absent from it is silently
    // dropped on every write — the picker appears to work and the column stays NULL forever.
    expect(src(RBAC)).toMatch(/'vendor_company_id'/);
  });

  it('the offer and tenancy writers accept the company half', () => {
    const api = src(API);
    expect(api).toMatch(/buyer_company_id: body\.buyer_company_id \?\? null/);
    expect(api).toMatch(/'tenant_company_id', 'landlord_contact_id', 'landlord_company_id'/);
    // A sale copies the vendor as the seller: copying only the contact half would make a company
    // vendor's sale sellerless.
    expect(api).toMatch(/seller_company_id: property\.vendor_company_id/);
    // …and the accepted offer must be SELECTED with the column, or the copy reads undefined.
    expect(api).toMatch(/select\('id, property_id, amount, currency, buyer_contact_id, buyer_company_id'\)/);
  });

  it('every company id from the request is proved to be ours', () => {
    // Invariant 1. An unchecked company id is the same cross-tenant read as an unchecked contact
    // id — the joined selects in these handlers return the counterparty's name and email.
    const api = src(API);
    expect(api).toMatch(/assertSameWorkspace\(supabase, 'crm_companies', body\.buyer_company_id, workspaceId, 'company'\)/);
    expect(api).toMatch(/assertSameWorkspace\(supabase, 'crm_companies', payload\.vendor_company_id[^)]*\)/);
    expect(api).toMatch(/assertAllSameWorkspace\(\s*supabase, 'crm_companies'/);
  });

  it('both halves at once are refused with a sentence, not a constraint code', () => {
    // The CHECK is the backstop and it raises 23514, which reaches the operator as
    // "new row violates check constraint property_offers_buyer_one_party". Naming it here is the
    // difference between a bug report and a fixable mistake.
    const api = src(API);
    expect(api).toMatch(/A buyer is either a company or a person, not both\./);
    expect(api).toMatch(/A tenant or landlord is either a company or a person, not both\./);
    expect(api).toMatch(/A vendor is either a company or a person, not both\./);
  });
});
