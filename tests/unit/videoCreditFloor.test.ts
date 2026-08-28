/**
 * Nothing is sold below cost.
 *
 * `veo-2` was charged at 30 credits for a clip that can run the full 8 seconds. At Google's
 * $0.35/second that clip costs $2.80, and 30 credits earn about $2.70 on the standard pack — so
 * the platform paid its customers to use its most expensive model, on every full-length video.
 *
 * WHY IT SURVIVED. Three separate things had to be true at once, and each looked fine alone:
 *   • the credit price is a hand-typed flat number, and 30 is a perfectly valid number;
 *   • `MAX_DURATION_SECONDS` bounds the clip but lives 15 lines away from the price, so nothing
 *     connects "8 seconds allowed" to "priced for how many seconds?";
 *   • the provider cost was not in `ai_usage_logs` AT ALL until #363 `EE-2` — image and video
 *     calls wrote no billing row — so no cost report could show the loss even in aggregate.
 * Nothing threw, no margin alert existed, and the number was wrong from the day it was typed.
 *
 * WHAT THIS PINS. The floor, not the price. Raising a price is always fine; this fails when a
 * price drops below the provider bill for a MAX-LENGTH clip, or when someone raises a duration
 * cap without revisiting the price — which is the same defect arriving from the other side.
 *
 * ON THE MIRRORED RATES. `PROVIDER_USD_PER_SECOND` restates what lives in `ai_model_pricing`,
 * and a mirror is normally exactly what CLAUDE.md forbids. The alternative here is worse: the
 * unit tier has no database, so the choice is a stated mirror or no check at all, and the thing
 * being guarded is a number a human types into a TypeScript file. Treat a failure as "re-read
 * the pricing table", not as "edit this constant until it passes".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GENERATOR = 'supabase/functions/generate-interior-video-v2/index.ts';
const SOCIAL_VIDEO = 'supabase/functions/generate-social-video/index.ts';
const CREDIT_UTILS = 'supabase/functions/_shared/credit-utils.ts';
const PICKER = 'src/components/features/ai/ProgressiveImageGrid.tsx';
const CATALOG = 'src/components/features/ai/agentToolsCatalog.ts';
const TOOL = 'supabase/functions/_shared/tools/background-tools.ts';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Mirrors `ai_model_pricing.cost_per_unit` where `unit_label = 'second'`. */
const PROVIDER_USD_PER_SECOND: Record<string, number> = {
  'veo-2': 0.35,
  'kling-v3.0': 0.10,
  'runway-gen4-turbo': 0.15,
  // Wan3.0-Video-Prime, one row per resolution tier — the rate differs 4x across them,
  // so a single averaged entry here would pass the floor for 1080p while underpricing it.
  'wan-3.0-480p': 0.068,
  'wan-3.0-720p': 0.14,
  'wan-3.0-1080p': 0.28,
};

/** `_shared/pricing-constants.ts` → MARKUP_MULTIPLIER. */
const MARKUP = 1.5;

/**
 * What one credit is actually WORTH to the business — the cheapest pack we sell
 * (`credit_packages`: premium, 1000 for $84.99). Deliberately the cheapest: a credit bought at
 * a discount still has to cover the same provider bill, so the worst case is the one that
 * decides whether a sale loses money.
 *
 * NOTE this is not `CREDITS_PER_USD` (100, i.e. $0.01/credit) from `_shared/pricing-constants.ts`.
 * That constant is the internal cost-accounting rate and disagrees with the retail price by
 * roughly 8.5x. The discrepancy is real and worth resolving, but the question HERE is whether
 * real money in covers real money out, and that is answered by what a credit sells for.
 */
const USD_PER_CREDIT_WORST_CASE = 84.99 / 1000;

/** Parse `const NAME: Record<...> = { 'key': 12, … }` out of a source file. */
function parseNumericMap(src: string, name: string): Record<string, number> {
  const m = new RegExp(`const ${name}[^=]*=\\s*\\{([^}]*)\\}`, 's').exec(src);
  if (!m) return {};
  const out: Record<string, number> = {};
  for (const line of m[1].split('\n')) {
    const e = /'([^']+)'\s*:\s*([\d.]+)/.exec(line);
    if (e) out[e[1]] = Number(e[2]);
  }
  return out;
}

