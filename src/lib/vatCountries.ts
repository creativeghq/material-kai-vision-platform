/** Canonical VAT country list — keyed on the **VAT prefix letters**, not the
 * ISO-3166 country code. The two diverge for Greece: its ISO code is `GR` but
 * its VAT/VIES/ΑΑΔΕ prefix is `EL`. We store the VAT prefix so the value here
 * can be concatenated with the VAT number and used directly against VIES / ΑΑΔΕ
 * (e.g. `EL` + `123456789` → `EL123456789`).
 *
 * Covers EU + EEA + UK + CH + the handful of non-EU countries we see on the
 * platform. Shared by every Tax & VAT surface (Business profile, CRM contact,
 * CRM company) so the option set + the Greece `EL≠GR` rule live in one place. */
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
