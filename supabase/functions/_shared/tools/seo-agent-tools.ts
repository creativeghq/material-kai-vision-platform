/**
 * SEO Agent Tools — conversational SEO research surface for the KAI agent.
 *
 * This file is the new home for SEO-research tools that surface DataForSEO +
 * mention-monitoring data inline in the chat. The legacy [`seo-tools.ts`](seo-tools.ts)
 * stays as-is for the article-generation pipeline (research → plan → write →
 * analyze).
 *
 * Wave 1A tools (this file):
 *   - seo_research_keyword — full SERP + Labs research card for one keyword
 *
 * Wave 1B / 2 / 3 tools will append here as they ship.
 *
 * Cost discipline:
 *   - seo_research_keyword: 0 partner credits (calls MIVAA's
 *     /opportunities-stateless which uses x-cron-secret, not user credits).
 *     Internal DataForSEO cost: ~$0.005-0.010 per call (1 SERP Advanced + up
 *     to 2 Labs calls). Logged to ai_usage_logs with module_slug='seo-tools'.
 *
 * Pattern: every tool emits a chunk via onChunk so the frontend can render
 * an inline card, then returns a compact JSON summary so the LLM can keep
 * the conversation moving without re-emitting the full payload.
 */

import { resolveWebsite, type ResolvedWebsite } from '../seo-website.ts';

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');

const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

/**
 * Connected-website context threaded into the SEO agent tools so a research pass
 * defaults to (and is filed under) the workspace's primary connected website.
 * `supabase` is the service-role client; `defaultWebsite` is pre-resolved in
 * agent-chat so the common path costs no extra DB round-trip.
 */
