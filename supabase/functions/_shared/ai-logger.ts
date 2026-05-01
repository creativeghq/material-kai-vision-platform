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

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// AI Pricing Configuration (synced with ai_model_pricing DB table)
// Canonical 3 Claude models only — legacy variants and OpenAI chat models removed.
const AI_PRICING = {
  // Anthropic Claude Models (per 1M tokens)
  claude: {
    'claude-opus-4-7':            { input: 15.00, output: 75.00 },
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
    'voyage-3.5': { input: 0.06, output: 0.00 }, // legacy, kept for historical logs
  },
  // Qwen pricing intentionally absent — vision migrated to Anthropic Claude
  // Opus 4.7 on 2026-05-01. Empty placeholder kept so the lookup path that
  // iterates AI_PRICING.qwen still resolves to undefined cleanly without
  // throwing "cannot read property of undefined".
  qwen: {} as Record<string, { input: number; output: number }>,
  // Vision Models
  vision: {
    'clip': { input: 0.00, output: 0.00 }, // Free (open-source)
  },
};

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
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Calculate cost for AI API call
   */
  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    provider?: string
  ): number {
    const modelLower = model.toLowerCase();
    
    // Determine provider if not specified
    let pricing: { input: number; output: number } | undefined;
    
    if (provider === 'anthropic' || modelLower.includes('claude')) {
      pricing = Object.entries(AI_PRICING.claude).find(([key]) =>
        modelLower.includes(key.toLowerCase())
      )?.[1];
    } else if (provider === 'together' || modelLower.includes('qwen')) {
      pricing = Object.entries(AI_PRICING.qwen).find(([key]) =>
        modelLower.includes(key.toLowerCase())
      )?.[1];
    } else if (modelLower.includes('voyage')) {
      pricing = Object.entries(AI_PRICING.voyage).find(([key]) =>
        modelLower.includes(key.toLowerCase())
      )?.[1];
    } else if (modelLower.includes('embedding')) {
      pricing = Object.entries(AI_PRICING.embeddings).find(([key]) =>
        modelLower.includes(key.toLowerCase())
      )?.[1];
    } else if (modelLower.includes('clip')) {
      pricing = AI_PRICING.vision.clip;
    }
    
    if (!pricing) {
      console.warn(`Unknown model pricing: ${model}`);
      return 0;
    }
    
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    
    return inputCost + outputCost;
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
        cost = this.calculateCost(data.model, data.input_tokens, data.output_tokens);
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
   * Log Qwen (HuggingFace) API call
   */
  async logQwenCall(
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
      response_data: { output: response.output },
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

