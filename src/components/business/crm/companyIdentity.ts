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

/**
 * The `crm_companies` payload a draft implies.
 *
 * Three rules, each of which was a bug somewhere before this was shared:
 *  1. The TYPED name wins over the registry one — the operator saw both and left what they left.
 *  2. `is_supplier` / `is_customer` are the CALLER's answer and are always written explicitly.
 *     Both columns default to false, but the crm-api POST applies a "stated no role at all → it
 *     is a customer" convention, so a supplier created without naming its flags still lands as a
 *     customer — and then shows up in customer pickers, AR statements and the receivables aging
 *     for a company we only ever buy from. Naming both flags is what opts out of that guess.
 *     (The convention used to be a column DEFAULT TRUE on is_customer; it moved into the handler
 *     because only a request can be inspected for whether it stated a role.)
 *  3. The country code is only written when it was actually ANSWERED. `countryCode` selects which
 *     registry to ask — it is not a statement about where the business is — and it defaults to
 *     'EL'. Writing it unconditionally stamped every by-name create as Greek, which is a fact
 *     nobody supplied, on a column that drives VAT treatment and VIES eligibility. So: what a
 *     lookup resolved, else the selected country but ONLY if a VAT number was entered alongside
 *     it, else nothing. Stored upper-case — `vat_number` prefixes assume it.
 */
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
