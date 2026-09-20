import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from '../_shared/auth.ts';
import { ADAPTERS, type AdapterConnection } from '../_shared/commerce/adapters.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

type Row = Record<string, unknown>;

async function fetchUpstream(
  conn: Row, sinceIso: string, limit: number,
): Promise<{ orders: unknown[]; note: string }> {
  const creds = (conn.credentials ?? {}) as Record<string, string>;
  const store = String(conn.store_url ?? '').replace(/\/+$/, '');
  if (!store) throw new HttpError(400, 'This connection has no store URL, so there is nowhere to pull from.');
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
    const url = `${store}/admin/api/${version}/orders.json?status=any&limit=${limit}`
      + `&updated_at_min=${encodeURIComponent(sinceIso)}`;
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new HttpError(502, `Shopify refused the pull: ${res.status} ${await res.text()}`);
    const body = await res.json();
    return { orders: body?.orders ?? [], note: `Shopify ${version}` };
  }

  if (conn.platform === 'woocommerce') {
    const key = creds.consumer_key;
    const secret = creds.consumer_secret;
    if (!key || !secret) throw new HttpError(400, 'This connection has no WooCommerce consumer key and secret.');
    const url = `${store}/wp-json/wc/v3/orders?per_page=${limit}&after=${encodeURIComponent(sinceIso)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
    });
    if (!res.ok) throw new HttpError(502, `WooCommerce refused the pull: ${res.status} ${await res.text()}`);
    return { orders: await res.json(), note: 'WooCommerce v3' };
  }

  throw new HttpError(400, `Pulling is not implemented for ${String(conn.platform)}.`);
}

function observedKeys(platform: string, orders: readonly unknown[]): { key: string; seen: number }[] {
  const counts = new Map<string, number>();
  for (const o of orders) {
    const order = o as Row;
    const bag = platform === 'shopify'
      ? (Array.isArray(order.note_attributes) ? order.note_attributes as Row[] : [])
      : (Array.isArray(order.meta_data) ? order.meta_data as Row[] : []);
    for (const entry of bag) {
      const name = String((platform === 'shopify' ? entry.name : entry.key) ?? '').trim();
      const value = String(entry.value ?? '').trim();
      if (!name || !value) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, seen]) => ({ key, seen }))
    .sort((a, b) => b.seen - a.seen)
    .slice(0, 25);
}

Deno.serve(withApiLogging('store-orders-sync', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const body = await req.json().catch(() => ({}));
  const connectionId = String(body?.connection_id ?? '');
  const days = Math.min(Math.max(Number(body?.days ?? 7), 1), 90);
  const discoverOnly = Boolean(body?.discover_only);
  if (!connectionId) throw new HttpError(400, 'connection_id is required');

  const auth = await authenticate(req, { requireUser: true });
  const userId = getUserId(auth);
  if (!userId) throw new HttpError(401, 'Sign in first');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: conn } = await admin
    .from('store_connections')
    .select('id, workspace_id, platform, store_url, api_version, credentials, vat_number_key, invoice_request_key')
    .eq('id', connectionId)
    .maybeSingle();
  if (!conn) throw new HttpError(404, 'Not found');

  if (!await userCanAccessWorkspace(admin, userId, conn.workspace_id)) {
    throw new HttpError(404, 'Not found');
  }

  const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
  const { orders, note } = await fetchUpstream(conn as Row, sinceIso, 100);

  const keys = observedKeys(String(conn.platform), orders);
  if (discoverOnly) {
    return json({ ok: true, scanned: orders.length, keys, note });
  }

  const adapt = ADAPTERS[String(conn.platform)] ?? ADAPTERS.generic;
  let created = 0; let duplicate = 0; let review = 0; let failed = 0;

  for (const raw of orders) {
    try {
      const canonical = adapt(raw, conn as unknown as AdapterConnection, 'backfill');
      if (!canonical.external_order_id) { failed += 1; continue; }
      const { data, error } = await admin.rpc('upsert_inbound_order', {
        p_connection_id: conn.id, p_payload: canonical,
      });
      if (error) { failed += 1; continue; }
      const outcome = (data as Row)?.outcome;
      if (outcome === 'skipped_dupe') duplicate += 1;
      else if (outcome === 'needs_review') review += 1;
      else created += 1;
    } catch { failed += 1; }
  }

  await admin.from('store_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', conn.id);

  return json({ ok: true, scanned: orders.length, created, duplicate, review, failed, keys, note });
}));
