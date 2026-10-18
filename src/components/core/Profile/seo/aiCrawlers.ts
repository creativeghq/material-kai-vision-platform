/** What `get_website_ai_crawls` returns, and the log forwarder a site installs. */

export interface AiCrawlBot {
  bot: string;
  platform: string;
  label: string;
  purpose: 'training' | 'search' | 'user';
  hits: number;
  pages: number;
  verified: number;
  unverified: number;
  last_seen: string;
}

export interface AiCrawlCoverage {
  platform: string;
  label: string;
  pages_total: number;
  pages_crawled: number;
  never_crawled_sample: string[];
}

export interface AiCrawlJoinRow {
  path: string;
  platform: string;
  label: string;
  crawls: number;
  referred_sessions: number;
  conversions: number;
}

export interface AiCrawls {
  status: string;
  note: string | null;
  days: number;
  source: {
    kind: string;
    connected_at: string;
    last_received_at: string | null;
    deliveries: number;
    requests_seen: number;
    last_error: string | null;
  } | null;
  total_hits: number;
  bots: AiCrawlBot[];
  pages: { path: string; hits: number; platforms: string[]; last_seen: string }[];
  coverage: AiCrawlCoverage[];
  referral_join: {
    status: string;
    note: string | null;
    period_start: string | null;
    period_end: string | null;
    rows: AiCrawlJoinRow[];
  };
  series: { date: string; v: number }[];
}

export const PURPOSE_LABEL: Record<AiCrawlBot['purpose'], string> = {
  training: 'Training',
  search: 'Search index',
  user: 'Answering a user',
};

/** Broad on purpose: ordinary bots (Googlebot) keep the delivery heartbeat alive; the server keeps only AI crawlers. */
export const FORWARD_UA_PATTERN =
  'bot|crawler|spider|gpt|claude|anthropic|perplexity|meta-external|mistral|cohere|duckassist|gemini';

export function ingestUrl(supabaseUrl: string, websiteId: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/ai-crawler-ingest?website=${encodeURIComponent(websiteId)}`;
}

/** A Cloudflare Worker that forwards crawler requests, signed with the site's secret (stored as KAI_CRAWLER_SECRET). */
export function workerScript(url: string): string {
  return `const INGEST_URL = ${JSON.stringify(url)};
const FORWARD = /${FORWARD_UA_PATTERN}/i;

async function sign(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const ua = request.headers.get('user-agent') || '';
    if (FORWARD.test(ua)) {
      const body = JSON.stringify({ events: [{
        ts: new Date().toISOString(),
        path: new URL(request.url).pathname,
        ua,
        ip: request.headers.get('cf-connecting-ip'),
        status: response.status,
      }] });
      const ts = Math.floor(Date.now() / 1000).toString();
      ctx.waitUntil(sign(env.KAI_CRAWLER_SECRET, ts + '.' + body).then((sig) => fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-kai-timestamp': ts, 'x-kai-signature': sig },
        body,
      })));
    }
    return response;
  },
};
`;
}
