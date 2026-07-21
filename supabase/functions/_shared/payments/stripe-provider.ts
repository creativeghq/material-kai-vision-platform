/**
 * #273 — Stripe as a `PaymentProvider`.
 *
 * Wraps the Checkout-session logic that `finance-pay-invoice` has always used, with no
 * behaviour change: the PLATFORM's Stripe key creates the session and the tenant is paid
 * via a Connect `transfer_data.destination`.
 *
 * Note the contrast with Viva, which is BYOK (the tenant's OWN merchant credentials):
 * Stripe's "credentials" here are the platform key plus the tenant's connected-account id.
 * That is why `resolveContext` returns non-null only when the workspace has actually
 * completed Connect onboarding — an unconnected workspace would otherwise be charging
 * money into the operator's account.
 */

import { getStripe } from '../stripe-clients.ts';
import type {
  ChargeResult,
  CreateChargeInput,
  PaymentProvider,
  PaymentProviderContext,
} from './types.ts';

const publicAppUrl = () => Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';

export const stripeProvider: PaymentProvider = {
  slug: 'stripe',
  label: 'Stripe',
  methods: ['card'],
  // Stripe charges in ~135 currencies; no restriction worth encoding.
  currencies: null,

  async resolveContext(supabase: any, workspaceId: string): Promise<PaymentProviderContext | null> {
    // The platform key must exist at all (env-first, platform_secrets second — the caller
    // has already run bootstrapForFunction()).
    if (!getStripe()) return null;

    // `get_workspace_payout_account` returns the connected account id only when the
    // workspace's Connect onboarding is complete (charges_enabled).
    const { data: destination, error } = await supabase.rpc('get_workspace_payout_account', {
      p_workspace_id: workspaceId,
    });
    if (error) {
      console.error('[payments/stripe] get_workspace_payout_account failed:', error.message || error);
      return null;
    }
    if (!destination) return null;

    return {
      workspaceId,
      credentials: { destination: String(destination) },
      isSandbox: false,
    };
  },

  async createCharge(input: CreateChargeInput, ctx: PaymentProviderContext): Promise<ChargeResult> {
    const stripe = getStripe();
    if (!stripe) throw new Error('Stripe is not configured');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: String(input.currency || 'eur').toLowerCase(),
            product_data: { name: input.description },
            unit_amount: Math.round(input.amount * 100),
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        ...(ctx.credentials.destination
          ? { transfer_data: { destination: ctx.credentials.destination } }
          : {}),
        metadata: {
          type: 'invoice_payment',
          invoice_id: input.invoiceId,
          workspace_id: ctx.workspaceId,
          internal_number: input.invoiceNumber,
        },
      },
      success_url: input.successUrl || `${publicAppUrl()}/finance/invoices/${input.invoiceId}?status=success`,
      cancel_url: input.cancelUrl || `${publicAppUrl()}/finance/invoices/${input.invoiceId}?status=cancelled`,
    });

    if (!session.url) throw new Error('Stripe returned no checkout URL');

    return { kind: 'redirect', url: session.url, orderCode: session.id };
  },
};
