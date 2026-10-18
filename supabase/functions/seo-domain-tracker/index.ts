/** seo-domain-tracker — weekly Rankings + Backlinks snapshots per connected website. */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, isCronAuthorized, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { agentReviewLink } from '../_shared/agent-handoff.ts';

import { describeUpstreamError } from '../_shared/tool-result-shape.ts';
import { gatedGatewayPost } from '../_shared/tools/dataforseo-dispatch.ts';
import { resolveSeoMarket } from '../_shared/seo-market.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const KEYWORD_LIMIT = 100;
const BACKLINK_LIMIT = 100;
/** Stop starting work here; the gateway cuts the request at 150s. */
const RUN_DEADLINE_MS = 120_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function domainOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, ''); }
  catch { return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || ''; }
}

/** MIVAA debits `user_id` per call; a cron run carries only `workspace_id`, so it is attributed but not billed. */
type Attribution = { workspace_id: string; user_id?: string };

/** Throws when the source did not answer. A refusal arrives as HTTP 200 + `success:false` + `raw: {}`. */
async function dfs(kind: string, params: Record<string, unknown>, attribution: Attribution): Promise<{ items: any[] }> {
  const { ok, status, parsed } = await gatedGatewayPost(kind, `/api/v1/seo-agent/dataforseo/${kind}`, { params }, attribution);
  if (!ok) throw new Error(`${kind} ${describeUpstreamError(status, parsed, 160)}`);
  if (parsed?.success !== true) {
    throw new Error(String(parsed?.data?.error || 'the source reported an error inside a successful HTTP response').slice(0, 300));
  }
  return { items: parsed?.data?.items || [] };
}

const n = (v: any): number | null => (typeof v === 'number' ? v : null);
const sum = (...v: any[]): number | null => {
  const nums = v.filter((x): x is number => typeof x === 'number');
  return nums.length ? nums.reduce((s, x) => s + x, 0) : null;
};

/**
 * Emit a workspace-scoped movement alert if a metric moved materially week-over-week.
 * "Material" = abs change ≥ floor AND ≥ pctThreshold of the previous value (both, so
 * tiny sites don't spam and % noise on small bases is ignored). Fans out to the site's
 * workspace owners/admins via the Flows engine (one event per member, each with user_id).
 */
async function maybeAlert(
  website: { id: string; workspace_id: string },
  domain: string,
  eventType: string,
  metric: string,
  metricLabel: string,
  prev: number | null,
  cur: number | null,
  floor: number,
  pctThreshold: number,
): Promise<void> {
  if (prev == null || cur == null) return;
  const delta = cur - prev;
  const absDelta = Math.abs(delta);
  if (absDelta < floor || absDelta < Math.abs(prev) * pctThreshold) return;
  const direction = delta < 0 ? 'down' : 'up';
  const deltaPct = prev ? Math.round((delta / prev) * 100) : null;
  const verb = direction === 'down' ? 'dropped' : 'rose';
  const Cap = metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1);
  await emitFlowEventToWorkspaceRoles(website.workspace_id, ['owner', 'admin'], eventType, (uid) => ({
    user_id: uid, workspace_id: website.workspace_id,
    title: `${Cap} ${verb} for ${domain}`,
    body: `${Cap} ${verb} ${Math.abs(deltaPct ?? 0)}% (${prev.toLocaleString()} → ${cur.toLocaleString()}) week-over-week.`,
    action_url: agentReviewLink('marketing',
      `Review what happened to ${domain}: ${metricLabel} ${verb} from ${prev} to ${cur} week-over-week in the domain snapshot `
      + `(website_id ${website.id}). Work out which keywords or referring domains moved, whether it is real or a data artefact, and what to do.`),
    type: direction === 'down' ? 'warning' : 'success',
    website_id: website.id, domain, metric, direction, previous: prev, current: cur, delta_pct: deltaPct,
  }));
}

