import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
/**
 * Mention Monitoring Cron Job — internal-flow refresher.
 *
 * Architecture: Edge Function → Python Backend API
 *
 * Picks tracked_mentions rows where api_key_id IS NULL, is_active=true, and
 * next_check_at <= now() (volatility-aware cadence). Posts each one to MIVAA's
 * /api/v1/mention-monitoring/cron-refresh endpoint, which iterates and runs
 * the full discovery + classifier pipeline.
 *
 * External API consumers (api_key_id IS NOT NULL) are NOT touched — they pay
 * per call and control their own cadence.
 *
 * Scheduling: pg_cron `mention-monitoring-refresh-hourly` at :30 every hour.
 */

Deno.serve(async (req) => {
  await bootstrapForFunction();
  console.log('🔔 Mention monitoring cron job started');

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

    const pythonBackendUrl = Deno.env.get('PYTHON_BACKEND_URL');
    if (!pythonBackendUrl) {
      throw new Error('PYTHON_BACKEND_URL environment variable not set');
    }

    // Delegate to MIVAA's /cron-refresh endpoint (which validates the same secret)
    const response = await fetch(
      `${pythonBackendUrl}/api/v1/mention-monitoring/cron-refresh?limit=50`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret as string,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend ${response.status}: ${errorText.slice(0, 200)}`);
      throw new Error(`Backend ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    console.log(`✅ Mention monitoring completed: ${JSON.stringify(result).slice(0, 200)}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Mention monitoring cron tick complete',
      backend_response: result,
      timestamp: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error in mention-monitoring-cron:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
