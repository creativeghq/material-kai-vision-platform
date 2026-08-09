/**
 * Firecrawl Monitoring → page watch ingestion (issue #331).
 *
 * Firecrawl calls this when a watched page changes. Two event types:
 *   monitor.page              — one entry per page, per check
 *   monitor.check.completed   — reconciliation summary after the whole check
 *
 * SECURITY NOTE — read before changing the auth block.
 * Firecrawl does NOT sign its webhooks. There is no HMAC, no signature header,
 * no timestamp to check for replay. The only authentication the provider offers
 * is `webhook.headers` — arbitrary headers we hand them at monitor-creation time
 * and they echo back on every delivery. So the shared secret below IS the whole
 * authentication story, which makes two things non-negotiable:
 *
 *   1. It fails CLOSED. Secret unset → 503, never "process it anyway". An
 *      unauthenticated caller can otherwise write arbitrary diffs into a
 *      tenant's change log and fire notifications off them.
 *   2. It is compared in constant time, because a bearer-style secret compared
 *      with `===` leaks its prefix to a patient attacker, and unlike an HMAC
 *      there is no second factor behind it.
 *
 * A replay is possible in principle (no nonce is available to us). It is made
 * harmless by the `page_watch_changes_idem` unique index: replaying a delivery
 * conflicts on (page_watch_id, firecrawl_check_id, url) and writes nothing.
 */

import { serviceClient, type DbClient } from '../_shared/supabase-client.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

const WEBHOOK_SECRET_KEY = 'FIRECRAWL_WEBHOOK_SECRET';
const SECRET_HEADER = 'x-firecrawl-webhook-secret';

/**
 * `serviceClient()` reads env at CALL time, not module load — which is the only
 * reason this works: the bootstrap populates env at handler entry, so a
 * module-level client would capture an empty URL.
 */

/**
 * Length-independent, content-constant-time comparison.
 *
 * Compares over a fixed 64-byte window so that neither the loop count nor the
 * early-exit reveals the expected length. `a.length !== b.length` first would
 * defeat the point.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  const width = Math.max(a.length, b.length, 64);
  let diff = a.length ^ b.length;
  for (let i = 0; i < width; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

interface MonitorPageEntry {
  monitorId?: string;
  checkId?: string;
  url?: string;
  status?: 'same' | 'new' | 'changed' | 'removed' | 'error';
  error?: string | null;
  isMeaningful?: boolean;
  judgment?: { meaningful?: boolean; confidence?: string; reason?: string } | null;
  diff?: { text?: string; json?: unknown } | null;
}

interface CheckCompletedEntry {
  monitorId?: string;
  checkId?: string;
  status?: 'completed' | 'failed' | 'partial';
  summary?: Record<string, number>;
}

interface WatchRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  category: string;
}

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const STATUSES = new Set(['same', 'new', 'changed', 'removed', 'error']);

/**
 * Resolve the watch that owns a Firecrawl monitor.
 *
 * This is the tenancy boundary: `workspace_id` comes from OUR row, keyed on the
 * monitor id we created. The payload's own fields are never trusted for it —
 * a forged body naming another tenant's workspace must not be able to write there.
 */
async function findWatch(
  supabase: DbClient,
  monitorId: string | undefined,
): Promise<WatchRow | null> {
  if (!monitorId) return null;
  const { data } = await supabase
    .from('page_watches')
    .select('id, workspace_id, created_by, name, category')
    .eq('firecrawl_monitor_id', monitorId)
    .maybeSingle();
  return (data as WatchRow | null) ?? null;
}

