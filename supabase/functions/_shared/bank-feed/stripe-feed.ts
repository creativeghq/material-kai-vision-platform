/**
 * Stripe balance transactions → the unified bank feed (#315).
 *
 * Pulls the TENANT's own Connect balance history (charges, payouts, fees, refunds) so
 * the Finance → Bank feed shows Stripe money next to Revolut and Viva. Rows are
 * INFORMATIONAL: their settlement already happened through stripe-webhooks →
 * record-payment, so they land as match_status 'ignored' and the auto-matchers skip
 * every non-revolut provider — nothing here can double-book.
 *
 * Only runs for workspaces with a LIVE Connect account (platform-collect money is the
 * operator's, not the tenant's, and has no place in their feed).
 */

// deno-lint-ignore-file no-explicit-any

import { getStripe } from '../stripe-clients.ts';

export async function syncStripeFeed(service: any, workspaceId: string): Promise<number> {
  const stripe = getStripe();
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
    { limit: 100 },
    { stripeAccount: pc.stripe_connect_account_id },
  );

  const now = new Date().toISOString();
  const rows = (txns?.data ?? []).map((t: any) => ({
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
    counterparty_name: t.description ?? null,
    reference: t.description ?? null,
    match_status: 'ignored', // settled by the Stripe webhook path; informational here
    raw: { id: t.id, type: t.type, status: t.status },
    updated_at: now,
  }));
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
