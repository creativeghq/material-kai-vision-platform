/**
 * crawl-user-website — Demand-driven page indexer.
 *
 * A page is read because SEARCH EVIDENCE names it — Search Console, the rank tracker, or
 * DataForSEO Labs, via `get_page_crawl_queue`. The sitemap says only which URLs exist, which is
 * one free XML fetch and no longer a reason to read any of them.
 *
 * Modes: "preview" samples 5 URLs so a user can judge a site; "full" (default) reads the queue.
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { scrapeMarkdown, excerptFromMarkdown } from '../_shared/scrape-markdown.ts';
import { chargeCronUser, refundCronUser } from '../_shared/cron-billing.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { generateStandardEmbedding } from '../_shared/embedding-utils.ts';
import { extractContentImages, type PageImage } from '../_shared/page-images.ts';
import { extractContentLinks, extractSpecs, textFromHtml, type PageSpecs } from './spec-extract.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Lazy reads so platform_secrets bootstrap (run at handler entry) is honored.
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';
const MIVAA_API_KEY = () => Deno.env.get('MIVAA_API_KEY') || '';

const MAX_SITEMAP_DEPTH = 3;
const MAX_CHILD_SITEMAPS = 60;
/** A sitemap this small is hand-made pages (articles, landing pages), not a generated matrix. */
const EDITORIAL_SITEMAP_MAX = 300;
// A sitemap is an attacker-influenced document fetched from an attacker-influenced host, so its
// size is not ours to assume (#363 `EE-14`). 10 MB is far beyond any real sitemap (the sitemaps
// spec caps them at 50 MB / 50k URLs, and index files are tiny) and small enough that a
// deliberately endless response cannot exhaust the isolate.
const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
// materialshub.gr alone lists 5,247 URLs across its sitemap index (7 cities × the
// category tree), so a 1,000 ceiling silently dropped four fifths of a real site.
const MAX_PAGES_HARD_CAP = 6000;
const FIRECRAWL_CONCURRENCY = 2;
/** The edge gateway cuts a request at 150 s; anything the budget misses is refunded and requeued. */
const SCRAPE_BUDGET_MS = 80_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
/** Below this much extracted text the HTML held no readable content — a client-rendered shell. */
const DIRECT_TEXT_FLOOR = 250;
/** Ceiling for a tenant whose first Search Console connection arrives with a whole backlog. */
const MAX_FETCH_PER_RUN = 40;
/** Spare capacity after the demand queue goes to never-read sitemap pages, direct fetch only. */
const MAX_BACKFILL_PER_RUN = 50;
/** Day-one sample for a site that ranks for nothing yet, so neither demand feed can name a page. */
const SEED_SAMPLE_SIZE = 20;
const PER_PAGE_CREDIT_COST = 1;
const PREVIEW_CREDIT_COST = 1;
const RATE_LIMIT_DEFAULT_WAIT_MS = 12_000;
const RATE_LIMIT_MAX_RETRIES = 3;
const PREVIEW_SAMPLE_SIZE = 5;
const USER_AGENT = 'Material-Kai-Vision/1.0 (+sitemap-indexer)';
const MAX_FOCUS_TERMS = 6;
const SPEC_BACKFILL_DEFAULT = 20;
const SPEC_BACKFILL_MAX = 40;

/** Slug words a caller asks to read first (an article's topic). Lower-case ASCII only: they travel into URL matching. */
function focusTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((t) => String(t).toLowerCase().trim()).filter((t) => /^[a-z0-9]{3,40}$/.test(t)))]
    .slice(0, MAX_FOCUS_TERMS);
}

/** Every focus term appears in the URL path, so "plakakia terrazzo" does not match every tile. */
function matchesFocus(url: string, focus: string[]): boolean {
  if (!focus.length) return false;
  const path = url.toLowerCase().replace(/^https?:\/\/[^/]+/, '');
  return focus.every((t) => path.includes(t));
}

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

/** The calling user (JWT or kai_ key); a key is confined to its own workspace (`undefined` = no key). */
async function getCaller(req: Request): Promise<{ userId: string; keyWorkspaceId: string | null | undefined } | null> {
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return null;
  return { userId: auth.userId, keyWorkspaceId: auth.apiKey ? auth.apiKey.workspace_id : undefined };
}

/** Embed one page, or null if the embedder is unavailable. */
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

/**
 * Every URL reaching here is user-derived (site base, robots, sitemap <loc> values, a demand
 * feed's URL), so the initial host AND every redirect hop are re-guarded — a public URL must not
 * 302 us into cloud metadata. Redirects are followed manually for exactly that.
 */
