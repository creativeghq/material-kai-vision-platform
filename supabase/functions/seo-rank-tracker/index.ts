/**
 * seo-rank-tracker — daily positions for the keywords a workspace CHOSE.
 *
 * Distinct from `seo-domain-tracker`, which discovers what a domain happens to rank
 * for and replaces that set wholesale each week. This follows a fixed, user-picked
 * set over time and must never lose a day — a rank tracker with a hole in it cannot
 * answer the only question it exists for.
 *
 * Actions (user JWT): run — check one website's keywords now.
 * Action (x-cron-secret): cron-run — the daily sweep.
 *
 * COST. One SERP call per keyword per run, so this is the most expensive cron in the
 * SEO module by a wide margin and the only one whose cost scales with what the user
 * types in. Both paths are capped, and the cron takes the oldest-checked keywords
 * first so a large set degrades into a slower rotation rather than a large bill.
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

/** Per invocation. A run that would exceed this rotates instead of billing for it. */
const MAX_PER_RUN = 60;

/**
 * SERP calls in flight at once. Measured 2026-09-04: one keyword takes ~19 s end to
 * end (a 7–15 s live SERP call per `ai_usage_logs.metadata.latency_ms`, plus two
 * writes), so checking the 60-keyword cap one at a time needs ~19 minutes, and the
 * edge gateway cuts the request off at 150 s with a 504 `IDLE_TIMEOUT` — well before
 * pg_net's 280 s. A sweep over a 129-keyword set checked TEN, so each keyword came
 * round every ~13 days under a panel that said "checked daily". Nothing raised:
 * every keyword that WAS checked was checked correctly. Twelve in flight puts the
 * cap at ~5 rounds, ~100 s, with margin under the ceiling; DataForSEO's live
 * endpoint has no concurrency limit at this scale and MIVAA's dispatcher adds none.
 */
const CONCURRENCY = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function hostOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, '').toLowerCase(); }
  catch { return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase(); }
}

