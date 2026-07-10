// #251 module framework — owner self-serve module activation + add-on billing.
//
// Actions (dispatched from stripe-api/index.ts):
//   activate-module    { workspace_id, module_slug, successUrl?, cancelUrl? }
//   deactivate-module  { workspace_id, module_slug }
//   request-module     { workspace_id, module_slug }   (non-owner → notify owner)
//   list-stripe-products                               (operator only)
//
// An add-on module binds to a Stripe PRODUCT (1:1). The charge uses that product's
// default_price, resolved fresh at activation — so it's always the current price and two
// modules can never collide on a shared price id.
//
// Security baseline (#250 / #251):
//   - authenticate() returns a service-role client (RLS bypassed) → we bind every
//     action to the CALLER, never to a body-supplied id. Activation requires the
//     caller to be the OWNER of the target workspace (or the platform operator).
//   - Entitlement grants for PAID add-ons happen ONLY in the signature-verified
//     stripe-webhooks handler. Here we only grant the FREE (plan-covered) path,
//     after verifying owner + that the plan tier already covers the module.

import type { SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, isAdminAccess, userCanAccessWorkspace, type AuthResult } from '../../_shared/auth.ts';
import { emitFlowEvent } from '../../_shared/flow-events.ts';
import {
  getPlatformBillingStripe,
  getSupabase,
  noPaymentProviderResponse,
  hasDistinctBillingAccount,
} from '../../_shared/stripe-clients.ts';

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
function tierRank(tier: string | null | undefined): number {
  return TIER_RANK[(tier || '').toLowerCase()] ?? 999;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** True when the user is the OWNER of this exact workspace, or the platform operator. */
async function isOwnerOrOperator(
  service: SupabaseClient,
  userId: string | null,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  if (!userId || !workspaceId) return false;
  const { data: mem } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (mem && mem.role === 'owner') return true;
  return isOperator(service, userId);
}

/** Platform operator = owner/admin of a root workspace. */
async function isOperator(service: SupabaseClient, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await service
    .from('workspace_members')
    .select('role, workspaces!inner(is_root)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin']);
  return !!(data || []).some((r: { workspaces?: { is_root?: boolean } }) => r.workspaces?.is_root);
}

export async function handleModuleAction(req: Request, body: Record<string, unknown>): Promise<Response> {
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success) return json({ error: auth.error || 'Unauthorized' }, 401);

  const action = String(body.action);
  switch (action) {
    case 'activate-module':
      return activateModule(auth, body);
    case 'deactivate-module':
      return deactivateModule(auth, body);
    case 'request-module':
      return requestModule(auth, body);
    case 'list-stripe-products':
      return listStripeProducts(auth);
    default:
      return json({ error: `Unknown module action '${action}'` }, 400);
  }
}