async function fetchGuarded(
  url: string,
  opts: { accept: string; maxBytes: number; timeoutMs?: number },
): Promise<{ text: string | null; status: number | null }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000);
  try {
    let current = await assertSafeUrl(url);
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        signal: ctl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: opts.accept },
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return { text: null, status: res.status };
        current = await assertSafeUrl(new URL(loc, current).toString());
        continue;
      }
      if (!res.ok) return { text: null, status: res.status };
      // Cap WHILE reading, not after (#363 `EE-14`). `await res.text()` pulls the whole body into
      // memory before anything can object, so a check on the resulting string is a check that has
      // already lost. Content-Length is a claim the server makes and can simply omit.
      return { text: await readCappedText(res, opts.maxBytes), status: res.status };
    }
    return { text: null, status: null }; // too many redirects
  } catch {
    return { text: null, status: null }; // includes SSRFError — treat blocked URLs as unfetchable
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  const { text } = await fetchGuarded(url, {
    accept: 'application/xml,text/xml,*/*',
    maxBytes: MAX_SITEMAP_BYTES,
    timeoutMs,
  });
  return text;
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

/**
 * Every child sitemap gets a fair share of `cap`: a small one is kept whole and the large ones
 * split what remains. Filling in document order let one programmatic sitemap take the whole cap,
 * so the editorial and product sitemaps listed after it were never seen and their pages retired.
 * `editorial` = URLs from sitemaps small enough to be hand-made, read first by the backfill.
 */
async function collectSitemapUrls(
  rootSitemap: string,
  cap: number,
  alreadyRead: Set<string> = new Set(),
  focus: string[] = [],
): Promise<{ urls: string[]; editorial: Set<string>; total: number; skippedSitemaps: number }> {
  const seen = new Set<string>();
  const lists: string[][] = [];
  const queue: { url: string; depth: number }[] = [{ url: rootSitemap, depth: 0 }];

  while (queue.length && lists.length < MAX_CHILD_SITEMAPS) {
    const { url, depth } = queue.shift()!;
    if (seen.has(url) || depth > MAX_SITEMAP_DEPTH) continue;
    seen.add(url);
    const xml = await fetchText(url);
    if (!xml) continue;
    const { urls, sitemaps } = parseSitemap(xml);
    const fresh = urls.filter((u) => !seen.has(u));
    fresh.forEach((u) => seen.add(u));
    if (fresh.length) lists.push(fresh);
    for (const s of sitemaps) {
      if (!seen.has(s)) queue.push({ url: s, depth: depth + 1 });
    }
  }

  const shares = new Map<string[], number>();
  let remaining = cap;
  const open = [...lists].sort((a, b) => a.length - b.length);
  while (open.length) {
    const fair = Math.floor(remaining / open.length);
    const list = open.shift()!;
    const take = Math.min(list.length, fair);
    shares.set(list, take);
    remaining -= take;
  }
  const collected: string[] = [];
  const editorial = new Set<string>();
  for (const list of lists) {
    // Inside a share, a page we have already read is kept before one we have not, so a full
    // share never retires an indexed page in favour of an unread one.
    const focused = list.filter((u) => matchesFocus(u, focus));
    const rest = list.filter((u) => !matchesFocus(u, focus));
    const ordered = [...focused, ...rest.filter((u) => alreadyRead.has(u)), ...rest.filter((u) => !alreadyRead.has(u))];
    const take = ordered.slice(0, shares.get(list) ?? 0);
    collected.push(...take);
    if (list.length <= EDITORIAL_SITEMAP_MAX && take.length === list.length) take.forEach((u) => editorial.add(u));
  }
  return { urls: collected, editorial, total: lists.reduce((n, l) => n + l.length, 0), skippedSitemaps: queue.length };
}

interface ScrapeResult {
  url: string;
  title: string | null;
  description: string | null;
  content_excerpt: string | null;
  /** The WHOLE document. A suggestion needs the body the keyword should appear in, not a summary. */
  text: string | null;
  /** The PAGE's status as the reader saw it — never the scraper's own status. */
  http_status: number | null;
  error: string | null;
  rate_limited?: boolean;
  retry_after_ms?: number;
  fetch_method?: 'direct' | 'firecrawl';
  /** Only a direct read sees the HTML; absent means "not read", never "no photos". */
  images?: PageImage[];
  /** Direct read only, like `images`: absent = not read, null = read and the page states none. */
  specs?: PageSpecs | null;
  links_to?: string[];
  /** Absent = this read could not see it, so the stored value is kept. */
  h1?: string | null;
  canonical_url?: string | null;
  lang?: string | null;
}

/**
 * The fetch itself lives in `_shared/scrape-markdown.ts` — the sitemap indexer and the page
 * scorer must not hold two copies of "call Firecrawl and read the status correctly".
 */
async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  const page = await scrapeMarkdown(url);
  return {
    url: page.url,
    title: page.title,
    description: page.description,
    content_excerpt: excerptFromMarkdown(page.markdown),
    text: page.markdown,
    http_status: page.http_status,
    error: page.error,
    fetch_method: 'firecrawl',
    ...markdownH1(page.markdown),
    ...(page.rate_limited ? { rate_limited: true, retry_after_ms: page.retry_after_ms } : {}),
  };
}

