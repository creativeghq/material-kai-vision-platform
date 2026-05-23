/**
 * Storage Orphan Cleanup Cron
 *
 * Belt-and-braces companion to the AFTER DELETE triggers on every table that
 * stores a storage URL: scans buckets and deletes objects no live DB row
 * references. Catches anything that leaked before the triggers shipped, plus
 * any future regression where a new code path forgets to clean up.
 *
 * Runs nightly via pg_cron (`storage-orphan-cleanup-nightly`, 04:00 UTC,
 * after the weekly job-cleanup-cron).
 *
 * Detection happens in SQL via `find_orphan_storage_objects(bucket, grace, limit)`
 * — `storage.objects` is too large to stream over the wire.
 *
 * Buckets + grace periods (grace = "do not touch objects newer than this"):
 *
 *   pdf-documents     | 72h   (KB + catalog-source/ + catalog-output/ + quote-output/ + moodboard-output/)
 *   pdf-tiles         | 48h   (extracted/ + catalog-extracted/)
 *   generation-images | 14d   (AI outputs + product-crops/ + 3d/ + designer/ + agent/ + social/)
 *
 * Grace was bumped from 24h → 72h on pdf-documents 2026-05-23 to widen the
 * absorption window for delayed-DB-write paths (admin uploads, scheduled
 * workers that upload to storage minutes before inserting the documents row,
 * background catalog-restore from snapshot). pdf-tiles 24h → 48h for the same
 * reason since tiles are derived but the documents row may not exist when the
 * tile lands. See `verify_storage_orphans` re-check below — that's the
 * race-window fix; grace is the headroom.
 *
 * quote-templates and moodboard-sheet-references are NOT scanned — admin
 * curated, deletion is manual.
 *
 * Logs every pass to public.storage_cleanup_log.
 * Caps each bucket pass at 5000 deletes to bound blast radius.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

interface BucketStat {
  bucket: string;
  scanned: number;
  deleted: number;
  bytes_freed: number;
  /** Count of paths that became referenced between RPC snapshot and the
   * pre-delete re-verify call. These are skipped from the delete batch. */
  skipped_raced: number;
  error?: string;
}

// Post-consolidation (2026-05-23): 5 anchor buckets. The 12 absorbed buckets
// (3d-models, agent-files, catalog-*, designer-assets, moodboard-sheets,
// product-images, quote-documents) were dropped — their content lives under
// path prefixes inside the anchors. Grace seconds use the most conservative
// (longest) value across any content type folded into each anchor.
const BUCKETS: Array<{ bucket: string; grace_seconds: number }> = [
  { bucket: 'pdf-documents',     grace_seconds: 72 * 3600 },
  { bucket: 'pdf-tiles',         grace_seconds: 48 * 3600 },
  { bucket: 'generation-images', grace_seconds: 14 * 24 * 3600 },
];

const PER_BUCKET_LIMIT = 5000;
const REMOVE_CHUNK     = 100;

async function batchRemove(
  sb: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<{ removed: number; skipped_raced: number }> {
  let removed = 0;
  let skipped_raced = 0;
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const slice = paths.slice(i, i + REMOVE_CHUNK);

    // Re-verify each batch against the LIVE reference set immediately before
    // deleting. find_orphan_storage_objects returned a snapshot at time T; the
    // delete loop can run for ~30s on a full batch of 5000 paths. Any DB row
    // that referenced one of these paths in that interval would otherwise be
    // left dangling. verify_storage_orphans is a STABLE function so it sees
    // the current state of every referencing table.
    let toRemove = slice;
    try {
      const { data: stillOrphan, error: verifyErr } = await sb.rpc(
        'verify_storage_orphans',
        { p_bucket: bucket, p_paths: slice },
      );
      if (verifyErr) {
        // Fail closed: if re-verify errors, SKIP the batch rather than blindly
        // delete the snapshot list. We'd rather miss this cron tick than nuke
        // a freshly-referenced file.
        console.error(
          `[OrphanCleanup] verify(${bucket}, ${slice.length}) error — skipping batch:`,
          verifyErr,
        );
        skipped_raced += slice.length;
        continue;
      }
      const stillOrphanSet = new Set(
        (stillOrphan ?? []).map((r: { name: string }) => r.name),
      );
      toRemove = slice.filter((p) => stillOrphanSet.has(p));
      const dropped = slice.length - toRemove.length;
      if (dropped > 0) {
        skipped_raced += dropped;
        console.log(
          `[OrphanCleanup] race-protected: ${dropped}/${slice.length} paths in ${bucket} ` +
            `gained a DB ref between snapshot and delete — skipping those`,
        );
      }
      if (toRemove.length === 0) {
        continue;
      }
    } catch (e) {
      console.error(`[OrphanCleanup] verify(${bucket}) threw — skipping batch:`, e);
      skipped_raced += slice.length;
      continue;
    }

    const { data, error } = await sb.storage.from(bucket).remove(toRemove);
    if (error) {
      console.error(`[OrphanCleanup] remove(${bucket}, ${toRemove.length}) error:`, error);
      continue;
    }
    removed += data?.length ?? toRemove.length;
  }
  return { removed, skipped_raced };
}

