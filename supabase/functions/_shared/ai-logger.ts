/**
 * AI Call Logger for Supabase Edge Functions
 * 
 * Universal logging service for tracking all AI API calls with:
 * - Cost calculation
 * - Latency tracking
 * - Confidence scoring
 * - Fallback decision tracking
 * - Request/response data storage
 */

import type { DbClient } from './supabase-client.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// AI Pricing Configuration (synced with ai_model_pricing DB table)
// Canonical 3 Claude models only — legacy variants and OpenAI chat models removed.
const AI_PRICING = {
  // Anthropic Claude Models (per 1M tokens)
  claude: {
    // Corrected 2026-08-02: this said 15.00/75.00, which is 3x the real Opus rate.
    // The same wrong number was in ai-client.ts and in the ai_model_pricing row.
    'claude-opus-4-8':   { input:  5.00, output: 25.00 },
    'claude-haiku-4-5':  { input:  1.00, output:  5.00 },
  },
  // OpenAI Embeddings (per 1M tokens) — embeddings only, chat models removed
  embeddings: {
    'text-embedding-3-small': { input: 0.02, output: 0.00 },
    'text-embedding-3-large': { input: 0.13, output: 0.00 },
  },
  // Voyage AI Embeddings (per 1M tokens)
  voyage: {
    'voyage-4': { input: 0.06, output: 0.00 },
  },
  // Vision Models
  vision: {
    'clip': { input: 0.00, output: 0.00 }, // Free (open-source)
  },
};

// ── DB-driven token pricing overlay ───────────────────────────
// The `ai_model_pricing` admin table is authoritative; AI_PRICING above is the
// fallback used only when a model row is missing or the DB is unreachable. Cached
// per-worker for 5 minutes so per-call logging stays cheap.
export interface TokenPrice { input: number; output: number; markup: number }
const DEFAULT_MARKUP = 1.5;
const DB_PRICE_TTL_MS = 5 * 60 * 1000;
let _dbPriceCache: { data: Record<string, TokenPrice>; expiresAt: number } | null = null;
let _dbPriceFetch: Promise<Record<string, TokenPrice>> | null = null;

async function getDbTokenPricing(supabase: DbClient): Promise<Record<string, TokenPrice>> {
  const now = Date.now();
  if (_dbPriceCache && _dbPriceCache.expiresAt > now) return _dbPriceCache.data;
  if (!_dbPriceFetch) {
    _dbPriceFetch = (async () => {
      try {
        const { data, error } = await supabase
          .from('ai_model_pricing')
          .select('model_key, input_price_per_million, output_price_per_million, markup_multiplier')
          .eq('billing_type', 'token_based')
          .eq('is_active', true);
        if (error || !data) return _dbPriceCache?.data || {};
        const map: Record<string, TokenPrice> = {};
        for (const r of data) {
          const key = String(r.model_key || '').toLowerCase();
          if (key) map[key] = {
            input: Number(r.input_price_per_million) || 0,
            output: Number(r.output_price_per_million) || 0,
            markup: Number(r.markup_multiplier) || DEFAULT_MARKUP,
          };
        }
        _dbPriceCache = { data: map, expiresAt: Date.now() + DB_PRICE_TTL_MS };
        return map;
      } catch {
        return _dbPriceCache?.data || {};
      } finally {
        _dbPriceFetch = null;
      }
    })();
  }
  return _dbPriceFetch;
}

/**
 * THE token-price derivation for the edge runtime. Every caller that needs to turn
 * (model, tokens) into USD goes through this — `AICallLogger.calculateCost` below and
 * `_logTrackedCall` in `_shared/ai-client.ts`.
 *
 * Order: `ai_model_pricing` (admin-editable, authoritative) → the `AI_PRICING` literal
 * above (fallback for an unreachable DB or a model with no row) → null.
 *
 * Returns the per-row `markup` too, so callers never re-apply a global constant that
 * has drifted from the table.
 *
 * Do NOT add a second price table anywhere. ai-client.ts carried one for months — five
 * entries, no DB lookup — and it silently priced Gemini 3.5 Flash at a third of the real
 * rate and Opus at three times it. A wrong price is a valid number, so nothing caught it.
 */
