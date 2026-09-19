/** gsc-api — Google Search Console integration for connected websites. */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { inspectSiteUrls, buildInspectionQueue, INSPECT_QUOTA_PER_DAY } from './urlInspection.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import {
  GA_BREAKDOWNS, GA_COHORT, GA_FUNNELS, GA_FUNNEL_MIN_STEPS, GA_REALTIME,
  type GaBreakdownSpec,
} from '../_shared/gaVocabulary.generated.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Lazy getters so the platform_secrets bootstrap (run at handler entry) is honored.
const GOOGLE_CLIENT_ID = () => Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = () => Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const APP_URL = () => (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
// The redirect_uri sent to Google (and echoed at token-exchange) — this function itself.
// Register THIS exact URL in the Google client. Override via GOOGLE_OAUTH_REDIRECT_URI only if needed.
const GOOGLE_REDIRECT_URI = () => Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI') || `${SUPABASE_URL}/functions/v1/gsc-api`;

// Analytics rides the SAME Google grant. `include_granted_scopes=true` on the consent
// URL means asking for this later MERGES it into the existing authorization rather than
// replacing it, so widening the scope cannot break a working Search Console connection —
// the user re-consents once and keeps both.
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly openid email';
const GA_ADMIN_URL = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries';
const GA_DATA_URL = (prop: string) => `https://analyticsdata.googleapis.com/v1beta/${prop}:runReport`;
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

/** Is `property` a property this connected website may legitimately claim? */
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
async function gaMeasurementId(token: string, property: string): Promise<string | null> {
  try {
    const r = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${property}/dataStreams?pageSize=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    for (const s of j.dataStreams || []) {
      if (s?.webStreamData?.measurementId) return s.webStreamData.measurementId as string;
    }
  } catch { /* the picker is more useful without it than not at all */ }
  return null;
}

/** GA4 properties the connected Google account can read. */
async function listGaProperties(token: string): Promise<Array<{ property: string; name: string; account: string; measurement_id?: string | null }>> {
  const resp = await fetch(`${GA_ADMIN_URL}?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } });
  const jsonBody = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // 403 here is almost always the Analytics Admin API not being enabled on the
    // Cloud project, which is a console setting no amount of retrying fixes. Say so.
    const msg = jsonBody?.error?.message || `HTTP ${resp.status}`;
    throw new Error(
      resp.status === 403
        ? `Google refused the Analytics request (${msg}). Enable the Google Analytics Admin API and Data API on the Cloud project behind these OAuth credentials.`
        : `Analytics property list failed: ${msg}`,
    );
  }
  const out: Array<{ property: string; name: string; account: string; measurement_id?: string | null }> = [];
  for (const acct of jsonBody.accountSummaries || []) {
    for (const p of acct.propertySummaries || []) {
      out.push({ property: p.property, name: p.displayName || p.property, account: acct.displayName || '' });
    }
  }
  for (const p of out.slice(0, 40)) p.measurement_id = await gaMeasurementId(token, p.property);
  return out;
}

/**
 * Pull daily GA4 rows for one property.
 *
 * Two reports rather than one: a totals report and a channel breakdown. Asking for
 * date × channel alone and summing the channels client-side would be a SECOND
 * derivation of the daily total, and the two disagree the moment Google applies
 * thresholding to a sparse channel.
 */
async function gaRunReport(
  token: string, property: string, startDate: string, endDate: string, withChannel: boolean,
): Promise<any[]> {
  const dimensions = withChannel
    ? [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }]
    : [{ name: 'date' }];
  const resp = await fetch(GA_DATA_URL(property), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions,
      metrics: [
        { name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' },
        { name: 'engagedSessions' }, { name: 'conversions' }, { name: 'totalRevenue' },
        { name: 'bounceRate' }, { name: 'averageSessionDuration' },
      ],
      limit: 10000,
    }),
  });
  const jsonBody = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(jsonBody?.error?.message || `Analytics report failed: HTTP ${resp.status}`);
  return jsonBody.rows || [];
}

const gaNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface GaCapabilities { dimensions: Set<string>; metrics: Set<string> }

async function gaCapabilities(token: string, property: string): Promise<GaCapabilities | null> {
  try {
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}/metadata`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      dimensions: new Set<string>((j.dimensions || []).map((d: any) => d.apiName).filter(Boolean)),
      metrics: new Set<string>((j.metrics || []).map((m: any) => m.apiName).filter(Boolean)),
    };
  } catch {
    return null;
  }
}

