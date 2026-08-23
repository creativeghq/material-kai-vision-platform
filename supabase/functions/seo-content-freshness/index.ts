/**
 * seo-content-freshness — content decay for generated SEO articles.
 *
 * The article pipeline wrote articles and never looked at one again. Grepping
 * `seo-api/` and `_shared/seo-types.ts` for freshness / decay / staleness / refresh-due
 * returned nothing at all (issue #349 C1), which matters because an article updated
 * inside the last three months is cited materially more often by answer engines than
 * the same article left to age. A page nobody revisits does not break, does not error,
 * and does not appear in any list — it just stops being cited.
 *
 * What is derived where:
 *   - `seo_article_refresh_due_at(...)` in SQL is the ONE definition of "when is this
 *     due". This function never re-adds an interval to a date.
 *   - `seo_article_freshness` (security_invoker view) is the queue. The client reads it
 *     directly under RLS; there is no queue endpoint here, because a second read path
 *     is a second answer.
 *
 * Actions:
 *   cron-sweep (x-cron-secret) — emit `seo.article_refresh_due` for every article whose
 *   due date has passed and that has not already been nudged for THIS cycle.
 *
 * verify_jwt is disabled at the gateway (see config.toml) so the cron can reach it; the
 * only action self-authenticates through isCronAuthorized.
 */

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
}

Deno.serve(withApiLogging('seo-content-freshness', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const action = String(body?.action || 'cron-sweep');
  if (action !== 'cron-sweep') {
    return json({ error: `Unknown action '${action}'. Available: cron-sweep` }, 400);
  }
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

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
        body: `It has been ${row.age_days} days since this article was last reviewed`
          + `${row.target_keyword ? ` (target: ${row.target_keyword})` : ''}.`
          + ' Articles refreshed inside the last three months are cited noticeably more'
          + ' often by answer engines.',
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

  console.log(`[seo-content-freshness] due=${due.length} notified=${emitted} failed=${failures.length}`);
  return json({
    ok: true,
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
