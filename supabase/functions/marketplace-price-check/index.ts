// marketplace-price-check — tells a seller whether a proposed surplus listing price is within
// the Operator's cap (market_median × (1 + cap%), default 20%). Figures come from
// `resolve_product_market_price`, the one price derivation; this only applies the cap. It also
// POPULATES `marketplace_market_reference` (service-role, 24h TTL) so `create_marketplace_listing`
// can enforce the SAME cap server-side against a value the client cannot forge.

import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CACHE_TTL_HOURS = 24;


Deno.serve(withApiLogging('marketplace-price-check', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req);
  if (!auth.userId) return json({ error: 'Unauthorized' }, 401);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const workspaceId: string | undefined = body?.workspace_id;
  const productId: string | null = body?.product_id ?? null;
  const productName: string | undefined = body?.product_name;
  const price: number | null = body?.price != null ? Number(body.price) : null;
  let currency: string = body?.currency || 'EUR';
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);
  if (!productId && !productName) return json({ error: 'product_id or product_name is required' }, 400);

  // Caller must belong to the workspace AND the workspace must be an approved+enabled participant.
  if (!(await userCanAccessWorkspace(svc, auth.userId, workspaceId))) {
    return json({ error: 'not a member of this workspace' }, 403);
  }
  const { data: part } = await svc
    .from('marketplace_participation').select('status, enabled').eq('workspace_id', workspaceId).maybeSingle();
  if (!part || (part as any).status !== 'approved' || !(part as any).enabled) {
    return json({ error: 'workspace is not an approved marketplace participant', code: 'not_participating' }, 403);
  }

  const { data: cfg } = await svc.from('marketplace_config').select('markup_cap_pct').eq('id', 1).maybeSingle();
  const cap = Number((cfg as any)?.markup_cap_pct ?? 20);

  // Resolver first when the product is tracked; reference cache then paid scan behind it.
  let median: number | null = null, mmin: number | null = null, mmax: number | null = null;
  let chosenPrice: number | null = null, chosenBasis: string | null = null;
  let confidence = 'none', priceSource = 'none';
  let sampleSize: number | null = null, resolvedAt: string | null = null, ageSeconds: number | null = null;
  let fromCache = false;

  if (productId) {
    const { data: product } = await svc
      .from('products').select('id, workspace_id').eq('id', productId).maybeSingle();
    if (!product || (product as any).workspace_id !== workspaceId) {
      return json({ error: 'not found' }, 404);
    }

    await svc.rpc('record_price_demand', {
      p_tracked_query_id: null, p_product_id: productId, p_workspace_id: workspaceId,
      p_user_id: auth.userId, p_api_key_id: null, p_surface: 'marketplace', p_served_from: null,
    });
    const { data: resolved } = await svc.rpc('resolve_product_market_price', { p_product_id: productId });
    if (resolved && resolved.status === 'ok' && resolved.median != null && !resolved.is_stale) {
      median = Number(resolved.median);
      mmin = resolved.min != null ? Number(resolved.min) : null;
      mmax = resolved.max != null ? Number(resolved.max) : null;
      chosenPrice = resolved.chosen_price != null ? Number(resolved.chosen_price) : null;
      chosenBasis = resolved.chosen_basis ?? null;
      confidence = resolved.confidence ?? 'none';
      currency = resolved.currency || currency;
      sampleSize = resolved.sample_size ?? null;
      resolvedAt = resolved.resolved_at ?? null;
      ageSeconds = resolved.age_seconds ?? null;
      priceSource = 'tracking';
    }
  }

  if (median == null && productId) {
    const { data: ref } = await svc
      .from('marketplace_market_reference')
      .select('market_median, market_min, market_max, currency')
      .eq('product_id', productId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (ref && (ref as any).market_median != null) {
      median = Number((ref as any).market_median);
      mmin = (ref as any).market_min != null ? Number((ref as any).market_min) : null;
      mmax = (ref as any).market_max != null ? Number((ref as any).market_max) : null;
      currency = (ref as any).currency || currency;
      fromCache = true;
      priceSource = 'reference_cache';
    }
  }

  if (median == null) {
    // Miss → run the MIVAA market-check engine (admin-gated upstream; we authenticate as the platform).
    const mivaaKey = Deno.env.get('MIVAA_API_KEY') || Deno.env.get('MATERIAL_KAI_API_KEY') || '';
    try {
      const res = await fetch(`${MIVAA_GATEWAY_URL}/api/v1/price-monitoring/market-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(mivaaKey ? { Authorization: `Bearer ${mivaaKey}` } : {}) },
        body: JSON.stringify({
          product_id: productId, product_name: productName,
          manufacturer: body?.manufacturer, dimensions: body?.dimensions, verify_prices: true,
          surface: 'marketplace', record_demand: false,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const s = d?.stats || {};
        median = s?.median != null ? Number(s.median) : null;
        mmin = s?.min != null ? Number(s.min) : null;
        mmax = s?.max != null ? Number(s.max) : null;
        currency = s?.currency || currency;
        chosenPrice = s?.chosen_price != null ? Number(s.chosen_price) : null;
        chosenBasis = s?.chosen_basis ?? null;
        confidence = s?.confidence ?? 'none';
        if (median != null) { priceSource = 'fresh_scan'; sampleSize = s?.count ?? null; }
      }
    } catch (e) {
      console.warn('[marketplace-price-check] market-check failed:', e);
    }
  }

  if (productId && median != null && !fromCache) {
    const now = new Date();
    await svc.from('marketplace_market_reference').upsert({
      product_id: productId, market_median: median, market_min: mmin, market_max: mmax,
      currency, sample_size: sampleSize,
      resolved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + CACHE_TTL_HOURS * 3600_000).toISOString(),
    }, { onConflict: 'product_id' });
  }

  const unverified = median == null || median <= 0;
  const maxAllowed = unverified ? null : Math.round(median! * (1 + cap / 100) * 100) / 100;
  // No market data → we can't enforce; allow (the seller sees "unverified"). With data, a proposed
  // price is allowed only when it's at or below the cap ceiling.
  const allowed = unverified ? true : (price == null ? true : price <= (maxAllowed as number));

  return json({
    success: true,
    market_median: median, market_min: mmin, market_max: mmax, currency,
    chosen_price: chosenPrice, chosen_basis: chosenBasis, confidence, price_source: priceSource,
    sample_size: sampleSize, resolved_at: resolvedAt, age_seconds: ageSeconds,
    cap_pct: cap, max_allowed: maxAllowed, allowed, unverified, from_cache: fromCache,
  });
}));
