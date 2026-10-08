/** Product in Place (#474): one background-removed PNG per product image, made once and served to the embed. */
import { serviceClient, type DbClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { replicateToken } from '../_shared/replicate-token.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { captureException } from '../_shared/sentry.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { fetchImageGuarded } from '../_shared/fetch-image.ts';
import { imagesFromMetadata } from '../_shared/product-media.ts';
import { pngInfo } from '../_shared/png-info.ts';

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

async function processRow(supabase: DbClient, row: CutoutRow, workspaceId: string, userId: string): Promise<void> {
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
    await assertSafeUrl(row.source_url);
    const outUrl = await removeBackground(row.source_url);
    const { bytes } = await fetchImageGuarded(outUrl, { maxBytes: 20 * 1024 * 1024 });
    const info = pngInfo(bytes);
    if (!info) throw new Error('The cut-out is not a PNG');
    if (!info.hasAlpha) throw new Error('The cut-out has no transparency');

    const path = `cutouts/${workspaceId}/${row.product_id}/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png' });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const { error: rowErr } = await supabase.from('product_cutouts').update({
      cache_status: 'ready', storage_bucket: BUCKET, storage_object_path: path, width: info.width, height: info.height,
      method: `replicate:${MODEL}`, error: null, claimed_at: null, updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (rowErr) throw new Error(`Recording the cut-out failed: ${rowErr.message}`);

    const pricing = await getServicePricing(supabase, PRICING_KEY);
    const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      workspace_id: workspaceId,
      product_id: row.product_id,
      operation_type: 'product_cutout',
      model_name: PRICING_KEY,
      credits_debited: CREDIT_COST,
      raw_cost_usd: pricing?.cost_per_unit ?? null,
      billed_cost_usd: pricing ? pricing.cost_per_unit * pricing.markup_multiplier : null,
      markup_multiplier: pricing?.markup_multiplier ?? null,
      metadata: { success: true, billing_type: 'per_unit', units: 1, cutout_id: row.id },
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

Deno.serve(withApiLogging('product-cutouts', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = serviceClient();
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const { data: { user } } = await supabase.auth.getUser(jwt);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: { action?: string; workspace_id?: string; product_ids?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const workspaceId = String(body.workspace_id ?? '');
  if (!workspaceId || !(await userCanAccessWorkspace(supabase, user.id, workspaceId))) return json({ error: 'Not found' }, 404);

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

    const started = Date.now();
    let lastCreate = 0;
    for (const row of (await readRows()).filter((r) => r.cache_status === 'pending')) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      const stale = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
      const { data: claimed } = await supabase.from('product_cutouts')
        .update({ claimed_at: new Date().toISOString() })
        .eq('id', row.id).eq('cache_status', 'pending')
        .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
        .select('id');
      if (!claimed?.length) continue;

      const wait = lastCreate + CREATE_SPACING_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCreate = Date.now();
      try {
        await processRow(supabase, row, workspaceId, user.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const outOfCredit = /insufficient credits/i.test(message);
        const { data: cur } = await supabase.from('product_cutouts').select('attempts').eq('id', row.id).maybeSingle();
        await supabase.from('product_cutouts').update({
          cache_status: outOfCredit || Number(cur?.attempts ?? 0) < 2 ? 'pending' : 'failed',
          attempts: Number(cur?.attempts ?? 0) + 1,
          error: message.slice(0, 300),
          claimed_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        if (outOfCredit) break;
      }
    }
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
