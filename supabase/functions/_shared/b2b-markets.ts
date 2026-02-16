/**
 * B2B Supported Markets Configuration
 *
 * 30 markets across 5 regions, used by both agent-chat and flow-engine
 * for multi-region parallel manufacturer search with native language support.
 */

export interface MarketInfo {
  code: string;      // ISO language code
  country: string;   // English country name
  language: string;  // Native language name
}

export interface RegionConfig {
  id: string;
  name: string;
  markets: MarketInfo[];
}

export const SUPPORTED_MARKETS: RegionConfig[] = [
  {
    id: 'cee',
    name: 'Central & Eastern Europe',
    markets: [
      { code: 'pl', country: 'Poland', language: 'Polish' },
      { code: 'cs', country: 'Czech Republic', language: 'Czech' },
      { code: 'sk', country: 'Slovakia', language: 'Slovak' },
      { code: 'hu', country: 'Hungary', language: 'Hungarian' },
      { code: 'ro', country: 'Romania', language: 'Romanian' },
      { code: 'bg', country: 'Bulgaria', language: 'Bulgarian' },
      { code: 'uk', country: 'Ukraine', language: 'Ukrainian' },
    ],
  },
  {
    id: 'balkans',
    name: 'Balkans & Turkey',
    markets: [
      { code: 'tr', country: 'Turkey', language: 'Turkish' },
      { code: 'sr', country: 'Serbia', language: 'Serbian' },
      { code: 'hr', country: 'Croatia', language: 'Croatian' },
      { code: 'sl', country: 'Slovenia', language: 'Slovenian' },
      { code: 'bs', country: 'Bosnia and Herzegovina', language: 'Bosnian' },
      { code: 'mk', country: 'North Macedonia', language: 'Macedonian' },
      { code: 'sq', country: 'Albania', language: 'Albanian' },
      { code: 'el', country: 'Greece', language: 'Greek' },
    ],
  },
  {
    id: 'baltic_nordic',
    name: 'Baltic & Nordic',
    markets: [
      { code: 'lt', country: 'Lithuania', language: 'Lithuanian' },
      { code: 'lv', country: 'Latvia', language: 'Latvian' },
      { code: 'et', country: 'Estonia', language: 'Estonian' },
      { code: 'fi', country: 'Finland', language: 'Finnish' },
      { code: 'da', country: 'Denmark', language: 'Danish' },
    ],
  },
  {
    id: 'western_southern',
    name: 'Western & Southern Europe',
    markets: [
      { code: 'de', country: 'Germany', language: 'German' },
      { code: 'nl', country: 'Netherlands', language: 'Dutch' },
      { code: 'fr', country: 'France', language: 'French' },
      { code: 'es', country: 'Spain', language: 'Spanish' },
      { code: 'it', country: 'Italy', language: 'Italian' },
      { code: 'pt', country: 'Portugal', language: 'Portuguese' },
      { code: 'en', country: 'United Kingdom', language: 'English' },
    ],
  },
  {
    id: 'global',
    name: 'Global Manufacturing Hubs',
    markets: [
      { code: 'zh', country: 'China', language: 'Chinese' },
      { code: 'hi', country: 'India', language: 'Hindi' },
      { code: 'ar', country: 'Morocco', language: 'Arabic' },
    ],
  },
];

/** Flat array of all 30 markets */
export const ALL_MARKETS: MarketInfo[] = SUPPORTED_MARKETS.flatMap(r => r.markets);

/** Find a market by language code */
export function getMarketByCode(code: string): MarketInfo | undefined {
  return ALL_MARKETS.find(m => m.code === code);
}

/** Find a market by country name (case-insensitive partial match) */
export function findMarketByCountry(countryName: string): MarketInfo | undefined {
  const lower = countryName.toLowerCase();
  return ALL_MARKETS.find(m => m.country.toLowerCase().includes(lower));
}

/** Find the region containing a country name */
export function findRegionByCountry(countryName: string): RegionConfig | undefined {
  const lower = countryName.toLowerCase();
  return SUPPORTED_MARKETS.find(r =>
    r.markets.some(m => m.country.toLowerCase().includes(lower))
  );
}

/** Find a region by its ID */
export function getRegionById(regionId: string): RegionConfig | undefined {
  return SUPPORTED_MARKETS.find(r => r.id === regionId);
}

/** Build a regional search query for Perplexity */
export function buildRegionalQuery(region: RegionConfig, category: string, limitPerRegion: number): string {
  const countryList = region.markets.map(m => m.country).join(', ');
  const languageHints = region.markets
    .filter(m => m.language !== 'English')
    .map(m => `"${category}" in ${m.language}`)
    .join(', ');

  return `Find B2B manufacturers of ${category} across these countries: ${countryList}.

I need actual manufacturing companies (not distributors or retailers) that:
- Have their own production facilities
- Offer wholesale/B2B sales
- Preferably offer OEM/private label services
- Export capabilities preferred

For each manufacturer found, provide:
- Company name
- Country
- Website URL
- City/location
- Main products they manufacture
- Any indicators they are actual manufacturers (factory, production facility, etc.)

IMPORTANT: Search in BOTH English AND native languages for better coverage.
Native search terms: ${languageHints || 'English only'}.

Return up to ${limitPerRegion} manufacturers total across all countries in this region.
Group results by country.`;
}

/** Build a single-country search query for Perplexity */
export function buildSingleCountryQuery(market: MarketInfo, category: string, limit: number): string {
  const langHint = market.language !== 'English'
    ? `\nSearch in BOTH English AND ${market.language} language sources for better coverage of local manufacturers.`
    : '';

  return `Find B2B manufacturers of ${category} in ${market.country}.
I need actual manufacturing companies (not distributors or retailers) that:
- Have their own production facilities
- Offer wholesale/B2B sales
- Preferably offer OEM/private label services
- Export capabilities preferred

For each manufacturer found, provide:
- Company name
- Website URL
- City/location
- Main products they manufacture
- Any indicators they are actual manufacturers (factory, production facility, etc.)
${langHint}
Return up to ${limit} manufacturers.`;
}