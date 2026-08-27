/**
 * seo-domain-tracker — weekly Rankings + Backlinks snapshots per connected website.
 *
 * Pulls DataForSEO domain rank overview (ranking keywords, traffic, position buckets,
 * movement), backlinks summary (backlinks, referring domains, spam), and the top
 * ranked keywords — for the site's MARKET (resolved from its GSC top country, else
 * its TLD, else US) — into seo_domain_snapshots + seo_domain_keywords.
 *
 * Actions (user JWT): run — snapshot one website now.
 * Action (x-cron-secret): cron-run — weekly snapshot of every active website.
 * verify_jwt disabled at the gateway (config.toml); run self-authenticates (invariant #1).
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
const KEYWORD_LIMIT = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// GSC returns ISO alpha-3 (lowercase); DataForSEO wants alpha-2 + we pick a language.
const A3_TO_A2: Record<string, string> = {
  usa: 'US', gbr: 'GB', grc: 'GR', deu: 'DE', fra: 'FR', ita: 'IT', esp: 'ES', nld: 'NL', bel: 'BE',
  aut: 'AT', che: 'CH', prt: 'PT', irl: 'IE', can: 'CA', aus: 'AU', pol: 'PL', swe: 'SE', dnk: 'DK',
  nor: 'NO', fin: 'FI', tur: 'TR', bgr: 'BG', rou: 'RO', cyp: 'CY', cze: 'CZ', hun: 'HU', hrv: 'HR',
  svk: 'SK', svn: 'SI', ltu: 'LT', lva: 'LV', est: 'EE', ukr: 'UA', rus: 'RU', bra: 'BR', mex: 'MX',
  ind: 'IN', jpn: 'JP', chn: 'CN', kor: 'KR', are: 'AE', sau: 'SA', zaf: 'ZA', nzl: 'NZ',
};
const TLD_TO_A2: Record<string, string> = {
  gr: 'GR', uk: 'GB', de: 'DE', fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', be: 'BE', at: 'AT', ch: 'CH',
  pt: 'PT', ie: 'IE', ca: 'CA', au: 'AU', pl: 'PL', se: 'SE', dk: 'DK', no: 'NO', fi: 'FI', tr: 'TR',
  bg: 'BG', ro: 'RO', cy: 'CY', cz: 'CZ', hu: 'HU', hr: 'HR', sk: 'SK', si: 'SI', jp: 'JP', br: 'BR',
};
const A2_TO_LANG: Record<string, string> = {
  US: 'en', GB: 'en', IE: 'en', CA: 'en', AU: 'en', NZ: 'en', ZA: 'en', IN: 'en',
  GR: 'el', DE: 'de', AT: 'de', CH: 'de', FR: 'fr', BE: 'fr', IT: 'it', ES: 'es', MX: 'es',
  NL: 'nl', PT: 'pt', BR: 'pt', PL: 'pl', SE: 'sv', DK: 'da', NO: 'no', FI: 'fi', TR: 'tr',
  BG: 'bg', RO: 'ro', CY: 'el', CZ: 'cs', HU: 'hu', HR: 'hr', SK: 'sk', SI: 'sl', RU: 'ru',
  UA: 'uk', JP: 'ja', CN: 'zh', KR: 'ko', AE: 'en', SA: 'ar',
};

function domainOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, ''); }
  catch { return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || ''; }
}

/** Resolve the market (country+language) for a website: GSC top country → TLD → US. */
async function resolveMarket(supabase: any, websiteId: string, domain: string): Promise<{ country: string; language: string }> {
  let country = '';
  const { data } = await supabase.from('gsc_breakdown')
    .select('value, impressions').eq('website_id', websiteId).eq('dimension', 'country')
    .order('impressions', { ascending: false }).limit(1);
  const a3 = (data?.[0]?.value || '').toLowerCase();
  if (a3 && A3_TO_A2[a3]) country = A3_TO_A2[a3];
  if (!country) {
    const tld = domain.split('.').pop()?.toLowerCase() || '';
    if (TLD_TO_A2[tld]) country = TLD_TO_A2[tld];
  }
  if (!country) country = 'US';
  return { country, language: A2_TO_LANG[country] || 'en' };
}

