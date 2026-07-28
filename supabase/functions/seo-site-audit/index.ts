/**
 * seo-site-audit — Site Health for connected websites.
 *
 * Runs a SYNCHRONOUS homepage audit via MIVAA's onpage/quick-page route (DataForSEO
 * instant-page + Google Lighthouse) and stores it in website_health_audits. The full
 * multi-page OnPage crawl stays on-demand via the agent tools (seo_site_crawl_start).
 *
 * Actions (user JWT): run — audit one website now.
 * Action (x-cron-secret): cron-run — weekly audit of every active connected website + prune.
 *
 * verify_jwt is disabled at the gateway (see config.toml) so cron works; the user action
 * calls authenticate() + userCanAccessWorkspace() (invariant #1).
 */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_GATEWAY_URL = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const pct = (s: any): number | null => (typeof s === 'number' ? Math.round(s * 100) : null);

/** Call MIVAA's quick-page audit for one URL (instant on-page + Lighthouse). */
async function quickPage(url: string, userId: string | null): Promise<any> {
  const resp = await fetch(`${MIVAA_GATEWAY_URL()}/api/v1/seo-agent/onpage/quick-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    body: JSON.stringify({ url, for_mobile: false, attribution: { user_id: userId } }),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!resp.ok) throw new Error(`quick-page ${resp.status}: ${String(parsed).slice(0, 200)}`);
  return parsed?.data ?? parsed;
}

/** Audit one website and persist the result. Returns the stored summary. */
async function auditWebsite(supabase: any, website: { id: string; workspace_id: string; url: string }, userId: string | null): Promise<any> {
  const homepage = /^https?:\/\//i.test(website.url) ? website.url : `https://${website.url}`;
  try {
    const data = await quickPage(homepage, userId);
    const sections = data?.sections || {};
    const lh = sections?.lighthouse?.items?.[0] || {};
    const cats = lh?.categories || {};
    // Trim Lighthouse audits down to the failing ones (score < 0.9) for the issues list.
    const audits = lh?.audits || {};
    const issues = Object.values(audits)
      .filter((a: any) => a && typeof a.score === 'number' && a.score < 0.9 && a.title)
      .sort((a: any, b: any) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, 20)
      .map((a: any) => ({ title: a.title, score: a.score, display_value: a.display_value ?? a.displayValue ?? null }));

    const row = {
      website_id: website.id, workspace_id: website.workspace_id, url: homepage, status: 'ok',
      perf_score: pct(cats.performance?.score), a11y_score: pct(cats.accessibility?.score),
      bp_score: pct(cats['best-practices']?.score), seo_score: pct(cats.seo?.score),
      lighthouse: { categories: cats }, onpage: sections?.page ?? sections?.instant_pages ?? null,
      issues, error: null,
    };
    const { error } = await supabase.from('website_health_audits').insert(row);
    if (error) throw new Error(error.message);
    return { ok: true, ...row, lighthouse: undefined, onpage: undefined };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await supabase.from('website_health_audits').insert({
      website_id: website.id, workspace_id: website.workspace_id, url: homepage, status: 'error', error: msg,
    });
    return { ok: false, error: msg };
  }
}

Deno.serve(withApiLogging('seo-site-audit', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');

  // ── Cron: weekly audit of every active connected website ──
  if (action === 'cron-run') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: sites } = await supabase.from('user_websites')
      .select('id, workspace_id, url').eq('is_active', true);
    let ok = 0, failed = 0;
    for (const s of sites || []) {
      const r = await auditWebsite(supabase, s, null);
      if (r.ok) ok++; else failed++;
    }
    // Retention: keep 180 days of audit history.
    await supabase.from('website_health_audits').delete().lt('created_at', new Date(Date.now() - 180 * 86400000).toISOString());
    return json({ ok: true, audited: ok, failed });
  }

  // ── User: audit one website now ──
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const websiteId = String(body?.website_id || '');
  if (!websiteId) return json({ error: 'website_id required' }, 400);
  const { data: website } = await supabase.from('user_websites').select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ error: 'Website not found' }, 404);
  if (!(await userCanAccessWorkspace(supabase, auth.userId, website.workspace_id))) {
    return json({ error: 'Website not found' }, 404);
  }
  const result = await auditWebsite(supabase, website, auth.userId);
  return json(result, result.ok ? 200 : 400);
}));
