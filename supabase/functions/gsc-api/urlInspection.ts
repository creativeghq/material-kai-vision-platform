/**
 * Search Console URL Inspection — has Google crawled this page, and did it index it?
 *
 * `gsc_performance` only holds pages that earned an impression, which is two steps downstream of
 * crawling. "5,351 URLs, 42 with impressions" has three explanations with three different fixes
 * (never crawled / crawled and declined / indexed but never matched) and nothing here could tell
 * them apart. This asks.
 */

const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

/**
 * Per-SITE quota, from Google's published limits: 2,000 queries per day and 600 per minute.
 * The daily figure is the one that shapes this — 5,351 URLs is about three days of backfill —
 * and it is per site, so two connected properties do not share it.
 */
export const INSPECT_QUOTA_PER_DAY = 2000;
const INSPECT_QPM = 600;

/**
 * Measured, not guessed: one inspection takes ~6.5s, because it is a live index lookup rather
 * than a table read. Serial, that is 13 URLs in a 90s run — 5,351 pages would take ~100 days
 * while using 3% of the quota. The limit here is LATENCY, so the fix is concurrency, not pacing.
 * 10 in flight is ~92 req/min against a 600 QPM ceiling, and fills a run with ~138 URLs.
 */
const INSPECT_CONCURRENCY = 10;
/** Floor between a worker's calls, so a fast reply cannot push the pool past the QPM ceiling. */
const MIN_INTERVAL_MS = Math.ceil((60_000 / INSPECT_QPM) * INSPECT_CONCURRENCY);

/** The edge gateway cuts a request at 150s, so a run does what it can and the cron continues. */
const RUN_BUDGET_MS = 90_000;

export interface InspectionRow {
  url: string;
  verdict: string | null;
  coverage_state: string | null;
  robots_txt_state: string | null;
  indexing_state: string | null;
  page_fetch_state: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  last_crawl_time: string | null;
  source_error: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One inspection. Never throws: a failure is a row with a stated reason, not a missing row. */
async function inspectOne(token: string, siteUrl: string, url: string): Promise<InspectionRow> {
  const empty: InspectionRow = {
    url, verdict: null, coverage_state: null, robots_txt_state: null, indexing_state: null,
    page_fetch_state: null, google_canonical: null, user_canonical: null, last_crawl_time: null,
    source_error: null,
  };
  try {
    const res = await fetch(INSPECT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: 'en-US' }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ...empty, source_error: String(j?.error?.message || `inspect ${res.status}`) };
    }
    const r = j?.inspectionResult?.indexStatusResult || {};
    return {
      url,
      verdict: r.verdict ?? null,
      coverage_state: r.coverageState ?? null,
      robots_txt_state: r.robotsTxtState ?? null,
      indexing_state: r.indexingState ?? null,
      page_fetch_state: r.pageFetchState ?? null,
      google_canonical: r.googleCanonical ?? null,
      user_canonical: r.userCanonical ?? null,
      last_crawl_time: r.lastCrawlTime ?? null,
      source_error: null,
    };
  } catch (e) {
    return { ...empty, source_error: e instanceof Error ? e.message : 'inspect failed' };
  }
}

export interface InspectRunResult {
  inspected: number;
  failed: number;
  quota_used_today: number;
  quota_remaining: number;
  budget_exhausted: boolean;
  queue_remaining: number;
}

/**
 * Inspect the stalest URLs for one connected site, inside today's remaining quota.
 *
 * @param urlsToInspect Work queue, already ordered by the caller (never-inspected first).
 */