async function handleMonitorPage(
  supabase: DbClient,
  entries: MonitorPageEntry[],
): Promise<number> {
  let written = 0;

  for (const e of entries) {
    const watch = await findWatch(supabase, e.monitorId);
    if (!watch) {
      // An unknown monitor is not an error worth retrying — most likely a watch
      // we deleted locally while its monitor lingered upstream. Log and move on.
      console.warn(`[page-watch-webhook] no watch for monitor ${e.monitorId}; ignoring page event`);
      continue;
    }

    const status = STATUSES.has(e.status ?? '') ? e.status! : 'error';
    const confidence = CONFIDENCE.has(e.judgment?.confidence ?? '') ? e.judgment!.confidence! : null;

    // Allowlisted payload — never spread the request body into a write
    // (invariant 8). Everything below is either ours or explicitly narrowed.
    const row = {
      page_watch_id: watch.id,
      workspace_id: watch.workspace_id,
      firecrawl_check_id: e.checkId ?? null,
      url: e.url ?? '',
      status,
      is_meaningful: typeof e.isMeaningful === 'boolean'
        ? e.isMeaningful
        : (typeof e.judgment?.meaningful === 'boolean' ? e.judgment.meaningful : null),
      judge_confidence: confidence,
      judge_reason: e.judgment?.reason ?? null,
      diff_text: e.diff?.text ?? null,
      diff_json: e.diff?.json ?? null,
      error: e.error ?? null,
    };
    if (!row.url) continue;

    // Idempotent by the partial unique index. `ignoreDuplicates` makes a replayed
    // delivery a no-op rather than a second notification.
    const { data: inserted, error } = await supabase
      .from('page_watch_changes')
      .upsert(row, {
        onConflict: 'page_watch_id,firecrawl_check_id,url',
        ignoreDuplicates: true,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error(`[page-watch-webhook] insert failed for watch ${watch.id}: ${error.message}`);
      continue;
    }
    // Nothing came back → the row already existed. A retry, not a new change.
    if (!inserted) continue;
    written++;

    // 'same' is the common case and is not news. Only a real transition notifies.
    if (status === 'same') continue;

    // The judge is ADVISORY (invariant 9): a low-confidence "not meaningful"
    // suppresses nothing, it only annotates. The row is written either way and
    // the operator sees the verdict next to the diff.
    await emitFlowEvent('page_watch_changed', {
      user_id: watch.created_by,
      workspace_id: watch.workspace_id,
      page_watch_id: watch.id,
      watch_name: watch.name,
      category: watch.category,
      url: row.url,
      status,
      is_meaningful: row.is_meaningful,
      judge_confidence: row.judge_confidence,
      judge_reason: row.judge_reason,
      title: `${watch.name} changed`,
      body: row.judge_reason || `The page you are watching reported "${status}".`,
      action_url: '/monitoring/pages',
      type: 'page_watch_changed',
    });
  }

  return written;
}

async function handleCheckCompleted(
  supabase: DbClient,
  entries: CheckCompletedEntry[],
): Promise<number> {
  let updated = 0;

  for (const e of entries) {
    const watch = await findWatch(supabase, e.monitorId);
    if (!watch) continue;

    // cache_status distinguishes "ran clean, nothing changed" from "the check
    // itself broke and must be retried" — the difference the price pipeline
    // learned to record the hard way.
    const failed = e.status === 'failed';
    const { error } = await supabase
      .from('page_watches')
      .update({
        last_check_at: new Date().toISOString(),
        last_check_status: e.status ?? null,
        cache_status: failed ? 'failed' : 'ok',
        last_error: failed ? `Firecrawl check ${e.checkId ?? ''} reported failed` : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', watch.id);

    if (error) {
      console.error(`[page-watch-webhook] watch update failed ${watch.id}: ${error.message}`);
      continue;
    }
    updated++;
  }

  return updated;
}

Deno.serve(withApiLogging('page-watch-webhook', async (req) => {
  await bootstrapForFunction();

  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const supabase = serviceClient();

  // ── Authenticate BEFORE touching the body. Fail closed. ──
  const secret = await resolveSecret(supabase, WEBHOOK_SECRET_KEY);
  if (!secret.value) {
    // 503, not 500: this is a configuration gap that resolves the moment an
    // admin sets the key, and the function must not have processed anything
    // in the meantime.
    return new Response(
      JSON.stringify({
        error: `Page monitoring webhooks are not configured — set ${WEBHOOK_SECRET_KEY}.`,
        code: 'page_watch_webhook_not_configured',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const provided = req.headers.get(SECRET_HEADER) ?? '';
  if (!secretsMatch(provided, secret.value)) {
    throw new HttpError(401, 'Invalid or missing webhook secret');
  }

  // ── Authenticated. Only now does the body get read. ──
  let payload: { type?: string; data?: unknown };
  try {
    payload = await req.json();
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }

  const entries = Array.isArray(payload.data) ? payload.data : [];

  let result: Record<string, unknown>;
  switch (payload.type) {
    case 'monitor.page':
      result = { changes_written: await handleMonitorPage(supabase, entries as MonitorPageEntry[]) };
      break;
    case 'monitor.check.completed':
      result = { watches_updated: await handleCheckCompleted(supabase, entries as CheckCompletedEntry[]) };
      break;
    default:
      // Unknown event types are acknowledged, not retried. Firecrawl may add
      // types later and a 4xx would make them redeliver forever.
      result = { ignored: payload.type ?? 'unknown' };
  }

  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}));
