/** Canonical VAT country list — keyed on the **VAT prefix letters**, not the
 * ISO-3166 country code. The two diverge for Greece: its ISO code is `GR` but
 * its VAT/VIES/ΑΑΔΕ prefix is `EL`. We store the VAT prefix so the value here
 * can be concatenated with the VAT number and used directly against VIES / ΑΑΔΕ
 * (e.g. `EL` + `123456789` → `EL123456789`).
 *
 * Covers EU + EEA + UK + CH + the handful of non-EU countries we see on the
 * platform. Shared by every Tax & VAT surface (Business profile, CRM contact,
 * CRM company) so the option set + the Greece `EL≠GR` rule live in one place.
 *
 * This list is the DROPDOWN source. The country-name → code DERIVATION lives in
 * SQL (`public.country_ref()`, applied by the `crm_normalize_country` BEFORE-write
 * trigger on crm_companies / crm_contacts / crm_address_units) so that the
 * XML importer, ΑΑΔΕ / VIES writers and the agent tools — which never load this
 * file — get the same answer. Deliberately not duplicated here: a second copy of
 * the mapping is a drift surface, and `crm.country_code_mismatch` in the
 * data-integrity registry watches for country/code disagreement.
 * **Adding a country means editing BOTH this list and `public.country_ref()`.** */
export interface VatCountryOption {
  /** VAT prefix letters (alpha-2, but `EL` for Greece). */
  code: string;
  name: string;
  eu: boolean;
}

export const VAT_COUNTRY_OPTIONS: VatCountryOption[] = [
  { code: 'EL', name: 'Greece',          eu: true  },
  { code: 'AT', name: 'Austria',         eu: true  },
  { code: 'BE', name: 'Belgium',         eu: true  },
  { code: 'BG', name: 'Bulgaria',        eu: true  },
  { code: 'HR', name: 'Croatia',         eu: true  },
  { code: 'CY', name: 'Cyprus',          eu: true  },
  { code: 'CZ', name: 'Czech Republic',  eu: true  },
  { code: 'DK', name: 'Denmark',         eu: true  },
  { code: 'EE', name: 'Estonia',         eu: true  },
  { code: 'FI', name: 'Finland',         eu: true  },
  { code: 'FR', name: 'France',          eu: true  },
  { code: 'DE', name: 'Germany',         eu: true  },
  { code: 'HU', name: 'Hungary',         eu: true  },
  { code: 'IE', name: 'Ireland',         eu: true  },
  { code: 'IT', name: 'Italy',           eu: true  },
  { code: 'LV', name: 'Latvia',          eu: true  },
  { code: 'LT', name: 'Lithuania',       eu: true  },
  { code: 'LU', name: 'Luxembourg',      eu: true  },
  { code: 'MT', name: 'Malta',           eu: true  },
  { code: 'NL', name: 'Netherlands',     eu: true  },
  { code: 'PL', name: 'Poland',          eu: true  },
  { code: 'PT', name: 'Portugal',        eu: true  },
  { code: 'RO', name: 'Romania',         eu: true  },
  { code: 'SK', name: 'Slovakia',        eu: true  },
  { code: 'SI', name: 'Slovenia',        eu: true  },
  { code: 'ES', name: 'Spain',           eu: true  },
  { code: 'SE', name: 'Sweden',          eu: true  },
  { code: 'GB', name: 'United Kingdom',  eu: false },
  { code: 'CH', name: 'Switzerland',     eu: false },
  { code: 'NO', name: 'Norway',          eu: false },
  { code: 'IS', name: 'Iceland',         eu: false },
  { code: 'US', name: 'United States',   eu: false },
  { code: 'CA', name: 'Canada',          eu: false },
  { code: 'AU', name: 'Australia',       eu: false },
  { code: 'JP', name: 'Japan',           eu: false },
];

/**
 * ISO-3166 country code → the VAT prefix letters that belong on a VAT number.
 * The two agree everywhere except Greece: `GR` in an address, `EL` on the VAT
 * number. A value that is already a VAT prefix passes through unchanged, so
 * this is safe to apply to a field whose convention you are not sure of —
 * which is the whole point, because `finance_settings.business_country_code`
 * stores the ISO code while `crm_companies.country_code` stores the prefix,
 * and a `GR` fed to VIES validates nothing and reports no error either.
 *
 * SQL keeps its own twin, `public._vat_prefix(text)`, because the invoicing-identity
 * projection runs there and cannot call this. One rule, two runtimes — change both.
 */
export const toVatPrefix = (code: string | null | undefined): string => {
  const u = (code ?? '').trim().toUpperCase();
  return u === 'GR' ? 'EL' : u;
};
