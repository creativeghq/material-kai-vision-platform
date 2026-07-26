/**
 * gsc-api — Google Search Console integration for connected websites.
 *
 * One website (public.user_websites) connects to one GSC property. Tokens live in
 * public.website_gsc_connections (service-role only — never exposed to the browser);
 * daily search-analytics rows land in public.gsc_performance.
 *
 * Self-brokered OAuth (mirrors pinterest-api/handlers/oauth.ts): the frontend opens
 * Google's consent screen, Google redirects back to the app with ?code&state, and the
 * frontend POSTs {action:'callback', code, state} with the user's JWT. `state` is an
 * HMAC-signed {website_id, ts} so a callback is bound to a specific website and can't
 * be replayed — no server-side state row needed.
 *
 * Actions (user JWT): authorize · callback · list_properties · set_property · sync · disconnect
 * Action (x-cron-secret): cron-sync — nightly refresh of every active connection.
 *
 * verify_jwt is disabled at the gateway (see config.toml) so the cron path works; every
 * user action calls authenticate() + userCanAccessWorkspace() itself (invariant #1).
 */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Lazy getters so the platform_secrets bootstrap (run at handler entry) is honored.
const GOOGLE_CLIENT_ID = () => Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = () => Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const GOOGLE_REDIRECT_URI = () =>
  Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI') ||
  `${Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr'}/profile?tab=websites`;

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly openid email';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ── state signing (HMAC-SHA256 over "website_id.ts" with the service key) ──────────
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function signState(websiteId: string): Promise<string> {
  const ts = String(Date.now());
  const payload = `${websiteId}.${ts}`;
  return `${payload}.${await hmac(payload)}`;
}
async function verifyState(state: string): Promise<string | null> {
  const parts = (state || '').split('.');
  if (parts.length !== 3) return null;
  const [websiteId, ts, sig] = parts;
  if (Date.now() - Number(ts) > STATE_TTL_MS) return null;
  const expected = await hmac(`${websiteId}.${ts}`);
  // constant-time-ish compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? websiteId : null;
}

function domainOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, ''); }
  catch { return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || ''; }
}

// Pick the GSC property that best matches a website domain.
function matchProperty(sites: any[], domain: string): string | null {
  const urls: string[] = (sites || []).map((s) => s.siteUrl).filter(Boolean);
  const scDomain = `sc-domain:${domain}`;
  if (urls.includes(scDomain)) return scDomain;
  const prefix = urls.find((u) => { try { return domainOf(u) === domain; } catch { return false; } });
  return prefix || null;
}

