import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
/**
 * LLM Mention Probe Cron Job — weekly visibility tracker.
 *
 * Daily 03:00 UTC. Picks tracked_mentions rows whose llm-source is enabled
 * and whose last probe is older than 7 days (configurable). Delegates to
 * MIVAA's /api/v1/mention-monitoring/cron-probe-llm endpoint which runs the
 * 4-template × 4-cheap-model probe matrix per subject.
 *
 * Cost: roughly $0.008/subject/week.
 */

Deno.serve(async (req) => {
  await bootstrapForFunction();
  console.log('🤖 LLM mention probe cron job started');

  try {
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = () => Deno.env.get('CRON_SECRET') || '';
    if (cronSecret !== expectedSecret()) {
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
      `${pythonBackendUrl}/api/v1/mention-monitoring/cron-probe-llm?limit=25&min_age_days=7`,
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
      throw new Error(`Backend ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    console.log(`✅ LLM probe cron complete: ${JSON.stringify(result).slice(0, 200)}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'LLM probe cron tick complete',
      backend_response: result,
      timestamp: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('❌ Error in llm-mention-probe-cron:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