export interface SeoWebsiteCtx {
  supabase?: any;
  workspaceId?: string | null;
  defaultWebsite?: ResolvedWebsite | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic dispatcher to MIVAA's `/api/v1/seo-agent/dataforseo/{kind}` endpoint.
 * Every Wave 1B+ tool routes through this. `kind` is the unified-client method
 * name; `params` is forwarded as **kwargs. Returns the normalized
 * `DataForSEOResult` shape: { items, raw, status_code, cost_usd, latency_ms, error }.
 */
async function callDataForSEO(
  kind: string,
  params: Record<string, any>,
  attribution?: { user_id?: string; workspace_id?: string },
): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!CRON_SECRET) {
    return { ok: false, error: 'CRON_SECRET not configured' };
  }
  try {
    const resp = await fetch(
      `${MIVAA_GATEWAY_URL}/api/v1/seo-agent/dataforseo/${kind}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: JSON.stringify({ params, attribution }),
      },
    );
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${String(parsed).slice(0, 200)}` };
    return { ok: true, data: parsed?.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Composite-audit dispatcher (site-review, brand-search, keyword-gap, quick-page). */
async function callSEOAgentRoute(
  path: string,
  body: Record<string, any>,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!CRON_SECRET) return { ok: false, error: 'CRON_SECRET not configured' };
  try {
    const resp = await fetch(
      `${MIVAA_GATEWAY_URL}/api/v1/seo-agent/${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: JSON.stringify(body),
      },
    );
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${String(parsed).slice(0, 200)}` };
    return { ok: true, data: parsed?.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

async function callOpportunitiesStateless(body: Record<string, any>): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
}> {
  if (!CRON_SECRET) {
    return { ok: false, error: 'CRON_SECRET not configured on edge function — cannot call /opportunities-stateless' };
  }
  try {
    const resp = await fetch(
      `${MIVAA_GATEWAY_URL}/api/v1/mention-monitoring/opportunities-stateless`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET,
        },
        body: JSON.stringify(body),
      },
    );
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!resp.ok) {
      return { ok: false, error: `backend ${resp.status}: ${String(parsed).slice(0, 200)}` };
    }
    return { ok: true, data: parsed?.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Map ISO-3166 alpha-2 country code → DataForSEO numeric location_code.
 * Used for parameter consistency in the LLM-facing schema (country codes are
 * easier for the agent to reason about than DataForSEO numerics). */
const COUNTRY_TO_DFS: Record<string, number> = {
  US: 2840, GB: 2826, DE: 2276, FR: 2250, IT: 2380, ES: 2724,
  GR: 2300, NL: 2528, BE: 2056, AT: 2040, CH: 2756, PT: 2620,
  IE: 2372, CA: 2124, AU: 2036, PL: 2616, SE: 2752, DK: 2208,
  NO: 2578, FI: 2246, TR: 2792, BG: 2100, RO: 2642, CY: 2196,
};

/** Slim the opportunities array down to the fields the LLM actually needs to
 * make follow-up decisions. Full payload still goes to the frontend via the
 * card chunk; this is just for the LLM's conversational context window. */
function condenseForLLM(data: any): Record<string, any> {
  const ops: any[] = data?.opportunities || [];
  // Group by type so the LLM can quickly answer "what types fired?"
  const byType: Record<string, number> = {};
  for (const op of ops) byType[op.type] = (byType[op.type] || 0) + 1;

  const ai = ops.find((o) => o.type === 'ai_overview');
  const fs = ops.find((o) => o.type === 'featured_snippet');
  const kg = ops.find((o) => o.type === 'knowledge_graph');
  const related = ops.filter((o) => o.type === 'related_search').map((o) => o.title);
  const paa = ops.filter((o) => o.type === 'pao_question').slice(0, 5).map((o) => o.title);
  const competitors = ops.filter((o) => o.type === 'competitor_ranking').slice(0, 5).map((o) => ({
    rank: o.source?.rank,
    domain: o.source?.domain,
    title: o.source?.title,
  }));
  const keywords = ops.filter((o) => o.type === 'keyword_opportunity').slice(0, 8).map((o) => ({
    keyword: o.source?.keyword,
    volume: o.source?.search_volume,
    difficulty: o.source?.difficulty,
    intent: o.source?.intent,
  }));

  return {
    subject: data?.subject_label,
    opportunity_count: ops.length,
    types: byType,
    ai_overview_present: !!ai && ai.source?.snapshot_present !== false,
    ai_overview_brand_mentioned: ai?.source?.brand_mentioned ?? null,
    featured_snippet_held_by: fs?.source?.current_domain || null,
    knowledge_graph_present: kg?.source?.knowledge_graph_present ?? null,
    related_searches: related.slice(0, 8),
    top_paa: paa,
    top_competitors: competitors,
    top_keywords: keywords,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool 1 — seo_research_keyword
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOResearchKeywordTool = (
  _userId: string,
  onChunk?: (chunk: any) => void,
  ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ keyword, brand_name, aliases, country_code, language_code, homepage_domain, website_id, types, limit_per_type }) => {
      onChunk?.({
        type: 'tool_progress',
        status: `Researching "${keyword}" — fetching live SERP, AI Overview, PAA, related searches, competitors...`,
        timestamp: Date.now(),
      });

      // Resolve the connected website this research is filed under: an explicit
      // website_id (agent picked one), else the workspace default. A lookup only
      // happens when website_id is passed — the default is pre-resolved in ctx.
      let site: ResolvedWebsite | null = ctx?.defaultWebsite ?? null;
      if (website_id && ctx?.supabase && ctx?.workspaceId) {
        site = await resolveWebsite(ctx.supabase, { workspaceId: ctx.workspaceId, explicitWebsiteId: website_id });
      }
      const effectiveDomain = homepage_domain || site?.domain || undefined;

      const country = (country_code || 'US').toUpperCase();
      const lang = (language_code || 'en').toLowerCase();
      const r = await callOpportunitiesStateless({
        subject_label: keyword,
        brand_name: brand_name || undefined,
        aliases: aliases && aliases.length ? aliases : undefined,
        language_codes: [lang],
        country_codes: [country],
        homepage_domain: effectiveDomain,
        // Subject-driven only — mention-derived types auto-skip in stateless mode
        // anyway, but being explicit keeps the LLM-facing schema honest.
        types: types || [
          'keyword_opportunity', 'pao_question', 'ai_overview',
          'featured_snippet', 'related_search', 'competitor_ranking',
          'video_carousel', 'news_carousel', 'knowledge_graph',
          'paid_competitor', 'shopping_listing',
          ...(effectiveDomain ? ['domain_snapshot'] : []),
        ],
        limit_per_type: limit_per_type ?? 5,
      });

      if (!r.ok) {
        const msg = r.error || 'opportunities-stateless call failed';
        onChunk?.({ type: 'tool_progress', status: `SEO research failed: ${msg}`, timestamp: Date.now() });
        return JSON.stringify({ success: false, error: msg });
      }

      const summary = condenseForLLM(r.data);

      // Persist to seo_research_runs so this agent research shows up in the
      // connected-website's SEO dashboard (filed under the resolved site).
      // Best-effort — a persist failure never blocks the chat response.
      if (ctx?.supabase && ctx?.workspaceId) {
        try {
          await ctx.supabase.from('seo_research_runs').insert({
            user_id: _userId,
            workspace_id: ctx.workspaceId,
            website_id: site?.id ?? null,
            kind: 'keyword_research',
            subject: keyword.slice(0, 200),
            request_params: { keyword, country_code: country, language_code: lang, homepage_domain: effectiveDomain ?? null },
            response: r.data ?? null,
            country_code: country,
            language_code: lang,
            cost_usd: 0,
            latency_ms: r.data?.latency_ms ?? null,
            success: true,
            error_message: null,
            label: null,
          });
        } catch (e) {
          console.warn('[seo_research_keyword] seo_research_runs persist failed:', e instanceof Error ? e.message : e);
        }
      }

      // Card payload — full opportunities array goes to the frontend so the
      // user can drill into every signal without round-tripping.
      onChunk?.({
        type: 'seo_research_card',
        keyword,
        country,
        language: lang,
        website_id: site?.id ?? null,
        website_domain: site?.domain ?? null,
        opportunity_count: r.data?.opportunities?.length || 0,
        summary,
        opportunities: r.data?.opportunities || [],
        errors: r.data?.errors || {},
        latency_ms: r.data?.latency_ms,
        timestamp: Date.now(),
      });

      onChunk?.({
        type: 'tool_progress',
        status: `Done — ${summary.opportunity_count} signals across ${Object.keys(summary.types).length} types${site ? ` · filed under ${site.domain}` : ''}.`,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        keyword,
        country,
        language: lang,
        website: site ? { id: site.id, domain: site.domain } : null,
        ...summary,
      });
    },
    {
      name: 'seo_research_keyword',
      description: [
        'Run a full SEO research pass on a single keyword. Returns Google AI Overview text + cited sources, featured snippet, top organic competitors, People Also Ask questions with current top answers, related searches, video / news / shopping carousels, knowledge graph state, paid bidders, and DataForSEO-Labs related keywords with volume + difficulty + search intent.',
        '',
        'Use this when:',
        '  - the user asks "what does Google show for X?" / "research X" / "is X a good keyword?"',
        '  - the user wants to know whether their brand is cited in Google AI Overview for a keyword',
        '  - the user wants to see who currently ranks for a keyword',
        '  - the user is exploring whether to write content for a keyword (vs. generating an article — that\'s create_seo_article)',
        '',
        'Cost: 0 user credits (internal DataForSEO call ~$0.005-0.010, billed to platform infra).',
      ].join('\n'),
      schema: z.object({
        keyword: z.string().min(1).max(200).describe('The keyword/topic/brand to research, e.g. "recycled concrete aggregates" or "Flobali tiles"'),
        brand_name: z.string().optional().describe('Brand name when known — used as fallback seed if the literal keyword has no SERP data.'),
        aliases: z.array(z.string()).optional().describe('Alternate strings to try if the primary keyword returns empty — e.g. SKU variants, abbreviations, multi-language spellings.'),
        country_code: z.string().length(2).optional().describe('ISO-3166 alpha-2 country code (US, GB, DE, FR, IT, ES, GR, NL, BE, AT, CH, PT, IE, CA, AU, PL, SE, DK, NO, FI, TR, BG, RO, CY). Default: US.'),
        language_code: z.string().min(2).max(5).optional().describe('ISO 639-1 language code, default "en".'),
        homepage_domain: z.string().optional().describe('Brand homepage domain (e.g. "flobali.gr"). Defaults to the connected website\'s domain when omitted. When set, also returns a domain_snapshot card with Domain Rank, organic traffic, ranking-keywords count, referring domains, backlinks.'),
        website_id: z.string().optional().describe('Connected website id to file this research under and derive the homepage_domain from. Omit to use the workspace\'s default connected website.'),
        types: z.array(z.string()).optional().describe('Subset of opportunity types to return. Default = all subject-driven (11 types + domain_snapshot when a homepage domain is set/derived).'),
        limit_per_type: z.number().int().min(1).max(20).optional().describe('Max items per opportunity type, default 5.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Search Console — first-party performance (reads our own gsc_performance)
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve the connected website + guard that GSC is connected before a GSC read. */
async function resolveGscWebsite(ctx: SeoWebsiteCtx | undefined, explicitWebsiteId?: string): Promise<{ ok: true; site: ResolvedWebsite } | { ok: false; error: string }> {
  if (!ctx?.supabase || !ctx?.workspaceId) return { ok: false, error: 'No workspace context — Search Console reads need a signed-in workspace.' };
  let site: ResolvedWebsite | null = ctx.defaultWebsite ?? null;
  if (explicitWebsiteId) site = await resolveWebsite(ctx.supabase, { workspaceId: ctx.workspaceId, explicitWebsiteId });
  if (!site) return { ok: false, error: 'No connected website. Ask the user to connect one under My Profile → Websites, then connect Google Search Console on it.' };
  return { ok: true, site };
}

export const createSEOGscStrikingDistanceTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ website_id, days }) => {
      const r = await resolveGscWebsite(ctx, website_id);
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      onChunk?.({ type: 'tool_progress', status: `Finding striking-distance keywords for ${r.site.domain}…`, timestamp: Date.now() });
      const { data, error } = await ctx!.supabase.rpc('get_gsc_striking_distance', { p_website_id: r.site.id, p_days: days ?? 28, p_limit: 25 });
      if (error) return JSON.stringify({ success: false, error: error.message });
      if (!data) return JSON.stringify({ success: false, error: 'Website not found.' });
      const items = (data.items as any[]) || [];
      if (items.length === 0) {
        return JSON.stringify({ success: true, website: r.site.domain, count: 0, note: 'No striking-distance keywords yet — Search Console may not be connected/synced for this site, or there is not enough data.' });
      }
      onChunk?.({ type: 'seo_gsc_striking_distance_card', website: r.site.domain, days: data.days, items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, website: r.site.domain, days: data.days, count: items.length,
        top: items.slice(0, 12).map((i: any) => ({ query: i.query, position: i.position, impressions: i.impressions, ctr: i.ctr })),
      });
    },
    {
      name: 'seo_gsc_striking_distance',
      description: 'Google Search Console: keywords this site ALREADY ranks for at average position 8–20 (just off page one) with real impression demand — the highest-leverage rewrite/optimize targets. Reads first-party GSC data (real impressions/clicks/position), not estimates. Requires the site to have Search Console connected. Defaults to the connected website when website_id is omitted.',
      schema: z.object({
        website_id: z.string().optional().describe('Connected website id. Omit to use the workspace default.'),
        days: z.number().int().min(1).max(180).optional().describe('Look-back window in days, default 28.'),
      }),
    },
  );
};

export const createSEOGscTopMoversTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ website_id, days }) => {
      const r = await resolveGscWebsite(ctx, website_id);
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      onChunk?.({ type: 'tool_progress', status: `Computing top position movers for ${r.site.domain}…`, timestamp: Date.now() });
      const { data, error } = await ctx!.supabase.rpc('get_gsc_movers', { p_website_id: r.site.id, p_days: days ?? 28, p_limit: 20 });
      if (error) return JSON.stringify({ success: false, error: error.message });
      if (!data) return JSON.stringify({ success: false, error: 'Website not found.' });
      const items = (data.items as any[]) || [];
      if (items.length === 0) {
        return JSON.stringify({ success: true, website: r.site.domain, count: 0, note: 'No movers yet — Search Console may not be connected/synced, or there is not enough history (needs two comparable windows).' });
      }
      onChunk?.({ type: 'seo_gsc_movers_card', website: r.site.domain, days: data.days, items, timestamp: Date.now() });
      const gainers = items.filter((i: any) => i.delta > 0), losers = items.filter((i: any) => i.delta < 0);
      return JSON.stringify({
        success: true, website: r.site.domain, days: data.days, count: items.length,
        biggest_gains: gainers.slice(0, 6).map((i: any) => ({ query: i.query, delta: i.delta, position_now: i.position_now })),
        biggest_drops: losers.slice(0, 6).map((i: any) => ({ query: i.query, delta: i.delta, position_now: i.position_now })),
      });
    },
    {
      name: 'seo_gsc_top_movers',
      description: 'Google Search Console: the biggest average-position swings for this site — recent window vs the immediately-prior window. Positive delta = improved (rose toward #1); negative = slipped. Reads first-party GSC data. Use to answer "which of my pages/queries are gaining or losing rank?". Requires Search Console connected. Defaults to the connected website when website_id is omitted.',
      schema: z.object({
        website_id: z.string().optional().describe('Connected website id. Omit to use the workspace default.'),
        days: z.number().int().min(1).max(90).optional().describe('Window size in days (compared against the prior equal window), default 28.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Wave 1B — Standalone Labs utilities (difficulty / suggestions / intent)
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOKeywordDifficultyTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keywords, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Bulk-scoring difficulty for ${keywords.length} keywords...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_bulk_keyword_difficulty', {
        keywords, country_code: (country_code || 'US').toUpperCase(),
        language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      const top10 = items.slice(0, 10).map((it: any) => ({
        keyword: it.keyword, difficulty: it.keyword_difficulty,
      }));
      onChunk?.({
        type: 'seo_keyword_difficulty_card',
        keywords_requested: keywords.length, items_returned: items.length,
        items, country: (country_code || 'US').toUpperCase(),
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, count: items.length, top10 });
    },
    {
      name: 'seo_keyword_difficulty',
      description: 'Bulk-score SEO ranking difficulty (0-100) for up to 1000 keywords in one call. Use for prioritising which keywords to target first.',
      schema: z.object({
        keywords: z.array(z.string()).min(1).max(1000).describe('Keywords to score.'),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

export const createSEOKeywordSuggestionsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Expanding "${keyword}" via Keyword Suggestions...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_keyword_suggestions', {
        keyword, country_code: (country_code || 'US').toUpperCase(),
        language_code: (language_code || 'en').toLowerCase(),
        limit: limit ?? 50,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_keywords_card',
        seed: keyword, items, source: 'suggestions',
        country: (country_code || 'US').toUpperCase(),
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, seed: keyword, count: items.length,
        top10: items.slice(0, 10).map((i: any) => ({
          keyword: i.keyword_data?.keyword || i.keyword,
          volume: i.keyword_data?.keyword_info?.search_volume ?? i.search_volume,
        })),
      });
    },
    {
      name: 'seo_keyword_suggestions',
      description: 'Phrase-match keyword expansion. Returns up to 1000 keywords containing the seed phrase, with volume and competition. Use when DataForSEO Related Keywords returned empty (niche brands).',
      schema: z.object({
        keyword: z.string().min(1).describe('Seed phrase.'),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
    },
  );
};

export const createSEOSearchIntentTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keywords, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Classifying intent for ${keywords.length} keywords...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_search_intent', {
        keywords, language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_intent_card', items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, count: items.length,
        sample: items.slice(0, 10).map((i: any) => ({
          keyword: i.keyword,
          intent: i.keyword_intent?.label || i.keyword_intent_info?.main_intent,
        })),
      });
    },
    {
      name: 'seo_search_intent',
      description: 'Bulk-classify keyword intent (informational / navigational / commercial / transactional). Use to decide article format — informational keywords want guides; transactional keywords want product pages.',
      schema: z.object({
        keywords: z.array(z.string()).min(1).max(1000),
        language_code: z.string().optional(),
      }),
    },
  );
};

