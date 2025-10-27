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

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// AI Pricing Configuration (matches Python version)
const AI_PRICING = {
  // Anthropic Claude Models
  claude: {
    'claude-haiku-4-5': { input: 0.80, output: 4.00 },
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
    'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    'claude-opus-4': { input: 15.00, output: 75.00 },
  },
  // OpenAI GPT Models
  gpt: {
    'gpt-5': { input: 5.00, output: 15.00 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
  },
  // Llama Models (TogetherAI)
  llama: {
    'llama-4-scout-17b': { input: 0.20, output: 0.20 },
    'meta-llama/Llama-4-Scout-17B-16E-Instruct': { input: 0.20, output: 0.20 },
  },
  // OpenAI Embeddings
  embeddings: {
    'text-embedding-3-small': { input: 0.02, output: 0.00 },
    'text-embedding-3-large': { input: 0.13, output: 0.00 },
    'text-embedding-ada-002': { input: 0.10, output: 0.00 },
  },
  // Vision Models
  vision: {
    'clip': { input: 0.00, output: 0.00 }, // Free
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
    } else if (provider === 'openai' || modelLower.includes('gpt')) {
      pricing = Object.entries(AI_PRICING.gpt).find(([key]) => 
        modelLower.includes(key.toLowerCase())
      )?.[1];
    } else if (provider === 'together' || modelLower.includes('llama')) {
      pricing = Object.entries(AI_PRICING.llama).find(([key]) => 
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
   * Log Llama API call (TogetherAI)
   */
  async logLlamaCall(
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

