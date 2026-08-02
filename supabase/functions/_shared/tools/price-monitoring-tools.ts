/**
 * Price Monitoring Tools — agent-chat surface for competitive price tracking.
 *
 * Mirrors mention-tools.ts (same MIVAA family, same auth). The internal product
 * price flow is UNMETERED (the platform absorbs the upstream Perplexity/DataForSEO/
 * Firecrawl cost, exactly as the /finance Price Monitor tab does), so these agent
 * tools are 0 credits — no debit/refund path.
 *
 * Tools:
 *   - track_product_prices  — start/stop competitor price tracking on a product
 *                             (start also runs the first discovery refresh)
 *   - get_price_summary     — the denormalized current price + discovered retailers
 *
 * Module-gated: every tool verifies `price-monitoring` is enabled first.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

const MODULE_SLUG = 'price-monitoring';

// ───────────────────────────────────────────────────────────────────────────
// Helpers (same shape as mention-tools.ts)
// ───────────────────────────────────────────────────────────────────────────

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function isModuleEnabled(): Promise<boolean> {
  try {
    const sb = svcClient();
    const { data } = await sb.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    return Boolean(data?.enabled);
  } catch (_) {
    return false;
  }
}

async function getProductRow(productId: string) {
  const sb = svcClient();
  const { data } = await sb
    .from('products')
    // `products.manufacturer` does not exist (brand is the `brand_company_id` FK) and was
    // never read from this result — but it made PostgREST reject the whole select, so the
    // tool reported every product as missing.
    .select('id, name')
    .eq('id', productId)
    .maybeSingle();
  return data;
}

async function callMivaa(
  path: string,
  init: RequestInit & { jwt?: string } = {},
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${init.jwt || SUPABASE_SERVICE_ROLE_KEY}`);
  try {
    const resp = await fetch(`${MIVAA_GATEWAY_URL}${path}`, { ...init, headers });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : String(parsed)?.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1) track_product_prices
// ───────────────────────────────────────────────────────────────────────────

export const createTrackProductPricesTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, action }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'price-monitoring module disabled — ask an admin to enable it' });
      }
      const product = await getProductRow(product_id);
      if (!product) return JSON.stringify({ success: false, error: `product ${product_id} not found` });

      onChunk?.({ type: 'tool_progress', status: `${action} price monitoring for "${product.name}"...`, timestamp: Date.now() });

      if (action === 'stop') {
        const r = await callMivaa(`/api/v1/price-monitoring/products/${product_id}/track`, { method: 'DELETE', jwt });
        return JSON.stringify({ success: r.ok, ...(r.ok ? r.data : { error: r.error || `backend ${r.status}` }) });
      }

      // start — get-or-create the internal tracked_query + run the first discovery refresh
      const r = await callMivaa(
        `/api/v1/price-monitoring/products/${product_id}/track`,
        { method: 'POST', body: JSON.stringify({}), jwt },
      );
      if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });

      onChunk?.({
        type: 'price_tracking_started',
        product_id,
        product_name: product.name,
        tracked: r.data?.data ?? r.data,
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, data: r.data?.data ?? r.data });
    },
    {
      name: 'track_product_prices',
      description: 'Start or stop competitor price monitoring on a catalog product. Starting also runs the first discovery refresh (Perplexity + DataForSEO + Firecrawl verification). 0 credits (internal flow is unmetered).',
      schema: z.object({
        product_id: z.string().describe('Product UUID to track.'),
        action: z.enum(['start', 'stop']).default('start'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 2) get_price_summary
// ───────────────────────────────────────────────────────────────────────────

export const createGetPriceSummaryTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, include_sources = true }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'price-monitoring disabled' });
      }
      onChunk?.({ type: 'tool_progress', status: 'Loading price summary...', timestamp: Date.now() });

      const summaryRes = await callMivaa(`/api/v1/price-monitoring/products/${product_id}`, { method: 'GET', jwt });
      if (!summaryRes.ok) return JSON.stringify({ success: false, error: summaryRes.error || `backend ${summaryRes.status}` });
      const summary = summaryRes.data?.data ?? summaryRes.data;
      if (!summary) return JSON.stringify({ success: true, data: null, message: 'product not enrolled in price monitoring' });

      let sources: any[] = [];
      if (include_sources) {
        const srcRes = await callMivaa(`/api/v1/price-monitoring/products/${product_id}/sources`, { method: 'GET', jwt });
        if (srcRes.ok) sources = srcRes.data?.data?.results ?? srcRes.data?.results ?? [];
      }

      onChunk?.({
        type: 'price_summary',
        product_id,
        summary,
        sources,
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true,
        summary,
        retailer_count: sources.length,
        retailers: sources.slice(0, 10), // truncate for context budget
      });
    },
    {
      name: 'get_price_summary',
      description: 'Fetch the current competitor-price summary for a product: cheapest verified price, currency, availability, and the discovered retailer list. 0 credits.',
      schema: z.object({
        product_id: z.string(),
        include_sources: z.boolean().default(true).describe('Include the discovered retailer rows (adds one backend read).'),
      }),
    },
  );
};
