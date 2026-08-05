/**
 * Revolut Merchant API as a `PaymentProvider` (per-tenant BYOK) — #315.
 *
 * SEPARATE product from the banking-revolut module: this is the checkout side
 * (hosted payment page covering cards, Revolut Pay, Apple/Google Pay, Pay by Bank),
 * authenticated by the workspace's own Merchant **secret API key** — no OAuth, no
 * certificates. Funds settle to the tenant's Revolut Merchant account.
 *
 * Charge flow: create an order → send the buyer to Revolut's hosted checkout_url →
 * ORDER_COMPLETED webhook → `revolut-merchant-webhooks` re-reads the order with the
 * tenant's own key (webhook-as-trigger doctrine) → record-payment.
 *
 * Docs: https://developer.revolut.com/docs/api/merchant — the Api-Version header is
 * mandatory; bump deliberately, never implicitly.
 */

import type {
  ChargeResult,
  CreateChargeInput,
  PaymentProvider,
  PaymentProviderContext,
} from './types.ts';

export const REVOLUT_MERCHANT_API_VERSION = '2024-09-01';

export function revolutMerchantBase(isSandbox: boolean): string {
  return isSandbox ? 'https://sandbox-merchant.revolut.com' : 'https://merchant.revolut.com';
}

export function merchantHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Revolut-Api-Version': REVOLUT_MERCHANT_API_VERSION,
    'Content-Type': 'application/json',
  };
}

async function resolveContext(supabase: any, workspaceId: string): Promise<PaymentProviderContext | null> {
  const { data } = await supabase
    .from('workspace_revolut_merchant_config')
    .select('secret_key, environment, enabled, webhook_signing_secret')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data || !data.enabled) return null;
  if (!data.secret_key) return null;
  // Settlement depends on the webhook — an unregistered webhook means paid orders would
  // never mark invoices paid, so the provider is "not configured" until it exists.
  if (!data.webhook_signing_secret) return null;
  return {
    workspaceId,
    credentials: { secret_key: data.secret_key },
    isSandbox: data.environment !== 'production',
  };
}

async function createCharge(input: CreateChargeInput, ctx: PaymentProviderContext): Promise<ChargeResult> {
  const base = revolutMerchantBase(ctx.isSandbox);
  const res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: merchantHeaders(ctx.credentials.secret_key),
    body: JSON.stringify({
      // Merchant API wants MINOR units.
      amount: Math.round(input.amount * 100),
      currency: input.currency.toUpperCase(),
      description: input.description,
      merchant_order_data: { reference: input.invoiceNumber },
      ...(input.successUrl ? { redirect_url: input.successUrl } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Revolut order create failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const out = await res.json() as { id?: string; checkout_url?: string; token?: string };
  if (!out?.id || !out?.checkout_url) {
    throw new Error('Revolut order response missing id/checkout_url');
  }
  return { kind: 'redirect', url: out.checkout_url, orderCode: out.id };
}

/** Re-read an order server-side — the webhook body is a trigger, never trusted data. */
export async function retrieveMerchantOrder(
  secretKey: string,
  isSandbox: boolean,
  orderId: string,
): Promise<{ state?: string; order_amount?: { value?: number; currency?: string } } | null> {
  const res = await fetch(`${revolutMerchantBase(isSandbox)}/api/orders/${orderId}`, {
    headers: merchantHeaders(secretKey),
  });
  if (!res.ok) return null;
  return await res.json();
}

export const revolutProvider: PaymentProvider = {
  slug: 'revolut',
  label: 'Revolut',
  // One method kind: Revolut's HOSTED page fans out to cards / Revolut Pay /
  // Apple & Google Pay / Pay by Bank on its own.
  methods: ['card'],
  currencies: null,
  resolveContext,
  createCharge,
};
