/**
 * crawl-user-website — Sitemap-driven indexer for SEO inter-linking
 *
 * Two modes:
 *   mode="preview" — fetches sitemap, samples up to 5 URLs, returns sitemap_url, total
 *                    URL count, and the sample with title/description so the user
 *                    can decide whether the site looks worth indexing. NO full crawl.
 *   mode="full"    — (default) full crawl bounded by website.max_pages.
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { chargeCronUser } from '../_shared/cron-billing.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { generateStandardEmbedding } from '../_shared/embedding-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Lazy reads so platform_secrets bootstrap (run at handler entry) is honored.
const FIRECRAWL_API_KEY = () => Deno.env.get('FIRECRAWL_API_KEY') || '';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';
const MIVAA_API_KEY = () => Deno.env.get('MIVAA_API_KEY') || '';

const MAX_SITEMAP_DEPTH = 3;
// A sitemap is an attacker-influenced document fetched from an attacker-influenced host, so its
// size is not ours to assume (#363 `EE-14`). 10 MB is far beyond any real sitemap (the sitemaps
// spec caps them at 50 MB / 50k URLs, and index files are tiny) and small enough that a
// deliberately endless response cannot exhaust the isolate.
const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
// materialshub.gr alone lists 5,247 URLs across its sitemap index (7 cities × the
// category tree), so a 1,000 ceiling silently dropped four fifths of a real site.
const MAX_PAGES_HARD_CAP = 6000;
const FIRECRAWL_CONCURRENCY = 2;
/**
 * Firecrawl rate-limits per plan, and this key is on the tier that allows ten
 * scrapes a minute: on 2026-09-05 exactly 10 of 82 pages scraped and the other 72
 * came back 429 inside twenty seconds. A crawl therefore cannot finish a real site
 * in one request (the edge gateway cuts a request off at 150 s), so a run does what
 * it can inside this budget — pages with no content first, then the stalest — and
 * the 6-hourly cron continues from where it stopped.
 */
const SCRAPE_BUDGET_MS = 80_000;
/** A page scraped cleanly this recently is stamped as still in the sitemap, not fetched again. */
const REFETCH_AFTER_DAYS = 7;
const RATE_LIMIT_DEFAULT_WAIT_MS = 12_000;
const RATE_LIMIT_MAX_RETRIES = 3;
const PREVIEW_SAMPLE_SIZE = 5;
const USER_AGENT = 'Material-Kai-Vision/1.0 (+sitemap-indexer)';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getUserIdFromJwt(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

/**
 * Embed one page, or null if the embedder is unavailable.
 *
 * This was a hand-rolled second copy of `generateStandardEmbedding` — same voyage-4 call,
 * same 1024-dim check, and the same wrong URL: it POSTed the SUPABASE EDGE proxy's request
 * shape (`{action}` to `/api/mivaa/gateway`) at the MIVAA host, which does not serve that
 * path. It 404'd on every page ever crawled, and because every failure funnels into `null`
 * here, the only symptom was `user_website_pages.embedding` being null forever while the
 * crawl reported success. Calling the shared helper fixes the path and removes the copy.
 *
 * Still returns null rather than throwing — a page without a vector is a degraded row, not a
 * failed crawl — but it LOGS now. A swallowed embedder outage is indistinguishable from a
 * site with nothing worth embedding.
 */
async function embedDocument(text: string, workspaceId: string | null): Promise<number[] | null> {
  if (!MIVAA_API_KEY()) {
    console.warn('[crawl-user-website] MIVAA_API_KEY unset — pages indexed without embeddings');
    return null;
  }
  try {
    return await generateStandardEmbedding(text, 'document', {
      operationType: 'crawl_user_website_page',
      workspaceId,
    });
  } catch (e) {
    console.error('[crawl-user-website] embedding failed — page stored without a vector:', e);
    return null;
  }
}

function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const urls: string[] = [];
  const sitemaps: string[] = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locRegex = /<loc>([^<]+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = locRegex.exec(xml)) !== null) {
    const loc = m[1].trim();
    if (!loc) continue;
    if (isIndex) sitemaps.push(loc);
    else urls.push(loc);
  }
  return { urls, sitemaps };
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // Every URL fetched here is user-derived (site base, robots, and
    // sitemap <loc> values parsed from fetched XML). Guard the initial host AND
    // re-guard every redirect hop so a public URL can't 302 us into cloud metadata
    // / internal services. We follow redirects manually to re-check each hop.
    let current = await assertSafeUrl(url);
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        signal: ctl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml,*/*' },
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        current = await assertSafeUrl(new URL(loc, current).toString());
        continue;
      }
      if (!res.ok) return null;
      // Cap WHILE reading, not after (#363 `EE-14`). `await res.text()` pulls the whole body into
      // memory before anything can object, so a check on the resulting string is a check that has
      // already lost. Content-Length is a claim the server makes and can simply omit.
      return await readCappedText(res, MAX_SITEMAP_BYTES);
    }
    return null; // too many redirects
  } catch {
    return null; // includes SSRFError — treat blocked URLs as unfetchable
  } finally {
    clearTimeout(t);
  }
}

/** Read a response body as text, aborting the moment it exceeds `maxBytes`. */
async function readCappedText(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return new TextDecoder().decode(buf);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        console.warn(`[crawl-user-website] response exceeded ${maxBytes} bytes — discarded`);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(out);
}

