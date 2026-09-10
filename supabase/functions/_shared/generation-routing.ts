/** One derivation for "which image model runs, and what does it cost". */

export type GenerationTier = 'fast' | 'pro' | 'grok' | 'chatgpt';
export type RoutedProvider = 'gemini' | 'grok' | 'flux' | 'openai';
export type GeminiImageModelId = 'gemini-3.1-flash-image' | 'gemini-3-pro-image';

/** The ONLY place a credit figure for image generation is written. */
export const GENERATION_CREDIT_COSTS: Record<string, number> = {
  'gemini-3.1-flash-image': 6,
  'gemini-3-pro-image': 15,
  'flux-depth-pro': 20,
  'grok-aurora': 15,
  // gpt-image-1 at the medium 1024px tier ($0.042/image, ai_model_pricing) — between
  // Gemini Flash ($0.067 → 6) and Grok ($0.07 → 15) on cost, priced at 10 so the
  // ChatGPT tile is neither the cheap default nor the premium one.
  'gpt-image-1': 10,
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

/**
 * Modes Grok Aurora does not serve. These are precision diagram / board renders
 * built against Gemini's prompt behaviour, and every branch for them in
 * generate-interior-gemini calls Gemini unconditionally — so asking for the Grok
 * tier here billed grok-aurora and ran Gemini, the same wrong-but-valid number
 * that `product-shot` already had to be fixed for.
 */
const GROK_UNSUPPORTED_MODES = new Set([
  'floor-plan-render',
  'floor-plan-text',
  'materials-selection-board',
  // `unstage` removes every movable object and must inpaint the floor and wall that were
  // behind it while the architecture, camera and lighting stay pixel-stable. The branch in
  // generate-interior-gemini calls Gemini unconditionally for exactly that reason, so
  // listing it here is what stops `tier: 'grok'` billing grok-aurora for a Gemini run.
  'unstage',
]);

export interface GenerationRoutingOptions {
  /**
   * The prompt carries MORE THAN ONE image the model must incorporate — pinned
   * catalog materials on a text-to-image brief. Grok's image API takes a single
   * image, so a multi-reference request is Gemini's work whatever tier was asked
   * for, and must be priced as Gemini's.
   */
  multiReference?: boolean;
}

export function resolveGenerationRouting(
  mode: string,
  tier?: GenerationTier,
  opts: GenerationRoutingOptions = {},
): GenerationRouting {
  // ChatGPT (gpt-image-1) serves exactly the modes Grok serves: a single-image
  // generate-or-edit provider, so the diagram/board modes and multi-reference briefs
  // collapse to Gemini for it too, and are priced as Gemini's.
  const singleImageProviderCanServe = !GROK_UNSUPPORTED_MODES.has(mode) && !opts.multiReference;
  const useGrok = tier === 'grok' && singleImageProviderCanServe;
  const useOpenAI = tier === 'chatgpt' && singleImageProviderCanServe;
  const geminiModel: GeminiImageModelId =
    tier === 'pro' ? 'gemini-3-pro-image' : 'gemini-3.1-flash-image';

  // `usesFlux` is asked about Grok only: copy-style stays on the Gemini+Flux pipeline for
  // the ChatGPT tier, because the one-step "image 1 is the style, image 2 is the room"
  // prompt is written for Aurora and there is no gpt-image-1 template for it in the
  // prompt registry. Routing it to Flux prices it as Flux, which is what actually runs.
  const provider: RoutedProvider = usesFlux(mode, useGrok)
    ? 'flux'
    : useGrok ? 'grok' : useOpenAI ? 'openai' : 'gemini';
  const modelLabel =
    provider === 'flux' ? 'flux-depth-pro'
      : provider === 'grok' ? 'grok-aurora'
      : provider === 'openai' ? 'gpt-image-1'
      : geminiModel;

  return {
    provider,
    geminiModel,
    modelLabel,
    // Keyed off modelLabel on purpose — see the header.
    credits: GENERATION_CREDIT_COSTS[modelLabel],
    pricingKey: PRICING_KEY_BY_LABEL[modelLabel] ?? modelLabel,
  };
}