interface ResolvedSpec {
  dimensions: string[];
  limit: number;
  metrics: { ga: string; col: string }[];
  /** What the property does not have, for the note. */
  missing: string[];
}

function resolveSpec(spec: GaBreakdownSpec, caps: GaCapabilities | null): ResolvedSpec {
  if (!caps) {
    return { dimensions: [...spec.dimensions], limit: spec.limit, metrics: spec.metrics.map((m) => ({ ga: m.ga, col: m.col })), missing: [] };
  }
  const missing: string[] = [];
  const dimensions = spec.dimensions.filter((d) => {
    if (caps.dimensions.has(d)) return true;
    missing.push(d);
    return false;
  });
  const metrics: { ga: string; col: string }[] = [];
  for (const m of spec.metrics) {
    const name = caps.metrics.has(m.ga) ? m.ga : (m.alt && caps.metrics.has(m.alt) ? m.alt : null);
    if (name) metrics.push({ ga: name, col: m.col });
    else missing.push(m.alt ? `${m.ga}/${m.alt}` : m.ga);
  }
  return { dimensions, limit: spec.limit, metrics, missing };
}

/** One GA4 breakdown report, mapped onto the `ga_breakdown` column set. */
async function gaBreakdownReport(
  token: string, property: string, spec: ResolvedSpec, startDate: string, endDate: string,
  withDate = false,
): Promise<Record<string, unknown>[]> {
  const resp = await fetch(GA_DATA_URL(property), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: (withDate ? ['date', ...spec.dimensions] : spec.dimensions).map((name) => ({ name })),
      metrics: spec.metrics.map((m) => ({ name: m.ga })),
      // Ordered by the FIRST metric, which is what `limit` then truncates against — sessions for
      // everything except events and products, which are counted rather than sessionised.
      orderBys: [{ desc: true, metric: { metricName: spec.metrics[0].ga } }],
      limit: withDate ? 20000 : spec.limit,
    }),
  });
  let body: any;
  if (resp.ok) {
    try {
      body = await resp.json();
    } catch (e) {
      throw new Error(`GA returned 200 with an unreadable body: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    body = await resp.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${resp.status}`);
  }
  return (body.rows || []).map((r: any) => {
    const d = r.dimensionValues || [];
    const m = r.metricValues || [];
    // With `date` prepended the identity shifts one place right; nothing else about the row moves.
    const off = withDate ? 1 : 0;
    const raw = String(d[0]?.value || '');
    const out: Record<string, unknown> = {
      value: d[off]?.value ?? '',
      label: spec.dimensions.length > 1 ? (d[off + 1]?.value ?? null) : null,
    };
    if (withDate) out.date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    spec.metrics.forEach((bind, i) => { out[bind.col] = gaNum(m[i]?.value); });
    return out;
  });
}

/**
 * One report per breakdown, each recording its own outcome. A dimension GA rejects must not take
 * the others down, and "we could not fetch this" has to reach the panel as a stated reason.
 */
