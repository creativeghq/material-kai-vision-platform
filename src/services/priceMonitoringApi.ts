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
 *   family       — same brand + series, DIFFERENT SKU. Shown under
 *                  "Similar Products in this series". Inert: never feeds
 *                  chart, median, alerts. Admin can promote to tracked.
 *   unverifiable — Firecrawl couldn't extract product_name (blocked, 404,
 *                  ad-wall). Keep with grey badge, EXCLUDE from stats.
 *   null         — legacy row created before identity classification shipped.
 *
 * 'mismatch' never reaches the UI — dropped at classification time.
 */
export type MatchKind = 'exact' | 'variant' | 'family' | 'unverifiable' | null;

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
 * Submit a classifier correction. Admin clicks "Wrong match" on a row whose
 * match_kind verdict was wrong; the correction lands in `match_corrections`
 * and the next classifier run pulls it in as a few-shot example.
 *
 * Pass either competitor_source_id (internal flow) OR tracked_query_history_id
 * (external flow). corrected_match_kind is what the row SHOULD have been —
 * use 'should_drop' when the row should not have appeared at all.
 */
export async function submitClassifierCorrection(args: {
  competitorSourceId?: string;
  trackedQueryHistoryId?: string;
  correctedMatchKind: 'exact' | 'variant' | 'family' | 'mismatch' | 'unverifiable' | 'should_drop';
  correctionNote?: string;
}): Promise<void> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/classifier-correction`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({
      competitor_source_id: args.competitorSourceId,
      tracked_query_history_id: args.trackedQueryHistoryId,
      corrected_match_kind: args.correctedMatchKind,
      correction_note: args.correctionNote,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`classifier-correction failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

/**
 * Promote a family/mismatch row to tracked. Admin-only. The override is
 * sticky — every future refresh of the same URL keeps the override until
 * the admin demotes it back.
 */
export async function promoteFamilyRow(args: {
  competitorSourceId?: string;
  trackedQueryHistoryId?: string;
  overrideKind: 'exact' | 'variant';
  reason?: string;
}): Promise<void> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/promote-family-row`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({
      competitor_source_id: args.competitorSourceId,
      tracked_query_history_id: args.trackedQueryHistoryId,
      override_kind: args.overrideKind,
      reason: args.reason,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`promote-family-row failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

/**
 * Demote a previously-promoted row back to family. Admin-only.
 */
export async function demoteToFamily(args: {
  competitorSourceId?: string;
  trackedQueryHistoryId?: string;
  reason?: string;
}): Promise<void> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/demote-to-family`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({
      competitor_source_id: args.competitorSourceId,
      tracked_query_history_id: args.trackedQueryHistoryId,
      reason: args.reason,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`demote-to-family failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Per-product result exclusions
// ─────────────────────────────────────────────────────────────────────────

export interface ProductExclusion {
  id: string;
  url?: string | null;
  domain?: string | null;
  reason?: string | null;
  excluded_at: string;
}

/**
 * Mark a competitor URL or whole domain as excluded for THIS product.
 * Admin-only. Idempotent — re-excluding updates the reason field.
 * The next discover/refresh will not persist hits matching the exclusion,
 * and the row's `is_active` flag flips false so it disappears immediately.
 */
export async function excludeProductResult(args: {
  productId: string;
  url?: string;
  domain?: string;
  reason?: string;
}): Promise<ProductExclusion> {
  const res = await fetch(
    `${MIVAA_BASE}/api/v1/price-monitoring/products/${args.productId}/exclude`,
    {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ url: args.url, domain: args.domain, reason: args.reason }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`product-exclude failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Undo a previous exclusion. */
export async function includeProductResult(args: {
  productId: string;
  url?: string;
  domain?: string;
}): Promise<{ success: boolean; removed_count: number }> {
  const res = await fetch(
    `${MIVAA_BASE}/api/v1/price-monitoring/products/${args.productId}/include`,
    {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ url: args.url, domain: args.domain }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`product-include failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Re-verify retailer prices on demand. Re-runs Firecrawl on selected (or all
 * active) retailer URLs and refreshes current_price + verified flag in place.
 * Does NOT call Perplexity / DataForSEO / marketplace adapters — narrower
 * scope than discoverRetailers, cheaper, faster.
 *
 * Cost: 1 Firecrawl credit per URL re-verified.
 */
export interface VerifyProductSourcesResponse {
  success: boolean;
  status: 'verified' | 'no_results' | string;
  rows_processed: number;
  verified_count: number;
  unverified_count: number;
  credits_used: number;
  latency_ms: number;
  results: unknown[];
  message?: string;
}

export async function verifyProductSources(args: {
  productId: string;
  urls?: string[];
}): Promise<VerifyProductSourcesResponse> {
  const res = await fetch(
    `${MIVAA_BASE}/api/v1/price-monitoring/products/${args.productId}/verify`,
    {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ urls: args.urls }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`product-verify failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** List every exclusion attached to this product. */
export async function listProductExclusions(productId: string): Promise<ProductExclusion[]> {
  const res = await fetch(
    `${MIVAA_BASE}/api/v1/price-monitoring/products/${productId}/exclusions`,
    {
      method: 'GET',
      headers: await authHeader(),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`product-exclusions failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
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
