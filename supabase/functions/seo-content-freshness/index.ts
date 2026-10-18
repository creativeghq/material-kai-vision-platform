/** seo-content-freshness — content decay for generated SEO articles. */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** How many articles one sweep will nudge. Reported in the response, never silent. */
const SWEEP_LIMIT = 200;
const REFRESH_PER_SITE = 3;
const REFRESH_REASONS = new Set(['position_drop', 'clicks_drop']);
const REFRESH_COOLDOWN_MS = 7 * 86_400_000;

/** Draft a refresh for articles that slipped in search; billed per run at its token cost inside seo-api refresh. */
async function draftRefreshes(supabase: any, due: FreshnessRow[]): Promise<{ attempted: number; dispatched: number; errors: string[] }> {
  const candidates = due.filter((r) => r.due_reason && REFRESH_REASONS.has(r.due_reason));
  if (!candidates.length) return { attempted: 0, dispatched: 0, errors: [] };
  const { data: rows } = await supabase.from('seo_articles').select('id, stages_data').in('id', candidates.map((c) => c.article_id));
  const lastRun = new Map<string, number>(((rows ?? []) as Array<{ id: string; stages_data: any }>).map((r) => [
    r.id, Date.parse(r.stages_data?.extra?.refresh_report?.ran_at ?? '') || 0,
  ]));
  const perSite = new Map<string, number>();
  let attempted = 0, dispatched = 0;
  const errors: string[] = [];
  for (const row of candidates) {
    if (Date.now() - (lastRun.get(row.article_id) ?? 0) < REFRESH_COOLDOWN_MS) continue;
    const site = row.website_id ?? 'none';
    if ((perSite.get(site) ?? 0) >= REFRESH_PER_SITE) continue;
    perSite.set(site, (perSite.get(site) ?? 0) + 1);
    attempted++;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/seo-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ action: 'refresh', article_id: row.article_id, user_id: row.user_id, reason: row.due_reason, background: true }),
        signal: AbortSignal.timeout(20_000),
      });
      const out = await res.json().catch(() => null);
      if (!out?.success) errors.push(`${row.article_id}: ${out?.error ?? `HTTP ${res.status}`}`);
      else dispatched += 1;
    } catch (e) {
      errors.push(`${row.article_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { attempted, dispatched, errors };
}

/** The opt-in weekly page reviews (#399): each is its own seo-api call, billed at its token cost there. */
async function sweepPageReviews(supabase: any): Promise<Response> {
  const { data, error } = await supabase.rpc('select_pages_for_weekly_review', { p_limit: 25 });
  if (error) return json({ ok: false, error: `page selection failed: ${error.message}` }, 500);
  const picked = (data ?? []) as Array<{ website_id: string; user_id: string; page_id: string; rule: string }>;
  let dispatched = 0;
  const errors: string[] = [];
  const rules: Record<string, number> = {};
  for (const row of picked) {
    rules[row.rule] = (rules[row.rule] ?? 0) + 1;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/seo-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ action: 'page_review', page_id: row.page_id, user_id: row.user_id, background: true }),
        signal: AbortSignal.timeout(20_000),
      });
      const out = await res.json().catch(() => null);
      if (!out?.success) errors.push(`${row.page_id}: ${out?.error ?? `HTTP ${res.status}`}`);
      else dispatched += 1;
    } catch (e) {
      errors.push(`${row.page_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`[seo-content-freshness] page reviews picked=${picked.length} dispatched=${dispatched} failed=${errors.length}`);
  return json({ ok: errors.length === 0 || dispatched > 0, picked: picked.length, picked_by_rule: rules, dispatched, errors: errors.slice(0, 10) });
}

interface FreshnessRow {
  article_id: string;
  user_id: string;
  workspace_id: string | null;
  website_id: string | null;
  title: string | null;
  slug: string | null;
  target_keyword: string | null;
  published_at: string | null;
  last_reviewed_at: string | null;
  refresh_interval_days: number;
  refresh_due_at: string;
  refresh_notified_at: string | null;
  age_days: number;
  due_reason: string | null;
  main_query: string | null;
  position_now: number | null;
  position_prev: number | null;
  clicks_now: number | null;
  clicks_prev: number | null;
}

function whyDue(row: FreshnessRow): string {
  const q = row.main_query ? ` on "${row.main_query}"` : '';
  switch (row.due_reason) {
    case 'position_drop':
      return row.position_now == null
        ? `It dropped out of the search results${q}.`
        : `It slipped from position ${row.position_prev} to ${row.position_now}${q} over the last 28 days.`;
    case 'clicks_drop':
      return `Its clicks fell from ${row.clicks_prev} to ${row.clicks_now} over the last 28 days.`;
    case 'not_indexed':
      return 'Search Console has no rows for it 28 days after publishing. Check that Google has indexed it.';
    default:
      return `It has been ${row.age_days} days since this article was last reviewed`
        + `${row.target_keyword ? ` (target: ${row.target_keyword})` : ''}.`
        + ' Articles refreshed inside the last three months are cited noticeably more often by answer engines.';
  }
}

Deno.serve(withApiLogging('seo-content-freshness', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const action = String(body?.action || 'cron-sweep');
  if (action !== 'cron-sweep' && action !== 'page-review-sweep') {
    return json({ error: `Unknown action '${action}'. Available: cron-sweep, page-review-sweep` }, 400);
  }
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  if (action === 'page-review-sweep') return sweepPageReviews(supabase);

  const { data, error } = await supabase
    .from('seo_article_freshness')
    .select('*')
    .eq('is_due', true)
    .order('refresh_due_at', { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) return json({ ok: false, error: error.message }, 500);

  const due = (data || []) as FreshnessRow[];
  // One nudge per refresh CYCLE, not per cron tick: an article stays due until somebody
  // acts on it, so re-emitting daily would train people to ignore the whole channel.
  const toNotify = due.filter(
    (r) => !r.refresh_notified_at || r.refresh_notified_at < r.refresh_due_at,
  );

  let emitted = 0;
  const failures: string[] = [];
  for (const row of toNotify) {
    const label = row.title || row.target_keyword || 'An article';
    try {
      await emitFlowEvent('seo.article_refresh_due', {
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        title: `"${label}" is due for a refresh`,
        body: whyDue(row),
        due_reason: row.due_reason,
        action_url: '/profile?tab=websites',
        type: 'info',
        article_id: row.article_id,
        article_title: row.title,
        slug: row.slug,
        target_keyword: row.target_keyword,
        website_id: row.website_id,
        published_at: row.published_at,
        last_reviewed_at: row.last_reviewed_at,
        refresh_due_at: row.refresh_due_at,
        refresh_interval_days: row.refresh_interval_days,
        age_days: row.age_days,
      });
      emitted++;
      // Stamped only after the emit succeeds. Stamping first would mark an article
      // notified on a run that told nobody, and it would never be raised again.
      const { error: stampError } = await supabase
        .from('seo_articles')
        .update({ refresh_notified_at: new Date().toISOString() })
        .eq('id', row.article_id);
      if (stampError) failures.push(`${row.article_id}: stamp ${stampError.message}`);
    } catch (e) {
      failures.push(`${row.article_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const refreshes = await draftRefreshes(supabase, due);
  console.log(`[seo-content-freshness] due=${due.length} notified=${emitted} failed=${failures.length} refreshes=${refreshes.dispatched}/${refreshes.attempted}`);
  return json({
    ok: true,
    refreshes_attempted: refreshes.attempted,
    refreshes_dispatched: refreshes.dispatched,
    refresh_errors: refreshes.errors.slice(0, 10),
    due_count: due.length,
    already_notified: due.length - toNotify.length,
    emitted,
    failed: failures.length,
    errors: failures.slice(0, 10),
    // The cap is reported rather than applied quietly: a sweep that stopped at 200 and
    // said "200 due" reads exactly like a sweep that found 200.
    truncated: due.length >= SWEEP_LIMIT,
  });
}));
