/**
 * gsc-api — Google Search Console integration for connected websites.
 *
 * One website (public.user_websites) connects to one GSC property. Tokens live in
 * public.website_gsc_connections (service-role only — never exposed to the browser);
 * daily search-analytics rows land in public.gsc_performance.
 *
 * OAuth is SERVER-SIDE by design. Google's redirect_uri points at THIS function
 * (a GET), not the SPA — because the app's supabase-js client has
 * `detectSessionInUrl` + PKCE on, and would otherwise intercept Google's `?code=`
 * as a login code, fail, and bounce the user to the login screen. The function
 * exchanges the code, stores the connection, then 302-redirects to the app with a
 * clean `?gsc=connected` (no code param ever touches the SPA).
 *
 * Auth model: `state` is an HMAC-signed `{website_id, user_id, ts}` minted at
 * authorize-time — AFTER authenticate()+userCanAccessWorkspace() proved the caller
 * owns the website. The GET callback carries no JWT (it's a browser redirect from
 * Google), so it trusts that signed, short-lived state; forgery needs the service key.
 *
 * Actions (user JWT, POST): authorize · list_properties · set_property · sync · disconnect
 * Action (x-cron-secret, POST): cron-sync — nightly refresh of every active connection.
 * GET ?code&state — Google's redirect target (server-side callback).
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
const APP_URL = () => (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
// The redirect_uri sent to Google (and echoed at token-exchange) — this function itself.
// Register THIS exact URL in the Google client. Override via GOOGLE_OAUTH_REDIRECT_URI only if needed.
const GOOGLE_REDIRECT_URI = () => Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI') || `${SUPABASE_URL}/functions/v1/gsc-api`;

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
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
/** 302 back to the app's Websites tab with a status flag (no OAuth code in the URL). */
function redirectToApp(params: Record<string, string>): Response {
  const u = new URL(`${APP_URL()}/profile`);
  u.searchParams.set('tab', 'websites');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

// ── state signing: HMAC-SHA256 over "website_id.user_id.ts" with the service key ──
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function signState(websiteId: string, userId: string): Promise<string> {
  const payload = `${websiteId}.${userId}.${Date.now()}`;
  return `${payload}.${await hmac(payload)}`;
}
async function verifyState(state: string): Promise<{ websiteId: string; userId: string } | null> {
  const parts = (state || '').split('.');
  if (parts.length !== 4) return null;
  const [websiteId, userId, ts, sig] = parts;
  if (!websiteId || !userId || !ts) return null;
  if (Date.now() - Number(ts) > STATE_TTL_MS) return null;
  const expected = await hmac(`${websiteId}.${userId}.${ts}`);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { websiteId, userId } : null;
}

function domainOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, ''); }
  catch { return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || ''; }
}
function matchProperty(sites: any[], domain: string): string | null {
  const urls: string[] = (sites || []).map((s) => s.siteUrl).filter(Boolean);
  const scDomain = `sc-domain:${domain}`;
  if (urls.includes(scDomain)) return scDomain;
  return urls.find((u) => { try { return domainOf(u) === domain; } catch { return false; } }) || null;
}

/** The bare domain a Search Console property covers — `sc-domain:x` and `https://x/` both give x. */
function propertyDomain(property: string): string {
  const p = (property || '').trim();
  return p.toLowerCase().startsWith('sc-domain:')
    ? p.slice('sc-domain:'.length).replace(/^www\./i, '').toLowerCase()
    : domainOf(p).toLowerCase();
}

/**
 * Is `property` a property this connected website may legitimately claim?
 *
 * DERIVED, not asserted (#364 EX-8). `set_property` used to write whatever string arrived in the
 * body: a member could bind their website row to any property their Google account happened to
 * reach — an agency or ex-employer account often reaches several — and from then on
 * `gsc_performance` filled with a different site's search data under this website's id, which is
 * what every SEO surface downstream reports on. Nothing anywhere said the two were unrelated.
 *
 * Two conditions, both required:
 *   1. the property is in the OAuth account's own `sites.list` — Google's answer to "what may
 *      this token see", so the check cannot be satisfied by asserting it here; and
 *   2. it covers the website's domain, either exactly or as a parent (a `sc-domain:example.com`
 *      property legitimately covers `shop.example.com`).
 *
 * `siteUnverifiedUser` is rejected: Search Console lists properties a user has merely been shown,
 * with no verified relationship to the site.
 */
function propertyClaimError(sites: any[], property: string, websiteUrl: string): string | null {
  const entry = (sites || []).find((s) => s?.siteUrl === property);
  if (!entry) {
    return 'That property is not available to the connected Google account. Pick one from the list.';
  }
  if (String(entry.permissionLevel || '') === 'siteUnverifiedUser') {
    return 'The connected Google account is not a verified owner or user of that property.';
  }
  const site = domainOf(websiteUrl).toLowerCase();
  const prop = propertyDomain(property);
  if (!prop || !site) return 'Could not compare that property against this website\'s domain.';
  if (prop !== site && !site.endsWith(`.${prop}`)) {
    return `That property covers ${prop}, which is not this website (${site}).`;
  }
  return null;
}

