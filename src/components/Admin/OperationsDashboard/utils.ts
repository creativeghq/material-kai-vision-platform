import { MODEL_PRICING, MARKUP_MULTIPLIER } from './constants';

// Estimate tokens from content length (rough approximation: 4 chars = 1 token)
export const estimateTokens = (content: string): number => Math.ceil(content.length / 4);

// Calculate cost based on model and tokens (returns both raw and billed cost with markup)
export const calculateCost = (model: string, inputTokens: number, outputTokens: number): {
  input: number;
  output: number;
  total: number;
  raw: number;
  billed: number;
  markup: number;
} => {
  const pricing = MODEL_PRICING[model] || { input: 15.00, output: 75.00 }; // Default to Opus pricing
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const rawTotal = inputCost + outputCost;
  const billedTotal = rawTotal * MARKUP_MULTIPLIER;
  return {
    input: inputCost,
    output: outputCost,
    total: rawTotal, // For backward compatibility
    raw: rawTotal,
    billed: billedTotal,
    markup: MARKUP_MULTIPLIER,
  };
};

export const getProviderStyle = (provider: string) => {
  switch (provider) {
    case 'anthropic': return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: '🧠' };
    case 'meta': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: '🦙' };
    case 'google': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: '🔍' };
    default: return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: '⚙️' };
  }
};
