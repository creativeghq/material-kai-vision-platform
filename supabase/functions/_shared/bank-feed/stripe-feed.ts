/** Stripe balance transactions → the unified bank feed (#315). */

// deno-lint-ignore-file no-explicit-any

import { getStripe } from '../stripe-clients.ts';

export async function syncStripeFeed(service: any, workspaceId: string): Promise<number> {
  const stripe = await getStripe();
  if (!stripe) return 0;

  const { data: pc } = await service
    .from('workspace_payment_config')
    .select('stripe_connect_account_id, charges_enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!pc?.stripe_connect_account_id || !pc?.charges_enabled) return 0;

  const { data: acct } = await service
    .from('finance_bank_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider_slug', 'stripe')
    .eq('is_active', true)
    .maybeSingle();

  const txns = await stripe.balanceTransactions.list(
    { limit: 100, expand: ['data.source'] },
    { stripeAccount: pc.stripe_connect_account_id },
  );

  const now = new Date().toISOString();
  const rows = (txns?.data ?? []).map((t: any) => {
    const src = t.source && typeof t.source === 'object' ? t.source : null;
    const payer = src?.billing_details?.name ?? src?.customer_details?.name ?? null;
    return {
    workspace_id: workspaceId,
    provider: 'stripe',
    provider_ref: t.id,
    transaction_id: t.id,
    revolut_account_id: 'stripe-balance', // NOT NULL column; sentinel for non-revolut rows
    bank_account_id: acct?.id ?? null,
    state: t.status === 'available' ? 'completed' : 'pending',
    type: t.type,
    direction: Number(t.amount) >= 0 ? 'in' : 'out',
    amount: Math.abs(Number(t.amount)) / 100,
    currency: String(t.currency ?? 'eur').toUpperCase(),
    booked_at: new Date(Number(t.created) * 1000).toISOString(),
    counterparty_name: payer,
    reference: t.description ?? null,
    match_status: 'ignored', // settled by the Stripe webhook path; informational here
    raw: {
      id: t.id, type: t.type, status: t.status,
      source_id: typeof t.source === 'string' ? t.source : src?.id ?? null,
      fee: Number(t.fee ?? 0) / 100,
      net: Number(t.net ?? 0) / 100,
      available_on: t.available_on ? new Date(Number(t.available_on) * 1000).toISOString() : null,
      reporting_category: t.reporting_category ?? null,
      payer_name: payer,
      payer_email: src?.billing_details?.email ?? src?.receipt_email ?? null,
      card_last4: src?.payment_method_details?.card?.last4 ?? null,
      card_brand: src?.payment_method_details?.card?.brand ?? null,
      card_country: src?.payment_method_details?.card?.country ?? null,
    },
    updated_at: now,
    };
  });
  if (rows.length === 0) return 0;

  const { error } = await service
    .from('revolut_bank_transactions')
    .upsert(rows, { onConflict: 'workspace_id,provider,provider_ref' });
  if (error) {
    console.warn('[bank-feed/stripe] upsert failed:', error.message);
    return 0;
  }
  return rows.length;
}
