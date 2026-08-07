/**
 * One derivation for "which image model runs, and what does it cost".
 *
 * This used to be two parallel ternary chains inside generate-interior-gemini: one
 * picking the credits, one picking the label. Nothing tied them together, so they
 * could disagree — and they did. `product-shot` billed the Grok rate whenever a
 * caller asked for Grok, then called Gemini anyway, because only the credit chain
 * knew about the tier. A wrong-but-valid number, invisible to typecheck and to any
 * integrity probe, exactly the shape CLAUDE.md's money-derivation rule exists for.
 *
 * Here `credits` is looked up BY `modelLabel` — the same string that names the
 * provider actually invoked — so the model you bill for is structurally the model
 * you call. Callers must branch on `provider`, never re-derive it from the tier.
 */

export type GenerationTier = 'fast' | 'pro' | 'grok';
export type RoutedProvider = 'gemini' | 'grok' | 'flux';
export type GeminiImageModelId = 'gemini-3.1-flash-image' | 'gemini-3-pro-image';

/** The ONLY place a credit figure for image generation is written. */
export const GENERATION_CREDIT_COSTS: Record<string, number> = {
  'gemini-3.1-flash-image': 6,
  'gemini-3-pro-image': 15,
  'flux-depth-pro': 20,
  'grok-aurora': 15,
};

/**
 * Label → `ai_model_pricing.model_key`, for the one case where the two differ.
 * Contains NO prices — an identity map, so there is still exactly one place a USD
 * figure is defined. Only add an entry when a label genuinely cannot be renamed
 * (`grok-aurora` is part of the generate-interior-gemini response payload shape).
 */
export const PRICING_KEY_BY_LABEL: Record<string, string> = {
  'grok-aurora': 'xai-aurora',
};

export interface GenerationRouting {
  /** Which upstream actually runs. Branch on this. */
  provider: RoutedProvider;
  /** Gemini model id, meaningful only when provider === 'gemini'. */
  geminiModel: GeminiImageModelId;
  /** Billing + telemetry label for the model that runs. */
  modelLabel: string;
  credits: number;
  pricingKey: string;
}

/**
 * Modes whose structure-locking depth pass only Flux can do. Grok opts out of
 * copy-style because Aurora handles the two-image case natively in one step;
 * redesign is Flux regardless of tier.
 */
function usesFlux(mode: string, useGrok: boolean): boolean {
  return mode === 'redesign' || (mode === 'copy-style' && !useGrok);
}

export function resolveGenerationRouting(mode: string, tier?: GenerationTier): GenerationRouting {
  const useGrok = tier === 'grok';
  const geminiModel: GeminiImageModelId =
    tier === 'pro' ? 'gemini-3-pro-image' : 'gemini-3.1-flash-image';

  const provider: RoutedProvider = usesFlux(mode, useGrok) ? 'flux' : useGrok ? 'grok' : 'gemini';
  const modelLabel =
    provider === 'flux' ? 'flux-depth-pro' : provider === 'grok' ? 'grok-aurora' : geminiModel;

  return {
    provider,
    geminiModel,
    modelLabel,
    // Keyed off modelLabel on purpose — see the header.
    credits: GENERATION_CREDIT_COSTS[modelLabel],
    pricingKey: PRICING_KEY_BY_LABEL[modelLabel] ?? modelLabel,
  };
}