export async function inspectSiteUrls(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conn: { website_id: string; workspace_id: string | null; property: string },
  token: string,
  urlsToInspect: string[],
): Promise<InspectRunResult> {
  // Quota is per DAY per site, so it is counted from what we actually wrote today rather than
  // tracked in a counter that a failed run would leave wrong.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('gsc_url_inspection')
    .select('id', { count: 'exact', head: true })
    .eq('website_id', conn.website_id)
    .gte('inspected_at', startOfDay.toISOString());

  const usedToday = count ?? 0;
  const remaining = Math.max(0, INSPECT_QUOTA_PER_DAY - usedToday);
  const deadline = Date.now() + RUN_BUDGET_MS;

  let inspected = 0;
  let failed = 0;
  let budgetExhausted = false;

  // One shared cursor across the workers, so the quota and the deadline are enforced against the
  // POOL rather than per worker — ten workers each counting to `remaining` would spend it tenfold.
  let cursor = 0;
  const takeNext = (): string | null => {
    // `cursor`, not `inspected`: a URL handed to a worker is already spent against the quota
    // whether or not its reply has landed yet. Counting completions would let ten in-flight
    // calls overshoot the day's allowance.
    if (cursor >= urlsToInspect.length || cursor >= remaining) return null;
    if (Date.now() > deadline) { budgetExhausted = true; return null; }
    return urlsToInspect[cursor++];
  };

  const inspectAndStore = async (url: string) => {
    const row = await inspectOne(token, conn.property, url);
    if (row.source_error) failed++;

    // Derive the verdict in SQL, never here — gsc_crawl_status() is the one mapping.
    const { data: status } = await supabase.rpc('gsc_crawl_status', {
      p_coverage_state: row.coverage_state,
      p_verdict: row.verdict,
      p_robots_txt_state: row.robots_txt_state,
      p_indexing_state: row.indexing_state,
      p_page_fetch_state: row.page_fetch_state,
    });

    await supabase.from('gsc_url_inspection').upsert({
      website_id: conn.website_id,
      workspace_id: conn.workspace_id,
      url: row.url,
      verdict: row.verdict,
      coverage_state: row.coverage_state,
      robots_txt_state: row.robots_txt_state,
      indexing_state: row.indexing_state,
      page_fetch_state: row.page_fetch_state,
      google_canonical: row.google_canonical,
      user_canonical: row.user_canonical,
      last_crawl_time: row.last_crawl_time,
      // A failed call leaves the verdict UNKNOWN with the reason beside it. Writing 'unknown'
      // silently, or skipping the row, would make "we could not ask" look like "no answer yet".
      crawl_status: row.source_error ? 'unknown' : (status ?? 'unknown'),
      inspected_at: new Date().toISOString(),
      source_error: row.source_error,
    }, { onConflict: 'website_id,url' });

    inspected++;
  };

  await Promise.all(
    Array.from({ length: Math.min(INSPECT_CONCURRENCY, urlsToInspect.length) }, async () => {
      for (;;) {
        const url = takeNext();
        if (url === null) return;
        await inspectAndStore(url);
        await sleep(MIN_INTERVAL_MS);
      }
    }),
  );

  return {
    inspected,
    failed,
    quota_used_today: usedToday + inspected,
    quota_remaining: Math.max(0, remaining - inspected),
    budget_exhausted: budgetExhausted,
    queue_remaining: Math.max(0, urlsToInspect.length - inspected),
  };
}

/**
 * The work queue for one site: every known URL, never-inspected first, then the stalest.
 * Ordering here rather than in the caller keeps "what to ask next" in one place.
 */
export async function buildInspectionQueue(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  websiteId: string,
  limit: number,
): Promise<string[]> {
  const { data: pages } = await supabase
    .from('user_website_pages')
    .select('url')
    .eq('website_id', websiteId)
    .eq('is_active', true)
    .limit(6000);
  const all: string[] = (pages || []).map((p: { url: string }) => p.url);
  if (all.length === 0) return [];

  const { data: seen } = await supabase
    .from('gsc_url_inspection')
    .select('url, inspected_at')
    .eq('website_id', websiteId);
  const seenAt = new Map<string, number>();
  for (const r of (seen || []) as Array<{ url: string; inspected_at: string }>) {
    seenAt.set(r.url, Date.parse(r.inspected_at));
  }

  return all
    .map((url) => ({ url, at: seenAt.get(url) ?? 0 }))
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((x) => x.url);
}