async function trackWebsite(
  supabase: any,
  website: { id: string; workspace_id: string; url: string },
  opts: { competitorKeywords: boolean; attribution: Attribution; deadline: number },
): Promise<{ ok: boolean; error?: string; competitors_not_reached?: number; competitors_error?: string }> {
  const domain = domainOf(website.url);
  let country: string | null = null;
  let language: string | null = null;
  try {
    const resolved = await resolveSeoMarket(supabase, { websiteId: website.id, workspaceId: website.workspace_id });
    if (!resolved.ok) throw new Error(`Not measured: ${resolved.reason}`);
    country = resolved.market.country_code;
    language = resolved.market.language_code;
    const attr = opts.attribution;
    // A failed source is `failed` with its message, never `no_data`: a stored set is only
    // replaced when its call answered.
    const sourceErrors: Record<string, string> = {};
    const sourceStatus: Record<string, string> = {};
    const settle = async (key: string, p: Promise<{ items: any[] }>) => {
      try {
        const r = await p;
        sourceStatus[key] = r.items.length > 0 ? 'ok' : 'no_data';
        return r;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sourceErrors[key] = msg.slice(0, 300);
        sourceStatus[key] = 'failed';
        console.error(`[seo-domain-tracker] ${key} failed:`, msg);
        return { items: [] as any[] };
      }
    };
    const [overview, backlinks, ranked, links] = await Promise.all([
      settle('overview', dfs('labs_domain_rank_overview', { target: domain, country_code: country, language_code: language }, attr)),
      settle('backlinks', dfs('backlinks_summary', { target: domain }, attr)),
      settle('ranked', dfs('labs_ranked_keywords', { target: domain, country_code: country, language_code: language, limit: KEYWORD_LIMIT }, attr)),
      settle('backlink_list', dfs('backlinks_backlinks', { target: domain, mode: 'one_per_domain', limit: BACKLINK_LIMIT }, attr)),
    ]);
    const rankedFailed = sourceStatus.ranked === 'failed';

    const org = overview.items?.[0]?.metrics?.organic || {};
    const bl = backlinks.items?.[0] || {};
    const snapshot = {
      website_id: website.id, workspace_id: website.workspace_id,
      captured_at: new Date().toISOString().slice(0, 10), country_code: country, language_code: language,
      ranking_keywords: n(org.count), organic_traffic: n(org.etv), organic_traffic_value: n(org.estimated_paid_traffic_cost),
      kw_up: n(org.is_up), kw_down: n(org.is_down), kw_new: n(org.is_new), kw_lost: n(org.is_lost),
      pos_1: n(org.pos_1), pos_2_3: n(org.pos_2_3), pos_4_10: n(org.pos_4_10), pos_11_20: n(org.pos_11_20),
      pos_21_50: sum(org.pos_21_30, org.pos_31_40, org.pos_41_50),
      pos_51_100: sum(org.pos_51_60, org.pos_61_70, org.pos_71_80, org.pos_81_90, org.pos_91_100),
      backlinks: n(bl.backlinks), referring_domains: n(bl.referring_domains), referring_main_domains: n(bl.referring_main_domains),
      domain_rank: n(bl.rank), spam_score: n(bl.backlinks_spam_score), broken_backlinks: n(bl.broken_backlinks),
      source_errors: sourceErrors,
      source_status: sourceStatus,
      error: null,
    };
    const { error: sErr } = await supabase.from('seo_domain_snapshots').upsert(snapshot, { onConflict: 'website_id,captured_at' });
    if (sErr) throw new Error(sErr.message);

    // Replace the current top-keywords set.
    const kws = (ranked.items || []).map((it: any) => {
      const si = it?.ranked_serp_element?.serp_item || {};
      return {
        website_id: website.id, workspace_id: website.workspace_id,
        keyword: it?.keyword_data?.keyword ?? '', position: n(si.rank_absolute),
        search_volume: n(it?.keyword_data?.keyword_info?.search_volume), etv: n(si.etv),
        url: si.relative_url ?? null, captured_at: snapshot.captured_at,
      };
    }).filter((k: any) => k.keyword);
    if (rankedFailed) {
      console.warn('[seo-domain-tracker] keeping the existing keyword set — upstream fetch failed for', domain);
    } else {
      const { error: delErr } = await supabase.from('seo_domain_keywords').delete().eq('website_id', website.id);
      if (delErr) throw new Error(`Could not clear the previous keyword set: ${delErr.message}`);
      if (kws.length) {
        const { error: insErr } = await supabase.from('seo_domain_keywords').insert(kws);
        if (insErr) throw new Error(`Could not store the refreshed keyword set: ${insErr.message}`);
      }
    }

    if (sourceStatus.backlink_list !== 'failed') {
      const rows = (links.items || []).filter((b: any) => b?.url_from).map((b: any) => ({
        url_from: String(b.url_from), domain_from: b.domain_from ?? null, url_to: b.url_to ?? null,
        anchor: typeof b.anchor === 'string' ? b.anchor : null,
        dofollow: typeof b.dofollow === 'boolean' ? b.dofollow : null,
        domain_from_rank: n(b.domain_from_rank), page_from_rank: n(b.page_from_rank),
        spam_score: n(b.backlink_spam_score), first_seen: b.first_seen ?? null, last_seen: b.last_seen ?? null,
        is_new: b.is_new ?? null, is_lost: b.is_lost ?? null, is_broken: b.is_broken ?? null,
      }));
      const { error: blErr } = await supabase.rpc('replace_seo_domain_backlinks', {
        p_website_id: website.id, p_captured_at: snapshot.captured_at, p_rows: rows,
      });
      if (blErr) throw new Error(`Could not store the refreshed backlink set: ${blErr.message}`);
    }

    // Week-over-week movement alerts (Flows, workspace-scoped). Best-effort.
    try {
      const { data: prevRows } = await supabase.from('seo_domain_snapshots')
        .select('ranking_keywords, referring_domains, captured_at')
        .eq('website_id', website.id).lt('captured_at', snapshot.captured_at)
        .order('captured_at', { ascending: false }).limit(1);
      const prev = prevRows?.[0];
      if (prev) {
        await maybeAlert(website, domain, 'seo.ranking_movement', 'ranking_keywords', 'ranking keywords',
          prev.ranking_keywords, snapshot.ranking_keywords, 10, 0.20);
        await maybeAlert(website, domain, 'seo.backlink_movement', 'referring_domains', 'referring domains',
          prev.referring_domains, snapshot.referring_domains, 5, 0.15);
      }
    } catch (e) { console.warn('[seo-domain-tracker] alert check failed:', e instanceof Error ? e.message : e); }

    // Competitors ride the same weekly run, in the SAME market, so the lines on the
    // comparison chart are actually comparable — a competitor measured in a different
    // country is a different question wearing the same axis.
    try {
      const notReached = await trackCompetitors(supabase, website, {
        country, language, capturedAt: snapshot.captured_at, withKeywords: opts.competitorKeywords,
        attribution: attr, deadline: opts.deadline,
      });
      return { ok: true, competitors_not_reached: notReached };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[seo-domain-tracker] competitors not measured:', msg);
      return { ok: true, competitors_error: msg };
    }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await supabase.from('seo_domain_snapshots').upsert({
      website_id: website.id, workspace_id: website.workspace_id,
      captured_at: new Date().toISOString().slice(0, 10), country_code: country, language_code: language, error: msg,
    }, { onConflict: 'website_id,captured_at' });
    return { ok: false, error: msg };
  }
}

