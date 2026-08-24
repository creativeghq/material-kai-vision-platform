// Module framework — owner self-serve module activation + add-on billing.
// Actions (dispatched from stripe-api/index.ts):
//   activate-module    { workspace_id, module_slug, successUrl?, cancelUrl? }
//   deactivate-module  { workspace_id, module_slug }
//   request-module     { workspace_id, module_slug }   (non-owner → notify owner)
//   list-stripe-products                               (operator only)
// An add-on module binds to a Stripe PRODUCT (1:1). The charge uses that product's
// default_price, resolved fresh at activation — so it's always the current price and two
// modules can never collide on a shared price id.
// Security baseline:
//   - authenticate() returns a service-role client (RLS bypassed) → we bind every
//     action to the CALLER, never to a body-supplied id. Activation requires the
//     caller to be the OWNER of the target workspace (or the platform operator).
//   - Entitlement grants for PAID add-ons happen ONLY in the signature-verified
//     stripe-webhooks handler. Here we only grant the FREE (plan-covered) path,
//     after verifying owner + that the plan tier already covers the module.

import type { DbClient } from '../../_shared/supabase-client.ts';
import { grantBundle, revokeBundle } from '../../_shared/module-bundle.ts';
import { jsonResponse as json } from '../../_shared/http.ts';
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

import { moduleTierRank as tierRank } from '../../_shared/module-tiers.ts';


/** True when the user is the OWNER of this exact workspace, or the platform operator. */
async function isOwnerOrOperator(
  service: DbClient,
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
async function isOperator(service: DbClient, userId: string | null): Promise<boolean> {
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
      return activateModule(req, auth, body);
    case 'deactivate-module':
      return deactivateModule(auth, body);
    case 'request-module':
      return requestModule(auth, body);
    case 'request-self-hosting':
      return requestSelfHosting(auth, body);
    case 'list-stripe-products':
      return listStripeProducts(auth);
    case 'verify-catalogue-prices':
      return verifyCataloguePrices(auth);
    case 'create-addon-product':
      return createAddonProduct(auth, body);
    default:
      return json({ error: `Unknown module action '${action}'` }, 400);
  }
}

/**
 * `req` is needed for the Origin header used to build the Stripe return URLs. It used to be
 * absent from this signature while the body below referenced `req` anyway, so whenever the
 * client omitted successUrl/cancelUrl the checkout threw ReferenceError — i.e. the add-on
 * could not be purchased.
 */
async function activateModule(req: Request, auth: AuthResult, body: Record<string, unknown>): Promise<Response> {
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
    // Bundled: Channels grants social-media alongside messaging. Read from modules.grants_slugs
    // so this path and the two Stripe paths cannot disagree about what a purchase buys.
    const { slugs, error } = await grantBundle(service, workspaceId, moduleSlug, userId);
    if (error) return json({ error }, 500);
    return json({ activated: true, free: true, module: moduleSlug, modules: slugs });
  }

  // PAID path: create a recurring Stripe checkout. The webhook grants the entitlement.
  if (!mod.is_addon || !mod.addon_stripe_product_id) {
    return json(
      { error: 'This module is not included in your plan and is not available as an add-on.', code: 'not_available_on_plan' },
      400,
    );
  }

  const stripe = await getPlatformBillingStripe();
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
  const distinct = await hasDistinctBillingAccount();
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
    const stripe = await getPlatformBillingStripe();
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
  const revoked = await revokeBundle(service, workspaceId, moduleSlug);
  return json({ deactivated: true, module: moduleSlug, modules: revoked });
}

// A NON-owner member requests activation → notify the workspace owner(s). Uses the
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
/**
 * one-click "make this module purchasable": create a Stripe PRODUCT + recurring price on
 * the platform-billing account, set the price as the product default, and bind it to the module
 * row (is_addon + addon_stripe_product_id + price). Operator-only. Saves the operator a trip to
 * the Stripe dashboard; the normal activate-module → checkout → webhook grant flow then works.
 */
