/**
 * Job Research Cron — internal-flow refresher.
 *
 * Architecture: Edge Function (this) → MIVAA Python backend
 *
 * Picks tracked_jobs rows where api_key_id IS NULL, is_active=true, and
 * next_check_at <= now() (volatility-aware cadence — 6h/24h/48h/72h/168h).
 * Delegates the full discovery + classifier pipeline to MIVAA's
 * /api/v1/job-research/cron-refresh endpoint.
 *
 * External-API consumers (api_key_id IS NOT NULL) are NOT touched — they pay
 * per call and control their own refresh cadence.
 *
 * Scheduling: pg_cron `job-research-refresh-hourly` at :45 every hour.
 */

Deno.serve(async (req) => {
  console.log('💼 Job research cron started');

  try {
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (cronSecret !== expectedSecret) {
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

    const response = await fetch(
      `${pythonBackendUrl}/api/v1/job-research/cron-refresh?limit=50`,
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
    console.log(`✅ Job research refresh complete: ${JSON.stringify(result).slice(0, 200)}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Job research cron tick complete',
      backend_response: result,
      timestamp: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error in job-research-cron:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
