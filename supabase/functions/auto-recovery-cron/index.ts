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
import { createClient } from '@supabase/supabase-js';
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
  // Heartbeat threshold matches MIVAA settings.job_stuck_threshold_seconds
  // (default 480s = 8 min) — tight enough to catch a dead orchestrator
  // before users notice, loose enough to not false-positive on a slow
  // Stage 0 vision call.
  const { data, error } = await supabase.rpc('detect_stuck_pdf_jobs', {
    stuck_threshold_seconds: 480,
    max_attempts: 3,
  });

  if (error) {
    console.error('[AutoRecoveryCron] Error detecting stuck PDF jobs:', error);
    return [];
  }

  // Audit fix #43: skip jobs with current_slow_operation flag set within
  // the last 2 minutes. Stages that legitimately take 5+ min (long Chandra
  // batches, SLIG embedding fan-out) set this flag so heartbeat staleness
  // doesn't trigger spurious recovery while real work is in progress.
  const candidates = data || [];
  if (candidates.length === 0) return [];

  const ids = candidates.map((j: any) => j.id);
  const { data: slowOpRows } = await supabase
    .from('background_jobs')
    .select('id, current_slow_operation')
    .in('id', ids);
  const slowOpMap = new Map<string, any>();
  for (const row of (slowOpRows || [])) {
    slowOpMap.set(row.id, row.current_slow_operation);
  }
  const filtered = candidates.filter((job: any) => {
    const slowOp = slowOpMap.get(job.id);
    if (!slowOp || !slowOp.started_at) return true;
    const age = (Date.now() - new Date(slowOp.started_at).getTime()) / 1000;
    const cap = slowOp.expected_max_seconds || 300;
    if (age <= cap + 120) {
      console.log(`[AutoRecoveryCron] Skipping ${job.id}: slow_op '${slowOp.operation}' age=${age.toFixed(0)}s within cap=${cap}+120`);
      return false;
    }
    return true;
  });

  return filtered.map((job: any) => ({
    id: job.id,
    type: 'pdf_processing' as const,
    status: 'processing',
    lastHeartbeat: job.last_heartbeat,
    stuckDuration: calculateStuckDuration(job.last_heartbeat),
    recoveryAttempts: job.recovery_attempts || 0,
    canRecover: (job.recovery_attempts || 0) < 3,
    metadata: {
      filename: job.filename,
      document_id: job.document_id,
      last_recovery_at: job.last_recovery_at,
    },
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
  // Atomic claim via mark_pdf_job_for_recovery — guards against two cron
  // ticks both flipping the same job to 'pending'. Returns true only if
  // status was still 'processing' when the update ran.
  const { data, error } = await supabase.rpc('mark_pdf_job_for_recovery', {
    p_job_id: job.id,
    p_max_attempts: 3,
  });
  if (error) {
    console.error(`[AutoRecoveryCron] mark_pdf_job_for_recovery failed for ${job.id}:`, error);
    return false;
  }

  // Audit fix #20: actively re-dispatch the PDF job to MIVAA. Previously the
  // RPC just flipped status='pending' and we relied on the orchestrator
  // restart hook to pick it up — which only fires on full service restart.
  // Now we POST to MIVAA's /api/jobs/{id}/resume so recovery is immediate.
  // Best-effort: if the POST fails, the job stays 'pending' and the next
  // service restart still rescues it (preserving the old behavior).
  let dispatchOk = false;
  if (data) {
    const mivaaBaseUrl = Deno.env.get('MIVAA_BASE_URL') || 'https://v1api.materialshub.gr';
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    try {
      // Real MIVAA endpoint is POST /api/rag/documents/job/{job_id}/resume
      // (verified 2026-05-01 against rag_routes.py:1486). No auth header
      // required — the endpoint is open. cron-secret kept for future-proofing.
      const resp = await fetch(`${mivaaBaseUrl}/api/rag/documents/job/${job.id}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({ trigger: 'auto_recovery_cron' }),
        signal: AbortSignal.timeout(10_000),
      });
      dispatchOk = resp.ok;
      if (!resp.ok) {
        console.warn(`[AutoRecoveryCron] MIVAA resume POST returned ${resp.status} for ${job.id}`);
      }
    } catch (e) {
      console.warn(`[AutoRecoveryCron] MIVAA resume POST failed for ${job.id} (best-effort, job stays pending):`, e);
    }
  }

  // Audit fix #45: read last_checkpoint directly when metadata.last_checkpoint_stage
  // is missing. Without this, every recovery_history row had from_stage:null because
  // the metadata field is a recently-added denormalization that older jobs lack.
  let resolvedFromStage = job.metadata?.last_checkpoint_stage || null;
  if (!resolvedFromStage) {
    try {
      const { data: checkpointRow } = await supabase
        .from('background_jobs')
        .select('last_checkpoint')
        .eq('id', job.id)
        .single();
      const lastCheckpoint = checkpointRow?.last_checkpoint;
      if (lastCheckpoint && typeof lastCheckpoint === 'object') {
        resolvedFromStage = lastCheckpoint.stage || null;
      }
    } catch {
      // best-effort
    }
  }

  // Phase 1 shadow-write: log the recovery attempt to background_jobs.recovery_history.
  // Phase 2 readers will surface this in the consolidated /full-status payload.
  try {
    await supabase.rpc('append_recovery_history', {
      p_job_id: job.id,
      p_event: {
        attempted_at: new Date().toISOString(),
        from_stage: resolvedFromStage,
        reason: 'heartbeat_stale',
        stuck_minutes: job.stuckDuration,
        attempt_number: (job.recoveryAttempts || 0) + 1,
        succeeded: Boolean(data),
        dispatch_ok: dispatchOk,
      },
    });
  } catch (e) {
    console.warn(`[AutoRecoveryCron] append_recovery_history failed for ${job.id}:`, e);
  }
  return Boolean(data);
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

  // Phase 1 shadow-write — record the exhaustion event so the consolidated
  // job-status view can show "auto-recovery gave up after N attempts".
  if (table === 'background_jobs') {
    try {
      await supabase.rpc('append_recovery_history', {
        p_job_id: job.id,
        p_event: {
          attempted_at: new Date().toISOString(),
          from_stage: job.metadata?.last_checkpoint_stage || null,
          reason: 'max_attempts_exceeded',
          stuck_minutes: job.stuckDuration,
          attempt_number: job.recoveryAttempts,
          succeeded: false,
          exhausted: true,
        },
      });
    } catch (e) {
      console.warn(`[AutoRecoveryCron] append_recovery_history (exhausted) failed for ${job.id}:`, e);
    }

    // P0-1 cost watchdog: when we give up on a PDF job, force-scale every HF
    // endpoint to zero so we don't keep paying for replicas the dead worker
    // never cleaned up.
    if (job.type === 'pdf_processing') {
      await scaleAllHfEndpointsToZero(`exhausted job ${job.id}`);
    }
  }
}

async function scaleAllHfEndpointsToZero(reason: string): Promise<void> {
  const hfToken = Deno.env.get('HUGGINGFACE_API_KEY') || Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
  const namespace = Deno.env.get('HF_NAMESPACE') || 'basiliskan';
  if (!hfToken) {
    console.warn('[AutoRecoveryCron] HF token not configured — cannot scale endpoints to zero');
    return;
  }
  const endpoints = ['mh-qwen332binstruct', 'mh-slig', 'mh-yolo', 'mh-chandra'];
  for (const ep of endpoints) {
    try {
      // Read current scaling config so we preserve maxReplica
      const getResp = await fetch(
        `https://api.endpoints.huggingface.cloud/v2/endpoint/${namespace}/${ep}`,
        { headers: { Authorization: `Bearer ${hfToken}` } }
      );
      if (!getResp.ok) {
        console.warn(`[AutoRecoveryCron] Could not fetch ${ep}: ${getResp.status}`);
        continue;
      }
      const cfg = await getResp.json();
      const maxRep = cfg?.compute?.scaling?.maxReplica ?? 2;
      const updResp = await fetch(
        `https://api.endpoints.huggingface.cloud/v2/endpoint/${namespace}/${ep}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${hfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            compute: {
              ...cfg.compute,
              scaling: { ...cfg.compute?.scaling, minReplica: 0, maxReplica: maxRep },
            },
          }),
        }
      );
      if (updResp.ok) {
        console.log(`[AutoRecoveryCron] ✅ Scaled ${ep} to 0 replicas (${reason})`);
      } else {
        console.warn(`[AutoRecoveryCron] ⚠️ Failed to scale ${ep}: ${updResp.status}`);
      }
    } catch (e) {
      console.warn(`[AutoRecoveryCron] Failed to scale ${ep}: ${e}`);
    }
  }
}

