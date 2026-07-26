import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { isModuleEnabled, moduleSupabaseClient } from '../_shared/modules/registry.ts';

/**
 * Unified monitoring cron dispatcher.
 *
 * Replaces the 5 near-identical monitoring cron functions (price-monitoring-cron,
 * mention-monitoring-cron, llm-mention-probe-cron, job-research-cron,
 * job-research-digest-cron) — each was the same boilerplate (cron-secret check →
 * module gate → POST to a MIVAA cron endpoint), differing only in module slug +
 * endpoint. pg_cron passes `?task=<task>`; each task gates on its module then
 * delegates to MIVAA (which fetches due rows + processes in batch).
 *
 * External API consumers (api_key_id IS NOT NULL) are intentionally NOT touched by
 * the refresh tasks — they pay per call and control their own cadence.
 */

interface TaskSpec {
  module: string;
  path: () => string;
}

const TASKS: Record<string, TaskSpec> = {
  'price-refresh': {
    module: 'price-monitoring',
    path: () => '/api/v1/price-monitoring/tracked-queries/cron-refresh?limit=50',
  },
  'mention-refresh': {
    module: 'mention-monitoring',
    path: () => '/api/v1/mention-monitoring/cron-refresh?limit=50',
  },
  'mention-probe': {
    module: 'mention-monitoring',
    path: () => '/api/v1/mention-monitoring/cron-probe-llm?limit=25&min_age_days=7',
  },
  'job-refresh': {
    module: 'job-research',
    path: () => '/api/v1/job-research/cron-refresh?limit=50',
  },
  'job-digest': {
    module: 'job-research',
    // MIVAA sends each user's consolidated digest whose digest_hour_utc == this hour.
    path: () => `/api/v1/job-research/cron-digest?current_hour_utc=${new Date().getUTCHours()}`,
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(withApiLogging('monitoring-cron', async (req) => {
  await bootstrapForFunction();
  const task = new URL(req.url).searchParams.get('task') ?? '';

  // Monitoring T1-2: use the shared cron gate (service-role bearer OR x-cron-secret) instead of a
  // bespoke env-only x-cron-secret check. Still fails CLOSED, but a vault/env secret-name drift no
  // longer 401s all five monitoring tasks at once as long as the scheduler sends the service-role bearer.
  if (!isCronAuthorized(req)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const spec = TASKS[task];
  if (!spec) {
    return json({ error: `Unknown task '${task}'. Known: ${Object.keys(TASKS).join(', ')}` }, 400);
  }

  // Honor the module toggle: a disabled module must not run paid refreshes/probes.
  if (!(await isModuleEnabled(moduleSupabaseClient(), spec.module))) {
    console.log(`⏸️ ${spec.module} disabled — skipping ${task}`);
    return json({ success: true, task, skipped: 'module_disabled', timestamp: new Date().toISOString() });
  }

  const base = Deno.env.get('PYTHON_BACKEND_URL') || 'https://v1api.materialshub.gr';
  try {
    const resp = await fetch(`${base}${spec.path()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': expectedSecret },
    });
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      console.error(`❌ ${task} backend ${resp.status}: ${detail}`);
      return json({ success: false, task, error: `Backend returned ${resp.status}` }, 502);
    }
    const result = await resp.json().catch(() => ({}));
    console.log(`✅ ${task} complete: ${JSON.stringify(result).slice(0, 300)}`);
    return json({ success: true, task, ...result });
  } catch (error) {
    console.error(`❌ ${task} error:`, error);
    return json({ success: false, task, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}));
