/** Stripe as a `PaymentProvider`. */

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
    // The platform key must exist at all. getStripe() resolves it env-first, platform_secrets
    // second, on its own — it does NOT depend on the caller having run bootstrapForFunction(),
    // which cannot populate env on the Supabase edge runtime.
    if (!(await getStripe())) return null;

    /**
     * WHERE THE MONEY LANDS IS A DECISION, NOT A FALLBACK (#359 CM-18).
     *
     * Deliberately not BYOK, unlike Viva: Connect is already here and is strictly better, because
     * the tenant's secret key never leaves Stripe. An unconnected workspace is refused, not routed
     * into the operator's balance.
     */
    const { data: routing, error } = await supabase.rpc('stripe_charge_routing', {
      p_workspace_id: workspaceId,
    });
    if (error) {
      console.error('[payments/stripe] stripe_charge_routing failed:', error.message || error);
      return null;
    }
    const route = (Array.isArray(routing) ? routing[0] : routing) as
      { destination: string | null; allowed: boolean; reason: string } | null;
    if (!route?.allowed) {
      // Null means "Stripe is not offerable for this workspace" — the pay page shows the other
      // providers and the operator is told to connect Stripe, which is a better outcome than a
      // payment that settles somewhere they cannot reach.
      return null;
    }

    return {
      workspaceId,
      credentials: route.destination ? { destination: String(route.destination) } : {},
      isSandbox: false,
    };
  },

  async createCharge(input: CreateChargeInput, ctx: PaymentProviderContext): Promise<ChargeResult> {
    const stripe = await getStripe();
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
