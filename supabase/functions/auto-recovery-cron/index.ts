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
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

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
  await bootstrapForFunction();
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[AutoRecoveryCron] Starting stuck job detection...');

    // Audit fix (this PR): sweep terminally-exhausted PDF jobs first.
    // detect_stuck_pdf_jobs filters on recovery_attempts_after_genuine_failure
    // < max_attempts, so a row that has already burned its 3-attempt budget
    // is invisible to the recovery loop AND invisible to a future cron tick —
    // it just sits at status='processing' forever. fail_exhausted_pdf_jobs
    // RPC handles exactly this case: status='processing' AND attempts >= cap
    // AND heartbeat stale. Was previously defined but never invoked.
    let exhaustedFailed = 0;
    try {
      const { data: failedCount, error: failExhaustedErr } = await supabase.rpc(
        'fail_exhausted_pdf_jobs',
        { p_max_attempts: 3, stuck_threshold_seconds: 480 }
      );
      if (failExhaustedErr) {
        console.warn('[AutoRecoveryCron] fail_exhausted_pdf_jobs RPC error:', failExhaustedErr);
      } else {
        exhaustedFailed = Number(failedCount) || 0;
        if (exhaustedFailed > 0) {
          console.log(`[AutoRecoveryCron] Terminally failed ${exhaustedFailed} exhausted PDF job(s)`);
          // Cost watchdog: any time we terminally fail PDF jobs, ensure HF
          // endpoints aren't left running. Idempotent — safe to call even
          // when no other jobs are active.
          await scaleAllHfEndpointsToZero(`fail_exhausted_pdf_jobs cleared ${exhaustedFailed} job(s)`);
        }
      }
    } catch (e) {
      console.warn('[AutoRecoveryCron] fail_exhausted_pdf_jobs threw:', e);
    }

    // Detect stuck jobs
    const stuckJobs = await detectAllStuckJobs(supabase);
    console.log(`[AutoRecoveryCron] Found ${stuckJobs.length} stuck jobs`);

    if (stuckJobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stuck jobs found',
          exhausted_failed: exhaustedFailed,
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
      exhausted_failed: exhaustedFailed,
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
    const isAgentRun = Boolean(job.metadata?._is_agent_run);
    if (isAgentRun) {
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
      // Audit fix (this PR): every recover* function now bumps recovery_attempts
      // itself (PDF via mark_pdf_job_for_recovery RPC, agent via inline UPDATE,
      // scraping/xml via the same UPDATE that flips status). Throwing here used
      // to fall into the catch and call incrementRecoveryAttempts, double-bumping
      // the counter and burning the budget twice as fast. Return false directly
      // instead so we don't double-debit.
      return {
        jobId: job.id,
        type: job.type,
        success: false,
        error: 'Recovery failed (counter already debited by recover function)',
      };
    }
  } catch (error: any) {
    // Genuine exception (network error, supabase down, unexpected throw inside
    // a recover function before its own bump fired). In that case the recover
    // function may NOT have bumped the counter, so falling back to
    // incrementRecoveryAttempts is correct as a safety net. Note: this still
    // double-bumps if the exception fires AFTER the counter was bumped — log
    // the path so we can audit it later.
    console.error(`[AutoRecoveryCron] ❌ Failed to recover ${job.type} job ${job.id}:`, error);
    try {
      await incrementRecoveryAttempts(supabase, job);
    } catch (incErr) {
      console.warn(`[AutoRecoveryCron] incrementRecoveryAttempts also failed for ${job.id}:`, incErr);
    }
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
  const nowIso = new Date().toISOString();

  if (!job.canRecover) {
    // Audit fix (this PR): set completed_at on terminal failure so observers
    // can sort/filter agent_runs by completion time. Without this, exhausted
    // runs sat at completed_at=NULL and the dashboard showed them as
    // perpetually "in progress" by completion_at sort.
    await supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        error_message: 'Timed out: max recovery attempts exceeded',
        completed_at: nowIso,
      })
      .eq('id', job.id);
    return true; // "success" = we handled it
  }

  // Reset to pending so runner can re-dispatch it.
  // Idempotent guard via .eq('status', 'processing') — if another cron tick
  // already claimed this run, we don't double-flip and double-dispatch.
  const { data: claimed, error } = await supabase
    .from('agent_runs')
    .update({
      status:             'pending',
      last_heartbeat:     nowIso,
      last_recovery_at:   nowIso,
      recovery_attempts:  (job.recoveryAttempts || 0) + 1,
    })
    .eq('id', job.id)
    .eq('status', 'processing')
    .select('id');

  if (error) return false;
  if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) {
    console.log(`[AutoRecoveryCron] Agent run ${job.id}: claim no-op (already recovered or wrong status)`);
    return false;
  }

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

  let dispatchOk = false;
  if (res && res.ok) {
    dispatchOk = true;
  } else if (res && !res.ok) {
    const body = await res.text().catch(() => '(no body)');
    console.error(`[AutoRecoveryCron] Runner returned HTTP ${res.status}: ${body}`);
  }

  // Audit fix (this PR): on dispatch failure, revert status from 'pending'
  // back to 'processing' so detectStuckAgentRuns picks it up next tick.
  // Previously we returned true unconditionally, leaving the run as a
  // 'pending' zombie that no future cron tick would re-detect (the agent
  // runner only picks up runs it was directly invoked for).
  if (!dispatchOk) {
    try {
      await supabase
        .from('agent_runs')
        .update({
          status: 'processing',
          last_heartbeat: nowIso,
          updated_at: nowIso,
        })
        .eq('id', job.id)
        .eq('status', 'pending');
      console.log(`[AutoRecoveryCron] Reverted agent run ${job.id} pending→processing after dispatch failure`);
    } catch (e) {
      console.warn(`[AutoRecoveryCron] Failed to revert agent run ${job.id} status:`, e);
    }
    return false;
  }

  return true;
}

