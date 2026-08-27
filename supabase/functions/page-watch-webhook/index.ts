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
import { PAGE_WATCH_STATUSES } from '../_shared/pageWatchVocabulary.generated.ts';

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

/**
 * The `monitor.page` entry, as Firecrawl actually sends it (captured from a live
 * delivery 2026-08-16, not read off the docs):
 *
 *   { checkId, monitorId, url, status, previousScrapeId, currentScrapeId,
 *     error, isMeaningful, judgment, diff }
 *
 * Two things that are NOT in it and shape the code below:
 *   • no `statusCode` — a page that 404s or 503s arrives as an ordinary `new`
 *     then `same`, with `error: null`. See probeWatchedPageHealth().
 *   • no `diff.json` in git-diff mode; the structured half of the change lives in
 *     `judgment.meaningfulChanges`.
 */
interface MeaningfulChange {
  type?: string;
  before?: string;
  after?: string;
  reason?: string;
}

interface MonitorPageEntry {
  monitorId?: string;
  checkId?: string;
  url?: string;
  status?: 'same' | 'new' | 'changed' | 'removed' | 'error';
  error?: string | null;
  isMeaningful?: boolean | null;
  judgment?: {
    meaningful?: boolean;
    confidence?: string;
    reason?: string;
    meaningfulChanges?: MeaningfulChange[];
  } | null;
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
// One source (#391) — the generated mirror. This Set was the second SHAPE of the union
// in `pageWatchService`; it is rebuilt from the shared list rather than retyped.
const STATUSES = new Set<string>(PAGE_WATCH_STATUSES);

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

/** What the notification should SAY, which is not the same for every status. */
function notificationCopy(watchName: string, status: string, reason: string | null) {
  switch (status) {
    case 'new':
      // The first check after a watch is created is a baseline, not a change.
      // Calling it "changed" trains the operator to ignore the next one.
      return {
        title: `Now watching ${watchName}`,
        body: 'The first snapshot has been taken. You will hear from this watch when the page changes.',
      };
    case 'removed':
      return {
        title: `${watchName} disappeared`,
        body: reason || 'The page is no longer reachable at that address.',
      };
    case 'error':
      return {
        title: `${watchName} could not be checked`,
        body: reason || 'The check failed. It will be retried on the next schedule.',
      };
    default:
      return {
        title: `${watchName} changed`,
        body: reason || 'The page you are watching changed.',
      };
  }
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

    // 'same' is the overwhelming majority of deliveries and carries nothing: no
    // diff, no judgment, no error. Recording it would turn the change log into a
    // check log — one empty row per watch per day, for a table with no TTL — and
    // bury the actual changes in the operator's history dialog. That the check
    // ran at all is already recorded on the watch by monitor.check.completed.
    if (status === 'same') continue;

    const confidence = CONFIDENCE.has(e.judgment?.confidence ?? '') ? e.judgment!.confidence! : null;

    // git-diff mode returns no `diff.json`; the structured half of the change is
    // the judge's per-change list. Keeping it is what lets the UI say "payment
    // terms: 30 days → 14 days" instead of only showing a unified diff.
    const changes = Array.isArray(e.judgment?.meaningfulChanges) ? e.judgment!.meaningfulChanges! : null;

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
      diff_json: e.diff?.json ?? (changes && changes.length ? { meaningful_changes: changes } : null),
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

    // The judge is ADVISORY (invariant 9): a low-confidence "not meaningful"
    // suppresses nothing, it only annotates. The row is written either way and
    // the operator sees the verdict next to the diff.
    const copy = notificationCopy(watch.name, status, row.judge_reason ?? row.error ?? null);
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
      title: copy.title,
      body: copy.body,
      action_url: '/monitoring/pages',
      type: 'page_watch_changed',
    });
  }

  return written;
}

/**
 * Ask Firecrawl what HTTP status the watched page actually returned.
 *
 * THIS IS THE SILENT-ZERO GUARD FOR THIS FEATURE. A watched URL that 404s or
 * 503s does not arrive as an error: Firecrawl scrapes the error page, compares
 * it to the previous error page, and reports `status: "same", error: null`
 * forever. The operator sees "up to date" on a watch that has been pointed at a
 * "Page Not Found" since the supplier redesigned their site. Verified against a
 * live 404 and a live 503 on 2026-08-16 — neither carried any signal in the
 * webhook payload at all.
 *
 * `statusCode` is only available on the check-detail endpoint, so this costs one
 * extra API call per completed check (no Firecrawl credits). It is best-effort:
 * the monitor API allows roughly three calls a minute, so a burst of watches
 * finishing together will see some of these rate-limited. A lookup we could not
 * make leaves the previous health verdict alone rather than inventing one.
 */
async function probeWatchedPageHealth(
  supabase: DbClient,
  monitorId: string,
  checkId: string,
): Promise<{ code: number; url: string } | null | undefined> {
  const apiKey = await resolveSecret(supabase, 'FIRECRAWL_API_KEY');
  if (!apiKey.value) return undefined;

  let res: Response;
  try {
    res = await fetch(`https://api.firecrawl.dev/v2/monitor/${monitorId}/checks/${checkId}`, {
      headers: { Authorization: `Bearer ${apiKey.value}` },
    });
  } catch (e) {
    console.warn(`[page-watch-webhook] health lookup failed for check ${checkId}: ${e}`);
    return undefined;
  }
  if (!res.ok) {
    console.warn(`[page-watch-webhook] health lookup HTTP ${res.status} for check ${checkId}`);
    return undefined;
  }

  let body: { data?: { pages?: { url?: string; statusCode?: number }[] } };
  try {
    body = await res.json();
  } catch {
    return undefined;
  }

  const pages = body.data?.pages ?? [];
  if (!pages.length) return undefined;
  const broken = pages.find((pg) => typeof pg.statusCode === 'number' && pg.statusCode >= 400);
  return broken ? { code: broken.statusCode!, url: broken.url ?? '' } : null;
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
    //
    // Three different things can be wrong and only the first one is obvious:
    //   1. the check failed outright             → e.status === 'failed'
    //   2. a page inside it errored              → summary.error > 0
    //   3. the page is fine but it is a 404/503  → probeWatchedPageHealth()
    const checkFailed = e.status === 'failed';
    const pagesErrored = Number(e.summary?.error ?? 0) > 0;
    const health = (!checkFailed && e.monitorId && e.checkId)
      ? await probeWatchedPageHealth(supabase, e.monitorId, e.checkId)
      : undefined;

    const failed = checkFailed || pagesErrored || !!health;
    const reason = checkFailed
      ? `Firecrawl check ${e.checkId ?? ''} reported failed`
      : pagesErrored
        ? `Firecrawl reported ${e.summary?.error} page error(s) in check ${e.checkId ?? ''}`
        : health
          ? `The page returns HTTP ${health.code} — this watch is comparing an error page, not the page you meant.`
          : null;

    const patch: Record<string, unknown> = {
      last_check_at: new Date().toISOString(),
      last_check_status: e.status ?? null,
      updated_at: new Date().toISOString(),
    };
    // `health === undefined` means we could not find out. Leave the existing
    // verdict standing rather than clearing a real failure with a guess.
    if (failed) {
      patch.cache_status = 'failed';
      patch.last_error = reason;
    } else if (health === null) {
      patch.cache_status = 'ok';
      patch.last_error = null;
    }

    const { error } = await supabase.from('page_watches').update(patch).eq('id', watch.id);

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
