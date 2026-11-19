/** Server maintenance (#590): the outside probe and the operator notification, shared by the report endpoint and Agent Ops. */

import type { DbClient } from './supabase-client.ts';
import { guardedFetch } from './ssrf-guard.ts';
import { emitFlowEventToWorkspaceRoles } from './flow-events.ts';

export const SERVER_MAINTENANCE_PAGE = '/admin/agent-ops?tab=servers';

export interface ServerProbe {
  ok: boolean;
  server: string;
  url?: string;
  http_status?: number;
  ms?: number;
  server_header?: string | null;
  health_status?: unknown;
  probed_at?: string;
  error?: string;
}

/** Our own server's operator-set health URL, called from outside the server; never a URL from a request. */
export async function probeServer(db: DbClient, server: string): Promise<ServerProbe> {
  const { data: s } = await db.from('server_maintenance_servers').select('server, public_health_url').eq('server', server).maybeSingle();
  if (!s || !String(s.public_health_url).startsWith('https://')) return { ok: false, server, error: `No server ${server}.` };
  const started = Date.now();
  try {
    const res = await guardedFetch(s.public_health_url, { signal: AbortSignal.timeout(15000) });
    const text = (await res.text()).slice(0, 2000);
    let status: unknown = null;
    try { status = (JSON.parse(text) as { status?: unknown }).status ?? null; } catch { status = null; }
    return {
      ok: res.status === 200 && status === 'healthy', server, url: s.public_health_url, http_status: res.status,
      ms: Date.now() - started, server_header: res.headers.get('server'), health_status: status, probed_at: new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, server, url: s.public_health_url, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}

/** Bell for the root workspace's owners and admins, delivered by the locked system-default flow. */
export async function notifyServerMaintenance(db: DbClient, n: {
  server: string; stage: 'run' | 'review'; verdict: string; title: string; body: string; level: 'info' | 'warning'; actionUrl?: string;
}) {
  const { data: root } = await db.from('workspaces').select('id').eq('is_root', true).order('created_at').limit(1).maybeSingle();
  if (!root?.id) return;
  await emitFlowEventToWorkspaceRoles(root.id, ['owner', 'admin'], 'server_maintenance_completed', (uid) => ({
    type: n.level,
    user_id: uid,
    title: n.title,
    body: n.body,
    action_url: n.actionUrl ?? SERVER_MAINTENANCE_PAGE,
    workspace_id: root.id,
    server: n.server,
    stage: n.stage,
    verdict: n.verdict,
  }));
}

const mb = (b: unknown) => (typeof b === 'number' ? `${Math.max(0, Math.round(b / 1048576)).toLocaleString('en')} MB` : '—');

/** The bell text for one stored run, after the outside probe has confirmed (or contradicted) it. */
export function runNotification(label: string, run: {
  verdict: string; reason: string | null; steps: Array<{ name: string; detail: string }>;
  versions_after: { kernel?: string | null; nginx?: string | null } | null;
  freed_bytes: number | null; disk_used_after: number | null; disk_total_bytes: number | null;
}, probe: ServerProbe, reviewing: boolean): { title: string; body: string; level: 'info' | 'warning' } {
  const updated = run.steps.find((s) => s.name === 'update')?.detail.match(/^(\d+) package/)?.[1];
  const disk = run.disk_used_after && run.disk_total_bytes ? `${Math.round((100 * run.disk_used_after) / run.disk_total_bytes)}%` : '—';
  const facts = `${updated ?? '?'} package(s) updated · kernel ${run.versions_after?.kernel ?? '—'} · nginx ${run.versions_after?.nginx ?? '—'} · freed ${mb(run.freed_bytes)} · disk ${disk}`;
  const outside = probe.ok
    ? `Checked from outside: ${probe.http_status}, ${String(probe.health_status)} in ${probe.ms} ms.`
    : `Checked from outside: FAILED (${probe.error ?? `HTTP ${probe.http_status}, ${String(probe.health_status)}`}).`;
  if (run.verdict === 'ok' && probe.ok) {
    return { title: `${label}: weekly maintenance OK`, body: `${facts}. ${outside}`, level: 'info' };
  }
  const what = run.verdict === 'ok' ? 'finished, but the outside check failed' : run.verdict === 'skipped' ? 'was skipped' : run.verdict;
  return {
    title: `${label}: weekly maintenance ${what}`,
    body: `${(run.reason || facts).slice(0, 400)}. ${outside}${reviewing ? ' Stark and Veritas are reviewing it.' : ''}`,
    level: 'warning',
  };
}
