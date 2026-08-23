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

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, isAdminAccess, isServiceRoleRequest } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';

// Known pricing sources for major providers (per 1M tokens)
// These are fallback values - the function will attempt to fetch from APIs first
const PROVIDER_PRICING_SOURCES: Record<string, {
  api_url?: string;
  fallback_prices: Record<string, { input: number; output: number }>;
}> = {
  anthropic: {
    // Anthropic published pricing — https://www.anthropic.com/pricing
    // Canonical 3 latest-tier models only.
    fallback_prices: {
      'claude-opus-4-8':            { input: 15.00, output: 75.00 },
      'claude-haiku-4-5':  { input:  1.00, output:  5.00 },
    },
  },
  // OpenAI is deliberately absent (2026-08-23). The provider was removed from the
  // platform, and its two `ai_model_pricing` rows were deactivated rather than deleted so
  // the historical `ai_usage_logs` rows naming them still resolve. Leaving a fallback here
  // would have this cron write them back and flip them active again on its next run —
  // a removal undone by a scheduled job is a removal that does not stay done.
  voyage: {
    // Voyage AI pricing
    // https://docs.voyageai.com/docs/pricing
    fallback_prices: {
      'voyage-4': { input: 0.06, output: 0.00 },
    },
  },
  google: {
    // Google AI pricing
    // https://ai.google.dev/gemini-api/docs/pricing
    fallback_prices: {
      'gemini-3.5-flash': { input: 0.50, output: 3.00 },
      'gemini-3.1-pro': { input: 2.00, output: 12.00 },
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

Deno.serve(withApiLogging('ai-pricing-updater', async (req) => {
  await bootstrapForFunction();
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth gate: this function has verify_jwt=false (so the cron can call it
    // without a user JWT), so it MUST enforce its own auth — otherwise anyone
    // could trigger a full pricing rewrite + upstream spend. Accept either the
    // shared cron secret OR an admin/super_admin user JWT.
    const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
    const cronOk = isServiceRoleRequest(req) || (!!cronSecret && req.headers.get('x-cron-secret') === cronSecret);
    if (!cronOk) {
      const auth = await authenticate(req, { allowedRoles: ['admin', 'super_admin'] });
      if (!auth.success && !isAdminAccess(auth)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

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

          // Log the price change for audit. Non-critical: surface the error and carry on.
          // A PostgREST builder is PromiseLike — it implements `then` but NOT `catch`,
          // so `.catch(...)` here threw a synchronous TypeError, which the per-model catch
          // below turned into models_failed++ for every model we had just updated fine.
          const { error: logError } = await supabase.from('ai_pricing_update_logs').insert({
            model_pricing_id: model.id,
            model_key: model.model_key,
            provider: model.provider,
            old_input_price: model.input_price_per_million,
            old_output_price: model.output_price_per_million,
            new_input_price: modelPrices.input,
            new_output_price: modelPrices.output,
            update_source: 'auto_update',
            update_reason: 'Scheduled weekly price sync',
          });

          if (logError) {
            console.warn('[AIPricingUpdater] Could not log price change:', logError.message);
          }

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
}));