export async function resolveTokenPrice(
  supabase: DbClient,
  model: string,
): Promise<TokenPrice | null> {
  const modelLower = model.toLowerCase();

  try {
    const dbPricing = await getDbTokenPricing(supabase);
    const exact = dbPricing[modelLower];
    if (exact) return exact;
    for (const [key, val] of Object.entries(dbPricing)) {
      if (modelLower.includes(key) || key.includes(modelLower)) return val;
    }
  } catch { /* fall through to the hardcoded table */ }

  const groups: Array<[boolean, Record<string, { input: number; output: number }>]> = [
    [modelLower.includes('claude'), AI_PRICING.claude],
    [modelLower.includes('voyage'), AI_PRICING.voyage],
    [modelLower.includes('embedding'), AI_PRICING.embeddings],
    [modelLower.includes('clip'), AI_PRICING.vision],
  ];
  for (const [matches, table] of groups) {
    if (!matches) continue;
    const hit = Object.entries(table).find(([key]) => modelLower.includes(key.toLowerCase()))?.[1];
    if (hit) return { ...hit, markup: DEFAULT_MARKUP };
  }

  return null;
}

// ── DB-driven PER-UNIT pricing overlay ────────────────────────
// The image and video models are not billed per token — they are billed per image or per
// second of output, which is why `resolveTokenPrice` above has nothing to say about them and
// why every image/video call went to the provider without an `ai_usage_logs` row (#363 `EE-2`).
// Same table, same markup column, different `billing_type`.
//
// There is deliberately NO hardcoded fallback table here. A token model with no row can fall
// back to a published list price that changes slowly; a per-unit price is a number somebody
// has to verify against the provider's page, and guessing one writes a plausible wrong cost
// into the billing record. `null` means "not priced yet" and the caller logs the spend with a
// null cost plus a warning, so `ops.silent_zero` can see the gap instead of a confident zero.
export interface UnitPrice { perUnit: number; unitLabel: string; markup: number }
let _dbUnitPriceCache: { data: Record<string, UnitPrice>; expiresAt: number } | null = null;
let _dbUnitPriceFetch: Promise<Record<string, UnitPrice>> | null = null;
let _genModelPricingKeyCache: { data: Record<string, string | null>; expiresAt: number } | null = null;
let _genModelPricingKeyFetch: Promise<Record<string, string | null>> | null = null;

async function getDbUnitPricing(supabase: DbClient): Promise<Record<string, UnitPrice>> {
  const now = Date.now();
  if (_dbUnitPriceCache && _dbUnitPriceCache.expiresAt > now) return _dbUnitPriceCache.data;
  if (!_dbUnitPriceFetch) {
    _dbUnitPriceFetch = (async () => {
      try {
        // BOTH non-token billing shapes. `per_generation` rows keep their rate in
        // `cost_per_generation` and mean "one call, one price"; `per_unit` rows keep it in
        // `cost_per_unit` and are multiplied by images or seconds. Reading only `per_unit`
        // would have resolved all 14 Replicate `per_generation` models to null and logged
        // every one of them at a null cost — the same silent gap this resolver exists to
        // close, freshly dug one row over.
        const { data, error } = await supabase
          .from('ai_model_pricing')
          .select('model_key, billing_type, cost_per_unit, cost_per_generation, unit_label, markup_multiplier')
          .in('billing_type', ['per_unit', 'per_generation'])
          .eq('is_active', true);
        if (error || !data) return _dbUnitPriceCache?.data || {};
        const map: Record<string, UnitPrice> = {};
        for (const r of data) {
          const key = String(r.model_key || '').toLowerCase();
          if (!key) continue;
          const perGeneration = r.billing_type === 'per_generation';
          const rate = Number(perGeneration ? r.cost_per_generation : r.cost_per_unit) || 0;
          // A rate of 0 on a billable row is a misconfiguration, not a free model — it is what
          // `firecrawl-scrape` looked like with its money in the wrong column. Skip it so the
          // caller logs a null cost and warns, rather than recording a confident $0.00.
          if (rate <= 0) continue;
          map[key] = {
            perUnit: rate,
            unitLabel: String(r.unit_label || (perGeneration ? 'generation' : 'unit')),
            markup: Number(r.markup_multiplier) || DEFAULT_MARKUP,
          };
        }
        _dbUnitPriceCache = { data: map, expiresAt: Date.now() + DB_PRICE_TTL_MS };
        return map;
      } catch {
        return _dbUnitPriceCache?.data || {};
      } finally {
        _dbUnitPriceFetch = null;
      }
    })();
  }
  return _dbUnitPriceFetch;
}