// ── Google token helpers ─────────────────────────────────────────────────────────
async function exchangeCode(code: string): Promise<any> {
  const body = new URLSearchParams({
    code, client_id: GOOGLE_CLIENT_ID(), client_secret: GOOGLE_CLIENT_SECRET(),
    redirect_uri: GOOGLE_REDIRECT_URI(), grant_type: 'authorization_code',
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `token exchange ${r.status}`);
  return j;
}
async function refreshToken(refresh: string): Promise<any> {
  const body = new URLSearchParams({
    refresh_token: refresh, client_id: GOOGLE_CLIENT_ID(), client_secret: GOOGLE_CLIENT_SECRET(), grant_type: 'refresh_token',
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `token refresh ${r.status}`);
  return j;
}
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
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

const GSC_ROW_LIMIT = 25000;

/** Run a Search Analytics query for one property, paginating past the 25k row cap. */
async function gscQuery(token: string, property: string, body: Record<string, unknown>): Promise<any[]> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const all: any[] = [];
  for (let startRow = 0, page = 0; page < 40; page++, startRow += GSC_ROW_LIMIT) { // hard cap 1M rows
    const r = await fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, rowLimit: GSC_ROW_LIMIT, startRow, dataState: 'all' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || `searchAnalytics ${r.status}`);
    const rows: any[] = j.rows || [];
    all.push(...rows);
    if (rows.length < GSC_ROW_LIMIT) break;
  }
  return all;
}

async function upsertChunked(supabase: any, table: string, rows: any[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(error.message);
  }
}

// Extra Performance-report dimensions (mirrors what the GSC UI shows): accurate daily
// totals + device / country / search-appearance splits. Each is its own query because
// stacking every dimension into one explodes rows and hits the API cap.
const GSC_BREAKDOWNS: { dim: string; gscDims: string[] }[] = [
  { dim: 'total', gscDims: ['date'] },
  { dim: 'device', gscDims: ['date', 'device'] },
  { dim: 'country', gscDims: ['date', 'country'] },
  { dim: 'searchAppearance', gscDims: ['date', 'searchAppearance'] },
];

/**
 * Pull all of a property's search-analytics for [startDate,endDate] and upsert it:
 *   - query×page×date   → gsc_performance (paginated past 25k)
 *   - date/device/country/searchAppearance → gsc_breakdown
 * Returns the number of query×page rows persisted. Breakdown failures are non-fatal
 * (a property with no rich-result data, say, just yields an empty searchAppearance).
 */
async function syncConnection(supabase: any, conn: any, startDate: string, endDate: string): Promise<number> {
  const token = await validAccessToken(supabase, conn);
  const base = { website_id: conn.website_id, workspace_id: conn.workspace_id };

  // 1. Core query × page grain
  const core = await gscQuery(token, conn.property, { startDate, endDate, dimensions: ['date', 'query', 'page'] });
  const corePayload = core.map((row) => {
    const [date, query, page] = row.keys || [];
    return { ...base, date, query: query ?? '', page: page ?? '',
      clicks: Math.round(row.clicks || 0), impressions: Math.round(row.impressions || 0), ctr: row.ctr || 0, position: row.position || 0 };
  });
  if (corePayload.length) await upsertChunked(supabase, 'gsc_performance', corePayload, 'website_id,date,query,page');

  // 2. Dimension breakdowns
  for (const { dim, gscDims } of GSC_BREAKDOWNS) {
    try {
      const rows = await gscQuery(token, conn.property, { startDate, endDate, dimensions: gscDims });
      const payload = rows.map((row) => {
        const keys = row.keys || [];
        return { ...base, date: keys[0], dimension: dim, value: gscDims.length > 1 ? (keys[1] ?? '') : '',
          clicks: Math.round(row.clicks || 0), impressions: Math.round(row.impressions || 0), ctr: row.ctr || 0, position: row.position || 0 };
      });
      if (payload.length) await upsertChunked(supabase, 'gsc_breakdown', payload, 'website_id,date,dimension,value');
    } catch (e) {
      console.warn(`[gsc-api] breakdown '${dim}' failed for ${conn.property}:`, e instanceof Error ? e.message : e);
    }
  }
  return corePayload.length;
}

/** Exchange the code, store the connection, auto-match the property, and backfill 28 days.
 *  Shared by the GET callback. Tenancy comes from the (already-verified) website row. */
