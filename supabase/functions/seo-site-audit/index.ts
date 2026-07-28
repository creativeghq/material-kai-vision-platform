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
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';

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

// DataForSEO instant-page `checks` that mean a real problem when true. (Other checks like
// seo_friendly_url / has_html_doctype are GOOD when true, so we only whitelist negatives.)
const BAD_CHECKS: Record<string, string> = {
  no_title: 'Missing <title>', title_too_long: 'Title too long', title_too_short: 'Title too short',
  no_description: 'Missing meta description', no_h1_tag: 'Missing H1 heading', no_image_alt: 'Images missing alt text',
  no_favicon: 'Missing favicon', no_doctype: 'Missing doctype', is_http: 'Not served over HTTPS',
  high_loading_time: 'Slow page load', high_waiting_time: 'High server response time', large_page_size: 'Large page size',
  low_content_rate: 'Thin content', low_readability_rate: 'Low readability', duplicate_title_tag: 'Duplicate title tag',
  duplicate_meta_tags: 'Duplicate meta tags', duplicate_description: 'Duplicate meta description',
  no_content_encoding: 'No gzip/brotli compression', has_render_blocking_resources: 'Render-blocking resources',
  redirect: 'Homepage redirects', is_4xx_code: 'Returns a 4xx error', is_5xx_code: 'Returns a 5xx error',
  canonical_another_domain: 'Canonical points to another domain', has_meta_refresh_redirect: 'Uses meta-refresh redirect',
  frame: 'Uses <frame>/<iframe> for content', lorem_ipsum: 'Contains placeholder (lorem ipsum) text',
  broken_links: 'Has broken links', broken_resources: 'Has broken resources', irrelevant_description: 'Meta description looks irrelevant',
  irrelevant_title: 'Title looks irrelevant', small_page_size: 'Very small page (possibly empty)',
};

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

    // Google Lighthouse is async on DataForSEO and often empty in the sync window — treat as a bonus.
    const cats = (sections?.lighthouse?.items?.[0]?.categories) || {};
    // The synchronous signal is the instant on-page audit.
    const ip = sections?.instant_page?.items?.[0] || {};
    const checks = ip?.checks || {};

    // Failing on-page checks → issues (score is the on-page score for context, not per-check).
    const issues = Object.entries(BAD_CHECKS)
      .filter(([k]) => checks[k] === true || ip[k] === true)
      .map(([, title]) => ({ title, score: null as number | null, display_value: null as string | null }));
    if ((ip.broken_links ?? 0) > 0 && !issues.some((i) => i.title.includes('broken links')))
      issues.push({ title: `Broken links: ${ip.broken_links}`, score: null, display_value: null });

    // Prefer the Lighthouse SEO score when present; else the instant on-page score (0-100).
    const seoScore = pct(cats.seo?.score) ?? (typeof ip.onpage_score === 'number' ? Math.round(ip.onpage_score) : null);

    const row = {
      website_id: website.id, workspace_id: website.workspace_id, url: homepage, status: 'ok',
      perf_score: pct(cats.performance?.score), a11y_score: pct(cats.accessibility?.score),
      bp_score: pct(cats['best-practices']?.score), seo_score: seoScore,
      lighthouse: Object.keys(cats).length ? { categories: cats } : null,
      onpage: { onpage_score: ip.onpage_score ?? null, meta: ip.meta ?? null, page_timing: ip.page_timing ?? null, checks },
      issues, error: null,
    };
    // Previous on-page score (for the week-over-week change alert) — read BEFORE insert.
    const { data: prevRows } = await supabase.from('website_health_audits')
      .select('seo_score, created_at').eq('website_id', website.id).eq('status', 'ok')
      .order('created_at', { ascending: false }).limit(1);
    const prevScore: number | null = prevRows?.[0]?.seo_score ?? null;

    const { error } = await supabase.from('website_health_audits').insert(row);
    if (error) throw new Error(error.message);

    // Alert on a material on-page score change (regressed ≥10 pts, or recovered ≥15 pts).
    try {
      const cur = row.seo_score;
      if (prevScore != null && cur != null) {
        const delta = cur - prevScore;
        const regressed = delta <= -10, recovered = delta >= 15;
        if (regressed || recovered) {
          const domain = homepage.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
          await emitFlowEventToWorkspaceRoles(website.workspace_id, ['owner', 'admin'], 'seo.site_health_changed', (uid) => ({
            user_id: uid, workspace_id: website.workspace_id,
            title: `Site health ${regressed ? 'dropped' : 'recovered'} for ${domain}`,
            body: `On-page SEO score ${regressed ? 'fell' : 'rose'} from ${prevScore} to ${cur} since the last audit.`,
            action_url: '/profile?tab=websites', type: regressed ? 'warning' : 'success',
            website_id: website.id, domain, direction: regressed ? 'regressed' : 'recovered',
            previous_score: prevScore, current_score: cur,
          }));
        }
      }
    } catch (e) { console.warn('[seo-site-audit] health alert failed:', e instanceof Error ? e.message : e); }

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
