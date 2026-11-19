// The pure half of the shared "who is this business?" control — the draft shape and the two
// derivations that turn it into a DB payload or a dedupe probe.
//
// Split out of CompanyIdentityLookup.tsx so it can be unit-tested: that file imports React, the
// toast hook, the workspace context and the supabase client, none of which load in the node test
// environment. The rules pinned in tests/unit/companyIdentity.test.ts live HERE.

import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';

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

/** Text typed into a party search, routed to the field it belongs in. A bare 9-digit ΑΦΜ (or
 *  `EL`/`GR` + 9 digits) is Greek; a known VAT prefix followed by a mostly-numeric body is that
 *  country's VAT. Anything else is a name — a number-ish name must never be swallowed as a VAT. */
export const splitPartyQuery = (
  raw: string | null | undefined,
): { name: string; vatNumber: string; countryCode: string | null } => {
  const text = (raw ?? '').trim();
  const compact = text.replace(/[\s.\-/]/g, '').toUpperCase();
  const greek = /^(?:EL|GR)?(\d{9})$/.exec(compact);
  if (greek) return { name: '', vatNumber: greek[1], countryCode: 'EL' };
  const prefixed = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(compact);
  if (prefixed && VAT_COUNTRY_OPTIONS.some((o) => o.code === prefixed[1])) {
    const body = prefixed[2];
    const digits = body.replace(/\D/g, '').length;
    if (digits >= 6 && digits / body.length >= 0.6) {
      return { name: '', vatNumber: body, countryCode: prefixed[1] };
    }
  }
  return { name: text, vatNumber: '', countryCode: null };
};

// The VAT normaliser lives in an import-free module so it can be byte-mirrored to Deno
// (the validation receipt is written by one edge function and read by another, #353 CRM-7).
// Re-exported here so every existing import site keeps working.
export { normalizeVat, CRM_VAT_COLUMN } from '@/services/crm/vatNormalize';
