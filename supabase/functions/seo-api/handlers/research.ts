/**
 * SEO Research Edge Function
 *
 * Performs keyword research using DataForSEO API.
 * Runs 6 parallel API calls: keyword expansion, related keywords,
 * bulk difficulty, PAA questions, SERP competitors, content analysis.
 *
 * Credits: a ceiling reserved up front, settled to the provider-reported DataForSEO cost plus
 * the SERP-signals call and the Firecrawl page reads, each priced in ai_model_pricing.
 */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { resolveAndAssertSeoEntitled, websiteWorkspaceFor } from './entitlement.ts';
import { DataForSEOClient } from '../../_shared/dataforseo-client.ts';
import type { KeywordResearchResult, SEOResearchRequest, SEOResearchResponse } from '../../_shared/seo-types.ts';
import { fetchOpportunitiesStateless } from '../../_shared/mention-opportunities-client.ts';
import { resolveWebsite } from '../../_shared/seo-website.ts';
import { resolveSecret } from '../../_shared/secrets.ts';
import { readRankingPages } from '../serp-content.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { DATAFORSEO_SERVICE } from '../../_shared/tools/dataforseo-spend-gate.ts';
import { logDataForSeoDirectSpend } from '../../_shared/tools/dataforseo-spend-log.ts';
import { refundStage, reserveStage, serviceCredits, settleStage, type StageWallet } from './stage-billing.ts';
import { countryForLocation } from './market.ts';
import { resolveSeoMarket } from '../../_shared/seo-market.ts';
import { guideQuery, readerQuestions } from './reader-questions.ts';
import { findExistingPage } from './existing-page.ts';

const SERP_SIGNALS_SERVICE = 'seo-serp-signals';
const FIRECRAWL_SERVICE = 'firecrawl-scrape';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
/**
 * DataForSEO credentials, resolved the way this platform resolves every admin-editable secret:
 * `resolveSecret` reads env FIRST and falls back to `platform_secrets`. Never `Deno.env.get`
 * alone.
 */
async function dataforseoCredentials(supabase: { from: (t: string) => any }): Promise<{ login: string; password: string }> {
  const [login, password] = await Promise.all([
    resolveSecret(supabase, 'DATAFORSEO_LOGIN'),
    resolveSecret(supabase, 'DATAFORSEO_PASSWORD'),
  ]);
  return { login: login.value ?? '', password: password.value ?? '' };
}

const READ_PAGES_LIMIT = 5;
const GUIDE_PAGES_LIMIT = 4;

/** Ceiling on provider-reported DataForSEO spend for one research run, in $0.001 units (measured ~135). */
const DATAFORSEO_CEILING_UNITS = 400;

/** Reserve for one research run: every service it may touch, at its ceiling. */
async function researchCeiling(supabase: DbClient, readPages: boolean): Promise<number> {
  const parts = await Promise.all([
    serviceCredits(supabase, DATAFORSEO_SERVICE, DATAFORSEO_CEILING_UNITS),
    serviceCredits(supabase, SERP_SIGNALS_SERVICE, 1),
    serviceCredits(supabase, FIRECRAWL_SERVICE, readPages ? READ_PAGES_LIMIT + GUIDE_PAGES_LIMIT : 0),
  ]);
  return parts.some((p) => p === null) ? 80 : Math.ceil(parts.reduce<number>((s, p) => s + (p ?? 0), 0));
}

const CACHE_DAYS = 30;

/** The newest research of the last 30 days for this keyword and market, complete enough to reuse. */
async function recentResearch(
  supabase: DbClient,
  opts: { workspaceId: string; keyword: string; locationCode: number; languageCode: string; needPages: boolean },
): Promise<{ id: string; research: KeywordResearchResult } | null> {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('seo_keyword_research')
    .select('id, research_data')
    .eq('workspace_id', opts.workspaceId)
    .ilike('target_keyword', opts.keyword.trim().replace(/[%_\\]/g, (c) => `\\${c}`))
    .eq('location_code', opts.locationCode).eq('language_code', opts.languageCode)
    .gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data?.research_data) return null;
  const research = data.research_data as KeywordResearchResult;
  if (opts.needPages && !((research.rankingContent?.read ?? 0) > 0)) return null;
  return { id: String(data.id), research };
}

