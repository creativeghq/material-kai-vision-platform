import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'https://esm.sh/stripe@14.10.0';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getStripe, getPlatformBillingStripe, getSupabase, stripeWebhookSecret, platformBillingWebhookSecret } from '../_shared/stripe-clients.ts';

// Module-level handles re-assigned per-request from the memoised shared
// factories. The downstream `handle*` functions reference these by name to
// avoid threading clients through 9 handler signatures. After the first
// successful request, the factories return the same singleton — these
// references just stay in scope.
let stripe!: Stripe;
let supabase!: SupabaseClient;
// #200 — true when THIS event was signed by the dedicated platform-billing account (verified
// with STRIPE_BILLING_WEBHOOK_SECRET). Drives which customer-id column we persist/lookup.
let eventIsBilling = false;

// #251 — module add-on plan-tier reconciliation.
const MODULE_TIER_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
const moduleTierRank = (t?: string | null) => MODULE_TIER_RANK[(t || '').toLowerCase()] ?? 999;

/** Match a user profile by a Stripe customer id from EITHER account (default or billing). */
function profileByCustomer(customerId: string, columns: string) {
  return supabase.from('user_profiles').select(columns)
    .or(`stripe_customer_id.eq.${customerId},stripe_billing_customer_id.eq.${customerId}`)
    .limit(1).maybeSingle();
}

/**
 * Stripe Webhooks Handler
 * Handles Stripe webhook events for subscription and payment processing
 */
