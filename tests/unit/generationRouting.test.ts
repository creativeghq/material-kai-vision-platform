/**
 * Guard for image-generation provider/price routing (#321).
 *
 * The bug this exists for: credits and the model label were two independent ternary
 * chains in generate-interior-gemini. `product-shot` consulted the tier when picking
 * the PRICE but not when picking the CALL, so asking for Grok billed 15 credits and
 * ran Gemini. Both numbers were valid, both types were right, and no integrity probe
 * could see it — the stored row said grok-aurora and the money said grok-aurora; only
 * the actual HTTP call disagreed.
 *
 * So the invariant under test is not "these are the prices" but "the model you are
 * billed for is the model that runs".
 */
import { describe, it, expect } from 'vitest';
import {
  resolveGenerationRouting,
  GENERATION_CREDIT_COSTS,
  type GenerationTier,
} from '../../supabase/functions/_shared/generation-routing.ts';

const TIERS: GenerationTier[] = ['fast', 'pro', 'grok'];
const ALL_MODES = [
  'text-to-image', 'image-edit', 'redesign', 'copy-style',
  'floor-plan-render', 'floor-plan-text', 'materials-selection-board',
  'product-shot', 'product-lifestyle', 'material-texture',
];
const PRODUCT_MODES = ['product-shot', 'product-lifestyle', 'material-texture'];

describe('generation routing', () => {
  it('bills for exactly the model it calls, in every mode and tier', () => {
    for (const mode of ALL_MODES) {
      for (const tier of TIERS) {
        const r = resolveGenerationRouting(mode, tier);
        expect(r.credits, `${mode}/${tier} credits`).toBe(GENERATION_CREDIT_COSTS[r.modelLabel]);
        // The label must name the provider that actually runs.
        const expectedPrefix = { gemini: 'gemini-', grok: 'grok-', flux: 'flux-' }[r.provider];
        expect(r.modelLabel.startsWith(expectedPrefix), `${mode}/${tier} label ${r.modelLabel} vs provider ${r.provider}`).toBe(true);
      }
    }
  });

  it('routes the product modes to Grok when Grok is asked for', () => {
    // The regression: these billed grok-aurora and ran Gemini.
    for (const mode of PRODUCT_MODES) {
      const r = resolveGenerationRouting(mode, 'grok');
      expect(r.provider, mode).toBe('grok');
      expect(r.modelLabel, mode).toBe('grok-aurora');
      expect(r.credits, mode).toBe(15);
    }
  });

  it('gives the product modes real Gemini tiers', () => {
    for (const mode of PRODUCT_MODES) {
      expect(resolveGenerationRouting(mode, 'fast').modelLabel).toBe('gemini-3.1-flash-image');
      expect(resolveGenerationRouting(mode, 'fast').credits).toBe(6);
      expect(resolveGenerationRouting(mode, 'pro').modelLabel).toBe('gemini-3-pro-image');
      expect(resolveGenerationRouting(mode, 'pro').credits).toBe(15);
    }
  });

  it('keeps redesign on Flux regardless of tier — it needs the depth pass', () => {
    for (const tier of TIERS) {
      expect(resolveGenerationRouting('redesign', tier).provider, tier).toBe('flux');
      expect(resolveGenerationRouting('redesign', tier).credits, tier).toBe(20);
    }
  });

  it('lets copy-style opt out of Flux only for Grok, which does it in one step', () => {
    expect(resolveGenerationRouting('copy-style', 'fast').provider).toBe('flux');
    expect(resolveGenerationRouting('copy-style', 'pro').provider).toBe('flux');
    expect(resolveGenerationRouting('copy-style', 'grok').provider).toBe('grok');
  });

  it('defaults to the cheap Gemini tier when no tier is given', () => {
    const r = resolveGenerationRouting('product-shot', undefined);
    expect(r.provider).toBe('gemini');
    expect(r.modelLabel).toBe('gemini-3.1-flash-image');
    expect(r.credits).toBe(6);
  });

  it('maps Grok to its own ai_model_pricing key, and leaves the others identity', () => {
    expect(resolveGenerationRouting('product-shot', 'grok').pricingKey).toBe('xai-aurora');
    expect(resolveGenerationRouting('product-shot', 'pro').pricingKey).toBe('gemini-3-pro-image');
    expect(resolveGenerationRouting('redesign', 'fast').pricingKey).toBe('flux-depth-pro');
  });

  it('never returns an unpriced model', () => {
    for (const mode of ALL_MODES) {
      for (const tier of TIERS) {
        const r = resolveGenerationRouting(mode, tier);
        expect(Number.isFinite(r.credits), `${mode}/${tier}`).toBe(true);
        expect(r.credits, `${mode}/${tier}`).toBeGreaterThan(0);
      }
    }
  });

  it('routes text-to-image to Grok when Grok is asked for', () => {
    // The regression that shipped with the interior grid: text-to-image was the last
    // generative mode with no `useGrok` branch, so the Grok tile would have billed
    // grok-aurora and rendered a second Gemini Flash image.
    const r = resolveGenerationRouting('text-to-image', 'grok');
    expect(r.provider).toBe('grok');
    expect(r.modelLabel).toBe('grok-aurora');
    expect(r.credits).toBe(15);
  });

  it('does NOT bill Grok for the diagram/board modes it cannot serve', () => {
    // Every branch for these calls Gemini unconditionally. Charging the Grok rate for
    // a Gemini render is a valid number, so nothing else can catch it.
    for (const mode of ['floor-plan-render', 'floor-plan-text', 'materials-selection-board']) {
      const r = resolveGenerationRouting(mode, 'grok');
      expect(r.provider, mode).toBe('gemini');
      expect(r.modelLabel.startsWith('gemini-'), `${mode} → ${r.modelLabel}`).toBe(true);
      expect(r.credits, mode).toBe(GENERATION_CREDIT_COSTS[r.modelLabel]);
    }
  });

  it('falls back to Gemini when the prompt carries multiple reference images', () => {
    // Grok's image API takes ONE image. A multi-reference brief is Gemini's work, so
    // it has to be Gemini's price too — decided here, not re-decided at the call site.
    const r = resolveGenerationRouting('text-to-image', 'grok', { multiReference: true });
    expect(r.provider).toBe('gemini');
    expect(r.credits).toBe(GENERATION_CREDIT_COSTS[r.modelLabel]);
    // A single-reference edit still gets Grok.
    expect(resolveGenerationRouting('image-edit', 'grok', { multiReference: false }).provider).toBe('grok');
  });
});