async function syncGaBreakdowns(
  supabase: any, websiteId: string, workspaceId: string, property: string, token: string,
  startDate: string, endDate: string, windowDays: number,
): Promise<{ ok: number; failed: string[]; unsupported: string[]; rows: number; capabilities: boolean; events: Set<string> }> {
  const failed: string[] = [];
  const unsupported: string[] = [];
  const events = new Set<string>();
  let ok = 0;
  let rows = 0;

  const caps = await gaCapabilities(token, property);

  for (const spec of GA_BREAKDOWNS) {
    const resolved = resolveSpec(spec, caps);
    let status = 'ok';
    let error: string | null = null;
    let payload: Record<string, unknown>[] = [];
    let daily: Record<string, unknown>[] | null = null;

    // Cannot answer the question at all: not a failure, and not an absence of visitors.
    if (resolved.dimensions.length < spec.dimensions.length || !resolved.metrics.length) {
      status = 'not_supported';
      error = `This property does not report ${resolved.missing.join(', ')}`
        + (spec.requires ? ` — it needs ${spec.requires}.` : '.');
      unsupported.push(spec.key);
    } else {
      try {
        payload = await gaBreakdownReport(token, property, resolved, startDate, endDate);
        if (!payload.length) status = 'no_data';
        // A trend failure costs the sparkline, never the row — caught separately on purpose.
        if (status === 'ok' && spec.daily) {
          try {
            daily = await gaBreakdownReport(token, property, resolved, startDate, endDate, true);
          } catch { daily = null; }
        }
      } catch (e) {
        status = 'collector_failed';
        error = String(e instanceof Error ? e.message : e).slice(0, 900);
        failed.push(spec.key);
      }
    }

    const { error: rpcErr } = await supabase.rpc('ga_replace_breakdown', {
      p_website_id: websiteId, p_dimension: spec.key, p_window_days: windowDays,
      p_period_start: startDate, p_period_end: endDate,
      p_rows: payload, p_status: status, p_error: error, p_daily: daily,
    });
    if (rpcErr) {
      failed.push(`${spec.key}:store`);
      await supabase.from('ga_breakdown_status').upsert({
        website_id: websiteId, workspace_id: workspaceId, dimension: spec.key,
        status: 'collector_failed',
        error: `could not store this breakdown: ${rpcErr.message}`.slice(0, 1000),
        window_days: windowDays, period_start: startDate, period_end: endDate,
        row_count: 0, captured_at: new Date().toISOString(),
      }, { onConflict: 'website_id,dimension' });
      continue;
    }
    // Which events this property fires — the funnel picks its ladder from this.
    if (spec.key === 'event' && status === 'ok') {
      for (const r of payload) { const v = String(r.value ?? ''); if (v) events.add(v); }
    }
    if (status === 'ok' || status === 'no_data') { ok++; rows += payload.length; }
  }
  return { ok, failed, unsupported, rows, capabilities: !!caps, events };
}

