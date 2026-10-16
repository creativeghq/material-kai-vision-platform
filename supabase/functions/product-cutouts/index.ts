/** Product in Place (#474): one background-removed PNG per product image, made once and served to the embed. */
import { serviceClient, type DbClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { replicateToken } from '../_shared/replicate-token.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { captureException } from '../_shared/sentry.ts';
import { userHasWorkspaceCapability } from '../_shared/auth.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { fetchImageGuarded, fetchTextGuarded } from '../_shared/fetch-image.ts';
import { imagesFromMetadata } from '../_shared/product-media.ts';
import { pngInfo } from '../_shared/png-info.ts';
import { normalizeShopOrigin, storeExternalIds } from '../_shared/shop-origin.ts';

const MODEL = '851-labs/background-remover';
const PRICING_KEY = 'replicate-background-remover';
const CREDIT_COST = 1;
const CREATE_SPACING_MS = 11_000;
const RUN_BUDGET_MS = 95_000;
const CLAIM_STALE_MS = 120_000;
const MAX_PRODUCTS = 60;
const BUCKET = 'generation-images';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

let modelVersion: string | null = null;

async function latestVersion(token: string): Promise<string> {
  if (modelVersion) return modelVersion;
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Replicate model lookup failed (${res.status})`);
  const body = await res.json();
  const id = body?.latest_version?.id;
  if (typeof id !== 'string') throw new Error('Replicate model has no published version');
  modelVersion = id;
  return id;
}

async function removeBackground(imageUrl: string): Promise<string> {
  const token = await replicateToken();
  if (!token) throw new Error('Replicate is not configured');
  const version = await latestVersion(token);
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=30' },
    body: JSON.stringify({ version, input: { image: imageUrl, format: 'png', background_type: 'rgba' } }),
  });
  if (!res.ok) throw new Error(`Replicate create failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  let prediction = await res.json();
  for (let i = 0; i < 20 && !['succeeded', 'failed', 'canceled'].includes(prediction.status); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (poll.ok) prediction = await poll.json();
  }
  if (prediction.status !== 'succeeded') throw new Error(`Replicate ${prediction.status ?? 'timeout'}: ${prediction.error ?? ''}`.trim());
  const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof out !== 'string') throw new Error('Replicate returned no image');
  return out;
}

interface CutoutRow {
  id: string;
  product_id: string;
  source_url: string;
  cache_status: string;
  storage_object_path: string | null;
  error: string | null;
}

type CutoutTable = 'product_cutouts' | 'store_product_overlays';

interface CutoutTarget {
  table: CutoutTable;
  id: string;
  sourceUrl: string;
  pathKey: string;
  productId: string | null;
}

