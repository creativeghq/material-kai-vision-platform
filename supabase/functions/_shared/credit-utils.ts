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
import { MARKUP_MULTIPLIER, CREDIT_SALE_PRICE_USD, CREDITS_PER_USD } from './pricing-constants.ts';
import { captureException } from './sentry.ts';

// ── DB-backed external service pricing with in-memory cache ──
type BillingMode = 'ai_markup' | 'passthrough' | 'flat_credits';

interface ServicePricing {
  cost_per_unit: number;
  unit: string;
  markup_multiplier: number;
  /**
   * How cost becomes credits. Defaults to `ai_markup` so every existing row behaves exactly as
   * it did before this existed.
   */
  billing_mode: BillingMode;
  /** Explicit credit price. Only read when billing_mode is `flat_credits`. */
  credits: number | null;
}

/**
 * Credits for one unit of a service, by its billing mode.
 *
 *  - `ai_markup`    cost x markup x 100 — our own compute. Effective 12.75x raw once the credit
 *                   is sold, which is right when nobody can price-compare a generated image.
 *  - `passthrough`  cost x markup / credit sale price — somebody else's network. The tenant pays
 *                   about cost x 1.5 in REAL money instead of 12.75x, because they can read
 *                   Meta's or a carrier's published rate.
 *  - `flat_credits` the stated price, for something that costs us nothing but is not free to
 *                   offer. Stating it beats back-solving a fake cost that produces the number —
 *                   a fabricated cost is a wrong number wearing the shape of a valid one.
 */