/** `generation_models.id` → its `pricing_key` FK (null when the model has no verified cost). */
async function getGenerationModelPricingKeys(supabase: DbClient): Promise<Record<string, string | null>> {
  const now = Date.now();
  if (_genModelPricingKeyCache && _genModelPricingKeyCache.expiresAt > now) return _genModelPricingKeyCache.data;
  if (!_genModelPricingKeyFetch) {
    _genModelPricingKeyFetch = (async () => {
      try {
        const { data, error } = await supabase
          .from('generation_models')
          .select('id, slug, pricing_key');
        if (error || !data) return _genModelPricingKeyCache?.data || {};
        const map: Record<string, string | null> = {};
        for (const r of data) {
          const pk = r.pricing_key ? String(r.pricing_key).toLowerCase() : null;
          const id = String(r.id || '').toLowerCase();
          const slug = String(r.slug || '').toLowerCase();
          if (id) map[id] = pk;
          // Some callers hold the provider slug rather than the registry id.
          if (slug && !(slug in map)) map[slug] = pk;
        }
        _genModelPricingKeyCache = { data: map, expiresAt: Date.now() + DB_PRICE_TTL_MS };
        return map;
      } catch {
        return _genModelPricingKeyCache?.data || {};
      } finally {
        _genModelPricingKeyFetch = null;
      }
    })();
  }
  return _genModelPricingKeyFetch;
}

/**
 * THE per-unit price derivation for the edge runtime — images and video seconds.
 *
 * Resolution goes through `generation_models.pricing_key`, which is the FK that already exists
 * precisely so routing and money stay separate: the registry says which model to call, the
 * pricing table says what it costs, and neither restates the other. `pricing_key = null` is a
 * deliberate statement ("no verified cost for this model") and returns null here rather than
 * falling through to a name-similar row — `veo-2` carries exactly that today.
 *
 * Only if the caller's string is not a registry id/slug do we try it as an `ai_model_pricing`
 * key directly, for the per-unit rows that have no generation_models entry at all (the Anthropic
 * vision and third-party service rows). Matching is EXACT at both steps: the per-unit keys are
 * near-identical to each other (`kling-3.0` vs `kling-1.6-pro`, `gemini-3-pro-image` vs
 * `gemini-3.1-flash-image`) and a substring hit across them bills one model at another's rate.
 */
export async function resolveUnitPrice(
  supabase: DbClient,
  modelKey: string,
): Promise<UnitPrice | null> {
  const key = modelKey.toLowerCase();
  try {
    const genKeys = await getGenerationModelPricingKeys(supabase);
    const pricing = await getDbUnitPricing(supabase);
    if (key in genKeys) {
      const pk = genKeys[key];
      return pk ? (pricing[pk] ?? null) : null;
    }
    return pricing[key] ?? null;
  } catch {
    return null;
  }
}

interface ConfidenceBreakdown {
  model_confidence: number;
  completeness: number;
  consistency: number;
  validation: number;
}