export const createSEOSerpAuditTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code, language_code, depth }) => {
      onChunk?.({ type: 'tool_progress', status: `Fetching live SERP for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('serp_google_organic', {
        keyword, country_code: (country_code || 'US').toUpperCase(),
        language_code: (language_code || 'en').toLowerCase(),
        depth: depth ?? 30,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      // Group items by SERP block type
      const byType: Record<string, number> = {};
      for (const it of items) {
        const t = (it.type || '').toLowerCase();
        byType[t] = (byType[t] || 0) + 1;
      }
      onChunk?.({
        type: 'seo_serp_audit_card',
        keyword, country: (country_code || 'US').toUpperCase(),
        items, types_summary: byType, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, keyword, item_count: items.length, types: byType,
      });
    },
    {
      name: 'seo_serp_audit',
      description: 'Fetch the raw, complete Google SERP for one keyword — every block type (organic, PAA, AI Overview, featured snippet, related searches, video, news, knowledge graph, paid, shopping). Most granular research tool.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        depth: z.number().int().min(10).max(100).optional(),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — URL audit tool
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOAuditUrlTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ url, for_mobile }) => {
      onChunk?.({ type: 'tool_progress', status: `Auditing ${url}...`, timestamp: Date.now() });
      const r = await callSEOAgentRoute('onpage/quick-page', {
        url, for_mobile: !!for_mobile, attribution: { user_id: _userId },
      });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      onChunk?.({
        type: 'seo_url_audit_card',
        url, for_mobile: !!for_mobile,
        sections: r.data?.sections || {},
        errors: r.data?.errors || {},
        timestamp: Date.now(),
      });
      // Pull the Lighthouse summary for the LLM
      const lh = r.data?.sections?.lighthouse?.items?.[0];
      const categories = lh?.categories || {};
      return JSON.stringify({
        success: true, url,
        lighthouse_scores: {
          performance: categories.performance?.score,
          accessibility: categories.accessibility?.score,
          best_practices: categories['best-practices']?.score,
          seo: categories.seo?.score,
        },
      });
    },
    {
      name: 'seo_audit_url',
      description: 'Audit any public URL — runs DataForSEO instant-page audit + Google Lighthouse (performance / accessibility / best-practices / SEO scores) + content-parsing in parallel. Returns scores plus on-page issues. Works on competitor pages too.',
      schema: z.object({
        url: z.string().url().describe('Full https URL to audit.'),
        for_mobile: z.boolean().optional().describe('Use mobile Lighthouse profile when true.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Domain intelligence
// ─────────────────────────────────────────────────────────────────────────────

export const createSEODomainSnapshotTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Fetching domain snapshot for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_domain_rank_overview', {
        target: domain, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_domain_snapshot_card',
        domain, country: country_code, items, timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, domain, items: items.slice(0, 1) });
    },
    {
      name: 'seo_domain_snapshot',
      description: 'Domain-level SEO snapshot: Domain Rank, organic ranking-keyword count, estimated monthly traffic, traffic value, referring domains, total backlinks. Use as the baseline for any domain audit.',
      schema: z.object({
        domain: z.string().min(3).describe('Domain (no protocol), e.g. "flobali.gr".'),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

export const createSEORankedKeywordsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Fetching top ranking keywords for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_ranked_keywords', {
        target: domain, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
        limit: limit ?? 50,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_ranked_keywords_card',
        domain, country: country_code, items, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, domain, count: items.length,
        top: items.slice(0, 10).map((it: any) => ({
          keyword: it.keyword_data?.keyword,
          rank: it.ranked_serp_element?.serp_item?.rank_absolute,
          volume: it.keyword_data?.keyword_info?.search_volume,
          traffic: it.ranked_serp_element?.serp_item?.etv,
        })),
      });
    },
    {
      name: 'seo_ranked_keywords',
      description: 'Every keyword the domain currently ranks for — with rank position, volume, and estimated traffic share. Use to understand what the domain captures organically.',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

export const createSEODomainCompetitorsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Finding competitors for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_competitors_domain', {
        target: domain, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
        limit: limit ?? 20,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_domain_competitors_card',
        domain, items, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, domain,
        top: items.slice(0, 10).map((it: any) => ({
          competitor: it.domain, intersections: it.intersections,
          full_domain_rank: it.full_domain_metrics?.organic?.count,
        })),
      });
    },
    {
      name: 'seo_domain_competitors',
      description: 'Top organic competitors for a domain — domains ranking on the same keyword set. Use to identify who you are competing against.',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(5).max(100).optional(),
      }),
    },
  );
};

export const createSEOKeywordGapTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ your_domain, competitor_domain, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Computing keyword gap: ${your_domain} vs ${competitor_domain}...`, timestamp: Date.now() });
      const r = await callSEOAgentRoute('keyword-gap', {
        your_domain, competitor_domain, country_code, language_code,
        limit: limit ?? 100, attribution: { user_id: _userId },
      });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_keyword_gap_card',
        your_domain, competitor_domain, items, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, gap_count: items.length,
        top: items.slice(0, 10).map((it: any) => ({
          keyword: it.keyword_data?.keyword,
          competitor_rank: it.second_domain_serp_element?.rank_absolute,
          volume: it.keyword_data?.keyword_info?.search_volume,
        })),
      });
    },
    {
      name: 'seo_keyword_gap',
      description: 'Keywords where COMPETITOR ranks but YOU do not — pure content-gap delta. Highest-leverage tool for finding what to write next.',
      schema: z.object({
        your_domain: z.string().min(3),
        competitor_domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

export const createSEOTrafficEstimationTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domains, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Estimating traffic for ${domains.length} domains...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_bulk_traffic_estimation', {
        targets: domains, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_traffic_estimation_card',
        items, country: country_code, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, count: items.length,
        sample: items.slice(0, 10).map((it: any) => ({
          target: it.target,
          organic_etv: it.metrics?.organic?.etv,
          paid_etv: it.metrics?.paid?.etv,
        })),
      });
    },
    {
      name: 'seo_traffic_estimation',
      description: 'Bulk-estimate monthly organic + paid traffic for up to 1000 domains in one call. Use to compare market share across competitors.',
      schema: z.object({
        domains: z.array(z.string()).min(1).max(1000),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Backlinks
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOBacklinksSummaryTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ target }) => {
      onChunk?.({ type: 'tool_progress', status: `Loading backlinks summary for ${target}...`, timestamp: Date.now() });
      const r = await callDataForSEO('backlinks_summary', { target }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const item = (r.data?.items || [])[0] || {};
      onChunk?.({
        type: 'seo_backlinks_summary_card',
        target, summary: item, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, target,
        backlinks: item.backlinks, referring_domains: item.referring_domains,
        rank: item.rank, spam_score: item.spam_score,
      });
    },
    {
      name: 'seo_backlinks_summary',
      description: 'Backlinks overview: total backlinks, referring domains, referring TLDs, anchors, spam score, trust flow. Run before deep backlinks queries.',
      schema: z.object({
        target: z.string().min(3).describe('Domain or URL.'),
      }),
    },
  );
};

export const createSEOBacklinksAnchorsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ target, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Loading top anchor texts for ${target}...`, timestamp: Date.now() });
      const r = await callDataForSEO('backlinks_anchors', {
        target, limit: limit ?? 30,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_backlinks_anchors_card', target, items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, target, count: items.length,
        top10: items.slice(0, 10).map((a: any) => ({ anchor: a.anchor, count: a.backlinks })),
      });
    },
    {
      name: 'seo_backlinks_anchors',
      description: 'Top anchor texts pointing to a domain. Reveals brand-mention vs over-optimised anchor patterns.',
      schema: z.object({
        target: z.string().min(3),
        limit: z.number().int().min(5).max(1000).optional(),
      }),
    },
  );
};

export const createSEOReferringDomainsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ target, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Listing referring domains for ${target}...`, timestamp: Date.now() });
      const r = await callDataForSEO('backlinks_referring_domains', {
        target, limit: limit ?? 50,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_referring_domains_card', target, items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, target, count: items.length,
        top10: items.slice(0, 10).map((d: any) => ({
          domain: d.domain, rank: d.rank, backlinks: d.backlinks,
        })),
      });
    },
    {
      name: 'seo_referring_domains',
      description: 'List domains linking to a target. Use for backlink profile analysis or competitor link-building research.',
      schema: z.object({
        target: z.string().min(3),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — OnPage (site crawl)
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOSiteCrawlStartTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ target, max_pages }) => {
      onChunk?.({ type: 'tool_progress', status: `Starting site crawl of ${target}...`, timestamp: Date.now() });
      const r = await callSEOAgentRoute('onpage/start', {
        target, max_crawl_pages: max_pages ?? 50,
        attribution: { user_id: _userId },
      });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      onChunk?.({
        type: 'seo_site_crawl_started_card',
        target, task_id: r.data?.task_id, max_pages: max_pages ?? 50,
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, target, task_id: r.data?.task_id,
        message: 'Crawl queued. Use seo_site_crawl_status with the task_id to poll for completion.',
      });
    },
    {
      name: 'seo_site_crawl_start',
      description: 'Kick off a full DataForSEO OnPage crawl of a domain (up to 1000 pages). Returns task_id immediately. Crawl runs in background. Use seo_site_crawl_status to check.',
      schema: z.object({
        target: z.string().min(3).describe('Root domain to crawl, e.g. "flobali.gr".'),
        max_pages: z.number().int().min(1).max(1000).optional().describe('Default 50.'),
      }),
    },
  );
};

export const createSEOSiteCrawlStatusTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ task_id }) => {
      onChunk?.({ type: 'tool_progress', status: `Checking crawl ${task_id}...`, timestamp: Date.now() });
      const r = await callDataForSEO('onpage_summary', { task_id }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const item = (r.data?.items || [])[0] || {};
      const crawl_progress = item.crawl_progress || 'unknown';
      onChunk?.({
        type: 'seo_site_crawl_status_card',
        task_id, status: crawl_progress, summary: item, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, task_id, status: crawl_progress,
        domain_info: item.domain_info,
        page_metrics: item.page_metrics,
        ready: crawl_progress === 'finished',
      });
    },
    {
      name: 'seo_site_crawl_status',
      description: 'Poll a running site-crawl by task_id. Returns crawl_progress (in_progress / finished), aggregate page metrics, broken link counts, redirect chains.',
      schema: z.object({
        task_id: z.string().describe('Task ID returned from seo_site_crawl_start.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Content Analysis + Domain Analytics
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOContentSentimentTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword }) => {
      onChunk?.({ type: 'tool_progress', status: `Analysing sentiment around "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('content_sentiment_analysis', { keyword }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const item = (r.data?.items || [])[0] || {};
      onChunk?.({
        type: 'seo_sentiment_card',
        keyword, distribution: item.sentiment_distribution, timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, keyword, sentiment: item.sentiment_distribution });
    },
    {
      name: 'seo_content_sentiment',
      description: 'Sentiment distribution (positive / negative / neutral) across all web mentions of a keyword. Different from LLM-mentions — this is the open-web text corpus.',
      schema: z.object({
        keyword: z.string().min(1),
      }),
    },
  );
};

export const createSEODomainTechnologiesTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain }) => {
      onChunk?.({ type: 'tool_progress', status: `Identifying tech stack for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('domain_technologies', { target: domain }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const item = (r.data?.items || [])[0] || {};
      onChunk?.({
        type: 'seo_domain_tech_card',
        domain, technologies: item.technologies, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, domain,
        tech_categories: Object.keys(item.technologies || {}),
      });
    },
    {
      name: 'seo_domain_technologies',
      description: 'Tech stack identification for any domain — CMS, analytics, CDN, JavaScript frameworks, e-commerce platform, marketing tools. Use for competitive intelligence.',
      schema: z.object({
        domain: z.string().min(3),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — AI Optimization (LLM mentions, native to DataForSEO)
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOLlmMentionsSearchTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Searching LLM mentions for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('ai_llm_mentions_search', {
        keyword, language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_llm_mentions_card',
        keyword, items, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, keyword, count: items.length,
      });
    },
    {
      name: 'seo_llm_mentions_search',
      description: 'DataForSEO native LLM-mention search. Returns pages and domains LLMs cite when answering questions related to the keyword. Different from our own probe matrix — this aggregates DataForSEO\'s LLM crawl corpus.',
      schema: z.object({
        keyword: z.string().min(1),
        language_code: z.string().optional(),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10 — Multi-engine SERP
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOYouTubeSearchTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `YouTube search for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('serp_youtube_organic', {
        keyword, country_code: (country_code || 'US').toUpperCase(),
        language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_youtube_card',
        keyword, items, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, keyword, count: items.length,
        top: items.slice(0, 5).map((v: any) => ({
          title: v.title, channel: v.channel?.title, views: v.views, url: v.url,
        })),
      });
    },
    {
      name: 'seo_youtube_search',
      description: 'YouTube organic search — top videos for a keyword with view counts, channel, duration. Use for video-SEO research.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

export const createSEOLocalPackTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Checking local pack for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('serp_google_local_finder', {
        keyword, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_local_pack_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, keyword, count: items.length,
        top3: items.slice(0, 3).map((p: any) => ({
          title: p.title, address: p.address, rating: p.rating?.value, reviews: p.rating?.votes_count,
        })),
      });
    },
    {
      name: 'seo_local_pack',
      description: 'Google Maps 3-pack for a keyword in a specific country. Use for local-SEO research — does the brand show up for "X near me"?',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11 — Keywords Data (Google Trends)
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOGoogleTrendsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keywords, country_code, time_range }) => {
      onChunk?.({ type: 'tool_progress', status: `Google Trends for ${keywords.join(', ')}...`, timestamp: Date.now() });
      const r = await callDataForSEO('kw_google_trends_explore', {
        keywords, country_code: country_code || null,
        time_range: time_range || 'past_12_months',
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_trends_card', keywords, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: items.length });
    },
    {
      name: 'seo_google_trends',
      description: 'Google Trends interest-over-time + regional breakdown for up to 5 keywords. Use to spot rising/falling interest.',
      schema: z.object({
        keywords: z.array(z.string()).min(1).max(5),
        country_code: z.string().length(2).optional(),
        time_range: z.string().optional().describe('past_24_hours | past_7_days | past_30_days | past_12_months | past_5_years'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12 — Composite audits + niche
// ─────────────────────────────────────────────────────────────────────────────

export const createSEOSiteReviewTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain, country_code, language_code, include_backlinks, include_competitors }) => {
      onChunk?.({ type: 'tool_progress', status: `Running full site review for ${domain}...`, timestamp: Date.now() });
      const r = await callSEOAgentRoute('site-review', {
        domain, country_code, language_code: language_code || 'en',
        include_backlinks: include_backlinks !== false,
        include_competitors: include_competitors !== false,
        attribution: { user_id: _userId },
      });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      onChunk?.({
        type: 'seo_site_review_card',
        domain, sections: r.data?.sections || {},
        errors: r.data?.errors || {},
        country: country_code,
        timestamp: Date.now(),
      });
      const sections = r.data?.sections || {};
      return JSON.stringify({
        success: true, domain,
        sections_loaded: Object.keys(sections),
        errors: Object.keys(r.data?.errors || {}),
      });
    },
    {
      name: 'seo_site_review',
      description: 'Composite multi-section domain audit: domain rank overview + top ranking keywords + competitors + backlinks summary + top anchors. ONE tool call. Use for "give me the full picture for example.com".',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        include_backlinks: z.boolean().optional(),
        include_competitors: z.boolean().optional(),
      }),
    },
  );
};

export const createSEOBrandSearchAuditTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ brand_name, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Brand-search audit for "${brand_name}"...`, timestamp: Date.now() });
      const r = await callSEOAgentRoute('brand-search-audit', {
        brand_name, country_code, language_code: language_code || 'en',
        attribution: { user_id: _userId },
      });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      // Detect KP, AI Overview brand mention, and own organic listings
      const kp = items.find((i: any) => i.type === 'knowledge_graph');
      const aio = items.find((i: any) => i.type === 'ai_overview');
      const organic = items.filter((i: any) => i.type === 'organic').slice(0, 5);
      onChunk?.({
        type: 'seo_brand_audit_card',
        brand_name, items, kp_present: !!kp,
        ai_overview_present: !!aio, organic_top: organic,
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, brand_name,
        knowledge_panel: !!kp, ai_overview: !!aio,
        own_organic_count: organic.length,
      });
    },
    {
      name: 'seo_brand_search_audit',
      description: 'Brand-search SERP audit for "{brand}" query. Surfaces Knowledge Panel state, AI Overview brand mention, organic listings the brand owns, and any paid bids on own brand name.',
      schema: z.object({
        brand_name: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13 — Escape hatch for arbitrary endpoints
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12 (continued) — Additional niche tools to round out coverage
// ─────────────────────────────────────────────────────────────────────────────

/** Amazon ASIN ranked keywords — what keywords does this ASIN rank for. */
export const createSEOAmazonAsinTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ asin, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Amazon ASIN keywords for ${asin}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_amazon_ranked_keywords', {
        asin, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
        limit: limit ?? 50,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_amazon_asin_card', asin, items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, asin, count: items.length,
        top: items.slice(0, 8).map((it: any) => ({
          keyword: it.keyword_data?.keyword,
          rank: it.ranked_serp_element?.serp_item?.rank_absolute,
          volume: it.keyword_data?.keyword_info?.search_volume,
        })),
      });
    },
    {
      name: 'seo_amazon_asin',
      description: 'Amazon SEO — list every keyword an ASIN ranks for, with rank and volume. Use for Amazon listing optimization.',
      schema: z.object({
        asin: z.string().describe('Amazon Standard Identification Number, e.g. B07ZPKBL9V'),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** App Store / Google Play keywords — Apple App Store or Google Play. */
export const createSEOAppKeywordsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ store, app_id, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `${store} keywords for ${app_id}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_app_keywords', {
        store, app_id, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
        limit: limit ?? 50,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_app_keywords_card', store, app_id, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, store, app_id, count: items.length });
    },
    {
      name: 'seo_app_keywords',
      description: 'Mobile-app SEO — keywords a Google Play / Apple App Store app ranks for. Use for ASO (App Store Optimization).',
      schema: z.object({
        store: z.enum(['google_play', 'app_store']),
        app_id: z.string().describe('Bundle ID for App Store or package name for Google Play.'),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** Trustpilot search — find Trustpilot pages for a search query. */
export const createSEOTrustpilotSearchTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Trustpilot search for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('business_trustpilot_search', {
        keyword, country_code: country_code || null,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_trustpilot_search_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, keyword, count: items.length,
        top: items.slice(0, 5).map((it: any) => ({
          domain: it.domain, rating: it.rating, reviews: it.reviews_count,
        })),
      });
    },
    {
      name: 'seo_trustpilot_search',
      description: 'Find Trustpilot business listings for a search term. Returns ratings + review counts. Use for reputation research.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
      }),
    },
  );
};

/** Pinterest search — pins/boards for a keyword. */
export const createSEOPinterestSearchTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Pinterest search for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('business_pinterest', {
        keyword, country_code: country_code || null,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_pinterest_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, keyword, count: items.length });
    },
    {
      name: 'seo_pinterest_search',
      description: 'Pinterest pin/board search for a keyword. Surfaces visual-trend signal — what aesthetic dominates the topic on Pinterest.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
      }),
    },
  );
};

/** Reddit search — threads for a keyword. */
export const createSEORedditSearchTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Reddit search for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('business_reddit', {
        keyword, country_code: country_code || null,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_reddit_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, keyword, count: items.length });
    },
    {
      name: 'seo_reddit_search',
      description: 'Reddit thread search for a keyword. Surfaces real user discussion + pain points — useful for FAQ and "real questions people ask" research.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
      }),
    },
  );
};

/** Domain WHOIS — registration metadata + tech stack. */
export const createSEODomainWhoisTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain }) => {
      onChunk?.({ type: 'tool_progress', status: `WHOIS for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('domain_whois', { target: domain }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const item = (r.data?.items || [])[0] || {};
      onChunk?.({ type: 'seo_whois_card', domain, item, timestamp: Date.now() });
      return JSON.stringify({
        success: true, domain,
        registered: item.created_datetime, expires: item.expiration_datetime,
        registrar: item.registrar,
      });
    },
    {
      name: 'seo_domain_whois',
      description: 'Domain WHOIS data + age + registrar. Useful signal: a 6-month-old domain ranking high probably has artificial backlinks.',
      schema: z.object({ domain: z.string().min(3) }),
    },
  );
};

/** Subdomains — list every indexed subdomain of a target. */
export const createSEOSubdomainsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Listing subdomains for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_subdomains', {
        target: domain, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
        limit: limit ?? 50,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_subdomains_card', domain, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, domain, count: items.length });
    },
    {
      name: 'seo_subdomains',
      description: 'List indexed subdomains of a target domain with their organic-ranking metrics. Reveals subdomain strategy.',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** Relevant pages — top-ranking pages of a domain. */
export const createSEORelevantPagesTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Top pages for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_relevant_pages', {
        target: domain, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
        limit: limit ?? 50,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_relevant_pages_card', domain, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, domain, count: items.length });
    },
    {
      name: 'seo_relevant_pages',
      description: 'Top-ranking pages of a domain by traffic share. Use to identify which page templates are performing best.',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** Historical SERPs — see how SERP for a keyword has changed over time. */
export const createSEOHistoricalSerpsTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keyword, country_code, language_code, date_from, date_to }) => {
      onChunk?.({ type: 'tool_progress', status: `Historical SERP for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_historical_serps', {
        keyword, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
        date_from: date_from || null, date_to: date_to || null,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_historical_serps_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, keyword, snapshot_count: items.length });
    },
    {
      name: 'seo_historical_serps',
      description: 'Historical SERP snapshots for a keyword. Track how positions changed over time — who lost rank, who gained.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        date_from: z.string().optional().describe('YYYY-MM-DD'),
        date_to: z.string().optional().describe('YYYY-MM-DD'),
      }),
    },
  );
};

/** Keyword overview — single keyword detail (volume, intent, difficulty, CPC). */
export const createSEOKeywordOverviewTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keywords, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Keyword overview for ${keywords.length} keywords...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_keyword_overview', {
        keywords, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_keyword_overview_card', items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, count: items.length,
        sample: items.slice(0, 8).map((it: any) => ({
          keyword: it.keyword,
          volume: it.keyword_info?.search_volume,
          difficulty: it.keyword_properties?.keyword_difficulty,
          cpc: it.keyword_info?.cpc,
        })),
      });
    },
    {
      name: 'seo_keyword_overview',
      description: 'Single-call keyword overview: volume, KD, intent, CPC, competition, monthly searches history. Bulk up to 700 keywords.',
      schema: z.object({
        keywords: z.array(z.string()).min(1).max(700),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

/** Google AI Overview keyword volume — search volume for queries actually run on AI engines. */
export const createSEOAIKeywordVolumeTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ keywords, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `AI keyword volume for ${keywords.length} keywords...`, timestamp: Date.now() });
      const r = await callDataForSEO('ai_keyword_search_volume', {
        keywords, language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_ai_keyword_volume_card', items, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: items.length });
    },
    {
      name: 'seo_ai_keyword_volume',
      description: 'LLM-search keyword volume — how often this query is asked of AI engines (ChatGPT, Claude, Gemini, Perplexity). Different from Google Ads volume.',
      schema: z.object({
        keywords: z.array(z.string()).min(1).max(1000),
        language_code: z.string().optional(),
      }),
    },
  );
};

/** Categories for a domain — DataForSEO Labs auto-categorization. */
export const createSEOCategoriesForDomainTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ domain, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Categorising ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_categories_for_domain', {
        target: domain, country_code: country_code || null,
        language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_categories_card', domain, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, domain, count: items.length });
    },
    {
      name: 'seo_categories_for_domain',
      description: 'Identify what categories Google Ads associates with a domain (interior design / e-commerce / building materials / etc.) — useful for understanding what algorithm thinks the site is about.',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

export const createSEODataForSEOCallTool = (
  _userId: string, onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ kind, params }) => {
      onChunk?.({ type: 'tool_progress', status: `DataForSEO call: ${kind}...`, timestamp: Date.now() });
      const r = await callDataForSEO(kind, params || {}, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error, kind });
      const items = r.data?.items || [];
      onChunk?.({
        type: 'seo_dataforseo_raw_card',
        kind, items, raw: r.data?.raw,
        cost_usd: r.data?.cost_usd, latency_ms: r.data?.latency_ms,
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, kind, item_count: items.length,
        cost_usd: r.data?.cost_usd, sample: items.slice(0, 3),
      });
    },
    {
      name: 'seo_dataforseo_call',
      description: 'ESCAPE HATCH — call any DataForSEO endpoint by name when no specific tool fits. Valid kinds: serp_google_organic, serp_youtube_organic, labs_related_keywords, labs_keyword_overview, labs_subdomains, labs_relevant_pages, labs_historical_serps, labs_categories_for_domain, kw_google_trends_explore, kw_clickstream_search_volume, content_search, content_phrase_trends, domain_whois, domain_domains_by_technology, business_pinterest, business_reddit, business_listings_search, ai_llm_mentions_top_pages, ai_llm_mentions_top_domains, app_data_search, etc. (full list at /docs/seo-agent-tools-reference.md). Pass params matching the underlying endpoint signature.',
      schema: z.object({
        kind: z.string().describe('Method name on the DataForSEO unified client (see description for the catalog).'),
        params: z.record(z.any()).optional().describe('Parameters forwarded to the endpoint.'),
      }),
    },
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Gap-filler tools (2026-07) — data DataForSEO offers that GSC can't, promoted
// from the escape hatch to first-class tools. Each is a thin wrapper over
// callDataForSEO(<unified-client-method>, params).
// ═══════════════════════════════════════════════════════════════════════════

const ONPAGE_ISSUE_KIND: Record<string, string> = {
  non_indexable: 'onpage_non_indexable',
  redirects: 'onpage_redirect_chains',
  duplicate_tags: 'onpage_duplicate_tags',
  duplicate_content: 'onpage_duplicate_content',
  broken_links: 'onpage_links',
  lighthouse: 'onpage_lighthouse',
  structured_data: 'onpage_microdata',
  pages: 'onpage_pages',
};

/** OnPage granular issues for a finished site crawl (needs a task_id from seo_site_crawl_start). */
export const createSEOOnpageIssuesTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ task_id, issue_type, limit }) => {
      const kind = ONPAGE_ISSUE_KIND[issue_type];
      if (!kind) return JSON.stringify({ success: false, error: `unknown issue_type: ${issue_type}` });
      onChunk?.({ type: 'tool_progress', status: `Fetching ${issue_type} for crawl ${task_id}...`, timestamp: Date.now() });
      const r = await callDataForSEO(kind, { id: task_id, task_id, limit: limit ?? 100 }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_onpage_issues_card', task_id, issue_type, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, issue_type, count: items.length, sample: items.slice(0, 8) });
    },
    {
      name: 'seo_onpage_issues',
      description: 'Technical site-audit detail for a FINISHED crawl (from seo_site_crawl_start → seo_site_crawl_status=finished). issue_type: non_indexable | redirects | duplicate_tags | duplicate_content | broken_links | lighthouse (Core Web Vitals) | structured_data | pages. This is what GSC Index Coverage only hints at.',
      schema: z.object({
        task_id: z.string().describe('Crawl task_id from seo_site_crawl_start.'),
        issue_type: z.enum(['non_indexable', 'redirects', 'duplicate_tags', 'duplicate_content', 'broken_links', 'lighthouse', 'structured_data', 'pages']),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
    },
  );
};

/** Backlinks over time — referring-domains / backlinks history. */
export const createSEOBacklinksTimeseriesTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ target }) => {
      onChunk?.({ type: 'tool_progress', status: `Loading backlink history for ${target}...`, timestamp: Date.now() });
      const r = await callDataForSEO('backlinks_timeseries_summary', { target }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_backlinks_timeseries_card', target, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, target, points: items.length });
    },
    {
      name: 'seo_backlinks_timeseries',
      description: 'Backlink profile OVER TIME — monthly referring domains, backlinks, and rank trend. Reveals link growth/decay velocity (GSC barely reports links).',
      schema: z.object({ target: z.string().min(3).describe('Domain or URL.') }),
    },
  );
};

/** Backlink competitors — domains with the most-similar backlink profiles. */
export const createSEOBacklinksCompetitorsTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ target, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Finding backlink competitors for ${target}...`, timestamp: Date.now() });
      const r = await callDataForSEO('backlinks_competitors', { target, limit: limit ?? 20 }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_backlinks_competitors_card', target, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, target, count: items.length, top: items.slice(0, 10) });
    },
    {
      name: 'seo_backlinks_competitors',
      description: 'Domains that share the most referring domains with the target — your real link-building competitors + intersection counts.',
      schema: z.object({ target: z.string().min(3), limit: z.number().int().min(5).max(100).optional() }),
    },
  );
};

/** Historical rank overview — domain organic rank/traffic month by month. */
export const createSEOHistoricalRankOverviewTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ domain, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Historical rank overview for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_historical_rank_overview', {
        target: domain, country_code: country_code || null, language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_historical_rank_card', domain, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, domain, points: items.length });
    },
    {
      name: 'seo_historical_rank_overview',
      description: 'Domain organic visibility OVER TIME — ranking-keyword count, estimated traffic (ETV) and traffic value month by month. The rank-tracker view GSC lacks (GSC gives only a blended avg position for queries you already get impressions on).',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

/** Keywords for site — every keyword a domain ranks for (fuller than ranked_keywords). */
export const createSEOKeywordsForSiteTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ domain, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Keyword universe for ${domain}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_keywords_for_site', {
        target: domain, country_code: country_code || null, language_code: (language_code || 'en').toLowerCase(), limit: limit ?? 100,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_keywords_for_site_card', domain, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, domain, count: items.length });
    },
    {
      name: 'seo_keywords_for_site',
      description: 'Every keyword the domain ranks for (positions 1–100) with volume, CPC and search intent — including the 11–100 rankings GSC buries. Use to size the full organic footprint.',
      schema: z.object({
        domain: z.string().min(3),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** Keyword ideas — expansion around seed keywords. */
export const createSEOKeywordIdeasTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ keywords, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Keyword ideas for ${keywords.join(', ')}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_keyword_ideas', {
        keywords, country_code: (country_code || 'US').toUpperCase(), language_code: (language_code || 'en').toLowerCase(), limit: limit ?? 100,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_keyword_ideas_card', seeds: keywords, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: items.length, top: items.slice(0, 15) });
    },
    {
      name: 'seo_keyword_ideas',
      description: 'Keyword expansion — ideas semantically related to seed keywords, with volume + difficulty. Broader than phrase-match suggestions. Use to build a topic cluster.',
      schema: z.object({
        keywords: z.array(z.string()).min(1).max(200),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** Related keywords — the "searches related to" expansion tree. */
export const createSEORelatedKeywordsTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ keyword, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Related keywords for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_related_keywords', {
        keyword, country_code: (country_code || 'US').toUpperCase(), language_code: (language_code || 'en').toLowerCase(), limit: limit ?? 100,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_related_keywords_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, keyword, count: items.length });
    },
    {
      name: 'seo_related_keywords',
      description: 'The Google "related searches" expansion tree for a seed keyword (depth-based), with volume. Use for intent mapping and FAQ discovery.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** Real search volume + CPC + competition (Google Ads). */
export const createSEOSearchVolumeTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ keywords, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Search volume + CPC for ${keywords.length} keywords...`, timestamp: Date.now() });
      const r = await callDataForSEO('kw_google_ads_search_volume', {
        keywords, country_code: (country_code || 'US').toUpperCase(), language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_search_volume_card', items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, count: items.length,
        sample: items.slice(0, 12).map((i: any) => ({ keyword: i.keyword, volume: i.search_volume, cpc: i.cpc, competition: i.competition })),
      });
    },
    {
      name: 'seo_search_volume',
      description: 'Real Google Ads search volume + CPC + competition for up to 1000 keywords. GSC has NONE of this — it only reports YOUR impressions. Use to turn GSC striking-distance into a prioritised, revenue-weighted list.',
      schema: z.object({
        keywords: z.array(z.string()).min(1).max(1000),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

/** Domain intersection — keyword gap between two domains. */
export const createSEODomainIntersectionTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ target1, target2, country_code, language_code, limit }) => {
      onChunk?.({ type: 'tool_progress', status: `Keyword intersection: ${target1} vs ${target2}...`, timestamp: Date.now() });
      const r = await callDataForSEO('labs_domain_intersection', {
        target1, target2, country_code: country_code || null, language_code: (language_code || 'en').toLowerCase(), limit: limit ?? 100,
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_domain_intersection_card', target1, target2, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, target1, target2, count: items.length });
    },
    {
      name: 'seo_domain_intersection',
      description: 'Keywords BOTH domains rank for, side by side with each domain\'s position — the true competitive keyword overlap (and, filtered, the gap). GSC has zero competitor data.',
      schema: z.object({
        target1: z.string().min(3).describe('Your domain.'),
        target2: z.string().min(3).describe('Competitor domain.'),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
        limit: z.number().int().min(10).max(1000).optional(),
      }),
    },
  );
};

/** Google AI Overview / AI mode summary for a keyword. */
export const createSEOAiOverviewTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ keyword, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Fetching Google AI Overview for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('serp_google_ai_summary', {
        keyword, country_code: (country_code || 'US').toUpperCase(), language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_ai_overview_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({ success: true, keyword, present: items.length > 0 });
    },
    {
      name: 'seo_ai_overview',
      description: 'Google AI Overview (AI-mode) answer + cited sources for a keyword. Use to check whether the brand/site is cited in Google\'s generative answer, and who is.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

/** Google Maps / local pack results for a keyword. */
export const createSEOGoogleMapsTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ keyword, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Google Maps results for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('serp_google_maps', {
        keyword, country_code: country_code || null, language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const items = r.data?.items || [];
      onChunk?.({ type: 'seo_google_maps_card', keyword, items, timestamp: Date.now() });
      return JSON.stringify({
        success: true, keyword, count: items.length,
        top: items.slice(0, 5).map((p: any) => ({ title: p.title, rating: p.rating?.value, reviews: p.rating?.votes_count, address: p.address })),
      });
    },
    {
      name: 'seo_google_maps',
      description: 'Google Maps organic results for a keyword (fuller than the 3-pack local finder) — titles, ratings, review counts, addresses. Local-SEO ranking view.',
      schema: z.object({
        keyword: z.string().min(1),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};

/** Google Business Profile info for a business. */
export const createSEOGbpInfoTool = (_userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ keyword, country_code, language_code }) => {
      onChunk?.({ type: 'tool_progress', status: `Google Business Profile for "${keyword}"...`, timestamp: Date.now() });
      const r = await callDataForSEO('business_google_my_business_info', {
        keyword, country_code: country_code || null, language_code: (language_code || 'en').toLowerCase(),
      }, { user_id: _userId });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const item = (r.data?.items || [])[0] || {};
      onChunk?.({ type: 'seo_gbp_info_card', keyword, item, timestamp: Date.now() });
      return JSON.stringify({
        success: true, keyword,
        title: item.title, rating: item.rating?.value, reviews: item.rating?.votes_count,
        category: item.category, address: item.address,
      });
    },
    {
      name: 'seo_gbp_info',
      description: 'Google Business Profile snapshot for a business name/brand — rating, review count, category, hours, attributes. Local reputation + listing health.',
      schema: z.object({
        keyword: z.string().min(1).describe('Business name or brand.'),
        country_code: z.string().length(2).optional(),
        language_code: z.string().optional(),
      }),
    },
  );
};