async function activateModule(auth: AuthResult, body: Record<string, unknown>): Promise<Response> {
  const service = auth.supabase;
  const userId = auth.userId;
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : null;
  const moduleSlug = typeof body.module_slug === 'string' ? body.module_slug : null;
  if (!workspaceId || !moduleSlug) return json({ error: 'workspace_id and module_slug are required' }, 400);

  // Bind to caller — never trust the body's workspace_id alone (systemic root #2).
  if (!(await isOwnerOrOperator(service, userId, workspaceId))) {
    return json({ error: 'Only the workspace owner can activate modules', code: 'not_owner' }, 403);
  }

  const { data: mod } = await service
    .from('modules')
    .select('slug, name, enabled, is_addon, addon_stripe_product_id, price_tier')
    .eq('slug', moduleSlug)
    .maybeSingle();
  if (!mod) return json({ error: `Unknown module '${moduleSlug}'`, code: 'unknown_module' }, 404);
  if (!mod.enabled) return json({ error: 'Module is not published', code: 'not_published' }, 400);

  // Already activated?
  const { data: existing } = await service
    .from('workspace_module_entitlements')
    .select('enabled')
    .eq('workspace_id', workspaceId)
    .eq('module_slug', moduleSlug)
    .maybeSingle();
  if (existing?.enabled) return json({ activated: true, already: true, module: moduleSlug });

  // Guard against a duplicate subscription: a reload / double-click / stale tab would otherwise
  // create a SECOND Stripe subscription whose webhook upsert overwrites the first's tracking row
  // (unique on workspace_id+module_slug), leaving the first billing forever with no way to cancel it.
  const { data: liveSub } = await service
    .from('workspace_module_subscriptions')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('module_slug', moduleSlug)
    .in('status', ['active', 'trialing', 'past_due', 'canceling'])
    .maybeSingle();
  if (liveSub) return json({ activated: true, already: true, module: moduleSlug, status: liveSub.status });

  // FREE path: the workspace's plan tier already covers this module → grant now.
  const { data: planLevel } = await service.rpc('workspace_plan_level', { p_workspace_id: workspaceId });
  // A paid add-on bound to a Stripe product must NOT be free-granted just because its price_tier was
  // left at the free tier (rank 0) — that would give the add-on away to everyone. `price_tier` on an
  // add-on means "the plan tier that INCLUDES it for free"; a free-tier value on a product-bound add-on
  // is a misconfiguration, so route it to the paid path instead. (Legit "included in Pro, add-on on
  // Free" modules carry a non-free price_tier, so a Pro workspace still gets them free here.)
  const isPaidAddon = mod.is_addon === true && !!mod.addon_stripe_product_id;
  const covered = tierRank(mod.price_tier as string) <= (Number(planLevel) || 0)
    && !(isPaidAddon && tierRank(mod.price_tier as string) <= 0);
  if (covered) {
    const { error } = await service.from('workspace_module_entitlements').upsert(
      { workspace_id: workspaceId, module_slug: moduleSlug, enabled: true, granted_by: userId },
      { onConflict: 'workspace_id,module_slug' },
    );
    if (error) return json({ error: error.message }, 500);
    return json({ activated: true, free: true, module: moduleSlug });
  }

  // PAID path: create a recurring Stripe checkout. The webhook grants the entitlement.
  if (!mod.is_addon || !mod.addon_stripe_product_id) {
    return json(
      { error: 'This module is not included in your plan and is not available as an add-on.', code: 'not_available_on_plan' },
      400,
    );
  }

  const stripe = getPlatformBillingStripe();
  const supabase = getSupabase();
  if (!stripe || !supabase) return noPaymentProviderResponse(corsHeaders);

  // Resolve the bound product's CURRENT default price (always fresh — never a cached id).
  const product = await stripe.products.retrieve(mod.addon_stripe_product_id as string, { expand: ['default_price'] });
  const dp = product.default_price;
  const priceObj = dp && typeof dp === 'object' ? dp : null;
  if (!priceObj || !priceObj.recurring || priceObj.active === false) {
    return json(
      { error: 'This add-on has no active recurring price set as the product default in Stripe.', code: 'no_recurring_price' },
      400,
    );
  }

  // Resolve/create the Stripe customer on the platform-billing account (mirrors checkout.ts).
  const distinct = hasDistinctBillingAccount();
  const customerCol = distinct ? 'stripe_billing_customer_id' : 'stripe_customer_id';
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(customerCol)
    .eq('user_id', userId)
    .single();
  let customerId = (profile as Record<string, string> | null)?.[customerCol];
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.user?.email ?? undefined,
      metadata: { supabase_user_id: userId ?? '' },
    });
    customerId = customer.id;
    await supabase.from('user_profiles').update({ [customerCol]: customerId }).eq('user_id', userId);
  }

  const meta = {
    kind: 'module_addon',
    workspace_id: workspaceId,
    module_slug: moduleSlug,
    user_id: userId ?? '',
  };
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceObj.id, quantity: 1 }],
    subscription_data: { metadata: meta },
    metadata: meta,
    success_url: (body.successUrl as string) || `${req.headers.get('origin') || ''}/profile?tab=modules&activated=${moduleSlug}`,
    cancel_url: (body.cancelUrl as string) || `${req.headers.get('origin') || ''}/profile?tab=modules`,
  });

  return json({ checkout_url: session.url, module: moduleSlug });
}

