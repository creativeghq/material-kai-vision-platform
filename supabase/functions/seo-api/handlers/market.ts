/** Search market = DataForSEO location code + content language, by ISO country. Import-free. */

const MARKETS: Record<string, { location: number; language: string }> = {
  US: { location: 2840, language: 'en' }, GB: { location: 2826, language: 'en' },
  DE: { location: 2276, language: 'de' }, FR: { location: 2250, language: 'fr' },
  IT: { location: 2380, language: 'it' }, ES: { location: 2724, language: 'es' },
  GR: { location: 2300, language: 'el' }, NL: { location: 2528, language: 'nl' },
  BE: { location: 2056, language: 'nl' }, AT: { location: 2040, language: 'de' },
  CH: { location: 2756, language: 'de' }, PT: { location: 2620, language: 'pt' },
  IE: { location: 2372, language: 'en' }, CA: { location: 2124, language: 'en' },
  AU: { location: 2036, language: 'en' }, PL: { location: 2616, language: 'pl' },
  SE: { location: 2752, language: 'sv' }, DK: { location: 2208, language: 'da' },
  NO: { location: 2578, language: 'no' }, FI: { location: 2246, language: 'fi' },
  TR: { location: 2792, language: 'tr' }, BG: { location: 2100, language: 'bg' },
  RO: { location: 2642, language: 'ro' }, CY: { location: 2196, language: 'el' },
};

/** VAT-style codes that are not ISO-3166 (a Greek party row stores EL). */
const ALIASES: Record<string, string> = { EL: 'GR', UK: 'GB' };

export function marketForCountry(code: string | null | undefined): { location_code: number; language_code: string } | null {
  const iso = String(code ?? '').trim().toUpperCase();
  const m = MARKETS[ALIASES[iso] ?? iso];
  return m ? { location_code: m.location, language_code: m.language } : null;
}

/** ISO country for a DataForSEO location code, or null — never a default market. */
export function countryForLocation(location: number): string | null {
  return Object.entries(MARKETS).find(([, m]) => m.location === location)?.[0] ?? null;
}