async function processRow(supabase: DbClient, row: CutoutTarget, workspaceId: string, userId: string): Promise<void> {
  const { data: debitData, error: debitError } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: CREDIT_COST,
    p_operation_type: 'product_cutout',
    p_description: 'Product cut-out for Product in Place',
    p_workspace_id: workspaceId,
  });
  const debit = Array.isArray(debitData) ? debitData[0] : debitData;
  if (debitError || !debit?.success) throw new Error(debit?.error_message || 'Insufficient credits');

  try {
    await assertSafeUrl(row.sourceUrl);
    const outUrl = await removeBackground(row.sourceUrl);
    const { bytes } = await fetchImageGuarded(outUrl, { maxBytes: 20 * 1024 * 1024 });
    const info = pngInfo(bytes);
    if (!info) throw new Error('The cut-out is not a PNG');
    if (!info.hasAlpha) throw new Error('The cut-out has no transparency');

    const path = `cutouts/${workspaceId}/${row.pathKey}/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png' });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const { error: rowErr } = await supabase.from(row.table).update({
      cache_status: 'ready', storage_bucket: BUCKET, storage_object_path: path, width: info.width, height: info.height,
      method: `replicate:${MODEL}`, error: null, claimed_at: null, updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (rowErr) throw new Error(`Recording the cut-out failed: ${rowErr.message}`);

    const pricing = await getServicePricing(supabase, PRICING_KEY);
    const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      workspace_id: workspaceId,
      product_id: row.productId,
      operation_type: 'product_cutout',
      model_name: PRICING_KEY,
      credits_debited: CREDIT_COST,
      raw_cost_usd: pricing?.cost_per_unit ?? null,
      billed_cost_usd: pricing ? pricing.cost_per_unit * pricing.markup_multiplier : null,
      markup_multiplier: pricing?.markup_multiplier ?? null,
      metadata: { success: true, billing_type: 'per_unit', units: 1, cutout_id: row.id, cutout_table: row.table },
    });
    if (usageErr) {
      void captureException(new Error(`product_cutout usage log failed: ${usageErr.message}`), {
        tags: { area: 'billing', operation: 'product_cutout' }, extra: { workspace_id: workspaceId },
      });
    }
  } catch (err) {
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: CREDIT_COST,
      p_operation_type: 'product_cutout_refund',
      p_description: 'Refund: product cut-out failed',
      p_metadata: { error: err instanceof Error ? err.message : String(err) },
      p_workspace_id: workspaceId,
    }).then(() => {}, () => {});
    throw err;
  }
}

async function runPending(supabase: DbClient, targets: CutoutTarget[], workspaceId: string, userId: string): Promise<void> {
  const started = Date.now();
  let lastCreate = 0;
  for (const row of targets) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    const stale = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
    const { data: claimed } = await supabase.from(row.table)
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', row.id).eq('cache_status', 'pending')
      .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
      .select('id');
    if (!claimed?.length) continue;

    const wait = lastCreate + CREATE_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCreate = Date.now();
    try {
      await processRow(supabase, row, workspaceId, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outOfCredit = /insufficient credits/i.test(message);
      const { data: cur } = await supabase.from(row.table).select('attempts').eq('id', row.id).maybeSingle();
      await supabase.from(row.table).update({
        cache_status: outOfCredit || Number(cur?.attempts ?? 0) < 2 ? 'pending' : 'failed',
        attempts: Number(cur?.attempts ?? 0) + 1,
        error: message.slice(0, 300),
        claimed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (outOfCredit) break;
    }
  }
}

interface ShopProduct { external_id: string; title: string; image: string | null }

/** The merchant's shop, read live: Shopify's public products.json, else the WooCommerce Store API. */
async function readShop(origin: string): Promise<{ platform: 'shopify' | 'woocommerce'; products: ShopProduct[] } | null> {
  const get = async (path: string): Promise<unknown> => {
    try {
      const { text } = await fetchTextGuarded(origin + path, { maxBytes: 4 * 1024 * 1024, timeoutMs: 12_000, headers: { Accept: 'application/json' } });
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const shopify = await get('/products.json?limit=250') as { products?: Array<Record<string, any>> } | null;
  if (shopify && Array.isArray(shopify.products)) {
    return {
      platform: 'shopify',
      products: shopify.products.map((p) => ({
        external_id: `shopify:${p.id}`, title: String(p.title ?? '').slice(0, 200),
        image: typeof p.images?.[0]?.src === 'string' ? p.images[0].src : null,
      })),
    };
  }
  const woo = await get('/wp-json/wc/store/v1/products?per_page=100');
  if (Array.isArray(woo)) {
    return {
      platform: 'woocommerce',
      products: (woo as Array<Record<string, any>>).map((p) => ({
        external_id: `woo:${p.id}`, title: String(p.name ?? '').slice(0, 200),
        image: typeof p.images?.[0]?.src === 'string' ? p.images[0].src : null,
      })),
    };
  }
  return null;
}

/** Shop origins a merchant may manage: the allowed origins of the workspace's active embed keys. */
async function workspaceShopOrigins(supabase: DbClient, workspaceId: string): Promise<string[]> {
  const { data } = await supabase.from('material_kai_keys')
    .select('allowed_origins').eq('workspace_id', workspaceId).eq('is_active', true);
  const out = new Set<string>();
  for (const r of data ?? []) {
    for (const o of ((r as { allowed_origins: string[] | null }).allowed_origins ?? [])) {
      const n = normalizeShopOrigin(o);
      if (n) out.add(n);
    }
  }
  return [...out].sort();
}

const OVERLAY_COLUMNS = 'id, external_id, title, width_cm, height_cm, source_url, cache_status, storage_bucket, storage_object_path, error';

function overlayCm(v: unknown): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 3 && n <= 800 ? Math.round(n * 10) / 10 : NaN;
}

async function handleStore(
  supabase: DbClient, body: Record<string, unknown>, workspaceId: string, userId: string,
): Promise<Response> {
  const origins = await workspaceShopOrigins(supabase, workspaceId);
  if (body.action === 'store_origins') return json({ ok: true, origins });

  const origin = normalizeShopOrigin(body.origin);
  if (!origin || !origins.includes(origin)) {
    return json({ error: 'That shop is not an allowed origin of any active embed key in this workspace' }, 400);
  }

  const readOverlays = async (ids?: string[]) => {
    let q = supabase.from('store_product_overlays').select(OVERLAY_COLUMNS)
      .eq('workspace_id', workspaceId).eq('shop_origin', origin);
    if (ids) q = q.in('external_id', ids);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, any>>;
  };

  if (body.action === 'store_set_size') {
    const [externalId] = storeExternalIds([body.external_id], 1);
    if (!externalId) return json({ error: 'external_id must be shopify:<id> or woo:<id>' }, 400);
    const width = overlayCm(body.width_cm);
    const height = overlayCm(body.height_cm);
    if (Number.isNaN(width) || Number.isNaN(height)) return json({ error: 'Sizes are centimetres between 3 and 800' }, 400);
    const { error } = await supabase.from('store_product_overlays').upsert({
      workspace_id: workspaceId,
      shop_origin: origin,
      external_id: externalId,
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
      width_cm: width,
      height_cm: height,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,shop_origin,external_id' });
    if (error) return json({ error: 'Could not save the size' }, 500);
    return json({ ok: true });
  }

  const shop = await readShop(origin);
  if (!shop) return json({ error: `Could not read the products of ${origin}: it answered neither as Shopify nor as WooCommerce` }, 502);

  if (body.action === 'store_prepare') {
    const wanted = new Set(storeExternalIds(body.external_ids));
    const targets = shop.products.filter((p) => wanted.has(p.external_id) && p.image);
    if (targets.length === 0) return json({ error: 'external_ids is required' }, 400);
    const existing = new Map((await readOverlays(targets.map((t) => t.external_id))).map((r) => [r.external_id as string, r]));
    for (const t of targets) {
      const cur = existing.get(t.external_id);
      if (cur && cur.source_url === t.image && cur.cache_status !== 'none') continue;
      const { error } = await supabase.from('store_product_overlays').upsert({
        workspace_id: workspaceId, shop_origin: origin, external_id: t.external_id, title: t.title,
        source_url: t.image, cache_status: 'pending', attempts: 0, error: null, claimed_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,shop_origin,external_id' });
      if (error) return json({ error: 'Could not queue the cut-outs' }, 500);
    }
    const pending = (await readOverlays(targets.map((t) => t.external_id)))
      .filter((r) => r.cache_status === 'pending' && r.source_url)
      .map((r): CutoutTarget => ({
        table: 'store_product_overlays', id: r.id, sourceUrl: r.source_url, pathKey: `store/${r.id}`, productId: null,
      }));
    await runPending(supabase, pending, workspaceId, userId);
  } else if (body.action !== 'store_list') {
    return json({ error: 'Unknown store action' }, 400);
  }

  const overlays = new Map((await readOverlays()).map((r) => [r.external_id as string, r]));
  const base = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/`;
  return json({
    ok: true,
    platform: shop.platform,
    products: shop.products.map((p) => {
      const o = overlays.get(p.external_id);
      const outdated = !!o?.source_url && o.source_url !== p.image;
      return {
        external_id: p.external_id,
        title: p.title,
        image: p.image,
        width_cm: o?.width_cm == null ? null : Number(o.width_cm),
        height_cm: o?.height_cm == null ? null : Number(o.height_cm),
        cutout_status: outdated ? 'outdated' : (o?.cache_status ?? 'none'),
        cutout_url: !outdated && o?.cache_status === 'ready' && o.storage_object_path ? `${base}${o.storage_bucket}/${o.storage_object_path}` : null,
        cutout_error: o?.cache_status === 'failed' ? o.error : null,
      };
    }),
  });
}