Deno.serve(withApiLogging('stripe-webhooks', async (req) => {
  await bootstrapForFunction();

  // Verify configuration AFTER bootstrap. Both secrets MUST be set; rejecting
  // webhooks when unsigned is critical (otherwise anyone could forge payment
  // events). 503 rather than throwing keeps the function alive and recovers
  // automatically when an admin pastes the secrets into the DB.
  const _stripe = getStripe();
  const _supabase = getSupabase();
  const webhookSecret = stripeWebhookSecret();
  if (!_stripe || !_supabase || !webhookSecret) {
    return new Response(
      JSON.stringify({
        error: 'Stripe webhooks not configured — set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET at /admin/modules/payments-stripe/settings → Keys.',
        code: 'stripe_webhooks_not_configured',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
  supabase = _supabase;

  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response(
      JSON.stringify({ error: 'Missing stripe-signature header' }),
      { status: 400 }
    );
  }

  try {
    const body = await req.text();
    // #200 — the same webhook URL receives events from BOTH the default account (tenant
    // payments) and, when configured, the dedicated platform-billing account. Verify against
    // the default secret first; on failure try the billing secret. Whichever verifies decides
    // which Stripe client downstream API calls use (subscriptions.retrieve, etc.) and which
    // customer-id column we persist.
    let event: Stripe.Event;
    eventIsBilling = false;
    stripe = _stripe;
    try {
      event = _stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (primaryErr) {
      const billingSecret = platformBillingWebhookSecret();
      const billingStripe = getPlatformBillingStripe();
      if (billingSecret && billingSecret !== webhookSecret && billingStripe) {
        event = billingStripe.webhooks.constructEvent(body, signature, billingSecret);
        eventIsBilling = true;
        stripe = billingStripe;
      } else {
        throw primaryErr;
      }
    }

    console.log(`Received Stripe event: ${event.type}${eventIsBilling ? ' [billing account]' : ''}`);

    switch (event.type) {
      // ============================================
      // Customer Events
      // ============================================
      case 'customer.created':
        await handleCustomerCreated(event.data.object as Stripe.Customer);
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;

      // ============================================
      // Subscription Events
      // ============================================
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      // ============================================
      // Payment Events
      // ============================================
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Webhook error' }),
      { status: 400 }
    );
  }
}));

// ============================================
// Handler Functions
// ============================================

async function handleCustomerCreated(customer: Stripe.Customer) {
  const email = customer.email;
  if (!email) return;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (profile?.user_id) {
    // Persist into the column matching the account that emitted the event so default-account
    // and platform-billing customer ids never overwrite each other.
    const col = eventIsBilling ? 'stripe_billing_customer_id' : 'stripe_customer_id';
    await supabase
      .from('user_profiles')
      .update({ [col]: customer.id })
      .eq('user_id', profile.user_id);
  }
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  // Update customer details if needed
  console.log(`Customer updated: ${customer.id}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // #251 — per-module add-on subscriptions carry kind='module_addon' metadata. They grant a
  // per-workspace entitlement, NOT a platform plan tier, so branch out before the tier logic.
  if (subscription.metadata?.kind === 'module_addon') {
    await handleModuleAddonSubscription(subscription);
    return;
  }

  const customerId = subscription.customer as string;

  // Find user by Stripe customer ID (either account — default or platform-billing)
  const { data: profile } = await profileByCustomer(customerId, 'user_id, subscription_tier') as { data: any };

  if (!profile) {
    console.error(`No user found for customer: ${customerId}`);
    return;
  }

  // Determine subscription tier from price ID
  const priceId = subscription.items.data[0]?.price.id;
  let tier = 'free';

  const proPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID');
  const enterprisePriceId = Deno.env.get('STRIPE_ENTERPRISE_PRICE_ID');

  if (priceId === proPriceId) tier = 'pro';
  else if (priceId === enterprisePriceId) tier = 'enterprise';
  else {
    console.warn(`Unknown price ID: ${priceId}. PRO=${proPriceId}, ENTERPRISE=${enterprisePriceId}. Defaulting to free.`);
  }

  // Update user profile
  await supabase
    .from('user_profiles')
    .update({
      stripe_subscription_id: subscription.id,
      subscription_tier: tier,
      subscription_status: subscription.status,
      subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('user_id', profile.user_id);

  console.log(`Subscription updated for user ${profile.user_id}: ${tier}`);

  // #251 — if the new plan tier now INCLUDES a module this owner is paying for as an add-on,
  // cancel the redundant add-on so they aren't double-billed. Access is preserved because the
  // tier now covers it (and handleModuleAddonDeleted won't revoke a plan-covered module).
  await reconcileModuleAddonsForOwner(profile.user_id, tier).catch((e) =>
    console.error('[modules] add-on reconcile failed:', e));
}

// #251 — cancel (at period end) any add-on subscriptions for workspaces this user owns whose
// module is now covered by the given plan tier.
async function reconcileModuleAddonsForOwner(userId: string, planTier: string) {
  const rank = moduleTierRank(planTier);
  const { data: ws } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .eq('status', 'active');
  const wsIds = (ws || []).map((w: { workspace_id: string }) => w.workspace_id);
  if (!wsIds.length) return;

  const { data: subs } = await supabase
    .from('workspace_module_subscriptions')
    .select('workspace_id, module_slug, stripe_subscription_id, status, modules!inner(price_tier)')
    .in('workspace_id', wsIds)
    .in('status', ['active', 'canceling']);

  // Module add-on subscriptions are created on the platform-BILLING account (getPlatformBillingStripe
  // in modules.ts). A plan-tier event arrives on the DEFAULT account, so cancelling through the
  // event's `stripe` client would hit "No such subscription" and silently leave the add-on billing.
  const billingStripe = getPlatformBillingStripe() ?? stripe;

  for (const s of (subs || []) as Array<{ workspace_id: string; module_slug: string; stripe_subscription_id: string | null; modules?: { price_tier?: string | null } }>) {
    if (!s.stripe_subscription_id) continue;
    if (moduleTierRank(s.modules?.price_tier) > rank) continue; // not covered by the new tier
    try {
      await billingStripe.subscriptions.update(s.stripe_subscription_id, { cancel_at_period_end: true });
      await supabase
        .from('workspace_module_subscriptions')
        .update({ status: 'canceling', updated_at: new Date().toISOString() })
        .eq('workspace_id', s.workspace_id)
        .eq('module_slug', s.module_slug);
      console.log(`[modules] canceling add-on '${s.module_slug}' for ws ${s.workspace_id} — now included in ${planTier} plan`);
    } catch (e) {
      console.error(`[modules] failed to cancel add-on '${s.module_slug}':`, e);
    }
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // #251 — module add-on cancellation → revoke the workspace entitlement.
  if (subscription.metadata?.kind === 'module_addon') {
    await handleModuleAddonDeleted(subscription);
    return;
  }

  const customerId = subscription.customer as string;

  const { data: profile } = await profileByCustomer(customerId, 'user_id') as { data: any };

  if (!profile) return;

  // Downgrade to free tier
  await supabase
    .from('user_profiles')
    .update({
      subscription_tier: 'free',
      subscription_status: 'canceled',
      stripe_subscription_id: null,
    })
    .eq('user_id', profile.user_id);

  console.log(`Subscription canceled for user ${profile.user_id}`);
}

// #251 — a per-workspace module add-on subscription was created/updated. This is the ONLY
// place a paid entitlement is granted (never trust the client). Grants on active/trialing;
// keeps the entitlement through past_due (dunning grace) and only revokes on deletion.
async function handleModuleAddonSubscription(subscription: Stripe.Subscription) {
  const meta = subscription.metadata || {};
  const workspaceId = meta.workspace_id;
  const moduleSlug = meta.module_slug;
  if (!workspaceId || !moduleSlug) {
    console.warn('module_addon subscription missing workspace_id/module_slug', subscription.id);
    return;
  }

  // A subscription scheduled to cancel still reports status 'active' with cancel_at_period_end=true;
  // persist that as 'canceling' so a later plain 'updated' event doesn't clobber the indicator that
  // deactivateModule/reconcile set (access still runs to period end via the entitlement below).
  const persistedStatus = (subscription.status === 'active' || subscription.status === 'trialing') && subscription.cancel_at_period_end
    ? 'canceling'
    : subscription.status;

  await supabase.from('workspace_module_subscriptions').upsert(
    {
      workspace_id: workspaceId,
      module_slug: moduleSlug,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      status: persistedStatus,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,module_slug' },
  );

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    const { error } = await supabase.from('workspace_module_entitlements').upsert(
      { workspace_id: workspaceId, module_slug: moduleSlug, enabled: true, granted_by: meta.user_id || null },
      { onConflict: 'workspace_id,module_slug' },
    );
    if (error) {
      // Throw → non-2xx → Stripe retries. Upsert is idempotent so retry is safe.
      throw new Error(`module entitlement grant failed for ${workspaceId}/${moduleSlug}: ${error.message}`);
    }
    console.log(`Granted module '${moduleSlug}' to workspace ${workspaceId} (sub ${subscription.id})`);
  }
}

// #251 — module add-on subscription deleted → mark the sub row and revoke the entitlement,
// UNLESS the workspace's plan tier now covers the module (e.g. after a plan upgrade the add-on
// was cancelled). In that case access must persist even though the add-on ended.
async function handleModuleAddonDeleted(subscription: Stripe.Subscription) {
  const meta = subscription.metadata || {};
  const workspaceId = meta.workspace_id;
  const moduleSlug = meta.module_slug;
  if (!workspaceId || !moduleSlug) return;

  const [{ data: planLevel }, { data: mod }] = await Promise.all([
    supabase.rpc('workspace_plan_level', { p_workspace_id: workspaceId }),
    supabase.from('modules').select('price_tier').eq('slug', moduleSlug).maybeSingle(),
  ]);
  const covered = moduleTierRank((mod as { price_tier?: string | null } | null)?.price_tier) <= (Number(planLevel) || 0);

  if (!covered) {
    await supabase
      .from('workspace_module_entitlements')
      .update({ enabled: false, granted_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('module_slug', moduleSlug);
  }

  await supabase
    .from('workspace_module_subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('module_slug', moduleSlug);

  console.log(`Module add-on '${moduleSlug}' ended for ws ${workspaceId} (covered_by_plan=${covered}; sub ${subscription.id} deleted)`);
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  // Route by metadata.type FIRST — invoice payments don't require a registered user.
  if (paymentIntent.metadata?.type === 'invoice_payment') {
    await handleInvoicePaymentSucceeded(paymentIntent);
    return;
  }

  const customerId = paymentIntent.customer as string;
  if (!customerId) return;

  const { data: profile } = await profileByCustomer(customerId, 'user_id') as { data: any };

  if (!profile) return;

  // Check if this is a credit purchase (metadata should contain credit_amount)
  const creditAmount = paymentIntent.metadata?.credit_amount;

  if (creditAmount) {
    // Shared-credits path: an owner/admin funded a WORKSPACE pool (stripe-api tagged the
    // payment intent with a verified workspace_id). Credit the pool, not the personal wallet.
    const poolWorkspaceId = paymentIntent.metadata?.workspace_id;
    if (poolWorkspaceId) {
      const { data: existingPoolGrant } = await supabase
        .from('workspace_credit_transactions')
        .select('id')
        .eq('workspace_id', poolWorkspaceId)
        .eq('metadata->>stripe_payment_intent_id', paymentIntent.id)
        .maybeSingle();
      if (existingPoolGrant) {
        console.log(`Pool credits already granted for payment_intent ${paymentIntent.id}, skipping`);
        return;
      }
      const { error: poolErr } = await supabase.rpc('credit_workspace_credits', {
        p_workspace_id: poolWorkspaceId,
        p_amount: parseFloat(creditAmount),
        p_transaction_type: 'purchase',
        p_actor_user_id: profile.user_id,
        p_operation_type: 'credit_purchase',
        p_description: 'Workspace credit purchase via Stripe',
        p_metadata: {
          stripe_payment_intent_id: paymentIntent.id,
          amount_paid: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
        },
      });
      if (poolErr) {
        console.error('Error granting workspace pool credits:', poolErr);
        throw new Error(`credit_workspace_credits failed for payment_intent ${paymentIntent.id}: ${poolErr.message}`);
      }
      console.log(`Granted ${creditAmount} credits to workspace pool ${poolWorkspaceId}`);
      emitFlowEvent('stripe_payment_succeeded', {
        user_id: profile.user_id,
        type: 'payment_success',
        title: 'Workspace credits added',
        body: `${creditAmount} credits have been added to your workspace pool.`,
        action_url: '/profile?tab=credits',
        credit_amount: parseFloat(creditAmount),
      });
      return;
    }

    // Idempotency: check if we already granted credits for this payment intent
    const { data: existingGrant } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', profile.user_id)
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .maybeSingle();

    if (existingGrant) {
      console.log(`Credits already granted for payment_intent ${paymentIntent.id}, skipping`);
      return;
    }

    // Grant credits to user
    const { data, error } = await supabase.rpc('grant_credits', {
      p_user_id: profile.user_id,
      p_amount: parseFloat(creditAmount),
      p_transaction_type: 'purchase',
      p_description: `Credit purchase via Stripe`,
      p_stripe_payment_intent_id: paymentIntent.id,
      p_metadata: {
        amount_paid: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });

    if (error) {
      console.error('Error granting credits:', error);
      // Throw so the outer catch returns non-2xx and Stripe retries this webhook.
      // The idempotency guard above makes the retry safe (credits granted at most once).
      throw new Error(`grant_credits failed for payment_intent ${paymentIntent.id}: ${error.message}`);
    } else {
      console.log(`Granted ${creditAmount} credits to user ${profile.user_id}`);
      // Credits are granted above (must stay in the webhook). The notification
      // is delivered by the "Payment Succeeded" flow (Flows dashboard).
      emitFlowEvent('stripe_payment_succeeded', {
        user_id: profile.user_id,
        type: 'payment_success',
        title: 'Credits added to your account',
        body: `${creditAmount} credits have been added to your account.`,
        action_url: '/settings/billing',
        credit_amount: parseFloat(creditAmount),
        payment_intent_id: paymentIntent.id,
      }).catch(() => {});
    }
  }
}

/**
 * Sales/Finance — Stripe PaymentIntent for an invoice in public.invoices.
 * Inserts payments + payment_allocations; the status-keeper trigger then flips
 * the invoice to paid / partially_paid via amount_paid. Idempotent on payment_intent.id.
 */
async function handleInvoicePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const invoiceId = paymentIntent.metadata?.invoice_id;
  if (!invoiceId) {
    console.warn('invoice_payment metadata missing invoice_id', paymentIntent.id);
    return;
  }

  // Idempotency: skip if we already recorded a payment for this intent
  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle();
  if (existing) {
    console.log(`invoice_payment ${paymentIntent.id} already recorded as payment ${existing.id}`);
    return;
  }

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*, contact:crm_contacts!customer_contact_id(id, email, name), company:crm_companies!customer_company_id(id, email, name)')
    .eq('id', invoiceId)
    .single();
  if (invErr || !inv) {
    console.error('invoice not found for invoice_payment', invoiceId, invErr?.message);
    return;
  }

  const amount = paymentIntent.amount_received
    ? paymentIntent.amount_received / 100
    : paymentIntent.amount / 100;
  const currency = (paymentIntent.currency || inv.currency || 'eur').toUpperCase();

  const { data: paymentRow, error: payErr } = await supabase
    .from('payments')
    .insert({
      workspace_id: inv.workspace_id,
      direction: 'in',
      amount,
      currency,
      method: 'card',
      paid_at: new Date().toISOString(),
      counterparty_contact_id: inv.customer_contact_id,
      counterparty_company_id: inv.customer_company_id,
      reference: `Stripe ${paymentIntent.id}`,
      notes: `Inv ${inv.internal_number} via Stripe Checkout`,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_checkout_session_id: inv.stripe_checkout_session_id,
    })
    .select('id')
    .single();
  if (payErr || !paymentRow) {
    console.error('payments insert failed for invoice_payment', payErr?.message);
    return;
  }

  const { error: allocErr } = await supabase.from('payment_allocations').insert({
    payment_id: paymentRow.id,
    invoice_id: inv.id,
    amount,
  });
  if (allocErr) {
    console.error('payment_allocations insert failed', allocErr.message);
    return;
  }

  console.log(`Recorded Stripe payment ${paymentRow.id} for invoice ${inv.internal_number} (${amount} ${currency})`);

  // Bell-notify the invoice creator (if known) — routed through Flows (#245 D)
  // so admins can pause/retarget. The seeded `invoice_paid` system-default flow
  // turns this into the create_notification bell.
  if (inv.created_by) {
    await emitFlowEvent('invoice_paid', {
      user_id: inv.created_by,
      type: 'invoice_paid',
      title: `Invoice ${inv.internal_number} paid`,
      body: `${currency} ${amount.toFixed(2)} received via card.`,
      action_url: `/admin/finance/invoices/${inv.id}`,
      invoice_id: inv.id,
      amount,
      currency,
      payment_intent_id: paymentIntent.id,
      workspace_id: inv.workspace_id,
    }).catch(() => {});
  }

  // Customer-facing: notify + email the buyer that their payment was received (seeded flow).
  const cust = (inv.company ?? inv.contact) as { email?: string; name?: string } | null;
  await emitFlowEvent('payment_received', {
    type: 'payment_received',
    customer_email: cust?.email ?? undefined,
    customer_name: cust?.name ?? undefined,
    invoice_id: inv.id,
    payment_id: paymentRow.id,
    amount: `${amount.toFixed(2)} ${currency}`,
    currency,
    workspace_id: inv.workspace_id,
    receipt_line: '', // receipt PDF is generated from the finance UI (service-role can't mint it here)
    title: `Payment received — ${amount.toFixed(2)} ${currency}`,
    body: `We received your payment of ${amount.toFixed(2)} ${currency} for invoice ${inv.internal_number}.`,
    action_url: `/finance/invoices/${inv.id}`,
  }).catch(() => {});
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id}`);
  const customerId = paymentIntent.customer as string;
  if (!customerId) return;

  const { data: profile } = await profileByCustomer(customerId, 'user_id') as { data: any };

  if (!profile) return;

  // Delivered by the "Payment Failed" flow (Flows dashboard).
  emitFlowEvent('stripe_payment_failed', {
    user_id: profile.user_id,
    type: 'payment_failed',
    title: 'Payment failed',
    body: 'Your payment could not be processed. Please update your payment details.',
    action_url: '/settings/billing',
    payment_intent_id: paymentIntent.id,
  }).catch(() => {});
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  // Only process subscription invoices (not one-time credit purchases)
  if (!invoice.subscription) return;

  const { data: profile } = await profileByCustomer(customerId, 'user_id, subscription_tier') as { data: any };

  if (!profile) return;

  // Idempotency: check if we already granted credits for this invoice
  const { data: existingGrant } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', profile.user_id)
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle();

  if (existingGrant) {
    console.log(`Credits already granted for invoice ${invoice.id}, skipping`);
    return;
  }

  // Derive tier from the invoice's subscription price, NOT from profile.subscription_tier.
  // This closes the race where invoice.paid fires before subscription.updated sets the tier.
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  let invoiceTier = profile.subscription_tier || 'free';
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price.id;
      const proPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID');
      const enterprisePriceId = Deno.env.get('STRIPE_ENTERPRISE_PRICE_ID');
      if (priceId === proPriceId) invoiceTier = 'pro';
      else if (priceId === enterprisePriceId) invoiceTier = 'enterprise';
      else if (priceId) {
        console.error(`[handleInvoicePaid] Unknown price ID: ${priceId}. PRO=${proPriceId}, ENTERPRISE=${enterprisePriceId}. Falling back to profile tier.`);
      }
    } catch (subErr) {
      console.warn(`[handleInvoicePaid] Could not retrieve subscription ${subscriptionId}, using profile tier:`, subErr);
    }
  }

  let monthlyCredits = 0;
  if (invoiceTier === 'pro') monthlyCredits = 1000;
  else if (invoiceTier === 'enterprise') monthlyCredits = 5000;

  if (monthlyCredits > 0) {
    const { error } = await supabase.rpc('grant_credits', {
      p_user_id: profile.user_id,
      p_amount: monthlyCredits,
      p_transaction_type: 'monthly_grant',
      p_description: `Monthly ${invoiceTier} credits`,
      p_stripe_invoice_id: invoice.id,
      p_metadata: {
        subscription_tier: invoiceTier,
        period_start: invoice.period_start,
        period_end: invoice.period_end,
      },
    });

    if (error) {
      console.error(`Error granting monthly credits for invoice ${invoice.id}:`, error);
      // Throw so the outer catch returns non-2xx and Stripe retries. The idempotency
      // guard above (stripe_invoice_id) makes the retry safe.
      throw new Error(`grant_credits failed for invoice ${invoice.id}: ${error.message}`);
    } else {
      console.log(`Granted ${monthlyCredits} monthly credits to user ${profile.user_id} (invoice: ${invoice.id})`);
    }
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  const { data: profile } = await profileByCustomer(customerId, 'user_id') as { data: any };

  if (!profile) return;

  // Update subscription status to past_due
  await supabase
    .from('user_profiles')
    .update({ subscription_status: 'past_due' })
    .eq('user_id', profile.user_id);

  console.log(`Invoice payment failed for user ${profile.user_id}`);
}

