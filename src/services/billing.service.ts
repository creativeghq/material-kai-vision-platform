import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price_in_cents: number;
  currency: string;
  stripe_product_id?: string;
  stripe_price_id?: string;
  features?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_in_cents: number;
  currency: string;
  stripe_product_id?: string;
  stripe_price_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  stripe_subscription_id?: string;
  status: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at?: string;
  created_at: string;
  updated_at: string;
  subscription_plans?: SubscriptionPlan;
}

export interface UserCredits {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'usage' | 'refund' | 'bonus';
  description?: string;
  reference_id?: string;
  created_at: string;
}

/**
 * Billing Service
 * Handles subscription and credit operations
 */
export const billingService = {
  /**
   * Get all active subscription plans
   */
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_in_cents', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get all active credit packages
   */
  async getCreditPackages(): Promise<CreditPackage[]> {
    const { data, error } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('is_active', true)
      .order('credits', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get user's current subscription
   */
  async getUserSubscription(): Promise<UserSubscription | null> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api/stripe/subscriptions`,
      {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch subscription');
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * Get user's credit balance
   */
  async getUserCredits(): Promise<UserCredits | null> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api/stripe/credits`,
      {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch credits');
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * Create checkout session for subscription
   */
  async createSubscriptionCheckout(planId: string): Promise<{ url: string }> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api/stripe/subscriptions/create-checkout`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: planId }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    return await response.json();
  },

  /**
   * Purchase credits
   */
  async purchaseCredits(packageId: string): Promise<{ url: string }> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api/stripe/credits/purchase`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ package_id: packageId }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to purchase credits');
    }

    return await response.json();
  },

  /**
   * Get credit transaction history
   */
  async getCreditTransactions(limit = 50): Promise<CreditTransaction[]> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) throw new Error('Not authenticated');

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },
};