async function createAddonProduct(auth: AuthResult, body: Record<string, unknown>): Promise<Response> {
  if (!isAdminAccess(auth) && !(await isOperator(auth.supabase, auth.userId))) {
    return json({ error: 'Operator access required', code: 'not_operator' }, 403);
  }
  const moduleSlug = String(body.module_slug || '').trim();
  const amountCents = Math.round(Number(body.amount_cents));
  const currency = String(body.currency || 'eur').toLowerCase();
  const interval = String(body.interval || 'month') === 'year' ? 'year' : 'month';
  if (!moduleSlug) return json({ error: 'module_slug is required' }, 400);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return json({ error: 'amount_cents must be a whole number ≥ 50 (Stripe minimum)' }, 400);
  }

  const service = auth.supabase;
  const { data: mod } = await service
    .from('modules')
    .select('slug, name, summary, description, addon_stripe_product_id')
    .eq('slug', moduleSlug)
    .maybeSingle();
  if (!mod) return json({ error: 'Module not found' }, 404);

  const stripe = await getPlatformBillingStripe();
  if (!stripe) return noPaymentProviderResponse(corsHeaders);

  // Create product → recurring price → set as default. Product carries module metadata so it's
  // identifiable in the Stripe dashboard.
  const product = await stripe.products.create({
    name: `${mod.name} (add-on)`,
    description: (mod.summary || mod.description || undefined) as string | undefined,
    metadata: { module_slug: moduleSlug, kind: 'module_addon' },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amountCents,
    currency,
    recurring: { interval: interval as 'month' | 'year' },
  });
  await stripe.products.update(product.id, { default_price: price.id });

  // Bind to the module (unique-product-per-module index enforces 1:1).
  const { error: updErr } = await service
    .from('modules')
    .update({
      is_addon: true,
      addon_stripe_product_id: product.id,
      addon_price_cents: amountCents,
      addon_currency: currency,
      // Mirror the interval so the tenant card renders "/yr" for a yearly product instead of
      // unconditionally advertising "/mo".
      billing_interval: interval,
    })
    .eq('slug', moduleSlug);
  if (updErr) {
    const dup = /modules_addon_product_uniq|duplicate key/i.test(updErr.message);
    return json({ error: dup ? 'That module is already bound to a product.' : updErr.message }, 500);
  }

  return json({
    created: true,
    product: {
      id: product.id,
      name: product.name,
      price: { id: price.id, unit_amount: amountCents, currency, interval },
    },
  });
}

/**
 * Does the price we SHOW match the price Stripe CHARGES?
 *
 * Found the hard way: subscription_plans said Pro $99 and Enterprise $299 while Stripe was billing
 * €25 and €500. Enterprise was charging roughly twice what the page advertised, in a different
 * currency, and nothing anywhere compared the two — the catalogue is what the pricing page renders
 * and Stripe is what takes the money, and neither has ever had to agree with the other.
 *
 * A wrong price is a valid price, so no typecheck and no integrity probe could see it. This is the
 * comparison, and it runs where the SQL probes cannot: only Stripe knows Stripe.
 *
 * Drift is logged at WARNING as well as returned, so a scheduled run lands somewhere a human
 * already looks (the admin Log Viewer) instead of in a cron response nobody reads.
 */