/**
 * Find the site's sitemap.
 *
 * The robots.txt `Sitemap:` directive is content from the crawled site, so the URL it names is
 * attacker-controlled and need not even be on the same host. It is validated HERE, before it is
 * returned to a caller that will store it (#363 `EE-19`) — `fetchText` would have rejected it
 * later, but "later" was after `user_websites.sitemap_url` had already been written.
 */
async function discoverSitemapUrl(siteUrl: string): Promise<string | null> {
  const base = siteUrl.replace(/\/+$/, '');
  const robots = await fetchText(`${base}/robots.txt`);
  if (robots) {
    const m = robots.match(/^\s*Sitemap:\s*(\S+)/im);
    if (m) {
      const declared = m[1].trim();
      try {
        // Resolve relative to the site and re-validate: this value is going to be persisted.
        const abs = new URL(declared, `${base}/`).toString();
        await assertSafeUrl(abs);
        return abs;
      } catch {
        console.warn(`[crawl-user-website] robots.txt declared an unusable sitemap: ${declared}`);
        // Fall through to the conventional paths rather than returning a URL we would refuse.
      }
    }
  }
  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']) {
    const text = await fetchText(`${base}${path}`);
    if (text && /<(urlset|sitemapindex)[\s>]/i.test(text)) return `${base}${path}`;
  }
  return null;
}

async function collectSitemapUrls(rootSitemap: string, cap: number): Promise<string[]> {
  const seen = new Set<string>();
  const collected: string[] = [];
  const queue: { url: string; depth: number }[] = [{ url: rootSitemap, depth: 0 }];

  while (queue.length && collected.length < cap) {
    const { url, depth } = queue.shift()!;
    if (seen.has(url) || depth > MAX_SITEMAP_DEPTH) continue;
    seen.add(url);
    const xml = await fetchText(url);
    if (!xml) continue;
    const { urls, sitemaps } = parseSitemap(xml);
    for (const u of urls) {
      if (collected.length >= cap) break;
      if (!seen.has(u)) {
        seen.add(u);
        collected.push(u);
      }
    }
    for (const s of sitemaps) {
      if (!seen.has(s)) queue.push({ url: s, depth: depth + 1 });
    }
  }
  return collected;
}

interface ScrapeResult {
  url: string;
  title: string | null;
  description: string | null;
  content_excerpt: string | null;
  /** The PAGE's status as Firecrawl saw it — never Firecrawl's own status. */
  http_status: number | null;
  error: string | null;
  rate_limited?: boolean;
  retry_after_ms?: number;
}

