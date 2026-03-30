/**
 * External Service Credit Utilities for Supabase Edge Functions
 *
 * Shared credit debit helper for all external (non-AI) services:
 * Twilio, Apollo, Hunter.io, ZeroBounce, Firecrawl.
 *
 * Mirrors pricing from Python AIPricingConfig.EXTERNAL_SERVICE_PRICING.
 * Uses the existing debit_user_credits RPC and ai_usage_logs table.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── External Service Pricing (per unit, in USD) ──
// Kept in sync with mivaa-pdf-extractor/app/config/ai_pricing.py
const EXTERNAL_SERVICE_PRICING: Record<string, { cost_per_unit: number; unit: string }> = {
  'twilio-sms':           { cost_per_unit: 0.0079, unit: 'message' },
  'twilio-whatsapp':      { cost_per_unit: 0.005,  unit: 'message' },
  'apollo-enrich':        { cost_per_unit: 0.05,   unit: 'enrichment' },
  'apollo-people-match':  { cost_per_unit: 0.03,   unit: 'lookup' },
  'hunter-email-finder':  { cost_per_unit: 0.01,   unit: 'search' },
  'hunter-domain-search': { cost_per_unit: 0.01,   unit: 'search' },
  'zerobounce-validate':  { cost_per_unit: 0.008,  unit: 'validation' },
  'firecrawl-scrape':     { cost_per_unit: 0.001,  unit: 'credit' },
  // Social media image generation
  'xai-aurora':           { cost_per_unit: 0.07,   unit: 'image' },    // → ~10 cr after markup
  'flux-2-pro':           { cost_per_unit: 0.04,   unit: 'image' },    // → ~6 cr after markup (FLUX 2 Pro)
  'flux-dev':             { cost_per_unit: 0.04,   unit: 'image' },    // legacy fallback
  // Social media video generation (cost per second of output)
  'kling-3.0':            { cost_per_unit: 0.10,   unit: 'second' },   // Kling 3.0 — cinematic + audio
  'kling-1.6-pro':        { cost_per_unit: 0.08,   unit: 'second' },   // legacy fallback
  'wan2.1-i2v':           { cost_per_unit: 0.05,   unit: 'second' },   // 10s → ~8 cr after markup
  'runway-gen4-turbo':    { cost_per_unit: 0.15,   unit: 'second' },   // 10s → ~23 cr after markup
  // Social caption/hashtag generation (Claude Haiku)
  'social-caption':       { cost_per_unit: 0.002,  unit: 'generation' }, // → ~2 cr after markup
  // Late.dev publishing (flat subscription — zero per-post cost)
  'late-publish':         { cost_per_unit: 0.0,    unit: 'post' },
};

// Platform markup (50% on top of raw cost)
const MARKUP_MULTIPLIER = 1.50;

export interface CreditDebitResult {
  success: boolean;
  credits_debited: number;
  raw_cost_usd: number;
  billed_cost_usd: number;
  new_balance?: number;
  transaction_id?: string;
  error?: string;
}

/**
 * Debit user credits for an external service operation.
 *
 * 1. Looks up per-unit cost from EXTERNAL_SERVICE_PRICING
 * 2. Applies 50% markup
 * 3. Converts to platform credits (1 credit = $0.01)
 * 4. Calls debit_user_credits RPC
 * 5. Inserts a row into ai_usage_logs for tracking
 */