// ── Google token helpers ───────────────────────────────────────────────────────────
async function exchangeCode(code: string): Promise<any> {
  const body = new URLSearchParams({
    code, client_id: GOOGLE_CLIENT_ID(), client_secret: GOOGLE_CLIENT_SECRET(),
    redirect_uri: GOOGLE_REDIRECT_URI(), grant_type: 'authorization_code',
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `token exchange ${r.status}`);
  return j; // { access_token, refresh_token, expires_in, scope, token_type, id_token }
}
async function refreshToken(refresh: string): Promise<any> {
  const body = new URLSearchParams({
    refresh_token: refresh, client_id: GOOGLE_CLIENT_ID(), client_secret: GOOGLE_CLIENT_SECRET(),
    grant_type: 'refresh_token',
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `token refresh ${r.status}`);
  return j; // { access_token, expires_in, scope }
}
/** Return a valid access token for a connection, refreshing (and persisting) if near expiry. */
async function validAccessToken(supabase: any, conn: any): Promise<string> {
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (conn.access_token && exp - Date.now() > REFRESH_BUFFER_MS) return conn.access_token;
  if (!conn.refresh_token) throw new Error('no_refresh_token');
  const t = await refreshToken(conn.refresh_token);
  const expiresAt = new Date(Date.now() + (Number(t.expires_in || 3600) * 1000)).toISOString();
  await supabase.from('website_gsc_connections')
    .update({ access_token: t.access_token, token_expires_at: expiresAt, is_active: true, updated_at: new Date().toISOString() })
    .eq('website_id', conn.website_id);
  return t.access_token;
}

async function listSites(accessToken: string): Promise<any[]> {
  const r = await fetch(SITES_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `sites list ${r.status}`);
  return j.siteEntry || [];
}

/** Pull search-analytics rows for [startDate,endDate] and upsert into gsc_performance. */
async function syncConnection(supabase: any, conn: any, startDate: string, endDate: string): Promise<number> {
  const token = await validAccessToken(supabase, conn);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(conn.property)}/searchAnalytics/query`;
  const r = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions: ['date', 'query', 'page'], rowLimit: 25000, dataState: 'all' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `searchAnalytics ${r.status}`);
  const rows: any[] = j.rows || [];
  if (rows.length === 0) return 0;
  const payload = rows.map((row) => {
    const [date, query, page] = row.keys || [];
    return {
      website_id: conn.website_id, workspace_id: conn.workspace_id,
      date, query: query ?? '', page: page ?? '',
      clicks: Math.round(row.clicks || 0), impressions: Math.round(row.impressions || 0),
      ctr: row.ctr || 0, position: row.position || 0,
    };
  });
  // Upsert in chunks (idempotent on the unique key).
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await supabase.from('gsc_performance').upsert(chunk, { onConflict: 'website_id,date,query,page' });
    if (error) throw new Error(error.message);
  }
  return payload.length;
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

// ── handler ──────────────────────────────────────────────────────────────────────
Deno.serve(withApiLogging('gsc-api', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');

  // ── Cron: refresh every active, property-bound connection ──
  if (action === 'cron-sync') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: conns } = await supabase.from('website_gsc_connections')
      .select('website_id, workspace_id, property, access_token, refresh_token, token_expires_at')
      .eq('is_active', true).not('property', 'is', null).not('refresh_token', 'is', null);
    const today = new Date();
    const end = ymd(new Date(today.getTime() - 1 * 86400000));   // GSC finalizes with ~2d lag
    const start = ymd(new Date(today.getTime() - 5 * 86400000)); // re-pull last 5d (idempotent)
    let ok = 0, failed = 0, rows = 0;
    for (const c of conns || []) {
      try {
        rows += await syncConnection(supabase, c, start, end);
        await supabase.from('website_gsc_connections')
          .update({ last_sync_at: new Date().toISOString(), last_sync_error: null }).eq('website_id', c.website_id);
        ok++;
      } catch (e) {
        failed++;
        await supabase.from('website_gsc_connections')
          .update({ last_sync_error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq('website_id', c.website_id);
      }
    }
    // Retention: GSC keeps ~16 months; we keep 180 days.
    await supabase.from('gsc_performance').delete().lt('date', ymd(new Date(Date.now() - 180 * 86400000)));
    return json({ ok: true, synced: ok, failed, rows });
  }

  // ── All other actions require a user JWT ──
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  // Resolve website + reconcile workspace membership (service-role client bypasses RLS → manual check).
  const websiteId = String(body?.website_id || '');
  if (!websiteId) return json({ error: 'website_id required' }, 400);
  const { data: website } = await supabase.from('user_websites')
    .select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ error: 'Website not found' }, 404);
  if (!(await userCanAccessWorkspace(supabase, userId, website.workspace_id))) {
    return json({ error: 'Website not found' }, 404); // 404, not 403 — no id enumeration
  }

  try {
    switch (action) {
      case 'authorize': {
        if (!GOOGLE_CLIENT_ID()) return json({ error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET under Operations → Keys.' }, 400);
        const state = await signState(websiteId);
        const u = new URL(AUTH_URL);
        u.searchParams.set('client_id', GOOGLE_CLIENT_ID());
        u.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI());
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('scope', GOOGLE_SCOPE);
        u.searchParams.set('access_type', 'offline');
        u.searchParams.set('include_granted_scopes', 'true');
        u.searchParams.set('prompt', 'consent'); // force refresh_token every time
        u.searchParams.set('state', state);
        return json({ ok: true, auth_url: u.toString() });
      }

      case 'callback': {
        const code = String(body?.code || '');
        const state = String(body?.state || '');
        if (!code) return json({ error: 'code required' }, 400);
        const stateWebsite = await verifyState(state);
        if (!stateWebsite || stateWebsite !== websiteId) return json({ error: 'Invalid or expired state' }, 400);

        const tok = await exchangeCode(code);
        if (!tok.refresh_token) {
          return json({ error: 'Google did not return a refresh token. Remove the app under your Google Account → Security → Third-party access, then reconnect.' }, 400);
        }
        // Who authorized + which properties they have.
        let email = '';
        try {
          const ui = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } });
          if (ui.ok) email = (await ui.json())?.email || '';
        } catch { /* non-fatal */ }
        const sites = await listSites(tok.access_token);
        const property = matchProperty(sites, domainOf(website.url));

        const expiresAt = new Date(Date.now() + (Number(tok.expires_in || 3600) * 1000)).toISOString();
        const { error: upErr } = await supabase.from('website_gsc_connections').upsert({
          website_id: websiteId, workspace_id: website.workspace_id,
          google_email: email || null, property,
          access_token: tok.access_token, refresh_token: tok.refresh_token,
          token_expires_at: expiresAt, scope: tok.scope || GOOGLE_SCOPE,
          connected_by: userId, connected_at: new Date().toISOString(),
          is_active: true, last_sync_error: null, updated_at: new Date().toISOString(),
        }, { onConflict: 'website_id' });
        if (upErr) return json({ error: upErr.message }, 400);

        // If we matched a property, do an initial 28-day backfill right away.
        let initialRows = 0;
        if (property) {
          try {
            const { data: fresh } = await supabase.from('website_gsc_connections')
              .select('website_id, workspace_id, property, access_token, refresh_token, token_expires_at').eq('website_id', websiteId).single();
            const end = ymd(new Date(Date.now() - 1 * 86400000));
            const start = ymd(new Date(Date.now() - 28 * 86400000));
            initialRows = await syncConnection(supabase, fresh, start, end);
            await supabase.from('website_gsc_connections').update({ last_sync_at: new Date().toISOString() }).eq('website_id', websiteId);
          } catch (e) {
            await supabase.from('website_gsc_connections').update({ last_sync_error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq('website_id', websiteId);
          }
        }
        return json({
          ok: true, connected: true, google_email: email, property,
          matched: !!property, initial_rows: initialRows,
          available_properties: property ? undefined : (sites || []).map((s) => s.siteUrl),
        });
      }

      case 'list_properties': {
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, access_token, refresh_token, token_expires_at').eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Not connected' }, 400);
        const token = await validAccessToken(supabase, conn);
        const sites = await listSites(token);
        return json({ ok: true, properties: (sites || []).map((s) => ({ property: s.siteUrl, permission: s.permissionLevel })) });
      }

      case 'set_property': {
        const property = String(body?.property || '');
        if (!property) return json({ error: 'property required' }, 400);
        const { error } = await supabase.from('website_gsc_connections')
          .update({ property, last_sync_error: null, updated_at: new Date().toISOString() }).eq('website_id', websiteId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, property });
      }

      case 'sync': {
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, workspace_id, property, access_token, refresh_token, token_expires_at').eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Not connected' }, 400);
        if (!conn.property) return json({ error: 'No Search Console property selected for this site yet.' }, 400);
        const days = Math.min(Math.max(Number(body?.days) || 28, 1), 180);
        const end = ymd(new Date(Date.now() - 1 * 86400000));
        const start = ymd(new Date(Date.now() - days * 86400000));
        try {
          const rows = await syncConnection(supabase, conn, start, end);
          await supabase.from('website_gsc_connections').update({ last_sync_at: new Date().toISOString(), last_sync_error: null }).eq('website_id', websiteId);
          return json({ ok: true, rows, from: start, to: end });
        } catch (e) {
          const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
          await supabase.from('website_gsc_connections').update({ last_sync_error: msg }).eq('website_id', websiteId);
          return json({ ok: false, error: msg }, 400);
        }
      }

      case 'disconnect': {
        const { error } = await supabase.from('website_gsc_connections')
          .update({ is_active: false, access_token: null, refresh_token: null, token_expires_at: null, updated_at: new Date().toISOString() })
          .eq('website_id', websiteId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, connected: false });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
}));
