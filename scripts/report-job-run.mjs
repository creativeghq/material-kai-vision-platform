/**
 * Report that a job which runs OUTSIDE Postgres ran, and how it went.
 *
 * CronJobsPanel reads cron.job_run_details and structurally cannot see a GitHub Actions
 * schedule, so without this row a disabled or silently-skipped workflow looks exactly like a
 * healthy one. Read back by dic_detect__ops_external_job_stalled at /admin/data-health.
 *
 * @example node scripts/report-job-run.mjs vercel-storage-prune succeeded '{"deleted":12}'
 * @requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — the RPC is granted to service_role only.
 */

const [jobKey, status, detailRaw] = process.argv.slice(2);
const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!jobKey || !status) {
  console.error('usage: report-job-run.mjs <job_key> <succeeded|failed> [detail-json]');
  process.exit(2);
}
if (!URL_BASE || !KEY) {
  // Loud, not fatal: a missing secret must not turn a SUCCESSFUL prune into a red run. The
  // stalled probe notices the absent heartbeat within its window anyway, which is the point.
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — heartbeat NOT recorded.');
  process.exit(0);
}

let detail = {};
if (detailRaw) {
  try {
    detail = JSON.parse(detailRaw);
  } catch {
    detail = { raw: String(detailRaw).slice(0, 500) };
  }
}

const res = await fetch(`${URL_BASE}/rest/v1/rpc/record_external_job_run`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    authorization: `Bearer ${KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ p_job_key: jobKey, p_status: status, p_detail: detail }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`heartbeat NOT recorded: HTTP ${res.status} ${body.slice(0, 300)}`);
  process.exit(0);
}
console.log(`heartbeat recorded: ${jobKey} → ${status} (${body.trim()})`);
