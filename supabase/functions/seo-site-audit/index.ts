/**
 * seo-site-audit — Site Health for connected websites.
 *
 * TWO audits, deliberately, because they answer different questions:
 *
 *   run          a SYNCHRONOUS homepage audit (instant-page + Lighthouse) → website_health_audits.
 *                Fast, cheap, one URL. Answers "is my front door broken".
 *   crawl-start  an ASYNCHRONOUS multi-page OnPage crawl → website_crawls + website_crawl_issues.
 *                Answers "is my SITE broken" — broken links, redirect chains, duplicate titles,
 *                pages told not to index. None of those are visible one page at a time, which is
 *                why the single-page audit always looked thin.
 *   crawl-sync   poll a running crawl and ingest its issue classes when it finishes.
 *
 * Actions (user JWT): run, crawl-start, crawl-sync.
 * Action (x-cron-secret): cron-run — weekly audit of every active connected website + prune.
 *
 * verify_jwt is disabled at the gateway (see config.toml) so cron works; the user action
 * calls authenticate() + userCanAccessWorkspace() (invariant #1).
 */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { describeUpstreamError } from '../_shared/tool-result-shape.ts';

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
  if (!resp.ok) throw new Error(`quick-page ${describeUpstreamError(resp.status, parsed)}`);
  return parsed?.data ?? parsed;
}

// ── OnPage crawl (async) ────────────────────────────────────────────────────

