import type { DbClient } from '../_shared/supabase-client.ts';
import { grantBundle, revokeBundle } from '../_shared/module-bundle.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'https://esm.sh/stripe@14.10.0';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getStripe, getPlatformBillingStripe, getSupabase, stripeWebhookSecret, platformBillingWebhookSecret } from '../_shared/stripe-clients.ts';
import { moduleTierRank } from '../_shared/module-tiers.ts';
// provider-neutral commerce-payment ingestion. Used ONLY by the
// invoice_payment / statement_payment branches; platform billing (credits, subscriptions,
// module add-ons) settles to the operator and deliberately does NOT route through here.
import { recordInvoicePayment, recordStatementPayment } from '../_shared/payments/record-payment.ts';

// Module-level handles re-assigned per-request from the memoised shared
// factories. The downstream `handle*` functions reference these by name to
// avoid threading clients through 9 handler signatures. After the first
// successful request, the factories return the same singleton — these
// references just stay in scope.
let stripe!: Stripe;
let supabase!: DbClient;
// True when THIS event was signed by the dedicated platform-billing account (verified
// with STRIPE_BILLING_WEBHOOK_SECRET). Drives which customer-id column we persist/lookup.
let eventIsBilling = false;


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

  // Both secrets MUST be set; rejecting webhooks when unsigned is critical (otherwise
  // anyone could forge payment events). 503 rather than throwing keeps the function alive
  // and recovers automatically when an admin pastes the secrets into the DB — which now
  // genuinely works, because these resolve through platform_secrets rather than waiting on
  // a bootstrap into env that the edge runtime refuses to perform.
  const _stripe = await getStripe();
  const _supabase = getSupabase();
  const webhookSecret = await stripeWebhookSecret();
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

  const body = await req.text();

  // ── Signature verification ────────────────────────────────────────────────
  // Kept in its OWN try/catch, separate from handler dispatch. A verification
  // failure is a client error (400, never going to succeed on retry); a handler
  // fault is a server error (5xx, must be retried AND reported to Sentry). The
  // two used to share one catch that returned 400 for both, which made a real
  // failure indistinguishable from a bad signature and hid the cause for weeks.
  // The same webhook URL receives events from BOTH the default account (tenant
  // payments) and, when configured, the dedicated platform-billing account. Verify against
  // the default secret first; on failure try the billing secret. Whichever verifies decides
  // which Stripe client downstream API calls use (subscriptions.retrieve, etc.) and which
  // customer-id column we persist.
  let event: Stripe.Event;
  eventIsBilling = false;
  stripe = _stripe;
  try {
    // constructEventAsync (NOT constructEvent) is mandatory here: verification runs on
    // Web Crypto's SubtleCrypto, which is async-only in the Deno edge runtime. The sync
    // variant throws "SubtleCryptoProvider cannot be used in a synchronous context"
    // before it ever checks the signature, so every delivery 400s regardless of secret.
    event = await _stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (primaryErr) {
    const billingSecret = await platformBillingWebhookSecret();
    const billingStripe = await getPlatformBillingStripe();
    if (billingSecret && billingSecret !== webhookSecret && billingStripe) {
      try {
        event = await billingStripe.webhooks.constructEventAsync(body, signature, billingSecret);
        eventIsBilling = true;
        stripe = billingStripe;
      } catch (billingErr) {
        return signatureFailure(primaryErr, billingErr);
      }
    } else {
      return signatureFailure(primaryErr);
    }
  }

  console.log(`Received Stripe event: ${event.type}${eventIsBilling ? ' [billing account]' : ''}`);

  // ── Handler dispatch ──────────────────────────────────────────────────────
  // Deliberately NOT wrapped in a catch-and-400. Handlers throw on purpose (e.g.
  // grant_credits failure) so the event is retried; letting it propagate means
  // withApiLogging returns 500 AND reports it to Sentry (4xx are never reported).
  try {
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
      // Connect account lifecycle (audit F3): without this, charges_enabled only
      // refreshed when a human revisited the settings page — until then charges
      // silently ran platform-collect and the settlement account never provisioned.
      // ============================================
      case 'account.updated':
        await handleConnectAccountUpdated(event.data.object as Stripe.Account);
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

      // ============================================
      // Reversals
      // ============================================
      // These were entirely absent — `grep "refund\|dispute"` over this 715-line file
      // returned ZERO matches — so they fell into `default:` and were logged as
      // "Unhandled event type". A refunded or charged-back invoice therefore read `paid`
      // forever: AR, revenue and the payment_allocations ledger all over-counted by the
      // reversed amount.
      // Because it is a MISSING branch rather than a failing one, no error rate, no Sentry
      // event and no silent-zero probe could ever have surfaced it. That is what makes this
      // class worth handling explicitly rather than relying on monitoring.
      case 'charge.refunded':
        await handleChargeReversed(event.data.object as Stripe.Charge, 'refund');
        break;

      case 'charge.dispute.created':
        await handleDisputeOpened(event.data.object as Stripe.Dispute);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    // Re-throw with the event pinned to the message so Sentry/logs identify the
    // exact delivery. withApiLogging turns this into a 500 (retried + reported).
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[stripe-webhooks] handler failed for ${event.type} (${event.id}):`, error);
    throw new Error(`${event.type} (${event.id}) handler failed: ${msg}`);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}));

/**
 * 400 for a delivery whose signature we could not verify. Surfaces the real Stripe
 * message (e.g. "No signatures found matching the expected signature for payload")
 * in BOTH the response body Stripe shows in the Dashboard and the function log, so
 * a secret mismatch is never again mistaken for something else. Retrying cannot fix
 * it, hence 4xx (and hence intentionally not reported to Sentry).
 */
function signatureFailure(primaryErr: unknown, billingErr?: unknown): Response {
  const primary = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
  const billing = billingErr === undefined
    ? undefined
    : billingErr instanceof Error ? billingErr.message : String(billingErr);
  console.error(
    `[stripe-webhooks] signature verification failed — default secret: ${primary}` +
    (billing ? ` | billing secret: ${billing}` : ' (no distinct billing secret configured)'),
  );
  return new Response(
    JSON.stringify({
      error: `Stripe signature verification failed: ${primary}`,
      code: 'signature_verification_failed',
      billing_secret_error: billing,
    }),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  );
}

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
  // per-module add-on subscriptions carry kind='module_addon' metadata. They grant a
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

  // If the new plan tier now INCLUDES a module this owner is paying for as an add-on,
  // cancel the redundant add-on so they aren't double-billed. Access is preserved because the
  // tier now covers it (and handleModuleAddonDeleted won't revoke a plan-covered module).
  await reconcileModuleAddonsForOwner(profile.user_id, tier).catch((e) =>
    console.error('[modules] add-on reconcile failed:', e));
}

// Cancel (at period end) any add-on subscriptions for workspaces this user owns whose
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
  const billingStripe = (await getPlatformBillingStripe()) ?? stripe;

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
  // Module add-on cancellation → revoke the workspace entitlement.
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

// A per-workspace module add-on subscription was created/updated. This is the ONLY
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
    const { slugs, error } = await grantBundle(supabase, workspaceId, moduleSlug, meta.user_id || null);
    if (error) {
      // Throw → non-2xx → Stripe retries. Upsert is idempotent so retry is safe.
      throw new Error(`module entitlement grant failed for ${workspaceId}/${moduleSlug}: ${error}`);
    }
    console.log(`Granted module '${moduleSlug}' (bundle: ${slugs.join(', ')}) to workspace ${workspaceId} (sub ${subscription.id})`);
  }
}

// Module add-on subscription deleted → mark the sub row and revoke the entitlement,
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
    // Withdraw the whole bundle, not just the slug that was billed — otherwise cancelling
    // Channels leaves social-media entitled forever, which nobody reports because nobody
    // complains about still having something.
    await revokeBundle(supabase, workspaceId, moduleSlug);
  }

  await supabase
    .from('workspace_module_subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('module_slug', moduleSlug);

  console.log(`Module add-on '${moduleSlug}' ended for ws ${workspaceId} (covered_by_plan=${covered}; sub ${subscription.id} deleted)`);
}

/** Keep the Connect routing config fresh from Stripe's own lifecycle events. */
async function handleConnectAccountUpdated(account: Stripe.Account) {
  const { error } = await supabase
    .from('workspace_payment_config')
    .update({
      charges_enabled: !!account.charges_enabled,
      details_submitted: !!account.details_submitted,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_connect_account_id', account.id);
  if (error) console.warn('[stripe-webhooks] connect account refresh failed:', error.message);
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  // Route by metadata.type FIRST — invoice payments don't require a registered user.
  if (paymentIntent.metadata?.type === 'invoice_payment') {
    await handleInvoicePaymentSucceeded(paymentIntent);
    return;
  }
  // Statement "pay balance" link — allocates across the party's open invoices.
  if (paymentIntent.metadata?.type === 'statement_payment') {
    await handleStatementPaymentSucceeded(paymentIntent);
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
        action_url: '/profile?tab=credits',
        credit_amount: parseFloat(creditAmount),
        payment_intent_id: paymentIntent.id,
      }).catch(() => {});
    }
  }
}

/**
 * Sales/Finance — Stripe PaymentIntent for an invoice in public.invoices.
 *
 * The actual bookkeeping (payments + payment_allocations + receipt + notifications)
 * lives in `_shared/payments/record-payment.ts` so every provider ingests identically
 * This function's only job is to translate Stripe's event shape into
 * the shared `PaymentSource`.
 */
async function handleInvoicePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const invoiceId = paymentIntent.metadata?.invoice_id;
  if (!invoiceId) {
    console.warn('invoice_payment metadata missing invoice_id', paymentIntent.id);
    return;
  }

  const amount = paymentIntent.amount_received
    ? paymentIntent.amount_received / 100
    : paymentIntent.amount / 100;

  const res = await recordInvoicePayment(supabase, invoiceId, {
    provider: 'stripe',
    providerRef: paymentIntent.id,
    providerLabel: 'Stripe',
    amount,
    currency: (paymentIntent.currency || 'eur').toUpperCase(),
    method: 'card',
    // notes/reference default to "Inv <number> via Stripe" in the shared helper — parity.
  });

  // Throw → non-2xx → Stripe retries. Only for real failures; a duplicate is a success.
  if (!res.ok) throw new Error(`invoice_payment ingestion failed: ${res.error}`);

  // Close the intent loop (audit F1): a settled Stripe checkout previously left its
  // invoice_payment_intents row 'pending' forever — the pay page's return leg and any
  // intents-based reconciliation were blind for Stripe. Best-effort: settlement above
  // already succeeded, so an update failure must not make Stripe retry the money.
  await supabase
    .from('invoice_payment_intents')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('provider', 'stripe')
    .eq('invoice_id', invoiceId)
    .eq('status', 'pending')
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn('[stripe-webhooks] intent close failed:', error.message);
    });
}

/**
 * Sales/Finance — a customer paid their WHOLE outstanding balance via the statement
 * "Pay balance" Stripe Payment Link (no single invoice_id). Allocation oldest-first +
 * receipt + notifications all live in the shared helper.
 */
async function handleStatementPaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const meta = paymentIntent.metadata ?? {};
  const workspaceId = meta.workspace_id;
  const partyType = meta.party_type as 'company' | 'contact' | undefined;
  const partyId = meta.party_id;
  if (!workspaceId || !partyType || !partyId) {
    console.warn('statement_payment metadata incomplete', paymentIntent.id);
    return;
  }

  const amount = (paymentIntent.amount_received ?? paymentIntent.amount) / 100;

  const res = await recordStatementPayment(
    supabase,
    { workspaceId, partyType, partyId },
    {
      provider: 'stripe',
      providerRef: paymentIntent.id,
      providerLabel: 'Stripe',
      amount,
      currency: (paymentIntent.currency || 'eur').toUpperCase(),
      method: 'card',
      notes: 'Account balance via Stripe payment link',
    },
  );

  if (!res.ok) throw new Error(`statement_payment ingestion failed: ${res.error}`);
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
    action_url: '/profile?tab=billing',
    payment_intent_id: paymentIntent.id,
  }).catch(() => {});
}

/**
 * A charge was refunded (fully or partially).
 *
 * Deliberately does NOT reverse the ledger automatically. Reversing money is a finance
 * decision with a legal artefact attached — in this platform a refund is settled by a CREDIT
 * NOTE, which carries its own numbering and myDATA obligations. Silently deleting
 * payment_allocations rows would leave the books internally consistent and legally wrong.
 *
 * So this raises it to a human, loudly and with the numbers, and leaves the credit-note flow
 * to do the reversal properly. That is the same conclusion viva-webhooks reached — the
 * difference is that this makes the alarm reach someone instead of stopping at console.error.
 */
async function handleChargeReversed(charge: Stripe.Charge, kind: 'refund' | 'dispute') {
  const amount = (charge.amount_refunded ?? 0) / 100;
  const currency = (charge.currency ?? 'eur').toUpperCase();
  console.warn(`[stripe] charge ${kind}: ${charge.id} — ${amount} ${currency}`);

  // Find the payment we recorded for this charge, so the alert names the invoice.
  const providerRef = charge.payment_intent
    ? String(charge.payment_intent)
    : charge.id;
  const { data: pay } = await supabase
    .from('payments')
    .select('id, workspace_id, amount, currency')
    .eq('provider', 'stripe')
    .eq('provider_ref', providerRef)
    .maybeSingle();

  const wsId = (pay as { workspace_id?: string } | null)?.workspace_id ?? null;
  const title = kind === 'refund'
    ? `Refund received — ${amount} ${currency}`
    : `Chargeback opened — ${amount} ${currency}`;
  const body = kind === 'refund'
    ? `Stripe refunded ${amount} ${currency}. The original payment is still allocated, so the invoice still reads as paid — issue a credit note to reverse it.`
    : `A customer disputed ${amount} ${currency}. The payment is still allocated until the dispute resolves.`;

  // Route to the workspace's owners/admins when we can tie it to one, so it reaches a person
  // rather than an unaddressed event. Falls back to a plain emit.
  const payload = {
    type: 'payment_reversed',
    reversal_kind: kind,
    workspace_id: wsId,
    payment_id: (pay as { id?: string } | null)?.id ?? null,
    charge_id: charge.id,
    amount: `${amount.toFixed(2)} ${currency}`,
    currency,
    title,
    body,
    action_url: '/finance?tab=doc_payments',
  };
  if (wsId) {
    await emitFlowEventToWorkspaceRoles(wsId, ['owner', 'admin'], 'payment_reversed',
      (recipientUserId) => ({ ...payload, user_id: recipientUserId })).catch(() => {});
  } else {
    await emitFlowEvent('payment_reversed', payload).catch(() => {});
  }
}

/** A customer opened a dispute. Same handling as a refund — flag it, do not reverse silently. */
async function handleDisputeOpened(dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;
  await handleChargeReversed(
    { id: chargeId, amount_refunded: dispute.amount, currency: dispute.currency, payment_intent: dispute.payment_intent } as Stripe.Charge,
    'dispute',
  );
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

