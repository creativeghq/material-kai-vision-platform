/** workspace-pulse — one glanceable read per section, for the desktop widget. Read-only. */

import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { callerDbClient } from '../_shared/caller-client.ts';
import { keyWorkspaceFence } from '../_shared/request-context.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(withApiLogging('workspace-pulse', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Use GET or POST');

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ ok: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();

  const params = new URL(req.url).searchParams;
  if (params.get('view') === 'notifications') return notifications(token, userId, params.get('since'));

  let requested = params.get('workspace_id');
  if (!requested && req.method === 'POST') {
    try { requested = ((await req.json()) as { workspace_id?: string }).workspace_id ?? null; } catch { /* empty body */ }
  }
  if (requested && !UUID.test(requested)) throw new HttpError(400, 'workspace_id must be a uuid');

  const fence = keyWorkspaceFence();
  const { data: memberships, error: memErr } = await auth.supabase
    .from('workspace_members')
    .select('workspace_id, joined_at, workspaces(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });
  if (memErr) return json({ ok: false, error: 'Could not read your workspaces' }, 502);

  type Membership = { workspace_id: string; workspaces: { name: string } | { name: string }[] | null };
  const workspaces = ((memberships ?? []) as unknown as Membership[])
    .filter((m) => !fence || m.workspace_id === fence)
    .map((m) => {
      const ws = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces;
      return { id: m.workspace_id, name: ws?.name ?? 'Workspace' };
    });

  const workspaceId = requested ?? fence ?? workspaces[0]?.id;
  // 404, not 403: another tenant's id must be indistinguishable from one that does not exist.
  if (!workspaceId || !workspaces.some((w) => w.id === workspaceId)) {
    return json({ ok: false, error: 'Workspace not found' }, 404);
  }

  const { data, error } = await callerDbClient(token, userId, workspaceId)
    .rpc('get_workspace_pulse', { p_workspace_id: workspaceId });
  if (error || !data) {
    console.error('[workspace-pulse] get_workspace_pulse failed:', error?.message);
    return json({ ok: false, error: 'Could not read the workspace right now' }, 502);
  }

  return json({ ok: true, ...(data as Record<string, unknown>), workspaces });
}));

/**
 * The caller's own platform notifications newer than `since`, oldest first, for the desktop app to
 * show as native banners. No `since` = start now (a first launch must not replay the backlog).
 */
async function notifications(token: string, userId: string, since: string | null): Promise<Response> {
  const now = new Date().toISOString();
  if (!since) return json({ ok: true, notifications: [], cursor: now });
  if (Number.isNaN(Date.parse(since))) throw new HttpError(400, 'since must be an ISO timestamp');

  const fence = keyWorkspaceFence();
  let query = callerDbClient(token, userId, fence)
    .from('user_notifications')
    .select('id, type, title, body, action_url, created_at')
    .eq('user_id', userId)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(20);
  // A key bound to one workspace must not surface notifications about another.
  if (fence) query = query.or(`metadata->>workspace_id.is.null,metadata->>workspace_id.eq.${fence}`);

  const { data, error } = await query;
  if (error) {
    console.error('[workspace-pulse] notifications read failed:', error.message);
    return json({ ok: false, error: 'Could not read notifications right now' }, 502);
  }
  const rows = (data ?? []) as Array<{ created_at: string }>;
  return json({ ok: true, notifications: rows, cursor: rows.length ? rows[rows.length - 1].created_at : since });
}