/**
 * DataForSEO dispatcher via MIVAA's seo-agent route.
 *
 * Returns the items AND whether an empty result was a clean "we have nothing for
 * this target". Those are different facts and the caller has to be able to tell
 * them apart: /backlinks/summary/live answers `status_code: 20000, "Ok.",
 * result_count: 0, result: null` for a domain the backlink index has never seen,
 * which is a true answer — not a failure, and not zero backlinks either.
 * Collapsing it into `[]` is what left every stored snapshot's backlink columns
 * NULL with nothing anywhere recording why.
 */
async function dfs(kind: string, params: Record<string, unknown>): Promise<{ items: any[]; answered: boolean }> {
  const resp = await fetch(`${MIVAA_GATEWAY_URL()}/api/v1/seo-agent/dataforseo/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    body: JSON.stringify({ params, attribution: {} }),
  });
  const text = await resp.text();
  let parsed: any = null; try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!resp.ok) throw new Error(`${kind} ${describeUpstreamError(resp.status, parsed, 160)}`);

  const items = parsed?.data?.items || [];
  // DataForSEO reports failure INSIDE a 200 (its own 2xxxx status codes), so the
  // envelope decides "answered", never the HTTP status.
  const raw = parsed?.data?.raw;
  const top = Number(raw?.status_code);
  const task = raw?.tasks?.[0];
  const taskCode = Number(task?.status_code);
  const answered =
    (!Number.isFinite(top) || top === 20000) &&
    (!Number.isFinite(taskCode) || taskCode === 20000) &&
    Number(raw?.tasks_error || 0) === 0;

  return { items, answered };
}

const n = (v: any): number | null => (typeof v === 'number' ? v : null);
const sum = (...v: any[]) => v.reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0);

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
    action_url: '/profile?tab=websites',
    type: direction === 'down' ? 'warning' : 'success',
    website_id: website.id, domain, metric, direction, previous: prev, current: cur, delta_pct: deltaPct,
  }));
}

async function trackWebsite(supabase: any, website: { id: string; workspace_id: string; url: string }): Promise<{ ok: boolean; error?: string }> {
  const domain = domainOf(website.url);
  const { country, language } = await resolveMarket(supabase, website.id, domain);
  try {
    // `.catch(() => [])` on each call makes an upstream FAILURE indistinguishable from an empty
    // result. That mattered below, where a failed ranked-keywords call produced kws=[] and the
    // unconditional DELETE then wiped the stored set. `rankedFailed` keeps the two apart.
    let rankedFailed = false;
    // Same class of bug on the OTHER two calls, and it ran for longer: a bare
    // `.catch(() => [])` makes an upstream failure indistinguishable from an
    // empty result, so a failed backlinks call wrote NULL backlinks/referring
    // domains/domain rank — and the dashboard, unable to tell that apart from a
    // site with no links, simply hid the row. Every stored snapshot for the one
    // connected site is in exactly that state. Record WHICH source failed; the
    // reader is then told "we could not fetch this" instead of being shown
    // nothing at all. `source_errors` is what `get_website_seo_overview` reads
    // to decide `collector_failed` vs `no_data`.
    const sourceErrors: Record<string, string> = {};
    const sourceStatus: Record<string, string> = {};
    const note = (key: string, e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      sourceErrors[key] = msg.slice(0, 300);
      sourceStatus[key] = 'failed';
      console.error(`[seo-domain-tracker] ${key} failed:`, msg);
    };
    const empty = { items: [] as any[], answered: false };
    const [overview, backlinks, ranked] = await Promise.all([
      dfs('labs_domain_rank_overview', { target: domain, country_code: country, language_code: language }).catch((e) => { note('overview', e); return empty; }),
      dfs('backlinks_summary', { target: domain }).catch((e) => { note('backlinks', e); return empty; }),
      dfs('labs_ranked_keywords', { target: domain, country_code: country, language_code: language, limit: KEYWORD_LIMIT }).catch((e) => { rankedFailed = true; note('ranked', e); return empty; }),
    ]);

    // Record a positive verdict per source. `no_data` is a REAL answer — the
    // backlink index legitimately has no record of a new domain — and must not
    // be dressed up as a failure any more than as a zero. A panel that cries
    // wolf gets ignored the one time it matters.
    const verdict = (key: string, r: { items: any[]; answered: boolean }) => {
      if (sourceStatus[key] === 'failed') return;
      if (!r.answered) {
        sourceStatus[key] = 'failed';
        sourceErrors[key] = 'The source reported an error inside a successful HTTP response.';
        return;
      }
      sourceStatus[key] = r.items.length > 0 ? 'ok' : 'no_data';
    };
    verdict('overview', overview);
    verdict('backlinks', backlinks);
    verdict('ranked', ranked);
    if (sourceStatus.ranked === 'failed') rankedFailed = true;

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
    // Replace the set ONLY when we actually have a fresh answer. An unconditional DELETE with
    // the INSERT guarded by `if (kws.length)` means one transient DataForSEO failure wipes
    // every stored keyword and writes nothing back, while the run still returns { ok: true }
    // and the snapshot records error: null. The 'Rankings & Links' panel then sits empty until
    // the next weekly run with nothing reporting it.
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
    await trackCompetitors(supabase, website, country, language, snapshot.captured_at);

    return { ok: true };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await supabase.from('seo_domain_snapshots').upsert({
      website_id: website.id, workspace_id: website.workspace_id,
      captured_at: new Date().toISOString().slice(0, 10), country_code: country, language_code: language, error: msg,
    }, { onConflict: 'website_id,captured_at' });
    return { ok: false, error: msg };
  }
}

/**
 * Snapshot every tracked competitor for one website.
 *
 * ONLY the rank-overview call, deliberately. A backlinks_summary per competitor
 * would double the cost of every weekly run for a figure the comparison chart does
 * not plot, and this loop scales with however many rivals an operator adds. The
 * site's own snapshot still fetches backlinks.
 *
 * One competitor failing must not abort the rest, nor the run: each is caught,
 * recorded with its own `source_status`, and the loop continues.
 */
async function trackCompetitors(
  supabase: any,
  website: { id: string; workspace_id: string },
  country: string,
  language: string,
  capturedAt: string,
): Promise<void> {
  const { data: rivals, error } = await supabase.from('seo_competitors')
    .select('id, competitor_domain')
    .eq('website_id', website.id).eq('is_active', true)
    .limit(25);
  if (error) { console.warn('[seo-domain-tracker] competitor read failed:', error.message); return; }
  if (!rivals?.length) return;

  for (const rival of rivals) {
    const status: Record<string, string> = {};
    const errors: Record<string, string> = {};
    let row: any = {};
    try {
      const r = await dfs('labs_domain_rank_overview', {
        target: rival.competitor_domain, country_code: country, language_code: language,
      });
      status.overview = r.answered ? (r.items.length ? 'ok' : 'no_data') : 'failed';
      if (!r.answered) errors.overview = 'The source reported an error inside a successful HTTP response.';
      row = r.items?.[0]?.metrics?.organic || {};
    } catch (e) {
      status.overview = 'failed';
      errors.overview = String(e instanceof Error ? e.message : e).slice(0, 300);
      console.error(`[seo-domain-tracker] competitor ${rival.competitor_domain} failed:`, errors.overview);
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
    const { data: sites } = await supabase.from('user_websites').select('id, workspace_id, url').eq('is_active', true);
    let ok = 0, failed = 0;
    for (const s of sites || []) { const r = await trackWebsite(supabase, s); if (r.ok) ok++; else failed++; }
    return json({ ok: true, tracked: ok, failed });
  }

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const websiteId = String(body?.website_id || '');
  if (!websiteId) return json({ error: 'website_id required' }, 400);
  const { data: website } = await supabase.from('user_websites').select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ error: 'Website not found' }, 404);
  if (!(await userCanAccessWorkspace(supabase, auth.userId, website.workspace_id))) return json({ error: 'Website not found' }, 404);
  // Paid module — refuse before the DataForSEO snapshot (#212). Cron branch stays ungated.
  const ent = await assertEntitled(supabase, website.workspace_id, 'seo-toolkit');
  if (!ent.ok) return ent.response;
  const r = await trackWebsite(supabase, website);
  return json(r, r.ok ? 200 : 400);
}));
