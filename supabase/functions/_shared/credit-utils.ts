/**
 * External Service Credit Utilities for Supabase Edge Functions
 *
 * Shared credit debit helper for all external (non-AI) per-unit services:
 * Zernio (WhatsApp), Apollo, Hunter.io, ZeroBounce, Firecrawl, FLUX, Kling, Wan2.1, Runway, xAI Aurora, etc.
 *
 * Pricing source: ai_model_pricing table where category='external_service' and billing_type='per_unit'.
 * Admins manage these via the AIModelPricingTab; this module reads the live values via Supabase
 * and caches the result for 5 minutes to avoid hitting the DB on every credit debit.
 *
 * Uses the shared debit_credits/refund_credits router (workspace pool → personal) and ai_usage_logs.
 */

import type { DbClient } from './supabase-client.ts';
import { SupabaseClient } from '@supabase/supabase-js';
import { MARKUP_MULTIPLIER } from './pricing-constants.ts';

// ── DB-backed external service pricing with in-memory cache ──
interface ServicePricing {
  cost_per_unit: number;
  unit: string;
  markup_multiplier: number;
}

const PRICING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _pricingCache: { data: Record<string, ServicePricing>; expiresAt: number } | null = null;
let _pricingFetchPromise: Promise<Record<string, ServicePricing>> | null = null;

/**
 * Last-resort fallback used only if the DB fetch fails entirely.
 * Keeps the platform billing safe in degraded mode — users still get billed
 * something rather than free service. Numbers must mirror the DB seed.
 */
const FALLBACK_PRICING: Record<string, ServicePricing> = {
  'zernio-whatsapp':      { cost_per_unit: 0.005,  unit: 'message',     markup_multiplier: MARKUP_MULTIPLIER },
  'apollo-enrich':        { cost_per_unit: 0.05,   unit: 'enrichment',  markup_multiplier: MARKUP_MULTIPLIER },
  'apollo-people-match':  { cost_per_unit: 0.03,   unit: 'lookup',      markup_multiplier: MARKUP_MULTIPLIER },
  'hunter-email-finder':  { cost_per_unit: 0.01,   unit: 'search',      markup_multiplier: MARKUP_MULTIPLIER },
  'hunter-domain-search': { cost_per_unit: 0.01,   unit: 'search',      markup_multiplier: MARKUP_MULTIPLIER },
  'zerobounce-validate':  { cost_per_unit: 0.008,  unit: 'validation',  markup_multiplier: MARKUP_MULTIPLIER },
  'firecrawl-scrape':     { cost_per_unit: 0.001,  unit: 'credit',      markup_multiplier: MARKUP_MULTIPLIER },
  'xai-aurora':           { cost_per_unit: 0.07,   unit: 'image',       markup_multiplier: MARKUP_MULTIPLIER },
  'flux-2-pro':           { cost_per_unit: 0.04,   unit: 'image',       markup_multiplier: MARKUP_MULTIPLIER },
  'flux-dev':             { cost_per_unit: 0.04,   unit: 'image',       markup_multiplier: MARKUP_MULTIPLIER },
  'kling-3.0':            { cost_per_unit: 0.10,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER },
  'kling-1.6-pro':        { cost_per_unit: 0.08,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER },
  'wan2.1-i2v':           { cost_per_unit: 0.05,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER },
  'runway-gen4-turbo':    { cost_per_unit: 0.15,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER },
  'social-caption':       { cost_per_unit: 0.002,  unit: 'generation',  markup_multiplier: MARKUP_MULTIPLIER },
  'zernio-publish':       { cost_per_unit: 0.0,    unit: 'post',        markup_multiplier: MARKUP_MULTIPLIER },
};

async function fetchPricingFromDB(supabase: DbClient): Promise<Record<string, ServicePricing>> {
  const { data, error } = await supabase
    .from('ai_model_pricing')
    .select('model_key, cost_per_unit, unit_label, markup_multiplier')
    .eq('billing_type', 'per_unit')
    .eq('category', 'external_service')
    .eq('is_active', true);

  if (error) {
    console.error('[credit-utils] DB fetch failed, using fallback pricing:', error);
    return FALLBACK_PRICING;
  }

  if (!data || data.length === 0) {
    console.warn('[credit-utils] No external_service rows returned from DB, using fallback');
    return FALLBACK_PRICING;
  }

  const map: Record<string, ServicePricing> = {};
  for (const row of data) {
    map[row.model_key] = {
      cost_per_unit: Number(row.cost_per_unit) || 0,
      unit: row.unit_label || 'unit',
      markup_multiplier: Number(row.markup_multiplier) || MARKUP_MULTIPLIER,
    };
  }
  return map;
}

