/** "Am I a business?" — one derivation, in SQL, and no TypeScript twin of it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EMPTY_BUSINESS, SOLO_IDENTITY, parseBusinessIdentity, toBusinessForm,
} from '@/components/core/Profile/businessIdentity';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** The shape `my_business_identity()` returns for the workspace that exposed this. */
const DERIVED_FROM_WORKSPACE = {
  entity_type: 'business',
  source: 'workspace',
  company_id: null,
  workspace_id: 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  identity: {
    name: 'MATERIALS BANK EE',
    vat_number: 'EL802349569',
    tax_office: 'D THESSALONIKIS',
    profession: 'Non-specialized wholesale trade services',
    phone: null,
    email: null,
    website: null,
    country: 'Greece',
    country_code: 'EL',
    city: 'THESSALONIKI',
    postal_code: '54352',
    street: 'DIMITRIOU CHARISI',
    street_number: '14',
    gemi_number: '174794504000',
  },
  invoicing: null,
  invoicing_workspace_id: 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  drift: [],
};

describe('parseBusinessIdentity', () => {
  it('reads a workspace-derived identity as a business', () => {
    const id = parseBusinessIdentity(DERIVED_FROM_WORKSPACE);
    expect(id.entityType).toBe('business');
    expect(id.source).toBe('workspace');
    expect(id.companyId).toBeNull();
    expect(id.identity?.name).toBe('MATERIALS BANK EE');
    expect(id.identity?.vat_number).toBe('EL802349569');
    expect(id.identity?.gemi_number).toBe('174794504000');
  });

  it('turns NULL fields into empty strings so the form can treat them all as text', () => {
    const id = parseBusinessIdentity(DERIVED_FROM_WORKSPACE);
    expect(id.identity?.phone).toBe('');
    expect(id.identity?.email).toBe('');
    // Every editable field is present — a partially-populated form silently drops the ones it lacks.
    expect(Object.keys(toBusinessForm(id.identity!)).sort()).toEqual(Object.keys(EMPTY_BUSINESS).sort());
  });

  it('falls back to solo for anything it cannot read, never a half-identity', () => {
    // A half-parsed identity is worse than none: it would render a company card with blanks where
    // the VAT number should be, which reads as "we have your details" and is a lie.
    expect(parseBusinessIdentity(null)).toEqual(SOLO_IDENTITY);
    expect(parseBusinessIdentity(undefined)).toEqual(SOLO_IDENTITY);
    expect(parseBusinessIdentity('nope')).toEqual(SOLO_IDENTITY);
    expect(parseBusinessIdentity({ entity_type: 'solo', identity: null })).toEqual(SOLO_IDENTITY);
    // entity_type says business but no identity came with it — still solo.
    expect(parseBusinessIdentity({ entity_type: 'business', identity: null })).toEqual(SOLO_IDENTITY);
  });

  it('keeps only drift keys that name a real field', () => {
    const id = parseBusinessIdentity({ ...DERIVED_FROM_WORKSPACE, drift: ['name', 'vat_number', 'nonsense', 7] });
    expect(id.drift).toEqual(['name', 'vat_number']);
  });

  it('ignores a source it does not recognise rather than trusting the string', () => {
    expect(parseBusinessIdentity({ ...DERIVED_FROM_WORKSPACE, source: 'whatever' }).source).toBeNull();
  });
});

describe('the projection stays in SQL', () => {
  const CLIENT_FILES = [
    'src/components/core/Profile/businessIdentity.ts',
    'src/components/core/Profile/BusinessSection.tsx',
  ];

  it('the profile card asks the database instead of reading finance_settings', () => {
    const card = read('src/components/core/Profile/BusinessSection.tsx');
    const mod = read('src/components/core/Profile/businessIdentity.ts');
    expect(mod).toContain('my_business_identity');
    expect(card).toContain('MY_BUSINESS_IDENTITY_RPC');
    // Reading the invoicing table straight from the card is how the second copy comes back.
    expect(card).not.toMatch(/from\(['"]finance_settings['"]\)\s*\n?\s*\.select/);
  });

  it('no client file re-derives the invoicing projection', () => {
    // These column names are the projection's inputs. Their presence in the client means somebody
    // has started mapping finance_settings by hand again — which is the whole defect, because the
    // two mappings then disagree about which language wins and whether GR or EL goes to VIES.
    const INPUTS = [
      'business_name_en',
      'business_tax_office_en',
      'business_profession_en',
      'business_address_en',
      'business_city_en',
      'business_country_en',
    ];
    for (const file of CLIENT_FILES) {
      const body = read(file);
      for (const column of INPUTS) {
        expect(body, `${file} re-derives the invoicing identity via ${column}`).not.toContain(column);
      }
    }
  });

  it('the apply card asks the same question the submit gate asks', () => {
    // Offering and enforcing are two doors onto one decision. When the card read
    // `user_profiles.entity_type` and the gate read the derivation, an operator whose workspace
    // invoices as a real company was told to "switch your account to a Business entity" by a card
    // sitting in front of a gate that would have let them through.
    const card = read('src/components/core/Profile/ApplyForRoleCard.tsx');
    expect(card).toContain('MY_BUSINESS_IDENTITY_RPC');
    expect(card).not.toMatch(/select\(['"][^'"]*entity_type/);
  });

  it('the role gate reads the derivation, not entity_type', () => {
    // The gate reading `entity_type` directly IS the bug: it is the copy that says "solo" for
    // everyone who declared their company in Finance, which is everyone who has ever invoiced.
    const gate = read('supabase/functions/role-upgrade-requests/index.ts');
    expect(gate).toContain('user_business_identity');
    expect(gate).not.toMatch(/profile\.entity_type\s*!==\s*['"]business['"]/);
  });
});
