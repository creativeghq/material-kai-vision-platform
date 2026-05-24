/**
 * Public Tools API client — backs the /tools lead-gen page.
 *
 * No auth required. Every scan request must include a Cloudflare Turnstile
 * token obtained from the widget on the page. The backend enforces the 2/day
 * quota and serves cache hits transparently.
 */

const MIVAA_BASE = import.meta.env.VITE_MIVAA_BASE_URL || 'https://v1api.materialshub.gr';

export interface PublicQuota {
  used: number;
  remaining: number;
  limit: number;
  reset_at: string;
  turnstile_site_key: string | null;
  is_authenticated: boolean;
  credits_balance: number | null;
  credits_per_scan: number;
}

export interface PublicPriceResult {
  retailer_name: string;
  product_url: string;
  price: number | null;
  original_price: number | null;
  currency: string | null;
  availability: string | null;
  verified: boolean;
  source: string | null;
  product_title: string | null;
  match_kind: string | null;
}

export interface PublicMarketStats {
  count: number;
  verified_count: number;
  min: number | null;
  max: number | null;
  median: number | null;
  currency: string | null;
}

export interface PublicPriceScanResponse {
  success: boolean;
  query: string;
  country_code: string | null;
  results: PublicPriceResult[];
  stats: PublicMarketStats;
  summary: string | null;
  from_cache: boolean;
  quota: PublicQuota;
  error?: string;
}

export interface PublicMentionResult {
  url: string;
  title: string | null;
  excerpt: string | null;
  outlet_domain: string | null;
  outlet_name: string | null;
  published_at: string | null;
  source: string | null;
  language_code: string | null;
  country_code: string | null;
}

export interface PublicMentionScanResponse {
  success: boolean;
  subject_label: string;
  country_code: string | null;
  results: PublicMentionResult[];
  total_results: number;
  top_outlets: Array<{ domain: string; count: number }>;
  from_cache: boolean;
  quota: PublicQuota;
  error?: string;
}

export type PublicScanError =
  | { kind: 'quota_exceeded'; quota: PublicQuota; message: string }
  | { kind: 'insufficient_credits'; quota: PublicQuota; message: string }
  | { kind: 'captcha_failed'; message: string }
  | { kind: 'upstream'; message: string }
  | { kind: 'network'; message: string };

export class PublicToolsApiError extends Error {
  constructor(public readonly detail: PublicScanError, public readonly status: number) {
    super(detail.message);
    this.name = 'PublicToolsApiError';
  }
}

function authHeaders(accessToken?: string | null): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function postJson<T>(path: string, body: unknown, accessToken?: string | null, signal?: AbortSignal): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${MIVAA_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: unknown) {
    throw new PublicToolsApiError(
      { kind: 'network', message: e instanceof Error ? e.message : 'Network error' },
      0,
    );
  }

  if (resp.ok) {
    return (await resp.json()) as T;
  }

  let detail: unknown;
  try {
    detail = (await resp.json()).detail;
  } catch {
    detail = await resp.text().catch(() => '');
  }

  if (resp.status === 429 && detail && typeof detail === 'object' && 'quota' in detail) {
    const d = detail as { message?: string; quota: PublicQuota };
    throw new PublicToolsApiError(
      { kind: 'quota_exceeded', quota: d.quota, message: d.message || 'Daily scan quota reached.' },
      429,
    );
  }
  if (resp.status === 402 && detail && typeof detail === 'object' && 'quota' in detail) {
    const d = detail as { message?: string; quota: PublicQuota };
    throw new PublicToolsApiError(
      { kind: 'insufficient_credits', quota: d.quota, message: d.message || 'Insufficient credits.' },
      402,
    );
  }
  const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
  if (resp.status === 400 && msg.toLowerCase().includes('captcha')) {
    throw new PublicToolsApiError({ kind: 'captcha_failed', message: msg }, 400);
  }
  throw new PublicToolsApiError({ kind: 'upstream', message: msg || `HTTP ${resp.status}` }, resp.status);
}

export async function fetchQuota(accessToken?: string | null): Promise<PublicQuota> {
  const resp = await fetch(`${MIVAA_BASE}/api/v1/public/quota`, {
    headers: authHeaders(accessToken),
  });
  if (!resp.ok) {
    throw new Error(`Quota fetch failed: HTTP ${resp.status}`);
  }
  return (await resp.json()) as PublicQuota;
}

export async function priceScan(input: {
  turnstileToken: string;
  productName: string;
  manufacturer?: string;
  dimensions?: string;
  countryCode?: string;
  accessToken?: string | null;
}, signal?: AbortSignal): Promise<PublicPriceScanResponse> {
  return postJson<PublicPriceScanResponse>(
    '/api/v1/public/price-scan',
    {
      turnstile_token: input.turnstileToken,
      product_name: input.productName,
      manufacturer: input.manufacturer,
      dimensions: input.dimensions,
      country_code: input.countryCode,
    },
    input.accessToken,
    signal,
  );
}

export async function mentionScan(input: {
  turnstileToken: string;
  subjectLabel: string;
  aliases?: string[];
  countryCode?: string;
  accessToken?: string | null;
}, signal?: AbortSignal): Promise<PublicMentionScanResponse> {
  return postJson<PublicMentionScanResponse>(
    '/api/v1/public/mention-scan',
    {
      turnstile_token: input.turnstileToken,
      subject_label: input.subjectLabel,
      aliases: input.aliases,
      country_code: input.countryCode,
    },
    input.accessToken,
    signal,
  );
}
