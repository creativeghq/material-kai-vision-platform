import Stripe from 'https://esm.sh/stripe@14.10.0';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getPlatformBillingStripe, getSupabase, noPaymentProviderResponse, hasDistinctBillingAccount } from '../../_shared/stripe-clients.ts';

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

    // Platform revenue (credits/subscriptions) is collected on the dedicated billing
    // account when configured (falls back to the default key otherwise). The getter resolves
    // env-first / platform_secrets-second by itself. If Stripe still isn't configured, the
    // canonical 503 routes the admin to the right settings page.
    const stripe = await getPlatformBillingStripe();
    const supabase = getSupabase();
    if (!stripe || !supabase) return noPaymentProviderResponse(corsHeaders);

    const user = auth.user;
    const userId = auth.userId;

    const { type, priceId, credits, price, successUrl, cancelUrl, workspaceId } = body;

    // Optional: a credit purchase can top up a WORKSPACE pool (shared credits) instead of the
    // buyer's personal wallet. Only an owner/admin of that workspace may fund it — verify before
    // trusting the body-supplied id (never trust workspace_id from the client, invariant #1).
    let poolWorkspaceId: string | null = null;
    if (type === 'credit_purchase' && workspaceId) {
      const { data: mem } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
      const { data: ws } = await supabase
        .from('workspaces')
        .select('created_by')
        .eq('id', workspaceId)
        .maybeSingle();
      const isManager = ['owner', 'admin'].includes((mem?.role as string) ?? '') || ws?.created_by === userId;
      if (!isManager) {
        return new Response(
          JSON.stringify({ error: 'Only a workspace owner/admin can fund the workspace credit pool' }),
          { status: 403, headers: corsHeaders },
        );
      }
      poolWorkspaceId = workspaceId;
    }

    // The customer must live on the SAME account we charge. When a distinct billing account is
    // configured, use a separate customer id (stripe_billing_customer_id) — a customer created
    // on the default account doesn't exist on the billing account.
    const distinct = await hasDistinctBillingAccount();
    const customerCol = distinct ? 'stripe_billing_customer_id' : 'stripe_customer_id';
    let customerId: string;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select(customerCol)
      .eq('user_id', userId)
      .single();

    if (profile?.[customerCol]) {
      customerId = profile[customerCol];
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      await supabase
        .from('user_profiles')
        .update({ [customerCol]: customerId })
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
            // Present only for a verified owner/admin funding the shared pool.
            ...(poolWorkspaceId ? { workspace_id: poolWorkspaceId } : {}),
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else if (type === 'subscription') {
      /**
       * THE SERVER DECIDES WHAT A SUBSCRIPTION COSTS (#360 CB-12).
       *
       * `price: priceId` took the Stripe price id straight from the request body, so a caller
       * could name ANY price that exists on the platform's Stripe account — a test price, an
       * archived one, a price belonging to a different product — and have a subscription created
       * against it. The one thing standing between that and a mispriced subscription was the
       * webhook's tier mapping, which is a different file with a different author.
       *
       * `subscription_plans` already holds the answer, and `crm-api`'s handler already reads it
       * that way. The client names a PLAN; the server names the price. Same defect as FE-23 in
       * #351 on the unified Stripe route.
       *
       * A legacy `priceId` is still accepted, but only if it IS one of the active plans' stored
       * price ids — which makes it a lookup, not a trust.
       */
      const planIdRaw = typeof body.planId === 'string' ? body.planId : null;
      const { data: plans, error: plansErr } = await supabase
        .from('subscription_plans')
        .select('id, name, stripe_price_id, is_active, contact_sales')
        .eq('is_active', true)
        .not('stripe_price_id', 'is', null);
      if (plansErr) {
        return new Response(
          JSON.stringify({ error: 'Could not load the plans; checkout was not started.' }),
          { status: 503, headers: corsHeaders },
        );
      }
      const activePlans = (plans ?? []) as Array<{
        id: string; name: string; stripe_price_id: string; contact_sales: boolean | null;
      }>;
      const plan = planIdRaw
        ? activePlans.find((pl) => pl.id === planIdRaw)
        : activePlans.find((pl) => pl.stripe_price_id === priceId);

      if (!plan) {
        return new Response(
          JSON.stringify({ error: 'That plan is not available.', code: 'unknown_plan' }),
          { status: 400, headers: corsHeaders },
        );
      }
      // A "contact sales" plan has no self-serve checkout by definition — it is priced per deal.
      if (plan.contact_sales) {
        return new Response(
          JSON.stringify({ error: 'This plan is arranged with sales, not bought online.', code: 'contact_sales' }),
          { status: 400, headers: corsHeaders },
        );
      }

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [
          {
            price: plan.stripe_price_id,
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: {
            user_id: userId,
            // The plan the server chose, so the webhook can settle the tier from OUR record
            // rather than re-deriving it from a price id it has to recognise.
            plan_id: plan.id,
            plan_name: plan.name,
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

