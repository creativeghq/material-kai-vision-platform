/** #474: link a Shopify/Woo catalogue to ours; a match only gains a link, a new item is an unpublished draft. */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';
import { fromShopifyProduct, fromWooProduct, netPrice, type PulledProduct } from '../_shared/commerce/product-pull.ts';

type Row = Record<string, unknown>;

const MAX_PRODUCTS = 300;

interface Upstream {
  products: PulledProduct[];
  taxesIncluded: boolean;
  currency: string;
}

async function getJson(url: string, headers: Record<string, string>, what: string): Promise<unknown> {
  const res = await fetch(url, { headers, redirect: 'error' });
  if (!res.ok) throw new HttpError(502, `${what} refused the pull: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

async function pull(conn: Row): Promise<Upstream> {
  const creds = (conn.credentials ?? {}) as Record<string, string>;
  const store = String(conn.store_url ?? '').replace(/\/+$/, '');
  if (!store) throw new HttpError(400, 'This connection has no store URL.');
  try {
    await assertSafeUrl(store, { allowSchemes: ['https:'] });
  } catch (err) {
    if (err instanceof SSRFError) throw new HttpError(400, `That store URL cannot be fetched: ${err.message}`);
    throw err;
  }

  if (conn.platform === 'shopify') {
    const token = creds.admin_token;
    if (!token) throw new HttpError(400, 'This connection has no Shopify Admin token.');
    const version = String(conn.api_version ?? '2025-07');
    const headers = { 'X-Shopify-Access-Token': token };
    const shop = (await getJson(`${store}/admin/api/${version}/shop.json`, headers, 'Shopify') as Row).shop as Row | undefined;
    const body = await getJson(`${store}/admin/api/${version}/products.json?limit=250&status=active`, headers, 'Shopify') as Row;
    const products = (Array.isArray(body.products) ? body.products as Row[] : [])
      .map((p) => fromShopifyProduct(p, store)).filter((p): p is PulledProduct => !!p);
    return { products, taxesIncluded: shop?.taxes_included === true, currency: String(shop?.currency ?? 'EUR') };
  }

  if (conn.platform === 'woocommerce') {
    const key = creds.consumer_key;
    const secret = creds.consumer_secret;
    if (!key || !secret) throw new HttpError(400, 'This connection has no WooCommerce consumer key and secret.');
    const headers = { Authorization: `Basic ${btoa(`${key}:${secret}`)}` };
    const setting = async (group: string, id: string) => {
      try {
        return String(((await getJson(`${store}/wp-json/wc/v3/settings/${group}/${id}`, headers, 'WooCommerce')) as Row).value ?? '');
      } catch {
        return '';
      }
    };
    const products: PulledProduct[] = [];
    for (let page = 1; page <= 3 && products.length < MAX_PRODUCTS; page++) {
      const rows = await getJson(`${store}/wp-json/wc/v3/products?per_page=100&status=publish&page=${page}`, headers, 'WooCommerce');
      if (!Array.isArray(rows) || rows.length === 0) break;
      products.push(...(rows as Row[]).map(fromWooProduct).filter((p): p is PulledProduct => !!p));
      if (rows.length < 100) break;
    }
    return {
      products,
      taxesIncluded: (await setting('tax', 'woocommerce_prices_include_tax')) === 'yes',
      currency: (await setting('general', 'woocommerce_currency')) || 'EUR',
    };
  }

  throw new HttpError(400, `Pulling products is not supported for ${String(conn.platform)}.`);
}

Deno.serve(withApiLogging('store-products-sync', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const body = await req.json().catch(() => ({}));
  const connectionId = String(body?.connection_id ?? '');
  if (!connectionId) throw new HttpError(400, 'connection_id is required');

  const auth = await authenticate(req, { requireUser: true });
  const userId = getUserId(auth);
  if (!userId) throw new HttpError(401, 'Sign in first');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: conn } = await admin.from('store_connections')
    .select('id, workspace_id, platform, store_url, api_version, credentials')
    .eq('id', connectionId).maybeSingle();
  if (!conn || !await userCanAccessWorkspace(admin, userId, conn.workspace_id)) throw new HttpError(404, 'Not found');
  const workspaceId = String(conn.workspace_id);
  const platform = String(conn.platform);

  const { products, taxesIncluded, currency } = await pull(conn as Row);
  const { data: fin } = await admin.from('finance_settings').select('default_vat_rate').eq('workspace_id', workspaceId).maybeSingle();
  const vatRate = Number(fin?.default_vat_rate ?? 24);

  let created = 0;
  let linked = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of products.slice(0, MAX_PRODUCTS)) {
    try {
      const first = item.variants[0];
      const { data: match, error: mErr } = await admin.rpc('match_external_product', {
        p_workspace_id: workspaceId, p_source: platform, p_connection_id: conn.id,
        p_external_product_id: item.externalProductId, p_external_variant_id: first?.variantId ?? null,
        p_gtin: first?.barcode ?? null, p_sku: first?.sku ?? null, p_url: item.url,
      });
      if (mErr) throw new Error(mErr.message);
      let productId = (Array.isArray(match) ? match[0]?.product_id : null) as string | null;

      if (!productId) {
        const { data: made, error: pErr } = await admin.from('products').insert({
          workspace_id: workspaceId,
          name: item.name,
          description: item.description,
          sku: first?.sku ?? null,
          external_sku: first?.sku ?? null,
          barcode: first?.barcode ?? null,
          product_url: item.url,
          source_type: 'store_sync',
          status: 'draft',
          created_by: userId,
          metadata: { images: item.images, store_platform: platform },
        }).select('id').single();
        if (pErr || !made) throw new Error(pErr?.message ?? 'product insert failed');
        productId = made.id as string;
        const price = netPrice(first?.price ?? null, taxesIncluded, vatRate);
        if (price !== null) {
          const { error: prErr } = await admin.from('product_prices').insert({
            workspace_id: workspaceId, product_id: productId, list_price: price, currency, storefront_published: false,
          });
          if (prErr) throw new Error(prErr.message);
        }
        created += 1;
      } else {
        linked += 1;
      }

      const refs = item.variants.map((v) => ({
        workspace_id: workspaceId, product_id: productId, source: platform, connection_id: conn.id,
        external_product_id: item.externalProductId, external_variant_id: v.variantId,
        external_url: item.url, sku: v.sku, gtin: v.barcode,
      }));
      for (const ref of refs) {
        const { error: rErr } = await admin.from('product_external_refs').insert(ref);
        if (rErr && rErr.code !== '23505') throw new Error(rErr.message);
      }
    } catch (err) {
      failed += 1;
      if (errors.length < 5) errors.push(`${item.name}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
    }
  }

  return json({ ok: true, scanned: products.length, created, linked, failed, errors, taxes_included: taxesIncluded, currency });
}));