/** Snapshot every tracked competitor for one website. */
async function trackCompetitors(
  supabase: any,
  website: { id: string; workspace_id: string },
  run: { country: string; language: string; capturedAt: string; withKeywords: boolean; attribution: Attribution; deadline: number },
): Promise<number> {
  const { country, language, capturedAt, withKeywords, attribution } = run;
  const { data: rivals, error } = await supabase.from('seo_competitors')
    .select('id, competitor_domain')
    .eq('website_id', website.id).eq('is_active', true)
    .limit(25);
  if (error) throw new Error(`Could not read the tracked competitors: ${error.message}`);
  if (!rivals?.length) return 0;

  for (const [i, rival] of rivals.entries()) {
    if (Date.now() > run.deadline) {
      console.warn(`[seo-domain-tracker] out of time — ${rivals.length - i} competitor(s) of ${website.id} not measured`);
      return rivals.length - i;
    }
    const status: Record<string, string> = {};
    const errors: Record<string, string> = {};
    let row: any = {};
    const [overview, ranked] = await Promise.allSettled([
      dfs('labs_domain_rank_overview', { target: rival.competitor_domain, country_code: country, language_code: language }, attribution),
      withKeywords
        ? dfs('labs_ranked_keywords', { target: rival.competitor_domain, country_code: country, language_code: language, limit: KEYWORD_LIMIT }, attribution)
        : Promise.resolve(null),
    ]);
    if (overview.status === 'fulfilled') {
      status.overview = overview.value.items.length ? 'ok' : 'no_data';
      row = overview.value.items?.[0]?.metrics?.organic || {};
    } else {
      status.overview = 'failed';
      errors.overview = String(overview.reason instanceof Error ? overview.reason.message : overview.reason).slice(0, 300);
      console.error(`[seo-domain-tracker] competitor ${rival.competitor_domain} failed:`, errors.overview);
    }
    if (ranked.status === 'rejected') {
      status.ranked = 'failed';
      errors.ranked = String(ranked.reason instanceof Error ? ranked.reason.message : ranked.reason).slice(0, 300);
    } else if (ranked.value) {
      status.ranked = ranked.value.items.length ? 'ok' : 'no_data';
      const rows = ranked.value.items.map((it: any) => {
        const si = it?.ranked_serp_element?.serp_item || {};
        return {
          keyword: it?.keyword_data?.keyword ?? '', position: n(si.rank_absolute),
          search_volume: n(it?.keyword_data?.keyword_info?.search_volume), etv: n(si.etv), url: si.relative_url ?? null,
        };
      });
      const { error: kwErr } = await supabase.rpc('replace_seo_competitor_keywords', {
        p_competitor_id: rival.id, p_captured_at: capturedAt, p_rows: rows,
      });
      if (kwErr) { status.ranked = 'failed'; errors.ranked = `not stored: ${kwErr.message}`.slice(0, 300); }
    }

    const { error: upErr } = await supabase.from('seo_competitor_snapshots').upsert({
      competitor_id: rival.id, website_id: website.id, workspace_id: website.workspace_id,
      captured_at: capturedAt, country_code: country, language_code: language,
      ranking_keywords: n(row.count), organic_traffic: n(row.etv),
      organic_traffic_value: n(row.estimated_paid_traffic_cost),
      source_status: status, source_errors: errors,
    }, { onConflict: 'competitor_id,captured_at' });
    if (upErr) console.warn('[seo-domain-tracker] competitor snapshot write failed:', upErr.message);
  }
  return 0;
}