async function deactivateModule(auth: AuthResult, body: Record<string, unknown>): Promise<Response> {
  const service = auth.supabase;
  const userId = auth.userId;
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : null;
  const moduleSlug = typeof body.module_slug === 'string' ? body.module_slug : null;
  if (!workspaceId || !moduleSlug) return json({ error: 'workspace_id and module_slug are required' }, 400);

  if (!(await isOwnerOrOperator(service, userId, workspaceId))) {
    return json({ error: 'Only the workspace owner can deactivate modules', code: 'not_owner' }, 403);
  }

  // If there's a paid add-on subscription, cancel it at period end; the webhook
  // revokes the entitlement when Stripe deletes the subscription.
  const { data: sub } = await service
    .from('workspace_module_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('workspace_id', workspaceId)
    .eq('module_slug', moduleSlug)
    .maybeSingle();

  if (sub?.stripe_subscription_id) {
    const stripe = getPlatformBillingStripe();
    if (!stripe) return noPaymentProviderResponse(corsHeaders);
    await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    await service
      .from('workspace_module_subscriptions')
      .update({ status: 'canceling', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('module_slug', moduleSlug);
    return json({ status: 'cancels_at_period_end', module: moduleSlug });
  }

  // Free (plan-covered) module: just turn the entitlement off.
  await service
    .from('workspace_module_entitlements')
    .update({ enabled: false, granted_by: userId, granted_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('module_slug', moduleSlug);
  return json({ deactivated: true, module: moduleSlug });
}

// #251 — a NON-owner member requests activation → notify the workspace owner(s). Uses the
// Flows engine (emitFlowEvent → seeded `module_access_requested` flow → bell), never a
// hardcoded notification insert. Caller must be a member of the workspace.
async function requestModule(auth: AuthResult, body: Record<string, unknown>): Promise<Response> {
  const service = auth.supabase;
  const userId = auth.userId;
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : null;
  const moduleSlug = typeof body.module_slug === 'string' ? body.module_slug : null;
  if (!workspaceId || !moduleSlug) return json({ error: 'workspace_id and module_slug are required' }, 400);

  // Caller must belong to the workspace (bind to caller — never trust the body alone).
  if (!(await userCanAccessWorkspace(service, userId, workspaceId))) {
    return json({ error: 'Not a member of this workspace', code: 'not_member' }, 403);
  }

  const { data: mod } = await service
    .from('modules')
    .select('name, enabled')
    .eq('slug', moduleSlug)
    .maybeSingle();
  if (!mod || !mod.enabled) return json({ error: 'Module is not available', code: 'not_published' }, 400);

  // 24h dedupe — don't spam the owner's bell across sessions or scripted repeats.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await service
    .from('module_access_requests')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('module_slug', moduleSlug)
    .eq('requested_by', userId)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle();
  if (recent) return json({ requested: true, deduped: true, notified: 0 });

  const { data: owners } = await service
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner')
    .eq('status', 'active');

  const ownerIds = (owners || []).map((o: { user_id: string }) => o.user_id).filter((id) => id && id !== userId);
  const requesterEmail = auth.user?.email || 'A workspace member';

  // Best-effort per owner: one failing notification must not fail the whole request.
  let notified = 0;
  for (const ownerId of ownerIds) {
    try {
      await emitFlowEvent('module_access_requested', {
        user_id: ownerId,
        type: 'module_access_requested',
        title: `Module requested: ${mod.name}`,
        body: `${requesterEmail} asked you to activate the ${mod.name} module for the workspace.`,
        action_url: '/profile?tab=modules',
        module_slug: moduleSlug,
        module_name: mod.name,
        requested_by: userId ?? '',
        workspace_id: workspaceId,
      });
      notified++;
    } catch (e) {
      console.error(`[request-module] notify failed for owner ${ownerId}:`, e);
    }
  }

  // Record the request (drives the dedupe window + gives the owner an audit trail).
  await service
    .from('module_access_requests')
    .insert({ workspace_id: workspaceId, module_slug: moduleSlug, requested_by: userId });

  return json({ requested: true, notified });
}

/**
 * Operator-only: list active Stripe products (with each product's default_price) so the admin
 * can bind a module 1:1 to a product. Products whose default_price isn't a recurring price are
 * returned with `price: null` so the admin UI can flag them as not subscription-ready.
 */
async function listStripeProducts(auth: AuthResult): Promise<Response> {
  if (!isAdminAccess(auth) && !(await isOperator(auth.supabase, auth.userId))) {
    return json({ error: 'Operator access required', code: 'not_operator' }, 403);
  }
  const stripe = getPlatformBillingStripe();
  if (!stripe) return noPaymentProviderResponse(corsHeaders);

  const products = await stripe.products.list({ active: true, limit: 100, expand: ['data.default_price'] });
  return json({
    products: products.data.map((p) => {
      const dp = p.default_price;
      const price = dp && typeof dp === 'object' && dp.recurring
        ? { id: dp.id, unit_amount: dp.unit_amount, currency: dp.currency, interval: dp.recurring.interval }
        : null;
      return { id: p.id, name: p.name, description: p.description, price };
    }),
  });
}
