/** The search market an SEO call runs in: `website_ai_market()` first, then the business country, else a stated refusal. */

import { countryForLocation, marketForCountry } from '../seo-api/handlers/market.ts';

export type SeoMarket = {
  country_code: string;
  language_code: string;
  location_code: number | null;
  source: string;
  note: string;
};

export type SeoMarketResult = { ok: true; market: SeoMarket } | { ok: false; reason: string };

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args: Record<string, unknown>) => any; from: (t: string) => any };

export async function resolveSeoMarket(
  db: Db,
  opts: { websiteId: string | null; workspaceId: string | null },
): Promise<SeoMarketResult> {
  let reason = 'No website is connected, so no market can be read from its tracked keywords.';
  if (opts.websiteId) {
    const { data, error } = await db.rpc('website_ai_market', { p_website_id: opts.websiteId });
    if (error) throw new Error(`Could not resolve the site's market: ${error.message}`);
    const m = (data ?? {}) as { country_code?: string | null; language_code?: string | null; source?: string | null; note?: string };
    if (m.country_code && m.language_code) {
      return {
        ok: true,
        market: {
          country_code: m.country_code, language_code: m.language_code,
          location_code: marketForCountry(m.country_code)?.location_code ?? null,
          source: m.source ?? 'website', note: m.note ?? '',
        },
      };
    }
    if (m.note) reason = m.note;
  }
  if (opts.workspaceId) {
    const { data, error } = await db.from('finance_settings')
      .select('business_country_code').eq('workspace_id', opts.workspaceId).maybeSingle();
    if (error) throw new Error(`Could not read the business country: ${error.message}`);
    const raw = data?.business_country_code as string | null | undefined;
    const fromBusiness = marketForCountry(raw);
    if (fromBusiness) {
      return {
        ok: true,
        market: {
          country_code: countryForLocation(fromBusiness.location_code) ?? String(raw).toUpperCase(),
          language_code: fromBusiness.language_code,
          location_code: fromBusiness.location_code,
          source: 'business_country',
          note: `Taken from the business country (${raw}) in Finance → Settings.`,
        },
      };
    }
    reason += raw
      ? ` The business country ${raw} has no mapped search market.`
      : ' No business country is set in Finance → Settings either.';
  }
  return { ok: false, reason };
}
