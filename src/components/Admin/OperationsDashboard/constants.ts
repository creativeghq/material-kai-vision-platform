import type { ModelConfig } from './types';

// Platform markup multiplier (50% markup for user billing)
export const MARKUP_MULTIPLIER = 1.50;

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude Models
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-sonnet-4-6-20260217': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'claude-opus-4-5': { input: 15.00, output: 75.00 },

  // OpenAI Models
  'gpt-5.2': { input: 7.00, output: 21.00 },
  'gpt-5.2-mini': { input: 1.00, output: 3.00 },
  'text-embedding-3-small': { input: 0.02, output: 0.00 },
  'text-embedding-3-large': { input: 0.13, output: 0.00 },

  // Voyage AI Embeddings
  'voyage-3': { input: 0.06, output: 0.00 },
  'voyage-3-lite': { input: 0.02, output: 0.00 },
  'voyage-large-2-instruct': { input: 0.12, output: 0.00 },

  // Qwen Vision Models (HuggingFace Endpoint - 32B only)
  'qwen3-vl-32b': { input: 0.40, output: 0.40 },
  'Qwen/Qwen3-VL-32B-Instruct': { input: 0.40, output: 0.40 },
};

export const MODEL_CONFIGS: ModelConfig[] = [
  // Claude Models
  { id: 'claude-haiku-4', name: 'Claude Haiku 4.5', provider: 'anthropic', model: 'claude-haiku-4-20250514', inputCostPer1M: 0.80, outputCostPer1M: 4.00, speed: 'fast', usedFor: ['Search Agent', 'Quick Queries', 'Validation'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6-20260217', inputCostPer1M: 3.00, outputCostPer1M: 15.00, speed: 'medium', usedFor: ['PDF Processing', 'Product Discovery', 'Admin Agent'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'claude-sonnet-3.5', name: 'Claude Sonnet 3.5', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', inputCostPer1M: 3.00, outputCostPer1M: 15.00, speed: 'medium', usedFor: ['Legacy Tasks'], totalInputTokens: 0, totalOutputTokens: 0 },

  // OpenAI Models
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', model: 'gpt-5', inputCostPer1M: 5.00, outputCostPer1M: 15.00, speed: 'medium', usedFor: ['High Accuracy Tasks', 'Discovery'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', model: 'gpt-5.2', inputCostPer1M: 7.00, outputCostPer1M: 21.00, speed: 'medium', usedFor: ['Fallback', 'Chunking'], totalInputTokens: 0, totalOutputTokens: 0 },
  { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', provider: 'openai', model: 'text-embedding-3-small', inputCostPer1M: 0.02, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['Text Embeddings'], totalInputTokens: 0, totalOutputTokens: 0 },

  // Qwen Vision Models (HuggingFace Endpoint - 32B only)
  { id: 'qwen3-vl-32b', name: 'Qwen3-VL-32B-Instruct', provider: 'huggingface' as any, model: 'Qwen/Qwen3-VL-32B-Instruct', inputCostPer1M: 0.40, outputCostPer1M: 0.40, speed: 'medium', usedFor: ['Image Classification', 'Vision Analysis'], totalInputTokens: 0, totalOutputTokens: 0 },

  // Vision/Embedding Models (SLIG Cloud Endpoint)
  { id: 'slig-768d', name: 'SLIG 768D', provider: 'huggingface' as any, model: 'SLIG-768D', inputCostPer1M: 0.00, outputCostPer1M: 0.00, speed: 'fast', usedFor: ['Visual Embeddings (Primary)'], totalInputTokens: 0, totalOutputTokens: 0 },
];

export const EXT_SERVICE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

export const EXT_SERVICE_LABELS: Record<string, string> = {
  'apollo-enrich': 'Apollo Enrich',
  'apollo-people-match': 'Apollo People',
  'hunter-email-finder': 'Hunter Email',
  'hunter-domain-search': 'Hunter Domain',
  'zerobounce-validate': 'ZeroBounce',
  'firecrawl-scrape': 'Firecrawl',
  'twilio-sms': 'Twilio SMS',
  'twilio-whatsapp': 'Twilio WhatsApp',
  'resend-email': 'Resend Email',
};
