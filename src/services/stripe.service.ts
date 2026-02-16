import { supabase } from '@/integrations/supabase/client';

const API_BASE = process.env.SUPABASE_URL + '/functions/v1';

/**
 * Stripe Service
 * Handles Stripe integration: checkout sessions, customer portal, subscriptions
 */

export interface CheckoutSessionParams {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreditQuote {
  credits: number;
  ratePerCredit: number;
  discount: number;
  tierName: string;
  nextTier: { name: string; minAmount: number; discount: number } | null;
}

// Credit purchase tiers: price per credit decreases with volume
// Break-even floor is ~$0.00667/credit (raw cost at 1.50x markup)
// All tiers maintain ≥20% margin over break-even after Stripe fees
const CREDIT_TIERS = [
  { minAmount: 80, ratePerCredit: 0.0085, discount: 15, name: 'Platinum' },
  { minAmount: 45, ratePerCredit: 0.009, discount: 10, name: 'Gold' },
  { minAmount: 10, ratePerCredit: 0.0095, discount: 5, name: 'Silver' },
  { minAmount: 1, ratePerCredit: 0.01, discount: 0, name: 'Standard' },
] as const;

export function calculateCreditsForAmount(dollarAmount: number): CreditQuote {
  const amount = Math.max(1, dollarAmount);
  const tierIndex = CREDIT_TIERS.findIndex((t) => amount >= t.minAmount);
  const tier = CREDIT_TIERS[tierIndex >= 0 ? tierIndex : CREDIT_TIERS.length - 1];
  const nextTier = tierIndex > 0 ? CREDIT_TIERS[tierIndex - 1] : null;

  return {
    credits: Math.floor(amount / tier.ratePerCredit),
    ratePerCredit: tier.ratePerCredit,
    discount: tier.discount,
    tierName: tier.name,
    nextTier: nextTier
      ? { name: nextTier.name, minAmount: nextTier.minAmount, discount: nextTier.discount }
      : null,
  };
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  priceId: string;
  monthlyCredits: number;
  features: string[];
  popular?: boolean;
}

export const stripeAPI = {
  /**
   * Create Stripe Checkout session for credit purchase
   */
  async createCreditCheckoutSession(
    credits: number,
    price: number,
  ): Promise<{ url: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/stripe-checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'credit_purchase',
        credits,
        price,
        successUrl: `${window.location.origin}/profile?tab=credits&success=true`,
        cancelUrl: `${window.location.origin}/profile?tab=credits&canceled=true`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    return response.json();
  },

  /**
   * Create Stripe Checkout session for subscription
   */
  async createSubscriptionCheckoutSession(
    priceId: string,
  ): Promise<{ url: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/stripe-checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'subscription',
        priceId,
        successUrl: `${window.location.origin}/profile?tab=subscription&success=true`,
        cancelUrl: `${window.location.origin}/profile?tab=subscription&canceled=true`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    return response.json();
  },

  /**
   * Create Stripe Customer Portal session
   * Allows users to manage their subscription, payment methods, invoices
   */
  async createCustomerPortalSession(): Promise<{ url: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/stripe-customer-portal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        returnUrl: `${window.location.origin}/profile?tab=subscription`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create customer portal session');
    }

    return response.json();
  },

  /**
   * Get available subscription tiers
   */
  getSubscriptionTiers(): SubscriptionTier[] {
    return [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'EUR',
        priceId: '',
        monthlyCredits: 100,
        features: [
          '100 credits/month',
          'Basic AI features',
          'Community support',
          '1 workspace',
        ],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 25,
        currency: 'EUR',
        priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || '',
        monthlyCredits: 1000,
        features: [
          '1,000 credits/month',
          'Advanced AI features',
          'Priority support',
          'Unlimited workspaces',
          'API access',
        ],
        popular: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 500,
        currency: 'EUR',
        priceId: import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID || '',
        monthlyCredits: 5000,
        features: [
          '5,000 credits/month',
          'All Pro features',
          'Dedicated support',
          'Custom integrations',
          'SLA guarantee',
          'Team collaboration',
        ],
      },
    ];
  },
};

/**
 * StripeService class wrapper for compatibility
 */
export class StripeService {
  async createCreditCheckoutSession(credits: number, price: number) {
    return stripeAPI.createCreditCheckoutSession(credits, price);
  }

  async createSubscriptionCheckoutSession(priceId: string) {
    return stripeAPI.createSubscriptionCheckoutSession(priceId);
  }

  async createCustomerPortalSession() {
    return stripeAPI.createCustomerPortalSession();
  }

  getSubscriptionTiers() {
    return stripeAPI.getSubscriptionTiers();
  }
}