export async function handleResearch(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await authenticate(req);
  if (!auth.success) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  // Service-role/secret callers authenticate with userId null and pass the acting user_id in the body.
  const userId = auth.userId ?? body.user_id;
  if (!userId) {
    return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  }

  // Declared OUTSIDE the try because the refund lives in the catch and needs the wallet.
  let workspaceId: string | null = null;
  let reserved = 0;
  let wallet: StageWallet | null = null;

  try {

    if (!body.topic || !body.target_keyword) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: topic, target_keyword' },
        400,
      );
    }

    const dfs = await dataforseoCredentials(supabase);
    if (!dfs.login || !dfs.password) {
      return jsonResponse(
        {
          success: false,
          error: 'DataForSEO credentials not configured for the edge runtime. Set '
            + 'DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Admin → Platform Secrets — the rows '
            + 'exist but hold no value — or in this function\'s own environment. Note the MIVAA '
            + 'host having them is not enough: this handler calls DataForSEO directly.',
        },
        500,
      );
    }


    // Opt OUT, not in: reading the competition is the default.
    const readPages = body.read_ranking_pages !== false;

    // Entitlement gate BEFORE the debit and the upstream calls (#212 + invariant 10); resolves the workspace.
    const siteWs = await websiteWorkspaceFor(supabase, userId, body.website_id);
    if (siteWs === null) return jsonResponse({ success: false, error: 'Website not found' }, 404);
    const { workspaceId: resolvedWs, response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId, siteWs);
    workspaceId = resolvedWs ?? null;
    if (entResponse) return entResponse;

    // No market named → the site's own (`website_ai_market`, then the business country); never a guessed default.
    let locationCode: number | null = body.location_code || null;
    let languageCode: string | null = body.language_code || null;
    if (!locationCode || !languageCode) {
      const site = await resolveWebsite(supabase, { workspaceId, explicitWebsiteId: body.website_id });
      const resolved = await resolveSeoMarket(supabase, { websiteId: site?.id ?? null, workspaceId });
      if (!resolved.ok) {
        return jsonResponse({ success: false, error: `No search market to research in: ${resolved.reason} Name a location_code and language_code for this request.` }, 422);
      }
      locationCode ||= resolved.market.location_code;
      languageCode ||= resolved.market.language_code;
      if (!locationCode) {
        return jsonResponse({ success: false, error: `No search location is mapped for ${resolved.market.country_code}. Name a location_code for this request.` }, 422);
      }
    }

    const reused = body.refresh === true || !workspaceId ? null : await recentResearch(supabase, {
      workspaceId, keyword: String(body.target_keyword), locationCode, languageCode, needPages: readPages,
    });
    if (reused) {
      const website = await resolveWebsite(supabase, { workspaceId, explicitWebsiteId: body.website_id });
      const ranking = await findExistingPage(supabase, {
        userId, workspaceId, websiteId: website?.id ?? null, keyword: String(body.target_keyword), searchConsoleOnly: true,
      });
      reused.research.existingPage = ranking ?? null;
      console.log(`[seo-research] reused research ${reused.id} for "${body.target_keyword}" (30-day cache)`);
      const cachedResponse: SEOResearchResponse = {
        success: true,
        data: { research_id: reused.id, research: reused.research, credits_used: 0, cached: true },
      };
      return jsonResponse(cachedResponse);
    }

    // Billed to the WORKSPACE: a ceiling now, settled below to what the providers actually cost.
    wallet = { userId, workspaceId, opType: 'seo_research' };
    const ceiling = await researchCeiling(supabase, readPages);
    const hold = await reserveStage(supabase, wallet, ceiling, `SEO keyword research: "${body.target_keyword}"`, {
      topic: body.topic, target_keyword: body.target_keyword, location_code: locationCode, read_ranking_pages: readPages,
    });
    if (!hold.ok) return jsonResponse({ success: false, error: hold.error }, 402);
    reserved = ceiling;

    console.log(`[seo-research] Starting research for "${body.target_keyword}" (user: ${userId})`);

    // DataForSEO research and MIVAA SERP signals (PAA, AI Overview, related searches) IN PARALLEL.
    const client = new DataForSEOClient(dfs.login, dfs.password);
    const countryCode = countryForLocation(locationCode);
    const guideForm = guideQuery(body.target_keyword, languageCode);
    const failedSources: NonNullable<KeywordResearchResult['failedSources']> = {};
    const failed = (key: keyof typeof failedSources, e: unknown) => {
      failedSources[key] = String((e as Error)?.message ?? e).slice(0, 300);
      console.warn(`[seo-research] ${key} unavailable: ${failedSources[key]}`);
    };
    if (!countryCode) failed('serp_signals', `no country is mapped for location ${locationCode}`);
    const [research, serpSignals, aiMode, guideSerp] = await Promise.all([
      client.researchKeyword(
        body.target_keyword,
        body.topic,
        locationCode,
        languageCode,
      ),
      countryCode
        ? fetchOpportunitiesStateless(supabase, {
          subjectLabel: body.target_keyword,
          workspaceId,
          languageCodes: [languageCode],
          countryCodes: [countryCode],
          limitPerType: 5,
        }).catch((e) => { failed('serp_signals', e); return null; })
        : Promise.resolve(null),
      client.aiModeAnswer(body.target_keyword, locationCode, languageCode)
        .catch((e) => { failed('ai_mode', e); return undefined; }),
      readPages
        ? client.serpOrganic(guideForm, locationCode, languageCode)
          .catch((e) => { failed('guide_serp', e); return [] as Awaited<ReturnType<typeof client.serpOrganic>>; })
        : Promise.resolve([] as Awaited<ReturnType<typeof client.serpOrganic>>),
    ]);

    await logDataForSeoDirectSpend(supabase, {
      userId, workspaceId, operation: 'seo_research', costUsd: client.spentUsd, ok: Object.keys(failedSources).length === 0,
      note: client.unpricedCalls > 0 ? 'a response carried no cost' : undefined,
    });
    research.aiModeAnswer = aiMode;
    if (Object.keys(failedSources).length) research.failedSources = failedSources;
    research.readerQuestions = readerQuestions(
      research.clusters.flatMap((c) => [c.primaryKeyword, ...c.secondaryKeywords]).filter(Boolean),
      languageCode,
    );

    if (serpSignals) {
      research.serpSignals = serpSignals;
      console.log(
        `[seo-research] enriched with ${serpSignals.opportunities.length} opportunities ` +
        `(AI Overview: ${serpSignals.aiOverviewText ? 'yes' : 'no'}, ` +
        `featured snippet: ${serpSignals.featuredSnippetTarget ? 'yes' : 'no'}, ` +
        `related searches: ${serpSignals.relatedSearches?.length ?? 0})`,
      );
    } else {
      console.log('[seo-research] opportunities enrichment unavailable — continuing baseline');
    }

    // Read the pages that actually rank. Failures are STATED, never dropped: a page that could not
    // be fetched stays in the list with its reason, so three reads never pass for a survey of ten.
    let pagesRead = 0;
    if (readPages) {
      const targets = research.serpInsights
        .filter((c) => !!c.url)
        .map((c) => ({ url: c.url, position: c.position }));
      const ranking = await readRankingPages(targets, { limit: READ_PAGES_LIMIT });
      research.rankingContent = ranking;
      pagesRead = ranking.read;

      const byUrl = new Map(ranking.pages.map((r) => [r.url, r]));
      for (const c of research.serpInsights) {
        const r = byUrl.get(c.url);
        if (r?.status !== 'read') continue;
        c.headings = r.headings;
        c.wordCount = r.wordCount ?? 0;
      }
      console.log(
        `[seo-research] ranking pages: ${ranking.read} read, ${ranking.failed} failed, ` +
        `${ranking.common.length} shared subtopics, median ${ranking.medianWordCount ?? 'n/a'} words`,
      );

      // Where the topic's own results are shops, its "how to choose" results are the guides readers learn from.
      const alreadyRead = new Set(targets.map((t) => t.url));
      const guideTargets = guideSerp.filter((c) => !!c.url && !alreadyRead.has(c.url)).map((c) => ({ url: c.url, position: c.position }));
      if (guideTargets.length) {
        const guides = await readRankingPages(guideTargets, { limit: GUIDE_PAGES_LIMIT });
        research.guideContent = { ...guides, query: guideForm };
        pagesRead += guides.read;
      }
    }

    // File under the connected website: explicit body.website_id, else the workspace default.
    const website = await resolveWebsite(supabase, { workspaceId, explicitWebsiteId: body.website_id });
    research.existingPage = await findExistingPage(supabase, {
      userId, workspaceId, websiteId: website?.id ?? null, keyword: String(body.target_keyword ?? ''),
    });

    // What this run consumed; a DataForSEO response with no cost keeps the ceiling.
    const spend = client.unpricedCalls > 0 ? [null] : await Promise.all([
      serviceCredits(supabase, DATAFORSEO_SERVICE, client.spentUsd * 1000),
      serviceCredits(supabase, SERP_SIGNALS_SERVICE, serpSignals ? 1 : 0),
      serviceCredits(supabase, FIRECRAWL_SERVICE, pagesRead),
    ]);
    const actualCredits = spend.some((c) => c === null) ? null : spend.reduce<number>((s, c) => s + (c ?? 0), 0);
    const creditCost = actualCredits ?? reserved;

    const { data: researchRow, error: insertError } = await supabase
      .from('seo_keyword_research')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        website_id: website?.id ?? null,
        topic: body.topic,
        target_keyword: body.target_keyword,
        location_code: locationCode,
        language_code: languageCode,
        research_data: research,
        top_keywords: research.recommendedSecondaries.slice(0, 20),
        serp_competitors: research.serpInsights,
        paa_questions: research.paaQuestions,
        total_keywords_found: research.clusters.reduce(
          (sum, c) => sum + 1 + c.secondaryKeywords.length + c.lsiKeywords.length,
          0,
        ),
        total_addressable_volume: research.totalAddressableVolume,
        credits_used: creditCost,
      })
      .select('id')
      .single();

    if (insertError || !researchRow?.id) {
      // A persist failure leaves nothing usable; the catch refunds and the caller retries.
      throw new Error(`Failed to persist research: ${insertError?.message ?? 'no row returned'}`);
    }

    await settleStage(supabase, wallet, reserved, actualCredits, {
      research_id: researchRow.id, dataforseo_usd: client.spentUsd, serp_signals: !!serpSignals, pages_read: pagesRead,
    });
    reserved = 0;
    console.log(`[seo-research] Complete. Research ID: ${researchRow?.id}, ${creditCost} credits`);

    const response: SEOResearchResponse = {
      success: true,
      data: {
        research_id: researchRow?.id || '',
        research,
        credits_used: creditCost,
      },
    };

    return jsonResponse(response);
  } catch (error: any) {
    console.error('[seo-research] Error:', error);

    if (wallet && reserved > 0) await refundStage(supabase, wallet, reserved, String(error?.message ?? error));

    return jsonResponse(
      { success: false, error: error.message || 'Research failed' },
      500,
    );
  }
}
