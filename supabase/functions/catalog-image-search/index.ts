/**
 * catalog-image-search
 *
 * Find candidate images for a catalog material that doesn't have one.
 * 1. Search platform DB first (MIVAA /api/rag/search images endpoint).
 * 2. Fall back to web image search (DataForSEO Images SERP).
 *
 * Returns up to N candidates, each with thumb_url + source ('db'|'web') +
 * source_metadata (product_id / source domain). The admin UI shows them as
 * an approval grid; the user clicks ✓ to attach one to the material.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
// Lazy reads so platform_secrets bootstrap (run at handler entry) is honored.
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';
const DATAFORSEO_BASE64 = () => Deno.env.get('DATAFORSEO_BASE64') || '';
const DATAFORSEO_LOGIN = () => Deno.env.get('DATAFORSEO_LOGIN') || '';
const DATAFORSEO_PASSWORD = () => Deno.env.get('DATAFORSEO_PASSWORD') || '';

interface SearchRequest {
  query: string;
  max_candidates?: number;
  search_db_first?: boolean;
  caller_user_id?: string;
}

interface ImageCandidate {
  source: 'db' | 'web';
  thumb_url: string;
  full_url: string;
  title: string | null;
  source_metadata: Record<string, any>;
}

interface SearchResponse {
  success: boolean;
  candidates?: ImageCandidate[];
  db_hits?: number;
  web_hits?: number;
  error?: string;
}

Deno.serve(withApiLogging('catalog-image-search', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  await bootstrapForFunction();

  // Pentest #250 C22: this spends DataForSEO SERP credits per call. It was open to ANY
  // authenticated user (cost-abuse via looping). Restrict to business roles (secret /
  // service-role backend callers bypass the role check); a full rate limit is a Wave-3 item.
  const auth = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner'] });
  if (!auth.success) {
    return jsonResponse({ success: false, error: auth.error ?? 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: SearchRequest = await req.json();
    if (!body.query?.trim()) return jsonResponse({ success: false, error: 'query is required' }, 400);

    // "Act on behalf of": secret/service callers pass the real user in body.caller_user_id;
    // a direct user call binds to its verified JWT. Null (pure service) → run unbilled.
    const effectiveUserId = auth.level === 'secret' && body.caller_user_id ? body.caller_user_id : auth.userId;

    const maxCandidates = Math.min(12, Math.max(1, body.max_candidates || 6));
    const searchDbFirst = body.search_db_first !== false;

    const candidates: ImageCandidate[] = [];
    let dbHits = 0;
    let webHits = 0;

    if (searchDbFirst) {
      const dbResults = await searchPlatformDb(supabase, body.query, maxCandidates);
      dbHits = dbResults.length;
      candidates.push(...dbResults);
    }

    if (candidates.length < maxCandidates) {
      const webNeeded = maxCandidates - candidates.length;
      // ── Credit metering: DataForSEO Images SERP is paid — debit before it ──
      let webCharged = false;
      if (effectiveUserId) {
        const { data: dd, error: de } = await supabase.rpc('debit_credits', {
          p_user_id: effectiveUserId,
          p_amount: 1,
          p_operation_type: 'catalog_image_search_web',
          p_description: `Catalog image web search: ${body.query.slice(0, 60)}`,
          p_metadata: { query: body.query },
          p_workspace_id: null,
        });
        const drow = Array.isArray(dd) ? dd[0] : dd;
        if (de || !drow?.success) {
          // Out of credits → skip the paid web fallback, return DB hits only.
          return jsonResponse({ success: true, candidates: candidates.slice(0, maxCandidates), db_hits: dbHits, web_hits: 0 });
        }
        webCharged = true;
      }
      const webResults = await searchWebImages(body.query, webNeeded);
      webHits = webResults.length;
      candidates.push(...webResults);
      // DataForSEO returned nothing (or not configured) → refund the debit.
      if (webCharged && webResults.length === 0) {
        try {
          await supabase.rpc('refund_credits', {
            p_user_id: effectiveUserId,
            p_amount: 1,
            p_operation_type: 'catalog_image_search_web_refund',
            p_description: 'Catalog image web search refund (no results)',
            p_metadata: { query: body.query },
            p_workspace_id: null,
          });
        } catch (e) { console.warn('[catalog-image-search] refund failed:', e instanceof Error ? e.message : e); }
      }
    }

    return jsonResponse({
      success: true,
      candidates: candidates.slice(0, maxCandidates),
      db_hits: dbHits,
      web_hits: webHits,
    });
  } catch (err) {
    console.error('[catalog-image-search] error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Image search failed' }, 500);
  }
}));

async function searchPlatformDb(supabase: any, query: string, limit: number): Promise<ImageCandidate[]> {
  try {
    const url = new URL(`${MIVAA_GATEWAY_URL}/api/rag/search`);
    url.searchParams.set('strategy', 'multi_vector');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cronSecret = CRON_SECRET();
    if (cronSecret) headers['x-cron-secret'] = cronSecret;
    // MIVAA /api/rag/search now requires auth (audit #217 C4) — authenticate as the
    // platform service so this internal call isn't rejected with 401.
    const mivaaKey = Deno.env.get('MIVAA_API_KEY') || Deno.env.get('MATERIAL_KAI_API_KEY') || '';
    if (mivaaKey) headers['Authorization'] = `Bearer ${mivaaKey}`;

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, top_k: limit }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const products: any[] = data?.results || data?.products || [];
    const out: ImageCandidate[] = [];

    for (const p of products) {
      const productId = p.id || p.product_id;
      if (!productId) continue;

      // `document_images` has NEITHER `product_id` NOR `storage_path`. The product→image
      // link is the `image_product_associations` join table, and the image already carries
      // a usable `image_url` (pdf-tiles is a public-read bucket — no signing needed).
      // The previous query named BOTH missing columns, so PostgREST rejected it outright
      // and this internal path returned nothing 100% of the time — meaning every image
      // search silently escalated to the billed provider. (audit #298)
      const { data: assoc, error: assocErr } = await supabase
        .from('image_product_associations')
        .select('overall_score, document_images!inner(image_url)')
        .eq('product_id', productId)
        .order('overall_score', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (assocErr) {
        console.error('[catalog-image-search] product→image lookup failed:', assocErr.message);
        continue;
      }
      const imageUrl = (assoc as { document_images?: { image_url?: string } } | null)?.document_images?.image_url;
      if (!imageUrl) continue;

      out.push({
        source: 'db',
        thumb_url: imageUrl,
        full_url: imageUrl,
        title: p.name || p.title || null,
        source_metadata: { product_id: productId, score: p.score ?? null },
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (err) {
    console.warn('[catalog-image-search] DB search failed:', err);
    return [];
  }
}

async function searchWebImages(query: string, limit: number): Promise<ImageCandidate[]> {
  const b64 = DATAFORSEO_BASE64();
  const login = DATAFORSEO_LOGIN();
  const password = DATAFORSEO_PASSWORD();
  const auth = b64 || (login && password ? btoa(`${login}:${password}`) : null);
  if (!auth) {
    console.warn('[catalog-image-search] DataForSEO not configured; skipping web fallback');
    return [];
  }

  try {
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/images/live/advanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify([{
        keyword: query,
        location_code: 2826, // United Kingdom — broad / english results
        language_code: 'en',
        depth: Math.max(20, limit * 4),
      }]),
    });
    if (!res.ok) {
      console.warn('[catalog-image-search] DataForSEO error', res.status);
      return [];
    }
    const data = await res.json();
    const items: any[] = data?.tasks?.[0]?.result?.[0]?.items || [];
    const out: ImageCandidate[] = [];
    for (const it of items) {
      if (!it?.source_url || !it?.url) continue;
      out.push({
        source: 'web',
        thumb_url: it.encoded_url || it.url,
        full_url: it.url,
        title: it.title || null,
        source_metadata: {
          source_domain: it.source_url ? new URL(it.source_url).hostname : null,
          source_url: it.source_url || null,
          width: it.width,
          height: it.height,
        },
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (err) {
    console.warn('[catalog-image-search] web search failed:', err);
    return [];
  }
}

function jsonResponse(body: SearchResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