/** Retry-After header in seconds, else a reset hint in Firecrawl's message, else the default. */
function retryAfterMs(res: Response, message: string): number {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 60_000);
  const inSecs = /reset(?:s)?\s+in:?\s*(\d+)\s*s/i.exec(message)?.[1] ?? /retry (?:after|in)\s*(\d+)\s*s/i.exec(message)?.[1];
  if (inSecs) return Math.min(Number(inSecs) * 1000 + 500, 60_000);
  const at = /reset(?:s)?\s+at:?\s*([0-9T:.+-]+Z?)/i.exec(message)?.[1];
  if (at) {
    const t = Date.parse(at);
    if (Number.isFinite(t) && t > Date.now()) return Math.min(t - Date.now() + 500, 60_000);
  }
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}

async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  const firecrawlKey = FIRECRAWL_API_KEY();
  if (!firecrawlKey) {
    return { url, title: null, description: null, content_excerpt: null, http_status: null, error: 'FIRECRAWL_API_KEY not configured' };
  }
  // The URL came out of a `<loc>` in a document the crawled site wrote, so the target set is
  // chosen by the site being crawled, not by us (#363 `EE-13`). Handing it to Firecrawl
  // unchecked outsources the fetch — a request we paid for, aimed wherever the sitemap
  // pointed, including hosts the SSRF guard exists to refuse. Validate before we spend.
  try {
    await assertSafeUrl(url);
  } catch (e: any) {
    return {
      url, title: null, description: null, content_excerpt: null, http_status: null,
      error: `blocked by URL guard: ${e?.message || 'unsafe URL'}`,
    };
  }
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 20_000 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      const message = String(data?.error || `firecrawl ${res.status}`);
      // Firecrawl's status is OUR quota or its outage, not the page's: storing it as
      // http_status filed 72 live pages as "429" on 2026-09-05. Unknown stays null.
      if (res.status === 429) {
        return {
          url, title: null, description: null, content_excerpt: null, http_status: null,
          error: `rate limited: ${message}`, rate_limited: true, retry_after_ms: retryAfterMs(res, message),
        };
      }
      return { url, title: null, description: null, content_excerpt: null, http_status: null, error: message };
    }
    const md = (data.data?.markdown || '') as string;
    const meta = data.data?.metadata || {};
    const excerpt = md.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 600);
    return {
      url,
      title: meta.title || meta.ogTitle || null,
      description: meta.description || meta.ogDescription || null,
      content_excerpt: excerpt || null,
      http_status: meta.statusCode || 200,
      error: null,
    };
  } catch (e: any) {
    return { url, title: null, description: null, content_excerpt: null, http_status: null, error: e?.message || 'fetch failed' };
  }
}

/**
 * A worker pool that honours Firecrawl's rate limit and a wall-clock deadline.
 *
 * A 429 pauses EVERY worker until the reset — the limit is per key, not per
 * request, so the other worker hammering on is just a second refusal — then the
 * same URL is retried. A URL still refused after the retries, or reached after the
 * deadline, is returned as `skipped`: the caller leaves its stored content alone
 * and the next run picks it up first.
 */
async function pacedScrape(urls: string[], deadline: number): Promise<{ scrapes: ScrapeResult[]; skipped: string[] }> {
  const queue = [...urls];
  const scrapes: ScrapeResult[] = [];
  const skipped: string[] = [];
  let pausedUntil = 0;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      let result: ScrapeResult | null = null;
      for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
        const wait = pausedUntil - Date.now();
        if (wait > 0) {
          if (Date.now() + wait > deadline) break;
          await sleep(wait);
        }
        if (Date.now() > deadline) break;
        const r = await firecrawlScrape(url);
        if (!r.rate_limited) { result = r; break; }
        pausedUntil = Math.max(pausedUntil, Date.now() + (r.retry_after_ms ?? RATE_LIMIT_DEFAULT_WAIT_MS));
      }
      if (result) scrapes.push(result); else skipped.push(url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FIRECRAWL_CONCURRENCY, queue.length) }, worker));
  return { scrapes, skipped };
}

