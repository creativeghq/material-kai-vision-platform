// deno-lint-ignore-file no-explicit-any
import { jsonResponse as json } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getStripe, getSupabase, noPaymentProviderResponse } from '../../_shared/stripe-clients.ts';

/**
 * Stripe Connect for per-workspace payouts (destination charges).
 * `connect-onboard` gets-or-creates the Express account and returns an onboarding link;
 * `connect-status` refreshes its flags. Funds routing lives in finance-pay-invoice.
 */
export async function handleConnect(req: Request, body: any): Promise<Response> {
  const stripe = await getStripe();
  const supabase = getSupabase();
  if (!stripe || !supabase) return noPaymentProviderResponse(corsHeaders);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.user) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  if (!workspaceId) return json({ error: 'workspace_id required' }, 400);

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!member || !['owner', 'admin'].includes((member as any).role)) {
    return json({ error: 'Not found' }, 404);
  }

  const { data: cfg } = await supabase
    .from('workspace_payment_config')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (body.action === 'connect-status') {
    if (!cfg?.stripe_connect_account_id) return json({ configured: false, charges_enabled: false });
    const acct = await stripe.accounts.retrieve(cfg.stripe_connect_account_id);
    await supabase.from('workspace_payment_config').update({
      charges_enabled: !!acct.charges_enabled,
      details_submitted: !!acct.details_submitted,
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId);
    return json({ configured: true, charges_enabled: !!acct.charges_enabled, details_submitted: !!acct.details_submitted });
  }

  let accountId = cfg?.stripe_connect_account_id as string | undefined;
  if (!accountId) {
    const acct = await stripe.accounts.create({ type: 'express' });
    accountId = acct.id;
    await supabase.from('workspace_payment_config').upsert({
      workspace_id: workspaceId,
      payout_mode: 'connect',
      stripe_connect_account_id: accountId,
      updated_at: new Date().toISOString(),
    });
  }

  const returnUrl = body.return_url || `${Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr'}/finance`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return json({ url: link.url, account_id: accountId });
}
