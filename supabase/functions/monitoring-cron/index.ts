import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { isModuleEnabled, moduleSupabaseClient } from '../_shared/modules/registry.ts';

/**
 * Secret forwarded to the MIVAA cron endpoints (they authenticate by `x-cron-secret`).
 *
 * Lazy getter, not a module-load capture, so a value bootstrapped into Deno.env inside the
 * handler is picked up. Reinstated after the switch to the shared `isCronAuthorized(req)`
 * gate removed the local `expectedSecret` binding but left its use in the fetch below —
 * every dispatch threw ReferenceError there, so this cron never reached MIVAA at all.
 */
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

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

// Logged per TASK, not as one flat 'monitoring-cron'. This function serves five tasks; under
// a single name their outcomes are indistinguishable in api_usage_logs, and the
// module_disabled skip below (a 200) diluted the real 5xx rate to ~74% — under every
// threshold ops.silent_zero applies, which is how a dead feature stayed invisible for three
// months. Per-task paths let each be judged on its own. (audit #305 finding 3)
Deno.serve(withApiLogging(
  (req) => {
    const t = new URL(req.url).searchParams.get('task');
    return t ? `monitoring-cron?task=${t}` : 'monitoring-cron';
  },
  async (req) => {
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
  // Answers success:false, NOT success:true (audit #305 finding 2). A deliberate no-op and a
  // completed refresh used to be the same response, so mention monitoring reported healthy
  // every hour for three months after being switched off on 2026-05-03.
  // Deliberately still HTTP 200: a skip is not a server error and must not burn the error
  // budget, and 204 is not available because it forbids a response body. The status is not
  // the signal here — `success:false` plus the per-task request_path above is, and
  // `ops.monitoring_disabled_with_subjects` catches the case that actually matters, a module
  // switched off while subjects are still tracked.
  if (!(await isModuleEnabled(moduleSupabaseClient(), spec.module))) {
    console.log(`⏸️ ${spec.module} disabled — skipping ${task}`);
    return json({ success: false, task, skipped: 'module_disabled', module: spec.module,
                  timestamp: new Date().toISOString() });
  }

  const base = Deno.env.get('PYTHON_BACKEND_URL') || 'https://v1api.materialshub.gr';
  try {
    const resp = await fetch(`${base}${spec.path()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
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
