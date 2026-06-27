import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'https://esm.sh/stripe@14.10.0';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { getStripe, getSupabase, stripeWebhookSecret } from '../_shared/stripe-clients.ts';

// Module-level handles re-assigned per-request from the memoised shared
// factories. The downstream `handle*` functions reference these by name to
// avoid threading clients through 9 handler signatures. After the first
// successful request, the factories return the same singleton — these
// references just stay in scope.
let stripe!: Stripe;
let supabase!: SupabaseClient;

/**
 * Stripe Webhooks Handler
 * Handles Stripe webhook events for subscription and payment processing
 */
Deno.serve(async (req) => {
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
  stripe = _stripe;
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
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );

    console.log(`Received Stripe event: ${event.type}`);

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
});

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
    await supabase
      .from('user_profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('user_id', profile.user_id);
  }
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  // Update customer details if needed
  console.log(`Customer updated: ${customer.id}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Find user by Stripe customer ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id, subscription_tier')
    .eq('stripe_customer_id', customerId)
    .single();

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
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

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

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  // Route by metadata.type FIRST — invoice payments don't require a registered user.
  if (paymentIntent.metadata?.type === 'invoice_payment') {
    await handleInvoicePaymentSucceeded(paymentIntent);
    return;
  }

  const customerId = paymentIntent.customer as string;
  if (!customerId) return;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) return;

  // Check if this is a credit purchase (metadata should contain credit_amount)
  const creditAmount = paymentIntent.metadata?.credit_amount;

  if (creditAmount) {
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
    } else {
      console.log(`Granted ${creditAmount} credits to user ${profile.user_id}`);
      supabase.from('user_notifications').insert({
        user_id: profile.user_id,
        type: 'payment_success',
        title: 'Credits added to your account',
        body: `${creditAmount} credits have been added to your account.`,
        action_url: '/settings/billing',
        is_read: false,
        metadata: { credit_amount: parseFloat(creditAmount), payment_intent_id: paymentIntent.id },
      }).then(() => {});
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

  // Bell notify the invoice creator (if known)
  if (inv.created_by) {
    supabase.from('user_notifications').insert({
      user_id: inv.created_by,
      type: 'invoice_paid',
      title: `Invoice ${inv.internal_number} paid`,
      body: `${currency} ${amount.toFixed(2)} received via card.`,
      action_url: `/admin/finance/invoices/${inv.id}`,
      is_read: false,
      metadata: { invoice_id: inv.id, amount, currency, payment_intent_id: paymentIntent.id },
    }).then(() => {});
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id}`);
  const customerId = paymentIntent.customer as string;
  if (!customerId) return;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) return;

  supabase.from('user_notifications').insert({
    user_id: profile.user_id,
    type: 'payment_failed',
    title: 'Payment failed',
    body: 'Your payment could not be processed. Please update your payment details.',
    action_url: '/settings/billing',
    is_read: false,
    metadata: { payment_intent_id: paymentIntent.id },
  }).then(() => {});
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  // Only process subscription invoices (not one-time credit purchases)
  if (!invoice.subscription) return;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id, subscription_tier')
    .eq('stripe_customer_id', customerId)
    .single();

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
    } else {
      console.log(`Granted ${monthlyCredits} monthly credits to user ${profile.user_id} (invoice: ${invoice.id})`);
    }
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) return;

  // Update subscription status to past_due
  await supabase
    .from('user_profiles')
    .update({ subscription_status: 'past_due' })
    .eq('user_id', profile.user_id);

  console.log(`Invoice payment failed for user ${profile.user_id}`);
}

