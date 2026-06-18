/**
 * crawl-user-website — Sitemap-driven indexer for SEO inter-linking
 *
 * Two modes:
 *   mode="preview" — fetches sitemap, samples up to 5 URLs, returns sitemap_url, total
 *                    URL count, and the sample with title/description so the user
 *                    can decide whether the site looks worth indexing. NO full crawl.
 *   mode="full"    — (default) full crawl bounded by website.max_pages.
 */

import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Lazy reads so platform_secrets bootstrap (run at handler entry) is honored.
const FIRECRAWL_API_KEY = () => Deno.env.get('FIRECRAWL_API_KEY') || '';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';
const MIVAA_GATEWAY_URL = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const MIVAA_API_KEY = () => Deno.env.get('MIVAA_API_KEY') || '';

const MAX_SITEMAP_DEPTH = 3;
const MAX_PAGES_HARD_CAP = 1000;
const FIRECRAWL_CONCURRENCY = 4;
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

async function embedDocument(text: string): Promise<number[] | null> {
  if (!MIVAA_API_KEY()) return null;
  const truncated = text.length > 8000 ? text.slice(0, 8000) : text;
  try {
    const res = await fetch(`${MIVAA_GATEWAY_URL()}/api/mivaa/gateway`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MIVAA_API_KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_embedding',
        payload: { text: truncated, model: 'voyage-4', dimensions: 1024, input_type: 'document' },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json?.success || !Array.isArray(json.data?.embedding)) return null;
    if (json.data.embedding.length !== 1024) return null;
    return json.data.embedding;
  } catch {
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
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function discoverSitemapUrl(siteUrl: string): Promise<string | null> {
  const base = siteUrl.replace(/\/+$/, '');
  const robots = await fetchText(`${base}/robots.txt`);
  if (robots) {
    const m = robots.match(/^\s*Sitemap:\s*(\S+)/im);
    if (m) return m[1].trim();
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
  http_status: number | null;
  error: string | null;
}

async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  const firecrawlKey = FIRECRAWL_API_KEY();
  if (!firecrawlKey) {
    return { url, title: null, description: null, content_excerpt: null, http_status: null, error: 'FIRECRAWL_API_KEY not configured' };
  }
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 20_000 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { url, title: null, description: null, content_excerpt: null, http_status: res.status, error: data?.error || `firecrawl ${res.status}` };
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

async function chunkedScrape(urls: string[]): Promise<ScrapeResult[]> {
  const out: ScrapeResult[] = [];
  for (let i = 0; i < urls.length; i += FIRECRAWL_CONCURRENCY) {
    const chunk = urls.slice(i, i + FIRECRAWL_CONCURRENCY);
    const results = await Promise.all(chunk.map(firecrawlScrape));
    out.push(...results);
  }
  return out;
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
  supabase: ReturnType<typeof createClient>,
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
  if (!sitemapUrl) {
    sitemapUrl = await discoverSitemapUrl(website.url);
    if (!sitemapUrl) {
      await supabase.from('user_websites').update({
        last_crawl_error: 'Could not autodetect sitemap. Add sitemap_url manually.',
      }).eq('id', website.id);
      return { ok: false, sitemap_url: null, pages_discovered: 0, capped_at: 0, sample: [], error: 'sitemap not found' };
    }
    await supabase.from('user_websites').update({ sitemap_url: sitemapUrl }).eq('id', website.id);
  }

  const urls = await collectSitemapUrls(sitemapUrl, MAX_PAGES_HARD_CAP);
  if (urls.length === 0) {
    return { ok: false, sitemap_url: sitemapUrl, pages_discovered: 0, capped_at: 0, sample: [], error: 'sitemap empty' };
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
  supabase: ReturnType<typeof createClient>,
  website: { id: string; user_id: string; url: string; sitemap_url: string | null; max_pages: number },
): Promise<{ ok: boolean; pages_indexed: number; pages_discovered: number; error?: string }> {
  const { id: websiteId, user_id: userId, url: siteUrl, max_pages } = website;
  const cap = Math.min(max_pages || 50, MAX_PAGES_HARD_CAP);

  let sitemapUrl = website.sitemap_url;
  if (!sitemapUrl) {
    sitemapUrl = await discoverSitemapUrl(siteUrl);
    if (!sitemapUrl) {
      await supabase.from('user_websites').update({
        last_crawled_at: new Date().toISOString(),
        last_crawl_error: 'Could not autodetect sitemap. Add sitemap_url manually.',
      }).eq('id', websiteId);
      return { ok: false, pages_indexed: 0, pages_discovered: 0, error: 'sitemap not found' };
    }
    await supabase.from('user_websites').update({ sitemap_url: sitemapUrl }).eq('id', websiteId);
  }

  const urls = await collectSitemapUrls(sitemapUrl, cap);
  if (urls.length === 0) {
    await supabase.from('user_websites').update({
      last_crawled_at: new Date().toISOString(),
      last_crawl_error: 'Sitemap returned no URLs.',
    }).eq('id', websiteId);
    return { ok: false, pages_indexed: 0, pages_discovered: 0, error: 'sitemap empty' };
  }

  const crawlStartedAt = new Date().toISOString();
  const scrapes = await chunkedScrape(urls);

  let indexed = 0;
  for (const s of scrapes) {
    if (s.error || !s.content_excerpt) {
      await supabase.from('user_website_pages').upsert({
        website_id: websiteId, user_id: userId, url: s.url,
        title: s.title, description: s.description, content_excerpt: s.content_excerpt,
        keywords: [], embedding: null, http_status: s.http_status,
        last_seen_in_sitemap: crawlStartedAt, fetched_at: new Date().toISOString(), is_active: true,
      }, { onConflict: 'website_id,url' });
      continue;
    }

    const embedSource = [s.title || '', s.description || '', s.content_excerpt || ''].filter(Boolean).join('\n\n');
    const embedding = await embedDocument(embedSource);

    await supabase.from('user_website_pages').upsert({
      website_id: websiteId, user_id: userId, url: s.url,
      title: s.title, description: s.description, content_excerpt: s.content_excerpt,
      keywords: [], embedding: embedding as any, http_status: s.http_status,
      last_seen_in_sitemap: crawlStartedAt, fetched_at: new Date().toISOString(), is_active: true,
    }, { onConflict: 'website_id,url' });

    if (embedding) indexed += 1;
  }

  await supabase.from('user_website_pages')
    .update({ is_active: false })
    .eq('website_id', websiteId)
    .lt('last_seen_in_sitemap', crawlStartedAt);

  const { count } = await supabase
    .from('user_website_pages')
    .select('id', { count: 'exact', head: true })
    .eq('website_id', websiteId)
    .eq('is_active', true);

  await supabase.from('user_websites').update({
    last_crawled_at: new Date().toISOString(),
    last_crawl_error: null,
    page_count: count || indexed,
  }).eq('id', websiteId);

  return { ok: true, pages_indexed: indexed, pages_discovered: urls.length };
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
    .select('id, user_id, url, sitemap_url, max_pages, is_active')
    .eq('id', body.website_id)
    .maybeSingle();

  if (error || !website) return jsonResponse({ success: false, error: 'Website not found' }, 404);
  if (!isCron && website.user_id !== userId) return jsonResponse({ success: false, error: 'Forbidden' }, 403);
  if (!website.is_active) return jsonResponse({ success: false, error: 'Website is inactive' }, 400);

  const mode = body.mode === 'preview' ? 'preview' : 'full';

  try {
    if (mode === 'preview') {
      console.log(`[crawl-user-website] PREVIEW ${website.url}`);
      const result = await previewWebsite(supabase, website);
      return jsonResponse({ success: result.ok, mode: 'preview', data: result });
    }

    console.log(`[crawl-user-website] FULL ${website.url} (cap=${website.max_pages})`);
    const result = await crawlOneWebsite(supabase, website);
    return jsonResponse({ success: result.ok, mode: 'full', data: result });
  } catch (e: any) {
    console.error('[crawl-user-website] error:', e);
    if (mode === 'full') {
      await supabase.from('user_websites').update({
        last_crawled_at: new Date().toISOString(),
        last_crawl_error: e?.message?.slice(0, 500) || 'Crawl failed',
      }).eq('id', website.id);
    }
    return jsonResponse({ success: false, error: e?.message || 'Crawl failed' }, 500);
  }
}));
