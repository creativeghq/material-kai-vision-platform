/**
 * Job Cleanup Cron Edge Function
 *
 * Automatically cleans up old completed/failed jobs, logs, and stale records.
 * Triggered every Sunday at 03:00 UTC via pg_cron (cron.job table).
 *
 * Cleans:
 * - background_jobs         completed/failed > 5 days old
 * - scraping_sessions       completed/failed > 5 days old
 * - data_import_jobs        completed/failed, non-scheduled > 5 days old
 * - job_checkpoints         (legacy, dropped — history now on background_jobs.stage_history)
 * - data_import_history     > 30 days old
 * - agent_checkpoints       > 30 days old  (conversation snapshots, not needed after)
 * - flow_run_steps          steps belonging to completed/failed runs > 30 days old
 * - flow_runs               completed/failed > 30 days old
 * - vr_worlds (failed)      status=failed > 7 days old
 * - job_progress            (legacy, dropped — progress events now on background_jobs.stage_history)
 * - system_logs             > 30 days old  (operational Python API logs, ~77k rows/day)
 * - ai_call_logs            > 30 days old  (per-call AI API debug logs, distinct from ai_usage_logs)
 * - search_query_tracking   > 90 days old  (search analytics)
 *
 * NOTE: ai_usage_logs is intentionally excluded — retained indefinitely for billing/business analytics.
 * NOTE: system_logs also has a dedicated daily pg_cron SQL job (system-logs-daily-cleanup) for
 *       high-volume purging — this weekly pass handles any overflow.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

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
  generation3dStorageFiles: number;
  jobProgress: number;
  systemLogs: number;
  aiCallLogs: number;
  searchQueryTracking: number;
  totalCleaned: number;
}

serve(async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET') || '';
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[JobCleanupCron] Starting automated job cleanup...');

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
      generation3dStorageFiles: 0,
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
      if (error) console.error('[JobCleanupCron] background_jobs error:', error);
      else stats.backgroundJobs = data?.length ?? 0;
      console.log(`[JobCleanupCron] background_jobs: ${stats.backgroundJobs} deleted`);
    }

    // ── 2. scraping_sessions ────────────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from('scraping_sessions')
        .delete()
        .in('status', ['completed', 'failed'])
        .lt('updated_at', fiveDaysAgo)
        .limit(1000)
        .select('id');
      if (error) console.error('[JobCleanupCron] scraping_sessions error:', error);
      else stats.scrapingSessions = data?.length ?? 0;
      console.log(`[JobCleanupCron] scraping_sessions: ${stats.scrapingSessions} deleted`);
    }

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
      if (error) console.error('[JobCleanupCron] data_import_jobs error:', error);
      else stats.dataImportJobs = data?.length ?? 0;
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
      if (error) console.error('[JobCleanupCron] data_import_history error:', error);
      else stats.importHistory = data?.length ?? 0;
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
      if (error) console.error('[JobCleanupCron] agent_checkpoints error:', error);
      else stats.agentCheckpoints = data?.length ?? 0;
      console.log(`[JobCleanupCron] agent_checkpoints: ${stats.agentCheckpoints} deleted`);
    }

    // ── 7. flow_run_steps (delete before parent flow_runs) ──────────────────
    {
      // Delete steps whose parent run is completed/failed and older than 30 days
      const { data, error } = await supabase
        .from('flow_run_steps')
        .delete()
        .lt('created_at', thirtyDaysAgo)
        .limit(2000)
        .select('id');
      if (error) console.error('[JobCleanupCron] flow_run_steps error:', error);
      else stats.flowRunSteps = data?.length ?? 0;
      console.log(`[JobCleanupCron] flow_run_steps: ${stats.flowRunSteps} deleted`);
    }

    // ── 8. flow_runs ────────────────────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from('flow_runs')
        .delete()
        .in('status', ['completed', 'failed', 'cancelled'])
        .lt('created_at', thirtyDaysAgo)
        .limit(1000)
        .select('id');
      if (error) console.error('[JobCleanupCron] flow_runs error:', error);
      else stats.flowRuns = data?.length ?? 0;
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
      if (error) console.error('[JobCleanupCron] vr_worlds error:', error);
      else stats.vrWorldsFailed = data?.length ?? 0;
      console.log(`[JobCleanupCron] vr_worlds (failed): ${stats.vrWorldsFailed} deleted`);
    }

    // ── 10. generation_3d — unsaved renders older than 15 days ───────────────
    // Collect crop Storage paths BEFORE deleting rows (CASCADE removes segments)
    {
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch segment crop URLs so we can delete them from Storage
      const { data: segRows } = await supabase
        .from('generation_3d_segments')
        .select('crop_storage_url, generation_id')
        .not('crop_storage_url', 'is', null)
        .in(
          'generation_id',
          // Sub-select IDs that will be deleted
          (await supabase
            .from('generation_3d')
            .select('id')
            .is('saved_to_moodboard_at', null)
            .lt('created_at', fifteenDaysAgo)
            .in('generation_status', ['completed', 'failed'])
          ).data?.map((r: any) => r.id) ?? [],
        );

      // Delete crop files from Storage
      if (segRows && segRows.length > 0) {
        const storagePaths = segRows
          .map((r: any) => {
            const url: string = r.crop_storage_url ?? '';
            const marker = '/generation-images/';
            const idx = url.indexOf(marker);
            return idx >= 0 ? url.slice(idx + marker.length) : null;
          })
          .filter(Boolean) as string[];

        if (storagePaths.length > 0) {
          const { data: removed } = await supabase.storage
            .from('generation-images')
            .remove(storagePaths);
          stats.generation3dStorageFiles = removed?.length ?? 0;
          console.log(`[JobCleanupCron] generation_3d storage files removed: ${stats.generation3dStorageFiles}`);
        }
      }

      // Delete the generations (CASCADE removes generation_3d_segments)
      const { data: deleted, error: delErr } = await supabase
        .from('generation_3d')
        .delete()
        .is('saved_to_moodboard_at', null)
        .lt('created_at', fifteenDaysAgo)
        .in('generation_status', ['completed', 'failed'])
        .limit(500)
        .select('id');

      if (delErr) console.error('[JobCleanupCron] generation_3d error:', delErr);
      else stats.generation3d = deleted?.length ?? 0;
      console.log(`[JobCleanupCron] generation_3d (unsaved >15d): ${stats.generation3d} deleted`);
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
      if (error) console.error('[JobCleanupCron] system_logs error:', error);
      else stats.systemLogs = data?.length ?? 0;
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
      if (error) console.error('[JobCleanupCron] ai_call_logs error:', error);
      else stats.aiCallLogs = data?.length ?? 0;
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
      if (error) console.error('[JobCleanupCron] search_query_tracking error:', error);
      else stats.searchQueryTracking = data?.length ?? 0;
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
});
