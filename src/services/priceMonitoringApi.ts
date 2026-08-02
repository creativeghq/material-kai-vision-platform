/**
 * Price Monitoring API client.
 *
 * Wraps MIVAA's `/api/v1/price-monitoring/*` endpoints. After the 2026-05-01
 * consolidation, every internal product is a `tracked_queries` row — there is
 * no separate `competitor_sources` / `price_history` schema. The product-scoped
 * endpoints (`/products/{id}/...`) are the canonical surface; the legacy
 * `/discover`, `/start`, `/stop`, `/check-now`, `/sources/{id}`, `/history/{id}`
 * aliases are kept short-term for backwards compat and will be removed.
 */

import { supabase } from '@/integrations/supabase/client';

const MIVAA_BASE = import.meta.env.VITE_MIVAA_BASE_URL || 'https://v1api.materialshub.gr';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MIVAA_BASE}${path}`, {
    ...init,
    headers: { ...(await authHeader()), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────
// Domain types — mirror the backend's `tracked_query_price_history` row.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Product-identity verdict from Haiku batched classifier.
 *   exact        — brand + model + product_type all match. Include in stats.
 *   variant      — same model, different color/finish/size. Keep with note,
 *                  EXCLUDE from price statistics.
 *   family       — same brand + series, DIFFERENT SKU. Shown under
 *                  "Similar Products in this series". Inert.
 *   unverifiable — Firecrawl couldn't extract product_name. Keep, EXCLUDE.
 *   null         — legacy row created before identity classification shipped.
 *
 * 'mismatch' never reaches the UI — dropped at classification time.
 */
export type MatchKind = 'exact' | 'variant' | 'family' | 'unverifiable' | null;

/** A single retailer row from tracked_query_price_history (latest refresh). */
export interface RetailerRow {
  /** PK in tracked_query_price_history. Pass to promote/demote/correction. */
  id?: string;
  retailer_name: string;
  product_url: string;
  price: number | null;
  /** On-page "was" price when the retailer displays a promo. */
  original_price: number | null;
  currency: string | null;
  price_unit: string | null;
  availability: string | null;
  city: string | null;
  ships_from_abroad: boolean;
  notes: string | null;
  /** 'perplexity' | 'dataforseo' | 'skroutz' | 'bestprice' | 'shopflix' | 'idealo'. */
  source: string;
  /** True when Firecrawl actually fetched the page and confirmed the price. */
  verified: boolean;
  match_kind: MatchKind;
  match_score: number | null;
  match_note: string | null;
  /** Exact product name shown on the retailer's page. Subtitle under retailer_name. */
  product_title: string | null;
  /** Sanity-band metadata. */
  is_anomaly?: boolean;
  anomaly_reason?: string | null;
  rolling_median_at_check?: number | null;
  manual_override?: boolean;
  scraped_at?: string;
  refresh_run_id?: string;
  /** DataForSEO Shopping enrichment (optional — only present on dataforseo-sourced rows). */
  image_url?: string | null;
  rating_value?: number | null;
  rating_votes?: number | null;
}

/** The denormalized summary row on tracked_queries. */
export interface TrackedQuery {
  id: string;
  product_id: string | null;
  api_key_id: string | null;
  search_query: string;
  manufacturer: string | null;
  dimensions: string | null;
  country_code: string | null;
  is_active: boolean;
  mode: 'discovery' | 'url-only';
  pinned_url: string | null;
  refresh_interval_hours: number;
  next_check_at: string | null;
  last_refreshed_at: string | null;
  last_refresh_credits_used: number | null;
  total_credits_used: number | null;
  last_error: string | null;
  /** Cheapest verified hit from the latest refresh (denormalized cache). */
  current_price: number | null;
  current_currency: string | null;
  current_availability: string | null;
  current_original_price: number | null;
  current_price_verified: boolean;
  current_metadata: Record<string, unknown> | null;
  current_price_updated_at: string | null;
  /** Alert prefs. */
  alert_on_price_drop: boolean;
  alert_on_new_retailer: boolean;
  alert_on_promo: boolean;
  alert_channels: string[];
  alert_webhook_url: string | null;
  /** Volatility cadence. */
  volatility_score: number | null;
  consecutive_stable_refreshes: number;
  first_refresh_verified: boolean;
  /** When false, refresh skips the Firecrawl Stage B verification pass.
   *  Default true. Surfaced in the per-product UI as a toggle. */
  verify_prices: boolean;
}

export interface ProductSourcesPayload {
  results: RetailerRow[];
  family_results: RetailerRow[];
  tracked_query_id: string;
}

export interface ProductHistoryPayload {
  history: RetailerRow[];
  count: number;
}

export interface RefreshOutcome {
  status: 'refreshed' | 'throttled' | 'inactive' | 'not_found' | 'error';
  refresh_run_id?: string;
  credits_used?: number;
  latency_ms?: number;
  results?: RetailerRow[];
  summary?: string | null;
  error?: string | null;
  throttle_until?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Product-scoped endpoints (preferred surface)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Enroll a catalog product into monitoring. Creates a `tracked_queries` row
 * and runs the first discovery refresh synchronously. If the product is
 * already enrolled, returns the existing row (set `force_refresh=true` to
 * re-discover).
 */
export async function trackProduct(
  productId: string,
  options?: { country_code?: string; force_refresh?: boolean },
): Promise<TrackedQuery | null> {
  const res = await api<{ success: boolean; data: { tracked_query: TrackedQuery } }>(
    `/api/v1/price-monitoring/products/${productId}/track`,
    {
      method: 'POST',
      body: JSON.stringify({
        country_code: options?.country_code,
        force_refresh: options?.force_refresh ?? false,
      }),
    },
  );
  return res.data?.tracked_query ?? null;
}

/** Stop monitoring (soft delete — history preserved). */
export async function untrackProduct(productId: string): Promise<void> {
  await api(
    `/api/v1/price-monitoring/products/${productId}/track`,
    { method: 'DELETE' },
  );
}

/** Read the tracked_query summary for this product (null if not enrolled). */
export async function getProductMonitoring(productId: string): Promise<TrackedQuery | null> {
  const res = await api<{ success: boolean; data: TrackedQuery | null }>(
    `/api/v1/price-monitoring/products/${productId}`,
    { method: 'GET' },
  );
  return res.data;
}

/**
 * Re-run discovery for this product. Auto-enrolls on first call.
 * `force_refresh` requires admin (bypasses volatility cadence).
 */
export async function refreshProduct(
  productId: string,
  options?: { force_refresh?: boolean; verify_prices?: boolean },
): Promise<RefreshOutcome> {
  const res = await api<{ success: boolean; data: RefreshOutcome }>(
    `/api/v1/price-monitoring/products/${productId}/refresh`,
    {
      method: 'POST',
      body: JSON.stringify({
        force_refresh: options?.force_refresh ?? false,
        verify_prices: options?.verify_prices ?? true,
      }),
    },
  );
  return res.data;
}

/**
 * Latest retailer rows for this product, split into:
 *   - results        : exact + variant + unverifiable (the tracked product)
 *   - family_results : family rows (similar SKUs in the series, inert)
 */
export async function getProductSources(productId: string): Promise<ProductSourcesPayload> {
  const res = await api<{ success: boolean; data: ProductSourcesPayload }>(
    `/api/v1/price-monitoring/products/${productId}/sources`,
    { method: 'GET' },
  );
  return res.data ?? { results: [], family_results: [], tracked_query_id: '' };
}

/** Historical price rows (newest first), per-product. */
export async function getProductHistory(
  productId: string,
  limit = 200,
): Promise<ProductHistoryPayload> {
  return api<ProductHistoryPayload>(
    `/api/v1/price-monitoring/products/${productId}/history?limit=${encodeURIComponent(String(limit))}`,
    { method: 'GET' },
  );
}

/**
 * Re-verify retailer URLs (Firecrawl only — no new discovery). Cheaper than
 * refresh, useful for clearing stale 'unverified' flags.
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
  return api<VerifyProductSourcesResponse>(
    `/api/v1/price-monitoring/products/${args.productId}/verify`,
    { method: 'POST', body: JSON.stringify({ urls: args.urls }) },
  );
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

/** Mark a competitor URL or whole domain as excluded for THIS product. */
export async function excludeProductResult(args: {
  productId: string;
  url?: string;
  domain?: string;
  reason?: string;
}): Promise<ProductExclusion> {
  return api<ProductExclusion>(
    `/api/v1/price-monitoring/products/${args.productId}/exclude`,
    {
      method: 'POST',
      body: JSON.stringify({ url: args.url, domain: args.domain, reason: args.reason }),
    },
  );
}

/** Undo a previous exclusion. */
export async function includeProductResult(args: {
  productId: string;
  url?: string;
  domain?: string;
}): Promise<{ success: boolean; removed_count: number }> {
  return api<{ success: boolean; removed_count: number }>(
    `/api/v1/price-monitoring/products/${args.productId}/include`,
    { method: 'POST', body: JSON.stringify({ url: args.url, domain: args.domain }) },
  );
}

/** List every exclusion attached to this product. */
export async function listProductExclusions(productId: string): Promise<ProductExclusion[]> {
  return api<ProductExclusion[]>(
    `/api/v1/price-monitoring/products/${productId}/exclusions`,
    { method: 'GET' },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Custom Monitoring (mode='url-only' tracked_queries)
// ─────────────────────────────────────────────────────────────────────────

/** Add a pinned retailer URL (no Perplexity discovery — Firecrawl only). */
export async function addUrlOnly(args: {
  productId: string;
  url: string;
  country_code?: string;
}): Promise<TrackedQuery> {
  const res = await api<{ success: boolean; data: TrackedQuery }>(
    `/api/v1/price-monitoring/products/${args.productId}/url-only`,
    {
      method: 'POST',
      body: JSON.stringify({ url: args.url, country_code: args.country_code }),
    },
  );
  return res.data;
}

/** List all pinned-URL tracked_queries for this product. */
export async function listUrlOnlyForProduct(productId: string): Promise<TrackedQuery[]> {
  const res = await api<{ success: boolean; data: TrackedQuery[] }>(
    `/api/v1/price-monitoring/products/${productId}/url-only`,
    { method: 'GET' },
  );
  return res.data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-flow: classifier feedback + admin overrides
// ─────────────────────────────────────────────────────────────────────────

/**
 * Submit a classifier correction. Admin clicks "Wrong match" on a retailer
 * row whose match_kind verdict was wrong. Pass the row's `id` from
 * `tracked_query_price_history`. The next classify call (5min cache) pulls
 * recent corrections in as few-shot examples.
 *
 * `corrected_match_kind: 'should_drop'` means the row should not have appeared.
 */
export async function submitClassifierCorrection(args: {
  trackedQueryHistoryId: string;
  correctedMatchKind: 'exact' | 'variant' | 'family' | 'mismatch' | 'unverifiable' | 'should_drop';
  correctionNote?: string;
}): Promise<void> {
  await api('/api/v1/price-monitoring/classifier-correction', {
    method: 'POST',
    body: JSON.stringify({
      tracked_query_history_id: args.trackedQueryHistoryId,
      corrected_match_kind: args.correctedMatchKind,
      correction_note: args.correctionNote,
    }),
  });
}

/**
 * Promote a family/mismatch row to tracked. The override is sticky — every
 * future refresh of the same URL keeps the override until the admin demotes
 * it back. Admin-only.
 */
export async function promoteFamilyRow(args: {
  trackedQueryHistoryId: string;
  overrideKind: 'exact' | 'variant';
  reason?: string;
}): Promise<void> {
  await api('/api/v1/price-monitoring/promote-family-row', {
    method: 'POST',
    body: JSON.stringify({
      tracked_query_history_id: args.trackedQueryHistoryId,
      override_kind: args.overrideKind,
      reason: args.reason,
    }),
  });
}

/** Demote a previously-promoted row back to family. Admin-only. */
export async function demoteToFamily(args: {
  trackedQueryHistoryId: string;
  reason?: string;
}): Promise<void> {
  await api('/api/v1/price-monitoring/demote-to-family', {
    method: 'POST',
    body: JSON.stringify({
      tracked_query_history_id: args.trackedQueryHistoryId,
      reason: args.reason,
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Stateless market scan (admin-only — used by PriceLookupDrawer)
// ─────────────────────────────────────────────────────────────────────────

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
  results: RetailerRow[];
  total_results: number;
  stats: MarketStats;
  summary: string | null;
  credits_used: number;
  latency_ms: number;
  /** True when the product was already enrolled and the cached snapshot was reused (≤6h old). */
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
 * One-shot stateless market scan. Admin-only. Used by the "Check market"
 * button in PriceLookupDrawer. Does NOT enroll the product into monitoring.
 */
export async function marketCheck(params: MarketCheckParams): Promise<MarketCheckResponse> {
  return api<MarketCheckResponse>('/api/v1/price-monitoring/market-check', {
    method: 'POST',
    body: JSON.stringify({
      product_id: params.productId,
      product_name: params.productName,
      dimensions: params.dimensions,
      manufacturer: params.manufacturer,
      verify_prices: params.verifyPrices ?? true,
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Backwards-compatible aliases — TO BE REMOVED once all call sites migrate.
// ─────────────────────────────────────────────────────────────────────────

/** @deprecated Use trackProduct() — same payload returned via legacy /start endpoint. */
export async function startMonitoring(
  productId: string,
  _frequency: 'hourly' | 'daily' | 'weekly' | 'on_demand' = 'daily',
): Promise<void> {
  await trackProduct(productId);
}

/** @deprecated Use untrackProduct(). */
export async function stopMonitoring(productId: string): Promise<void> {
  return untrackProduct(productId);
}

/** @deprecated Use refreshProduct(). Old shape preserved for legacy callers. */
export interface DiscoverResponse {
  success: boolean;
  source: string;
  product_id: string;
  results: RetailerRow[];
  total_results: number;
  credits_used: number;
  latency_ms: number;
  summary: string | null;
  throttled: boolean;
  throttle_until: string | null;
  last_search_at: string | null;
  cached: boolean;
  error: string | null;
}

/** @deprecated Use refreshProduct(). */
export async function discoverRetailers(
  productId: string,
  forceRefresh = false,
  verifyPrices = true,
): Promise<DiscoverResponse> {
  const outcome = await refreshProduct(productId, {
    force_refresh: forceRefresh,
    verify_prices: verifyPrices,
  });
  return {
    success: outcome.status === 'refreshed',
    source: 'perplexity_web_search',
    product_id: productId,
    results: outcome.results ?? [],
    total_results: outcome.results?.length ?? 0,
    credits_used: outcome.credits_used ?? 0,
    latency_ms: outcome.latency_ms ?? 0,
    summary: outcome.summary ?? null,
    throttled: outcome.status === 'throttled',
    throttle_until: outcome.throttle_until ?? null,
    last_search_at: null,
    cached: false,
    error: outcome.error ?? null,
  };
}

/** @deprecated Use refreshProduct() — old "check now" semantics. */
export async function checkNow(productId: string, _productName: string): Promise<{
  success: boolean;
  sources_checked?: number;
  prices_found?: number;
  credits_consumed?: number;
  error?: string;
}> {
  const outcome = await refreshProduct(productId, { force_refresh: true });
  return {
    success: outcome.status === 'refreshed',
    prices_found: outcome.results?.length,
    credits_consumed: outcome.credits_used,
    error: outcome.error ?? undefined,
  };
}

