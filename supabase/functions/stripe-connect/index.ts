// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getStripe, noPaymentProviderResponse } from '../_shared/stripe-clients.ts';

// Stripe Connect onboarding for per-workspace payouts (destination charges).
// Actions: onboard (get-or-create Express account + account link), status (refresh flags).
// Funds routing lives in finance-pay-invoice via get_workspace_payout_account().

interface Body {
  action: 'onboard' | 'status';
  workspace_id: string;
  return_url?: string;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(withApiLogging('stripe-connect', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  await bootstrapForFunction();
  const stripe = getStripe();
  if (!stripe) return noPaymentProviderResponse(corsHeaders);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.user) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.workspace_id) return json({ error: 'workspace_id required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // The caller must own/admin the workspace.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', body.workspace_id)
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!member || !['owner', 'admin'].includes(member.role)) {
    return json({ error: 'not authorized for this workspace' }, 403);
  }

  const { data: cfg } = await supabase
    .from('workspace_payment_config')
    .select('*')
    .eq('workspace_id', body.workspace_id)
    .maybeSingle();

  if (body.action === 'status') {
    if (!cfg?.stripe_connect_account_id) return json({ configured: false, charges_enabled: false });
    const acct = await stripe.accounts.retrieve(cfg.stripe_connect_account_id);
    await supabase.from('workspace_payment_config').update({
      charges_enabled: !!acct.charges_enabled,
      details_submitted: !!acct.details_submitted,
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', body.workspace_id);
    return json({ configured: true, charges_enabled: !!acct.charges_enabled, details_submitted: !!acct.details_submitted });
  }

  // onboard: get-or-create the Express account, then return a fresh onboarding link.
  let accountId = cfg?.stripe_connect_account_id as string | undefined;
  if (!accountId) {
    const acct = await stripe.accounts.create({ type: 'express' });
    accountId = acct.id;
    await supabase.from('workspace_payment_config').upsert({
      workspace_id: body.workspace_id,
      payout_mode: 'connect',
      stripe_connect_account_id: accountId,
      updated_at: new Date().toISOString(),
    });
  }

  const returnUrl = body.return_url || `${Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr'}/admin/finance`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return json({ url: link.url, account_id: accountId });
}));
