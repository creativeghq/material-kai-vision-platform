import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

/**
 * Price Monitoring Cron Job — internal-flow refresher.
 *
 * Architecture: Edge Function → Python Backend API
 *
 * After the 2026-05-01 consolidation, every catalog product enrolled in
 * monitoring is a `tracked_queries` row with `api_key_id IS NULL` and
 * `product_id NOT NULL`. This cron:
 *   1. Calls `get_internal_tracked_queries_due()` to pick rows whose
 *      `next_check_at` (volatility-aware cadence) has elapsed.
 *   2. POSTs each one to MIVAA's `/api/v1/price-monitoring/products/{id}/refresh`
 *      so the Python backend runs the full discovery + verification pipeline,
 *      writes to `tracked_query_price_history`, and bumps `next_check_at` via
 *      `update_tracked_query_cadence`.
 *
 * External API consumers (`api_key_id IS NOT NULL`) are intentionally NOT
 * touched — they pay per call and control their own refresh cadence.
 */

Deno.serve(async (req) => {
  await bootstrapForFunction();
  console.log('🔄 Price monitoring cron job started');

  try {
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = () => Deno.env.get('CRON_SECRET') || '';
    if (cronSecret !== expectedSecret()) {
      console.error('❌ Invalid cron secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const pythonBackendUrl = Deno.env.get('PYTHON_BACKEND_URL');
    if (!pythonBackendUrl) {
      throw new Error('PYTHON_BACKEND_URL environment variable not set');
    }

    // Pull internal tracked_queries whose next_check_at has elapsed.
    const { data: due, error: fetchError } = await supabase
      .rpc('get_internal_tracked_queries_due');

    if (fetchError) {
      console.error('❌ Failed to fetch due tracked_queries:', fetchError);
      throw new Error(`Failed to fetch due tracked_queries: ${fetchError.message}`);
    }

    console.log(`📊 Found ${due?.length || 0} internal tracked_queries due`);

    if (!due || due.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No products due for monitoring',
        processed: 0,
        succeeded: 0,
        failed: 0,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const row of due) {
      const productId = (row as { product_id?: string }).product_id;
      if (!productId) continue;

      try {
        const response = await fetch(
          `${pythonBackendUrl}/api/v1/price-monitoring/products/${productId}/refresh`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Service-role JWT lets MIVAA's get_current_user accept us without
              // a session JWT. The endpoint internally uses the row owner.
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ force_refresh: false, verify_prices: true }),
          },
        );

        processed++;

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Backend ${response.status} for product ${productId}: ${errorText.slice(0, 200)}`);
          failed++;
          results.push({ product_id: productId, success: false, error: `${response.status}` });
          continue;
        }

        const result = await response.json();
        const inner = (result?.data || {}) as Record<string, unknown>;
        if (result.success) {
          succeeded++;
          results.push({
            product_id: productId,
            success: true,
            credits_used: inner.credits_used ?? 0,
            results_count: Array.isArray(inner.results) ? inner.results.length : 0,
          });
        } else {
          failed++;
          results.push({
            product_id: productId,
            success: false,
            status: inner.status,
            error: inner.error,
          });
        }
      } catch (error) {
        console.error(`❌ Error refreshing product ${productId}:`, error);
        failed++;
        processed++;
        results.push({
          product_id: productId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`✅ Internal monitoring completed: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      message: `Price monitoring completed: ${succeeded}/${processed} succeeded`,
      stats: {
        internal: {
          total: due.length,
          processed,
          succeeded,
          failed,
          results,
        },
      },
      timestamp: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error in price-monitoring-cron:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
