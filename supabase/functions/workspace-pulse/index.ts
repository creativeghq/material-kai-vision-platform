/** workspace-pulse — one glanceable read per section for the desktop widget, plus its quick actions. */

import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { callerDbClient } from '../_shared/caller-client.ts';
import { keyWorkspaceFence } from '../_shared/request-context.ts';
import { LEAD_SOURCES, type LeadSource } from '../_shared/crm/leadVocabulary.generated.ts';

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

  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try { body = ((await req.json()) ?? {}) as Record<string, unknown>; } catch { /* empty body */ }
  }
  let requested = params.get('workspace_id') ?? (typeof body.workspace_id === 'string' ? body.workspace_id : null);
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

  const db = callerDbClient(token, userId, workspaceId);
  if (body.action === 'create_lead') return createLead(db, workspaceId, userId, body.lead);
  if (body.action === 'complete_task') return completeTask(db, workspaceId, body.task_id);
  if (body.action !== undefined) throw new HttpError(400, 'Unknown action');

  const { data, error } = await db.rpc('get_workspace_pulse', { p_workspace_id: workspaceId });
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
async function notifications(token: string, userId: string, rawSince: string | null): Promise<Response> {
  const now = new Date().toISOString();
  // An unencoded `+00:00` offset arrives as a space (form decoding); desktop app 1.4.1 and earlier send it so.
  const since = rawSince?.replace(' ', '+') ?? null;
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
  const rows = (data ?? []) as Array<{ type: string | null; action_url: string | null; created_at: string }>;
  return json({
    ok: true,
    notifications: rows.map((r) => ({ ...r, category: notificationCategory(r.type, r.action_url) })),
    cursor: rows.length ? rows[rows.length - 1].created_at : since,
  });
}

const CATEGORY_BY_PATH: Record<string, string> = {
  inbox: 'inbox', crm: 'crm', finance: 'finance', quotes: 'quotes', projects: 'projects',
  warehouse: 'warehouse', hr: 'hr', properties: 'realestate', admin: 'system', profile: 'account',
};

/** Which part of the platform a notification is about, for the icon in front of it. `type` is free text, so the link decides when it is generic. */
function notificationCategory(type: string | null, actionUrl: string | null): string {
  const t = type ?? '';
  if (t.startsWith('job_')) return 'jobs';
  if (t === 'changelog_published') return 'updates';
  const url = actionUrl ?? '';
  const segment = url.replace(/^\/+/, '').split(/[/?#]/)[0];
  if (t.startsWith('social_') || segment === 'messaging') return 'social';
  if (segment === 'agent-hub') return /[?&]agent=marketing\b/.test(url) ? 'marketing' : 'agent';
  return CATEGORY_BY_PATH[segment] ?? 'general';
}

type Db = ReturnType<typeof callerDbClient>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/** Quick-add from the desktop app. Written as the caller, so RLS decides who may add a lead. */
async function createLead(db: Db, workspaceId: string, userId: string, raw: unknown): Promise<Response> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const name = text(input.name, 200);
  if (!name) throw new HttpError(400, 'A lead needs a name');
  const source = (LEAD_SOURCES as readonly string[]).includes(input.source as string)
    ? (input.source as LeadSource) : 'phone';
  const followUp = text(input.follow_up_on, 10);
  if (followUp && !DAY.test(followUp)) throw new HttpError(400, 'follow_up_on must be YYYY-MM-DD');
  const value = input.estimated_value == null || input.estimated_value === '' ? null : Number(input.estimated_value);
  if (value !== null && !(Number.isFinite(value) && value >= 0)) throw new HttpError(400, 'estimated_value must be a positive number');

  const { data, error } = await db.from('crm_leads').insert({
    workspace_id: workspaceId,
    owner_user_id: userId,
    name,
    phone: text(input.phone, 60),
    email: text(input.email, 200),
    company_name: text(input.company_name, 200),
    request: text(input.request, 4000),
    notes: text(input.notes, 4000),
    source,
    follow_up_on: followUp,
    estimated_value: value,
    status: 'new',
  }).select('id, name').single();
  if (error) {
    if (error.code === '42501') throw new HttpError(403, 'Your role in this workspace cannot add leads');
    console.error('[workspace-pulse] create_lead failed:', error.message);
    return json({ ok: false, error: 'Could not save the lead' }, 502);
  }
  return json({ ok: true, lead: data, url: '/crm?tab=leads' });
}

/** Ticks a task off from the widget. The task must belong to the resolved workspace. */
async function completeTask(db: Db, workspaceId: string, taskId: unknown): Promise<Response> {
  if (typeof taskId !== 'string' || !UUID.test(taskId)) throw new HttpError(400, 'task_id must be a uuid');
  const { data: task } = await db.from('project_tasks')
    .select('id, status, projects!inner(workspace_id)')
    .eq('id', taskId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();
  if (!task) return json({ ok: false, error: 'Task not found' }, 404);
  if ((task as { status: string }).status === 'done') return json({ ok: true, already: true });

  const { data: updated, error } = await db.from('project_tasks')
    .update({ status: 'done' }).eq('id', taskId).select('id');
  if (error || !updated?.length) {
    if (error) console.error('[workspace-pulse] complete_task failed:', error.message);
    return json({ ok: false, error: 'You cannot change this task' }, 403);
  }
  return json({ ok: true });
}
