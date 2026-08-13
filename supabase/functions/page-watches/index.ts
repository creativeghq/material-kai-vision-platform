/**
 * Page watches — CRUD over `page_watches`, mirrored to Firecrawl monitors (issue #331).
 *
 * One Firecrawl monitor per watch, one URL per monitor. Firecrawl allows 1–50
 * targets in a monitor, but bundling them would mean a shared schedule, a shared
 * goal, and a webhook payload we would have to fan back out by URL. One-to-one
 * keeps `firecrawl_monitor_id` a key we can resolve a tenant from, which is what
 * the webhook's tenancy check depends on.
 *
 * The local row is the source of truth for WHAT is watched and WHO owns it.
 * Firecrawl owns the schedule, the snapshot and the diff. When the two disagree
 * — a monitor deleted upstream, a row deleted here — the local row wins and the
 * remote is reconciled toward it.
 */

import { serviceClient, type DbClient } from '../_shared/supabase-client.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { corsHeaders } from '../_shared/cors.ts';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev';
const MODULE_SLUG = 'page-monitoring';

const CATEGORIES = new Set(['supplier_terms', 'regulatory', 'partner_docs', 'competitor', 'other']);
const SUBJECT_KINDS = new Set(['platform_supplier', 'crm_company']);

type Db = DbClient;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function moduleEnabled(supabase: Db): Promise<boolean> {
  const { data } = await supabase.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
  return !!(data as { enabled?: boolean } | null)?.enabled;
}

/** Shape of the monitor we ask Firecrawl to keep for one watched page. */
function buildMonitorBody(args: {
  name: string;
  url: string;
  goal: string | null;
  scheduleText: string;
  timezone: string;
  webhookUrl: string;
  webhookSecret: string;
  watchId: string;
}) {
  return {
    name: args.name.slice(0, 120),
    schedule: { text: args.scheduleText, timezone: args.timezone },
    targets: [{
      type: 'scrape',
      urls: [args.url],
      // Markdown diffs. A T&C or regulatory page has no stable schema worth
      // extracting into JSON, and a unified text diff is what a human actually
      // reads to decide whether the change matters.
      scrapeOptions: { formats: [{ type: 'changeTracking', modes: ['git-diff'] }] },
    }],
    // Supplying a goal auto-enables Firecrawl's judge. Its verdict is advisory
    // here — see the note on page_watch_changes.is_meaningful.
    ...(args.goal ? { goal: args.goal } : {}),
    notification: {
      email: { enabled: false },
      webhook: {
        url: args.webhookUrl,
        // Firecrawl does not sign webhooks. This header IS the authentication;
        // the receiver fails closed without it.
        headers: { 'x-firecrawl-webhook-secret': args.webhookSecret },
        metadata: { watch_id: args.watchId },
        events: ['monitor.page', 'monitor.check.completed'],
      },
    },
    retentionDays: 90,
  };
}

async function firecrawl(
  apiKey: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // A 204 or an HTML error page — status alone carries the verdict.
  }
  return { ok: res.ok, status: res.status, data };
}

/** The id Firecrawl assigned, wherever they chose to put it in the envelope. */
function monitorIdOf(data: Record<string, unknown>): string | null {
  const direct = data.id ?? data.monitorId;
  if (typeof direct === 'string') return direct;
  const nested = (data.data ?? {}) as Record<string, unknown>;
  const inner = nested.id ?? nested.monitorId;
  return typeof inner === 'string' ? inner : null;
}

