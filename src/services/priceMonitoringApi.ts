/**
 * Price Monitoring API client — wraps MIVAA endpoints the UI calls.
 *
 * Two kinds of endpoints here:
 *   - /api/v1/price-monitoring/* (session JWT auth, platform UI use)
 *   - /api/v1/prices/lookup + /api/v1/prices/track/* (api_keys Bearer, external use — NOT wrapped here)
 */

import { supabase } from '@/integrations/supabase/client';

const MIVAA_BASE = import.meta.env.VITE_MIVAA_BASE_URL || 'https://v1api.materialshub.gr';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Product-identity verdict from Haiku batched classifier.
 *   exact        — brand + model + product_type all match. Include in stats.
 *   variant      — same model, different color/finish/size. Keep with note,
 *                  EXCLUDE from price statistics.
 *   unverifiable — Firecrawl couldn't extract product_name (blocked, 404,
 *                  ad-wall). Keep with grey badge, EXCLUDE from stats.
 *   null         — legacy row created before identity classification shipped.
 *
 * 'mismatch' and 'family' never reach the UI — dropped at verification time.
 */
export type MatchKind = 'exact' | 'variant' | 'unverifiable' | null;

export interface PerplexityHit {
  retailer_name: string;
  product_url: string;
  price: number | null;
  /** On-page "was" price when the retailer displays a promo (e.g. "Was €89, Now €79"). */
  original_price: number | null;
  currency: string | null;
  price_unit: string | null;
  availability: string | null;
  city: string | null;
  ships_from_abroad: boolean;
  is_quote_only: boolean;
  last_verified: string | null;
  notes: string | null;
  /** 'perplexity' = web search retailer, 'dataforseo' = Google Shopping merchant. */
  source: 'perplexity' | 'dataforseo';
  /** True when Firecrawl actually fetched the page and confirmed the price. */
  verified: boolean;
  /** DataForSEO-only enrichment. */
  image_url: string | null;
  rating_value: number | null;
  rating_votes: number | null;
  /** Product-identity verdict — see MatchKind. */
  match_kind: MatchKind;
  /** 0-100 identity-match confidence from the classifier. */
  match_score: number | null;
  /** Human-readable facet diff (e.g. "Color differs: asked BLACK MATT, page shows WHITE"). */
  match_note: string | null;
  /**
   * Exact product name shown on the retailer's page (DataForSEO Shopping feed
   * title or Firecrawl product_name extraction). Use as a subtitle under
   * retailer_name to disambiguate multiple rows from the same retailer for
   * different variants.
   */
  product_title: string | null;
}

export interface DiscoverResponse {
  success: boolean;
  source: string;
  product_id: string;
  results: PerplexityHit[];
  total_results: number;
  credits_used: number;
  latency_ms: number;
  /** 2-3 sentence Perplexity summary: closest retailer, pricing outliers, etc. */
  summary: string | null;
  throttled: boolean;
  throttle_until: string | null;
  last_search_at: string | null;
  cached: boolean;
  error: string | null;
}

/**
 * Trigger Perplexity discovery for a monitored product. Respects 6h throttle
 * unless force_refresh=true (admin/super_admin only).
 */
export async function discoverRetailers(
  productId: string,
  forceRefresh = false,
  verifyPrices = true
): Promise<DiscoverResponse> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/discover`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({
      product_id: productId,
      force_refresh: forceRefresh,
      verify_prices: verifyPrices,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`discover failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Classic Firecrawl scrape of a single user-pasted URL.
 * Used by the "Custom Monitoring" section.
 */
export async function checkNow(productId: string, productName: string): Promise<{
  success: boolean;
  sources_checked?: number;
  prices_found?: number;
  credits_consumed?: number;
  error?: string;
}> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/check-now`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ product_id: productId, product_name: productName }),
  });
  if (!res.ok) throw new Error(`check-now failed: ${res.status}`);
  return res.json();
}

/**
 * Start / stop monitoring the product (maps to platform's internal monitoring).
 */
export async function startMonitoring(
  productId: string,
  frequency: 'hourly' | 'daily' | 'weekly' | 'on_demand' = 'daily'
): Promise<void> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/start`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ product_id: productId, frequency, enabled: true }),
  });
  if (!res.ok) throw new Error(`start monitoring failed: ${res.status}`);
}

export async function stopMonitoring(productId: string): Promise<void> {
  const res = await fetch(
    `${MIVAA_BASE}/api/v1/price-monitoring/stop?product_id=${encodeURIComponent(productId)}`,
    { method: 'POST', headers: await authHeader() }
  );
  if (!res.ok) throw new Error(`stop monitoring failed: ${res.status}`);
}

export interface MarketStats {
  count: number;
  verified_count: number;
  min: number | null;
  max: number | null;
  median: number | null;
  currency: string | null;
}

export interface MarketCheckResponse {
  success: boolean;
  product_id: string | null;
  query: string;
  country_code: string;
  results: PerplexityHit[];
  total_results: number;
  stats: MarketStats;
  summary: string | null;
  credits_used: number;
  latency_ms: number;
  /** True when the product was already enrolled in monitoring and the cached snapshot was reused (≤6h old). */
  from_monitoring_cache: boolean;
  cache_age_seconds: number | null;
  error: string | null;
}

export interface MarketCheckParams {
  productId?: string;
  productName?: string;
  dimensions?: string;
  manufacturer?: string;
  verifyPrices?: boolean;
}

/**
 * One-shot stateless market scan. Admin-only. Used by the "Check market" button
 * in PriceLookupDrawer so admins can compare the KB-proposed price against live
 * retailer range/median before committing. Does NOT enroll the product into
 * monitoring — if the product is already enrolled and its last refresh is ≤6h
 * old, the cached competitor_sources snapshot is returned (from_monitoring_cache=true).
 */
export async function marketCheck(params: MarketCheckParams): Promise<MarketCheckResponse> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/market-check`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({
      product_id: params.productId,
      product_name: params.productName,
      dimensions: params.dimensions,
      manufacturer: params.manufacturer,
      verify_prices: params.verifyPrices ?? true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`market-check failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}
