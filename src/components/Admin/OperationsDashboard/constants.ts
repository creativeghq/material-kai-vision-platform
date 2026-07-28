import type { ModelConfig } from './types';

// Platform markup multiplier (50% markup for user billing).
// MUST stay in sync with:
//   - supabase/functions/_shared/pricing-constants.ts → MARKUP_MULTIPLIER
//   - mivaa-pdf-extractor/app/config/ai_pricing.py → AIPricingConfig.MARKUP_MULTIPLIER
export const MARKUP_MULTIPLIER = 1.50;

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude Models — canonical 3 latest-tier
  'claude-opus-4-8':            { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':  { input:  1.00, output:  5.00 },

  // OpenAI Embeddings (chat models removed — platform uses Claude only)
  'text-embedding-3-small': { input: 0.02, output: 0.00 },
  'text-embedding-3-large': { input: 0.13, output: 0.00 },

  // Voyage AI Embeddings
  'voyage-4':         { input: 0.06, output: 0.00 },
};

export const MODEL_CONFIGS: ModelConfig[] = [
  // Claude Models — canonical 3 latest-tier
  { id: 'claude-opus-4-8',            name: 'Claude Opus 4.8',   provider: 'anthropic', model: 'claude-opus-4-8',            inputCostPer1M: 15.00, outputCostPer1M: 75.00, speed: 'medium', usedFor: ['PDF Processing', 'Product Discovery', 'Agent Chat', 'High-stakes Validation', 'Consensus Extraction'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',  provider: 'anthropic', model: 'claude-haiku-4-5',  inputCostPer1M:  1.00, outputCostPer1M:  5.00, speed: 'fast',   usedFor: ['Background Agents', 'Query Parsing', 'Reranking'], totalInputTokens: 0, totalOutputTokens: 0 },

  // OpenAI Embeddings only
  { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', provider: 'openai', model: 'text-embedding-3-small', inputCostPer1M: 0.02, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['Text Embeddings'], totalInputTokens: 0, totalOutputTokens: 0 },

  // Image classification + vision analysis both run on Claude Opus 4.8
  // (already listed under Anthropic above).

  // Vision/Embedding Models (SLIG on Modal — siglip2-base-patch16-512, 768D)
  { id: 'slig-768d', name: 'SLIG 768D', provider: 'modal' as any, model: 'SLIG-768D', inputCostPer1M: 0.00, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['Visual Embeddings (Primary)'], totalInputTokens: 0, totalOutputTokens: 0 },
];

export const EXT_SERVICE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

export const EXT_SERVICE_LABELS: Record<string, string> = {
  'apollo-enrich': 'Apollo Enrich',
  'apollo-people-match': 'Apollo People',
  'hunter-email-finder': 'Hunter Email',
  'hunter-domain-search': 'Hunter Domain',
  'zerobounce-validate': 'ZeroBounce',
  'firecrawl-scrape': 'Firecrawl',
  'zernio-whatsapp': 'Zernio WhatsApp',
  'resend-email': 'Resend Email',
};
