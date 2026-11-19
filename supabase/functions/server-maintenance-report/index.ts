/** A server's weekly maintenance report, and its poll for an on-demand run (#590). Signed per server; fails closed. */

import { serviceClient } from '../_shared/supabase-client.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { verifyIngestSignature } from '../_shared/ai-crawler.ts';
import { notifyServerMaintenance, probeServer, runNotification } from '../_shared/server-maintenance.ts';

const MAX_BYTES = 512 * 1024;
const SERVER = /^[a-z0-9-]{3,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERDICTS = new Set(['ok', 'degraded', 'failed', 'critical', 'skipped']);
const STEP_STATUSES = new Set(['ok', 'failed', 'warning', 'skipped']);

const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.slice(0, max) : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
const iso = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

function versionsOf(v: unknown) {
  const o = obj(v);
  if (!o) return null;
  return {
    kernel: str(o.kernel, 80), kernel_installed: str(o.kernel_installed, 80),
    nginx: str(o.nginx, 40), os: str(o.os, 80), upgradable: int(o.upgradable),
  };
}

function stepsOf(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).map(obj).filter((s): s is Record<string, unknown> => !!s).map((s) => ({
    name: str(s.name, 40) ?? 'step',
    status: STEP_STATUSES.has(String(s.status)) ? String(s.status) : 'failed',
    detail: str(s.detail, 600) ?? '',
    output: str(s.output, 3000) ?? '',
    seconds: int(s.seconds) ?? 0,
    at: iso(s.at),
  }));
}

function gapOf(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 60).map(obj).filter((g): g is Record<string, unknown> => !!g).map((g) => ({
    title: str(g.title, 200) ?? '',
    severity: str(g.severity, 20) ?? '',
    cves: Array.isArray(g.cves) ? g.cves.map((c) => str(c, 30)).filter(Boolean).slice(0, 10) : [],
    fixed_in: Array.isArray(g.fixed_in) ? g.fixed_in.map((c) => str(c, 20)).filter(Boolean).slice(0, 6) : [],
  }));
}

Deno.serve(withApiLogging('server-maintenance-report', async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const url = new URL(req.url);
  const server = url.searchParams.get('server') ?? '';
  const action = url.searchParams.get('action') ?? '';
  if (!SERVER.test(server)) throw new HttpError(400, 'server must be a server key');
  if (action !== 'report' && action !== 'poll') throw new HttpError(400, 'action must be report or poll');

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BYTES) throw new HttpError(413, 'Report too large');
  const raw = await req.text();
  if (raw.length > MAX_BYTES) throw new HttpError(413, 'Report too large');

  const db = serviceClient();
  const { data: row, error } = await db.from('server_maintenance_servers').select('secret').eq('server', server).maybeSingle();
  if (error) throw new Error(`server lookup failed: ${error.message.slice(0, 200)}`);
  if (!row) throw new HttpError(404, 'Not found');
  const ok = await verifyIngestSignature(row.secret, req.headers.get('x-kai-timestamp'), req.headers.get('x-kai-signature'), raw);
  if (!ok) throw new HttpError(401, 'Invalid signature');

  let body: Record<string, unknown>;
  try {
    body = obj(JSON.parse(raw)) ?? {};
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });

  if (action === 'poll') {
    const { data: claimed, error: pollErr } = await db.from('server_maintenance_servers')
      .update({ last_poll_at: new Date().toISOString(), run_requested_at: null })
      .eq('server', server).not('run_requested_at', 'is', null).select('server');
    if (pollErr) throw new Error(`poll claim failed: ${pollErr.message.slice(0, 200)}`);
    if (!claimed?.length) {
      await db.from('server_maintenance_servers').update({ last_poll_at: new Date().toISOString() }).eq('server', server);
    }
    return json({ run_requested: (claimed?.length ?? 0) > 0 });
  }

  const id = str(body.id, 36);
  const verdict = str(body.verdict, 20);
  const startedAt = iso(body.started_at);
  if (!id || !UUID.test(id)) throw new HttpError(400, 'id must be a uuid');
  if (!verdict || !VERDICTS.has(verdict)) throw new HttpError(400, 'verdict is not a known verdict');
  if (!startedAt) throw new HttpError(400, 'started_at must be a timestamp');

  const run = {
    id, server, verdict,
    trigger: body.trigger === 'on_demand' ? 'on_demand' : 'scheduled',
    reason: str(body.reason, 2000),
    started_at: startedAt,
    finished_at: iso(body.finished_at),
    rebooted: body.rebooted === true,
    steps: stepsOf(body.steps),
    versions_before: versionsOf(body.versions_before),
    versions_after: versionsOf(body.versions_after),
    disk_total_bytes: int(body.disk_total_bytes),
    disk_used_before: int(body.disk_used_before),
    disk_used_after: int(body.disk_used_after),
    freed_bytes: int(body.freed_bytes),
    upstream_gap: gapOf(body.upstream_gap),
  };
  const { data: inserted, error: insErr } = await db.from('server_maintenance_runs')
    .upsert(run, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (insErr) throw new Error(`run insert failed: ${insErr.message.slice(0, 200)}`);
  if (!inserted?.length) return json({ stored: true, id, verdict, duplicate: true });

  const { error: syncErr } = await db.rpc('ops_sync_cases');
  if (syncErr) console.warn(`[server-maintenance-report] ops_sync_cases failed: ${syncErr.message}`);

  const [probe, srv, settings, openCase] = await Promise.all([
    probeServer(db, server),
    db.from('server_maintenance_servers').select('label').eq('server', server).maybeSingle(),
    db.from('ops_desk_settings').select('auto_review_server').eq('id', true).maybeSingle(),
    db.from('ops_cases').select('id').eq('source_kind', 'server').like('source_key', `${server}:%`)
      .not('status', 'in', '(resolved,dismissed)').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const msg = runNotification(srv.data?.label ?? server, run, probe, !!settings.data?.auto_review_server && !!openCase.data);
  await notifyServerMaintenance(db, {
    server, stage: 'run', verdict, ...msg,
    actionUrl: openCase.data && msg.level === 'warning' ? `/admin/agent-ops?case=${openCase.data.id}` : undefined,
  });
  return json({ stored: true, id, verdict, outside_ok: probe.ok });
}));