/** Call the DataForSEO dispatcher for one `kind`. Throws on transport failure. */
async function dfs(kind: string, params: Record<string, unknown>, userId: string | null): Promise<any> {
  const resp = await fetch(`${MIVAA_GATEWAY_URL()}/api/v1/seo-agent/dataforseo/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    body: JSON.stringify({ params, attribution: { user_id: userId } }),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!resp.ok) throw new Error(`${kind} ${describeUpstreamError(resp.status, parsed)}`);
  return parsed?.data ?? {};
}

/**
 * The issue classes worth pulling once a crawl finishes, and what each one MEANS.
 *
 * Severity is assigned here rather than taken from the provider because the
 * provider does not rank them: it returns lists. A list that cannot be sorted by
 * "what actually costs me traffic" is a list nobody works through.
 */
const ISSUE_SECTIONS: Array<{
  kind: string;
  issue_type: string;
  severity: 'error' | 'warning' | 'notice';
  label: string;
  /** EXACTLY the params this endpoint's Python signature declares. */
  params?: Record<string, unknown>;
  /** Applied client-side when the endpoint has no server-side filter for it. */
  filter?: (item: any) => boolean;
}> = [
  // Each of these takes ONLY `task_id`. Passing a blanket `limit` to them returned
  // `HTTP_400 ... got an unexpected keyword argument 'limit'` on every one — the
  // dispatcher forwards params straight into the Python signature, so an extra is a
  // hard failure rather than an ignored field. Every section would have failed.
  { kind: 'onpage_non_indexable',     issue_type: 'non_indexable',     severity: 'error',
    label: 'Page cannot be indexed' },
  { kind: 'onpage_redirect_chains',   issue_type: 'redirect_chain',    severity: 'warning',
    label: 'Redirect chain' },
  { kind: 'onpage_duplicate_tags',    issue_type: 'duplicate_tags',    severity: 'warning',
    label: 'Duplicate title or description' },
  { kind: 'onpage_duplicate_content', issue_type: 'duplicate_content', severity: 'warning',
    label: 'Duplicate content' },
  // `onpage_links` DOES take `limit` but has no `is_broken` server filter, so the
  // broken ones are selected here. Anything without a usable broken flag is dropped
  // rather than reported — an "unknown" link is not a broken link.
  { kind: 'onpage_links',             issue_type: 'broken_link',       severity: 'error',
    label: 'Broken link', params: { limit: 500 },
    filter: (it) => it?.is_broken === true || Number(it?.page_to_status_code) >= 400 },
  // Pages the crawler could not load at all. `onpage_pages` takes `limit`.
  { kind: 'onpage_pages',             issue_type: 'error_page',        severity: 'error',
    label: 'Page returns an error', params: { limit: 500 },
    filter: (it) => Number(it?.status_code) >= 400 },
];


/**
 * Best-effort URL off whatever shape a given OnPage section returns. A redirect
 * chain has no URL of its own — the page that starts it is `chain[0].link_from`;
 * a duplicate-content group names its first page under `pages[0].page.url`.
 */
function issueUrl(item: any): string | null {
  return item?.url || item?.page_address || item?.from_url || item?.link_from || item?.address
    || item?.chain?.[0]?.link_from
    || item?.pages?.[0]?.page?.url || item?.pages?.[0]?.url
    || null;
}

/**
 * Poll one crawl; when the provider says it is done, pull each issue class and
 * store it. Each section is recorded in `section_status` independently: a section
 * that failed is UNKNOWN, and reporting "0 broken links" because the broken-links
 * pull errored is the same defect as reporting 0 backlinks for a failed fetch.
 */
async function syncCrawl(supabase: any, crawl: any, userId: string | null): Promise<any> {
  if (!crawl.task_id) return { ok: false, error: 'crawl has no task id' };
  let summary: any;
  try {
    const r = await dfs('onpage_summary', { task_id: crawl.task_id }, userId);
    summary = (r.items || [])[0] || {};
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 400);
    await supabase.from('website_crawls').update({ status: 'failed', error: msg, finished_at: new Date().toISOString() }).eq('id', crawl.id);
    return { ok: false, error: msg };
  }

  const info = summary.crawl_status || {};
  const metrics = summary.page_metrics || {};
  const done = Number(info.pages_in_queue ?? 0) === 0 && Number(info.pages_crawled ?? 0) > 0;
  const patch: Record<string, unknown> = {
    pages_crawled: info.pages_crawled ?? null,
    // `onpage_score` sits on page_metrics, NOT at the top of the summary. Reading it
    // from the root returned undefined and stored NULL on every crawl — the same
    // silent-null shape as the Lighthouse categories.
    onpage_score: typeof metrics.onpage_score === 'number' ? metrics.onpage_score : null,
    summary,
  };

  if (!done) {
    await supabase.from('website_crawls').update(patch).eq('id', crawl.id);
    return { ok: true, status: 'running', pages_crawled: info.pages_crawled ?? 0 };
  }

  // Finished — pull every issue class. Replace this crawl's rows wholesale so a
  // re-sync cannot double-count.
  await supabase.from('website_crawl_issues').delete().eq('crawl_id', crawl.id);
  const sectionStatus: Record<string, string> = {};
  const rows: any[] = [];

  for (const section of ISSUE_SECTIONS) {
    try {
      // Only the params this endpoint declares — see ISSUE_SECTIONS.
      const r = await dfs(section.kind, { task_id: crawl.task_id, ...(section.params || {}) }, userId);
      // An OnPage section answers with a task envelope — `{crawl_progress, items_count,
      // items: [...]}` — and when the section is EMPTY the dispatcher hands that envelope
      // back as the one item (`items: null`). Stored as an issue it became "Cannot be
      // indexed: 1" with no URL and nothing to fix; two of those sat on materialshub.gr
      // for a week. An envelope is unwrapped to its inner items, and an empty one is
      // nothing found.
      const all: any[] = (r.items || []).flatMap((it: any) =>
        it && typeof it === 'object' && ('crawl_progress' in it || 'items_count' in it)
          ? (Array.isArray(it.items) ? it.items : [])
          : [it],
      );
      // A client-side filter narrows a general endpoint to the issue we asked about.
      // `no_data` still means the SECTION answered: 200 links of which none are broken
      // is a real "no broken links", not an absent check.
      const items = section.filter ? all.filter(section.filter) : all;
      sectionStatus[section.issue_type] = items.length ? 'ok' : 'no_data';
      for (const it of items.slice(0, 200)) {
        rows.push({
          crawl_id: crawl.id, website_id: crawl.website_id, workspace_id: crawl.workspace_id,
          issue_type: section.issue_type, severity: section.severity,
          url: issueUrl(it), title: section.label,
          detail: it,
        });
      }
    } catch (e) {
      // UNKNOWN, not clean. The report prints this rather than an implied zero.
      sectionStatus[section.issue_type] = 'failed';
      console.error(`[seo-site-audit] section ${section.kind} failed:`, e instanceof Error ? e.message : e);
    }
  }

  if (rows.length) {
    const { error: insErr } = await supabase.from('website_crawl_issues').insert(rows);
    if (insErr) console.warn('[seo-site-audit] issue insert failed:', insErr.message);
  }

  await supabase.from('website_crawls').update({
    ...patch, status: 'finished', section_status: sectionStatus,
    pages_with_issues: rows.length ? new Set(rows.map((r) => r.url)).size : 0,
    finished_at: new Date().toISOString(),
  }).eq('id', crawl.id);

  return { ok: true, status: 'finished', issues: rows.length, sections: sectionStatus };
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
      // HYPHEN here on purpose: DataForSEO accepts `best_practices` in the REQUEST and
      // returns `best-practices` in the RESPONSE. Matching this to the request spelling
      // would read undefined forever.
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

  // ── Cron: advance every running crawl ──
  // A crawl left un-polled never finishes, and a `running` row that nothing ever
  // moves is indistinguishable from one still working. This is what closes them.
  if (action === 'cron-sync-crawls') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: running } = await supabase.from('website_crawls')
      .select('id, website_id, workspace_id, task_id')
      .eq('status', 'running').limit(25);
    let advanced = 0, finished = 0;
    for (const c of running || []) {
      const r = await syncCrawl(supabase, c, null);
      if (r.ok) { advanced++; if (r.status === 'finished') finished++; }
    }
    // A crawl still 'running' after 24h is stuck, not slow. Left alone it stays a
    // permanent spinner on the panel with nothing saying it died.
    await supabase.from('website_crawls')
      .update({ status: 'failed', error: 'The crawl did not finish within 24 hours and was abandoned.', finished_at: new Date().toISOString() })
      .eq('status', 'running').lt('started_at', new Date(Date.now() - 86400000).toISOString());
    return json({ ok: true, advanced, finished });
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
  // Paid module — refuse before the MIVAA/Lighthouse audit (#212). Cron branch stays ungated.
  const ent = await assertEntitled(supabase, website.workspace_id, 'seo-toolkit');
  if (!ent.ok) return ent.response;
  // ── Start a multi-page crawl ──
  if (action === 'crawl-start') {
    const pages = Math.min(Math.max(Number(body?.max_pages) || 100, 10), 1000);
    // One crawl at a time per site: a second concurrent crawl doubles the bill and
    // produces two partial reports that disagree.
    const { data: existing } = await supabase.from('website_crawls')
      .select('id').eq('website_id', website.id).eq('status', 'running').limit(1).maybeSingle();
    if (existing) return json({ ok: false, error: 'A crawl is already running for this site.' }, 409);

    const { data: row, error: insErr } = await supabase.from('website_crawls').insert({
      website_id: website.id, workspace_id: website.workspace_id, requested_pages: pages,
    }).select('id, website_id, workspace_id').single();
    if (insErr) return json({ ok: false, error: insErr.message }, 500);

    try {
      const target = website.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      // ONLY the parameters `onpage_task_post` actually declares. `enable_browser_rendering`
      // was invented here and the route rejects an unknown kwarg outright —
      // `HTTP_400 bad params: ... got an unexpected keyword argument`. The dispatcher
      // forwards params verbatim to the Python signature, so a plausible-sounding extra
      // is a hard 400, not an ignored field.
      const r = await dfs('onpage_task_post', {
        target, max_crawl_pages: pages, load_resources: false, enable_javascript: false,
      }, auth.userId);
      // `task_post` returns 20100 "Task Created" with result:null — the id is on the TASK,
      // not in `result`, so the client's `items` projection is legitimately EMPTY here.
      // Reading items[0].id could never have worked.
      const taskId = r?.raw?.tasks?.[0]?.id || null;
      if (!taskId) {
        const upstream = r?.raw?.tasks?.[0]?.status_message || r?.error;
        throw new Error(`The provider did not return a crawl task id${upstream ? ` — ${upstream}` : ''}.`);
      }
      await supabase.from('website_crawls').update({ task_id: taskId }).eq('id', row.id);
      return json({ ok: true, crawl_id: row.id, task_id: taskId, requested_pages: pages });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 400);
      // The row STAYS, marked failed. A crawl that could not start is a fact worth
      // showing; deleting the row would leave the panel saying "never crawled".
      await supabase.from('website_crawls')
        .update({ status: 'failed', error: msg, finished_at: new Date().toISOString() })
        .eq('id', row.id);
      return json({ ok: false, error: msg }, 502);
    }
  }

  // ── Poll the newest crawl for this site ──
  if (action === 'crawl-sync') {
    const { data: crawl } = await supabase.from('website_crawls')
      .select('id, website_id, workspace_id, task_id, status')
      .eq('website_id', website.id).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (!crawl) return json({ ok: false, error: 'No crawl to sync.' }, 404);
    if (crawl.status !== 'running') return json({ ok: true, status: crawl.status });
    return json(await syncCrawl(supabase, crawl, auth.userId));
  }

  const result = await auditWebsite(supabase, website, auth.userId);
  return json(result, result.ok ? 200 : 400);
}));
