import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * CRM Stripe API
 * Handles subscription and credit purchase operations
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/crm-stripe-api

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

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

      // Get or create Stripe customer
      const { data: stripeCustomer } = await supabase
        .from('stripe_customers')
        .select('stripe_id')
        .eq('user_id', user.id)
        .single();

      // TODO: Create Stripe checkout session
      // This requires Stripe API integration

      return new Response(
        JSON.stringify({
          message: 'Checkout session creation requires Stripe API setup',
          plan: plan,
        }),
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

      // TODO: Create Stripe checkout for credit purchase
      // This requires Stripe API integration

      return new Response(
        JSON.stringify({
          message: 'Credit purchase requires Stripe API setup',
          package: creditPackage,
        }),
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
        .eq('user_id', user.id)
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
        .eq('user_id', user.id)
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
});

