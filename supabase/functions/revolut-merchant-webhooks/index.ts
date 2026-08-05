/**
 * Revolut Merchant webhooks (#315, payments-revolut) — settlement for the checkout side.
 *
 * Two surfaces:
 *  - POST ?setup=1  (user JWT): registers the merchant webhook with the tenant's own
 *    secret key and stores the returned signing secret. The provider stays "not
 *    configured" until this succeeds — settlement depends on it.
 *  - POST ?ws=<id>  (Revolut): signed deliveries. HMAC v1.{timestamp}.{body} with the
 *    per-workspace signing secret, 5-minute window, timing-safe compare — the same
 *    doctrine as revolut-webhooks / stripe-webhooks (invariant 6, fail closed).
 *
 * THE WEBHOOK IS A TRIGGER, NEVER DATA: on ORDER_COMPLETED the order is re-read from
 * the Merchant API with the tenant's own key; amount/currency come from that read.
 */

// deno-lint-ignore-file no-explicit-any

import { authenticate } from '../_shared/auth.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { recordInvoicePayment } from '../_shared/payments/record-payment.ts';
import {
  merchantHeaders,
  retrieveMerchantOrder,
  revolutMerchantBase,
} from '../_shared/payments/revolut-provider.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(withApiLogging('revolut-merchant-webhooks', async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  await bootstrapForFunction();
  const url = new URL(req.url);

  const { createClient } = await import('@supabase/supabase-js');
  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ---- Setup surface (user-facing) -----------------------------------------
  if (url.searchParams.get('setup') === '1') {
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) throw new HttpError(401, 'unauthorized');
    const body = await req.json().catch(() => ({})) as { workspace_id?: string };
    const workspaceId = String(body?.workspace_id ?? '');
    if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
    const { data: isMgr } = await auth.supabaseAsUser!
      .rpc('is_workspace_finance_manager', { p_workspace_id: workspaceId });
    if (!isMgr) throw new HttpError(404, 'not found');
    if (!(await isWorkspaceEntitled(service, workspaceId, 'payments-revolut'))) {
      throw new HttpError(402, 'Revolut Checkout module is not enabled for this workspace');
    }

    const { data: cfg } = await service
      .from('workspace_revolut_merchant_config')
      .select('secret_key, environment')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!cfg?.secret_key) throw new HttpError(400, 'save the Merchant secret API key first');

    const hookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/revolut-merchant-webhooks?ws=${workspaceId}`;
    const res = await fetch(`${revolutMerchantBase(cfg.environment !== 'production')}/api/1.0/webhooks`, {
      method: 'POST',
      headers: merchantHeaders(cfg.secret_key),
      body: JSON.stringify({ url: hookUrl, events: ['ORDER_COMPLETED'] }),
    });
    const out = await res.json().catch(() => ({})) as { id?: string; signing_secret?: string };
    if (!res.ok || !out?.id || !out?.signing_secret) {
      throw new HttpError(502, `webhook registration failed (${res.status}): ${JSON.stringify(out).slice(0, 200)}`);
    }
    const { error } = await service.from('workspace_revolut_merchant_config').update({
      webhook_id: out.id,
      webhook_signing_secret: out.signing_secret,
      webhook_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId);
    if (error) throw new HttpError(500, `failed to store webhook: ${error.message}`);
    return json({ ok: true, webhook_url: hookUrl });
  }

  // ---- Delivery surface (Revolut-facing) -----------------------------------
  const ws = url.searchParams.get('ws') ?? '';
  const rawBody = await req.text();
  const signature = req.headers.get('Revolut-Signature');
  const timestamp = req.headers.get('Revolut-Request-Timestamp');
  if (!signature || !timestamp) return json({ error: 'missing signature headers' }, 400);

  const { data: cfg } = ws
    ? await service
      .from('workspace_revolut_merchant_config')
      .select('workspace_id, secret_key, environment, webhook_signing_secret')
      .eq('workspace_id', ws)
      .maybeSingle()
    : { data: null };
  if (!cfg) return json({ ok: true, ignored: true }); // no workspace enumeration
  if (!cfg.webhook_signing_secret) return json({ error: 'revolut_merchant_webhook_not_configured' }, 503);

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 300_000) {
    return json({ error: 'timestamp outside tolerance' }, 400);
  }
  const expected = await hmacHex(cfg.webhook_signing_secret, `v1.${timestamp}.${rawBody}`);
  const provided = signature.startsWith('v1=') ? signature.slice(3) : signature;
  if (!timingSafeEqual(expected, provided.toLowerCase())) return json({ error: 'invalid signature' }, 400);

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return json({ error: 'invalid JSON' }, 400); }
  if (String(event?.event ?? '') !== 'ORDER_COMPLETED') return json({ ok: true, ignored: true });
  const orderId = String(event?.order_id ?? '');
  if (!orderId) return json({ ok: true, ignored: true });

  // Map the order back to OUR intent — never trust provider-supplied identity.
  const { data: intent } = await service
    .from('invoice_payment_intents')
    .select('id, invoice_id, workspace_id, status')
    .eq('provider', 'revolut')
    .eq('provider_order_code', orderId)
    .maybeSingle();
  if (!intent) return json({ ok: true, ignored: true });
  if (intent.workspace_id !== cfg.workspace_id) return json({ ok: true, ignored: true }); // cross-tenant guard
  if (intent.status === 'paid') return json({ ok: true, duplicate: true });

  // Re-read the order for the money facts.
  const order = await retrieveMerchantOrder(cfg.secret_key, cfg.environment !== 'production', orderId);
  if (!order) return json({ error: 'order read-back failed' }, 502);
  if (String(order.state ?? '').toLowerCase() !== 'completed') return json({ ok: true, ignored: true });
  const amountMajor = Number(order.order_amount?.value ?? 0) / 100;
  const currency = String(order.order_amount?.currency ?? 'EUR');
  if (!(amountMajor > 0)) return json({ error: 'order has no amount' }, 502);

  const result = await recordInvoicePayment(service, intent.invoice_id, {
    provider: 'revolut',
    providerRef: orderId,
    providerLabel: 'Revolut',
    amount: amountMajor,
    currency,
    method: 'card',
  });
  if (!result.ok) return json({ error: result.error ?? 'ingest failed' }, 500);

  await service.from('invoice_payment_intents')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', intent.id);
  return json({ ok: true, paymentId: result.paymentId ?? null });
}));
