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

export interface PerplexityHit {
  retailer_name: string;
  product_url: string;
  price: number | null;
  currency: string | null;
  price_unit: string | null;
  availability: string | null;
  city: string | null;
  ships_from_abroad: boolean;
  is_quote_only: boolean;
  last_verified: string | null;
  notes: string | null;
}

export interface DiscoverResponse {
  success: boolean;
  source: string;
  product_id: string;
  results: PerplexityHit[];
  total_results: number;
  credits_used: number;
  latency_ms: number;
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
  forceRefresh = false
): Promise<DiscoverResponse> {
  const res = await fetch(`${MIVAA_BASE}/api/v1/price-monitoring/discover`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ product_id: productId, force_refresh: forceRefresh }),
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