Deno.serve(withApiLogging('product-cutouts', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = serviceClient();
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const { data: { user } } = await supabase.auth.getUser(jwt);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: { action?: string; workspace_id?: string; product_ids?: unknown } & Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const workspaceId = String(body.workspace_id ?? '');
  if (!workspaceId || !(await userHasWorkspaceCapability(supabase, user.id, workspaceId, 'pricing.manage'))) return json({ error: 'Not found' }, 404);
  if (typeof body.action === 'string' && body.action.startsWith('store_')) return await handleStore(supabase, body, workspaceId, user.id);

  const ids = Array.isArray(body.product_ids)
    ? body.product_ids.map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, MAX_PRODUCTS)
    : [];
  if (ids.length === 0) return json({ error: 'product_ids is required' }, 400);

  const { data: products, error: pErr } = await supabase.from('products')
    .select('id, metadata').eq('workspace_id', workspaceId).in('id', ids);
  if (pErr) return json({ error: 'Could not read the products' }, 500);
  const sources = new Map<string, string>();
  for (const p of products ?? []) {
    const url = imagesFromMetadata((p as { metadata: unknown }).metadata)[0];
    if (url) sources.set((p as { id: string }).id, url);
  }

  const readRows = async () => {
    const { data, error } = await supabase.from('product_cutouts')
      .select('id, product_id, source_url, cache_status, storage_object_path, error')
      .eq('workspace_id', workspaceId).in('product_id', [...sources.keys()]);
    if (error) throw new Error(error.message);
    return ((data ?? []) as CutoutRow[]).filter((r) => sources.get(r.product_id) === r.source_url);
  };

  if (body.action === 'prepare') {
    const existing = await readRows();
    const missing = [...sources].filter(([pid]) => !existing.some((r) => r.product_id === pid))
      .map(([pid, url]) => ({ workspace_id: workspaceId, product_id: pid, source_url: url }));
    if (missing.length) {
      const { error } = await supabase.from('product_cutouts').upsert(missing, { onConflict: 'product_id,source_url', ignoreDuplicates: true });
      if (error) return json({ error: 'Could not queue the cut-outs' }, 500);
    }

    const pending = (await readRows()).filter((r) => r.cache_status === 'pending').map((r): CutoutTarget => ({
      table: 'product_cutouts', id: r.id, sourceUrl: r.source_url, pathKey: r.product_id, productId: r.product_id,
    }));
    await runPending(supabase, pending, workspaceId, user.id);
  } else if (body.action !== 'status') {
    return json({ error: 'action must be prepare or status' }, 400);
  }

  const rows = await readRows();
  const base = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/`;
  return json({
    ok: true,
    no_image: ids.filter((id) => !sources.has(id)),
    cutouts: rows.map((r) => ({
      product_id: r.product_id,
      status: r.cache_status,
      url: r.storage_object_path ? base + r.storage_object_path : null,
      error: r.cache_status === 'ready' ? null : r.error,
    })),
  });
}));
