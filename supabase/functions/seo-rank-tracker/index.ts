/**
 * seo-rank-tracker — daily positions for the keywords a workspace CHOSE.
 *
 * Distinct from `seo-domain-tracker`, which discovers what a domain happens to rank
 * for and replaces that set wholesale each week. This follows a fixed, user-picked
 * set over time and must never lose a day — a rank tracker with a hole in it cannot
 * answer the only question it exists for.
 *
 * Actions (user JWT): run — check one website's keywords now.
 * Action (x-cron-secret): cron-run — one leg of the daily sweep.
 *
 * COST. One SERP call per keyword per run ($0.0006 measured), so this is the most
 * expensive cron in the SEO module by a wide margin and the only one whose cost scales
 * with what the user types in. Every run is capped and time-bounded.
 *
 * COVERAGE. The cap is per RUN, not per day: the sweep is scheduled several times a
 * day and `seo_keywords_due(p_only_stale => true)` hands each leg the keywords the
 * earlier legs did not reach, so a set larger than the cap is still covered daily
 * instead of rotating over two. It was one leg of 60 against a 129-keyword set — the
 * panel said "followed daily" over figures that blended three capture dates, and a
 * failed check waited a full day for its retry. Adding legs is free where the work is
 * already done: a leg with nothing due makes no upstream call at all.
 */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { assertEntitled, isWorkspaceEntitled } from '../_shared/entitlement.ts';
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

/**
 * A live SERP answers in 7–15 s (measured). One that has not answered in 45 s is hung,
 * and with no timeout it holds one of the twelve workers until the PLATFORM kills the
 * whole request — so a single stuck upstream call costs the run rather than the keyword.
 */
const SERP_TIMEOUT_MS = 45_000;

/**
 * Stop STARTING keywords at 120 s. The gateway cuts the request off at 150 s with a 504,
 * and a run that dies there loses its drop alerts, its retention sweep and its report to
 * the caller — while `api_usage_logs` records the 200 it never sent. Ending early costs
 * nothing: what is left is by definition the stalest, which is what the next leg takes
 * first.
 */
const RUN_DEADLINE_MS = 120_000;

/** One row of `seo_keywords_due` — the queue, derived in SQL. */
type DueKeyword = {
  id: string;
  website_id: string;
  workspace_id: string;
  url: string;
  keyword: string;
  country_code: string;
  language_code: string;
  device: string;
  last_checked_at: string | null;
  /** Last ANSWERED position, or null. A shallow read cannot contradict it. */
  last_position: number | null;
  retry: boolean;
};

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

/**
 * DataForSEO via MIVAA's dispatcher. Only params the endpoint declares.
 *
 * `acceptPartial`: DataForSEO's 40106 "partial results" returns the result pages it
 * DID fetch. A position found in those pages is real; "not found in a partial set" is
 * unknown. The caller accepts a partial set only on its last attempt, so a full page
 * set is still preferred when a retry can get one.
 */
