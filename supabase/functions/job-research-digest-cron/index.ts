/**
 * Job Research Digest Cron — consolidated daily email per user.
 *
 * Architecture: Edge Function (this) → MIVAA Python backend
 *
 * Computes the current UTC hour and POSTs to MIVAA's
 * /api/v1/job-research/cron-digest?current_hour_utc=<H> endpoint. The MIVAA
 * dispatcher picks tracked_jobs whose digest_hour_utc == H and last_digest_sent_at
 * is older than the start of the current UTC day, groups them by user, and sends
 * ONE consolidated email per user covering all of their tracked job searches.
 *
 * Scheduling: pg_cron `job-research-digest-hourly` at :05 every hour.
 *
 * Why a separate cron from refresh: refresh writes new job_listings rows; the
 * digest reads them. Running them on different ticks (refresh at :45, digest at
 * :05 of the next hour) ensures the digest sees the freshest results.
 */

Deno.serve(async (req) => {
  console.log('📬 Job research digest cron started');

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

    const currentHourUtc = new Date().getUTCHours();
    console.log(`📬 Dispatching digest for UTC hour ${currentHourUtc}`);

    const response = await fetch(
      `${pythonBackendUrl}/api/v1/job-research/cron-digest?current_hour_utc=${currentHourUtc}`,
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
    console.log(`✅ Digest dispatch complete: ${JSON.stringify(result).slice(0, 200)}`);

    return new Response(JSON.stringify({
      success: true,
      hour_utc: currentHourUtc,
      backend_response: result,
      timestamp: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error in job-research-digest-cron:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
