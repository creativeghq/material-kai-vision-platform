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

/**
 * The single normalised form of a VAT number, for dedupe reads (#353 CRM-4).
 *
 * This replaced `vatDedupeForms`, which produced a LIST of spellings a row might be stored
 * under — the raw string, the digits, and `EL` + digits — and matched them against the raw
 * `vat_number` column. Enumerating what a human might type is unbounded, and it missed the
 * ordinary case: a row saved as `GR 800 370 260` is none of the three, so a user typing
 * `800370260` was told there was no duplicate and created the business a second time.
 *
 * Both sides are normalised instead. The stored side is the generated `vat_norm` column
 * (`public.crm_vat_norm`); this is its client twin, pinned by
 * `tests/unit/companyIdentity.test.ts` against vectors captured from the live database.
 *
 * THE GREEK PREFIX IS DROPPED; OTHERS ARE KEPT. `EL` is the EU VAT prefix for Greece and `GR`
 * the ISO country code, and Greek documents use both interchangeably — myDATA sends bare
 * digits, an invoice header carries `EL`, an operator types `GR`. One number, three spellings.
 * For every other country the prefix stays: `DE123456789` and `FR123456789` are different
 * taxpayers and stripping to digits would collide them. `country_code` carries the country.
 */
export const normalizeVat = (vat: string | null | undefined): string | null => {
  const compact = (vat ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // The digit lookahead is what stops a name like "GREECE" losing its first two letters.
  return compact.replace(/^(EL|GR)(?=[0-9])/, '') || null;
};

/** The column `normalizeVat` is matched against. Same name on both CRM tables. */
export const CRM_VAT_COLUMN = 'vat_norm';