Deno.serve(withApiLogging('page-watches', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success) throw new HttpError(401, auth.error ?? 'Unauthorized');
  const userId = getUserId(auth);
  if (!userId) throw new HttpError(401, 'No user on this token');

  const supabase = serviceClient();
  if (!await moduleEnabled(supabase)) {
    throw new HttpError(403, `The ${MODULE_SLUG} module is disabled — an admin can enable it in /admin/modules.`);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }

  const action = String(body.action ?? '');
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : null;

  // Invariant 1: the caller states a workspace, we verify they belong to it.
  // Service role below bypasses RLS, so this check is the only thing standing
  // between a body-supplied id and another tenant's data.
  if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
  if (!await userCanAccessWorkspace(supabase, userId, workspaceId)) {
    // 404 not 403 — a 403 confirms the workspace exists (invariant 1).
    throw new HttpError(404, 'Not found');
  }

  const apiKeySecret = await resolveSecret(supabase, 'FIRECRAWL_API_KEY');
  const webhookSecret = await resolveSecret(supabase, 'FIRECRAWL_WEBHOOK_SECRET');

  /** Load a watch and prove it belongs to the verified workspace. */
  async function ownedWatch(id: unknown) {
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'id is required');
    const { data } = await supabase
      .from('page_watches')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!data) throw new HttpError(404, 'Not found');
    return data as Record<string, unknown>;
  }

  function requireRemoteConfig(): { apiKey: string; secret: string } {
    if (!apiKeySecret.value) {
      throw new HttpError(503, 'FIRECRAWL_API_KEY is not configured.');
    }
    if (!webhookSecret.value) {
      // Refuse to create a monitor we could not safely receive callbacks for.
      // Creating it anyway would leave an unauthenticated write path open the
      // moment the schedule fires.
      throw new HttpError(503, 'FIRECRAWL_WEBHOOK_SECRET is not configured — refusing to register a monitor whose callbacks could not be authenticated.');
    }
    return { apiKey: apiKeySecret.value, secret: webhookSecret.value };
  }

  const webhookUrl = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/page-watch-webhook`;

  switch (action) {
    case 'list': {
      const { data: watches } = await supabase
        .from('page_watches')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      const { data: unacked } = await supabase
        .from('page_watch_changes')
        .select('page_watch_id')
        .eq('workspace_id', workspaceId)
        .is('acknowledged_at', null)
        .neq('status', 'same');

      const pending = new Map<string, number>();
      for (const r of (unacked ?? []) as { page_watch_id: string }[]) {
        pending.set(r.page_watch_id, (pending.get(r.page_watch_id) ?? 0) + 1);
      }
      const rows = ((watches ?? []) as Record<string, unknown>[]).map((w) => ({
        ...w,
        unacknowledged_changes: pending.get(String(w.id)) ?? 0,
      }));
      return json({ success: true, data: rows });
    }

    case 'changes': {
      const watch = await ownedWatch(body.id);
      const { data } = await supabase
        .from('page_watch_changes')
        .select('*')
        .eq('page_watch_id', watch.id as string)
        .order('detected_at', { ascending: false })
        .limit(Math.min(Number(body.limit ?? 50) || 50, 200));
      return json({ success: true, data: data ?? [] });
    }

    case 'create': {
      const { apiKey, secret } = requireRemoteConfig();

      const name = String(body.name ?? '').trim();
      const rawUrl = String(body.url ?? '').trim();
      if (!name) throw new HttpError(400, 'name is required');

      // Invariant 7. We never fetch this URL ourselves — Firecrawl does — but a
      // stored URL is validated at write time regardless: it stops an internal
      // address being parked in a tenant's config for some later consumer that
      // DOES fetch it, and it keeps the https-only rule in one place.
      let url: string;
      try {
        url = await assertSafeUrl(rawUrl, { allowSchemes: ['https:'] });
      } catch (e) {
        throw new HttpError(400, e instanceof SSRFError ? `Rejected URL: ${e.message}` : 'Invalid URL');
      }

      const category = CATEGORIES.has(String(body.category)) ? String(body.category) : 'other';
      const subjectKind = SUBJECT_KINDS.has(String(body.subject_kind)) ? String(body.subject_kind) : null;

      // Allowlisted insert — no spreading of the request body (invariant 8).
      const { data: created, error: insErr } = await supabase
        .from('page_watches')
        .insert({
          workspace_id: workspaceId,
          created_by: userId,
          name,
          url,
          category,
          subject_kind: subjectKind,
          subject_id: subjectKind && typeof body.subject_id === 'string' ? body.subject_id : null,
          goal: typeof body.goal === 'string' && body.goal.trim() ? body.goal.trim().slice(0, 500) : null,
          schedule_text: String(body.schedule_text ?? 'every day at 09:00').slice(0, 120),
          timezone: String(body.timezone ?? 'Europe/Athens').slice(0, 64),
        })
        .select('*')
        .single();

      if (insErr) {
        if (insErr.code === '23505') throw new HttpError(409, 'This workspace already watches that URL.');
        throw new HttpError(400, insErr.message);
      }
      const watch = created as Record<string, unknown>;

      const remote = await firecrawl(apiKey, '/v2/monitor', {
        method: 'POST',
        body: buildMonitorBody({
          name, url,
          goal: (watch.goal as string | null) ?? null,
          scheduleText: watch.schedule_text as string,
          timezone: watch.timezone as string,
          webhookUrl, webhookSecret: secret,
          watchId: watch.id as string,
        }),
      });

      const monitorId = remote.ok ? monitorIdOf(remote.data) : null;
      if (!monitorId) {
        // The row exists but nothing upstream is watching. Mark it failed rather
        // than deleting: the operator sees WHY in the UI and can retry, instead
        // of clicking Add and watching the row vanish with no explanation.
        const { error: markErr } = await supabase.from('page_watches').update({
          cache_status: 'failed',
          is_active: false,
          last_error: `Firecrawl rejected the monitor (HTTP ${remote.status})`,
        }).eq('id', watch.id as string);
        // The caller still gets a 502 either way, so this must not replace that error — but a
        // lost marker is the whole point of the comment above: the operator opens the UI and
        // sees no reason why (#347 audit).
        if (markErr) console.error('[page-watches] could not mark the watch failed', markErr);
        throw new HttpError(502, `Firecrawl did not create the monitor (HTTP ${remote.status}).`);
      }

      const { data: linked } = await supabase
        .from('page_watches')
        .update({ firecrawl_monitor_id: monitorId, cache_status: 'ok', last_error: null })
        .eq('id', watch.id as string)
        .select('*')
        .single();

      return json({ success: true, data: linked ?? watch });
    }

    case 'update': {
      const watch = await ownedWatch(body.id);
      const { apiKey, secret } = requireRemoteConfig();

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
      if (typeof body.goal === 'string') patch.goal = body.goal.trim().slice(0, 500) || null;
      if (typeof body.schedule_text === 'string' && body.schedule_text.trim()) {
        patch.schedule_text = body.schedule_text.trim().slice(0, 120);
      }
      if (typeof body.timezone === 'string' && body.timezone.trim()) patch.timezone = body.timezone.trim().slice(0, 64);
      if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
      if (CATEGORIES.has(String(body.category))) patch.category = String(body.category);

      const { data: updated } = await supabase
        .from('page_watches').update(patch).eq('id', watch.id as string).select('*').single();
      const next = (updated ?? watch) as Record<string, unknown>;

      const monitorId = next.firecrawl_monitor_id as string | null;
      if (monitorId) {
        // Pausing locally must pause upstream too, or a deactivated watch keeps
        // billing Firecrawl credits on its schedule for a page nobody reads.
        const remote = await firecrawl(apiKey, `/v2/monitor/${monitorId}`, {
          method: 'PUT',
          body: {
            ...buildMonitorBody({
              name: next.name as string,
              url: next.url as string,
              goal: (next.goal as string | null) ?? null,
              scheduleText: next.schedule_text as string,
              timezone: next.timezone as string,
              webhookUrl, webhookSecret: secret,
              watchId: next.id as string,
            }),
            enabled: next.is_active as boolean,
          },
        });
        if (!remote.ok) {
          const { error: markErr } = await supabase.from('page_watches').update({
            last_error: `Firecrawl update failed (HTTP ${remote.status})`,
          }).eq('id', next.id as string);
          // This branch already returns `success: true` below, so the recorded error is the
          // only trace that the upstream update failed. Losing it silently leaves the watch
          // looking healthy while Firecrawl is out of sync (#347 audit).
          if (markErr) console.error('[page-watches] could not record the upstream update failure', markErr);
        }
      }
      return json({ success: true, data: next });
    }

    case 'remove': {
      const watch = await ownedWatch(body.id);
      const monitorId = watch.firecrawl_monitor_id as string | null;

      // Remote first. Deleting our row while the monitor lives on would leave an
      // orphan billing us forever with no row left to point at it.
      if (monitorId && apiKeySecret.value) {
        const remote = await firecrawl(apiKeySecret.value, `/v2/monitor/${monitorId}`, { method: 'DELETE' });
        if (!remote.ok && remote.status !== 404) {
          throw new HttpError(502, `Firecrawl would not delete the monitor (HTTP ${remote.status}); the watch was kept so it is not orphaned.`);
        }
      }
      // The upstream monitor is already gone at this point (the branch above refuses to proceed
      // otherwise). Reporting success on a rejected delete would leave a local watch whose
      // Firecrawl monitor no longer exists — the exact orphan the guard above avoids (#347).
      const { error: delErr } = await supabase.from('page_watches').delete().eq('id', watch.id as string);
      if (delErr) throw new HttpError(500, `The upstream monitor was removed but the watch could not be deleted: ${delErr.message}`);
      return json({ success: true, data: { id: watch.id } });
    }

    case 'run': {
      const watch = await ownedWatch(body.id);
      const { apiKey } = requireRemoteConfig();
      const monitorId = watch.firecrawl_monitor_id as string | null;
      if (!monitorId) throw new HttpError(409, 'This watch has no upstream monitor yet.');

      // Invariant 10: debit BEFORE the paid call, and refuse when it fails.
      const debit = await debitExternalServiceCredits(
        supabase, userId, 'firecrawl-scrape', 'page_watch.manual_run', 1,
        { page_watch_id: watch.id, url: watch.url }, workspaceId,
      );
      if (!debit.success) {
        return json({ success: false, error: debit.error ?? 'Insufficient credits' }, 402);
      }

      const remote = await firecrawl(apiKey, `/v2/monitor/${monitorId}/run`, { method: 'POST' });
      if (!remote.ok) throw new HttpError(502, `Firecrawl could not start the check (HTTP ${remote.status}).`);
      return json({ success: true, data: { started: true } });
    }

    case 'acknowledge': {
      const changeId = typeof body.change_id === 'string' ? body.change_id : null;
      if (!changeId) throw new HttpError(400, 'change_id is required');
      const { data } = await supabase
        .from('page_watch_changes')
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
        .eq('id', changeId)
        .eq('workspace_id', workspaceId)
        .select('id')
        .maybeSingle();
      if (!data) throw new HttpError(404, 'Not found');
      return json({ success: true, data });
    }

    default:
      throw new HttpError(400, `Unknown action: ${action || '(none)'}`);
  }
}));
