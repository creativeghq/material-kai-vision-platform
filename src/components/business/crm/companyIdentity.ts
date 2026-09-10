// The pure half of the shared "who is this business?" control — the draft shape and the two
// derivations that turn it into a DB payload or a dedupe probe.
//
// Split out of CompanyIdentityLookup.tsx so it can be unit-tested: that file imports React, the
// toast hook, the workspace context and the supabase client, none of which load in the node test
// environment. The rules pinned in tests/unit/companyIdentity.test.ts live HERE.

export interface CompanyIdentityVerification {
  name: string | null;
  address: string | null;
  source: 'aade' | 'vies';
  gemiNumber?: string | null;
}

/** The whole state of the lookup control — one object so callers hold one `useState`. */
export interface CompanyIdentityDraft {
  name: string;
  countryCode: string;
  vatNumber: string;
  /** Column patch resolved from the registries / web research. Ready to write or to prefill. */
  fields: Record<string, any>;
  verified: CompanyIdentityVerification | null;
}

export const emptyCompanyIdentity = (
  init: Partial<CompanyIdentityDraft> = {},
): CompanyIdentityDraft => ({
  name: '',
  countryCode: 'EL',
  vatNumber: '',
  fields: {},
  verified: null,
  ...init,
});

/** The `crm_companies` payload a draft implies. */
export const companyIdentityPayload = (
  d: CompanyIdentityDraft,
  roles: { is_supplier?: boolean; is_customer?: boolean } = {},
): Record<string, any> => {
  const trimmedName = d.name.trim();
  const vat = d.vatNumber.trim();
  const selected = d.countryCode.trim().toUpperCase();
  return {
    ...d.fields,
    name: trimmedName || d.fields.name || vat,
    vat_number: vat || d.fields.vat_number || null,
    country_code: d.fields.country_code ?? (vat && selected ? selected : null),
    ...roles,
  };
};

// The VAT normaliser lives in an import-free module so it can be byte-mirrored to Deno
// (the validation receipt is written by one edge function and read by another, #353 CRM-7).
// Re-exported here so every existing import site keeps working.
export { normalizeVat, CRM_VAT_COLUMN } from '@/services/crm/vatNormalize';
