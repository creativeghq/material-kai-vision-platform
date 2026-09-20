import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, getUserId, userCanAccessWorkspace, isServiceRoleRequest } from '../_shared/auth.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

type Row = Record<string, unknown>;

const publicApiUrl = () => Deno.env.get('SUPABASE_URL') ?? '';

async function pushShopify(store: string, creds: Record<string, string>, apiVersion: string,
  externalOrderId: string, link: string, number: string): Promise<void> {
  const token = creds.admin_token;
  if (!token) throw new HttpError(400, 'This connection has no Shopify Admin token.');
  const res = await fetch(`${store}/admin/api/${apiVersion}/orders/${externalOrderId}/metafields.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metafield: { namespace: 'materialkai', key: 'document_url', type: 'url', value: link },
    }),
  });
  if (!res.ok) throw new HttpError(502, `Shopify refused the metafield: ${res.status} ${await res.text()}`);

  await fetch(`${store}/admin/api/${apiVersion}/orders/${externalOrderId}/metafields.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metafield: { namespace: 'materialkai', key: 'document_number', type: 'single_line_text_field', value: number },
    }),
  });
}

async function pushWoo(store: string, creds: Record<string, string>,
  externalOrderId: string, link: string, number: string): Promise<void> {
  const key = creds.consumer_key;
  const secret = creds.consumer_secret;
  if (!key || !secret) throw new HttpError(400, 'This connection has no WooCommerce consumer key and secret.');
  const auth = `Basic ${btoa(`${key}:${secret}`)}`;

  const res = await fetch(`${store}/wp-json/wc/v3/orders/${externalOrderId}`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meta_data: [
        { key: '_materialkai_document_url', value: link },
        { key: '_materialkai_document_number', value: number },
      ],
    }),
  });
  if (!res.ok) throw new HttpError(502, `WooCommerce refused the update: ${res.status} ${await res.text()}`);

  await fetch(`${store}/wp-json/wc/v3/orders/${externalOrderId}/notes`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: `Invoice ${number}: ${link}`, customer_note: true }),
  });
}

Deno.serve(withApiLogging('store-document-writeback', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const body = await req.json().catch(() => ({}));
  const invoiceId = String(body?.invoice_id ?? '');
  if (!invoiceId) throw new HttpError(400, 'invoice_id is required');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: inv } = await admin
    .from('invoices')
    .select('id, workspace_id, order_id, status, internal_number, legal_number, pdf_storage_path')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv) throw new HttpError(404, 'Not found');

  if (!isServiceRoleRequest(req)) {
    const auth = await authenticate(req, { requireUser: true });
    const userId = getUserId(auth);
    if (!userId || !await userCanAccessWorkspace(admin, userId, inv.workspace_id)) {
      throw new HttpError(404, 'Not found');
    }
  }

  if (String(inv.status ?? '') === 'draft') {
    throw new HttpError(409, 'That document has not been issued, so there is nothing to hand back.');
  }

  const { data: order } = await admin.from('orders')
    .select('id, store_order_id').eq('id', inv.order_id).maybeSingle();
  if (!order?.store_order_id) throw new HttpError(409, 'That invoice did not come from a sales channel.');

  const { data: so } = await admin.from('store_orders')
    .select('id, connection_id, platform, external_order_id').eq('id', order.store_order_id).maybeSingle();
  const { data: conn } = await admin.from('store_connections')
    .select('id, workspace_id, platform, store_url, api_version, credentials').eq('id', so!.connection_id).maybeSingle();
  if (!so || !conn) throw new HttpError(404, 'Not found');

  const store = String(conn.store_url ?? '').replace(/\/+$/, '');
  if (!store) throw new HttpError(400, 'This connection has no store URL.');
  try {
    await assertSafeUrl(store, { allowSchemes: ['https:'] });
  } catch (err) {
    if (err instanceof SSRFError) throw new HttpError(400, `That store URL cannot be reached: ${err.message}`);
    throw err;
  }

  const { data: token, error: tokenErr } = await admin.rpc('mint_invoice_document_token', { p_invoice_id: invoiceId });
  if (tokenErr || !token) throw new HttpError(500, `Could not mint a document link: ${tokenErr?.message ?? 'no token'}`);

  const link = `${publicApiUrl().replace(/\/$/, '')}/functions/v1/finance-document-link?token=${encodeURIComponent(String(token))}`;
  const number = String(inv.internal_number ?? inv.legal_number ?? '');

  try {
    if (conn.platform === 'shopify') {
      await pushShopify(store, (conn.credentials ?? {}) as Record<string, string>,
        String(conn.api_version ?? '2025-07'), String(so.external_order_id), link, number);
    } else if (conn.platform === 'woocommerce') {
      await pushWoo(store, (conn.credentials ?? {}) as Record<string, string>,
        String(so.external_order_id), link, number);
    } else {
      throw new HttpError(400, `Write-back is not implemented for ${String(conn.platform)}.`);
    }
  } catch (err) {
    await admin.from('store_order_sync_log').insert({
      workspace_id: inv.workspace_id, connection_id: conn.id, platform: conn.platform,
      external_order_id: so.external_order_id, event_type: 'document_writeback', outcome: 'error',
      order_id: order.id, invoice_id: inv.id,
      message: err instanceof Error ? err.message : String(err),
    } as Row);
    throw err;
  }

  await admin.from('store_order_sync_log').insert({
    workspace_id: inv.workspace_id, connection_id: conn.id, platform: conn.platform,
    external_order_id: so.external_order_id, event_type: 'document_writeback', outcome: 'updated',
    order_id: order.id, invoice_id: inv.id,
    message: `Handed ${number} back to ${conn.platform}.`,
  } as Row);

  return json({ ok: true, link, number, platform: conn.platform });
}));
