import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getStripe, getSupabase, noPaymentProviderResponse } from '../../_shared/stripe-clients.ts';

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

    // Resolve clients AFTER auth → bootstrap is guaranteed to have run.
    const stripe = getStripe();
    const supabase = getSupabase();
    if (!stripe || !supabase) return noPaymentProviderResponse(corsHeaders);

    const userId = auth.userId;

    const { returnUrl } = body;

    // Get Stripe customer ID
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No Stripe customer found. Please subscribe first.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
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