Deno.serve(withApiLogging('seo-domain-tracker', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');

  if (action === 'cron-run') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: due, error: sitesErr } = await supabase.rpc('website_collectors_due', { p_collector: 'domain_tracking', p_limit: 100 });
    if (sitesErr) return json({ ok: false, error: `Could not read the websites to track: ${sitesErr.message}` }, 500);
    const sites = ((due ?? []) as { website_id: string; workspace_id: string; url: string; payer_user_id: string | null }[])
      .map((d) => ({ id: d.website_id, workspace_id: d.workspace_id, url: d.url, payer: d.payer_user_id }));
    const deadline = Date.now() + RUN_DEADLINE_MS;
    let ok = 0, failed = 0, competitorsNotReached = 0, competitorReadsFailed = 0;
    const notReached: string[] = [];
    for (const s of sites || []) {
      if (Date.now() > deadline) { notReached.push(s.id); continue; }
      const r = await trackWebsite(supabase, s, {
        competitorKeywords: true, attribution: { workspace_id: s.workspace_id, ...(s.payer ? { user_id: s.payer } : {}) }, deadline,
      });
      if (r.ok) {
        ok++;
        const { error: markErr } = await supabase.rpc('mark_collector_run', { p_website_id: s.id, p_collector: 'domain_tracking' });
        if (markErr) console.error('[seo-domain-tracker] could not record the run:', markErr.message);
      } else failed++;
      competitorsNotReached += r.competitors_not_reached ?? 0;
      if (r.competitors_error) competitorReadsFailed++;
    }
    return json({
      ok: notReached.length === 0, tracked: ok, failed,
      not_reached: notReached.length, not_reached_website_ids: notReached,
      competitors_not_reached: competitorsNotReached, competitor_reads_failed: competitorReadsFailed,
    });
  }

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const websiteId = String(body?.website_id || '');
  if (!websiteId) return json({ error: 'website_id required' }, 400);
  const { data: website } = await supabase.from('user_websites').select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ error: 'Website not found' }, 404);
  if (!(await userHasWorkspaceCapability(supabase, auth.userId, website.workspace_id, 'marketing.seo'))) return json({ error: 'Website not found' }, 404);
  // Paid module — refuse before the DataForSEO snapshot (#212). Cron branch stays ungated.
  const ent = await assertEntitled(supabase, website.workspace_id, 'seo-toolkit');
  if (!ent.ok) return ent.response;
  const r = await trackWebsite(supabase, website, {
    competitorKeywords: false,
    attribution: { workspace_id: website.workspace_id, user_id: auth.userId },
    deadline: Date.now() + RUN_DEADLINE_MS,
  });
  return json(r, r.ok ? 200 : 400);
}));
