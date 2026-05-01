-- ============================================================================
-- Audit fix #46: pg_cron schedules + auto-recovery RPCs exported to VCS
-- ============================================================================
-- These functions and cron jobs were previously defined only in the Supabase
-- Dashboard. Exporting to a versioned migration so any reviewer / new
-- environment can reproduce the production schedule without dashboard
-- access. Idempotent: safe to re-run.
--
-- Snapshot taken: 2026-05-01.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPCs (already in production — these CREATE OR REPLACE statements just pin
-- the canonical definition. Live source is `pg_get_functiondef(oid)` of the
-- proname in pg_proc.)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.append_stage_history(p_job_id uuid, p_event jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE background_jobs
  SET stage_history = (
    CASE
      WHEN jsonb_array_length(stage_history || jsonb_build_array(p_event)) > 100
      THEN (
        SELECT jsonb_agg(elem)
        FROM (
          SELECT elem
          FROM jsonb_array_elements(stage_history || jsonb_build_array(p_event)) AS elem
          OFFSET GREATEST(0, jsonb_array_length(stage_history || jsonb_build_array(p_event)) - 100)
        ) trimmed
      )
      ELSE stage_history || jsonb_build_array(p_event)
    END
  ),
  updated_at = now()
  WHERE id = p_job_id;
$function$;

COMMENT ON FUNCTION public.append_stage_history IS
  'Atomic append to background_jobs.stage_history. Caps at 100 most recent entries '
  'so pathological loops cannot grow the row unbounded. Audit fix #46 (2026-05-01) '
  'mirrored this definition into VCS — live source remains the live DB.';

CREATE OR REPLACE FUNCTION public.append_recovery_history(p_job_id uuid, p_event jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE background_jobs
  SET recovery_history = recovery_history || jsonb_build_array(p_event),
      updated_at = now()
  WHERE id = p_job_id;
$function$;

COMMENT ON FUNCTION public.append_recovery_history IS
  'Atomic append to background_jobs.recovery_history. Written by '
  'auto-recovery-cron whenever it claims a stuck job.';

CREATE OR REPLACE FUNCTION public.cleanup_invalid_stage_history(
  p_job_id uuid,
  p_invalid_stages text[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE background_jobs
  SET stage_history = COALESCE((
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(stage_history) elem
    WHERE NOT ((elem ->> 'stage') = ANY(p_invalid_stages))
  ), '[]'::jsonb),
  updated_at = now()
  WHERE id = p_job_id;
$function$;

CREATE OR REPLACE FUNCTION public.detect_stuck_pdf_jobs(
  stuck_threshold_seconds integer DEFAULT 480,
  max_attempts integer DEFAULT 3
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  workspace_id uuid,
  filename text,
  recovery_attempts integer,
  last_heartbeat timestamp with time zone,
  last_recovery_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    bj.id,
    bj.document_id,
    bj.workspace_id,
    bj.filename,
    COALESCE(bj.recovery_attempts, 0) AS recovery_attempts,
    bj.last_heartbeat,
    bj.last_recovery_at
  FROM background_jobs bj
  WHERE bj.status IN ('processing', 'interrupted')
    AND bj.job_type IN ('product_discovery_upload', 'pdf_processing')
    AND COALESCE(bj.recovery_attempts_after_genuine_failure, 0) < max_attempts
    AND (
      bj.last_heartbeat IS NULL
      OR bj.last_heartbeat < (now() - make_interval(secs => stuck_threshold_seconds))
    )
  ORDER BY bj.last_heartbeat NULLS FIRST;
$function$;

CREATE OR REPLACE FUNCTION public.fail_exhausted_pdf_jobs(
  p_max_attempts integer DEFAULT 3,
  stuck_threshold_seconds integer DEFAULT 480
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rows_affected int;
BEGIN
  UPDATE background_jobs
  SET
    status = 'failed',
    failed_at = now(),
    error = COALESCE(error, 'Auto-recovery exhausted: ' || COALESCE(recovery_attempts::text, '0') || ' attempts'),
    error_message = COALESCE(error_message, 'Auto-recovery exhausted')
  WHERE status = 'processing'
    AND job_type IN ('product_discovery_upload', 'pdf_processing')
    AND COALESCE(recovery_attempts, 0) >= p_max_attempts
    AND (
      last_heartbeat IS NULL
      OR last_heartbeat < (now() - make_interval(secs => stuck_threshold_seconds))
    );

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_pdf_job_for_recovery(
  p_job_id uuid,
  p_max_attempts integer DEFAULT 3
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rows_affected int;
  is_deploy_interrupt boolean;
BEGIN
  -- Detect deploy-interrupt by error message. The shutdown hook in
  -- main.py:431 always writes "Service restart detected" on these.
  SELECT (error = 'Service restart detected')
  INTO is_deploy_interrupt
  FROM background_jobs
  WHERE id = p_job_id;

  IF is_deploy_interrupt THEN
    -- Don't bump the genuine counter. Cap at 10 just so a runaway loop
    -- of deploy-restart-resume can't burn endpoints forever.
    UPDATE background_jobs
    SET
      recovery_attempts = COALESCE(recovery_attempts, 0) + 1,
      last_recovery_at = now(),
      status = 'pending',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_recovered_at', now(),
        'restart_from_stage', COALESCE(last_checkpoint->>'stage', 'INITIALIZED'),
        'previous_status', status,
        'recovery_kind', 'deploy_interrupt'
      )
    WHERE id = p_job_id
      AND status IN ('processing', 'interrupted')
      AND COALESCE(recovery_attempts, 0) < 10;
  ELSE
    -- Genuine failure (stuck in stage, worker crash, etc) — bump the
    -- genuine counter that's gated by p_max_attempts.
    UPDATE background_jobs
    SET
      recovery_attempts = COALESCE(recovery_attempts, 0) + 1,
      recovery_attempts_after_genuine_failure =
        COALESCE(recovery_attempts_after_genuine_failure, 0) + 1,
      last_recovery_at = now(),
      status = 'pending',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_recovered_at', now(),
        'restart_from_stage', COALESCE(last_checkpoint->>'stage', 'INITIALIZED'),
        'previous_status', status,
        'recovery_kind', 'genuine_failure'
      )
    WHERE id = p_job_id
      AND status IN ('processing', 'interrupted')
      AND COALESCE(recovery_attempts_after_genuine_failure, 0) < p_max_attempts;
  END IF;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$function$;

-- ----------------------------------------------------------------------------
-- pg_cron schedules — snapshot of cron.job rows. Re-applied with the same
-- jobname uses cron.schedule's idempotent upsert behavior (drops the existing
-- entry by name and re-inserts).
-- ----------------------------------------------------------------------------

-- agent-scheduler-cron — every minute, dispatches background_agents.
-- (Re-applied here for documentation; existing schedule is unchanged.)
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'agent-scheduler-cron';
SELECT cron.schedule(
  'agent-scheduler-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/agent-scheduler-cron',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'platform_service_role_key' LIMIT 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- auto-recovery-cron — every 5 minutes, picks up stuck jobs and re-dispatches.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'auto-recovery-cron';
SELECT cron.schedule(
  'auto-recovery-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/auto-recovery-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'platform_service_role_key' LIMIT 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- flow-scheduler-cron — every minute.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'flow-scheduler-cron';
SELECT cron.schedule(
  'flow-scheduler-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/flow-scheduler-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'platform_service_role_key' LIMIT 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- price-monitoring-refresh-hourly — :15 each hour.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'price-monitoring-refresh-hourly';
SELECT cron.schedule(
  'price-monitoring-refresh-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/price-monitoring-cron',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'platform_service_role_key' LIMIT 1),
      'x-cron-secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'price_monitoring_cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
