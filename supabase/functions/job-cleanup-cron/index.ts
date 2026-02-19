/**
 * Job Cleanup Cron Edge Function
 * 
 * Automatically cleans up old completed/failed jobs every 5 days
 * 
 * Cleans:
 * - background_jobs (completed/failed older than 5 days)
 * - scraping_sessions (completed/failed older than 5 days)
 * - data_import_jobs (completed/failed older than 5 days)
 * - job_checkpoints (older than 7 days)
 * - data_import_history (older than 30 days)
 * 
 * Schedule: Run via cron every 5 days
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupStats {
  backgroundJobs: number;
  scrapingSessions: number;
  dataImportJobs: number;
  jobCheckpoints: number;
  importHistory: number;
  totalCleaned: number;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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
      totalCleaned: 0,
    };

    // Calculate cutoff dates
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Clean background_jobs (completed/failed older than 5 days)
    console.log('[JobCleanupCron] Cleaning background_jobs...');
    const { data: bgJobs, error: bgError } = await supabase
      .from('background_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .or(`completed_at.lt.${fiveDaysAgo},failed_at.lt.${fiveDaysAgo}`)
      .limit(1000)
      .select('id');

    if (!bgError && bgJobs) {
      stats.backgroundJobs = bgJobs.length;
      console.log(`[JobCleanupCron] ✅ Cleaned ${bgJobs.length} background jobs`);
    } else if (bgError) {
      console.error('[JobCleanupCron] ❌ Error cleaning background_jobs:', bgError);
    }

    // 2. Clean scraping_sessions (completed/failed older than 5 days)
    console.log('[JobCleanupCron] Cleaning scraping_sessions...');
    const { data: scrapingSessions, error: scrapingError } = await supabase
      .from('scraping_sessions')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', fiveDaysAgo)
      .limit(1000)
      .select('id');

    if (!scrapingError && scrapingSessions) {
      stats.scrapingSessions = scrapingSessions.length;
      console.log(`[JobCleanupCron] ✅ Cleaned ${scrapingSessions.length} scraping sessions`);
    } else if (scrapingError) {
      console.error('[JobCleanupCron] ❌ Error cleaning scraping_sessions:', scrapingError);
    }

    // 3. Clean data_import_jobs (completed/failed older than 5 days, excluding scheduled jobs)
    console.log('[JobCleanupCron] Cleaning data_import_jobs...');
    const { data: importJobs, error: importError } = await supabase
      .from('data_import_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .eq('is_scheduled', false) // Don't delete scheduled jobs
      .lt('updated_at', fiveDaysAgo)
      .limit(1000)
      .select('id');

    if (!importError && importJobs) {
      stats.dataImportJobs = importJobs.length;
      console.log(`[JobCleanupCron] ✅ Cleaned ${importJobs.length} data import jobs`);
    } else if (importError) {
      console.error('[JobCleanupCron] ❌ Error cleaning data_import_jobs:', importError);
    }

    // 4. Clean job_checkpoints (older than 7 days)
    console.log('[JobCleanupCron] Cleaning job_checkpoints...');
    const { data: checkpoints, error: checkpointError } = await supabase
      .from('job_checkpoints')
      .delete()
      .lt('created_at', sevenDaysAgo)
      .limit(1000)
      .select('id');

    if (!checkpointError && checkpoints) {
      stats.jobCheckpoints = checkpoints.length;
      console.log(`[JobCleanupCron] ✅ Cleaned ${checkpoints.length} job checkpoints`);
    } else if (checkpointError) {
      console.error('[JobCleanupCron] ❌ Error cleaning job_checkpoints:', checkpointError);
    }

    // 5. Clean data_import_history (older than 30 days)
    console.log('[JobCleanupCron] Cleaning data_import_history...');
    const { data: importHistory, error: historyError } = await supabase
      .from('data_import_history')
      .delete()
      .lt('created_at', thirtyDaysAgo)
      .limit(1000)
      .select('id');

    if (!historyError && importHistory) {
      stats.importHistory = importHistory.length;
      console.log(`[JobCleanupCron] ✅ Cleaned ${importHistory.length} import history records`);
    } else if (historyError) {
      console.error('[JobCleanupCron] ❌ Error cleaning data_import_history:', historyError);
    }

    // Calculate total
    stats.totalCleaned = 
      stats.backgroundJobs + 
      stats.scrapingSessions + 
      stats.dataImportJobs + 
      stats.jobCheckpoints + 
      stats.importHistory;

    console.log(`[JobCleanupCron] 🎉 Cleanup complete! Total cleaned: ${stats.totalCleaned}`);

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
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

