import { createClient } from '@supabase/supabase-js';

/**
 * Price Monitoring Cron Job
 *
 * Architecture: Edge Function → Python Backend API
 *
 * This Edge Function runs on a schedule (hourly) and:
 * 1. Queries database for products due for monitoring
 * 2. Calls Python backend API for each product
 * 3. Python backend handles:
 *    - Firecrawl scraping
 *    - Credit debit via CreditsIntegrationService
 *    - AI usage logging via AICallLogger
 *    - Database updates
 *    - Price alert checks
 *
 * Benefits:
 * - Unified credit system
 * - Unified AI analytics
 * - Single source of truth for business logic
 * - Consistent error handling
 *
 * Triggered by: Supabase Cron or external scheduler
 */

Deno.serve(async (req) => {
  console.log('🔄 Price monitoring cron job started');

  try {
    // Verify cron secret for security
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');

    if (cronSecret !== expectedSecret) {
      console.error('❌ Invalid cron secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Python backend URL (required)
    const pythonBackendUrl = Deno.env.get('PYTHON_BACKEND_URL');
    if (!pythonBackendUrl) {
      throw new Error('PYTHON_BACKEND_URL environment variable not set');
    }

    // Get products due for monitoring
    // Uses database function to find products where next_check_at <= NOW()
    const { data: productsToMonitor, error: fetchError } = await supabase
      .rpc('get_products_due_for_monitoring');

    if (fetchError) {
      console.error('❌ Failed to fetch products:', fetchError);
      throw new Error(`Failed to fetch products: ${fetchError.message}`);
    }

    console.log(`📊 Found ${productsToMonitor?.length || 0} products due for monitoring`);

    if (!productsToMonitor || productsToMonitor.length === 0) {
      console.log('✅ No products due for monitoring');
      return new Response(JSON.stringify({
        success: true,
        message: 'No products due for monitoring',
        processed: 0,
        succeeded: 0,
        failed: 0,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const results: any[] = [];

    // Process each product
    for (const product of productsToMonitor) {
      try {
        console.log(`\n🔍 Processing product: ${product.product_id}`);
        console.log(`   Product name: ${product.product_name || 'Unknown'}`);
        console.log(`   Frequency: ${product.monitoring_frequency}`);

        // Call Python backend API to perform price check
        // The Python backend handles:
        // - Firecrawl scraping
        // - Credit debit via CreditsIntegrationService
        // - AI usage logging via AICallLogger
        // - Database updates (price_history, competitor_sources)
        // - Job tracking (price_monitoring_jobs)
        // - Price alert checks

        const response = await fetch(`${pythonBackendUrl}/api/v1/price-monitoring/check-now`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Use service role key for backend-to-backend auth
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            product_id: product.product_id,
            product_name: product.product_name || 'Unknown Product',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Python backend error (${response.status}): ${errorText}`);
          failed++;
          results.push({
            product_id: product.product_id,
            success: false,
            error: `Backend returned ${response.status}: ${errorText}`,
          });
          continue;
        }

        const result = await response.json();

        if (result.success) {
          console.log(`✅ Price check completed for ${product.product_id}`);
          console.log(`   Sources checked: ${result.sources_checked || 0}`);
          console.log(`   Prices found: ${result.prices_found || 0}`);
          console.log(`   Credits consumed: ${result.credits_consumed || 0}`);
          succeeded++;
          results.push({
            product_id: product.product_id,
            success: true,
            sources_checked: result.sources_checked,
            prices_found: result.prices_found,
            credits_consumed: result.credits_consumed,
          });
        } else {
          console.error(`❌ Price check failed for ${product.product_id}: ${result.error || 'Unknown error'}`);
          failed++;
          results.push({
            product_id: product.product_id,
            success: false,
            error: result.error || 'Unknown error',
          });
        }

        processed++;

        // Update next check time using database function
        const { error: updateError } = await supabase.rpc('update_next_check_time', {
          p_monitoring_id: product.id,
          p_frequency: product.monitoring_frequency,
        });

        if (updateError) {
          console.error(`⚠️  Failed to update next check time for ${product.product_id}:`, updateError);
        }

      } catch (error) {
        console.error(`❌ Error processing product ${product.product_id}:`, error);
        failed++;
        results.push({
          product_id: product.product_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`\n✅ Cron job completed: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      message: `Price monitoring completed: ${succeeded}/${processed} succeeded`,
      stats: {
        total: productsToMonitor.length,
        processed,
        succeeded,
        failed,
        results,
      },
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in price-monitoring-cron:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// END OF CRON JOB
// ============================================================================
// All scraping logic has been moved to the Python backend.
// This Edge Function only orchestrates the cron schedule and calls the backend API.
//
// Python backend handles:
// - Firecrawl scraping (CompetitorScraperService)
// - Credit debit (CreditsIntegrationService)
// - AI usage logging (AICallLogger)
// - Price history storage
// - Price alert checks (PriceAlertService)
// - Job tracking
//
// Benefits:
// - Unified credit system
// - Unified AI analytics dashboard
// - Single source of truth for business logic
// - Consistent error handling and retry logic
// ============================================================================