describe('video generation is never sold below cost', () => {
  const creditCosts = parseNumericMap(read(GENERATOR), 'CREDIT_COSTS');
  const maxDurations = parseNumericMap(read(GENERATOR), 'MAX_DURATION_SECONDS');

  it('finds both maps in the generator', () => {
    expect(Object.keys(creditCosts).length, 'CREDIT_COSTS did not parse').toBeGreaterThan(0);
    expect(Object.keys(maxDurations).length, 'MAX_DURATION_SECONDS did not parse').toBeGreaterThan(0);
  });

  it('prices every model it can charge for', () => {
    for (const model of Object.keys(creditCosts)) {
      expect(maxDurations[model], `${model} has a price but no duration cap — the clip is unbounded and the fee is flat`).toBeGreaterThan(0);
      expect(PROVIDER_USD_PER_SECOND[model], `${model} has no provider rate mirrored here; add it and re-check the floor`).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(PROVIDER_USD_PER_SECOND))('%s covers its provider bill at max duration', (model) => {
    const seconds = maxDurations[model];
    const charged = creditCosts[model];
    expect(seconds, `${model} missing from MAX_DURATION_SECONDS`).toBeGreaterThan(0);
    expect(charged, `${model} missing from CREDIT_COSTS`).toBeGreaterThan(0);

    const providerCost = PROVIDER_USD_PER_SECOND[model] * seconds;
    const revenue = charged * USD_PER_CREDIT_WORST_CASE;

    expect(
      revenue,
      `${model}: a full ${seconds}s clip costs $${providerCost.toFixed(2)} but ${charged} credits ` +
      `earn only $${revenue.toFixed(2)} — that is a sale at a loss`,
    ).toBeGreaterThanOrEqual(providerCost);

    // And it must clear the platform's declared markup, not merely break even.
    expect(
      revenue,
      `${model}: ${charged} credits ($${revenue.toFixed(2)}) does not cover ` +
      `$${providerCost.toFixed(2)} x ${MARKUP} markup = $${(providerCost * MARKUP).toFixed(2)}`,
    ).toBeGreaterThanOrEqual(providerCost * MARKUP);
  });
});

describe('every surface advertises the price the generator actually charges', () => {
  const creditCosts = parseNumericMap(read(GENERATOR), 'CREDIT_COSTS');

  // A picker that promises 30 and a generator that debits 50 is a support ticket. These are
  // four hand-kept copies of one number; until they are derived, they are checked.
  it('the image-grid picker agrees', () => {
    const src = read(PICKER);
    for (const [model, credits] of Object.entries(creditCosts)) {
      const re = new RegExp(`value: '${model.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&')}'[^}]*credits: (\\d+)`);
      const m = re.exec(src);
      expect(m, `${model} not found in VIDEO_MODEL_OPTIONS`).not.toBeNull();
      expect(Number(m![1]), `picker advertises ${m![1]} credits for ${model}, generator charges ${credits}`).toBe(credits);
    }
  });

  it('no surface still quotes the old below-cost Veo price', () => {
    for (const f of [PICKER, CATALOG, TOOL]) {
      const src = read(f);
      expect(/veo-2[^\n]{0,60}30\s*(cr|credits)/i.test(src), `${f} still advertises veo-2 at 30 credits`).toBe(false);
      expect(/[Vv]eo 2[^\n]{0,40}30\s*(cr|credits)/i.test(src), `${f} still advertises Veo 2 at 30 credits`).toBe(false);
    }
  });

  it('the agent tool description quotes the charged price', () => {
    expect(read(TOOL)).toContain('veo-2 50cr');
  });
});

describe('the second copy of the video prices agrees with the first', () => {
  // `generate-social-video` keeps its own CREDIT_COSTS. For veo-2 it delegates to
  // generate-interior-video-v2 and never charges from its own map — but the map still feeds the
  // "insufficient credits, required: N" message, so a stale entry quotes a price nobody charges,
  // and it goes live the moment anyone removes the delegation. Two files, one number, nothing
  // keeping them equal: check it.
  const primary = parseNumericMap(read(GENERATOR), 'CREDIT_COSTS');
  const social = parseNumericMap(read(SOCIAL_VIDEO), 'CREDIT_COSTS');

  it('parses both maps', () => {
    expect(Object.keys(primary).length).toBeGreaterThan(0);
    expect(Object.keys(social).length).toBeGreaterThan(0);
  });

  it('agrees on every model both files price', () => {
    // The two files spell Kling differently ('kling-v3.0' vs 'kling-3.0') because one is the
    // generator's model key and the other is the Replicate slug. Compare on a normalised name
    // so the check is about the PRICE, not the spelling.
    const norm = (k: string) => k.replace('kling-v3.0', 'kling-3.0');
    const primaryByNorm = Object.fromEntries(Object.entries(primary).map(([k, v]) => [norm(k), v]));
    for (const [model, credits] of Object.entries(social)) {
      const other = primaryByNorm[norm(model)];
      if (other === undefined) continue;
      expect(credits, `${model}: generate-social-video says ${credits}, generate-interior-video-v2 says ${other}`).toBe(other);
    }
  });
});

describe('a billable service is never priced at zero by accident', () => {
  const src = read(CREDIT_UTILS);

  it('a missing price is reported, not swallowed', () => {
    // `apollo-competitors` was billed in code with no ai_model_pricing row. The debit returned
    // `success: false`, the call site discarded the result, and every competitor search ran for
    // free — the only trace a console line. Callers that ignore the result are the norm here,
    // so the helper has to raise it itself.
    expect(src).toContain('unpriced_service');
    expect(src).toContain('NOTHING WAS CHARGED');
  });

  it('a zero price says so instead of passing silently', () => {
    // `firecrawl-scrape` had its rate in cost_per_generation while billing_type said per_unit,
    // so cost_per_unit read 0: every scrape free AND unlogged, because the zero branch returns
    // before the ai_usage_logs insert.
    const i = src.indexOf('if (creditsToDebit <= 0)');
    expect(i, 'the zero-credit branch moved').toBeGreaterThan(-1);
    expect(src.slice(i, i + 900)).toMatch(/console\.(warn|error)/);
  });

  it('the fallback table carries the priciest model', () => {
    // Veo was absent while Kling and Runway were present, so a DB outage dropped only the most
    // expensive model's cost to null.
    expect(src).toMatch(/'veo-2':\s*\{\s*cost_per_unit:\s*0\.35/);
  });
});
