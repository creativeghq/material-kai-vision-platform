/** SEO Agent Tools — conversational SEO research surface for the KAI agent. */

import { resolveWebsite, type ResolvedWebsite } from '../seo-website.ts';
import { openSpendGate, dataForSeoTaskError } from './dataforseo-spend-gate.ts';
// One dispatcher, shared with the CRM's Google Business lookup — a second copy of the
// reserve → call → settle chain is a second place for invariant 10 to be got wrong.
import { callDataForSEO, callSEOAgentRoute } from './dataforseo-dispatch.ts';
import { clipText, describeUpstreamError } from '../tool-result-shape.ts';
// Invariant 7 — a model-supplied URL that OUR infrastructure will fetch (#352 A19).
import { assertSafeUrl } from '../ssrf-guard.ts';
import { findWorkspacePage, recordPageAudit } from '../seo/page-audit-store.ts';
// Invariant 9 — third-party text inside a structured result (#352 A17).
import { UNTRUSTED_FIELDS_NOTE } from '../untrusted.ts';
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../secrets.ts';

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
/** Resolved per call: an admin-saved CRON_SECRET lives only in platform_secrets, which Deno.env never sees. */
async function cronSecret(): Promise<string> {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return (await resolveSecret(db, 'CRON_SECRET')).value ?? '';
}

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

/** Say "the index has no record of this" in words the model cannot round to zero. */
function emptyResult(
  subject: Record<string, unknown>,
  what: string,
  hint: string,
): string {
  return JSON.stringify({
    success: true,
    ...subject,
    data_status: 'no_data',
    // Spelled out because the model quotes this back to the user verbatim.
    answer: `The provider returned no ${what} for this target. That means it is not in the index — NOT that the value is zero. Do not report it as 0.`,
    hint,
  });
}

async function callOpportunitiesStateless(
  body: Record<string, any>,
  attribution?: { user_id?: string; workspace_id?: string | null },
): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
}> {
  const secret = await cronSecret();
  if (!secret) {
    return { ok: false, error: 'CRON_SECRET not configured on edge function — cannot call /opportunities-stateless' };
  }
  // This endpoint fans out to DataForSEO SERP + Labs on the operator's account. The header
  // comment above used to describe it as costing "0 partner credits", which was true of the
  // PARTNER ledger and not of the money — invariant 10 applies to the spend, not the ledger.
  const gate = await openSpendGate('composite_opportunities', attribution?.user_id, body, attribution?.workspace_id);
  if (!gate.ok) return { ok: false, error: gate.message };
  try {
    const resp = await fetch(
      `${MIVAA_GATEWAY_URL}/api/v1/mention-monitoring/opportunities-stateless`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': secret,
        },
        body: JSON.stringify(body),
      },
    );
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!resp.ok) {
      await gate.settle(0);
      return { ok: false, error: `backend ${describeUpstreamError(resp.status, parsed)}` };
    }
    await gate.settle(parsed?.data?.cost_usd);
    return { ok: true, data: parsed?.data };
  } catch (e) {
    await gate.settle(0);
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
    // Every title, question and related search below was written by whoever wanted to rank for
    // this query (#352 A17). One note on the object rather than a banner per string: the model
    // reads the whole result at once, and twenty results wrapped individually would be mostly
    // framing.
    _untrusted: UNTRUSTED_FIELDS_NOTE,
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
        // WHOSE research this is. The stateless path has no tracked-subject row for MIVAA to read
        // an owner off, so without this the DataForSEO Labs spend it triggers lands in
        // `ai_usage_logs` with no workspace — invisible to per-tenant cost views and to that
        // table's own `is_workspace_admin(workspace_id)` policy. Sent from the session's
        // workspace, never from anything the model supplied.
        workspace_id: ctx?.workspaceId ?? undefined,
      }, { user_id: _userId, workspace_id: ctx?.workspaceId ?? null });

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

/**
 * #401 G2 — the one ranked answer to "what should I work on for this site".
 *
 * The inputs all existed and sat in six separate tabs with nothing ranking them. Derived in SQL
 * by get_website_opportunities so this tool and any tile read the same list and cannot disagree.
 */
export const createSEOOpportunitiesTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ website_id }) => {
      const r = await resolveGscWebsite(ctx, website_id);
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      onChunk?.({ type: 'tool_progress', status: `Ranking opportunities for ${r.site.domain}…`, timestamp: Date.now() });
      const { data, error } = await ctx!.supabase.rpc('get_website_opportunities', { p_website_id: r.site.id });
      if (error) return JSON.stringify({ success: false, error: error.message });

      const rows = (data as any[]) || [];
      const actionable = rows.filter((x) => x.status === 'ok');
      // Rows we could NOT evaluate travel with the answer rather than being filtered out: a list
      // showing only what it happens to have is how a missing collector looks like a clean site.
      const unavailable = rows.filter((x) => x.status !== 'ok');

      onChunk?.({
        type: 'seo_opportunities_card',
        website: r.site.domain,
        items: actionable,
        unavailable,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        website: r.site.domain,
        count: actionable.length,
        top: actionable.slice(0, 10).map((i: any) => ({
          kind: i.kind, subject: i.subject, affected: i.affected, reason: i.reason,
        })),
        // Named for the MODEL too, so it cannot present the list as complete.
        not_evaluated: unavailable.map((u: any) => ({ kind: u.kind, why: u.reason })),
      });
    },
    {
      name: 'seo_opportunities',
      description: 'What to work on next for a site, as ONE ranked list derived in SQL: pages Google has never crawled or has crawled and declined, queries ranking 4–20 that are close, queries several of our own pages compete for, published articles slipping in Search Console, and keywords tracked competitors rank for where nothing of ours does. Each row states the reason it exists. Coverage counts are OBSERVED over the URLs inspected so far and never extrapolated to the whole site. Kinds that cannot be evaluated yet are returned with a stated reason rather than omitted.',
      schema: z.object({
        website_id: z.string().optional().describe('Connected website id. Omit to use the workspace default.'),
      }),
    },
  );
};

