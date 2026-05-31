import Stripe from 'https://esm.sh/stripe@14.10.0';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getStripe, getSupabase, noPaymentProviderResponse } from '../../_shared/stripe-clients.ts';

/**
 * Stripe Checkout Session Creator
 * Creates Stripe Checkout sessions for credit purchases and subscriptions
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
export async function handleCheckout(req: Request, body: any): Promise<Response> {
  try {
    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Resolve clients AFTER auth → bootstrap is guaranteed to have run
    // (authenticate() triggers it). If Stripe still isn't configured, the
    // canonical 503 message routes the admin to the right settings page.
    const stripe = getStripe();
    const supabase = getSupabase();
    if (!stripe || !supabase) return noPaymentProviderResponse(corsHeaders);

    const user = auth.user;
    const userId = auth.userId;

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
      // Derive credit amount server-side from the payment amount.
      // Exchange rate: 1 EUR = 100 credits. The client-supplied `credits`
      // field is ignored — only `price` (EUR) is trusted.
      const CREDITS_PER_EUR = 100;
      const priceEur = Math.max(0.5, Number(price) || 0);
      const serverCredits = Math.round(priceEur * CREDITS_PER_EUR);

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product: Deno.env.get('STRIPE_CREDITS_PRODUCT_ID') || '',
              unit_amount: Math.round(priceEur * 100),
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: {
            type: 'credit_purchase',
            user_id: userId,
            credit_amount: serverCredits.toString(),
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
}

