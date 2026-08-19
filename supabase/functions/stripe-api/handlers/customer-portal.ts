import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getPlatformBillingStripe, getSupabase, noPaymentProviderResponse, hasDistinctBillingAccount } from '../../_shared/stripe-clients.ts';

/**
 * Stripe Customer Portal Session Creator
 * Creates Stripe Customer Portal sessions for subscription management
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
export async function handleCustomerPortal(req: Request, body: any): Promise<Response> {
  try {
    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Subscriptions/credits live on the platform-billing account; manage them there.
    const stripe = await getPlatformBillingStripe();
    const supabase = getSupabase();
    if (!stripe || !supabase) return noPaymentProviderResponse(corsHeaders);

    const userId = auth.userId;

    const { returnUrl } = body;

    // Use the customer id for the account we're opening the portal on.
    const customerCol = (await hasDistinctBillingAccount()) ? 'stripe_billing_customer_id' : 'stripe_customer_id';
    const { data: profile } = await supabase
      .from('user_profiles')
      .select(customerCol)
      .eq('user_id', userId)
      .single();

    if (!profile?.[customerCol]) {
      return new Response(
        JSON.stringify({ error: 'No Stripe customer found. Please subscribe first.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: profile[customerCol],
      return_url: returnUrl,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Customer portal error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