/** Preview-sized scrape: everything, or an explicit failure per URL the budget left out. */
async function chunkedScrape(urls: string[]): Promise<ScrapeResult[]> {
  const { scrapes, skipped } = await pacedScrape(urls, Date.now() + SCRAPE_BUDGET_MS);
  return [
    ...scrapes,
    ...skipped.map((url): ScrapeResult => ({
      url, title: null, description: null, content_excerpt: null, http_status: null, error: 'rate limited', rate_limited: true,
    })),
  ];
}

/** Pick N evenly-spaced items from arr — gives a non-biased sample of the sitemap. */
function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const out: T[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

async function previewWebsite(
  supabase: DbClient,
  website: { id: string; user_id: string; url: string; sitemap_url: string | null },
): Promise<{
  ok: boolean;
  sitemap_url: string | null;
  pages_discovered: number;
  capped_at: number;
  sample: { url: string; title: string | null; description: string | null; ok: boolean }[];
  error?: string;
}> {
  let sitemapUrl = website.sitemap_url;
  const discovered = !sitemapUrl;
  if (!sitemapUrl) {
    sitemapUrl = await discoverSitemapUrl(website.url);
    if (!sitemapUrl) {
      await supabase.from('user_websites').update({
        last_crawl_error: 'Could not autodetect sitemap. Add sitemap_url manually.',
      }).eq('id', website.id);
      return { ok: false, sitemap_url: null, pages_discovered: 0, capped_at: 0, sample: [], error: 'sitemap not found' };
    }
  }

  const urls = await collectSitemapUrls(sitemapUrl, MAX_PAGES_HARD_CAP);
  if (urls.length === 0) {
    return { ok: false, sitemap_url: sitemapUrl, pages_discovered: 0, capped_at: 0, sample: [], error: 'sitemap empty' };
  }
  // Persist AFTER it has proven usable, never before (#363 `EE-19`). The old order stored the
  // discovered URL and then validated it, so a hostile robots.txt could leave an unusable — and
  // previously unvalidated — target sitting in `user_websites.sitemap_url`, surviving the
  // rejection and waiting for any later consumer that does not re-check it.
  if (discovered) {
    await supabase.from('user_websites').update({ sitemap_url: sitemapUrl }).eq('id', website.id);
  }

  const sample = sampleEvenly(urls, PREVIEW_SAMPLE_SIZE);
  const scrapes = await chunkedScrape(sample);

  return {
    ok: true,
    sitemap_url: sitemapUrl,
    pages_discovered: urls.length,
    capped_at: Math.min(urls.length, MAX_PAGES_HARD_CAP),
    sample: scrapes.map((s) => ({
      url: s.url,
      title: s.title,
      description: s.description,
      ok: !s.error && !!s.title,
    })),
  };
}

async function crawlOneWebsite(
  supabase: DbClient,
  website: { id: string; user_id: string; workspace_id: string | null; url: string; sitemap_url: string | null; max_pages: number },
): Promise<{
  ok: boolean; pages_indexed: number; pages_discovered: number;
  pages_capped_at: number; capped: boolean;
  pages_with_content: number; pages_pending: number; rate_limited: number;
  error?: string;
}> {
  const { id: websiteId, user_id: userId, workspace_id: workspaceId, url: siteUrl, max_pages } = website;
  const cap = Math.min(max_pages || 50, MAX_PAGES_HARD_CAP);
  const nothing = { pages_indexed: 0, pages_discovered: 0, pages_capped_at: cap, capped: false, pages_with_content: 0, pages_pending: 0, rate_limited: 0 };

  let sitemapUrl = website.sitemap_url;
  const discovered = !sitemapUrl;
  if (!sitemapUrl) {
    sitemapUrl = await discoverSitemapUrl(siteUrl);
    if (!sitemapUrl) {
      await supabase.from('user_websites').update({
        last_crawled_at: new Date().toISOString(),
        last_crawl_error: 'Could not autodetect sitemap. Add sitemap_url manually.',
      }).eq('id', websiteId);
      return { ok: false, ...nothing, error: 'sitemap not found' };
    }
  }

  // Collect the WHOLE sitemap (bounded by the hard cap) and cut to this site's cap
  // afterwards, so the caller learns the real size. Collecting only `cap` entries
  // reported "50 of 50 pages indexed" for a 127-URL sitemap: the cap was invisible
  // and read as the site having 50 pages.
  const allUrls = await collectSitemapUrls(sitemapUrl, MAX_PAGES_HARD_CAP);
  if (allUrls.length === 0) {
    await supabase.from('user_websites').update({
      last_crawled_at: new Date().toISOString(),
      last_crawl_error: 'Sitemap returned no URLs.',
    }).eq('id', websiteId);
    return { ok: false, ...nothing, error: 'sitemap empty' };
  }
  const urls = allUrls.slice(0, cap);
  const capped = allUrls.length > cap;
  // Store only once the sitemap has actually yielded URLs (#363 `EE-19`).
  if (discovered) {
    await supabase.from('user_websites').update({ sitemap_url: sitemapUrl }).eq('id', websiteId);
  }

  const crawlStartedAt = new Date().toISOString();

  // What each URL needs. A page scraped cleanly within REFETCH_AFTER_DAYS is only
  // stamped as still in the sitemap; the rest are fetched, pages with no content
  // first and then the stalest. Re-scraping every page four times a day spent the
  // whole rate-limit allowance on pages that had not changed.
  const { data: existingRows } = await supabase
    .from('user_website_pages')
    .select('url, fetched_at, content_excerpt')
    .eq('website_id', websiteId);
  const existing = new Map<string, { fetched_at: number; has_content: boolean }>();
  for (const r of existingRows || []) {
    existing.set(r.url, { fetched_at: r.fetched_at ? Date.parse(r.fetched_at) : 0, has_content: !!r.content_excerpt });
  }
  const freshCutoff = Date.now() - REFETCH_AFTER_DAYS * 86_400_000;
  const fresh: string[] = [];
  const toFetch: { url: string; fetched_at: number; has_content: boolean }[] = [];
  for (const url of urls) {
    const row = existing.get(url);
    if (row?.has_content && row.fetched_at >= freshCutoff) fresh.push(url);
    else toFetch.push({ url, fetched_at: row?.fetched_at ?? 0, has_content: !!row?.has_content });
  }
  toFetch.sort((a, b) => Number(a.has_content) - Number(b.has_content) || a.fetched_at - b.fetched_at);

  const { scrapes, skipped } = await pacedScrape(toFetch.map((t) => t.url), Date.now() + SCRAPE_BUDGET_MS);

  let indexed = 0;
  let rateLimited = 0;
  // Upsert failures were previously discarded — `upsert(...)` was called and its `error` never
  // read, so a crawl in which every single write was rejected still returned ok:true, cleared
  // `last_crawl_error` and stamped `last_crawled_at` (#363 `EE-18`). Zero pages written looks
  // identical to a site with nothing new, which is the silent-zero shape: count the failures and
  // let them decide the verdict.
  let writes = 0;
  let writeFailures = 0;
  const firstWriteError: string[] = [];
  const recordWrite = (error: { message?: string } | null) => {
    writes += 1;
    if (!error) return;
    writeFailures += 1;
    if (firstWriteError.length === 0) firstWriteError.push(error.message || 'unknown write error');
  };

  for (const s of scrapes) {
    if (s.error || !s.content_excerpt) {
      // Keep whatever an earlier crawl stored: a failed scrape says nothing about the
      // page, and writing nulls over a good excerpt is how 72 indexed pages became
      // empty rows in one rate-limited run. Only the sitemap stamp moves, plus the
      // page's real status when Firecrawl actually reached it.
      const { error: upsertErr } = await supabase.from('user_website_pages').upsert({
        website_id: websiteId, user_id: userId, url: s.url,
        last_seen_in_sitemap: crawlStartedAt, is_active: true,
        ...(s.http_status ? { http_status: s.http_status, fetched_at: new Date().toISOString() } : {}),
      }, { onConflict: 'website_id,url' });
      recordWrite(upsertErr);
      if (s.rate_limited) rateLimited += 1;
      continue;
    }

    const embedSource = [s.title || '', s.description || '', s.content_excerpt || ''].filter(Boolean).join('\n\n');
    const embedding = await embedDocument(embedSource, workspaceId);

    const { error: upsertErr } = await supabase.from('user_website_pages').upsert({
      website_id: websiteId, user_id: userId, url: s.url,
      title: s.title, description: s.description, content_excerpt: s.content_excerpt,
      keywords: [], embedding: embedding as any, http_status: s.http_status,
      last_seen_in_sitemap: crawlStartedAt, fetched_at: new Date().toISOString(), is_active: true,
    }, { onConflict: 'website_id,url' });
    recordWrite(upsertErr);

    if (embedding && !upsertErr) indexed += 1;
  }

  // Pages not fetched this run — the fresh ones, and those the budget or the rate
  // limit left over — are still in the sitemap and must not be retired below.
  const seenOnly = [...fresh, ...skipped];
  for (let i = 0; i < seenOnly.length; i += 200) {
    const { error: seenErr } = await supabase.from('user_website_pages').upsert(
      seenOnly.slice(i, i + 200).map((url) => ({
        website_id: websiteId, user_id: userId, url, last_seen_in_sitemap: crawlStartedAt, is_active: true,
      })),
      { onConflict: 'website_id,url' },
    );
    recordWrite(seenErr);
  }

  // Deactivating pages that vanished from the sitemap is only correct if this crawl actually
  // saw the sitemap through. After widespread write failures the `last_seen_in_sitemap` stamps
  // are missing, so this sweep would retire pages that are still live.
  const allWritesFailed = writes > 0 && writeFailures === writes;
  if (!allWritesFailed) {
    await supabase.from('user_website_pages')
      .update({ is_active: false })
      .eq('website_id', websiteId)
      .lt('last_seen_in_sitemap', crawlStartedAt);
  }

  // "Indexed" means holding content. An active row with nothing in it is a URL we
  // know about, not a page anybody can search or interlink.
  const { count: withContent } = await supabase
    .from('user_website_pages')
    .select('id', { count: 'exact', head: true })
    .eq('website_id', websiteId)
    .eq('is_active', true)
    .not('content_excerpt', 'is', null);

  const writeError = writeFailures > 0
    ? `${writeFailures}/${writes} page writes failed: ${firstWriteError[0]}`
    : null;

  await supabase.from('user_websites').update({
    last_crawled_at: new Date().toISOString(),
    last_crawl_error: writeError,
    page_count: withContent ?? indexed,
  }).eq('id', websiteId);

  if (writeError) console.error(`[crawl-user-website] ${websiteId}: ${writeError}`);
  const pending = skipped.length + rateLimited;
  if (pending > 0) {
    console.warn(`[crawl-user-website] ${websiteId}: ${pending} of ${urls.length} pages left for the next run (${rateLimited} rate-limited, ${skipped.length} past the budget)`);
  }

  // Partial write failure is reported, not hidden; total failure is not a successful crawl.
  return {
    ok: !allWritesFailed,
    pages_indexed: indexed,
    pages_discovered: allUrls.length,
    pages_capped_at: cap,
    capped,
    pages_with_content: withContent ?? 0,
    pages_pending: pending,
    rate_limited: rateLimited,
    ...(writeError ? { error: writeError } : {}),
  };
}

Deno.serve(withApiLogging('crawl-user-website', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  await bootstrapForFunction();

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const cronHeader = req.headers.get('x-cron-secret') || '';
  const cronSecret = CRON_SECRET();
  const isCron = !!cronSecret && cronHeader === cronSecret;

  let userId: string | null = null;
  if (!isCron) {
    userId = await getUserIdFromJwt(req);
    if (!userId) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  if (!body?.website_id) {
    return jsonResponse({ success: false, error: 'Missing website_id' }, 400);
  }

  const { data: website, error } = await supabase
    .from('user_websites')
    .select('id, user_id, workspace_id, url, sitemap_url, max_pages, is_active')
    .eq('id', body.website_id)
    .maybeSingle();

  if (error || !website) return jsonResponse({ success: false, error: 'Website not found' }, 404);
  // Invariant #1 (BOLA): user_websites is workspace-shared. The service-role client
  // above bypasses RLS, so reconcile the caller against the row's workspace by MEMBERSHIP,
  // not the body-supplied id. Return 404 (not 403) on mismatch to avoid id enumeration.
  if (!isCron && !(await userCanAccessWorkspace(supabase, userId, website.workspace_id))) {
    return jsonResponse({ success: false, error: 'Website not found' }, 404);
  }
  if (!website.is_active) return jsonResponse({ success: false, error: 'Website is inactive' }, 400);

  const mode = body.mode === 'preview' ? 'preview' : 'full';

  // ── Credit metering ──────────────────────────────────────────────────────
  // Firecrawl scrape fan-out (+ MIVAA Voyage embed per page) is paid upstream.
  // Interactive user calls debit_credits; the cron path charges the website
  // owner's PERSONAL balance (user_websites is user-scoped — no workspace, so
  // chargeCronUser, not chargeCronWorkspace). NOTE: 'seo-website-crawl' must be
  // registered in the cron cost registry for the cron charge to take effect;
  // chargeCronUser fails OPEN (charges 0, still runs) until it is.
  const WEBSITE_CRAWL_CREDIT_COST = mode === 'preview' ? 1 : 5;
  let billedUserId: string | null = null;
  let billedAmount = 0;
  if (isCron) {
    const r = await chargeCronUser(supabase, website.user_id as string, 'seo-website-crawl', {
      units: 1, description: `crawl ${website.url}`,
    });
    if (!r.allowed) {
      return jsonResponse({ success: false, error: 'insufficient_credits', skipped: true }, 200);
    }
    if (r.charged > 0) { billedUserId = website.user_id as string; billedAmount = r.charged; }
  } else {
    const { data: dd, error: de } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: WEBSITE_CRAWL_CREDIT_COST,
      p_operation_type: 'website_crawl',
      p_description: `Website ${mode} crawl (${website.url})`,
      p_metadata: { website_id: website.id, mode },
      p_workspace_id: null,
    });
    const drow = Array.isArray(dd) ? dd[0] : dd;
    if (de || !drow?.success) {
      return jsonResponse({ success: false, error: drow?.error_message || de?.message || 'Insufficient credits' }, 402);
    }
    billedUserId = userId;
    billedAmount = WEBSITE_CRAWL_CREDIT_COST;
  }
  const refundCrawl = async (reason: string): Promise<void> => {
    if (!billedUserId || billedAmount <= 0) return;
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: billedUserId,
        p_amount: billedAmount,
        p_operation_type: 'website_crawl_refund',
        p_description: `Website crawl refund (${reason})`,
        p_metadata: { website_id: website.id, mode },
        p_workspace_id: null,
      });
    } catch (e) { console.warn('[crawl-user-website] refund failed:', e); }
  };

  try {
    if (mode === 'preview') {
      console.log(`[crawl-user-website] PREVIEW ${website.url}`);
      const result = await previewWebsite(supabase, website);
      if (!result.ok) await refundCrawl('preview_failed');
      return jsonResponse({ success: result.ok, mode: 'preview', data: result });
    }

    console.log(`[crawl-user-website] FULL ${website.url} (cap=${website.max_pages})`);
    const result = await crawlOneWebsite(supabase, website);
    if (!result.ok) await refundCrawl('crawl_failed');
    return jsonResponse({ success: result.ok, mode: 'full', data: result });
  } catch (e: any) {
    console.error('[crawl-user-website] error:', e);
    await refundCrawl('exception');
    if (mode === 'full') {
      await supabase.from('user_websites').update({
        last_crawled_at: new Date().toISOString(),
        last_crawl_error: e?.message?.slice(0, 500) || 'Crawl failed',
      }).eq('id', website.id);
    }
    return jsonResponse({ success: false, error: e?.message || 'Crawl failed' }, 500);
  }
}));
