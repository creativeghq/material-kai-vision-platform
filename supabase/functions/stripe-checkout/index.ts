import { createClient } from '@supabase/supabase-js';
import Stripe from 'https://esm.sh/stripe@14.10.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

/**
 * Stripe Checkout Session Creator
 * Creates Stripe Checkout sessions for credit purchases and subscriptions
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(withApiLogging('stripe-checkout', async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const user = auth.user;
    const userId = auth.userId;

    const body = await req.json();
    const { type, priceId, credits, price, successUrl, cancelUrl } = body;

    // Get or create Stripe customer
    let customerId: string;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: userId,
        },
      });

      customerId = customer.id;

      // Save customer ID to user profile
      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId);
    }

    // Create checkout session based on type
    let session: Stripe.Checkout.Session;

    if (type === 'credit_purchase') {
      // One-time payment for credits
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product: Deno.env.get('STRIPE_CREDITS_PRODUCT_ID') || '',
              unit_amount: Math.round(price * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: {
            type: 'credit_purchase',
            user_id: userId,
            credit_amount: credits.toString(),
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else if (type === 'subscription') {
      // Recurring subscription
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: {
            user_id: userId,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid checkout type' }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}));