async function logRun(
  sb: SupabaseClient,
  source: string,
  bucket: string,
  scanned: number,
  deleted: number,
  bytes_freed: number,
  details: Record<string, unknown> = {},
  error?: string,
) {
  try {
    await sb.from('storage_cleanup_log').insert({
      source,
      bucket,
      scanned,
      deleted,
      bytes_freed,
      details,
      error: error ?? null,
    });
  } catch (e) {
    console.error('[OrphanCleanup] logRun failed:', e);
  }
}

async function cleanBucket(
  sb: SupabaseClient,
  source: string,
  bucket: string,
  graceSeconds: number,
): Promise<BucketStat> {
  const stat: BucketStat = { bucket, scanned: 0, deleted: 0, bytes_freed: 0, skipped_raced: 0 };

  try {
    const { data: orphans, error } = await sb.rpc('find_orphan_storage_objects', {
      p_bucket: bucket,
      p_grace_seconds: graceSeconds,
      p_limit: PER_BUCKET_LIMIT,
    });

    if (error) {
      stat.error = error.message;
      console.error(`[OrphanCleanup] rpc(${bucket}) error:`, error);
      await logRun(sb, source, bucket, 0, 0, 0, { grace_seconds: graceSeconds }, stat.error);
      return stat;
    }

    const list: Array<{ name: string; size_bytes: number; created_at: string }> = orphans ?? [];
    stat.scanned = list.length;

    if (list.length === 0) {
      await logRun(sb, source, bucket, 0, 0, 0, { grace_seconds: graceSeconds });
      return stat;
    }

    const paths = list.map((r) => r.name);
    const { removed, skipped_raced } = await batchRemove(sb, bucket, paths);
    stat.deleted = removed;
    stat.skipped_raced = skipped_raced;
    // bytes_freed counts the candidates' total; subtract bytes from any paths
    // that were race-protected so the metric doesn't overstate freed space.
    stat.bytes_freed = list.reduce((acc, r) => acc + (Number(r.size_bytes) || 0), 0);
    if (skipped_raced > 0 && skipped_raced < list.length) {
      // Best-effort proportional adjustment when we can't tell which exact
      // paths were skipped. Logged in details for forensic accuracy.
      const avg = stat.bytes_freed / list.length;
      stat.bytes_freed = Math.max(0, Math.floor(stat.bytes_freed - avg * skipped_raced));
    }

    await logRun(sb, source, bucket, stat.scanned, stat.deleted, stat.bytes_freed, {
      grace_seconds: graceSeconds,
      truncated_at_limit: list.length >= PER_BUCKET_LIMIT,
      skipped_raced: skipped_raced,
    });
  } catch (err) {
    stat.error = err instanceof Error ? err.message : String(err);
    console.error(`[OrphanCleanup] cleanBucket(${bucket}) failed:`, err);
    await logRun(sb, source, bucket, stat.scanned, stat.deleted, stat.bytes_freed, {}, stat.error);
  }

  return stat;
}

serve(async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Optional cron-secret gating
  const cronSecret = () => Deno.env.get('CRON_SECRET') || '';
  if (cronSecret()) {
    const provided = req.headers.get('x-cron-secret');
    if (provided !== cronSecret()) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Parse body — admins can override grace_seconds and dry_run for one-off runs.
  let dryRun = false;
  let bucketFilter: string | null = null;
  let source = 'cron';
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body === 'object') {
        if (body.dry_run === true) dryRun = true;
        if (typeof body.bucket === 'string') bucketFilter = body.bucket;
        if (typeof body.source === 'string') source = body.source;
      }
    }
  } catch {
    /* ignore */
  }

  const startedAt = Date.now();
  console.log(`[OrphanCleanup] Starting (dry_run=${dryRun}, bucket=${bucketFilter ?? 'ALL'})`);

  try {
    const targets = bucketFilter
      ? BUCKETS.filter((b) => b.bucket === bucketFilter)
      : BUCKETS;

    const stats: BucketStat[] = [];
    for (const { bucket, grace_seconds } of targets) {
      if (dryRun) {
        const { data, error } = await sb.rpc('find_orphan_storage_objects', {
          p_bucket: bucket,
          p_grace_seconds: grace_seconds,
          p_limit: PER_BUCKET_LIMIT,
        });
        const list = data ?? [];
        const bytes = list.reduce((a: number, r: any) => a + (Number(r.size_bytes) || 0), 0);
        stats.push({
          bucket,
          scanned: list.length,
          deleted: 0,
          bytes_freed: bytes,
          skipped_raced: 0,
          error: error?.message,
        });
        await logRun(sb, source, bucket, list.length, 0, bytes,
          { grace_seconds, dry_run: true }, error?.message);
      } else {
        stats.push(await cleanBucket(sb, source, bucket, grace_seconds));
      }
    }

    const total = {
      buckets: stats,
      total_deleted: stats.reduce((a, s) => a + s.deleted, 0),
      total_bytes_freed: stats.reduce((a, s) => a + s.bytes_freed, 0),
      total_skipped_raced: stats.reduce((a, s) => a + (s.skipped_raced ?? 0), 0),
      duration_ms: Date.now() - startedAt,
      dry_run: dryRun,
    };

    console.log(
      `[OrphanCleanup] Done. ${total.total_deleted} deleted, ` +
        `${total.total_skipped_raced} race-protected, ` +
        `${total.total_bytes_freed} bytes freed in ${total.duration_ms}ms`,
    );

    return new Response(JSON.stringify({ success: true, stats: total }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[OrphanCleanup] Fatal:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