async function serp(keyword: string, country: string, language: string, userId: string | null, acceptPartial = false, depth = 100): Promise<any> {
  const resp = await fetch(`${MIVAA_GATEWAY_URL()}/api/v1/seo-agent/dataforseo/serp_google_organic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    signal: AbortSignal.timeout(SERP_TIMEOUT_MS),
    // `country_code`, NOT `location_code` — the client maps the former to the latter
    // itself, and passing the mapped name is a hard 400 on an unexpected kwarg.
    body: JSON.stringify({
      params: { keyword, country_code: country, language_code: language, depth },
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
    const err = String(parsed?.data?.error || 'upstream returned no result');
    const partialItems = Array.isArray(parsed?.data?.items) ? parsed.data.items : [];
    if (acceptPartial && /40106/.test(err) && partialItems.length > 0) {
      // `depth` travels with the result or the row claims the depth it did not read:
      // the caller stores `depth_checked` from it, and the panel prints that number
      // as "not in top N".
      return { ...parsed.data, partial: true, partial_error: err, depth };
    }
    throw new Error(err);
  }
  const data = parsed?.data ?? {};
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('upstream returned an empty SERP');
  }
  return { ...data, depth };
}

/**
 * Three attempts with a short backoff. DataForSEO fails 8–12% of Greek depth-100
 * SERP tasks on the first try — 40106 "partial results, some pages could not be
 * retrieved after several retry attempts" and 40101 "internal SE server error",
 * both transient by their own description. One retry still left 5–8% of a sweep as
 * unknown (measured 2026-09-05: 15 failures in 128 calls, 8 keywords left failed).
 * A keyword that fails all three gets one shallower read (see `trackWebsite`) and, if
 * that fails too, is recorded as unknown with the message — never as unranked. The next
 * leg of the sweep takes it first (`seo_keywords_due`), hours later rather than tomorrow.
 */
const SERP_ATTEMPTS = 3;
const SERP_BACKOFF_MS = [1500, 4000];
async function serpWithRetry(keyword: string, country: string, language: string, userId: string | null): Promise<any> {
  let last: unknown;
  for (let attempt = 0; attempt < SERP_ATTEMPTS; attempt++) {
    try {
      return await serp(keyword, country, language, userId, attempt === SERP_ATTEMPTS - 1);
    } catch (e) {
      last = e;
      console.warn(`[seo-rank-tracker] attempt ${attempt + 1} failed for "${keyword}":`, e instanceof Error ? e.message : e);
      if (attempt < SERP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, SERP_BACKOFF_MS[attempt] ?? 4000));
    }
  }
  throw last;
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

function isOurHost(value: unknown, host: string): boolean {
  if (typeof value !== 'string' || !value) return false;
  let d = value;
  if (/^https?:\/\//i.test(d)) { try { d = new URL(d).hostname; } catch { return false; } }
  d = d.replace(/^www\./i, '').toLowerCase();
  return d === host || d.endsWith(`.${host}`);
}

/** Does any `domain`/`url` anywhere inside this SERP block name us? Bounded walk. */
function blockNamesUs(node: unknown, host: string, depth = 0): boolean {
  if (!node || typeof node !== 'object' || depth > 5) return false;
  if (Array.isArray(node)) return node.some((n) => blockNamesUs(n, host, depth + 1));
  const o = node as Record<string, unknown>;
  if (isOurHost(o.domain, host) || isOurHost(o.url, host) || isOurHost(o.source_url, host)) return true;
  return Object.values(o).some((v) => v && typeof v === 'object' && blockNamesUs(v, host, depth + 1));
}

/** The SERP blocks worth knowing we hold, in the order they matter. */
const OWNABLE_FEATURES = [
  'featured_snippet', 'ai_overview', 'people_also_ask', 'local_pack', 'knowledge_graph',
  'images', 'video', 'top_stories', 'shopping', 'popular_products',
];

/**
 * Which non-organic blocks on the page cite or show us. A position of 4 under an AI
 * Overview that cites us is a different day from a position of 4 under one that cites
 * three rivals, and `serp_features` alone (which blocks EXIST) cannot tell them apart.
 * Each block type's item shape differs (a featured snippet carries `domain` at the top,
 * an AI Overview buries it in `references`, People Also Ask in `expanded_element`), so
 * the test is a bounded walk for any domain/url that is ours rather than a per-type map
 * that goes stale the next time the provider adds a field.
 */
function ownedFeatures(items: any[], host: string): string[] {
  const owned = new Set<string>();
  for (const it of items) {
    const type = String(it?.type || '');
    if (!OWNABLE_FEATURES.includes(type)) continue;
    if (blockNamesUs(it, host)) owned.add(type);
  }
  return OWNABLE_FEATURES.filter((f) => owned.has(f));
}

/**
 * Check the keywords handed to us and store today's positions.
 *
 * WHICH keywords is not decided here — `seo_keywords_due` derives that in SQL, once,
 * for both entry points. This function's only job is asking, reading and writing.
 */
async function trackWebsite(
  supabase: any,
  website: { id: string; workspace_id: string; url: string },
  keywords: DueKeyword[],
  userId: string | null,
  deadline: number,
): Promise<{ checked: number; ranking: number; failed: number; done: string[] }> {
  const host = hostOf(website.url);
  const today = new Date().toISOString().slice(0, 10);

  let checked = 0, ranking = 0, failed = 0;
  const done: string[] = [];

  /**
   * One answered SERP → one row. `depth` comes off the result, never assumed.
   *
   * THROWS when the read was too shallow to contradict what we already know: a keyword
   * last answered at #60, read only to depth 50 because the deep pages failed, is not
   * "not ranking" — it is unknown, and storing the shallow miss as a fact is the same
   * defect as storing a failed check as unranked. Finding us is never ambiguous, and a
   * keyword with no answered position yet has nothing to contradict.
   */
  const rowFrom = (kw: DueKeyword, r: any, items: any[]): Record<string, unknown> => {
    const { position, url } = findPosition(items, host);
    const depth = Number(r.depth) || 100;
    if (position == null && kw.last_position != null && kw.last_position > depth) {
      throw new Error(`read to depth ${depth} only; last answered at #${kw.last_position}, deeper pages unavailable`);
    }
    // Every distinct block type on the page, so "we lost the featured snippet"
    // is answerable later without re-fetching.
    const features = [...new Set(items.map((i: any) => i?.type).filter(Boolean))] as string[];
    if (position != null) ranking++;
    return {
      tracked_keyword_id: kw.id, website_id: website.id, workspace_id: website.workspace_id,
      captured_at: today,
      position, found: position != null, url,
      serp_features: features, owned_features: ownedFeatures(items, host), error: null,
      depth_checked: depth,
    };
  };

  const checkOne = async (kw: DueKeyword): Promise<void> => {
    let row: Record<string, unknown>;
    let triedShallow = false;
    try {
      let r = await serpWithRetry(kw.keyword, kw.country_code, kw.language_code, userId);
      let items: any[] = r.items || [];
      // A partial page set that does not contain us says nothing about the pages that
      // did not load. Before giving up as unknown, read the top 50 — half the pages,
      // which DataForSEO fetches reliably where the deep Greek pages fail — and record
      // the depth so the panel says "not in top 50", not "not in top 100".
      if (r.partial && findPosition(items, host).position == null) {
        triedShallow = true;
        try {
          r = await serp(kw.keyword, kw.country_code, kw.language_code, userId, false, 50);
          items = r.items || [];
        } catch (fallbackErr) {
          throw new Error(String(r.partial_error || (fallbackErr instanceof Error ? fallbackErr.message : 'partial results')));
        }
      }
      row = rowFrom(kw, r, items);
    } catch (e) {
      // The last thing to try before recording UNKNOWN: one read of the top 50. What
      // DataForSEO fails on is the DEEP pages — 40106 says exactly that, and the 40101s
      // land on the same Greek depth-100 tasks — so the shallower ask often answers
      // where three deep ones did not. "Not in the top 50" is a real answer and the row
      // carries the depth that produced it; unknown is not an answer at all.
      try {
        if (triedShallow) throw e;
        const r = await serp(kw.keyword, kw.country_code, kw.language_code, userId, false, 50);
        row = rowFrom(kw, r, r.items || []);
      } catch {
        // UNKNOWN, not unranked. `found:false` with an error set is a different fact
        // from `found:false` with none, and the report separates them.
        failed++;
        row = {
          tracked_keyword_id: kw.id, website_id: website.id, workspace_id: website.workspace_id,
          captured_at: today, position: null, found: false, url: null,
          error: String(e instanceof Error ? e.message : e).slice(0, 300),
        };
      }
    }
    checked++;
    done.push(kw.keyword);
    const { error: upErr } = await supabase
      .from('seo_keyword_positions')
      .upsert(row, { onConflict: 'tracked_keyword_id,captured_at' });
    if (upErr) console.warn('[seo-rank-tracker] position write failed:', upErr.message);
    // Stamped even when the check FAILED, or a keyword whose SERP call errors would
    // stay first in the rotation forever and starve every keyword behind it. Being
    // taken first on the next leg is `seo_keywords_due`'s job, and it reads the row.
    await supabase.from('seo_tracked_keywords')
      .update({ last_checked_at: new Date().toISOString() }).eq('id', kw.id);
  };

  // A pool, not batches: a slow SERP holds up one slot, not the eleven beside it.
  // Each worker pulls the next keyword off the shared queue until it is empty or the
  // run is out of time.
  const queue: DueKeyword[] = [...keywords];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let kw = queue.shift(); kw; kw = queue.shift()) {
      if (Date.now() > deadline) break;
      await checkOne(kw);
    }
  }));

  return { checked, ranking, failed, done };
}