async function verifyCataloguePrices(auth: AuthResult): Promise<Response> {
  if (!isAdminAccess(auth) && !(await isOperator(auth.supabase, auth.userId))) {
    return json({ error: 'Operator access required', code: 'not_operator' }, 403);
  }
  const stripe = await getPlatformBillingStripe();
  if (!stripe) return noPaymentProviderResponse(corsHeaders);
  const service = auth.supabase;

  const products = await stripe.products.list({ active: true, limit: 100, expand: ['data.default_price'] });
  const byProduct = new Map<string, { cents: number | null; currency: string | null; recurring: boolean }>();
  for (const p of products.data) {
    const dp = p.default_price;
    const price = dp && typeof dp === 'object' ? dp : null;
    byProduct.set(p.id, {
      cents: price?.unit_amount ?? null,
      currency: price?.currency ?? null,
      recurring: Boolean(price?.recurring),
    });
  }

  const drift: Array<Record<string, unknown>> = [];

  // Add-ons: bound 1:1 to a product, so the comparison is exact.
  const { data: addons } = await service
    .from('modules')
    .select('slug, name, addon_price_cents, addon_currency, addon_stripe_product_id')
    .eq('is_addon', true)
    .not('addon_stripe_product_id', 'is', null);

  for (const m of ((addons ?? []) as Array<Record<string, string | number | null>>)) {
    const live = byProduct.get(String(m.addon_stripe_product_id));
    if (!live) {
      drift.push({ kind: 'addon', slug: m.slug, issue: 'bound product not found or inactive in Stripe' });
      continue;
    }
    if (!live.recurring) {
      drift.push({ kind: 'addon', slug: m.slug, issue: 'product default price is not recurring — activation will refuse it' });
    }
    if (live.cents !== null && Number(m.addon_price_cents) !== live.cents) {
      drift.push({
        kind: 'addon', slug: m.slug, issue: 'price mismatch',
        catalogue_cents: Number(m.addon_price_cents), stripe_cents: live.cents,
      });
    }
    if (live.currency && String(m.addon_currency ?? '').toLowerCase() !== live.currency) {
      drift.push({
        kind: 'addon', slug: m.slug, issue: 'currency mismatch',
        catalogue_currency: m.addon_currency, stripe_currency: live.currency,
      });
    }
  }

  // Plans are matched by NAME, because subscription_plans carries no Stripe product id at all —
  // which is the deeper reason they were free to drift. Reported as unverifiable rather than
  // passed: "we could not check" and "it matches" must never look the same.
  const { data: plans } = await service
    .from('subscription_plans').select('name, price_in_cents, currency, stripe_product_id').eq('is_active', true);

  for (const pl of ((plans ?? []) as Array<Record<string, string | number | null>>)) {
    if (Number(pl.price_in_cents) === 0) continue; // a free tier has nothing in Stripe to match
    const bound = pl.stripe_product_id ? byProduct.get(String(pl.stripe_product_id)) : undefined;
    if (!bound) {
      drift.push({
        kind: 'plan', name: pl.name,
        issue: 'not bound to a Stripe product — the displayed price cannot be verified against what is charged',
        catalogue_cents: Number(pl.price_in_cents), catalogue_currency: pl.currency,
      });
      continue;
    }
    if (bound.cents !== null && Number(pl.price_in_cents) !== bound.cents) {
      drift.push({
        kind: 'plan', name: pl.name, issue: 'price mismatch',
        catalogue_cents: Number(pl.price_in_cents), stripe_cents: bound.cents,
      });
    }
    if (bound.currency && String(pl.currency ?? '').toLowerCase() !== bound.currency) {
      drift.push({
        kind: 'plan', name: pl.name, issue: 'currency mismatch',
        catalogue_currency: pl.currency, stripe_currency: bound.currency,
      });
    }
  }

  if (drift.length) {
    // WARNING and above is never dropped by the log sink's denylist, and 30-day retention means a
    // scheduled run is still readable in the admin Log Viewer a month later.
    const { error: logErr } = await service.from('system_logs').insert({
      level: 'WARNING',
      logger_name: 'stripe-api.verify-catalogue-prices',
      message: `[price-drift] ${drift.length} catalogue/Stripe disagreement(s) — the page and the charge do not match`,
      context: { drift },
    });
    // Checked: a check whose own alarm fails silently is not a check.
    if (logErr) console.error('[verify-catalogue-prices] could not record drift:', logErr.message);
  }

  return json({ ok: drift.length === 0, checked: (addons?.length ?? 0) + (plans?.length ?? 0), drift });
}