async function finishConnect(
  supabase: any,
  args: { websiteId: string; userId: string; workspaceId: string; websiteUrl: string; code: string },
): Promise<{ property: string | null }> {
  const tok = await exchangeCode(args.code);
  if (!tok.refresh_token) {
    throw new Error('Google did not return a refresh token. Remove the app under your Google Account → Security → Third-party access, then reconnect.');
  }
  let email = '';
  try {
    const ui = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (ui.ok) email = (await ui.json())?.email || '';
  } catch { /* non-fatal */ }
  const sites = await listSites(tok.access_token);
  const property = matchProperty(sites, domainOf(args.websiteUrl));
  const expiresAt = new Date(Date.now() + (Number(tok.expires_in || 3600) * 1000)).toISOString();

  const { error: upErr } = await supabase.from('website_gsc_connections').upsert({
    website_id: args.websiteId, workspace_id: args.workspaceId,
    google_email: email || null, property,
    access_token: tok.access_token, refresh_token: tok.refresh_token,
    token_expires_at: expiresAt, scope: tok.scope || GOOGLE_SCOPE,
    connected_by: args.userId, connected_at: new Date().toISOString(),
    is_active: true, last_sync_error: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'website_id' });
  if (upErr) throw new Error(upErr.message);

  if (property) {
    try {
      const { data: fresh } = await supabase.from('website_gsc_connections')
        .select('website_id, workspace_id, property, access_token, refresh_token, token_expires_at').eq('website_id', args.websiteId).single();
      const end = ymd(new Date(Date.now() - 1 * 86400000));
      const start = ymd(new Date(Date.now() - 28 * 86400000));
      await syncConnection(supabase, fresh, start, end);
      await supabase.from('website_gsc_connections').update({ last_sync_at: new Date().toISOString() }).eq('website_id', args.websiteId);
    } catch (e) {
      await supabase.from('website_gsc_connections').update({ last_sync_error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq('website_id', args.websiteId);
    }
  }
  return { property };
}

// ── handler ──────────────────────────────────────────────────────────────────────
Deno.serve(withApiLogging('gsc-api', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  await bootstrapForFunction();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── GET: Google's server-side OAuth redirect target ──
  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    const err = q.get('error');
    if (err) return redirectToApp({ gsc: 'error', msg: err.slice(0, 120) });
    const code = q.get('code'); const state = q.get('state') || '';
    if (!code) return redirectToApp({ gsc: 'error', msg: 'missing_code' });
    const st = await verifyState(state);
    if (!st) return redirectToApp({ gsc: 'error', msg: 'invalid_state' });
    const { data: website } = await supabase.from('user_websites')
      .select('id, workspace_id, url').eq('id', st.websiteId).maybeSingle();
    if (!website) return redirectToApp({ gsc: 'error', msg: 'website_not_found' });
    try {
      const { property } = await finishConnect(supabase, {
        websiteId: website.id, userId: st.userId, workspaceId: website.workspace_id, websiteUrl: website.url, code,
      });
      return redirectToApp({ gsc: property ? 'connected' : 'pick_property', website: website.id });
    } catch (e) {
      return redirectToApp({ gsc: 'error', website: website.id, msg: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');

  // ── Cron: refresh every active, property-bound connection ──
  if (action === 'cron-sync') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: conns } = await supabase.from('website_gsc_connections')
      .select('website_id, workspace_id, property, access_token, refresh_token, token_expires_at')
      .eq('is_active', true).not('property', 'is', null).not('refresh_token', 'is', null);
    const end = ymd(new Date(Date.now() - 1 * 86400000));
    const start = ymd(new Date(Date.now() - 5 * 86400000));
    let ok = 0, failed = 0, rows = 0;
    for (const c of conns || []) {
      try {
        rows += await syncConnection(supabase, c, start, end);
        await supabase.from('website_gsc_connections').update({ last_sync_at: new Date().toISOString(), last_sync_error: null }).eq('website_id', c.website_id);
        ok++;
      } catch (e) {
        failed++;
        await supabase.from('website_gsc_connections').update({ last_sync_error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq('website_id', c.website_id);
      }
    }
    const cutoff = ymd(new Date(Date.now() - 180 * 86400000));
    await supabase.from('gsc_performance').delete().lt('date', cutoff);
    await supabase.from('gsc_breakdown').delete().lt('date', cutoff);
    return json({ ok: true, synced: ok, failed, rows });
  }

  // ── User actions require a JWT ──
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  const websiteId = String(body?.website_id || '');
  if (!websiteId) return json({ error: 'website_id required' }, 400);
  const { data: website } = await supabase.from('user_websites').select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ error: 'Website not found' }, 404);
  if (!(await userCanAccessWorkspace(supabase, userId, website.workspace_id))) {
    return json({ error: 'Website not found' }, 404); // 404, not 403 — no id enumeration
  }

  try {
    switch (action) {
      case 'authorize': {
        if (!GOOGLE_CLIENT_ID()) return json({ error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET under Operations → Keys.' }, 400);
        const state = await signState(websiteId, userId);
        const u = new URL(AUTH_URL);
        u.searchParams.set('client_id', GOOGLE_CLIENT_ID());
        u.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI());
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('scope', GOOGLE_SCOPE);
        u.searchParams.set('access_type', 'offline');
        u.searchParams.set('include_granted_scopes', 'true');
        u.searchParams.set('prompt', 'consent');
        u.searchParams.set('state', state);
        return json({ ok: true, auth_url: u.toString() });
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

        // Verify against Google before storing (#364 EX-8) — the OAuth account must actually
        // hold the property, and the property must cover this website's domain.
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, access_token, refresh_token, token_expires_at').eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Not connected' }, 400);
        const sites = await listSites(await validAccessToken(supabase, conn));
        const claimErr = propertyClaimError(sites, property, website.url);
        if (claimErr) return json({ error: claimErr }, 403);

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
