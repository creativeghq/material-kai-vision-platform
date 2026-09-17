import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { getTrustedClientIp } from '../_shared/client-ip.ts';

const BASES = ['verified_in_stock', 'median', 'lowest', 'highest'] as const;
type Basis = (typeof BASES)[number];

const ANON_RATE_PER_MIN = 30;

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get('PUBLIC_PRICE_IP_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

Deno.serve(withApiLogging('public-price', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  let input: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try { input = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  } else {
    input = Object.fromEntries(url.searchParams.entries());
  }

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const country = typeof input.country === 'string' && input.country.trim() ? input.country.trim() : null;
  const basisRaw = typeof input.basis === 'string' && input.basis.trim() ? input.basis.trim().toLowerCase() : 'verified_in_stock';

  if (!query) return json({ error: 'query is required' }, 400);
  if (query.length > 300) return json({ error: 'query is too long (max 300 characters)' }, 400);
  if (!BASES.includes(basisRaw as Basis)) {
    return json({ error: `basis must be one of: ${BASES.join(', ')}`, received: basisRaw }, 400);
  }

  const svc = serviceClient();

  let apiKeyId: string | null = null;
  let keyRateLimit: number | null = null;
  const authHeader = req.headers.get('Authorization') || '';
  if (/^Bearer\s+kai_/i.test(authHeader)) {
    const auth = await authenticate(req);
    if (!auth.success || !auth.apiKey) {
      return json({ error: auth.error || 'Invalid API key' }, 401);
    }
    apiKeyId = auth.apiKey.api_key_id;
    keyRateLimit = auth.apiKey.rate_limit_per_min;
  }

  const ipHash = apiKeyId ? null : await hashIp(getTrustedClientIp(req));

  const { data: rate, error: rateError } = await svc.rpc('check_price_rate_limit', {
    p_ip_hash: ipHash,
    p_api_key_id: apiKeyId,
    p_limit: apiKeyId ? keyRateLimit : ANON_RATE_PER_MIN,
  });
  if (rateError || !rate) {
    return new Response(
      JSON.stringify({ error: 'Rate limiting unavailable, try again shortly' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '30' } },
    );
  }
  if (rate.allowed === false) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', limit: rate.limit, used: rate.used }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } },
    );
  }

  const { data, error } = await svc.rpc('resolve_query_market_price', {
    p_query: query,
    p_country: country,
    p_basis: basisRaw,
  });
  if (error) return json({ error: 'price resolution failed', detail: error.message }, 502);

  const r = (data ?? {}) as Record<string, any>;

  await svc.rpc('record_price_demand', {
    p_tracked_query_id: r.tracked_query_id ?? null,
    p_product_id: null,
    p_workspace_id: null,
    p_user_id: null,
    p_api_key_id: apiKeyId,
    p_surface: apiKeyId ? 'partner_api' : 'public',
    p_served_from: r.status === 'ok' ? 'cache' : 'no_data',
    p_query_text: query,
    p_ip_hash: ipHash,
  });

  return json({
    success: true,
    status: r.status ?? 'not_collected',
    query: r.query ?? query,
    currency: r.currency ?? null,
    price: {
      value: r.chosen_price ?? null,
      basis: r.chosen_basis ?? null,
      basis_requested: r.basis_requested ?? basisRaw,
      retailer: r.chosen_retailer ?? null,
      url: r.chosen_url ?? null,
      title: r.chosen_title ?? null,
    },
    band: {
      median: r.median ?? null,
      lowest: { value: r.min ?? null, retailer: r.min_retailer ?? null, url: r.min_url ?? null },
      highest: { value: r.max ?? null, retailer: r.max_retailer ?? null, url: r.max_url ?? null },
    },
    sample: {
      size: r.sample_size ?? 0,
      verified: r.verified_count ?? 0,
      in_stock: r.in_stock_count ?? 0,
      confidence: r.confidence ?? 'none',
    },
    freshness: {
      resolved_at: r.resolved_at ?? null,
      age_seconds: r.age_seconds ?? null,
      is_stale: r.is_stale ?? true,
      next_check_at: r.next_check_at ?? null,
      refresh_interval_hours: r.refresh_interval_hours ?? null,
    },
    access: {
      keyed: Boolean(apiKeyId),
      rate_limit_per_min: apiKeyId ? keyRateLimit : ANON_RATE_PER_MIN,
    },
    collector_error: r.collector_error ?? null,
  });
}));
