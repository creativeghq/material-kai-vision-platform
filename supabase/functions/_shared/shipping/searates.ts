// deno-lint-ignore-file no-explicit-any
// SeaRates (DP World) freight-rate adapter — "Get Quote" for inbound shipping.
//
// How SeaRates works: it AGGREGATES freight rates from 100+ forwarders/carriers across 190+ countries
// (ocean FCL/LCL/Bulk, land FTL/LTL, air) and returns multiple competing offers with price + transit
// time. Auth is a Bearer token obtained from the SeaRates platform-token endpoint using the account's
// id + api_key.
//
// ⚠️ VERIFY BEFORE ACTIVATION: SeaRates' exact rates request/response schema (and whether the live
// endpoint is REST or GraphQL on your plan) needs confirmation against your SeaRates account docs /
// manager. Everything here is best-effort + defensive + endpoint-overridable, so it's a one-file fix.
// Contract exposed to the platform: getFreightQuote(creds, params) -> NormalizedOffer[] (stable).

export interface SearatesCreds {
  platformId: string | null;
  apiKey: string;
}

export interface QuoteParams {
  origin: string;          // port name / UN-LOCODE / "City, Country"
  destination: string;
  mode: 'fcl' | 'lcl' | 'air';
  containerType?: string | null;  // 20st | 40st | 40hq | 20ref | 40ref (FCL)
  readyDate?: string | null;      // YYYY-MM-DD
}

export interface NormalizedOffer {
  carrier: string | null;
  amount: number | null;
  currency: string | null;
  transit_days: number | null;
  valid_until: string | null;
  mode: string;
  raw: any;
}

const AUTH_URL = () => Deno.env.get('SEARATES_AUTH_URL') || 'https://www.searates.com/auth/platform-token';
const RATES_URL = () => Deno.env.get('SEARATES_RATES_URL') || 'https://www.searates.com/graphql_rates';

/** Exchange id + api_key for a Bearer token; if only an api_key is stored, use it as the token. */
async function resolveToken(creds: SearatesCreds): Promise<string> {
  if (!creds.platformId) return creds.apiKey; // treat api_key as a pre-issued token
  const url = `${AUTH_URL()}?id=${encodeURIComponent(creds.platformId)}&api_key=${encodeURIComponent(creds.apiKey)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`SeaRates auth failed (${res.status})`);
  const data = await res.json().catch(() => ({}));
  const token = data?.token || data?.access_token || data?.data?.token;
  if (!token) throw new Error('SeaRates auth returned no token');
  return String(token);
}

function firstOf(obj: any, keys: string[]): any {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return null;
}

/** Pull an offer list out of whatever shape SeaRates returns, then normalize each. */
function parseOffers(payload: any, mode: string): NormalizedOffer[] {
  let list: any =
    firstOf(payload, ['rates', 'offers', 'results', 'shipments']) ??
    firstOf(payload?.data ?? {}, ['rates', 'offers', 'results', 'shipmentsList']) ??
    payload?.data?.rates ?? payload;
  if (!Array.isArray(list)) list = Array.isArray(payload) ? payload : [];
  return list.map((o: any) => {
    const price = firstOf(o, ['totalPrice', 'total', 'price', 'amount', 'rate']);
    const priceObj = (price && typeof price === 'object') ? price : null;
    return {
      carrier: firstOf(o, ['carrier', 'shippingLine', 'provider', 'forwarder', 'company', 'name']) as string | null,
      amount: Number(priceObj ? firstOf(priceObj, ['amount', 'value', 'total']) : price) || null,
      currency: firstOf(priceObj ?? o, ['currency', 'currencyCode', 'ccy']) as string | null,
      transit_days: Number(firstOf(o, ['transitTime', 'transit', 'transitDays', 'totalTransitTime', 'duration'])) || null,
      valid_until: (firstOf(o, ['validUntil', 'expiresAt', 'validTo']) as string | null)?.slice?.(0, 10) ?? null,
      mode,
      raw: o,
    };
  }).filter((o) => o.amount != null || o.carrier != null);
}

/**
 * Get a freight quote — returns a ranked (cheapest-first) list of offers from many forwarders.
 * ⚠️ The request body below is best-effort; confirm the exact field names against your SeaRates plan.
 */
export async function getFreightQuote(creds: SearatesCreds, params: QuoteParams): Promise<NormalizedOffer[]> {
  const token = await resolveToken(creds);
  const body: Record<string, unknown> = {
    from: params.origin, to: params.destination, mode: params.mode,
    ...(params.containerType ? { containerType: params.containerType, container: params.containerType } : {}),
    ...(params.readyDate ? { date: params.readyDate } : {}),
  };
  const res = await fetch(RATES_URL(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`SeaRates rates failed (${res.status})${txt ? `: ${txt.slice(0, 200)}` : ''}`);
  }
  const payload = await res.json();
  const offers = parseOffers(payload, params.mode);
  offers.sort((a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity));
  return offers;
}
