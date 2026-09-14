/**
 * Canonical VAT country list — keyed on the **VAT prefix letters**, not the
 * ISO-3166 country code. The two diverge for Greece: its ISO code is `GR` but
 * its VAT/VIES/ΑΑΔΕ prefix is `EL`. We store the VAT prefix so the value here
 * can be concatenated with the VAT number and used directly against VIES / ΑΑΔΕ
 * (e.g. `EL` + `123456789` → `EL123456789`).
 */
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
  // The countries we actually source from. Until 2026-09-14 the list stopped at the EU plus six,
  // so a Chinese, Indian, Turkish or Ukrainian supplier was stored with `country_code` set and
  // `country` NULL — country_ref() could not name it, and every surface that reads the name
  // rendered a blank. Nothing raises on a NULL country, which is why it survived a full CRM.
  { code: 'CN', name: 'China',           eu: false },
  { code: 'IN', name: 'India',           eu: false },
  { code: 'TR', name: 'Türkiye',         eu: false },
  { code: 'UA', name: 'Ukraine',         eu: false },
  { code: 'RS', name: 'Serbia',          eu: false },
  { code: 'AL', name: 'Albania',         eu: false },
  { code: 'MK', name: 'North Macedonia', eu: false },
  { code: 'BA', name: 'Bosnia and Herzegovina', eu: false },
  { code: 'MD', name: 'Moldova',         eu: false },
  { code: 'GE', name: 'Georgia',         eu: false },
  { code: 'IL', name: 'Israel',          eu: false },
  { code: 'AE', name: 'United Arab Emirates', eu: false },
  { code: 'SA', name: 'Saudi Arabia',    eu: false },
  { code: 'EG', name: 'Egypt',           eu: false },
  { code: 'MA', name: 'Morocco',         eu: false },
  { code: 'TN', name: 'Tunisia',         eu: false },
  { code: 'ZA', name: 'South Africa',    eu: false },
  { code: 'BR', name: 'Brazil',          eu: false },
  { code: 'MX', name: 'Mexico',          eu: false },
  { code: 'KR', name: 'South Korea',     eu: false },
  { code: 'TW', name: 'Taiwan',          eu: false },
  { code: 'HK', name: 'Hong Kong',       eu: false },
  { code: 'SG', name: 'Singapore',       eu: false },
  { code: 'MY', name: 'Malaysia',        eu: false },
  { code: 'TH', name: 'Thailand',        eu: false },
  { code: 'VN', name: 'Vietnam',         eu: false },
  { code: 'ID', name: 'Indonesia',       eu: false },
  { code: 'PK', name: 'Pakistan',        eu: false },
  { code: 'BD', name: 'Bangladesh',      eu: false },
  { code: 'NZ', name: 'New Zealand',     eu: false },
];

/**
 * ISO-3166 country code → the VAT prefix letters that belong on a VAT number.
 * The two agree everywhere except Greece: `GR` in an address, `EL` on the VAT
 * number.
 */
export const toVatPrefix = (code: string | null | undefined): string => {
  const u = (code ?? '').trim().toUpperCase();
  return u === 'GR' ? 'EL' : u;
};
