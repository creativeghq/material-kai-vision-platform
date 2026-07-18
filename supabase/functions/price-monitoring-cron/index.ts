import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isModuleEnabled, moduleSupabaseClient } from '../_shared/modules/registry.ts';

/**
 * Price Monitoring Cron Job — internal-flow refresher.
 *
 * Delegates to MIVAA's /tracked-queries/cron-refresh endpoint which
 * internally fetches due rows and refreshes them in batch. This avoids
 * the per-product JWT auth issue (service-role JWT has aud="service_role"
 * which get_current_user rejects).
 *
 * External API consumers (api_key_id IS NOT NULL) are intentionally NOT
 * touched — they pay per call and control their own refresh cadence.
 */

Deno.serve(withApiLogging('price-monitoring-cron', async (req) => {
  await bootstrapForFunction();
  console.log('🔄 Price monitoring cron job started');

  try {
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET') || '';
    if (!expectedSecret || cronSecret !== expectedSecret) {
      console.error('❌ Invalid cron secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Honor the module toggle: a disabled module must not run paid refreshes.
    if (!(await isModuleEnabled(moduleSupabaseClient(), 'price-monitoring'))) {
      console.log('⏸️ price-monitoring module is disabled — skipping refresh');
      return new Response(JSON.stringify({
        success: true, skipped: 'module_disabled', timestamp: new Date().toISOString(),
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const pythonBackendUrl = Deno.env.get('PYTHON_BACKEND_URL') || 'https://v1api.materialshub.gr';

    const response = await fetch(
      `${pythonBackendUrl}/api/v1/price-monitoring/tracked-queries/cron-refresh?limit=50`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': expectedSecret,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend ${response.status}: ${errorText.slice(0, 500)}`);
      return new Response(JSON.stringify({
        success: false,
        error: `Backend returned ${response.status}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const result = await response.json();
    console.log(`✅ Cron refresh complete: ${JSON.stringify(result).slice(0, 500)}`);

    return new Response(JSON.stringify({
      success: true,
      ...result,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error in price-monitoring-cron:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}));
