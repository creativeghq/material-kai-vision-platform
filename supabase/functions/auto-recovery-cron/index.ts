/**
 * Auto-Recovery Cron Job
 *
 * Runs every 5 minutes to detect and recover stuck jobs.
 *
 * Schedule: Every 5 minutes (cron: star-slash-5 star star star star)
 *
 * Usage:
 * - Automatically triggered by Supabase Cron
 * - Can be manually triggered via POST request
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface StuckJob {
  id: string;
  type: 'pdf_processing' | 'xml_import' | 'web_scraping';
  status: string;
  lastHeartbeat: string | null;
  stuckDuration: number;
  recoveryAttempts: number;
  canRecover: boolean;
  metadata?: any;
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

    console.log('[AutoRecoveryCron] Starting stuck job detection...');

    // Detect stuck jobs
    const stuckJobs = await detectAllStuckJobs(supabase);
    console.log(`[AutoRecoveryCron] Found ${stuckJobs.length} stuck jobs`);

    if (stuckJobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stuck jobs found',
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Attempt recovery for each stuck job
    const results = await Promise.all(
      stuckJobs.map(job => recoverJob(supabase, job))
    );

    const summary = {
      timestamp: new Date().toISOString(),
      totalStuck: stuckJobs.length,
      recovered: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };

    console.log('[AutoRecoveryCron] Recovery complete:', summary);

    return new Response(
      JSON.stringify({
        success: true,
        ...summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[AutoRecoveryCron] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function detectAllStuckJobs(supabase: any): Promise<StuckJob[]> {
  const [pdfJobs, scrapingJobs, xmlJobs, agentRunJobs] = await Promise.all([
    detectStuckPdfJobs(supabase),
    detectStuckScrapingJobs(supabase),
    detectStuckXmlJobs(supabase),
    detectStuckAgentRuns(supabase),
  ]);

  return [...pdfJobs, ...scrapingJobs, ...xmlJobs, ...agentRunJobs];
}

async function detectStuckAgentRuns(supabase: any): Promise<StuckJob[]> {
  // Agent runs stuck processing with no heartbeat for >8 minutes
  const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('agent_runs')
    .select('id, agent_id, recovery_attempts, last_heartbeat, last_recovery_at, delegated_to_python')
    .eq('status', 'processing')
    .eq('delegated_to_python', false) // skip Python-delegated runs — Python manages its own heartbeat
    .lt('last_heartbeat', eightMinutesAgo)
    .limit(50);

  if (error) {
    console.error('[AutoRecoveryCron] Error detecting stuck agent runs:', error);
    return [];
  }

  return (data || []).map((run: any) => ({
    id:               run.id,
    type:             'pdf_processing' as const, // reuse type slot — recovery logic is shared
    status:           'processing',
    lastHeartbeat:    run.last_heartbeat,
    stuckDuration:    calculateStuckDuration(run.last_heartbeat),
    recoveryAttempts: run.recovery_attempts || 0,
    canRecover:       (run.recovery_attempts || 0) < 3,
    metadata:         { agent_id: run.agent_id, last_recovery_at: run.last_recovery_at, _is_agent_run: true },
  }));
}

async function detectStuckPdfJobs(supabase: any): Promise<StuckJob[]> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('status', 'processing')
    .eq('job_type', 'product_discovery_upload')
    .lt('last_heartbeat', tenMinutesAgo)
    .limit(100);

  if (error) {
    console.error('[AutoRecoveryCron] Error detecting stuck PDF jobs:', error);
    return [];
  }

  return (data || []).map((job: any) => ({
    id: job.id,
    type: 'pdf_processing' as const,
    status: job.status,
    lastHeartbeat: job.last_heartbeat,
    stuckDuration: calculateStuckDuration(job.last_heartbeat),
    recoveryAttempts: job.recovery_attempts || 0,
    canRecover: (job.recovery_attempts || 0) < 3,
    metadata: { filename: job.filename, document_id: job.document_id },
  }));
}

async function detectStuckScrapingJobs(supabase: any): Promise<StuckJob[]> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('scraping_sessions')
    .select('*')
    .eq('status', 'processing')
    .lt('last_heartbeat_at', fiveMinutesAgo)
    .limit(100);

  if (error) {
    console.error('[AutoRecoveryCron] Error detecting stuck scraping jobs:', error);
    return [];
  }

  return (data || []).map((job: any) => ({
    id: job.id,
    type: 'web_scraping' as const,
    status: job.status,
    lastHeartbeat: job.last_heartbeat_at,
    stuckDuration: calculateStuckDuration(job.last_heartbeat_at),
    recoveryAttempts: job.recovery_attempts || 0,
    canRecover: (job.recovery_attempts || 0) < 3,
    metadata: { url: job.url, background_job_id: job.background_job_id, last_recovery_at: job.last_recovery_at },
  }));
}

async function detectStuckXmlJobs(supabase: any): Promise<StuckJob[]> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('status', 'processing')
    .eq('job_type', 'xml_import')
    .lt('created_at', thirtyMinutesAgo)
    .limit(100);

  if (error) {
    console.error('[AutoRecoveryCron] Error detecting stuck XML jobs:', error);
    return [];
  }

  return (data || []).map((job: any) => ({
    id: job.id,
    type: 'xml_import' as const,
    status: job.status,
    lastHeartbeat: job.last_heartbeat || job.updated_at,
    stuckDuration: calculateStuckDuration(job.last_heartbeat || job.updated_at),
    recoveryAttempts: job.recovery_attempts || 0,
    canRecover: (job.recovery_attempts || 0) < 3,
    metadata: { filename: job.filename, last_recovery_at: job.last_recovery_at },
  }));
}

function calculateStuckDuration(lastHeartbeat: string | null): number {
  if (!lastHeartbeat) return 0;
  const diff = Date.now() - new Date(lastHeartbeat).getTime();
  return Math.floor(diff / (60 * 1000)); // minutes
}

async function recoverJob(supabase: any, job: StuckJob): Promise<any> {
  console.log(`[AutoRecoveryCron] Attempting recovery for ${job.type} job ${job.id}`);

  if (!job.canRecover) {
    console.log(`[AutoRecoveryCron] Job ${job.id} exceeded max recovery attempts (3)`);
    await markAsFailed(supabase, job);
    return { jobId: job.id, type: job.type, success: false, error: 'Max recovery attempts exceeded' };
  }

  if (!shouldAttemptRecovery(job)) {
    console.log(`[AutoRecoveryCron] Skipping job ${job.id} - backoff period not elapsed`);
    return { jobId: job.id, type: job.type, success: false, error: 'Backoff period not elapsed' };
  }

  try {
    let success = false;
    // Check if this is an agent_run stuck job (stored with _is_agent_run flag in metadata)
    if (job.metadata?._is_agent_run) {
      success = await recoverAgentRun(supabase, job);
    } else switch (job.type) {
      case 'pdf_processing':
        success = await recoverPdfJob(supabase, job);
        break;
      case 'web_scraping':
        success = await recoverScrapingJob(supabase, job);
        break;
      case 'xml_import':
        success = await recoverXmlJob(supabase, job);
        break;
    }

    if (success) {
      console.log(`[AutoRecoveryCron] ✅ Successfully recovered ${job.type} job ${job.id}`);
      // Do NOT increment recovery_attempts on success — only on failure
      return { jobId: job.id, type: job.type, success: true };
    } else {
      throw new Error('Recovery failed');
    }
  } catch (error: any) {
    console.error(`[AutoRecoveryCron] ❌ Failed to recover ${job.type} job ${job.id}:`, error);
    await incrementRecoveryAttempts(supabase, job);
    return { jobId: job.id, type: job.type, success: false, error: error.message };
  }
}

function shouldAttemptRecovery(job: StuckJob): boolean {
  if (job.recoveryAttempts === 0) return true;
  if (!job.metadata?.last_recovery_at) return true;

  const lastRecovery = new Date(job.metadata.last_recovery_at).getTime();
  const minutesSinceLastRecovery = (Date.now() - lastRecovery) / (60 * 1000);
  const backoffMinutes = [5, 15, 30][job.recoveryAttempts - 1] || 30;

  return minutesSinceLastRecovery >= backoffMinutes;
}

async function recoverAgentRun(supabase: any, job: StuckJob): Promise<boolean> {
  const supabaseUrl        = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!job.canRecover) {
    await supabase
      .from('agent_runs')
      .update({ status: 'failed', error_message: 'Timed out: max recovery attempts exceeded' })
      .eq('id', job.id);
    return true; // "success" = we handled it
  }

  // Reset to pending so runner can re-dispatch it
  const { error } = await supabase
    .from('agent_runs')
    .update({
      status:             'pending',
      last_heartbeat:     new Date().toISOString(),
      last_recovery_at:   new Date().toISOString(),
      recovery_attempts:  (job.recoveryAttempts || 0) + 1,
    })
    .eq('id', job.id);

  if (error) return false;

  // Re-dispatch to runner
  const res = await fetch(`${supabaseUrl}/functions/v1/background-agent-runner`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      agent_id:     job.metadata?.agent_id,
      run_id:       job.id,
      triggered_by: 'recovery',
    }),
  }).catch(e => { console.error('[AutoRecoveryCron] Failed to re-dispatch agent run:', e); return null; });

  if (res && !res.ok) {
    const body = await res.text().catch(() => '(no body)');
    console.error(`[AutoRecoveryCron] Runner returned HTTP ${res.status}: ${body}`);
  }

  return true;
}

async function recoverPdfJob(supabase: any, job: StuckJob): Promise<boolean> {
  const { error } = await supabase
    .from('background_jobs')
    .update({ status: 'pending', last_heartbeat: new Date().toISOString() })
    .eq('id', job.id);
  return !error;
}

async function recoverScrapingJob(supabase: any, job: StuckJob): Promise<boolean> {
  const { error } = await supabase
    .from('scraping_sessions')
    .update({ status: 'pending', last_heartbeat_at: new Date().toISOString() })
    .eq('id', job.id);
  return !error;
}

async function recoverXmlJob(supabase: any, job: StuckJob): Promise<boolean> {
  const { error } = await supabase
    .from('background_jobs')
    .update({ status: 'pending', progress: 0, last_heartbeat: new Date().toISOString() })
    .eq('id', job.id);
  return !error;
}

async function incrementRecoveryAttempts(supabase: any, job: StuckJob): Promise<void> {
  const table = job.type === 'web_scraping' ? 'scraping_sessions' : 'background_jobs';
  await supabase
    .from(table)
    .update({ recovery_attempts: job.recoveryAttempts + 1, last_recovery_at: new Date().toISOString() })
    .eq('id', job.id);
}

async function markAsFailed(supabase: any, job: StuckJob): Promise<void> {
  const table = job.type === 'web_scraping' ? 'scraping_sessions' : 'background_jobs';
  await supabase
    .from(table)
    .update({
      status: 'failed',
      error: `Job stuck for ${job.stuckDuration} minutes. Max recovery attempts (3) exceeded.`,
    })
    .eq('id', job.id);
}