export async function debitExternalServiceCredits(
  supabase: SupabaseClient,
  userId: string,
  serviceName: string,
  operationType: string,
  units: number = 1,
  metadata?: Record<string, unknown>,
): Promise<CreditDebitResult> {
  try {
    const pricing = EXTERNAL_SERVICE_PRICING[serviceName];
    if (!pricing) {
      console.error(`[credit-utils] Unknown service: ${serviceName}`);
      return { success: false, credits_debited: 0, raw_cost_usd: 0, billed_cost_usd: 0, error: `Unknown service: ${serviceName}` };
    }

    // Cost calculation
    const rawCost = pricing.cost_per_unit * units;
    const billedCost = rawCost * MARKUP_MULTIPLIER;
    const creditsToDebit = Math.round(billedCost * 100 * 100) / 100; // round to 2 decimals

    if (creditsToDebit <= 0) {
      return { success: true, credits_debited: 0, raw_cost_usd: 0, billed_cost_usd: 0 };
    }

    // Debit credits via RPC
    const { data: debitData, error: debitError } = await supabase.rpc('debit_user_credits', {
      p_user_id: userId,
      p_amount: creditsToDebit,
      p_operation_type: operationType,
      p_description: `${serviceName} ${operationType} (${units} ${pricing.unit}${units !== 1 ? 's' : ''})`,
      p_metadata: { ...metadata, service: serviceName, units, unit_type: pricing.unit },
    });

    if (debitError) {
      console.error(`[credit-utils] Debit RPC error for ${serviceName}:`, debitError);
      return { success: false, credits_debited: creditsToDebit, raw_cost_usd: rawCost, billed_cost_usd: billedCost, error: debitError.message };
    }

    const result = Array.isArray(debitData) ? debitData[0] : debitData;
    if (!result?.success) {
      const errMsg = result?.error_message || 'Insufficient credits';
      console.warn(`[credit-utils] Debit failed for user ${userId}: ${errMsg}`);
      return { success: false, credits_debited: creditsToDebit, raw_cost_usd: rawCost, billed_cost_usd: billedCost, error: errMsg };
    }

    // Log to ai_usage_logs for admin dashboards
    const { error: logError } = await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: operationType,
      model_name: serviceName,
      api_provider: serviceName.split('-')[0], // twilio, apollo, hunter, zerobounce, firecrawl
      input_tokens: 0,
      output_tokens: 0,
      input_cost_usd: 0,
      output_cost_usd: 0,
      raw_cost_usd: rawCost,
      markup_multiplier: MARKUP_MULTIPLIER,
      billed_cost_usd: billedCost,
      total_cost_usd: billedCost,
      credits_debited: creditsToDebit,
      metadata: {
        ...metadata,
        billing_type: 'per_unit',
        service: serviceName,
        units,
        unit_type: pricing.unit,
        cost_per_unit: pricing.cost_per_unit,
      },
      created_at: new Date().toISOString(),
    });

    if (logError) {
      // Non-fatal: credits already debited, just log the failure
      console.error(`[credit-utils] Failed to log usage for ${serviceName}:`, logError);
    }

    console.log(
      `[credit-utils] Debited ${creditsToDebit} credits from user ${userId} ` +
      `for ${serviceName} (${units} ${pricing.unit}${units !== 1 ? 's' : ''}). ` +
      `Raw: $${rawCost.toFixed(4)}, Billed: $${billedCost.toFixed(4)}. ` +
      `New balance: ${result.new_balance}`
    );

    return {
      success: true,
      credits_debited: creditsToDebit,
      raw_cost_usd: rawCost,
      billed_cost_usd: billedCost,
      new_balance: result.new_balance,
      transaction_id: result.transaction_id,
    };
  } catch (err) {
    console.error(`[credit-utils] Unexpected error debiting ${serviceName}:`, err);
    return { success: false, credits_debited: 0, raw_cost_usd: 0, billed_cost_usd: 0, error: String(err) };
  }
}

/**
 * Get the pricing info for a service (useful for cost previews).
 */
export function getServicePricing(serviceName: string): { cost_per_unit: number; unit: string } | null {
  return EXTERNAL_SERVICE_PRICING[serviceName] ?? null;
}

/**
 * Pre-check if user has enough credits for an operation BEFORE making API calls.
 * Returns { sufficient: true, required_credits } or { sufficient: false, balance, required_credits }.
 */
export async function checkCreditBalance(
  supabase: SupabaseClient,
  userId: string,
  serviceName: string,
  units: number = 1,
): Promise<{ sufficient: boolean; balance: number; required_credits: number }> {
  const pricing = EXTERNAL_SERVICE_PRICING[serviceName];
  if (!pricing) return { sufficient: false, balance: 0, required_credits: 0 };

  const rawCost = pricing.cost_per_unit * units;
  const billedCost = rawCost * MARKUP_MULTIPLIER;
  const requiredCredits = Math.round(billedCost * 100 * 100) / 100;

  const { data, error } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  const balance = data?.balance ?? 0;
  return { sufficient: balance >= requiredCredits, balance, required_credits: requiredCredits };
}

/**
 * List all configured external service names.
 */
export function getExternalServiceNames(): string[] {
  return Object.keys(EXTERNAL_SERVICE_PRICING);
}
