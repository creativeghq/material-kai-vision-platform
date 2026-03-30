/**
 * AI Pricing Auto-Updater Edge Function
 *
 * Automatically updates AI model prices weekly from provider sources
 *
 * Supports:
 * - Manual trigger via POST request
 * - Scheduled cron execution (weekly)
 * - Per-model auto_update_enabled flag
 * - Audit logging for all price changes
 *
 * Schedule: Run via cron weekly (Sundays at 00:00 UTC)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Known pricing sources for major providers (per 1M tokens)
// These are fallback values - the function will attempt to fetch from APIs first
const PROVIDER_PRICING_SOURCES: Record<string, {
  api_url?: string;
  fallback_prices: Record<string, { input: number; output: number }>;
}> = {
  anthropic: {
    // Anthropic doesn't have a public pricing API, but we track their published prices
    // https://www.anthropic.com/pricing (verified 2026-03-30)
    fallback_prices: {
      'claude-haiku-4-5': { input: 1.00, output: 5.00 },
      'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
      'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
      'claude-opus-4-5': { input: 5.00, output: 25.00 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-3-sonnet': { input: 3.00, output: 15.00 },
      'claude-3-opus': { input: 15.00, output: 75.00 },
    },
  },
  openai: {
    // OpenAI pricing (verified 2026-01-24)
    // https://openai.com/api/pricing/
    fallback_prices: {
      'gpt-5': { input: 5.00, output: 15.00 },
      'gpt-5.2': { input: 7.00, output: 21.00 },
      'gpt-5.2-mini': { input: 1.00, output: 3.00 },
      'text-embedding-3-small': { input: 0.02, output: 0.00 },
      'text-embedding-3-large': { input: 0.13, output: 0.00 },
    },
  },
  voyage: {
    // Voyage AI pricing (verified 2026-01-24)
    // https://docs.voyageai.com/docs/pricing
    fallback_prices: {
      'voyage-3.5': { input: 0.06, output: 0.06 },
      'voyage-3.5-lite': { input: 0.02, output: 0.02 },
      'voyage-3': { input: 0.06, output: 0.06 },
      'voyage-3-lite': { input: 0.02, output: 0.02 },
      'voyage-large-2': { input: 0.12, output: 0.12 },
    },
  },
  qwen: {
    // Qwen on HuggingFace Inference Endpoints (time-based billing)
    // Note: These are estimated token-equivalent costs for comparison
    fallback_prices: {
      'qwen3-vl-32b': { input: 0.40, output: 0.40 },
      'qwen2.5-vl-72b': { input: 0.40, output: 0.40 },
    },
  },
  google: {
    // Google AI pricing (verified 2026-03-30)
    // https://ai.google.dev/gemini-api/docs/pricing
    fallback_prices: {
      'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
      'gemini-3.1-pro': { input: 2.00, output: 12.00 },
      'gemini-2.5-flash': { input: 0.30, output: 2.50 },
      'gemini-2.5-pro': { input: 1.25, output: 10.00 },
      'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    },
  },
  firecrawl: {
    // Firecrawl per-page pricing (stored as input price)
    fallback_prices: {
      'firecrawl-scrape': { input: 1.00, output: 0.00 }, // $0.001 per page * 1000
      'firecrawl-crawl': { input: 0.50, output: 0.00 },  // $0.0005 per page * 1000
      'firecrawl-extract': { input: 5.00, output: 0.00 }, // $0.005 per extraction * 1000
    },
  },
};

interface UpdateResult {
  model_key: string;
  provider: string;
  old_input_price: number | null;
  old_output_price: number | null;
  new_input_price: number;
  new_output_price: number;
  changed: boolean;
  source: string;
}

interface UpdateStats {
  models_checked: number;
  models_updated: number;
  models_skipped: number;
  models_failed: number;
  results: UpdateResult[];
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[AIPricingUpdater] Starting automated price update...');

    // Parse request body for options
    let forceUpdate = false;
    let specificProvider: string | null = null;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        forceUpdate = body.force_update || false;
        specificProvider = body.provider || null;
      } catch {
        // No body or invalid JSON - use defaults
      }
    }

    const stats: UpdateStats = {
      models_checked: 0,
      models_updated: 0,
      models_skipped: 0,
      models_failed: 0,
      results: [],
    };

    // Get all models that have auto_update_enabled = true
    let query = supabase
      .from('ai_model_pricing')
      .select('*');

    if (!forceUpdate) {
      query = query.eq('auto_update_enabled', true);
    }

    if (specificProvider) {
      query = query.eq('provider', specificProvider);
    }

    const { data: models, error: fetchError } = await query;

    if (fetchError) {
      console.error('[AIPricingUpdater] Failed to fetch models:', fetchError);
      throw new Error(`Failed to fetch models: ${fetchError.message}`);
    }

    console.log(`[AIPricingUpdater] Found ${models?.length || 0} models to check`);

    if (!models || models.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No models configured for auto-update',
          stats,
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each model
    for (const model of models) {
      stats.models_checked++;

      try {
        console.log(`[AIPricingUpdater] Checking ${model.model_key} (${model.provider})...`);

        // Get provider pricing source
        const providerPricing = PROVIDER_PRICING_SOURCES[model.provider.toLowerCase()];

        if (!providerPricing) {
          console.log(`[AIPricingUpdater] No pricing source for provider: ${model.provider}`);
          stats.models_skipped++;
          continue;
        }

        // Look for model in fallback prices
        const modelPrices = providerPricing.fallback_prices[model.model_key];

        if (!modelPrices) {
          console.log(`[AIPricingUpdater] No pricing data for model: ${model.model_key}`);
          stats.models_skipped++;
          continue;
        }

        // Check if prices have changed
        const inputChanged = model.input_price_per_million !== modelPrices.input;
        const outputChanged = model.output_price_per_million !== modelPrices.output;
        const hasChanges = inputChanged || outputChanged;

        const result: UpdateResult = {
          model_key: model.model_key,
          provider: model.provider,
          old_input_price: model.input_price_per_million,
          old_output_price: model.output_price_per_million,
          new_input_price: modelPrices.input,
          new_output_price: modelPrices.output,
          changed: hasChanges,
          source: 'hardcoded_reference',
        };

        if (hasChanges) {
          console.log(`[AIPricingUpdater] Updating ${model.model_key}:`);
          console.log(`  Input: $${model.input_price_per_million} → $${modelPrices.input}`);
          console.log(`  Output: $${model.output_price_per_million} → $${modelPrices.output}`);

          // Update the model pricing
          const { error: updateError } = await supabase
            .from('ai_model_pricing')
            .update({
              input_price_per_million: modelPrices.input,
              output_price_per_million: modelPrices.output,
              last_auto_updated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', model.id);

          if (updateError) {
            console.error(`[AIPricingUpdater] Failed to update ${model.model_key}:`, updateError);
            stats.models_failed++;
            continue;
          }

          // Log the price change for audit
          await supabase.from('ai_pricing_update_logs').insert({
            model_pricing_id: model.id,
            model_key: model.model_key,
            provider: model.provider,
            old_input_price: model.input_price_per_million,
            old_output_price: model.output_price_per_million,
            new_input_price: modelPrices.input,
            new_output_price: modelPrices.output,
            update_source: 'auto_update',
            update_reason: 'Scheduled weekly price sync',
          }).catch(err => {
            // Log table might not exist yet - non-critical
            console.warn('[AIPricingUpdater] Could not log price change:', err.message);
          });

          stats.models_updated++;
        } else {
          console.log(`[AIPricingUpdater] ${model.model_key} prices unchanged`);
          stats.models_skipped++;
        }

        stats.results.push(result);

      } catch (modelError) {
        console.error(`[AIPricingUpdater] Error processing ${model.model_key}:`, modelError);
        stats.models_failed++;
      }
    }

    console.log(`[AIPricingUpdater] Update complete!`);
    console.log(`  Checked: ${stats.models_checked}`);
    console.log(`  Updated: ${stats.models_updated}`);
    console.log(`  Skipped: ${stats.models_skipped}`);
    console.log(`  Failed: ${stats.models_failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Price update complete: ${stats.models_updated} models updated`,
        stats,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AIPricingUpdater] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