async function getPricingMap(supabase: DbClient): Promise<Record<string, ServicePricing>> {
  const now = Date.now();
  if (_pricingCache && _pricingCache.expiresAt > now) {
    return _pricingCache.data;
  }
  // De-dupe concurrent fetches
  if (!_pricingFetchPromise) {
    _pricingFetchPromise = fetchPricingFromDB(supabase)
      .then((data) => {
        _pricingCache = { data, expiresAt: Date.now() + PRICING_CACHE_TTL_MS };
        return data;
      })
      .finally(() => {
        _pricingFetchPromise = null;
      });
  }
  return _pricingFetchPromise;
}

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
 * 1. Looks up per-unit cost from DB-backed cache (ai_model_pricing)
 * 2. Applies platform markup (per-row markup_multiplier; defaults to 1.50)
 * 3. Converts to platform credits (1 credit = $0.01)
 * 4. Calls the debit_credits router RPC (pools when a workspaceId is passed + funded)
 * 5. Inserts a row into ai_usage_logs for tracking
 */
export async function debitExternalServiceCredits(
  supabase: DbClient,
  userId: string,
  serviceName: string,
  operationType: string,
  units: number = 1,
  metadata?: Record<string, unknown>,
  workspaceId?: string | null,
): Promise<CreditDebitResult> {
  try {
    const pricingMap = await getPricingMap(supabase);
    const pricing = pricingMap[serviceName];
    if (!pricing) {
      console.error(`[credit-utils] Unknown service: ${serviceName}`);
      return { success: false, credits_debited: 0, raw_cost_usd: 0, billed_cost_usd: 0, error: `Unknown service: ${serviceName}` };
    }

    const rawCost = pricing.cost_per_unit * units;
    const billedCost = rawCost * pricing.markup_multiplier;
    const creditsToDebit = Math.round(billedCost * 100 * 100) / 100;

    if (creditsToDebit <= 0) {
      return { success: true, credits_debited: 0, raw_cost_usd: 0, billed_cost_usd: 0 };
    }

    const { data: debitData, error: debitError } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: creditsToDebit,
      p_operation_type: operationType,
      p_description: `${serviceName} ${operationType} (${units} ${pricing.unit}${units !== 1 ? 's' : ''})`,
      p_metadata: { ...metadata, service: serviceName, units, unit_type: pricing.unit },
      p_workspace_id: workspaceId ?? null,
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

    const { error: logError } = await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: operationType,
      model_name: serviceName,
      api_provider: serviceName.split('-')[0],
      input_tokens: 0,
      output_tokens: 0,
      input_cost_usd: 0,
      output_cost_usd: 0,
      raw_cost_usd: rawCost,
      markup_multiplier: pricing.markup_multiplier,
      billed_cost_usd: billedCost,
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
 * DB-backed and cached for 5 minutes.
 */
export async function getServicePricing(
  supabase: DbClient,
  serviceName: string,
): Promise<{ cost_per_unit: number; unit: string; markup_multiplier: number } | null> {
  const pricingMap = await getPricingMap(supabase);
  return pricingMap[serviceName] ?? null;
}

/**
 * Pre-check if user has enough credits for an operation BEFORE making API calls.
 */
export async function checkCreditBalance(
  supabase: DbClient,
  userId: string,
  serviceName: string,
  units: number = 1,
  workspaceId?: string | null,
): Promise<{ sufficient: boolean; balance: number; required_credits: number }> {
  const pricingMap = await getPricingMap(supabase);
  const pricing = pricingMap[serviceName];
  if (!pricing) return { sufficient: false, balance: 0, required_credits: 0 };

  const rawCost = pricing.cost_per_unit * units;
  const billedCost = rawCost * pricing.markup_multiplier;
  const requiredCredits = Math.round(billedCost * 100 * 100) / 100;

  // Fail-fast via preflight_credits — mirrors the debit decision (pool-if-member-else-personal) AND
  // enforces the member monthly cap, so a capped member is rejected BEFORE the paid upstream call
  // rather than after. A pre-check that reads only the pool balance misses the cap entirely.
  const { data: pf } = await supabase.rpc('preflight_credits', {
    p_user_id: userId, p_amount: requiredCredits, p_workspace_id: workspaceId ?? null,
  });
  const row = Array.isArray(pf) ? pf[0] : pf;
  return {
    sufficient: !!row?.sufficient,
    balance: Number(row?.balance ?? 0),
    required_credits: requiredCredits,
  };
}

/**
 * List all configured external service names.
 */
export async function getExternalServiceNames(supabase: DbClient): Promise<string[]> {
  const pricingMap = await getPricingMap(supabase);
  return Object.keys(pricingMap);
}

// ── Agent-chat per-turn billing (partner kai_* keys only) ─────────────────
// Internal users (session JWT) are NOT billed per-turn — they already pay via
// platform credits when individual tool calls debit. Partner kai_* keys pay
// a flat fee per turn ON TOP of the underlying tool/AI usage. This matches
// the pattern in mention_cost_logger.MENTION_OP_CREDIT_COST.
// 10 credits = $0.10 raw equivalent (1 credit = $0.01). Adjustable per-agent.
// Refund on hard pre-execution failure (e.g. agent crashed before producing
// a single chunk). NO refund once the agent has started streaming — the
// underlying Anthropic + tool spend has already happened.
const AGENT_CHAT_TURN_CREDIT_COST: Record<string, number> = {
  kai: 10,
  'interior-designer': 10,
  demo: 0, // never billed; partner mode rejects this agent anyway
};

export function getAgentTurnCost(agentId: string): number {
  return AGENT_CHAT_TURN_CREDIT_COST[agentId] ?? AGENT_CHAT_TURN_CREDIT_COST.kai;
}

export interface AgentTurnDebitResult {
  success: boolean;
  credits_debited: number;
  new_balance?: number;
  transaction_id?: string;
  error?: string;
}

/**
 * Pre-debit a flat per-turn fee for partner kai_* agent-chat calls.
 * Returns 402-equivalent (`success: false` + `error: 'insufficient_credits'`)
 * when the balance is too low. Caller MUST refuse to invoke the agent in
 * that case.
 */
export async function debitAgentChatTurn(
  supabase: DbClient,
  userId: string,
  agentId: string,
  metadata: Record<string, unknown> = {},
): Promise<AgentTurnDebitResult> {
  const credits = getAgentTurnCost(agentId);
  if (credits <= 0) {
    return { success: true, credits_debited: 0 };
  }

  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'agent_chat_turn',
    p_description: `agent-chat ${agentId} (1 turn)`,
    p_metadata: { ...metadata, agent_id: agentId, billing_type: 'agent_chat_turn' },
    p_workspace_id: null,  // partner (kai_*) per-turn fee → partner's personal balance
  });

  if (error) {
    return { success: false, credits_debited: 0, error: error.message };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.success) {
    // debit_credits surfaces 'Insufficient credits…' (personal) / 'insufficient_pool_balance' /
    // 'member_limit_exceeded' (pool) — normalise any of them to the clean 402 code the caller expects.
    const raw = String(result?.error_message ?? '');
    const isInsufficient = /insufficient|member_limit_exceeded/i.test(raw);
    return {
      success: false,
      credits_debited: 0,
      error: isInsufficient ? 'insufficient_credits' : (raw || 'debit_failed'),
    };
  }

  // Log to ai_usage_logs for partner cost transparency
  supabase.from('ai_usage_logs').insert({
    user_id: userId,
    operation_type: 'agent_chat_turn',
    model_name: `agent-${agentId}`,
    api_provider: 'agent-chat',
    input_tokens: 0,
    output_tokens: 0,
    input_cost_usd: 0,
    output_cost_usd: 0,
    raw_cost_usd: credits / 100,
    markup_multiplier: 1,
    billed_cost_usd: credits / 100,
    credits_debited: credits,
    metadata: { ...metadata, agent_id: agentId, billing_type: 'agent_chat_turn' },
    created_at: new Date().toISOString(),
  }).then(
    () => {},
    (e: unknown) => console.warn('[credit-utils] agent_chat_turn ai_usage_logs insert failed:', e),
  );

  return {
    success: true,
    credits_debited: credits,
    new_balance: result.new_balance,
    transaction_id: result.transaction_id,
  };
}

