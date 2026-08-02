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

interface ConfidenceBreakdown {
  model_confidence: number;
  completeness: number;
  consistency: number;
  validation: number;
}

interface AICallLogData {
  job_id?: string;
  task: string;
  model: string;
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

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
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
    fallbackReason?: string
  ): Promise<void> {
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    await this.logAICall({
      job_id: jobId,
      task,
      model,
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
    fallbackReason?: string
  ): Promise<void> {
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    await this.logAICall({
      job_id: jobId,
      task,
      model,
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
    jobId?: string
  ): Promise<void> {
    await this.logAICall({
      job_id: jobId,
      task,
      model,
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
export function createAILogger(supabaseUrl: string, supabaseKey: string): AICallLogger {
  return new AICallLogger(supabaseUrl, supabaseKey);
}

