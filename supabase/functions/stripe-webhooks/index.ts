import { createClient } from '@supabase/supabase-js';
import Stripe from 'https://esm.sh/stripe@14.10.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// These must be set — fail loud at startup rather than silently accepting
// unsigned webhooks (which would allow anyone to forge payment events).
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
if (!stripeSecretKey)    throw new Error('STRIPE_SECRET_KEY env var is required');
if (!stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET env var is required');

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecretKey!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

/**
 * Stripe Webhooks Handler
 * Handles Stripe webhook events for subscription and payment processing
 */
Deno.serve(async (req) => {
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
      stripeWebhookSecret
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

  // Find user by email
  const { data: user } = await supabase.auth.admin.listUsers();
  const matchingUser = user.users.find(u => u.email === email);

  if (matchingUser) {
    await supabase
      .from('user_profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('user_id', matchingUser.id);
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
    }
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id}`);
  // Could send notification to user
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

  let monthlyCredits = 0;
  if (profile.subscription_tier === 'pro') monthlyCredits = 1000;
  else if (profile.subscription_tier === 'enterprise') monthlyCredits = 5000;

  if (monthlyCredits > 0) {
    const { error } = await supabase.rpc('grant_credits', {
      p_user_id: profile.user_id,
      p_amount: monthlyCredits,
      p_transaction_type: 'monthly_grant',
      p_description: `Monthly ${profile.subscription_tier} credits`,
      p_stripe_invoice_id: invoice.id,
      p_metadata: {
        subscription_tier: profile.subscription_tier,
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