async function syncGaFunnel(
  supabase: any, websiteId: string, property: string, token: string,
  startDate: string, endDate: string, windowDays: number, presentEvents: Set<string>,
): Promise<string> {
  let best: { ladder: typeof GA_FUNNELS[number]; steps: typeof GA_FUNNELS[number]['steps'] } | null = null;
  for (const ladder of GA_FUNNELS) {
    const steps = ladder.steps.filter((st) => presentEvents.has(st.event));
    if (steps.length >= GA_FUNNEL_MIN_STEPS && (!best || steps.length > best.steps.length)) {
      best = { ladder, steps };
    }
  }

  if (!best) {
    const wanted = GA_FUNNELS.map((l) => `${l.label} (${l.steps.map((st) => st.event).join(' → ')})`).join('; ');
    await supabase.rpc('ga_replace_funnel', {
      p_website_id: websiteId, p_ladder: 'none', p_window_days: windowDays,
      p_period_start: startDate, p_period_end: endDate, p_rows: null, p_status: 'not_supported',
      p_error: `This property does not report enough of a recognised journey to draw one. Wanted at least ${GA_FUNNEL_MIN_STEPS} steps of: ${wanted}`,
    });
    return 'not_supported';
  }

  let status = 'ok';
  let error: string | null = null;
  let rows: Record<string, unknown>[] = [];
  try {
    const resp = await fetch(`https://analyticsdata.googleapis.com/v1alpha/${property}:runFunnelReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        funnel: {
          steps: best.steps.map((st) => ({
            name: st.label,
            filterExpression: { funnelEventFilter: { eventName: st.event } },
          })),
        },
      }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j?.error?.message || `runFunnelReport: HTTP ${resp.status}`);
    }
    const body = await resp.json();
    const table = body.funnelTable || {};
    const metricNames: string[] = (table.metricHeaders || []).map((h: any) => h.name);
    const idx = (name: string) => metricNames.indexOf(name);

    rows = (table.rows || []).map((r: any, i: number) => {
      const m = r.metricValues || [];
      const at = (name: string) => {
        const k = idx(name);
        return k >= 0 ? gaNum(m[k]?.value) : null;
      };
      const step = best!.steps[i];
      return {
        step_index: i,
        step_label: step?.label ?? r.dimensionValues?.[0]?.value ?? `Step ${i + 1}`,
        event_name: step?.event ?? '',
        active_users: at('activeUsers'),
        completion_rate: at('funnelStepCompletionRate'),
        abandonments: at('funnelStepAbandonments'),
        abandonment_rate: at('funnelStepAbandonmentRate'),
      };
    });
    if (!rows.length) status = 'no_data';
  } catch (e) {
    status = 'collector_failed';
    error = String(e instanceof Error ? e.message : e).slice(0, 900);
  }

  await supabase.rpc('ga_replace_funnel', {
    p_website_id: websiteId, p_ladder: best.ladder.key, p_window_days: windowDays,
    p_period_start: startDate, p_period_end: endDate, p_rows: rows, p_status: status, p_error: error,
  });
  return status;
}

async function syncGaCohorts(
  supabase: any, websiteId: string, property: string, token: string, windowDays: number,
): Promise<string> {
  const weeks = GA_COHORT.weeks;
  const day = 86400000;
  // Whole weeks from the last COMPLETE day — never a part week posing as a full one.
  const end = new Date(Date.now() - day);
  const cohorts = Array.from({ length: weeks }, (_, i) => {
    const from = new Date(end.getTime() - (weeks - i) * 7 * day);
    const to = new Date(from.getTime() + 6 * day);
    return { name: `cohort_${i}`, start: ymd(from), end: ymd(to) };
  });

  let status = 'ok';
  let error: string | null = null;
  let rows: Record<string, unknown>[] = [];
  try {
    const resp = await fetch(GA_DATA_URL(property), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cohortSpec: {
          cohorts: cohorts.map((c) => ({
            cohort: c.name,
            dimension: 'firstSessionDate',
            dateRange: { startDate: c.start, endDate: c.end },
          })),
          cohortsRange: { granularity: GA_COHORT.granularity, startOffset: 0, endOffset: weeks - 1 },
        },
        dimensions: [{ name: 'cohort' }, { name: 'cohortNthWeek' }],
        metrics: [{ name: 'cohortActiveUsers' }, { name: 'cohortTotalUsers' }],
        limit: 500,
      }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j?.error?.message || `cohort report: HTTP ${resp.status}`);
    }
    const body = await resp.json();
    const byName = new Map(cohorts.map((c) => [c.name, c]));
    rows = (body.rows || []).map((r: any) => {
      const d = r.dimensionValues || [];
      const m = r.metricValues || [];
      const name = String(d[0]?.value ?? '');
      const c = byName.get(name);
      // GA returns the offset as `0000` — a string that parses but does not compare.
      const nth = Number(String(d[1]?.value ?? '').replace(/\D/g, '')) || 0;
      return {
        cohort_label: c ? `Week of ${c.start}` : name,
        cohort_start: c?.start ?? null,
        nth_period: nth,
        active_users: gaNum(m[0]?.value),
        total_users: gaNum(m[1]?.value),
      };
    });
    if (!rows.length) status = 'no_data';
  } catch (e) {
    status = 'collector_failed';
    error = String(e instanceof Error ? e.message : e).slice(0, 900);
  }

  await supabase.rpc('ga_replace_cohort', {
    p_website_id: websiteId, p_window_days: windowDays,
    p_period_start: cohorts[0].start, p_period_end: ymd(end),
    p_rows: rows, p_status: status, p_error: error,
  });
  return status;
}

async function gaRealtime(token: string, property: string): Promise<{
  active_users: number | null;
  pages: { value: string; users: number }[];
  countries: { value: string; users: number }[];
  devices: { value: string; users: number }[];
}> {
  const call = async (dimension: string) => {
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runRealtimeReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dimensions: [{ name: dimension }],
        metrics: [{ name: GA_REALTIME.metric }],
        orderBys: [{ desc: true, metric: { metricName: GA_REALTIME.metric } }],
        limit: GA_REALTIME.limit,
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j?.error?.message || `realtime ${dimension}: HTTP ${r.status}`);
    }
    const j = await r.json();
    return (j.rows || []).map((row: any) => ({
      value: row.dimensionValues?.[0]?.value ?? '(not set)',
      users: Number(row.metricValues?.[0]?.value ?? 0) || 0,
    }));
  };

  const [pages, countries, devices] = await Promise.all(
    GA_REALTIME.dimensions.map((d) => call(d)),
  );
  // From the DEVICE split — every session has exactly one. Pages would double-count open tabs.
  const active = devices.reduce((n: number, d: any) => n + d.users, 0);
  return { active_users: active, pages, countries, devices };
}

/** Map GA4 report rows onto ga_performance and upsert them. */
async function storeGaRows(
  supabase: any, websiteId: string, workspaceId: string, rows: any[], withChannel: boolean,
): Promise<number> {
  const out = rows.map((r) => {
    const d = r.dimensionValues || [];
    const m = r.metricValues || [];
    const raw = String(d[0]?.value || '');
    return {
      website_id: websiteId, workspace_id: workspaceId,
      // GA4 returns YYYYMMDD; the column is a date.
      date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
      channel: withChannel ? (d[1]?.value || 'unknown') : 'total',
      sessions: gaNum(m[0]?.value), active_users: gaNum(m[1]?.value),
      new_users: gaNum(m[2]?.value), engaged_sessions: gaNum(m[3]?.value),
      conversions: gaNum(m[4]?.value), total_revenue: gaNum(m[5]?.value),
      bounce_rate: gaNum(m[6]?.value), avg_session_secs: gaNum(m[7]?.value),
    };
  }).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  if (!out.length) return 0;
  const { error } = await supabase.from('ga_performance').upsert(out, { onConflict: 'website_id,date,channel' });
  if (error) throw new Error(error.message);
  return out.length;
}

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

  // ── Cron: ask Google what it has crawled and indexed ──
  // Separate from cron-sync on purpose: performance rows are a 5-day window refreshed daily,
  // while inspection is a 2,000/day-per-site backfill that takes days to walk a real sitemap.
  // Sharing a schedule would either starve the backfill or re-pull performance data hourly.
  if (action === 'cron-inspect') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: conns } = await supabase.from('website_gsc_connections')
      .select('website_id, workspace_id, property, access_token, refresh_token, token_expires_at')
      .eq('is_active', true).not('property', 'is', null).not('refresh_token', 'is', null);
    const results: unknown[] = [];
    for (const c of conns || []) {
      try {
        const token = await validAccessToken(supabase, c);
        const queue = await buildInspectionQueue(supabase, c.website_id, INSPECT_QUOTA_PER_DAY);
        const r = await inspectSiteUrls(supabase, c, token, queue);
        results.push({ website_id: c.website_id, ...r });
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
        // Recorded against the connection, not swallowed: a collector that fails silently is
        // indistinguishable from one that found nothing.
        await supabase.from('website_gsc_connections').update({ last_sync_error: msg }).eq('website_id', c.website_id);
        results.push({ website_id: c.website_id, error: msg });
      }
    }
    return json({ ok: true, sites: results });
  }
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

    // The day's rows have landed, so this is the moment the keyword engine has
    // something new to judge: promote the queries that now clear the bar, retire the
    // automatic ones whose evidence is gone. Runs only for sites that opted in, and
    // records its own outcome per site — a sweep that says nothing is indistinguishable
    // from one that never ran.
    let autotrack: unknown = null;
    try {
      const { data: sweep, error: sweepErr } = await supabase.rpc('seo_autotrack_sweep', { p_website_id: null });
      if (sweepErr) throw new Error(sweepErr.message);
      autotrack = sweep;
    } catch (e) {
      autotrack = { error: String(e instanceof Error ? e.message : e).slice(0, 300) };
      console.warn('[gsc-api] autotrack sweep failed:', autotrack);
    }
    return json({ ok: true, synced: ok, failed, rows, autotrack });
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

      // ── Google Analytics 4, on the same Google grant ──
      case 'ga_list_properties': {
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, access_token, refresh_token, token_expires_at').eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Connect Google first.' }, 400);
        const props = await listGaProperties(await validAccessToken(supabase, conn));
        return json({ ok: true, properties: props });
      }

      case 'ga_set_property': {
        const prop = String(body?.ga_property_id || '');
        // `properties/123` is the only form the Data API accepts; a bare id or a
        // measurement id (G-XXXX) fails later with an opaque 400.
        if (!/^properties\/\d+$/.test(prop)) {
          return json({ error: 'Pick a property — it must look like properties/123456789.' }, 400);
        }
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, access_token, refresh_token, token_expires_at').eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Connect Google first.' }, 400);

        // Verify the connected account actually holds it before storing, same rule
        // the Search Console property follows — storing an unverified id turns a
        // permissions problem into a silent empty chart.
        const props = await listGaProperties(await validAccessToken(supabase, conn));
        const match = props.find((p) => p.property === prop);
        if (!match) return json({ error: 'This Google account cannot read that Analytics property.' }, 403);

        const { error } = await supabase.from('website_gsc_connections')
          .update({
            ga_property_id: prop, ga_property_name: match.name,
            ga_measurement_id: match.measurement_id ?? null, ga_last_sync_error: null,
          })
          .eq('website_id', websiteId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, ga_property_id: prop, ga_property_name: match.name, ga_measurement_id: match.measurement_id ?? null });
      }

      case 'ga_realtime': {
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, ga_property_id, access_token, refresh_token, token_expires_at')
          .eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Connect Google first.' }, 400);
        if (!conn.ga_property_id) return json({ error: 'No Analytics property selected for this site yet.' }, 400);
        try {
          const token = await validAccessToken(supabase, conn);
          return json({ ok: true, ...(await gaRealtime(token, conn.ga_property_id)) });
        } catch (e) {
          // Never zero: nobody on the site and we could not ask are different answers.
          return json({ ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 400) }, 502);
        }
      }

      case 'ga_sync': {
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, workspace_id, ga_property_id, access_token, refresh_token, token_expires_at')
          .eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Connect Google first.' }, 400);
        if (!conn.ga_property_id) return json({ error: 'No Analytics property selected for this site yet.' }, 400);
        const days = Math.min(Math.max(Number(body?.days) || 28, 1), 365);
        const end = ymd(new Date(Date.now() - 86400000));
        const start = ymd(new Date(Date.now() - days * 86400000));
        try {
          const token = await validAccessToken(supabase, conn);
          // Totals and channels are separate reports on purpose — summing channels
          // to get the total would be a second derivation, and the two diverge as
          // soon as Google thresholds a sparse channel.
          const totals = await gaRunReport(token, conn.ga_property_id, start, end, false);
          const byChannel = await gaRunReport(token, conn.ga_property_id, start, end, true);
          const n = await storeGaRows(supabase, websiteId, website.workspace_id, totals, false)
                  + await storeGaRows(supabase, websiteId, website.workspace_id, byChannel, true);
          // Each records its own outcome, so a dimension GA rejects leaves the other nine intact.
          const bd = await syncGaBreakdowns(
            supabase, websiteId, website.workspace_id, conn.ga_property_id, token, start, end, days,
          );
          const funnel = await syncGaFunnel(
            supabase, websiteId, conn.ga_property_id, token, start, end, days, bd.events,
          );
          const cohorts = await syncGaCohorts(supabase, websiteId, conn.ga_property_id, token, days);
          await supabase.from('website_gsc_connections')
            .update({ ga_last_sync_at: new Date().toISOString(), ga_last_sync_error: null })
            .eq('website_id', websiteId);
          return json({ ok: true, rows: n, days, breakdowns: { ...bd, events: bd.events.size }, funnel, cohorts });
        } catch (e) {
          const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
          // Recorded, not swallowed: an Analytics panel that is empty because the
          // sync failed must not look like an Analytics panel with no traffic.
          await supabase.from('website_gsc_connections')
            .update({ ga_last_sync_error: msg }).eq('website_id', websiteId);
          return json({ ok: false, error: msg }, 502);
        }
      }

      case 'inspect_urls': {
        const { data: conn } = await supabase.from('website_gsc_connections')
          .select('website_id, workspace_id, property, access_token, refresh_token, token_expires_at').eq('website_id', websiteId).maybeSingle();
        if (!conn?.refresh_token) return json({ error: 'Not connected' }, 400);
        if (!conn.property) return json({ error: 'No Search Console property selected for this site yet.' }, 400);
        const want = Math.min(Math.max(Number(body?.limit) || 50, 1), INSPECT_QUOTA_PER_DAY);
        try {
          const token = await validAccessToken(supabase, conn);
          const queue = await buildInspectionQueue(supabase, websiteId, want);
          const r = await inspectSiteUrls(supabase, conn, token, queue);
          return json({ ok: true, ...r });
        } catch (e) {
          const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
          await supabase.from('website_gsc_connections').update({ last_sync_error: msg }).eq('website_id', websiteId);
          return json({ ok: false, error: msg }, 400);
        }
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