/**
 * Refund a previously-debited agent turn when the agent failed before
 * producing any output (hard pre-stream error). NOT called once streaming
 * has started — by then the spend is irrecoverable.
 */
export async function refundAgentChatTurn(
  supabase: DbClient,
  userId: string,
  agentId: string,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const credits = getAgentTurnCost(agentId);
  if (credits <= 0) return;

  const { error } = await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'agent_chat_turn_refund',
    p_description: `agent-chat ${agentId} refund: ${reason}`,
    p_metadata: { ...metadata, agent_id: agentId, refund_reason: reason },
    p_workspace_id: null,
  });
  if (error) {
    console.warn(`[credit-utils] Refund failed for ${userId} agent=${agentId}: ${error.message}`);
  }
}

/**
 * Force-invalidate the in-memory pricing cache. Call this after admin price edits
 * if you need callers to see the new value before the 5-minute TTL expires.
 */
export function invalidatePricingCache(): void {
  _pricingCache = null;
}

/**
 * Debit BEFORE the paid upstream call, and REFUSE the work when the debit fails.
 *
 * This exists because `debitExternalServiceCredits` returns `{success:false}` rather than throwing,
 * and 22 call sites did `await debit(...)` with the result discarded — after the upstream call had
 * already run. A debit whose result nobody reads is not a debit, it is a log line: an exhausted
 * workspace still sent every WhatsApp and still ran every Opus call, and we had already paid the
 * provider by the time we found out we could not bill for it. (CLAUDE.md invariant 10, audit #312)
 *
 * Returns `null` when the caller may proceed, or a ready-to-return JSON refusal when it may not —
 * so the guard is one line at the call site and the failure cannot be ignored by accident:
 *
 *     const refusal = await debitOrRefuse(supabase, userId, 'firecrawl-scrape', 'scrape', 1, { url }, wsId);
 *     if (refusal) return refusal;
 *     // ...only now call the paid API
 *
 * Shaped for the agent-tool callers, which signal failure by RETURNING `JSON.stringify({success:false})`
 * rather than throwing. For handlers that return a `Response`, read `.success` off
 * `debitExternalServiceCredits` directly and reply 402.
 *
 * When the unit count is only known AFTER the call (a batch whose size the provider decides), the
 * order cannot be fixed — use `checkCreditBalance` as a preflight first, then debit the real count.
 */
