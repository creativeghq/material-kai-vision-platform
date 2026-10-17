/** Scheduled Import Runner — runs due scheduled XML feeds through xml-import-orchestrator. */

import { serve } from 'http/server.ts';
import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { readCapped } from '../_shared/fetch-image.ts';
import { InvalidCronError, nextCronRun } from './cron.ts';

/** Ceiling on a supplier XML feed. The largest real one seen is ~12 MB. */
const MAX_FEED_BYTES = 64 * 1024 * 1024;

interface ScheduledJob {
  id: string;
  workspace_id: string;
  category: string;
  source_name: string;
  source_url: string;
  cron_schedule: string;
  next_run_at: string;
  parent_job_id: string | null;
  field_mappings: Record<string, string> | null;
  manual_values: Record<string, string> | null;
  mapping_template_id: string | null;
  metadata: Record<string, unknown> | null;
}

/** Raw bytes → base64, chunked. `btoa` over decoded text throws on anything outside Latin-1. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

type Db = DbClient;

async function recordAttempt(db: Db, jobId: string, attempt: Record<string, unknown>): Promise<void> {
  const { error } = await db.rpc('merge_import_job_metadata', {
    p_job_id: jobId,
    p_metadata: { schedule_last_attempt: { at: new Date().toISOString(), ...attempt } },
  });
  if (error) console.error(`Could not record schedule attempt on ${jobId}: ${error.message}`);
}

/**
 * Claim one due run: move next_run_at forward only if nobody else already did. A lost race
 * returns false and the run is skipped — that is what keeps one tick from dispatching twice.
 */
async function claimRun(db: Db, job: ScheduledJob, nowIso: string): Promise<{ claimed: boolean; nextRunAt: string | null; cronError?: string }> {
  let nextRunAt: string | null;
  let cronError: string | undefined;
  try {
    nextRunAt = nextCronRun(job.cron_schedule, new Date()).toISOString();
  } catch (e) {
    if (!(e instanceof InvalidCronError)) throw e;
    nextRunAt = null;
    cronError = e.message;
  }
  const { data, error } = await db
    .from('data_import_jobs')
    .update({ next_run_at: nextRunAt, last_run_at: nowIso })
    .eq('id', job.id)
    .eq('is_scheduled', true)
    .eq('next_run_at', job.next_run_at)
    .select('id');
  if (error) throw new Error(`Claim failed for ${job.id}: ${error.message}`);
  return { claimed: Array.isArray(data) && data.length === 1, nextRunAt, cronError };
}

serve(withApiLogging('scheduled-import-runner', async (req) => {
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
    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const now = new Date().toISOString();
    const { data: scheduledJobs, error: fetchError } = await db
      .from('data_import_jobs')
      .select('id, workspace_id, category, source_name, source_url, cron_schedule, next_run_at, parent_job_id, field_mappings, manual_values, mapping_template_id, metadata')
      .eq('is_scheduled', true)
      .not('next_run_at', 'is', null)
      .lte('next_run_at', now)
      .in('status', ['completed', 'failed']);
    if (fetchError) throw new Error(`Failed to fetch scheduled jobs: ${fetchError.message}`);

    const results: Array<Record<string, unknown>> = [];
    for (const job of (scheduledJobs ?? []) as ScheduledJob[]) {
      let claim: Awaited<ReturnType<typeof claimRun>>;
      try {
        claim = await claimRun(db, job, now);
      } catch (e: any) {
        results.push({ job_id: job.id, status: 'error', error: e?.message ?? String(e) });
        continue;
      }
      if (!claim.claimed) {
        results.push({ job_id: job.id, status: 'skipped', reason: 'claimed by another run' });
        continue;
      }
      if (claim.cronError) {
        await recordAttempt(db, job.id, { status: 'invalid_schedule', error: claim.cronError });
        results.push({ job_id: job.id, status: 'error', error: claim.cronError });
        continue;
      }

      try {
        // A stored URL is user-influenced: SSRF guard, no redirects, bounded read (invariant 7).
        const safeSourceUrl = await assertSafeUrl(job.source_url, { allowSchemes: ['https:', 'http:'] });
        const fetchController = new AbortController();
        const fetchTimeout = setTimeout(() => fetchController.abort(), 30_000);
        const xmlResponse = await fetch(safeSourceUrl, {
          signal: fetchController.signal,
          redirect: 'error',
        }).finally(() => clearTimeout(fetchTimeout));
        if (!xmlResponse.ok) {
          throw new Error(`Feed fetch failed: HTTP ${xmlResponse.status} ${xmlResponse.statusText}`);
        }
        const xmlBytes = await readCapped(xmlResponse, MAX_FEED_BYTES);

        const { data: importResult, error: importError } = await db.functions.invoke(
          'xml-import-orchestrator',
          {
            body: {
              workspace_id: job.workspace_id,
              category: job.category,
              xml_content: bytesToBase64(xmlBytes),
              source_name: `${job.source_name} (Scheduled)`,
              source_url: job.source_url,
              field_mappings: job.field_mappings,
              manual_values: job.manual_values ?? undefined,
              mapping_template_id: job.mapping_template_id,
              row_path: (job.metadata as { row_path?: string } | null)?.row_path ?? undefined,
              parent_job_id: job.parent_job_id ?? job.id,
            },
          },
        );
        if (importError) {
          let detail = importError.message;
          try {
            const ctx = (importError as { context?: Response }).context;
            if (ctx) detail = `${detail}: ${await ctx.text()}`;
          } catch { /* the status line is still recorded */ }
          throw new Error(`Import failed: ${detail}`);
        }
        const newJobId = (importResult as { job_id?: string } | null)?.job_id ?? null;
        await recordAttempt(db, job.id, { status: 'dispatched', child_job_id: newJobId, bytes: xmlBytes.length });
        results.push({ job_id: job.id, status: 'success', new_job_id: newJobId, next_run_at: claim.nextRunAt });
      } catch (error: any) {
        const message = error?.message ?? String(error);
        console.error(`Error processing scheduled job ${job.id}:`, message);
        await recordAttempt(db, job.id, { status: 'failed', error: message.slice(0, 2000) });
        results.push({ job_id: job.id, status: 'error', error: message });
      }
    }

    const failed = results.filter((r) => r.status === 'error').length;
    return new Response(
      JSON.stringify({ success: failed === 0, jobs_due: scheduledJobs?.length ?? 0, failed, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error: any) {
    console.error('Scheduled import runner error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
}));
