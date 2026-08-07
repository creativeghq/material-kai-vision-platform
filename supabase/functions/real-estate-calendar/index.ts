/**
 * real-estate-calendar — pushes viewings into the agent's own Google Calendar.
 *
 * Viewings already sync to the platform calendar (`crm_meetings`); what an agent actually lives in is
 * Google Calendar on their phone, and a viewing they cannot see there is a viewing they miss.
 *
 * Reuses the platform's existing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and the token/refresh shape
 * already proven in `gsc-api`, so an operator configures Google once rather than once per feature.
 *
 * SECURITY:
 *  • The connection is per USER — it holds one person's OAuth tokens, and its RLS is owner-only.
 *    Workspace membership deliberately grants nothing.
 *  • `state` is signed with the service key and carries the user + workspace, so the callback cannot
 *    be replayed to attach someone else's Google account to your row.
 *  • Every viewing push re-checks that the caller may see the viewing before writing to a calendar.
 */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Lazy getters — the platform_secrets bootstrap runs at handler entry, so a module-load capture
// would read undefined (CLAUDE.md, secrets).
const GOOGLE_CLIENT_ID = () => Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = () => Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const APP_URL = () => (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
const REDIRECT_URI = () => `${SUPABASE_URL}/functions/v1/real-estate-calendar`;

const SCOPE = 'https://www.googleapis.com/auth/calendar.events openid email';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CAL_URL = 'https://www.googleapis.com/calendar/v3/calendars';
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const enc = new TextEncoder();

/** Sign `state` so the callback cannot be forged to bind another user's Google account. */
async function signState(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${btoa(payload)}.${hex}`;
}
async function verifyState(state: string): Promise<{ user_id: string; workspace_id: string; ts: number } | null> {
  const [b64, sig] = String(state).split('.');
  if (!b64 || !sig) return null;
  let payload: string;
  try { payload = atob(b64); } catch { return null; }
  if (await signState(payload) !== state) return null;
  try {
    const parsed = JSON.parse(payload);
    if (Date.now() - Number(parsed.ts ?? 0) > STATE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

async function exchangeCode(code: string): Promise<any> {
  const body = new URLSearchParams({
    code, client_id: GOOGLE_CLIENT_ID(), client_secret: GOOGLE_CLIENT_SECRET(),
    redirect_uri: REDIRECT_URI(), grant_type: 'authorization_code',
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `token exchange ${r.status}`);
  return j;
}

/** A valid access token, refreshing when it is close to expiry. */
async function validAccessToken(supabase: any, conn: any): Promise<string> {
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (conn.access_token && exp - Date.now() > REFRESH_BUFFER_MS) return conn.access_token;
  if (!conn.refresh_token) throw new Error('This calendar connection needs to be re-authorised.');
  const body = new URLSearchParams({
    refresh_token: conn.refresh_token, client_id: GOOGLE_CLIENT_ID(),
    client_secret: GOOGLE_CLIENT_SECRET(), grant_type: 'refresh_token',
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `token refresh ${r.status}`);
  await supabase.from('realestate_calendar_connections')
    .update({
      access_token: j.access_token,
      token_expires_at: new Date(Date.now() + Number(j.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conn.id);
  return j.access_token;
}

Deno.serve(withApiLogging('real-estate-calendar', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const url = new URL(req.url);

  // ── OAuth callback (Google redirects the browser here) ─────────────────────────────
  if (req.method === 'GET' && url.searchParams.has('code')) {
    const back = (msg: string) => Response.redirect(`${APP_URL()}/properties?tab=viewings&calendar=${encodeURIComponent(msg)}`, 302);
    const state = await verifyState(url.searchParams.get('state') ?? '');
    // A bad or stale state is the replay case — never fall through to writing a connection.
    if (!state) return back('invalid_state');
    try {
      const tok = await exchangeCode(url.searchParams.get('code') ?? '');
      // Google only returns a refresh_token on the FIRST consent. Without prompt=consent a
      // reconnect would store a connection that cannot survive its first hour.
      if (!tok.refresh_token) return back('no_refresh_token');
      const who = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } })
        .then((r) => r.json()).catch(() => ({}));
      const { error } = await supabase.from('realestate_calendar_connections').upsert({
        user_id: state.user_id, workspace_id: state.workspace_id,
        google_email: who?.email ?? null,
        access_token: tok.access_token, refresh_token: tok.refresh_token,
        token_expires_at: new Date(Date.now() + Number(tok.expires_in || 3600) * 1000).toISOString(),
        is_active: true, last_sync_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,workspace_id' });
      if (error) return back('save_failed');
      return back('connected');
    } catch {
      return back('failed');
    }
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const action = String(body?.action ?? '');
  const workspaceId = String(body?.workspace_id ?? '');
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);
  if (!(await userCanAccessWorkspace(supabase, userId, workspaceId))) return json({ error: 'not found' }, 404);

  const { data: conn } = await supabase.from('realestate_calendar_connections')
    .select('*').eq('user_id', userId).eq('workspace_id', workspaceId).maybeSingle();

  if (action === 'status') {
    return json({
      connected: !!conn?.is_active && !!conn?.refresh_token,
      google_email: conn?.google_email ?? null,
      last_sync_at: conn?.last_sync_at ?? null,
      last_sync_error: conn?.last_sync_error ?? null,
      configured: !!GOOGLE_CLIENT_ID(),
    });
  }

  if (action === 'connect') {
    if (!GOOGLE_CLIENT_ID()) {
      return json({ error: 'Google is not configured on this platform. Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET under Operations → Keys.' }, 400);
    }
    const state = await signState(JSON.stringify({ user_id: userId, workspace_id: workspaceId, ts: Date.now() }));
    const u = new URL(AUTH_URL);
    u.searchParams.set('client_id', GOOGLE_CLIENT_ID());
    u.searchParams.set('redirect_uri', REDIRECT_URI());
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPE);
    u.searchParams.set('access_type', 'offline');
    // Forces a refresh_token even on a reconnect — Google withholds it on repeat consent otherwise.
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('state', state);
    return json({ auth_url: u.toString() });
  }

  if (action === 'disconnect') {
    await supabase.from('realestate_calendar_connections')
      .delete().eq('user_id', userId).eq('workspace_id', workspaceId);
    return json({ ok: true });
  }

  if (action === 'push-viewing') {
    if (!conn?.refresh_token || !conn.is_active) return json({ error: 'not_connected' }, 400);
    const viewingId = String(body?.viewing_id ?? '');
    if (!viewingId) return json({ error: 'viewing_id is required' }, 400);

    // Re-check the caller may see this viewing before writing it into anyone's calendar. The
    // service-role client bypasses RLS, so this is the check (invariant 1).
    const { data: v } = await supabase.from('property_viewings')
      .select('id, scheduled_at, status, type, calendar_event_id, agent_id, property:properties!property_viewings_property_id_fkey ( id, title, address, town, workspace_id )')
      .eq('id', viewingId).eq('workspace_id', workspaceId).maybeSingle();
    if (!v) return json({ error: 'not found' }, 404);

    try {
      const token = await validAccessToken(supabase, conn);
      const start = new Date(v.scheduled_at);
      const end = new Date(start.getTime() + 45 * 60 * 1000); // a viewing is ~45 minutes
      const prop: any = v.property ?? {};
      const event = {
        summary: `Viewing — ${prop.title ?? 'property'}`,
        location: [prop.address, prop.town].filter(Boolean).join(', ') || undefined,
        description: `Property viewing (${v.type ?? 'viewing'}).`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        // Cancelling in the app must clear it from the phone, not leave a ghost appointment.
        status: v.status === 'cancelled' ? 'cancelled' : 'confirmed',
      };

      const base = `${CAL_URL}/${encodeURIComponent(conn.calendar_id || 'primary')}/events`;
      const isUpdate = !!v.calendar_event_id;
      const r = await fetch(isUpdate ? `${base}/${encodeURIComponent(v.calendar_event_id)}` : base, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error?.message || `calendar ${r.status}`);

      if (!isUpdate && j.id) {
        await supabase.from('property_viewings').update({ calendar_event_id: j.id }).eq('id', viewingId);
      }
      await supabase.from('realestate_calendar_connections')
        .update({ last_sync_at: new Date().toISOString(), last_sync_error: null }).eq('id', conn.id);
      return json({ ok: true, event_id: j.id ?? v.calendar_event_id });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'sync failed';
      // Recorded, not swallowed: a calendar that silently stops syncing looks exactly like one with
      // no viewings, and the agent finds out by missing an appointment.
      await supabase.from('realestate_calendar_connections')
        .update({ last_sync_error: message.slice(0, 500) }).eq('id', conn.id);
      return json({ error: message }, 502);
    }
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}));