async function recoverPdfJob(supabase: any, job: StuckJob): Promise<boolean> {
  // Audit fix #45: read last_checkpoint directly when metadata.last_checkpoint_stage
  // is missing. Without this, every recovery_history row had from_stage:null because
  // the metadata field is a recently-added denormalization that older jobs lack.
  // Resolve BEFORE the claim so we capture the pre-recovery state even if the claim
  // races with another writer.
  const resolvedFromStage = await resolveLastCheckpointStage(supabase, job);

  // Atomic claim via mark_pdf_job_for_recovery — guards against two cron
  // ticks both flipping the same job to 'pending'. Returns true only if
  // status was still 'processing'/'interrupted' when the update ran AND
  // the genuine-failure budget hasn't been exhausted.
  const { data, error } = await supabase.rpc('mark_pdf_job_for_recovery', {
    p_job_id: job.id,
    p_max_attempts: 3,
  });
  if (error) {
    console.error(`[AutoRecoveryCron] mark_pdf_job_for_recovery failed for ${job.id}:`, error);
    return false;
  }

  // If the claim was a no-op (job already taken / budget exhausted / wrong status),
  // do NOT proceed to dispatch — that would launch a duplicate orchestrator on
  // a job another path already owns. Return false so the cron logs it and moves on.
  if (!data) {
    console.log(`[AutoRecoveryCron] PDF job ${job.id}: claim no-op (already recovered, exhausted, or wrong status)`);
    return false;
  }

  // Audit fix #20: actively re-dispatch the PDF job to MIVAA. Previously the
  // RPC just flipped status='pending' and we relied on the orchestrator
  // restart hook to pick it up — which only fires on full service restart.
  // Now we POST to MIVAA's /api/rag/documents/job/{job_id}/resume so recovery
  // is immediate. If the POST fails we MUST NOT leave the row at 'pending'
  // forever — detect_stuck_pdf_jobs filters on status IN ('processing',
  // 'interrupted'), so a 'pending' row with no orchestrator becomes a zombie
  // that no future cron tick reclaims. Audit fix (this PR): on dispatch
  // failure we revert status back to 'interrupted' so the next cron tick can
  // re-attempt. The recovery_attempts counter stays bumped (already debited
  // by the SQL RPC) so a persistently-failing MIVAA still hits the cap.
  const mivaaBaseUrl = Deno.env.get('MIVAA_BASE_URL') || 'https://v1api.materialshub.gr';
  const cronSecret = () => Deno.env.get('CRON_SECRET') || '';
  let dispatchOk = false;
  let dispatchStatus: number | null = null;
  let dispatchError: string | null = null;
  try {
    // Real MIVAA endpoint is POST /api/rag/documents/job/{job_id}/resume
    // (verified 2026-05-01 against rag_routes.py:1520). No auth header
    // required — the endpoint is open. cron-secret kept for future-proofing.
    const resp = await fetch(`${mivaaBaseUrl}/api/rag/documents/job/${job.id}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret(),
      },
      body: JSON.stringify({ trigger: 'auto_recovery_cron' }),
      signal: AbortSignal.timeout(10_000),
    });
    dispatchOk = resp.ok;
    dispatchStatus = resp.status;
    if (!resp.ok) {
      console.warn(`[AutoRecoveryCron] MIVAA resume POST returned ${resp.status} for ${job.id}`);
    }
  } catch (e: any) {
    dispatchError = e?.message || String(e);
    console.warn(`[AutoRecoveryCron] MIVAA resume POST failed for ${job.id}:`, e);
  }

  // Phase 1 shadow-write: log the recovery attempt to background_jobs.recovery_history.
  // Audit fix (this PR): write history BEFORE the status revert so observers never
  // see a row whose status changed without an audit-log entry to explain why.
  // Also: when dispatch failed, revert status so the next cron tick can re-attempt
  // (status=pending is invisible to detect_stuck_pdf_jobs).
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
        dispatch_status: dispatchStatus,
        dispatch_error: dispatchError,
      },
    });
  } catch (e) {
    console.warn(`[AutoRecoveryCron] append_recovery_history failed for ${job.id}:`, e);
  }

  if (!dispatchOk) {
    // Revert status from 'pending' back to 'interrupted' so the next cron
    // tick re-detects this job. Without this, MIVAA being briefly 5xx
    // (deploy in progress, transient network) silently kills the job.
    try {
      await supabase
        .from('background_jobs')
        .update({
          status: 'interrupted',
          interrupted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'pending'); // only revert if still pending — don't stomp on a winning resume
      console.log(`[AutoRecoveryCron] Reverted ${job.id} pending→interrupted after dispatch failure`);
    } catch (e) {
      console.warn(`[AutoRecoveryCron] Failed to revert ${job.id} status after dispatch failure:`, e);
    }
    return false;
  }

  return true;
}

/**
 * Resolve the last checkpoint stage for a job, falling back to a direct
 * background_jobs.last_checkpoint read when the cron's denormalized
 * metadata field is empty. Returns null if neither path yields a stage.
 *
 * Centralized so markAsFailed and recoverPdfJob produce consistent
 * recovery_history.from_stage values.
 */
async function resolveLastCheckpointStage(supabase: any, job: StuckJob): Promise<string | null> {
  if (job.metadata?.last_checkpoint_stage) {
    return job.metadata.last_checkpoint_stage;
  }
  try {
    const { data: checkpointRow } = await supabase
      .from('background_jobs')
      .select('last_checkpoint')
      .eq('id', job.id)
      .single();
    const lastCheckpoint = checkpointRow?.last_checkpoint;
    if (lastCheckpoint && typeof lastCheckpoint === 'object') {
      return (lastCheckpoint as any).stage || null;
    }
  } catch {
    // best-effort
  }
  return null;
}

async function recoverScrapingJob(supabase: any, job: StuckJob): Promise<boolean> {
  // Audit fix (this PR): bump recovery_attempts + last_recovery_at on the
  // SAME UPDATE that flips status. Previously the success path skipped the
  // bump (incrementRecoveryAttempts is called only on the catch branch in
  // recoverJob), so a flapping scraping session could be "recovered"
  // indefinitely without ever hitting the 3-attempt cap.
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('scraping_sessions')
    .update({
      status: 'pending',
      last_heartbeat_at: nowIso,
      recovery_attempts: (job.recoveryAttempts || 0) + 1,
      last_recovery_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', job.id)
    .eq('status', 'processing'); // idempotent guard — don't double-flip if another tick already claimed
  return !error;
}

async function recoverXmlJob(supabase: any, job: StuckJob): Promise<boolean> {
  // Audit fix (this PR): same recovery_attempts bump rationale as recoverScrapingJob.
  // Also: the 'progress: 0' reset is preserved but should be revisited — XML import
  // doesn't have a checkpoint-resume mechanism, so a stuck job restarts from scratch.
  // That's intentional for now (XML jobs are short-lived); flag for a future audit.
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('background_jobs')
    .update({
      status: 'pending',
      progress: 0,
      last_heartbeat: nowIso,
      recovery_attempts: (job.recoveryAttempts || 0) + 1,
      last_recovery_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', job.id)
    .eq('status', 'processing'); // idempotent guard
  return !error;
}

async function incrementRecoveryAttempts(supabase: any, job: StuckJob): Promise<void> {
  // Audit fix (this PR): agent runs live in the agent_runs table, not background_jobs.
  // Previously this function targeted background_jobs unconditionally, so an agent run
  // exception path here matched 0 rows and silently dropped the increment.
  let table: string;
  if (job.metadata?._is_agent_run) {
    table = 'agent_runs';
  } else if (job.type === 'web_scraping') {
    table = 'scraping_sessions';
  } else {
    table = 'background_jobs';
  }
  await supabase
    .from(table)
    .update({ recovery_attempts: job.recoveryAttempts + 1, last_recovery_at: new Date().toISOString() })
    .eq('id', job.id);
}

async function markAsFailed(supabase: any, job: StuckJob): Promise<void> {
  // Audit fix (this PR): pick the correct table per job type. Agent runs live
  // in agent_runs (not background_jobs), so previously markAsFailed was writing
  // status='failed' to background_jobs with id=agent_run_id (0 rows matched —
  // the agent run stayed at 'processing' forever).
  let table: string;
  if (job.metadata?._is_agent_run) {
    table = 'agent_runs';
  } else if (job.type === 'web_scraping') {
    table = 'scraping_sessions';
  } else {
    table = 'background_jobs';
  }
  const errorMessage = `Job stuck for ${job.stuckDuration} minutes. Max recovery attempts (3) exceeded.`;
  const nowIso = new Date().toISOString();

  // Audit fix (this PR): write the exhaustion event to recovery_history BEFORE
  // flipping status='failed'. Previous ordering had a window where observers
  // could see status='failed' with no recovery_history entry to explain why,
  // and the PipelineErrorsPanel summary chip would render an empty "Recovery
  // (N/N ok)" stub. Same anti-pattern as the post-2026-05-01 audit principle
  // ("explicit failure markers, not empty returns").
  // Note: append_recovery_history writes to background_jobs.recovery_history,
  // so it only makes sense for non-agent_run / non-scraping jobs.
  if (table === 'background_jobs') {
    const resolvedFromStage = await resolveLastCheckpointStage(supabase, job);
    try {
      await supabase.rpc('append_recovery_history', {
        p_job_id: job.id,
        p_event: {
          attempted_at: nowIso,
          from_stage: resolvedFromStage,
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
  }

  // Audit fix (this PR): mirror the SQL fail_exhausted_pdf_jobs RPC and write
  // BOTH `error` and `error_message` plus `failed_at`, so consumers reading
  // either field see a populated value. Previously we set only `error`,
  // leaving `error_message` and `failed_at` NULL.
  const updatePayload: Record<string, any> = {
    status: 'failed',
    updated_at: nowIso,
  };
  if (table === 'background_jobs') {
    updatePayload.error = errorMessage;
    updatePayload.error_message = errorMessage;
    updatePayload.failed_at = nowIso;
    // Audit fix (this PR): clear current_slow_operation on terminal failure
    // so a future job re-using this row's id (or admin retry) doesn't read
    // a stale slow-op marker and cause cron to skip it indefinitely.
    updatePayload.current_slow_operation = null;
  } else if (table === 'agent_runs') {
    // agent_runs schema uses error_message (not error). completed_at is the
    // canonical "stopped at" timestamp.
    updatePayload.error_message = errorMessage;
    updatePayload.completed_at = nowIso;
  } else {
    // scraping_sessions
    updatePayload.error = errorMessage;
  }
  await supabase
    .from(table)
    .update(updatePayload)
    .eq('id', job.id);

  if (table === 'background_jobs' && job.type === 'pdf_processing') {
    // P0-1 cost watchdog: when we give up on a PDF job, force-scale every HF
    // endpoint to zero so we don't keep paying for replicas the dead worker
    // never cleaned up.
    await scaleAllHfEndpointsToZero(`exhausted job ${job.id}`);
  }
}

async function scaleAllHfEndpointsToZero(reason: string): Promise<void> {
  const hfToken = Deno.env.get('HUGGINGFACE_API_KEY') || Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
  const namespace = Deno.env.get('HF_NAMESPACE') || 'basiliskan';
  if (!hfToken) {
    console.warn('[AutoRecoveryCron] HF token not configured — cannot scale endpoints to zero');
    return;
  }
  // Qwen endpoint retired 2026-05-01 (all vision now Claude). The PUT used to
  // 404 silently every recovery sweep. Removed from the list.
  const endpoints = ['mh-slig', 'mh-yolo', 'mh-chandra'];
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

