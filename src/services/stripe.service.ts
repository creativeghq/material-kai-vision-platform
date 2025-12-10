import { supabase } from '@/integrations/supabase/client';

const API_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

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

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  priceId: string;
  popular?: boolean;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
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
    creditPackageId: string,
    credits: number,
    price: number
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
        priceId: creditPackageId,
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
    priceId: string
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
   * Get available credit packages
   */
  getCreditPackages(): CreditPackage[] {
    return [
      {
        id: 'credits_100',
        name: '100 Credits',
        credits: 100,
        price: 10,
        priceId: import.meta.env.VITE_STRIPE_CREDITS_100_PRICE_ID || '',
      },
      {
        id: 'credits_500',
        name: '500 Credits',
        credits: 500,
        price: 45,
        priceId: import.meta.env.VITE_STRIPE_CREDITS_500_PRICE_ID || '',
        popular: true,
      },
      {
        id: 'credits_1000',
        name: '1,000 Credits',
        credits: 1000,
        price: 80,
        priceId: import.meta.env.VITE_STRIPE_CREDITS_1000_PRICE_ID || '',
      },
      {
        id: 'credits_5000',
        name: '5,000 Credits',
        credits: 5000,
        price: 350,
        priceId: import.meta.env.VITE_STRIPE_CREDITS_5000_PRICE_ID || '',
      },
    ];
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
        price: 29,
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
        price: 99,
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