export async function debitOrRefuse(
  supabase: DbClient,
  userId: string,
  serviceName: string,
  operationType: string,
  units: number = 1,
  metadata?: Record<string, unknown>,
  workspaceId?: string | null,
): Promise<string | null> {
  const result = await debitExternalServiceCredits(
    supabase, userId, serviceName, operationType, units, metadata, workspaceId,
  );
  if (result.success) return null;
  console.warn(`[credit-utils] refusing ${serviceName}/${operationType} for ${userId}: ${result.error}`);
  return JSON.stringify({
    success: false,
    error: result.error ?? 'Insufficient credits',
    credits_required: result.credits_debited,
    service: serviceName,
  });
}

/**
 * Preflight for the case `debitOrRefuse` cannot cover: the billable unit count is not known until
 * the provider has answered (a domain search returning N emails, a batch validation).
 *
 * Charging the real count afterwards is correct; running the call at all for a workspace that
 * cannot pay for even one unit is not. Checks against `preflight_credits`, which mirrors the debit
 * decision (pool-if-member-else-personal) AND the member monthly cap.
 *
 * Returns `null` to proceed, or a ready-to-return JSON refusal. (audit #312)
 */
export async function preflightOrRefuse(
  supabase: DbClient,
  userId: string,
  serviceName: string,
  minUnits: number = 1,
  workspaceId?: string | null,
): Promise<string | null> {
  const check = await checkCreditBalance(supabase, userId, serviceName, minUnits, workspaceId);
  if (check.sufficient) return null;
  console.warn(`[credit-utils] preflight refused ${serviceName} for ${userId}: balance ${check.balance}`);
  return JSON.stringify({
    success: false,
    error: 'Insufficient credits',
    credits_required: check.required_credits,
    balance: check.balance,
    service: serviceName,
  });
}
