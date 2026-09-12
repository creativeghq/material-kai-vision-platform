/**
 * Fetch a URL as markdown, once.
 *
 * The crawler had the only implementation and it returned a 600-character EXCERPT, because that
 * is all a sitemap index needs. Scoring a page needs the whole document, and a second copy of
 * "call Firecrawl, guard the URL, read the status correctly" is how the two drift — the status
 * handling below is the part that already cost a live incident.
 */

import { assertSafeUrl } from './ssrf-guard.ts';

/** Lazy: the bootstrap populates env at handler entry, so a module-load capture reads undefined. */
const FIRECRAWL_API_KEY = () => Deno.env.get('FIRECRAWL_API_KEY') || '';

const RATE_LIMIT_DEFAULT_WAIT_MS = 12_000;

export interface ScrapedPage {
  url: string;
  title: string | null;
  description: string | null;
  /** The FULL document. Callers wanting a summary derive it; this never truncates. */
  markdown: string | null;
  /** The PAGE's status as Firecrawl saw it — never Firecrawl's own status. */
  http_status: number | null;
  error: string | null;
  rate_limited?: boolean;
  retry_after_ms?: number;
}

/** Retry-After header in seconds, else a reset hint in Firecrawl's message, else the default. */
export function retryAfterMs(res: Response, message: string): number {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 60_000);
  const inSecs = /reset(?:s)?\s+in:?\s*(\d+)\s*s/i.exec(message)?.[1]
    ?? /retry (?:after|in)\s*(\d+)\s*s/i.exec(message)?.[1];
  if (inSecs) return Math.min(Number(inSecs) * 1000 + 500, 60_000);
  const at = /reset(?:s)?\s+at:?\s*([0-9T:.+-]+Z?)/i.exec(message)?.[1];
  if (at) {
    const t = Date.parse(at);
    if (Number.isFinite(t) && t > Date.now()) return Math.min(t - Date.now() + 500, 60_000);
  }
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}

const fail = (url: string, error: string, extra: Partial<ScrapedPage> = {}): ScrapedPage => ({
  url, title: null, description: null, markdown: null, http_status: null, error, ...extra,
});

/**
 * @param url A URL that may have come from anywhere — a sitemap the target site wrote, or a
 *   customer typing into a box. Guarded before we spend, never after.
 */
export async function scrapeMarkdown(url: string): Promise<ScrapedPage> {
  const firecrawlKey = FIRECRAWL_API_KEY();
  if (!firecrawlKey) return fail(url, 'FIRECRAWL_API_KEY not configured');

  // Handing an unchecked URL to Firecrawl outsources the fetch: a request we pay for, aimed
  // wherever the caller pointed, including hosts the SSRF guard exists to refuse (#363 EE-13).
  try {
    await assertSafeUrl(url);
  } catch (e) {
    return fail(url, `blocked by URL guard: ${e instanceof Error ? e.message : 'unsafe URL'}`);
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
      // Firecrawl's status is OUR quota or its outage, not the page's: storing it as http_status
      // filed 72 live pages as "429" on 2026-09-05. Unknown stays null.
      if (res.status === 429) {
        return fail(url, `rate limited: ${message}`, {
          rate_limited: true, retry_after_ms: retryAfterMs(res, message),
        });
      }
      return fail(url, message);
    }
    const md = (data.data?.markdown || '') as string;
    const meta = data.data?.metadata || {};
    return {
      url,
      title: meta.title || meta.ogTitle || null,
      description: meta.description || meta.ogDescription || null,
      markdown: md || null,
      http_status: meta.statusCode || 200,
      error: null,
    };
  } catch (e) {
    return fail(url, e instanceof Error ? e.message : 'fetch failed');
  }
}

/** What the sitemap indexer stores: prose only, no headings, capped. */
export function excerptFromMarkdown(md: string | null, max = 600): string | null {
  if (!md) return null;
  const excerpt = md.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return excerpt || null;
}