/** DataForSEO via MIVAA's dispatcher. Only params the endpoint declares. */
async function serp(keyword: string, country: string, language: string, userId: string | null): Promise<any> {
  const resp = await fetch(`${MIVAA_GATEWAY_URL()}/api/v1/seo-agent/dataforseo/serp_google_organic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    // `country_code`, NOT `location_code` — the client maps the former to the latter
    // itself, and passing the mapped name is a hard 400 on an unexpected kwarg.
    body: JSON.stringify({
      params: { keyword, country_code: country, language_code: language, depth: 100 },
      attribution: { user_id: userId },
    }),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!resp.ok) throw new Error(describeUpstreamError(resp.status, parsed, 200));
  // MIVAA answers HTTP 200 with `success:false` when DataForSEO itself failed —
  // task 40106 "partial results", zero items. That is UNKNOWN, not "not in the top
  // 100": on 2026-09-05 three such calls were stored as unranked with no error and
  // an empty feature list, indistinguishable in the panel from a real miss. A
  // Google results page with no blocks of any kind does not exist either, so an
  // empty item list is the same fact wearing a different envelope.
  if (parsed?.success === false || parsed?.data?.error) {
    throw new Error(String(parsed?.data?.error || 'upstream returned no result'));
  }
  const data = parsed?.data ?? {};
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('upstream returned an empty SERP');
  }
  return data;
}

/**
 * One retry. DataForSEO's 40106 is transient by its own description ("some pages
 * could not be retrieved after several retry attempts") and a second task a few
 * seconds later normally completes; a keyword that still fails is recorded as
 * unknown with the message, never as unranked.
 */
async function serpWithRetry(keyword: string, country: string, language: string, userId: string | null): Promise<any> {
  try {
    return await serp(keyword, country, language, userId);
  } catch (first) {
    console.warn(`[seo-rank-tracker] retrying "${keyword}":`, first instanceof Error ? first.message : first);
    return await serp(keyword, country, language, userId);
  }
}

/**
 * Find our best organic position on one SERP.
 *
 * `rank_group` is the position AMONG ORGANIC RESULTS — what a person means by
 * "we're third". `rank_absolute` counts every block on the page, so a SERP with an
 * image pack above the fold would report us a place or two lower than any other
 * tracker and than Search Console.
 *
 * A subdomain counts as us; a domain that merely CONTAINS ours does not
 * (`notmaterialshub.gr`), which a substring test would wrongly claim as a win.
 */
function findPosition(items: any[], host: string): { position: number | null; url: string | null } {
  let best: { position: number; url: string | null } | null = null;
  for (const it of items) {
    if (it?.type !== 'organic') continue;
    const d = String(it.domain || '').replace(/^www\./i, '').toLowerCase();
    if (!d || (d !== host && !d.endsWith(`.${host}`))) continue;
    const rank = Number(it.rank_group);
    if (!Number.isFinite(rank) || rank < 1) continue;
    if (!best || rank < best.position) best = { position: rank, url: it.url ?? null };
  }
  return best ?? { position: null, url: null };
}

/** Check one website's tracked keywords and store today's positions. */
async function trackWebsite(
  supabase: any,
  website: { id: string; workspace_id: string; url: string },
  userId: string | null,
  limit: number,
): Promise<{ checked: number; ranking: number; failed: number }> {
  const host = hostOf(website.url);
  const today = new Date().toISOString().slice(0, 10);

  // Oldest-checked first, so a set larger than the cap rotates through rather than
  // always re-checking the same head of the list.
  const { data: keywords } = await supabase
    .from('seo_tracked_keywords')
    .select('id, keyword, country_code, language_code, device, last_checked_at')
    .eq('website_id', website.id).eq('is_active', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  let checked = 0, ranking = 0, failed = 0;
  const checkOne = async (kw: any): Promise<void> => {
    let row: Record<string, unknown>;
    try {
      const r = await serpWithRetry(kw.keyword, kw.country_code, kw.language_code, userId);
      const items: any[] = r.items || [];
      const { position, url } = findPosition(items, host);
      // Every distinct block type on the page, so "we lost the featured snippet"
      // is answerable later without re-fetching.
      const features = [...new Set(items.map((i: any) => i?.type).filter(Boolean))] as string[];
      row = {
        tracked_keyword_id: kw.id, website_id: website.id, workspace_id: website.workspace_id,
        captured_at: today,
        position, found: position != null, url,
        serp_features: features, error: null,
      };
      if (position != null) ranking++;
    } catch (e) {
      // UNKNOWN, not unranked. `found:false` with an error set is a different fact
      // from `found:false` with none, and the report separates them.
      failed++;
      row = {
        tracked_keyword_id: kw.id, website_id: website.id, workspace_id: website.workspace_id,
        captured_at: today, position: null, found: false, url: null,
        error: String(e instanceof Error ? e.message : e).slice(0, 300),
      };
    }
    checked++;
    const { error: upErr } = await supabase
      .from('seo_keyword_positions')
      .upsert(row, { onConflict: 'tracked_keyword_id,captured_at' });
    if (upErr) console.warn('[seo-rank-tracker] position write failed:', upErr.message);
    // Stamped even when the check FAILED, or a keyword whose SERP call errors would
    // stay first in the rotation forever and starve every keyword behind it.
    await supabase.from('seo_tracked_keywords')
      .update({ last_checked_at: new Date().toISOString() }).eq('id', kw.id);
  };

  // A pool, not batches: a slow SERP holds up one slot, not the eleven beside it.
  // Each worker pulls the next keyword off the shared queue until it is empty.
  const queue: any[] = [...(keywords || [])];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let kw = queue.shift(); kw; kw = queue.shift()) await checkOne(kw);
  }));

  return { checked, ranking, failed };
}

/**
 * Tell somebody when a keyword falls out of the top 10 — the move that actually
 * costs traffic. Deliberately NOT every position change: a tracker that alerts on
 * noise gets muted, and then it cannot alert on anything.
 */
async function alertOnDrops(supabase: any, website: { id: string; workspace_id: string }, today: string): Promise<void> {
  try {
    const { data: dropped } = await supabase.rpc('seo_keywords_dropped_out_of_top10' as any, {
      p_website_id: website.id, p_captured_at: today,
    });
    if (!dropped?.length) return;
    const names = dropped.slice(0, 5).map((d: any) => d.keyword).join(', ');
    // `seo.ranking_movement`, not a new `seo.rank_drop`. The trigger already exists,
    // is already in the tenant vocabulary, and already means "your rankings moved" —
    // a second trigger for the same event would be one more copy of a vocabulary that
    // is deliberately kept in one place, and flow-engine would match zero flows for it
    // until all seven registration sites were updated. The payload carries the detail.
    await emitFlowEventToWorkspaceRoles(
      website.workspace_id, ['owner', 'admin'], 'seo.ranking_movement', (uid) => ({
        user_id: uid, workspace_id: website.workspace_id,
        title: `${dropped.length} keyword${dropped.length === 1 ? '' : 's'} left the top 10`,
        body: `${names}${dropped.length > 5 ? ` and ${dropped.length - 5} more` : ''}.`,
        action_url: '/profile?tab=websites',
        type: 'warning',
      }),
    );
  } catch (e) {
    console.warn('[seo-rank-tracker] drop alert failed:', e instanceof Error ? e.message : e);
  }
}

Deno.serve(withApiLogging('seo-rank-tracker', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');
  const today = new Date().toISOString().slice(0, 10);

  // ── Daily sweep ──
  if (action === 'cron-run') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: sites } = await supabase
      .from('user_websites').select('id, workspace_id, url').eq('is_active', true);
    let checked = 0, failed = 0;
    for (const s of sites || []) {
      const r = await trackWebsite(supabase, s, null, MAX_PER_RUN);
      checked += r.checked; failed += r.failed;
      if (r.checked > 0) await alertOnDrops(supabase, s, today);
    }
    // 730 days of history is the RPC's ceiling; keep a little past it and no more.
    await supabase.from('seo_keyword_positions')
      .delete().lt('captured_at', new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10));
    return json({ ok: true, checked, failed });
  }

  // ── User: check one website now ──
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const websiteId = String(body?.website_id || '');
  if (!websiteId) return json({ error: 'website_id required' }, 400);

  const { data: website } = await supabase
    .from('user_websites').select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ error: 'Website not found' }, 404);
  if (!(await userCanAccessWorkspace(supabase, auth.userId, website.workspace_id))) {
    return json({ error: 'Website not found' }, 404); // 404 not 403 — no id enumeration
  }
  // Paid module — refuse BEFORE spending a SERP call per keyword (invariant 10).
  const ent = await assertEntitled(supabase, website.workspace_id, 'seo-toolkit');
  if (!ent.ok) return ent.response;

  const r = await trackWebsite(supabase, website, auth.userId, MAX_PER_RUN);
  if (r.checked > 0) await alertOnDrops(supabase, website, today);
  return json({ ok: true, ...r });
}));