/** What the pages that rank for a keyword look like, as ranges, from research already run (no new spend). */
export const createSEOSerpContentAnalysisTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ keyword }) => {
      if (!ctx?.supabase || !ctx?.workspaceId) return JSON.stringify({ success: false, error: 'No workspace context.' });
      const { data, error } = await ctx.supabase
        .from('seo_keyword_research')
        .select('id, target_keyword, created_at, research_data')
        .eq('workspace_id', ctx.workspaceId)
        .ilike('target_keyword', keyword.trim().replace(/[%_\\]/g, (c: string) => `\\${c}`))
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) return JSON.stringify({ success: false, error: error.message });
      const rc = data?.research_data?.rankingContent;
      if (!data || !rc) {
        return JSON.stringify({
          success: false,
          error: `No research has read the ranking pages for "${keyword}" yet. Run seo_research_keyword first; it reads them and this tool then reports their ranges at no extra cost.`,
        });
      }
      const g = rc.guidelines ?? null;
      onChunk?.({
        type: 'seo_serp_content_card',
        keyword: data.target_keyword,
        researched_at: data.created_at,
        research_id: data.id,
        read: rc.read, failed: rc.failed, note: rc.note,
        guidelines: g,
        common: (rc.common ?? []).slice(0, 15),
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true,
        keyword: data.target_keyword,
        researched_at: data.created_at,
        pages_read: rc.read,
        note: rc.note,
        word_count: g?.wordCount ?? null,
        headings: g?.headings ?? null,
        images: g?.images ?? null,
        tables: g?.tables ?? null,
        top_terms: (g?.terms ?? []).slice(0, 20),
        questions: (g?.questions ?? []).slice(0, 15),
        common_sections: (rc.common ?? []).slice(0, 15).map((c: any) => `${c.label} (${c.pages} of ${rc.read})`),
        ...(g ? {} : { guidelines_note: 'This research predates the ranges; run the research again to get them.' }),
      });
    },
    {
      name: 'seo_serp_content_analysis',
      description: 'What the pages that rank for a keyword actually look like: word count, headings, images and tables as min–median–max ranges, the terms most of them use, the questions they answer and the sections most of them share. Read from the most recent keyword research, so it costs nothing; when no research has read the pages, it says so.',
      schema: z.object({
        keyword: z.string().describe('The keyword whose ranking pages to describe, as researched.'),
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
// Own rankings — the workspace's rank tracker + Search Console, FIRST-PARTY
// ─────────────────────────────────────────────────────────────────────────────

/** One keyword's daily rank history folded to a summary plus its last 7 days. */
function summarizeKeywordHistory(k: any) {
  const byDay = new Map<string, any>();
  for (const d of Array.isArray(k?.days) ? k.days : []) {
    const day = String(d?.date ?? '').slice(0, 10);
    if (day && !byDay.has(day)) byDay.set(day, d);
  }
  const days = [...byDay.entries()].map(([date, d]) => ({
    date, position: d.position ?? null, url: d.url ?? null, error: d.error ?? null,
    rechecked: d.rechecked ?? null, recheck_best_position: d.recheck_best_position ?? null,
  }));
  const ranked = days.filter((d) => !d.error && d.position != null);
  const positions = ranked.map((d) => Number(d.position));
  return {
    keyword: k?.keyword, device: k?.device ?? null, country_code: k?.country_code ?? null,
    days_checked: days.length,
    first_position: ranked[0]?.position ?? null,
    last_position: ranked[ranked.length - 1]?.position ?? null,
    best_position: positions.length ? Math.min(...positions) : null,
    worst_position: positions.length ? Math.max(...positions) : null,
    days_out_of_top_100: days.filter((d) => !d.error && d.position == null).length,
    days_with_errors: days.filter((d) => d.error).length,
    pages_that_ranked: [...new Set(ranked.map((d) => d.url).filter(Boolean))].slice(0, 5),
    search_console: k?.search_console ?? null,
    last_7_days: days.slice(-7),
  };
}

/**
 * "Which keywords do we rank for?" answered from what the platform already MEASURES for the
 * connected website, rather than from a third-party index.
 */
export const createSEOMyRankingsTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ website_id, days, keywords }) => {
      if (!ctx?.supabase || !ctx?.workspaceId) {
        return JSON.stringify({ success: false, error: 'No workspace context — reading your own rankings needs a signed-in workspace.' });
      }
      let site: ResolvedWebsite | null = ctx.defaultWebsite ?? null;
      // Scoped to the caller's workspace inside resolveWebsite: another tenant's id resolves to null.
      if (website_id) site = await resolveWebsite(ctx.supabase, { workspaceId: ctx.workspaceId, explicitWebsiteId: website_id });
      if (!site) {
        return JSON.stringify({ success: false, error: 'No connected website. Ask the user to connect one under Profile → Websites — the rank tracker and Search Console both hang off it.' });
      }
      const windowDays = Math.min(Math.max(Math.trunc(days ?? 28), 7), 180);
      onChunk?.({ type: 'tool_progress', status: `Reading the rank tracker and Search Console for ${site.domain}…`, timestamp: Date.now() });

      const wanted = (keywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 20);
      const wantedLc = wanted.map((w) => w.toLowerCase());
      const isWantedKeyword = (kw: unknown) => wantedLc.includes(String(kw || '').trim().toLowerCase());
      // Whole words only: "tile" must not pull in "textile".
      const wantedRe = wantedLc.map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u'));
      const isWantedQuery = (q: unknown) => {
        const s = String(q || '').trim().toLowerCase();
        return wantedRe.some((re) => re.test(s));
      };
      const [rankRes, gscRes, connRes, histRes] = await Promise.all([
        ctx.supabase.rpc('get_website_rank_summary', { p_website_id: site.id, p_days: windowDays }),
        ctx.supabase.rpc('get_gsc_summary', { p_website_id: site.id, p_days: windowDays }),
        ctx.supabase.from('website_gsc_connections').select('is_active, last_sync_at, last_sync_error').eq('website_id', site.id).maybeSingle(),
        wanted.length
          ? ctx.supabase.rpc('get_keyword_rank_history', { p_website_id: site.id, p_keywords: wanted, p_days: windowDays })
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (rankRes.error) return JSON.stringify({ success: false, error: `rank tracker: ${rankRes.error.message}` });
      if (gscRes.error) return JSON.stringify({ success: false, error: `search console: ${gscRes.error.message}` });
      if (histRes.error) return JSON.stringify({ success: false, error: `keyword history: ${histRes.error.message}` });

      const rank = rankRes.data || { status: 'not_collected', tracked: 0 };
      const gsc = gscRes.data || { status: 'not_collected', totals: null, top_queries: [] };
      const conn = connRes?.data || null;
      const connected = !!conn?.is_active;
      const summary = rank.summary || {};
      const rows: any[] = Array.isArray(rank.keywords) ? rank.keywords : [];
      const scopedRows = wanted.length ? rows.filter((k: any) => isWantedKeyword(k.keyword)) : rows;
      const ranking = scopedRows.filter((k: any) => k.found && !k.error && k.position != null);
      const allQueries: any[] = Array.isArray(gsc.top_queries) ? gsc.top_queries : [];
      const queries = wanted.length ? allQueries.filter((q: any) => isWantedQuery(q.query)) : allQueries;
      const trackedSet = new Set(rows.map((k: any) => String(k.keyword || '').trim().toLowerCase()));
      const untracked = queries.filter((q: any) => Number(q.impressions) >= 5 && !trackedSet.has(String(q.query || '').trim().toLowerCase()));
      const gscStatus = connected ? gsc.status : 'not_connected';

      onChunk?.({
        type: 'seo_my_rankings_card',
        website: site.domain, days: windowDays,
        tracker: {
          status: rank.status, note: rank.note ?? null, tracked: rank.tracked ?? 0, summary,
          // Series and SERP-feature arrays stay out of the card: 129 keywords × 28 points is
          // weight the chat message store carries forever and the card never reads.
          // Asked about named keywords → the card is about those, not all 130.
          keywords: scopedRows.map((k: any) => ({
            keyword: k.keyword, position: k.position, previous: k.previous, change: k.change,
            found: k.found, entered: k.entered, lost: k.lost, url: k.url, error: k.error,
            search_volume: k.search_volume, captured_at: k.captured_at, tags: k.tags,
          })),
        },
        gsc: {
          connected, status: gscStatus,
          last_sync_at: conn?.last_sync_at ?? null, sync_error: conn?.last_sync_error ?? null,
          totals: gsc.totals ?? null, top_queries: queries.slice(0, 25),
        },
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        website: site.domain,
        window_days: windowDays,
        rank_tracker: {
          status: rank.status,
          note: rank.note ?? null,
          tracked: rank.tracked ?? 0,
          checked_at: summary.captured_at ?? null,
          ...(wanted.length ? {
            counts_scope: 'The ranking / not_ranking / failed / top_10 / avg_position figures are for ALL tracked keywords, not only the ones asked about.',
            not_tracked: wanted.filter((w) => !trackedSet.has(w.toLowerCase())),
          } : {}),
          ranking: summary.ranking ?? 0,
          not_ranking: summary.not_ranking ?? 0,
          failed: summary.failed ?? 0,
          top_10: (summary.distribution?.top_3 ?? 0) + (summary.distribution?.top_10 ?? 0),
          avg_position: summary.avg_position ?? null,
          ranking_keywords: ranking.slice(0, 30).map((k: any) => ({
            keyword: k.keyword, position: k.position, previous: k.previous ?? null, change: k.change ?? null,
            url: k.url, volume: k.search_volume ?? null, tags: k.tags ?? [],
          })),
          entered: scopedRows.filter((k: any) => k.entered).map((k: any) => k.keyword).slice(0, 15),
          lost: scopedRows.filter((k: any) => k.lost).map((k: any) => k.keyword).slice(0, 15),
        },
        search_console: {
          connected,
          status: gscStatus,
          last_sync_at: conn?.last_sync_at ?? null,
          sync_error: conn?.last_sync_error ?? null,
          totals: gsc.totals ?? null,
          top_queries: queries.slice(0, 25).map((q: any) => ({ query: q.query, position: q.position, impressions: q.impressions, clicks: q.clicks })),
          queries_with_demand_not_tracked: untracked.slice(0, 10).map((q: any) => ({ query: q.query, position: q.position, impressions: q.impressions })),
        },
        ...(wanted.length ? {
          keyword_history: (histRes.data?.keywords ?? []).map(summarizeKeywordHistory),
          keyword_history_guidance: 'One entry per keyword: first/last/best/worst position over the window, days_out_of_top_100, days_with_errors, the pages that ranked, and last_7_days (one row per day). position is that day\'s FIRST read; null with no error = not in the top 100, an error = unknown. Each daily read is a single sample, and Google can return a different page for the same query seconds later, so a keyword that alternates in and out is volatile, not lost. Treat a drop as real only when it persists over several days, or when rechecked is true and recheck_best_position is also outside the top 10. Compare with search_console.avg_position, which averages every real impression.',
        } : {}),
        guidance: 'These are measurements, not estimates: the rank tracker is a live Google check of the keywords this workspace chose to track, and Search Console is what Google reports having shown. Answer from them. A third-party index (seo_ranked_keywords, seo_domain_snapshot) is refreshed weeks apart and routinely misses a site\'s own brand rank — never let it override these, and if you cite it, give its SERP date. A status of not_connected / not_collected is a fact to report, not a zero.',
      });
    },
    {
      name: 'seo_my_rankings',
      description: 'The workspace\'s OWN website: which keywords it ranks for and where, from FIRST-PARTY data — the platform\'s rank tracker (a live Google check of the keywords this workspace chose to follow, run daily) and Google Search Console (what Google reports having shown, with impressions and clicks). Use this FIRST for any question about our own site — "what do we rank for", "are we on page one", "how is the site doing" — before any third-party index. Free. Defaults to the connected website when website_id is omitted.',
      schema: z.object({
        website_id: z.string().optional().describe('Connected website id. Omit to use the workspace default.'),
        days: z.number().int().min(7).max(180).optional().describe('Search Console look-back and rank-history window in days, default 28.'),
        keywords: z.array(z.string()).max(20).optional().describe('Tracked keywords to return day-by-day position history for (with the page that ranked and Search Console totals). Use when asked why specific keywords moved.'),
      }),
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Own-site report — every derived website read the platform holds, behind ONE tool
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The dozen verdicts the Websites dashboard derives in SQL, behind one tool. Until 2026-09-05
 * none was exposed, so "is our site healthy" bought a third-party crawl instead.
 */
const SITE_REPORT_DEFAULT_DAYS: Record<string, number> = {
  search_metrics: 180, domain_intel: 180, ai_visibility: 90, ai_answers: 90,
  ai_citations: 90, ai_citability: 90, ai_corpus: 90,
  cannibalisation: 90, competitors: 365, analytics: 28, page_queries: 90, query_pages: 28,
};

/** Trim a jsonb payload so a 129-row series does not become the whole context window. */
function compactJson(value: any, depth = 0, maxRows = 20, maxChars = 300): any {
  if (depth > 5) return '[…]';
  if (Array.isArray(value)) {
    const out = value.slice(0, maxRows).map((v) => compactJson(v, depth + 1, maxRows, maxChars));
    if (value.length > maxRows) out.push({ _truncated: `${value.length - maxRows} more rows` });
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = compactJson(v, depth + 1, maxRows, maxChars);
    return out;
  }
  if (typeof value === 'string' && value.length > maxChars) return value.slice(0, maxChars) + '…';
  return value;
}

const SITE_REPORT_MAX_CHARS = 15000;

function boundedReport(data: any): { data: any; truncated?: string } {
  const compact = compactJson(data);
  if (JSON.stringify(compact ?? null).length <= SITE_REPORT_MAX_CHARS) return { data: compact };
  return {
    data: compactJson(data, 0, 5, 200),
    truncated: 'This report was shortened to fit: lists cut to their first 5 rows and long text to 200 characters. Ask for a narrower report (a page, a query, a shorter window) for the full rows.',
  };
}

const SITE_REPORT_LIST_KEYS = ['items', 'issue_groups', 'issues', 'top_keywords', 'questions', 'competitors', 'channels', 'prompts', 'models', 'queries', 'subjects', 'trend', 'toolkit_runs', 'articles'];
const SITE_REPORT_LABEL_KEYS = ['query', 'keyword', 'title', 'name', 'label', 'question', 'competitor', 'domain', 'issue', 'issue_type', 'type', 'channel', 'model', 'page', 'url', 'date', 'kind', 'prompt'];
const SITE_REPORT_VALUE_KEYS = ['position', 'count', 'impressions', 'clicks', 'score', 'share', 'mentions', 'pages', 'total', 'delta', 'value', 'v', 'organic_traffic', 'severity', 'rank'];

/**
 * A `public.seo_metric` struct — a value PLUS the verdict on it. Flattened into scalars it
 * became four nameless rows ("metrics organic traffic delta pct 1335.5") minus the `status`.
 */
function isSeoMetric(v: any): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && 'status' in v && 'value' in v && 'previous' in v && 'delta' in v;
}

/** The struct with an EMPTY series: 129 points is weight the card never reads. */
function trimMetric(m: any) {
  return {
    value: m.value ?? null, previous: m.previous ?? null,
    delta: m.delta ?? null, delta_pct: m.delta_pct ?? null,
    status: m.status ?? 'not_collected', note: m.note ?? null, series: [],
  };
}

/**
 * Card projection: metric structs kept whole, remaining scalars (one level of nesting flattened)
 * as stats, the first list of objects as rows. Generic on purpose — eleven reports, one renderer
 * — and honest: it shows what the RPC returned, it never computes a number of its own.
 */
function siteReportCardProjection(data: any): {
  stats: Array<{ label: string; value: string }>;
  items: Array<{ left: string; right?: string; sub?: string; href?: string }>;
  metrics: Array<{ key: string; metric: Record<string, unknown> }>;
  positions: any;
} {
  const stats: Array<{ label: string; value: string }> = [];
  const items: Array<{ left: string; right?: string; sub?: string; href?: string }> = [];
  const metrics: Array<{ key: string; metric: Record<string, unknown> }> = [];
  const skip = /(^id$|_id$|url|^task|^error$|^note$|^status$|_at$)/;
  /** How the subject is SET UP, which is never a finding. */
  const SUBJECT_KEYS = new Set(['website', 'site', 'domain_record']);
  const CONFIG_KEYS = new Set(['is_default', 'is_active', 'max_pages', 'display_name', 'name', 'slug']);
  const scalar = (v: any) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40);
  const fmt = (v: any) => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { stats, items, metrics, positions: null };

  // `metrics` on the search/GSC/Analytics reports, `scores` on health. Collected first so
  // the scalar walk below never sees them.
  const metricGroups = new Set<string>();
  for (const group of ['metrics', 'scores']) {
    const g = data[group];
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    for (const [k, v] of Object.entries(g)) {
      if (!isSeoMetric(v)) continue;
      metrics.push({ key: k, metric: trimMetric(v) });
      metricGroups.add(group);
    }
  }
  for (const [k, v] of Object.entries(data)) if (isSeoMetric(v)) metrics.push({ key: k, metric: trimMetric(v) });
  // Buckets and movement, already labelled by the RPC — not "positions movement lost 0".
  const positions = data.positions && typeof data.positions === 'object' && Array.isArray(data.positions.buckets)
    ? data.positions : null;

  /**
   * TWO levels, not one: at one level `articles: { total, by_status: {...} }` rendered
   * "articles total 2" and dropped the breakdown, which is the half a person asks for.
   */
  const push = (label: string, v: unknown) => {
    if (stats.length >= 12) return;
    stats.push({ label: label.replace(/_/g, ' '), value: fmt(v) });
  };
  const walk = (obj: Record<string, unknown>, prefix: string, depth: number, drop?: Set<string>) => {
    for (const [k, v] of Object.entries(obj)) {
      if (stats.length >= 12) return;
      if (skip.test(k) || drop?.has(k)) continue;
      const label = prefix ? `${prefix} ${k}` : k;
      if (scalar(v)) push(label, v);
      else if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
        walk(v as Record<string, unknown>, label, depth + 1, drop);
      }
    }
  };

  for (const [k, v] of Object.entries(data)) {
    if (stats.length >= 12) break;
    if (skip.test(k) || metricGroups.has(k) || isSeoMetric(v)) continue;
    if (positions && k === 'positions') continue;
    if (scalar(v)) push(k, v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      walk(v as Record<string, unknown>, k, 1, SUBJECT_KEYS.has(k) ? CONFIG_KEYS : undefined);
    }
  }

  const listKey = SITE_REPORT_LIST_KEYS.find((k) => Array.isArray(data[k]) && data[k].length > 0)
    ?? Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length > 0);
  const list: any[] = listKey ? data[listKey] : [];
  for (const row of list.slice(0, 12)) {
    if (!row || typeof row !== 'object') { items.push({ left: String(row) }); continue; }
    const labelKey = SITE_REPORT_LABEL_KEYS.find((k) => typeof row[k] === 'string' && row[k]);
    const valueKey = SITE_REPORT_VALUE_KEYS.find((k) => typeof row[k] === 'number');
    const rest = Object.entries(row)
      .filter(([k, v]) => k !== labelKey && k !== valueKey && scalar(v) && !skip.test(k))
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${fmt(v)}`);
    items.push({
      left: labelKey ? String(row[labelKey]) : JSON.stringify(row).slice(0, 80),
      right: valueKey ? `${valueKey.replace(/_/g, ' ')} ${fmt(row[valueKey])}` : undefined,
      sub: rest.length ? rest.join(' · ') : undefined,
      href: typeof row.url === 'string' && /^https?:/.test(row.url) ? row.url : undefined,
    });
  }
  return { stats, items, metrics, positions };
}

async function readSiteReport(
  supabase: any, siteId: string, kind: string, days: number, page?: string, metric?: string,
  query?: string, groupBy?: string,
): Promise<{ data: any; error?: string }> {
  // Named `rpc` so `scripts/audit-agent-data-coverage.mjs` sees these reads the same way it sees
  // a direct `.rpc('…')` — the coverage baseline is scanned from source.
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  try {
    switch (kind) {
      case 'overview':
        return { data: await rpc('get_website_seo_overview', { p_website_id: siteId }) };
      case 'health': {
        const [summary, latest] = await Promise.all([
          rpc('seo_website_health_summary', { p_website_id: siteId }),
          rpc('get_website_health', { p_website_id: siteId }),
        ]);
        return {
          data: {
            ...(summary || {}),
            latest_audit: latest ? {
              url: latest.url, audited_at: latest.created_at,
              scores: { performance: latest.perf_score, seo: latest.seo_score, accessibility: latest.a11y_score, best_practices: latest.bp_score },
              issues: latest.issues ?? [],
            } : null,
          },
        };
      }
      case 'crawl':
        return { data: await rpc('get_website_crawl_report', { p_website_id: siteId }) };
      case 'search_metrics':
        return { data: await rpc('get_website_search_metrics', { p_website_id: siteId, p_days: days }) };
      case 'domain_intel':
        return { data: await rpc('get_website_domain_intel', { p_website_id: siteId, p_days: days }) };
      case 'ai_visibility':
        return { data: await rpc('get_website_ai_visibility', { p_website_id: siteId, p_days: days }) };
      case 'ai_answers':
        return { data: await rpc('get_website_ai_answers', { p_website_id: siteId, p_days: days }) };
      case 'ai_citations':
        return { data: await rpc('get_website_ai_citation_report', { p_website_id: siteId, p_days: days }) };
      case 'ai_citability':
        return { data: await rpc('get_website_citability_report', { p_website_id: siteId, p_days: days }) };
      case 'ai_corpus':
        return { data: await rpc('get_website_llm_mentions', { p_website_id: siteId, p_days: days }) };
      case 'cannibalisation':
        return { data: await rpc('get_website_cannibalisation', { p_website_id: siteId, p_days: days, p_min_impressions: 10 }) };
      case 'competitors':
        return { data: await rpc('get_website_competitor_series', { p_website_id: siteId, p_days: days, p_metric: metric || 'organic_traffic' }) };
      case 'analytics':
        return { data: await rpc('seo_website_ga_summary', { p_website_id: siteId, p_days: days }) };
      case 'page_queries': {
        if (!page) return { data: null, error: 'page_queries needs the page URL (page).' };
        const rows = await rpc('get_page_gsc_queries', { p_website_id: siteId, p_page: page, p_days: days });
        const list = Array.isArray(rows) ? rows : [];
        return { data: { page, window_days: days, status: list.length ? 'ok' : 'no_data', queries: list } };
      }
      case 'query_pages':
        return {
          data: await rpc('get_gsc_query_page_rows', {
            p_website_id: siteId, p_days: Math.min(days, 180), p_group_by: groupBy ?? (page ? 'query' : 'page'),
            p_page: page ?? null, p_query: query ?? null, p_search: null, p_limit: 200, p_country: null, p_device: null,
          }),
        };
      default:
        return { data: null, error: `unknown report kind "${kind}"` };
    }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export const createSEOSiteReportTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ kind, website_id, days, page, metric, query, group_by }) => {
      if (!ctx?.supabase || !ctx?.workspaceId) {
        return JSON.stringify({ success: false, error: 'No workspace context — a site report needs a signed-in workspace.' });
      }
      let site: ResolvedWebsite | null = ctx.defaultWebsite ?? null;
      if (website_id) site = await resolveWebsite(ctx.supabase, { workspaceId: ctx.workspaceId, explicitWebsiteId: website_id });
      if (!site) {
        return JSON.stringify({ success: false, error: 'No connected website. Ask the user to connect one under Profile → Websites — every site report hangs off it.' });
      }
      const windowDays = Math.min(Math.max(Math.trunc(days ?? SITE_REPORT_DEFAULT_DAYS[kind] ?? 90), 7), 365);
      onChunk?.({ type: 'tool_progress', status: `Reading the ${kind.replace(/_/g, ' ')} report for ${site.domain}…`, timestamp: Date.now() });

      const r = await readSiteReport(ctx.supabase, site.id, kind, windowDays, page, metric, query, group_by);
      if (r.error) return JSON.stringify({ success: false, error: r.error });
      const data = r.data;
      const status = typeof data?.status === 'string' ? data.status : null;
      const note = typeof data?.note === 'string' ? data.note : null;
      const { stats, items, metrics, positions } = siteReportCardProjection(data);

      onChunk?.({
        type: 'seo_site_report_card',
        kind, website: site.domain, days: windowDays, status, note,
        stats, items, metrics, positions, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true,
        website: site.domain,
        kind,
        window_days: windowDays,
        status,
        note,
        ...boundedReport(data),
        guidance: status && status !== 'ok'
          ? `The source reports status "${status}": say that in those words — it is a fact about the collector, not a zero.`
          : 'First-party measurement of the workspace\'s own site. Quote the figures with the dates they carry; nothing here is an estimate.',
      });
    },
    {
      name: 'seo_site_report',
      description: 'A report on the workspace\'s OWN connected website from what the platform already measures — free, first-party, no upstream call. kind: overview (site, tracked domains, research, articles at a glance) · health (latest Lighthouse/on-page audit: scores + issues) · crawl (last site crawl: pages, issues by severity, issue groups) · search_metrics (Search Console + tracked-domain metrics with verdicts) · domain_intel (the weekly DataForSEO snapshot of the site itself: rank, keywords, backlinks, trend) · ai_visibility (how often ChatGPT/Gemini/Claude probes mention the site, by model and prompt, with competitors) · ai_citations (the citation half: per-assistant citation rate and mention rate each with a verdict on whether the figure is real, plus who is CITED and who is NAMED instead of us in the answers that left us out - an assistant that returned no sources reports citation as not_collected, never 0%) · ai_citability (for each question we lost, the page of ours that should have answered it, scored on eight extraction dimensions, with the specific fixes) · ai_corpus (the DataForSEO index of real AI answers: how often the domain is cited, and which domains, pages and brands lead the market - a SEPARATE sample from our own probes, never merged, and ChatGPT coverage there is United States only) · ai_answers (what each assistant answered each question) · cannibalisation (queries where two of our pages compete) · competitors (tracked competitors\' series for a metric) · analytics (Google Analytics summary) · page_queries (Search Console queries for ONE page — needs page) · query_pages (the query × page drill-down within the window: group_by query or page, filtered to one page and/or one query — "which queries bring traffic to this page", "which of our pages rank for this query"). Use this before any paid crawl or third-party lookup when the question is about our own site. Defaults to the connected website.',
      schema: z.object({
        kind: z.enum(['overview', 'health', 'crawl', 'search_metrics', 'domain_intel', 'ai_visibility', 'ai_citations', 'ai_citability', 'ai_corpus', 'ai_answers', 'cannibalisation', 'competitors', 'analytics', 'page_queries', 'query_pages'])
          .describe('Which report to read.'),
        website_id: z.string().optional().describe('Connected website id. Omit to use the workspace default.'),
        days: z.number().int().min(7).max(365).optional().describe('Look-back window in days. Defaults per report (28 analytics, 90 AI/cannibalisation, 180 search/domain, 365 competitors).'),
        page: z.string().optional().describe('page_queries / query_pages: the page URL whose Search Console queries to list.'),
        query: z.string().optional().describe('query_pages only: limit to one search query.'),
        group_by: z.enum(['query', 'page']).optional().describe('query_pages only: one row per query (default when a page is given) or per page.'),
        metric: z.string().optional().describe('competitors only: which metric series to read, default organic_traffic.'),
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
      const cardItems = items.map((i: any) => {
        const kd = i.keyword_data || i;
        return {
          keyword: kd.keyword ?? i.keyword,
          keyword_data: {
            keyword: kd.keyword ?? i.keyword,
            keyword_info: {
              search_volume: kd.keyword_info?.search_volume ?? i.search_volume ?? null,
              cpc: kd.keyword_info?.cpc ?? null,
              competition: kd.keyword_info?.competition ?? null,
            },
            keyword_properties: { keyword_difficulty: kd.keyword_properties?.keyword_difficulty ?? null },
          },
        };
      });
      onChunk?.({
        type: 'seo_keywords_card',
        seed: keyword, items: cardItems, source: 'suggestions',
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
        items: items.map((it: any) => ({
          type: it.type, rank_absolute: it.rank_absolute ?? null, domain: it.domain ?? null, url: it.url ?? null,
        })),
        types_summary: byType, timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, keyword, item_count: items.length, types: byType,
        _untrusted: UNTRUSTED_FIELDS_NOTE,
        top_organic: items.filter((it: any) => it.type === 'organic').slice(0, 10).map((it: any) => ({
          rank: it.rank_absolute ?? it.rank_group, domain: it.domain, title: typeof it.title === 'string' ? it.title.slice(0, 120) : null, url: it.url,
        })),
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

const LH_UNSCORED_MODES = new Set(['notApplicable', 'informative', 'manual', 'error']);

/** Lighthouse audits scoring under 0.9, by title. */
function failedLighthouseAudits(lh: any, max = 25): string[] {
  const audits = lh?.audits && typeof lh.audits === 'object' ? Object.values(lh.audits) : [];
  return (audits as any[])
    .filter((a) => a && typeof a.score === 'number' && a.score < 0.9 && !LH_UNSCORED_MODES.has(a.scoreDisplayMode))
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map((a) => String(a.title ?? a.id ?? ''));
}

/** Only what the URL-audit card reads: category scores, failed audits, page meta + checks. */
function projectUrlAuditSections(sections: any) {
  const lh = sections?.lighthouse?.items?.[0];
  const ip = sections?.instant_page?.items?.[0];
  const out: Record<string, unknown> = {};
  if (lh) {
    const categories: Record<string, { score: number | null }> = {};
    for (const [k, c] of Object.entries(lh.categories || {})) categories[k] = { score: (c as any)?.score ?? null };
    out.lighthouse = { items: [{ categories, failed_audits: failedLighthouseAudits(lh) }] };
  }
  if (ip) {
    out.instant_page = {
      items: [{
        url: ip.url ?? null, status_code: ip.status_code ?? null,
        meta: ip.meta ? {
          title: ip.meta.title ?? null,
          internal_links_count: ip.meta.internal_links_count ?? null,
          external_links_count: ip.meta.external_links_count ?? null,
          images_count: ip.meta.images_count ?? null,
        } : null,
        page_metrics: ip.page_metrics ? {
          onpage_score: { value: ip.page_metrics.onpage_score?.value ?? ip.onpage_score ?? null },
          checks: ip.page_metrics.checks ?? null,
        } : null,
        checks: ip.checks ?? null,
      }],
    };
  }
  return out;
}

export const createSEOAuditUrlTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: SeoWebsiteCtx,
) => {
  return tool(
    async ({ url, for_mobile }) => {
      // #352 A19. `url` is a model argument and `quick-page` runs a Lighthouse pass on OUR
      // MIVAA host — so an internal address here is a fetch from our own infrastructure, not
      // a vendor's. The audit rated this Low "unless MIVAA's quick-page runs a local
      // browser/fetch on our infrastructure, which should be checked"; it does, so the guard
      // goes in. Cheap, and it belongs on the side that knows the URL came from a model.
      try {
        url = await assertSafeUrl(url, { allowSchemes: ['https:'] });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: `That URL cannot be audited: ${e instanceof Error ? e.message : 'invalid or non-public address'}`,
        });
      }
      onChunk?.({ type: 'tool_progress', status: `Auditing ${url}...`, timestamp: Date.now() });
      const r = await callSEOAgentRoute('onpage/quick-page', {
        url, for_mobile: !!for_mobile, attribution: { user_id: _userId },
      });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error });
      const page = ctx?.supabase ? await findWorkspacePage(ctx.supabase, ctx.workspaceId, url) : null;
      let contentScores: Record<string, unknown> | null = null;
      if (page) {
        await recordPageAudit(ctx!.supabase, page, _userId, r.data?.sections || {}, r.data?.errors);
        const { data: scored } = await ctx!.supabase.from('website_page_audits')
          .select('content_scores').eq('page_id', page.id).not('content_scores', 'is', null)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        contentScores = scored?.content_scores ?? null;
      }
      onChunk?.({
        type: 'seo_url_audit_card',
        url, for_mobile: !!for_mobile,
        sections: projectUrlAuditSections(r.data?.sections || {}),
        errors: r.data?.errors || {},
        saved_to_page: page ? { page_id: page.id, website_id: page.website_id } : null,
        content_scores: contentScores,
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
        failed_audits: failedLighthouseAudits(lh, 10),
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
      if (items.length === 0) {
        return emptyResult(
          { domain, country: country_code ?? null },
          'ranking data',
          'Normal for a new or low-traffic domain, or for a market it does not rank in. Try another country_code before concluding anything.',
        );
      }
      return JSON.stringify({ success: true, domain, data_status: 'ok', items: items.slice(0, 1) });
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
      // A Labs row is a crawl of that keyword's SERP on a DATE, not a live check. With the date
      // absent from this summary the model called a seven-week-old SERP "right now"
      // (conversation 9225f61f, 2026-09-05). The card shows the same date per row.
      const crawled = items
        .map((it: any) => String(it.ranked_serp_element?.last_updated_time || it.keyword_data?.serp_info?.last_updated_time || '').slice(0, 10))
        .filter(Boolean)
        .sort();
      return JSON.stringify({
        success: true, domain, count: items.length,
        serp_crawled_between: crawled.length ? [crawled[0], crawled[crawled.length - 1]] : null,
        note: 'DataForSEO Labs INDEX: each row is the date its SERP was last crawled, not a live check, and the index can miss recent movement and a site\'s own brand terms. Say the date when you cite a position. For the workspace\'s own connected website, seo_my_rankings reads the rank tracker and Search Console instead.',
        top: items.slice(0, 10).map((it: any) => ({
          keyword: it.keyword_data?.keyword,
          rank: it.ranked_serp_element?.serp_item?.rank_absolute,
          volume: it.keyword_data?.keyword_info?.search_volume,
          traffic: it.ranked_serp_element?.serp_item?.etv,
          serp_crawled: String(it.ranked_serp_element?.last_updated_time || '').slice(0, 10) || null,
        })),
      });
    },
    {
      name: 'seo_ranked_keywords',
      description: 'Keywords a domain ranks for in the DataForSEO Labs INDEX — rank position, volume, estimated traffic share, and the date each SERP was crawled (weeks apart; not a live check). Use for competitors and market sizing. For the workspace\'s OWN connected website use seo_my_rankings first: the index misses recent movement and often a site\'s own brand rank.',
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
      const rows = r.data?.items || [];
      const item = rows[0] || {};
      onChunk?.({
        type: 'seo_backlinks_summary_card',
        target, summary: item, timestamp: Date.now(),
      });
      // An empty row here is the LIVE case, not a theoretical one — the backlink
      // index answers "Ok, result_count: 0" for any domain it has never crawled.
      if (rows.length === 0 || item.backlinks == null) {
        return emptyResult(
          { target },
          'backlink summary',
          'The backlink index has no record of this domain — usual for a site with few or no inbound links. Say that, rather than reporting zero backlinks.',
        );
      }
      return JSON.stringify({
        success: true, target, data_status: 'ok',
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
        message: 'Crawl started — ask me for its status in a few minutes.',
        next_step: 'Call seo_site_crawl_status with this task_id when the user asks for the result; do not poll it now.',
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
        _untrusted: UNTRUSTED_FIELDS_NOTE,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          question: clip(i.question, 150), platform: i.platform ?? i.model_name ?? null,
          ai_search_volume: i.ai_search_volume ?? null,
          title: clip(i.title), domain: i.domain ?? null, url: i.url ?? null,
          sources: (Array.isArray(i.sources) ? i.sources : []).slice(0, 3).map((s: any) => s?.domain ?? s?.url ?? null),
        })),
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
        _untrusted: UNTRUSTED_FIELDS_NOTE, // video + channel titles are third-party (#352 A17)
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
      const graph = items.find((i: any) => i?.type === 'google_trends_graph') || items[0] || {};
      const points: any[] = Array.isArray(graph.data) ? graph.data : [];
      const terms: string[] = Array.isArray(graph.keywords) ? graph.keywords : keywords;
      const trend = terms.map((kw, idx) => {
        const series = points
          .map((p: any) => ({ date: p.date_from ?? p.date ?? null, v: Array.isArray(p.values) ? p.values[idx] : null }))
          .filter((p) => typeof p.v === 'number');
        const peak = series.reduce((m: any, p) => (!m || p.v > m.v ? p : m), null);
        return {
          keyword: kw,
          average: Array.isArray(graph.averages) ? graph.averages[idx] ?? null : null,
          first: series[0] ?? null, last: series[series.length - 1] ?? null, peak,
          last_points: series.slice(-6),
        };
      });
      return JSON.stringify({ success: true, count: items.length, points: points.length, trend, scale: 'Google Trends relative interest, 0-100 within this query' });
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
        brand_name,
        items: items.map((i: any) => ({ type: i.type, rank_absolute: i.rank_absolute ?? null, domain: i.domain ?? null })),
        kp_present: !!kp,
        ai_overview_present: !!aio,
        organic_top: organic.map((o: any) => ({ title: o.title ?? null, domain: o.domain ?? null, url: o.url ?? null })),
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
      return JSON.stringify({
        success: true, store, app_id, count: items.length,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          keyword: i.keyword_data?.keyword ?? i.keyword ?? null,
          volume: i.keyword_data?.keyword_info?.search_volume ?? null,
          rank: i.ranked_serp_element?.serp_item?.rank_absolute ?? null,
        })),
      });
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
      return JSON.stringify({
        success: true, keyword, count: items.length,
        _untrusted: UNTRUSTED_FIELDS_NOTE,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          title: clip(i.title) ?? clip(i.description, 80), author: i.author ?? null, url: i.url ?? null,
        })),
      });
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
      return JSON.stringify({
        success: true, keyword, count: items.length,
        _untrusted: UNTRUSTED_FIELDS_NOTE,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          title: clip(i.title), subreddit: i.subreddit ?? null, url: i.url ?? null,
        })),
      });
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
      return JSON.stringify({
        success: true, domain, count: items.length,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          subdomain: i.subdomain ?? null, keywords: i.metrics?.organic?.count ?? null, etv: i.metrics?.organic?.etv ?? null,
        })),
      });
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
      return JSON.stringify({
        success: true, domain, count: items.length,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          page: i.page_address ?? null, keywords: i.metrics?.organic?.count ?? null, etv: i.metrics?.organic?.etv ?? null,
        })),
      });
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
      const snapshots = items.map((s: any) => ({
        datetime: s.datetime ?? s.date ?? null,
        se_results_count: s.se_results_count ?? null,
        top: (Array.isArray(s.items) ? s.items : [])
          .filter((x: any) => x?.type === 'organic').slice(0, 10)
          .map((x: any) => ({ rank: x.rank_absolute ?? x.rank_group ?? null, domain: x.domain ?? null })),
      }));
      onChunk?.({ type: 'seo_historical_serps_card', keyword, items: snapshots, timestamp: Date.now() });
      return JSON.stringify({ success: true, keyword, snapshot_count: items.length, snapshots: snapshots.slice(0, 12) });
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
      return JSON.stringify({
        success: true, count: items.length,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({ keyword: i.keyword ?? null, ai_search_volume: i.ai_search_volume ?? null })),
      });
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
      return JSON.stringify({
        success: true, domain, count: items.length,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          category: i.category_name ?? i.name ?? null, keywords: i.metrics?.organic?.count ?? null, etv: i.metrics?.organic?.etv ?? null,
        })),
      });
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
        kind, items,
        cost_usd: r.data?.cost_usd, latency_ms: r.data?.latency_ms,
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true, kind, item_count: items.length,
        cost_usd: r.data?.cost_usd, sample: compactJson(items.slice(0, 3)),
      });
    },
    {
      name: 'seo_dataforseo_call',
      description: 'ESCAPE HATCH — call any DataForSEO endpoint by name when no specific tool fits. Valid kinds: serp_google_organic, serp_youtube_organic, labs_related_keywords, labs_keyword_overview, labs_subdomains, labs_relevant_pages, labs_historical_serps, labs_categories_for_domain, kw_google_trends_explore, kw_clickstream_search_volume, content_search, content_phrase_trends, domain_whois, domain_domains_by_technology, business_pinterest, business_reddit, business_listings_search, app_data_search, etc. AI Optimization (generative-engine visibility): ai_llm_response (ask an engine directly, web_search on), ai_llm_scraper (the real chatgpt.com/gemini surface), ai_llm_models, ai_keyword_search_volume (how often a term is asked of AI, not Google), and the LLM Mentions corpus — ai_llm_mentions_search, ai_llm_mentions_aggregated_metrics, ai_llm_mentions_multi_target_metrics, ai_llm_mentions_top_pages, ai_llm_mentions_top_domains, ai_llm_mentions_top_brands, ai_llm_mentions_top_brand_categories, ai_llm_mentions_historical, ai_llm_mentions_timeseries_delta, ai_llm_mentions_timeseries_new_lost (each takes lite:true for the cheaper counts-only tier). (full list at /docs/seo-agent-tools-reference.md). Pass params matching the underlying endpoint signature.',
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

const clip = (v: unknown, n = 120): string | null => clipText(v, n) ?? null;
const MODEL_ROWS = 15;

/** A DataForSEO Labs keyword item, flat or nested under keyword_data, as one small row. */
function kwRow(i: any) {
  const kd = i?.keyword_data ?? i ?? {};
  return {
    keyword: kd.keyword ?? i?.keyword ?? null,
    volume: kd.keyword_info?.search_volume ?? i?.search_volume ?? null,
    difficulty: kd.keyword_properties?.keyword_difficulty ?? i?.keyword_difficulty ?? null,
    intent: kd.search_intent_info?.main_intent ?? i?.search_intent_info?.main_intent ?? null,
    cpc: kd.keyword_info?.cpc ?? i?.cpc ?? null,
  };
}

const monthOf = (i: any): string | null =>
  i?.date ?? (i?.year != null && i?.month != null ? `${i.year}-${String(i.month).padStart(2, '0')}` : null);

/** CHECK_META in SEOGenericCard: these three are issues when FALSE, every other check when TRUE. */
const ONPAGE_ISSUE_WHEN_FALSE = new Set(['is_https', 'canonical', 'seo_friendly_url']);

function failedCheckNames(checks: any): string[] {
  if (!checks || typeof checks !== 'object') return [];
  return Object.entries(checks)
    .filter(([k, v]) => (ONPAGE_ISSUE_WHEN_FALSE.has(k) ? v === false : v === true))
    .map(([k]) => k)
    .slice(0, 20);
}

function onpageIssueRow(i: any) {
  const categories = i?.categories && typeof i.categories === 'object' ? i.categories : null;
  const scores: Record<string, number | null> = {};
  if (categories) for (const [k, c] of Object.entries(categories)) scores[k] = (c as any)?.score ?? null;
  return {
    url: i?.url ?? i?.page_address ?? i?.from_url ?? i?.finalUrl ?? i?.requestedUrl ?? null,
    to_url: i?.to_url ?? null,
    status_code: i?.status_code ?? null,
    title: clip(i?.meta?.title ?? i?.title),
    failed_checks: failedCheckNames(i?.checks ?? i?.page_metrics?.checks),
    onpage_score: i?.onpage_score ?? i?.page_metrics?.onpage_score?.value ?? null,
    ...(categories ? { lighthouse_scores: scores, failed_audits: failedLighthouseAudits(i, 5) } : {}),
    ...(Array.isArray(i?.pages) ? { pages: i.pages.length } : {}),
  };
}

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
      return JSON.stringify({ success: true, issue_type, count: items.length, sample: items.slice(0, 8).map(onpageIssueRow) });
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
      const point = (i: any) => i ? ({
        date: monthOf(i), referring_domains: i.referring_domains ?? null, backlinks: i.backlinks ?? null, rank: i.rank ?? null,
      }) : null;
      return JSON.stringify({
        success: true, target, points: items.length,
        first: point(items[0]), last: point(items[items.length - 1]),
        recent: items.slice(-12).map(point),
      });
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
      const point = (i: any) => {
        if (!i) return null;
        const m = i.metrics?.organic || i.organic || i;
        return { date: monthOf(i), keywords: m.count ?? null, etv: m.etv ?? null, traffic_value: m.estimated_paid_traffic_cost ?? null };
      };
      return JSON.stringify({
        success: true, domain, points: items.length,
        first: point(items[0]), last: point(items[items.length - 1]),
        recent: items.slice(-12).map(point),
      });
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
      return JSON.stringify({
        success: true, domain, count: items.length,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          ...kwRow(i),
          position: i?.ranked_serp_element?.serp_item?.rank_absolute ?? i?.rank_absolute ?? i?.position ?? null,
        })),
      });
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
      return JSON.stringify({ success: true, count: items.length, top: items.slice(0, 15).map(kwRow) });
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
      return JSON.stringify({ success: true, keyword, count: items.length, top: items.slice(0, MODEL_ROWS).map(kwRow) });
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
      const rankOf = (el: any) => el?.rank_absolute ?? el?.rank_group ?? null;
      return JSON.stringify({
        success: true, target1, target2, count: items.length,
        top: items.slice(0, MODEL_ROWS).map((i: any) => ({
          keyword: i?.keyword_data?.keyword ?? i?.keyword ?? null,
          volume: i?.keyword_data?.keyword_info?.search_volume ?? null,
          target1_position: rankOf(i.first_domain_serp_element),
          target2_position: rankOf(i.second_domain_serp_element),
        })),
      });
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
      const block: any = items.find((i: any) => i?.type === 'ai_overview') || items[0] || {};
      const refs: any[] = block.references || block.items || [];
      const text: string = block.text
        || (Array.isArray(block.items) ? block.items.map((x: any) => x?.text).filter(Boolean).join(' ') : '')
        || '';
      return JSON.stringify({
        success: true, keyword, present: !!text || refs.length > 0,
        _untrusted: UNTRUSTED_FIELDS_NOTE,
        answer_excerpt: clip(text, 600),
        cited_sources: refs.slice(0, MODEL_ROWS).map((r: any) => ({
          title: clip(r?.title), domain: r?.domain ?? null, url: r?.url ?? null,
        })),
      });
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
        _untrusted: UNTRUSTED_FIELDS_NOTE, // business names are third-party (#352 A17)
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
