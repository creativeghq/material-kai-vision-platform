import type { ModelConfig } from './types';

// Platform markup multiplier (50% markup for user billing).
// MUST stay in sync with:
//   - supabase/functions/_shared/pricing-constants.ts → MARKUP_MULTIPLIER
//   - mivaa-pdf-extractor/app/config/ai_pricing.py → AIPricingConfig.MARKUP_MULTIPLIER
export const MARKUP_MULTIPLIER = 1.50;

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude Models — canonical latest tier.
  //
  // These numbers said 15.00 / 75.00 for `claude-opus-4-8` while `ai_model_pricing`
  // — the authoritative source — said 5.00 / 25.00. That is Opus-3-era pricing, and
  // it made every figure on this dashboard read THREE TIMES the real spend. An
  // over-report is a plausible number, so nothing raised; the same wrong pair had
  // been copied into credits.service.ts, ai-pricing-updater and base-agent.ts.
  'claude-opus-5':     { input:  5.00, output: 25.00 },
  'claude-haiku-4-5':  { input:  1.00, output:  5.00 },

  'text-embedding-3-small': { input: 0.02, output: 0.00 },
  'text-embedding-3-large': { input: 0.13, output: 0.00 },

  // Voyage AI Embeddings
  'voyage-4':         { input: 0.06, output: 0.00 },
};

export const MODEL_CONFIGS: ModelConfig[] = [
  // Claude Models — canonical 3 latest-tier
  { id: 'claude-opus-5',              name: 'Claude Opus 5',     provider: 'anthropic', model: 'claude-opus-5',              inputCostPer1M:  5.00, outputCostPer1M: 25.00, speed: 'medium', usedFor: ['PDF Processing', 'Product Discovery', 'Agent Chat', 'High-stakes Validation', 'Consensus Extraction'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',  provider: 'anthropic', model: 'claude-haiku-4-5',  inputCostPer1M:  1.00, outputCostPer1M:  5.00, speed: 'fast',   usedFor: ['Background Agents', 'Query Parsing', 'Reranking'], totalInputTokens: 0, totalOutputTokens: 0 },


  // Image classification + vision analysis both run on Claude Opus 5
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
  // Retired 2026-08-23 but kept: historical ai_usage_logs rows still carry the old key.
  'zernio-whatsapp': 'Zernio WhatsApp (retired)',
  'whatsapp-service': 'WhatsApp service reply',
  'whatsapp-template': 'WhatsApp template',
  'resend-email': 'Resend Email',
};