export function creditsForUnit(pricing: ServicePricing, units: number): number {
  if (pricing.billing_mode === 'flat_credits') {
    return Math.round((pricing.credits ?? 0) * units * 100) / 100;
  }
  const billed = pricing.cost_per_unit * units * pricing.markup_multiplier;
  const raw = pricing.billing_mode === 'passthrough'
    ? billed / CREDIT_SALE_PRICE_USD
    : billed * CREDITS_PER_USD;
  return Math.round(raw * 100) / 100;
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
  // Split 2026-08-23: a free 24h-window reply and a Meta-billed marketing template were one row.
  'whatsapp-service':     { cost_per_unit: 0,      unit: 'message',     markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'flat_credits', credits: 0.75 },
  'whatsapp-template':    { cost_per_unit: 0.06,   unit: 'message',     markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'passthrough',  credits: null },
  'apollo-enrich':        { cost_per_unit: 0.05,   unit: 'enrichment',  markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'apollo-people-match':  { cost_per_unit: 0.03,   unit: 'lookup',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'hunter-email-finder':  { cost_per_unit: 0.01,   unit: 'search',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'hunter-domain-search': { cost_per_unit: 0.01,   unit: 'search',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'zerobounce-validate':  { cost_per_unit: 0.008,  unit: 'validation',  markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'firecrawl-scrape':     { cost_per_unit: 0.001,  unit: 'credit',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'xai-aurora':           { cost_per_unit: 0.07,   unit: 'image',       markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'flux-2-pro':           { cost_per_unit: 0.04,   unit: 'image',       markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'flux-dev':             { cost_per_unit: 0.04,   unit: 'image',       markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'kling-3.0':            { cost_per_unit: 0.10,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  // 'kling-1.6-pro' and 'wan2.1-i2v' removed 2026-08-12 (issue #4) — both models 404 upstream,
  // so no call can reach these prices. Their ai_model_pricing rows are deactivated to match.
  'runway-gen4-turbo':    { cost_per_unit: 0.15,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  // Veo is priced per SECOND and clamped to 8s by generate-interior-video-v2, so a full clip is
  // $2.80 — by some distance the most expensive thing this platform can be asked to make. It was
  // absent here while its siblings were present, so a DB outage silently dropped Veo's cost to
  // null while Kling and Runway kept theirs (#363 follow-up).
  'veo-2':                { cost_per_unit: 0.35,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  // The 30-second models. Seedance 720p bills $6.93 for a full clip and Wan 1080p $6.00,
  // against Veo's $2.80. Both were missing here for exactly the reason the Veo note above
  // describes, so a DB outage dropped the priciest things this platform makes to a null cost.
  'wan-3.0-480p':         { cost_per_unit: 0.05,  unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'wan-3.0-720p':         { cost_per_unit: 0.10,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'wan-3.0-1080p':        { cost_per_unit: 0.20,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'seedance-2.5-480p':    { cost_per_unit: 0.104,  unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'seedance-2.5-720p':    { cost_per_unit: 0.232,  unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  // The default model for social video — the one most likely to be running when the DB is not.
  'minimax-h3':           { cost_per_unit: 0.13,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  // Ray's rates are the 10-second ones — Luma prices per clip, non-linearly. See the DB notes.
  'ray-3.2-720p':         { cost_per_unit: 0.09,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'ray-3.2-1080p':        { cost_per_unit: 0.36,   unit: 'second',      markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'social-caption':       { cost_per_unit: 0.002,  unit: 'generation',  markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
  'zernio-publish':       { cost_per_unit: 0.0,    unit: 'post',        markup_multiplier: MARKUP_MULTIPLIER, billing_mode: 'ai_markup', credits: null },
};

async function fetchPricingFromDB(supabase: DbClient): Promise<Record<string, ServicePricing>> {
  const { data, error } = await supabase
    .from('ai_model_pricing')
    .select('model_key, cost_per_unit, unit_label, markup_multiplier, billing_mode, credits')
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
      billing_mode: (row.billing_mode as BillingMode) || 'ai_markup',
      credits: row.credits == null ? null : Number(row.credits),
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
/**
 * Optional provenance for the `ai_usage_logs` row this debit writes.
 *
 * `ai_usage_logs` carries `job_id` and `module_slug` columns and this writer set NEITHER, which is
 * why 5,192 rows — the majority of the table — carry no module and no job. The columns were not
 * missing; the signature had nowhere to put them, exactly like the `workspace_id` gap fixed on
 * 2026-08-12 and `AICallLogData` in `ai-logger.ts` (#365 `AD-15`). A caller with the ids in scope
 * four lines above the debit still had no way to pass them.
 *
 * Both stay OPTIONAL because plenty of spend genuinely has no job: an interactive tool call is not
 * a background job, and inventing an id would be worse than a null.
 */
export interface UsageProvenance {
  /** `background_jobs.id` when this spend belongs to one. NOT a conversation id. */
  jobId?: string | null;
  /** Which module's budget this belongs to — the same slug the cron/billing registry uses. */
  moduleSlug?: string | null;
  /** `products.id` when the spend is attributable to one product. */
  productId?: string | null;
}

export async function debitExternalServiceCredits(
  supabase: DbClient,
  userId: string,
  serviceName: string,
  operationType: string,
  units: number = 1,
  metadata?: Record<string, unknown>,
  workspaceId?: string | null,
  provenance: UsageProvenance = {},
  /**
   * Real cost of ONE unit, when only the caller can know it. Used by passthrough services whose
   * rate varies per call — a WhatsApp template is priced by recipient country and category, so a
   * single row cannot hold the answer. Ignored by flat_credits.
   */
  costPerUnitOverride?: number | null,
): Promise<CreditDebitResult> {
  try {
    const pricingMap = await getPricingMap(supabase);
    const pricing = pricingMap[serviceName];
    if (!pricing) {
      // Loud, because the callers are not listening. Several sites `await` this and discard the
      // result, so an unpriced key made the paid work happen and charged nothing, with the only
      // trace a console line nobody reads (`apollo-competitors` did exactly this — billed in
      // code, no row in ai_model_pricing, every competitor search free). A missing price is a
      // configuration bug, not a free tier.
      console.error(`[credit-utils] Unknown service: ${serviceName} — NOTHING WAS CHARGED`);
      void captureException(new Error(`Unpriced billable service: ${serviceName}`), {
        tags: { function: 'credit-utils', error_type: 'unpriced_service' },
        extra: { service: serviceName, operation_type: operationType, units, user_id: userId },
      });
      return { success: false, credits_debited: 0, raw_cost_usd: 0, billed_cost_usd: 0, error: `Unknown service: ${serviceName}` };
    }

    // A passthrough caller knows the real cost per unit only at call time (a WhatsApp template's
    // rate depends on the recipient's country and the template's category), so it may override
    // the row's fallback. The row still supplies the MODE and the markup.
    const unitCost = costPerUnitOverride ?? pricing.cost_per_unit;
    const effective: ServicePricing = { ...pricing, cost_per_unit: unitCost };

    const rawCost = unitCost * units;
    const billedCost = pricing.billing_mode === 'flat_credits'
      // Nothing was spent upstream, so there is no marked-up cost to report — the billed figure
      // is whatever the stated credit price is worth. Reporting rawCost x markup here would log
      // $0 revenue on a charged call.
      ? creditsForUnit(effective, units) * CREDIT_SALE_PRICE_USD
      : rawCost * pricing.markup_multiplier;
    const creditsToDebit = creditsForUnit(effective, units);

    if (creditsToDebit <= 0) {
      // Zero is a legitimate price for a genuinely free service (`zernio-publish`), and it is
      // also what a misconfigured row looks like — `firecrawl-scrape` carried its rate in
      // `cost_per_generation` while `billing_type` said `per_unit`, so `cost_per_unit` read 0
      // and every scrape was free AND unlogged, because this early return sits BEFORE the
      // ai_usage_logs insert below. The two cases are indistinguishable from here, so say so
      // rather than pass silently: a free call that should have cost money leaves a trace, and
      // a genuinely free one leaves a harmless line.
      console.warn(
        `[credit-utils] ${serviceName} priced at 0 — charging nothing and writing no usage row. ` +
        `If this service is not actually free, its ai_model_pricing row is misconfigured ` +
        `(check that the rate is in cost_per_unit, not cost_per_generation).`,
      );
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
      // The same value the debit above used. It was in scope the whole time and simply never
      // reached the log row, so the spend was billed to a workspace pool and then reported
      // against nobody — invisible to per-tenant cost views and to this table's own
      // `is_workspace_admin(workspace_id)` policy.
      workspace_id: workspaceId ?? null,
      // Provenance the table has always had columns for and this writer never filled.
      job_id: provenance.jobId ?? null,
      module_slug: provenance.moduleSlug ?? null,
      product_id: provenance.productId ?? null,
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
  /**
   * The partner key's workspace, for the USAGE row only.
   *
   * Deliberately NOT passed to the debit below: the per-turn partner fee always comes out of the
   * partner's personal balance, which is what `p_workspace_id: null` says. Attribution and payment
   * are different questions — this one answers "whose tenant did this run in", which is what
   * decides whether a workspace admin can see the row at all.
   */
  workspaceId?: string | null,
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
    workspace_id: workspaceId ?? null,
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
 *
 * IDEMPOTENT (#363 `EE-7`), and only because `debitTransactionId` is passed. The refund names
 * the debit it reverses in `refunds_transaction_id`, and a partial unique index on
 * `credit_transactions` (`credit_transactions_one_refund_per_debit_idx`) rejects a second
 * refund for the same debit. Previously nothing tied a refund to its debit, so two error paths
 * reaching the same turn credited the balance twice, and a double refund looks exactly like a
 * legitimate one — a positive amount on a valid row.
 *
 * The rejection surfaces as a unique-violation error from the RPC, which is logged, not thrown:
 * "this turn was already refunded" is the correct outcome, not a failure the caller must handle.
 * `debitTransactionId` is nullable because `debit_credits` can return a null id on the pooled
 * path; with no id there is nothing to key on and the old non-idempotent behaviour applies, so
 * callers must still not invoke this twice on that path.
 */
export async function refundAgentChatTurn(
  supabase: DbClient,
  userId: string,
  agentId: string,
  reason: string,
  metadata: Record<string, unknown> = {},
  debitTransactionId?: string | null,
): Promise<void> {
  const credits = getAgentTurnCost(agentId);
  if (credits <= 0) return;

  const { error } = await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'agent_chat_turn_refund',
    p_description: `agent-chat ${agentId} refund: ${reason}`,
    p_metadata: {
      ...metadata,
      agent_id: agentId,
      refund_reason: reason,
      ...(debitTransactionId ? { refunds_transaction_id: debitTransactionId } : {}),
    },
    p_workspace_id: null,
  });
  if (error) {
    // 23505 = the idempotency index did its job: this debit was already refunded. Everything
    // else is a real failure worth the same warning it always got.
    const alreadyRefunded = /duplicate key|23505|one_refund_per_debit/i.test(error.message || '');
    if (alreadyRefunded) {
      console.log(`[credit-utils] Refund already applied for ${userId} agent=${agentId} — skipped`);
      return;
    }
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
  provenance: UsageProvenance = {},
): Promise<string | null> {
  const result = await debitExternalServiceCredits(
    supabase, userId, serviceName, operationType, units, metadata, workspaceId, provenance,
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
