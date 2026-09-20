// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { readVerifiedWebhook, WebhookRefusal, type WebhookScheme } from '../_shared/commerce/verify.ts';
import { ADAPTERS, type AdapterConnection } from '../_shared/commerce/adapters.ts';

const SCHEMES: Record<string, WebhookScheme> = {
  shopify: 'shopify', woocommerce: 'woocommerce', generic: 'generic', skroutz: 'generic',
};

Deno.serve(withApiLogging('store-orders-webhook', async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const url = new URL(req.url);
  const connectionId = url.searchParams.get('connection');
  if (!connectionId) throw new HttpError(400, 'connection is required');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: conn } = await supabase
    .from('store_connections')
    .select('id, workspace_id, platform, store_url, webhook_secret, enabled, auto_issue_document, auto_send_document_back, vat_number_key, invoice_request_key')
    .eq('id', connectionId)
    .maybeSingle();

  // 404 rather than 403 on an unknown or disabled connection: invariant 1's anti-enumeration rule.
  if (!conn || !conn.enabled) throw new HttpError(404, 'Not found');

  const scheme = SCHEMES[conn.platform] ?? 'generic';
  let body: any;
  try {
    ({ body } = await readVerifiedWebhook(req, conn as any, scheme));
  } catch (err) {
    if (err instanceof WebhookRefusal) {
      await supabase.from('store_order_sync_log').insert({
        workspace_id: conn.workspace_id, connection_id: conn.id, platform: conn.platform,
        outcome: 'error', message: `Refused (${err.status}): ${err.message}`,
      });
      throw new HttpError(err.status, err.message);
    }
    throw err;
  }

  const eventType = req.headers.get('x-shopify-topic')
    ?? req.headers.get('x-wc-webhook-topic')
    ?? url.searchParams.get('event');

  const adapt = ADAPTERS[conn.platform] ?? ADAPTERS.generic;
  const canonical = adapt(body, conn as AdapterConnection, eventType);

  if (!canonical.external_order_id) {
    await supabase.from('store_order_sync_log').insert({
      workspace_id: conn.workspace_id, connection_id: conn.id, platform: conn.platform,
      event_type: eventType, outcome: 'error',
      message: 'The payload carried no order id, so it cannot be deduplicated or matched.',
    });
    throw new HttpError(400, 'Payload has no order id');
  }

  const { data: result, error } = await supabase.rpc('upsert_inbound_order', {
    p_connection_id: conn.id,
    p_payload: canonical,
  });

  if (error) {
    await supabase.from('store_order_sync_log').insert({
      workspace_id: conn.workspace_id, connection_id: conn.id, platform: conn.platform,
      external_order_id: canonical.external_order_id, event_type: eventType,
      outcome: 'error', message: error.message,
    });
    throw new HttpError(500, `Could not record the order: ${error.message}`);
  }

  await supabase.from('store_connections')
    .update({ last_sync_at: new Date().toISOString(), last_error: null })
    .eq('id', conn.id);

  const outcome = (result as Record<string, unknown>)?.outcome;
  let document: unknown = null;
  if (conn.auto_issue_document && outcome === 'created') {
    const orderId = (result as Record<string, unknown>).order_id as string | undefined;
    if (orderId) {
      const { data: doc } = await supabase.rpc('issue_document_for_store_order', { p_order_id: orderId });
      document = doc ?? null;
      const invoiceId = (doc as Record<string, unknown> | null)?.invoice_id as string | undefined;
      if (conn.auto_send_document_back && invoiceId && (doc as Record<string, unknown>)?.outcome === 'issued') {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/store-document-writeback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ invoice_id: invoiceId }),
        }).catch(() => { });
      }
    }
  }

  // 200 even for needs_review: a non-2xx makes both platforms retry a delivery we already stored.
  return json({ ok: true, ...(result as Record<string, unknown>), document }, 200);
}));
