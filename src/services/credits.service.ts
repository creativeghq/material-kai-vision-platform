import { supabase } from '@/integrations/supabase/client';

/**
 * Credits Service
 * Handles all credit-related operations: balance checks, transactions, usage logs
 */

export interface CreditBalance {
  balance: number;
  user_id: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  transaction_type: 'purchase' | 'debit' | 'refund' | 'bonus' | 'monthly_grant';
  amount: number;
  balance_after: number;
  stripe_payment_intent_id?: string;
  stripe_invoice_id?: string;
  description?: string;
  metadata?: any;
  created_at: string;
}

export interface AIUsageLog {
  id: string;
  user_id: string;
  workspace_id?: string;
  operation_type: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
  credits_debited: number;
  metadata?: any;
  created_at: string;
}

export interface DebitResult {
  success: boolean;
  new_balance: number;
  transaction_id?: string;
  error_message?: string;
}

export interface GrantResult {
  success: boolean;
  new_balance: number;
  transaction_id?: string;
  error_message?: string;
}

export const creditsAPI = {
  /**
   * Get current credit balance for authenticated user
   */
  async getBalance(): Promise<CreditBalance> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // If no credits record exists, create one with 0 balance
      if (error.code === 'PGRST116') {
        const { data: newRecord, error: insertError } = await supabase
          .from('user_credits')
          .insert({ user_id: user.id, balance: 0 })
          .select()
          .single();

        if (insertError) throw insertError;
        return newRecord;
      }
      throw error;
    }

    return data;
  },

  /**
   * Get credit transaction history
   */
  async getTransactions(limit = 50, offset = 0): Promise<{ data: CreditTransaction[]; count: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error, count } = await supabase
      .from('credit_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return { data: data || [], count: count || 0 };
  },

  /**
   * Get AI usage logs
   */
  async getUsageLogs(limit = 50, offset = 0): Promise<{ data: AIUsageLog[]; count: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error, count } = await supabase
      .from('ai_usage_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return { data: data || [], count: count || 0 };
  },

  /**
   * Debit credits from user account
   * This should only be called by backend services, not directly from frontend
   */
  async debitCredits(
    amount: number,
    operationType: string,
    description?: string,
    metadata?: any,
  ): Promise<DebitResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('debit_user_credits', {
      p_user_id: user.id,
      p_amount: amount,
      p_operation_type: operationType,
      p_description: description,
      p_metadata: metadata,
    });

    if (error) throw error;

    return data[0];
  },

  /**
   * Calculate cost for AI operation
   * Based on token usage and model pricing
   */
  calculateCost(
    modelName: string,
    inputTokens: number,
    outputTokens: number,
  ): { inputCost: number; outputCost: number; totalCost: number; credits: number } {
    // Model pricing per 1M tokens (in USD) - synced with ai_model_pricing DB table
    // Last synced: 2026-02-15
    const pricing: Record<string, { input: number; output: number }> = {
      // Claude Models
      'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
      'claude-haiku-4-5': { input: 1.00, output: 5.00 },
      'claude-opus-4-5': { input: 5.00, output: 25.00 },
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },

      // OpenAI Models
      'gpt-5': { input: 5.00, output: 15.00 },
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'text-embedding-3-small': { input: 0.02, output: 0.00 },
      'text-embedding-3-large': { input: 0.13, output: 0.00 },

      // Voyage AI Embeddings
      'voyage-3.5': { input: 0.06, output: 0.00 },
      'voyage-3.5-lite': { input: 0.02, output: 0.00 },
      'voyage-3': { input: 0.06, output: 0.00 },
      'voyage-3-lite': { input: 0.02, output: 0.00 },
      'voyage-large-2-instruct': { input: 0.12, output: 0.00 },

      // Qwen Vision Models (HuggingFace Endpoint - 32B only)
      'qwen3-vl-32b': { input: 0.40, output: 0.40 },
      'Qwen/Qwen3-VL-32B-Instruct': { input: 0.40, output: 0.40 },
    };

    // Flat-rate pricing for non-token-based services (in credits, includes 1.50x markup)
    const flatRatePricing: Record<string, number> = {
      'worldlabs-marble-mini': 75,   // $0.50 raw × 1.50 markup = $0.75 → 75 credits
      'worldlabs-marble-plus': 300,  // $2.00 raw × 1.50 markup = $3.00 → 300 credits
    };

    // Check for flat-rate model first
    if (flatRatePricing[modelName]) {
      const credits = flatRatePricing[modelName];
      return {
        inputCost: credits / 100,
        outputCost: 0,
        totalCost: credits / 100,
        credits,
      };
    }

    const modelPricing = pricing[modelName] || pricing['gpt-4o-mini'];

    const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
    const outputCost = (outputTokens / 1_000_000) * modelPricing.output;
    const totalCost = inputCost + outputCost;

    // Convert USD to credits (1 credit = $0.01)
    const credits = totalCost * 100;

    return {
      inputCost: parseFloat(inputCost.toFixed(6)),
      outputCost: parseFloat(outputCost.toFixed(6)),
      totalCost: parseFloat(totalCost.toFixed(6)),
      credits: parseFloat(credits.toFixed(2)),
    };
  },
};

/**
 * CreditsService class wrapper for compatibility
 */
export class CreditsService {
  async getBalance() {
    return creditsAPI.getBalance();
  }

  async getTransactions(limit?: number) {
    return creditsAPI.getTransactions(limit);
  }

  async getUsageLogs(limit?: number) {
    return creditsAPI.getUsageLogs(limit);
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number) {
    return creditsAPI.calculateCost(model, inputTokens, outputTokens);
  }
}