function markdownH1(markdown: string | null): { h1?: string } {
  const raw = markdown ? /^#\s+(.+)$/m.exec(markdown)?.[1] : null;
  const h1 = raw?.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
  return h1 ? { h1 } : {};
}

function decodeEntities(s: string): string {
  return s.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g,
    (_m, dec: string, hex: string, name: string) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name] ?? ' ';
    },
  );
}

function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const tag = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*>`, 'i').exec(html)?.[0];
    const content = tag ? /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] : null;
    if (content) return decodeEntities(content).trim();
  }
  return null;
}

/**
 * The DEFAULT reader, not an optimisation. Firecrawl renders JavaScript and defeats anti-bot on
 * sites we do not control; on a server-rendered page it adds only its ten-scrapes-a-minute key
 * limit, which was the sole reason a crawl could never finish.
 */
async function directScrape(url: string): Promise<ScrapeResult> {
  const { text: html, status } = await fetchGuarded(url, {
    accept: 'text/html,application/xhtml+xml,*/*',
    maxBytes: MAX_PAGE_BYTES,
    timeoutMs: 20_000,
  });
  const base: ScrapeResult = {
    url, title: null, description: null, content_excerpt: null, text: null,
    http_status: status, error: null, fetch_method: 'direct',
  };
  if (!html) return { ...base, error: `direct fetch failed (${status ?? 'no response'})` };

  const text = textFromHtml(html);
  // Below the floor the HTML carried no readable content — a client-rendered shell whose body
  // only exists after JavaScript runs. That is the one case Firecrawl is actually for.
  if (text.length < DIRECT_TEXT_FLOOR) return { ...base, error: 'no readable text in HTML' };
  return {
    ...base,
    title: decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim() || null,
    description: metaContent(html, ['description', 'og:description']),
    content_excerpt: text.slice(0, 600),
    text,
    images: extractContentImages(html, url),
    specs: extractSpecs(html, url),
    links_to: extractContentLinks(html, url),
    h1: textFromHtml(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim() || null,
    canonical_url: /<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? null,
    lang: /<html[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]?.toLowerCase() ?? null,
  };
}

/** Direct first; Firecrawl only for a page whose text is not in its HTML. */
async function scrapePage(url: string): Promise<ScrapeResult> {
  const direct = await directScrape(url);
  if (!direct.error) return direct;
  const viaFirecrawl = await firecrawlScrape(url);
  // A Firecrawl refusal must not erase what the direct read did learn about the page.
  if (viaFirecrawl.error && direct.http_status) {
    return { ...viaFirecrawl, http_status: direct.http_status };
  }
  return viaFirecrawl;
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
        const r = await scrapePage(url);
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
      url, title: null, description: null, content_excerpt: null, text: null,
      http_status: null, error: 'rate limited', rate_limited: true,
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

  const { urls } = await collectSitemapUrls(sitemapUrl, MAX_PAGES_HARD_CAP);
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

interface QueueEntry {
  url: string;
  reason: string;
  keywords: { keyword?: string }[] | null;
  best_position: number | null;
  impressions: number | null;
  clicks: number | null;
}

interface CrawlPlan {
  sitemapUrl: string;
  seenAt: string;
  discovered: number;
  cap: number;
  capped: boolean;
  queue: QueueEntry[];
  writes: number;
  writeFailures: number;
  firstWriteError: string | null;
  manual?: boolean;
}

/**
 * Decide what this run will read, and record what merely EXISTS. Enumerating the sitemap instead
 * read 492 pages that had never appeared in a search result while 5 pages Google was actively
 * showing went unread.
 */
async function planCrawl(
  supabase: DbClient,
  website: { id: string; user_id: string; url: string; sitemap_url: string | null; max_pages: number },
  focus: string[] = [],
): Promise<CrawlPlan | { error: string }> {
  const { id: websiteId, user_id: userId, url: siteUrl, max_pages } = website;
  const cap = Math.min(max_pages || 50, MAX_PAGES_HARD_CAP);

  let sitemapUrl = website.sitemap_url;
  const autodiscovered = !sitemapUrl;
  if (!sitemapUrl) {
    sitemapUrl = await discoverSitemapUrl(siteUrl);
    if (!sitemapUrl) {
      await supabase.from('user_websites').update({
        last_crawled_at: new Date().toISOString(),
        last_crawl_error: 'Could not autodetect sitemap. Add sitemap_url manually.',
      }).eq('id', websiteId);
      return { error: 'sitemap not found' };
    }
  }

  const alreadyRead = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('user_website_pages')
      .select('url')
      .eq('website_id', websiteId)
      .not('content_excerpt', 'is', null)
      .range(from, from + 999);
    if (error) console.warn(`[crawl-user-website] read-page preference unavailable: ${error.message}`);
    if (error || !data?.length) break;
    data.forEach((r: { url: string }) => alreadyRead.add(r.url));
    if (data.length < 1000) break;
  }
  const { urls, editorial, total: discoveredTotal, skippedSitemaps } = await collectSitemapUrls(sitemapUrl, cap, alreadyRead, focus);
  if (urls.length === 0) {
    await supabase.from('user_websites').update({
      last_crawled_at: new Date().toISOString(),
      last_crawl_error: 'Sitemap returned no URLs.',
    }).eq('id', websiteId);
    return { error: 'sitemap empty' };
  }
  // Store only once the sitemap has actually yielded URLs (#363 `EE-19`).
  if (autodiscovered) {
    await supabase.from('user_websites').update({ sitemap_url: sitemapUrl }).eq('id', websiteId);
  }

  const seenAt = new Date().toISOString();
  let writes = 0;
  let writeFailures = 0;
  let firstWriteError: string | null = null;
  {
    const { error } = await supabase.rpc('sync_sitemap_urls', {
      p_website_id: websiteId, p_user_id: userId, p_urls: urls, p_seen_at: seenAt,
    });
    writes += 1;
    if (error) { writeFailures += 1; firstWriteError ??= error.message; }
  }

  // A topic read reads only the unread pages on that topic: the article waiting on it needs those, not the demand queue.
  if (focus.length) {
    const queue: QueueEntry[] = urls.filter((u) => matchesFocus(u, focus) && !alreadyRead.has(u))
      .slice(0, MAX_FETCH_PER_RUN)
      .map((url) => ({ url, reason: 'topic', keywords: null, best_position: null, impressions: null, clicks: null }));
    return {
      sitemapUrl, seenAt, cap, queue, writes, writeFailures, firstWriteError,
      discovered: discoveredTotal,
      capped: discoveredTotal > urls.length || skippedSitemaps > 0,
    };
  }

  const { data: queueRows, error: queueErr } = await supabase.rpc('get_page_crawl_queue', {
    p_website_id: websiteId,
    p_limit: MAX_FETCH_PER_RUN,
  });
  // An unavailable queue is not an empty one: reading nothing and reporting a clean run is the
  // silent-zero shape this rewrite exists to remove.
  if (queueErr) return { error: `crawl queue unavailable: ${queueErr.message}` };

  let queue: QueueEntry[] = ((queueRows ?? []) as Record<string, unknown>[]).map((r) => ({
    url: String(r.page_url),
    reason: String(r.reason),
    keywords: (r.keywords as QueueEntry['keywords']) ?? null,
    best_position: r.best_position === null ? null : Number(r.best_position),
    impressions: r.impressions === null ? null : Number(r.impressions),
    clicks: r.clicks === null ? null : Number(r.clicks),
  }));

  if (queue.length === 0) {
    const { count } = await supabase
      .from('user_website_pages')
      .select('id', { count: 'exact', head: true })
      .eq('website_id', websiteId)
      .not('content_excerpt', 'is', null);
    // Day one for a site that ranks for nothing yet: Labs needs an already-ranking domain and
    // Search Console needs a connection, so neither feed can name a page. Read a small sample
    // once so the index is not empty; a site with any content never takes this path again.
    if (!count) {
      queue = sampleEvenly(urls, SEED_SAMPLE_SIZE).map((url) => ({
        url, reason: 'seed', keywords: null, best_position: null, impressions: null, clicks: null,
      }));
    }
  }

  const room = MAX_BACKFILL_PER_RUN - queue.length;
  if (room > 0) {
    const { data: backfillRows, error: backfillErr } = await supabase.rpc('get_page_backfill_queue', {
      p_website_id: websiteId,
      p_limit: room + queue.length,
    });
    if (backfillErr) return { error: `backfill queue unavailable: ${backfillErr.message}` };
    const editorialUnread: { page_url: string }[] = [];
    const editorialList = [...editorial];
    // Small batches: the URLs travel in the query string. A failure only loses the head start.
    for (let i = 0; i < editorialList.length && editorialUnread.length < room; i += 25) {
      const { data, error } = await supabase
        .from('user_website_pages')
        .select('url')
        .eq('website_id', websiteId)
        .is('content_excerpt', null)
        .in('url', editorialList.slice(i, i + 25));
      if (error) {
        console.warn(`[crawl-user-website] editorial backfill skipped: ${error.message}`);
        break;
      }
      editorialUnread.push(...(data ?? []).map((r: { url: string }) => ({ page_url: r.url })));
    }
    const queued = new Set(queue.map((q) => q.url));
    for (const r of [...editorialUnread, ...(backfillRows ?? [])] as { page_url: string }[]) {
      if (queue.length >= MAX_BACKFILL_PER_RUN) break;
      if (queued.has(r.page_url)) continue;
      queued.add(r.page_url);
      queue.push({
        url: r.page_url, reason: 'backfill', keywords: null, best_position: null, impressions: null, clicks: null,
      });
    }
  }

  return {
    sitemapUrl, seenAt, cap, queue, writes, writeFailures, firstWriteError,
    discovered: discoveredTotal,
    capped: discoveredTotal > urls.length || skippedSitemaps > 0,
  };
}

async function markCrawlRun(supabase: DbClient, websiteId: string) {
  const { error } = await supabase.rpc('mark_collector_run', { p_website_id: websiteId, p_collector: 'page_crawl' });
  if (error) console.error('[crawl-user-website] could not record the run:', error.message);
}

/** Re-read named pages of this website now (Website → Pages → Refetch); billed per page like any read. */
async function refetchPlan(
  supabase: DbClient, website: { id: string; sitemap_url: string | null }, pageIds: unknown[],
): Promise<CrawlPlan | { error: string }> {
  const ids = pageIds.map(String).filter(Boolean).slice(0, 10);
  const { data, error } = await supabase.from('user_website_pages').select('url')
    .eq('website_id', website.id).in('id', ids);
  if (error) return { error: `page lookup failed: ${error.message}` };
  if (!data?.length) return { error: 'none of those pages belong to this website' };
  const queue: QueueEntry[] = (data as { url: string }[]).map((r) => ({
    url: r.url, reason: 'manual', keywords: null, best_position: null, impressions: null, clicks: null,
  }));
  return {
    sitemapUrl: website.sitemap_url ?? '', seenAt: new Date().toISOString(),
    discovered: queue.length, cap: queue.length, capped: false, queue,
    writes: 0, writeFailures: 0, firstWriteError: null, manual: true,
  };
}

async function executeCrawl(
  supabase: DbClient,
  website: { id: string; user_id: string; workspace_id: string | null },
  plan: CrawlPlan,
): Promise<{
  ok: boolean; pages_indexed: number; pages_discovered: number;
  pages_capped_at: number; capped: boolean;
  pages_with_content: number; pages_queued: number; pages_fetched: number;
  fetched_via_firecrawl: number; pages_pending: number; rate_limited: number;
  error?: string;
}> {
  const { id: websiteId, user_id: userId, workspace_id: workspaceId } = website;

  let writes = plan.writes;
  let writeFailures = plan.writeFailures;
  let firstWriteError = plan.firstWriteError;
  const recordWrite = (error: { message?: string } | null) => {
    writes += 1;
    if (!error) return;
    writeFailures += 1;
    firstWriteError ??= error.message || 'unknown write error';
  };

  const deadline = Date.now() + SCRAPE_BUDGET_MS;
  const pending: string[] = [];
  let indexed = 0;
  let fetched = 0;
  let rateLimited = 0;
  let viaFirecrawl = 0;

  for (const entry of plan.queue) {
    if (Date.now() > deadline) { pending.push(entry.url); continue; }

    // Firecrawl's monthly allowance is finite; a backfill page with no text in its HTML waits
    // until search demand names it.
    const isBackfill = entry.reason === 'backfill';
    const s = isBackfill ? await directScrape(entry.url) : await scrapePage(entry.url);
    if (s.rate_limited) rateLimited += 1;
    const now = new Date().toISOString();

    if (s.error || !s.content_excerpt) {
      // Keep whatever an earlier crawl stored: a failed read says nothing about the page, and
      // writing nulls over a good excerpt is how 72 indexed pages became empty rows in one
      // rate-limited run. Only the liveness stamp moves, plus a status we genuinely observed.
      // A failed backfill is stamped regardless so the hourly run does not retry it every hour.
      const { error } = await supabase.from('user_website_pages').upsert({
        website_id: websiteId, user_id: userId, url: entry.url,
        ...(plan.manual ? {} : { last_seen_in_sitemap: plan.seenAt, is_active: true }),
        ...(s.http_status ? { http_status: s.http_status } : {}),
        ...(s.http_status || isBackfill ? { fetched_at: now } : {}),
      }, { onConflict: 'website_id,url' });
      recordWrite(error);
      continue;
    }

    fetched += 1;
    if (s.fetch_method === 'firecrawl') viaFirecrawl += 1;

    const embedSource = [s.title || '', s.description || '', (s.text || '').slice(0, 8_000)]
      .filter(Boolean).join('\n\n');
    const embedding = await embedDocument(embedSource, workspaceId);
    const kwList = (entry.keywords ?? [])
      .map((k) => (k?.keyword ?? '').trim()).filter(Boolean);

    const { data: written, error } = await supabase.from('user_website_pages').upsert({
      website_id: websiteId, user_id: userId, url: entry.url,
      title: s.title, description: s.description,
      content_excerpt: s.content_excerpt,
      content_text: s.text,
      keywords: kwList,
      demand_reason: entry.reason,
      fetch_method: s.fetch_method ?? null,
      ...(s.images ? { images: s.images, images_fetched_at: now } : {}),
      ...(s.links_to ? { specs: s.specs ?? null, links_to: s.links_to, specs_checked_at: now } : {}),
      ...(s.h1 !== undefined ? { h1: s.h1 } : {}),
      ...(s.canonical_url !== undefined ? { canonical_url: s.canonical_url } : {}),
      ...(s.lang !== undefined ? { lang: s.lang } : {}),
      ...(entry.reason === 'manual' ? {} : {
        demand_snapshot: entry.reason === 'seed' || entry.reason === 'topic' || isBackfill ? null : {
          keywords: entry.keywords,
          best_position: entry.best_position,
          impressions: entry.impressions,
          clicks: entry.clicks,
          captured_at: now,
        },
      }),
      embedding: embedding as unknown,
      http_status: s.http_status,
      ...(plan.manual ? {} : { last_seen_in_sitemap: plan.seenAt, is_active: true }),
      fetched_at: now,
    }, { onConflict: 'website_id,url' }).select('id').maybeSingle();
    recordWrite(error);
    if (embedding && !error) indexed += 1;
    if (written?.id) {
      const { error: outcomeErr } = await supabase.rpc('apply_page_recommendation_outcomes', { p_page_id: written.id });
      if (outcomeErr) console.warn(`[crawl-user-website] recommendation outcomes for ${entry.url}: ${outcomeErr.message}`);
    }
  }

  const allWritesFailed = writes > 0 && writeFailures === writes;
  const { count: withContent } = await supabase
    .from('user_website_pages')
    .select('id', { count: 'exact', head: true })
    .eq('website_id', websiteId)
    .eq('is_active', true)
    .not('content_excerpt', 'is', null);

  const writeError = writeFailures > 0
    ? `${writeFailures}/${writes} page writes failed: ${firstWriteError}`
    : null;

  if (!plan.manual) {
    await supabase.from('user_websites').update({
      last_crawled_at: new Date().toISOString(),
      last_crawl_error: writeError,
      page_count: withContent ?? indexed,
    }).eq('id', websiteId);
  }

  if (writeError) console.error(`[crawl-user-website] ${websiteId}: ${writeError}`);
  console.log(
    `[crawl-user-website] ${websiteId}: queued ${plan.queue.length}, read ${fetched} `
    + `(${viaFirecrawl} via firecrawl), ${pending.length} past the budget`,
  );

  return {
    ok: !allWritesFailed,
    pages_indexed: indexed,
    pages_discovered: plan.discovered,
    pages_capped_at: plan.cap,
    capped: plan.capped,
    pages_with_content: withContent ?? 0,
    pages_queued: plan.queue.length,
    pages_fetched: fetched,
    fetched_via_firecrawl: viaFirecrawl,
    pages_pending: pending.length,
    rate_limited: rateLimited,
    ...(writeError ? { error: writeError } : {}),
  };
}

/**
 * Re-read pages for `specs`/`links_to` only — direct fetch, never Firecrawl, no charge. `urls`
 * must already be rows of this website. `linked_from` reads that page, then the same-site pages
 * it links to, adding any the sitemap cap left out: the category's own HTML is the membership.
 */
async function backfillSpecs(
  supabase: DbClient,
  website: { id: string; user_id: string },
  body: { limit?: unknown; urls?: unknown; linked_from?: unknown; force?: unknown },
): Promise<{
  checked: number; with_specs: number; added: number; failed: number; write_failures: number;
  candidates: number; remaining: number; linked_from: string | null; first_error?: string;
}> {
  const limit = Math.min(Math.max(Math.floor(Number(body.limit) || SPEC_BACKFILL_DEFAULT), 1), SPEC_BACKFILL_MAX);
  const force = body.force === true;
  const deadline = Date.now() + SCRAPE_BUDGET_MS;
  let checked = 0, withSpecs = 0, added = 0, failed = 0, writeFailures = 0;
  let firstError: string | null = null;
  const missing = new Set<string>();
  const recordError = (error: { message: string } | null) => {
    if (!error) return;
    writeFailures += 1;
    firstError ??= error.message;
  };

  const readOne = async (url: string): Promise<string[] | null> => {
    const { text: html } = await fetchGuarded(url, {
      accept: 'text/html,application/xhtml+xml,*/*', maxBytes: MAX_PAGE_BYTES, timeoutMs: 20_000,
    });
    if (!html) { failed += 1; return null; }
    const fields = {
      specs: extractSpecs(html, url),
      links_to: extractContentLinks(html, url),
      specs_checked_at: new Date().toISOString(),
    };
    if (missing.has(url)) {
      const { error } = await supabase.from('user_website_pages').upsert(
        { website_id: website.id, user_id: website.user_id, url, is_active: true, ...fields },
        { onConflict: 'website_id,url', ignoreDuplicates: true },
      );
      recordError(error);
      if (!error) added += 1;
    } else {
      const { error } = await supabase.from('user_website_pages').update(fields)
        .eq('website_id', website.id).eq('url', url);
      recordError(error);
    }
    checked += 1;
    if (fields.specs) withSpecs += 1;
    return fields.links_to;
  };

  let candidates: string[] = [];
  let linkedFrom: string | null = null;
  if (typeof body.linked_from === 'string' && body.linked_from) {
    const { data, error } = await supabase.from('user_website_pages').select('url')
      .eq('website_id', website.id).eq('url', body.linked_from).maybeSingle();
    if (error) throw new Error(`category lookup failed: ${error.message}`);
    if (!data) throw new HttpError(404, 'linked_from is not a page of this website');
    linkedFrom = data.url as string;
    candidates = (await readOne(linkedFrom)) ?? [];
  } else if (Array.isArray(body.urls)) {
    candidates = body.urls.map((u) => String(u)).filter(Boolean).slice(0, 200);
  }

  const todo: string[] = [];
  if (candidates.length) {
    const known = new Map<string, boolean>();
    for (let i = 0; i < candidates.length; i += 25) {
      const { data, error } = await supabase.from('user_website_pages').select('url, specs_checked_at')
        .eq('website_id', website.id).in('url', candidates.slice(i, i + 25));
      if (error) throw new Error(`page lookup failed: ${error.message}`);
      for (const r of (data ?? []) as { url: string; specs_checked_at: string | null }[]) {
        known.set(r.url, !!r.specs_checked_at);
      }
    }
    for (const url of candidates) {
      if (!known.has(url)) {
        if (!linkedFrom) continue;
        missing.add(url);
        todo.push(url);
      } else if (force || !known.get(url)) {
        todo.push(url);
      }
    }
  } else if (!linkedFrom) {
    const { data, error } = await supabase.from('user_website_pages').select('url')
      .eq('website_id', website.id).eq('is_active', true)
      .not('content_excerpt', 'is', null).is('specs_checked_at', null)
      .order('fetched_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(`page lookup failed: ${error.message}`);
    todo.push(...(data ?? []).map((r: { url: string }) => r.url));
  }

  const batch = todo.slice(0, limit);
  const queue = [...batch];
  const worker = async () => {
    for (let url = queue.shift(); url && Date.now() < deadline; url = queue.shift()) await readOne(url);
  };
  await Promise.all(Array.from({ length: Math.min(FIRECRAWL_CONCURRENCY, queue.length) }, worker));

  return {
    checked, with_specs: withSpecs, added, failed, write_failures: writeFailures,
    candidates: todo.length, remaining: Math.max(todo.length - batch.length, 0) + queue.length,
    linked_from: linkedFrom,
    ...(firstError ? { first_error: firstError } : {}),
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
  let keyWorkspaceId: string | null | undefined;
  if (!isCron) {
    const caller = await getCaller(req);
    if (!caller) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    userId = caller.userId;
    keyWorkspaceId = caller.keyWorkspaceId;
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
  if (!isCron && (
    (keyWorkspaceId !== undefined && website.workspace_id !== keyWorkspaceId)
    || !(await userHasWorkspaceCapability(supabase, userId, website.workspace_id, 'marketing.seo'))
  )) {
    return jsonResponse({ success: false, error: 'Website not found' }, 404);
  }
  if (!website.is_active) return jsonResponse({ success: false, error: 'Website is inactive' }, 400);

  if (body.backfill_specs === true) {
    return jsonResponse({ success: true, mode: 'backfill_specs', data: await backfillSpecs(supabase, website, body) });
  }

  const mode = body.mode === 'preview' ? 'preview' : 'full';

  if (mode === 'preview') {
    if (!userId) return jsonResponse({ success: false, error: 'Preview requires a signed-in caller' }, 400);
    const { data: dd, error: de } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: PREVIEW_CREDIT_COST,
      p_operation_type: 'website_crawl',
      p_description: `Website preview crawl (${website.url})`,
      p_metadata: { website_id: website.id, mode },
      p_workspace_id: null,
    });
    const drow = Array.isArray(dd) ? dd[0] : dd;
    if (de || !drow?.success) {
      return jsonResponse({ success: false, error: drow?.error_message || de?.message || 'Insufficient credits' }, 402);
    }
    try {
      const result = await previewWebsite(supabase, website);
      if (!result.ok) {
        await refundCronUser(supabase, userId, 'seo-website-crawl', PREVIEW_CREDIT_COST, 'Website preview refund (preview_failed)');
      }
      return jsonResponse({ success: result.ok, mode: 'preview', data: result });
    } catch (e: any) {
      await refundCronUser(supabase, userId, 'seo-website-crawl', PREVIEW_CREDIT_COST, 'Website preview refund (exception)');
      console.error('[crawl-user-website] preview error:', e);
      return jsonResponse({ success: false, error: e?.message || 'Preview failed' }, 500);
    }
  }

  // Planning is free; READING is what costs. The flat fee per invocation this replaces billed
  // 240 credits across two days on which zero pages were read, and refunded none of it.
  const scheduled = isCron && Object.prototype.hasOwnProperty.call(body, 'payer_user_id');
  const plan = Array.isArray(body.page_ids) && body.page_ids.length
    ? await refetchPlan(supabase, website, body.page_ids)
    : await planCrawl(supabase, website, focusTerms(body.focus));
  if ('error' in plan && Array.isArray(body.page_ids) && body.page_ids.length) {
    return jsonResponse({ success: false, mode: 'refetch', error: plan.error }, 404);
  }
  if ('error' in plan) {
    await supabase.from('user_websites').update({
      last_crawled_at: new Date().toISOString(),
      last_crawl_error: plan.error,
    }).eq('id', website.id);
    return jsonResponse({ success: false, mode: 'full', error: plan.error }, 200);
  }

  const queued = plan.queue.length;
  if (queued === 0) {
    // Still run it: with nothing to read this only refreshes the liveness stamps and recounts,
    // and it reports the REAL page total rather than a zero that reads as an empty site.
    const result = await executeCrawl(supabase, website, plan);
    if (scheduled && result.ok) await markCrawlRun(supabase, website.id);
    return jsonResponse({ success: result.ok, mode: 'full', data: result });
  }

  // Invariant 10: debit before the upstream read, never after.
  let billedUserId: string | null = null;
  let billedAmount = 0;
  if (isCron && scheduled && !body.payer_user_id) {
    // The platform's own site on its default schedule: platform overhead, not billed to anyone.
  } else if (isCron) {
    const payer = typeof body.payer_user_id === 'string' && body.payer_user_id ? body.payer_user_id : website.user_id as string;
    const r = await chargeCronUser(supabase, payer, 'seo-website-crawl', {
      units: queued, description: `crawl ${website.url} (${queued} pages)`,
    });
    if (!r.allowed) {
      return jsonResponse({ success: false, error: 'insufficient_credits', skipped: true }, 200);
    }
    if (r.charged > 0) { billedUserId = payer; billedAmount = r.charged; }
  } else {
    const amount = queued * PER_PAGE_CREDIT_COST;
    const { data: dd, error: de } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: 'website_crawl',
      p_description: `Website crawl (${website.url}, ${queued} pages)`,
      p_metadata: { website_id: website.id, mode, pages_queued: queued },
      p_workspace_id: null,
    });
    const drow = Array.isArray(dd) ? dd[0] : dd;
    if (de || !drow?.success) {
      return jsonResponse({ success: false, error: drow?.error_message || de?.message || 'Insufficient credits' }, 402);
    }
    billedUserId = userId;
    billedAmount = amount;
  }

  try {
    const result = await executeCrawl(supabase, website, plan);
    if (scheduled && result.ok) await markCrawlRun(supabase, website.id);
    // Paying for a queued page the budget never reached is the flat-fee defect one layer down.
    const unread = queued - result.pages_fetched;
    if (unread > 0 && billedUserId && billedAmount > 0) {
      const refund = Math.round((billedAmount * unread / queued) * 100) / 100;
      if (refund > 0) {
        await refundCronUser(
          supabase, billedUserId, 'seo-website-crawl', refund,
          `Website crawl refund (${unread} of ${queued} pages unread)`,
        );
      }
    }
    return jsonResponse({ success: result.ok, mode: 'full', data: result });
  } catch (e: any) {
    console.error('[crawl-user-website] error:', e);
    if (billedUserId && billedAmount > 0) {
      await refundCronUser(supabase, billedUserId, 'seo-website-crawl', billedAmount, 'Website crawl refund (exception)');
    }
    await supabase.from('user_websites').update({
      last_crawled_at: new Date().toISOString(),
      last_crawl_error: e?.message?.slice(0, 500) || 'Crawl failed',
    }).eq('id', website.id);
    return jsonResponse({ success: false, error: e?.message || 'Crawl failed' }, 500);
  }
}));
