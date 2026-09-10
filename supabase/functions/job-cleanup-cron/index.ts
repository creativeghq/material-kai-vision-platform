/** Job Cleanup Cron Edge Function */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isServiceRoleRequest } from '../_shared/auth.ts';

interface CleanupStats {
  backgroundJobs: number;
  scrapingSessions: number;
  dataImportJobs: number;
  jobCheckpoints: number;
  importHistory: number;
  agentCheckpoints: number;
  flowRunSteps: number;
  flowRuns: number;
  vrWorldsFailed: number;
  generation3d: number;
  jobProgress: number;
  systemLogs: number;
  aiCallLogs: number;
  searchQueryTracking: number;
  totalCleaned: number;
}

serve(withApiLogging('job-cleanup-cron', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // pg_cron calls with the platform service-role bearer; accept that (mirrors
  // agent-scheduler/flow-scheduler). Otherwise require x-cron-secret. Without
  // the service-role bypass this cron 401'd once CRON_SECRET got injected by
  // the secrets-bootstrap, so weekly job/log cleanup silently stopped running.
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET') || '';
  if (!isServiceRoleRequest(req) && (!expectedSecret || cronSecret !== expectedSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[JobCleanupCron] Starting automated job cleanup...');

    // Every table's error lands here as well as in the log. The response reads this, so a run
    // that could not clean something cannot report itself clean. (#365 AD-29)
    const failures: string[] = [];

    const stats: CleanupStats = {
      backgroundJobs: 0,
      scrapingSessions: 0,
      dataImportJobs: 0,
      jobCheckpoints: 0,
      importHistory: 0,
      agentCheckpoints: 0,
      flowRunSteps: 0,
      flowRuns: 0,
      vrWorldsFailed: 0,
      generation3d: 0,
      jobProgress: 0,
      systemLogs: 0,
      aiCallLogs: 0,
      searchQueryTracking: 0,
      totalCleaned: 0,
    };

    const fiveDaysAgo    = new Date(Date.now() -  5 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo   = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. background_jobs ──────────────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from('background_jobs')
        .delete()
        .in('status', ['completed', 'failed'])
        .or(`completed_at.lt.${fiveDaysAgo},failed_at.lt.${fiveDaysAgo}`)
        .limit(1000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] background_jobs error:', error);
        failures.push(`background_jobs: ${error.message}`);
      } else stats.backgroundJobs = data?.length ?? 0;
      console.log(`[JobCleanupCron] background_jobs: ${stats.backgroundJobs} deleted`);
    }

    // `scraping_sessions` cleanup was here. The table does not exist and has no
    // successor, so the delete matched nothing on every run. (audit #270)

    // ── 3. data_import_jobs ─────────────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from('data_import_jobs')
        .delete()
        .in('status', ['completed', 'failed'])
        .eq('is_scheduled', false)
        .lt('updated_at', fiveDaysAgo)
        .limit(1000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] data_import_jobs error:', error);
        failures.push(`data_import_jobs: ${error.message}`);
      } else stats.dataImportJobs = data?.length ?? 0;
      console.log(`[JobCleanupCron] data_import_jobs: ${stats.dataImportJobs} deleted`);
    }

    // ── 4. job_checkpoints — table dropped, history now lives on
    //       background_jobs.stage_history and disappears with the job row.
    stats.jobCheckpoints = 0;

    // ── 5. data_import_history ──────────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from('data_import_history')
        .delete()
        .lt('created_at', thirtyDaysAgo)
        .limit(1000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] data_import_history error:', error);
        failures.push(`data_import_history: ${error.message}`);
      } else stats.importHistory = data?.length ?? 0;
      console.log(`[JobCleanupCron] data_import_history: ${stats.importHistory} deleted`);
    }

    // ── 6. agent_checkpoints (conversation snapshots) ───────────────────────
    {
      const { data, error } = await supabase
        .from('agent_checkpoints')
        .delete()
        .lt('updated_at', thirtyDaysAgo)
        .limit(1000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] agent_checkpoints error:', error);
        failures.push(`agent_checkpoints: ${error.message}`);
      } else stats.agentCheckpoints = data?.length ?? 0;
      console.log(`[JobCleanupCron] agent_checkpoints: ${stats.agentCheckpoints} deleted`);
    }

    // ── 7. flow_run_steps — COUNTED here, deleted by cascade below ──────────
    {
      // TWO BUGS DEEP, so both are worth keeping written down.
      const { count, error } = await supabase
        .from('flow_run_steps')
        .select('id, flow_runs!inner(status, created_at)', { count: 'exact', head: true })
        .in('flow_runs.status', ['completed', 'failed', 'cancelled'])
        .lt('flow_runs.created_at', thirtyDaysAgo);

      if (error) {
        console.error('[JobCleanupCron] flow_run_steps count error:', error);
        failures.push(`flow_run_steps: ${error.message}`);
      } else {
        stats.flowRunSteps = count ?? 0;
      }
      console.log(`[JobCleanupCron] flow_run_steps: ${stats.flowRunSteps} will cascade with their runs`);
    }

    // ── 8. flow_runs — and, by cascade, their steps ─────────────────────────
    {
      const { data, error } = await supabase
        .from('flow_runs')
        .delete()
        .in('status', ['completed', 'failed', 'cancelled'])
        .lt('created_at', thirtyDaysAgo)
        .limit(1000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] flow_runs error:', error);
        failures.push(`flow_runs: ${error.message}`);
      } else stats.flowRuns = data?.length ?? 0;
      console.log(`[JobCleanupCron] flow_runs: ${stats.flowRuns} deleted`);
    }

    // ── 9. vr_worlds (failed only) ──────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from('vr_worlds')
        .delete()
        .eq('status', 'failed')
        .lt('created_at', sevenDaysAgo)
        .limit(500)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] vr_worlds error:', error);
        failures.push(`vr_worlds: ${error.message}`);
      } else stats.vrWorldsFailed = data?.length ?? 0;
      console.log(`[JobCleanupCron] vr_worlds (failed): ${stats.vrWorldsFailed} deleted`);
    }

    // ── 10. generation_3d — unsaved renders older than 15 days ───────────────
    {
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

      /**
       * STORAGE IS NOT DELETED HERE. It used to be, and that hand-rolled block carried three
       * defects at once — all of them fixed by not having it.
       */
      const { data: deleted, error: delErr } = await supabase
        .from('generation_3d')
        .delete()
        .is('saved_to_moodboard_at', null)
        .lt('created_at', fifteenDaysAgo)
        .in('generation_status', ['completed', 'failed'])
        .limit(500)
        .select('id');

      // AD-29 applied here too: this was the one table left logging its error and returning
      // success anyway, so a generation_3d delete could fail every week and the run still
      // reported clean. Same defect the rest of this function was fixed for.
      if (delErr) {
        console.error('[JobCleanupCron] generation_3d error:', delErr);
        failures.push(`generation_3d: ${delErr.message}`);
      } else stats.generation3d = deleted?.length ?? 0;
      console.log(`[JobCleanupCron] generation_3d (unsaved >15d): ${stats.generation3d} deleted — crops reaped by storage GC`);
    }

    // ── 11. job_progress — table dropped (Phase 3c). Progress events now
    //        live as JSONB array entries on background_jobs.stage_history.
    stats.jobProgress = 0;

    // ── 12. system_logs — Python API operational logs > 30 days ─────────────
    // High-volume table (~77k rows/day). A dedicated daily pg_cron SQL job
    // (system-logs-daily-cleanup) handles the bulk; this pass cleans overflow.
    {
      const { data, error } = await supabase
        .from('system_logs')
        .delete()
        .lt('created_at', thirtyDaysAgo)
        .limit(10000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] system_logs error:', error);
        failures.push(`system_logs: ${error.message}`);
      } else stats.systemLogs = data?.length ?? 0;
      console.log(`[JobCleanupCron] system_logs: ${stats.systemLogs} deleted`);
    }

    // ── 13. ai_call_logs — per-call AI debug logs > 30 days ─────────────────
    // NOT the same as ai_usage_logs (billing). These are raw API call records
    // with request/response payloads retained for debugging only.
    {
      const { data, error } = await supabase
        .from('ai_call_logs')
        .delete()
        .lt('created_at', thirtyDaysAgo)
        .limit(5000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] ai_call_logs error:', error);
        failures.push(`ai_call_logs: ${error.message}`);
      } else stats.aiCallLogs = data?.length ?? 0;
      console.log(`[JobCleanupCron] ai_call_logs: ${stats.aiCallLogs} deleted`);
    }

    // ── 14. search_query_tracking — search analytics > 90 days ──────────────
    // Uses 'timestamp' column (not created_at).
    {
      const { data, error } = await supabase
        .from('search_query_tracking')
        .delete()
        .lt('timestamp', ninetyDaysAgo)
        .limit(2000)
        .select('id');
      if (error) {
        console.error('[JobCleanupCron] search_query_tracking error:', error);
        failures.push(`search_query_tracking: ${error.message}`);
      } else stats.searchQueryTracking = data?.length ?? 0;
      console.log(`[JobCleanupCron] search_query_tracking: ${stats.searchQueryTracking} deleted`);
    }

    stats.totalCleaned =
      stats.backgroundJobs +
      stats.scrapingSessions +
      stats.dataImportJobs +
      stats.jobCheckpoints +
      stats.importHistory +
      stats.agentCheckpoints +
      stats.flowRunSteps +
      stats.flowRuns +
      stats.vrWorldsFailed +
      stats.generation3d +
      stats.jobProgress +
      stats.systemLogs +
      stats.aiCallLogs +
      stats.searchQueryTracking;

    // A janitor that returns success after partial failure is the documented reaper shape: it
    // exits 0, the monitoring sees a clean run, and the rows it could not delete accumulate
    // forever with nobody told. Every per-table error above is collected rather than only
    // console.error'd, and the RESPONSE carries them. (#365 AD-29)
    if (failures.length > 0) {
      console.error(`[JobCleanupCron] ⚠️ Completed with ${failures.length} failure(s):`, failures);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Cleaned up ${stats.totalCleaned} old records, but ${failures.length} table(s) failed`,
          failures,
          stats,
          timestamp: new Date().toISOString(),
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[JobCleanupCron] ✅ Done. Total cleaned: ${stats.totalCleaned}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up ${stats.totalCleaned} old records`,
        stats,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[JobCleanupCron] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
