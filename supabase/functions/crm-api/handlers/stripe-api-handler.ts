import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getStripe, getSupabase, noPaymentProviderResponse } from '../../_shared/stripe-clients.ts';

// This file used to keep its own `const stripeSecretKey = () => Deno.env.get(...)` and build the
// client AT MODULE LOAD. Two bugs in one line: a module-load env read can't see anything the
// handler resolves later, and a private copy of the factory meant this handler never picked up
// the platform_secrets fallback the shared one now provides. Both clients are the same account
// (STRIPE_SECRET_KEY) — deliberately unchanged here, since moving platform revenue to the
// billing account would also have to move which customer-id column is read.

/**
 * CRM Stripe API
 * Handles subscription and credit purchase operations
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
export async function handleCrmStripe(req: Request): Promise<Response> {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripe = await getStripe();
    const supabase = getSupabase();
    if (!stripe || !supabase) return noPaymentProviderResponse(corsHeaders);

    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.replace(/^(\/functions\/v1)?(\/crm-api)?\/stripe/, '').split('/').filter(Boolean);

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const user = auth.user;
    const userId = auth.userId;

    // POST /api/subscriptions/create-checkout - Create checkout session
    if (method === 'POST' && path[0] === 'subscriptions' && path[1] === 'create-checkout') {
      const body = await req.json();
      const { plan_id } = body;

      if (!plan_id) {
        return new Response(
          JSON.stringify({ error: 'Missing plan_id' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Get subscription plan
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .single();

      if (planError || !plan) {
        return new Response(
          JSON.stringify({ error: 'Plan not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // A `stripe_customers` lookup used to sit here. That table does not exist — and the result
      // was never read: the `user_profiles.stripe_customer_id` read immediately below already
      // answered the same question and is what `customerId` is actually assigned from. So this was
      // a failing query whose only effect was one wasted round trip per checkout. (audit #270)
      let customerId: string;
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single();

      if (profile?.stripe_customer_id) {
        customerId = profile.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          // `user` is null for every non-'user' auth level (secret / anon / partner api_key),
          // so `user.email` threw rather than 500ing cleanly. Stripe treats email as optional and
          // the customer is linked by `metadata.supabase_user_id` regardless, so an absent address
          // costs the receipt, not the checkout.
          email: user?.email ?? undefined,
          metadata: { supabase_user_id: userId },
        });
        customerId = customer.id;
        await supabase
          .from('user_profiles')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', userId);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        subscription_data: { metadata: { user_id: userId } },
        success_url: `${Deno.env.get('APP_URL') || 'https://app.example.com'}/billing?success=1`,
        cancel_url: `${Deno.env.get('APP_URL') || 'https://app.example.com'}/billing?cancelled=1`,
      });

      if (!session.url) {
        return new Response(
          JSON.stringify({ error: 'Stripe checkout session created but URL was missing' }),
          { status: 502, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ url: session.url }),
        { status: 200, headers: corsHeaders },
      );
    }

    // POST /api/credits/purchase - Purchase credits
    if (method === 'POST' && path[0] === 'credits' && path[1] === 'purchase') {
      const body = await req.json();
      const { package_id } = body;

      if (!package_id) {
        return new Response(
          JSON.stringify({ error: 'Missing package_id' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Get credit package
      const { data: creditPackage, error: packageError } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('id', package_id)
        .single();

      if (packageError || !creditPackage) {
        return new Response(
          JSON.stringify({ error: 'Package not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Get or create Stripe customer
      let customerId: string;
      const { data: creditProfile } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single();

      if (creditProfile?.stripe_customer_id) {
        customerId = creditProfile.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          // `user` is null for every non-'user' auth level (secret / anon / partner api_key),
          // so `user.email` threw rather than 500ing cleanly. Stripe treats email as optional and
          // the customer is linked by `metadata.supabase_user_id` regardless, so an absent address
          // costs the receipt, not the checkout.
          email: user?.email ?? undefined,
          metadata: { supabase_user_id: userId },
        });
        customerId = customer.id;
        await supabase
          .from('user_profiles')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', userId);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{ price: creditPackage.stripe_price_id, quantity: 1 }],
        payment_intent_data: {
          metadata: {
            type: 'credit_purchase',
            user_id: userId,
            credit_amount: creditPackage.credits.toString(),
          },
        },
        success_url: `${Deno.env.get('APP_URL') || 'https://app.example.com'}/billing?success=1`,
        cancel_url: `${Deno.env.get('APP_URL') || 'https://app.example.com'}/billing?cancelled=1`,
      });

      return new Response(
        JSON.stringify({ url: session.url }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/subscriptions - Get user subscription
    if (method === 'GET' && path[0] === 'subscriptions') {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          id,
          user_id,
          plan_id,
          status,
          current_period_start,
          current_period_end,
          subscription_plans(name, price, description)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ data: null }),
          { status: 200, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/credits - Get user credits
    if (method === 'GET' && path[0] === 'credits') {
      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Credits not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders },
    );
  }
}