/**
 * Tell somebody when a keyword falls out of the top 10 — the move that actually
 * costs traffic. Deliberately NOT every position change: a tracker that alerts on
 * noise gets muted, and then it cannot alert on anything.
 */
async function alertOnDrops(
  supabase: any,
  website: { id: string; workspace_id: string },
  today: string,
  checkedInThisRun: string[],
): Promise<void> {
  try {
    const { data: all } = await supabase.rpc('seo_keywords_dropped_out_of_top10' as any, {
      p_website_id: website.id, p_captured_at: today,
    });
    // The sweep runs in several legs and every leg sees the SAME day's captures, so an
    // unfiltered alert would re-announce leg one's drops at every later leg. A keyword
    // can only have dropped in the run that actually re-checked it.
    const inThisRun = new Set(checkedInThisRun);
    const dropped = ((all as any[] | null) || []).filter((d: any) => inThisRun.has(d.keyword));
    if (!dropped.length) return;
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

  // ── One leg of the daily sweep ──
  if (action === 'cron-run') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const deadline = Date.now() + RUN_DEADLINE_MS;
    // One list for the whole platform, ordered failed-first then stalest-first, so the
    // cap falls on the freshest work rather than on whichever site sorts last. Reading
    // it per site with a per-site cap is how one large site starves a small one every
    // single leg — the site order never changes.
    const { data: due, error: dueErr } = await supabase.rpc('seo_keywords_due', {
      p_website_id: null, p_limit: MAX_PER_RUN, p_only_stale: true,
    });
    if (dueErr) return json({ error: dueErr.message }, 500);
    const bySite = new Map<string, { site: { id: string; workspace_id: string; url: string }; keywords: DueKeyword[] }>();
    for (const k of ((due as DueKeyword[] | null) || [])) {
      const entry = bySite.get(k.website_id)
        ?? { site: { id: k.website_id, workspace_id: k.workspace_id, url: k.url }, keywords: [] };
      entry.keywords.push(k);
      bySite.set(k.website_id, entry);
    }
    let checked = 0, failed = 0, skipped = 0;
    for (const { site, keywords } of bySite.values()) {
      if (Date.now() > deadline) break;
      // The SERP calls ARE the spend, so the module gate is asked before them (invariant
      // 10) — a workspace that no longer holds the SEO module is not swept for free.
      if (!(await isWorkspaceEntitled(supabase, site.workspace_id, 'seo-toolkit'))) {
        skipped += keywords.length;
        continue;
      }
      const r = await trackWebsite(supabase, site, keywords, null, deadline);
      checked += r.checked; failed += r.failed;
      if (r.checked > 0) await alertOnDrops(supabase, site, today, r.done);
    }
    // 730 days of history is the RPC's ceiling; keep a little past it and no more.
    await supabase.from('seo_keyword_positions')
      .delete().lt('captured_at', new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10));
    return json({ ok: true, due: ((due as DueKeyword[] | null) || []).length, checked, failed, skipped });
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

  // `p_only_stale: false` — a person pressing Check now gets work done whatever the
  // sweep already covered today. The order is the same, so the keywords they have been
  // waiting on are still the ones that go first.
  const { data: due, error: dueErr } = await supabase.rpc('seo_keywords_due', {
    p_website_id: website.id, p_limit: MAX_PER_RUN, p_only_stale: false,
  });
  if (dueErr) return json({ error: dueErr.message }, 500);

  const r = await trackWebsite(
    supabase, website, ((due as DueKeyword[] | null) || []), auth.userId, Date.now() + RUN_DEADLINE_MS,
  );
  if (r.checked > 0) await alertOnDrops(supabase, website, today, r.done);
  return json({ ok: true, checked: r.checked, ranking: r.ranking, failed: r.failed });
}));