/**
 * Self-hosting enquiry from the plans page.
 *
 * Replaces the Enterprise tier, which was a purchasable plan nobody could sensibly buy: running
 * this platform on someone else's infrastructure is a conversation, not a checkout.
 *
 * The ROW is written first and the notification second. A flow can be paused and an email can
 * bounce; a self-hosting enquiry is the most valuable message this platform receives, so a
 * delivery failure must cost a delay rather than the lead. `notified` records whether delivery
 * actually happened instead of assuming it did — the same reason the back-fill now counts what
 * lands rather than what returned 200.
 */
async function requestSelfHosting(auth: AuthResult, body: Record<string, unknown>): Promise<Response> {
  const userId = auth.userId;
  if (!userId) return json({ error: 'Sign in required' }, 401);

  const contactEmail = String(body.contact_email || auth.user?.email || '').trim();
  if (!contactEmail || !contactEmail.includes('@')) {
    return json({ error: 'A contact email is required so we can reply' }, 400);
  }

  const service = auth.supabase;
  const workspaceId = body.workspace_id ? String(body.workspace_id) : null;

  // Allowlisted, never spread: this is a request body reaching a DB write (invariant 8), and the
  // status / notified / requested_by fields are ours to set.
  const { data: row, error } = await service.from('self_hosting_requests').insert({
    workspace_id: workspaceId,
    requested_by: userId,
    contact_email: contactEmail,
    contact_name: body.contact_name ? String(body.contact_name).slice(0, 200) : null,
    company: body.company ? String(body.company).slice(0, 200) : null,
    team_size: body.team_size ? String(body.team_size).slice(0, 50) : null,
    message: body.message ? String(body.message).slice(0, 4000) : null,
  }).select('id').single();

  if (error) return json({ error: `Could not record the request: ${error.message}` }, 500);

  // Who to tell, DERIVED: the operators of the root workspace. Resolves to the platform owner
  // today and keeps resolving if that address ever changes — a hardcoded mailbox is one
  // handover away from delivering enquiries to nobody.
  const { data: operators } = await service
    .from('workspace_members')
    .select('user_id, workspaces!inner(is_root)')
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .eq('workspaces.is_root', true);

  let notified = 0;
  for (const op of ((operators ?? []) as Array<{ user_id: string }>)) {
    try {
      await emitFlowEvent('self_hosting_requested', {
        user_id: op.user_id,
        type: 'self_hosting_requested',
        title: 'Self-hosting requested',
        body: `${body.company ? String(body.company) + ' — ' : ''}${contactEmail}`
          + `${body.team_size ? ` · ${String(body.team_size)}` : ''}`
          + `${body.message ? `\n\n${String(body.message).slice(0, 500)}` : ''}`,
        action_url: '/admin',
        request_id: row.id,
        contact_email: contactEmail,
        contact_name: body.contact_name ? String(body.contact_name) : null,
        company: body.company ? String(body.company) : null,
        team_size: body.team_size ? String(body.team_size) : null,
        message: body.message ? String(body.message) : null,
        workspace_id: workspaceId,
      });
      notified++;
    } catch (e) {
      console.error('[request-self-hosting] notify failed:', e);
    }
  }

  if (notified > 0) {
    const { error: markErr } = await service
      .from('self_hosting_requests').update({ notified: true }).eq('id', row.id);
    if (markErr) console.error('[request-self-hosting] could not stamp notified:', markErr.message);
  }

  // Always 200 to the requester: their enquiry IS recorded, and telling them it failed because an
  // internal flow is paused would lose a lead over something they cannot act on.
  return json({ ok: true, request_id: row.id, notified });
}

async function listStripeProducts(auth: AuthResult): Promise<Response> {
  if (!isAdminAccess(auth) && !(await isOperator(auth.supabase, auth.userId))) {
    return json({ error: 'Operator access required', code: 'not_operator' }, 403);
  }
  const stripe = await getPlatformBillingStripe();
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
