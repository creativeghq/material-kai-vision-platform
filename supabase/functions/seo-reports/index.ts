/**
 * seo-reports — build a scheduled SEO report and hand it to Flows to deliver.
 *
 * The report COMPOSES the derivations the dashboard already reads
 * (`build_website_seo_report`); it computes nothing itself. That is the whole design
 * constraint: a report is the copy that goes to a client, so it is the worse of the
 * two to have drift, and a second implementation of any figure drifts.
 *
 * A RUN is a frozen snapshot. Re-opening last month's report shows what was true
 * last month — re-deriving on read would show today's numbers under an old date,
 * which is the one thing a report must not do.
 *
 * Delivery is NOT hardcoded here. It emits `seo.report_ready` and a seeded flow
 * carries it, so an operator can retarget or silence it without a deploy.
 *
 * Actions (user JWT): run — generate one report now.
 * Action (x-cron-secret): cron-run — every report whose next_due_at has passed.
 */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const DAYS_FOR: Record<string, number> = { weekly: 7, monthly: 30, none: 30 };

/** Next due date from a cadence. `none` means manual-only and has no next date. */
function nextDue(cadence: string, from = new Date()): string | null {
  if (cadence === 'none') return null;
  const d = new Date(from);
  // Calendar months, not 30 days: a "monthly" report that walks two days earlier
  // each cycle stops being monthly, and clients notice.
  if (cadence === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7);
  return d.toISOString();
}

/**
 * One line a person can read without opening the report.
 *
 * Built only from figures whose status says they are real — a headline that quotes
 * a `collector_failed` number is exactly the confident-wrong sentence the rest of
 * this module exists to prevent, and it is the line most likely to be forwarded.
 */
function headlineOf(payload: any): string {
  const parts: string[] = [];
  const ranks = payload?.sections?.rankings;
  if (ranks?.status === 'ok' && ranks?.summary?.visibility != null) {
    parts.push(`${ranks.summary.visibility}% of tracked keywords in the top 10`);
  }
  const gsc = payload?.sections?.search_console;
  if (gsc?.status === 'ok' && gsc?.metrics?.clicks?.status === 'ok' && gsc.metrics.clicks.value != null) {
    parts.push(`${gsc.metrics.clicks.value} clicks from Google`);
  }
  const health = payload?.sections?.site_health;
  if (health?.status === 'ok' && health?.scores?.seo?.status === 'ok' && health.scores.seo.value != null) {
    parts.push(`on-page score ${Math.round(health.scores.seo.value)}`);
  }
  return parts.length ? parts.join(' · ') : 'The period is covered in the report — no headline figure was available.';
}

/** Build one report, store the run, and announce it. */
async function generate(
  supabase: any,
  report: { id: string; website_id: string; workspace_id: string; name: string; sections: string[]; cadence: string },
): Promise<{ ok: boolean; run_id?: string; error?: string }> {
  const days = DAYS_FOR[report.cadence] ?? 30;
  let payload: any = null;
  let error: string | null = null;

  try {
    const { data, error: rpcErr } = await supabase.rpc('build_website_seo_report', {
      p_website_id: report.website_id, p_sections: report.sections, p_days: days,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    payload = data;
  } catch (e) {
    error = String(e instanceof Error ? e.message : e).slice(0, 500);
  }

  // The run row is written either way. A report that FAILED to build is a fact the
  // operator needs — deleting the attempt would leave the list saying "never run",
  // which reads as nobody having asked for it.
  const { data: run, error: insErr } = await supabase.from('seo_report_runs').insert({
    report_id: report.id, website_id: report.website_id, workspace_id: report.workspace_id,
    period_start: payload?.period_start ?? null,
    period_end: payload?.period_end ?? null,
    payload, status: error ? 'failed' : 'ok', error,
  }).select('id').single();
  if (insErr) return { ok: false, error: insErr.message };

  await supabase.from('seo_reports').update({
    last_sent_at: new Date().toISOString(),
    next_due_at: nextDue(report.cadence),
    updated_at: new Date().toISOString(),
  }).eq('id', report.id);

  if (error) return { ok: false, run_id: run.id, error };

  // Never a hardcoded notification — emit and let the seeded flow deliver, so an
  // operator can retarget or silence it without a deploy.
  const domain = String(payload?.website?.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  await emitFlowEventToWorkspaceRoles(
    report.workspace_id, ['owner', 'admin'], 'seo.report_ready', (uid) => ({
      user_id: uid, workspace_id: report.workspace_id,
      website_id: report.website_id,
      domain,
      report_name: report.name,
      run_id: run.id,
      period_start: payload?.period_start ?? null,
      period_end: payload?.period_end ?? null,
      headline: headlineOf(payload),
      title: `${report.name} is ready`,
      body: headlineOf(payload),
      action_url: '/profile?tab=websites',
      type: 'info',
    }),
  );

  return { ok: true, run_id: run.id };
}

Deno.serve(withApiLogging('seo-reports', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');

  // ── Cron: every report that has come due ──
  if (action === 'cron-run') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: due } = await supabase.from('seo_reports')
      .select('id, website_id, workspace_id, name, sections, cadence')
      .eq('is_active', true).neq('cadence', 'none')
      .or(`next_due_at.is.null,next_due_at.lte.${new Date().toISOString()}`)
      .limit(50);
    let sent = 0, failed = 0;
    for (const r of due || []) {
      const out = await generate(supabase, r);
      if (out.ok) sent++; else failed++;
    }
    return json({ ok: true, sent, failed });
  }

  // ── User: generate one now ──
  // Routed EXPLICITLY. Falling through on any action value meant the published spec
  // advertised `run` while the code accepted literally anything, so a typo'd action
  // silently built and delivered a report instead of being refused.
  if (action !== 'run') {
    return json({ error: `Unknown action '${action}'. Use 'run' with a report_id.` }, 400);
  }
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const reportId = String(body?.report_id || '');
  if (!reportId) return json({ error: 'report_id required' }, 400);

  const { data: report } = await supabase.from('seo_reports')
    .select('id, website_id, workspace_id, name, sections, cadence')
    .eq('id', reportId).maybeSingle();
  if (!report) return json({ error: 'Report not found' }, 404);
  if (!(await userCanAccessWorkspace(supabase, auth.userId, report.workspace_id))) {
    return json({ error: 'Report not found' }, 404); // 404 not 403 — no id enumeration
  }
  const ent = await assertEntitled(supabase, report.workspace_id, 'seo-toolkit');
  if (!ent.ok) return ent.response;

  const out = await generate(supabase, report);
  return json(out, out.ok ? 200 : 502);
}));