/**
 * WHO a call was made for. `ai_call_logs` has carried `user_id` and `workspace_id` columns all
 * along and this logger had no way to fill them — the shape simply had no fields for identity, so
 * every row landed unattributed (#365 `AD-15`). Four main-repo commits have since fixed CALLERS
 * that spent without naming a tenant; this is the signature that made it possible.
 *
 * Set once on the logger (`new AICallLogger(url, key, { userId, workspaceId })`) or per call.
 */
export interface AICallAttribution {
  userId?: string | null;
  workspaceId?: string | null;
}

interface AICallLogData {
  job_id?: string;
  task: string;
  model: string;
  user_id?: string | null;
  workspace_id?: string | null;
  /** Why a call that cost money was not billed — never left blank on a failure row. */
  unbilled_reason?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  latency_ms: number;
  confidence_score?: number;
  confidence_breakdown?: ConfidenceBreakdown;
  action?: 'use_ai_result' | 'fallback_to_rules';
  fallback_reason?: string;
  request_data?: any;
  response_data?: any;
  error_message?: string;
}

export class AICallLogger {
  private supabase: DbClient;
  private attribution: AICallAttribution;

  constructor(supabaseUrl: string, supabaseKey: string, attribution: AICallAttribution = {}) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.attribution = attribution;
  }

  /** Late-bind the acting identity — for a long-lived logger created before the request is read. */
  setAttribution(attribution: AICallAttribution): void {
    this.attribution = { ...this.attribution, ...attribution };
  }

  /**
   * Calculate cost for AI API call
   */
  private async calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<number> {
    const pricing = await resolveTokenPrice(this.supabase, model);

    if (!pricing) {
      console.warn(`Unknown model pricing: ${model}`);
      return 0;
    }

    return (inputTokens / 1_000_000) * pricing.input
         + (outputTokens / 1_000_000) * pricing.output;
  }

  /**
   * Calculate 4-factor weighted confidence score
   */
  private calculateConfidenceScore(breakdown: ConfidenceBreakdown): number {
    return (
      0.30 * breakdown.model_confidence +
      0.30 * breakdown.completeness +
      0.25 * breakdown.consistency +
      0.15 * breakdown.validation
    );
  }

  /**
   * Log AI call to database
   */
  async logAICall(data: AICallLogData): Promise<void> {
    try {
      // Calculate cost if tokens provided
      let cost = data.cost;
      if (!cost && data.input_tokens !== undefined && data.output_tokens !== undefined) {
        cost = await this.calculateCost(data.model, data.input_tokens, data.output_tokens);
      }

      // Calculate confidence score if breakdown provided
      let confidenceScore = data.confidence_score;
      if (!confidenceScore && data.confidence_breakdown) {
        confidenceScore = this.calculateConfidenceScore(data.confidence_breakdown);
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        job_id: data.job_id || null,
        task: data.task,
        model: data.model,
        // Per-call attribution wins; the logger's default fills in for callers that set it once.
        user_id: data.user_id ?? this.attribution.userId ?? null,
        workspace_id: data.workspace_id ?? this.attribution.workspaceId ?? null,
        unbilled_reason: data.unbilled_reason ?? null,
        input_tokens: data.input_tokens || null,
        output_tokens: data.output_tokens || null,
        cost: cost || null,
        latency_ms: data.latency_ms,
        confidence_score: confidenceScore || null,
        confidence_breakdown: data.confidence_breakdown || null,
        action: data.action || 'use_ai_result',
        fallback_reason: data.fallback_reason || null,
        request_data: data.request_data || null,
        response_data: data.response_data || null,
        error_message: data.error_message || null,
      };

      const { error } = await this.supabase
        .from('ai_call_logs')
        .insert(logEntry);

      if (error) {
        console.error('Failed to log AI call:', error);
      }
    } catch (error) {
      console.error('Error logging AI call:', error);
    }
  }

  /**
   * Log a call that FAILED or timed out (#365 `AD-16`).
   *
   * Every helper on this class reads `response.usage`, so it can only describe a call that came
   * back. A provider call that 500s, times out or is refused for quota still cost latency, still
   * may have cost money upstream, and is the single most useful row to have when a metric goes to
   * zero — and there was no way to write it. MIVAA had the same gap and closed it in `a85f8a5`.
   *
   * `unbilled_reason` is set so the row is self-describing: a zero cost here means "the call
   * failed", never "the call was free".
   */
  async logFailedCall(
    task: string,
    model: string,
    error: unknown,
    latencyMs: number,
    opts: {
      jobId?: string;
      attribution?: AICallAttribution;
      inputTokens?: number;
      outputTokens?: number;
      requestData?: unknown;
      unbilledReason?: string;
    } = {},
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    await this.logAICall({
      job_id: opts.jobId,
      task,
      model,
      user_id: opts.attribution?.userId,
      workspace_id: opts.attribution?.workspaceId,
      // Tokens are usually unknown on a failure. 0 is the honest value here — the call produced
      // nothing — and `unbilled_reason` is what distinguishes it from a free success.
      input_tokens: opts.inputTokens ?? 0,
      output_tokens: opts.outputTokens ?? 0,
      cost: 0,
      latency_ms: latencyMs,
      action: 'fallback_to_rules',
      fallback_reason: message.slice(0, 500),
      request_data: opts.requestData ?? null,
      error_message: message.slice(0, 2000),
      unbilled_reason: opts.unbilledReason ?? 'call_failed',
    });
  }

  /**
   * Log Claude API call
   */
  async logClaudeCall(
    task: string,
    model: string,
    response: any,
    latencyMs: number,
    confidenceScore?: number,
    confidenceBreakdown?: ConfidenceBreakdown,
    action?: 'use_ai_result' | 'fallback_to_rules',
    jobId?: string,
    fallbackReason?: string,
    attribution?: AICallAttribution,
  ): Promise<void> {
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    await this.logAICall({
      job_id: jobId,
      task,
      model,
      user_id: attribution?.userId,
      workspace_id: attribution?.workspaceId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      confidence_score: confidenceScore,
      confidence_breakdown: confidenceBreakdown,
      action,
      fallback_reason: fallbackReason,
      response_data: { content: response.content },
    });
  }

  /**
   * Log OpenAI API call
   */
  async logOpenAICall(
    task: string,
    model: string,
    response: any,
    latencyMs: number,
    confidenceScore?: number,
    confidenceBreakdown?: ConfidenceBreakdown,
    action?: 'use_ai_result' | 'fallback_to_rules',
    jobId?: string,
    fallbackReason?: string,
    attribution?: AICallAttribution,
  ): Promise<void> {
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    await this.logAICall({
      job_id: jobId,
      task,
      model,
      user_id: attribution?.userId,
      workspace_id: attribution?.workspaceId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      confidence_score: confidenceScore,
      confidence_breakdown: confidenceBreakdown,
      action,
      fallback_reason: fallbackReason,
      response_data: { choices: response.choices },
    });
  }

  /**
   * Log embedding generation call
   */
  async logEmbeddingCall(
    task: string,
    model: string,
    inputTokens: number,
    latencyMs: number,
    jobId?: string,
    attribution?: AICallAttribution,
  ): Promise<void> {
    await this.logAICall({
      job_id: jobId,
      task,
      model,
      user_id: attribution?.userId,
      workspace_id: attribution?.workspaceId,
      input_tokens: inputTokens,
      output_tokens: 0,
      latency_ms: latencyMs,
      confidence_score: 1.0,
      action: 'use_ai_result',
    });
  }
}

/**
 * Create AI logger instance
 */
export function createAILogger(
  supabaseUrl: string,
  supabaseKey: string,
  attribution: AICallAttribution = {},
): AICallLogger {
  return new AICallLogger(supabaseUrl, supabaseKey, attribution);
}

