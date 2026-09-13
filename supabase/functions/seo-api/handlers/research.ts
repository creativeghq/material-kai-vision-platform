/**
 * SEO Research Edge Function
 *
 * Performs keyword research using DataForSEO API.
 * Runs 6 parallel API calls: keyword expansion, related keywords,
 * bulk difficulty, PAA questions, SERP competitors, content analysis.
 *
 * Credit cost: 18 credits, or 23 when it also reads the pages that actually rank.
 */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { DataForSEOClient } from '../../_shared/dataforseo-client.ts';
import type { SEOResearchRequest, SEOResearchResponse } from '../../_shared/seo-types.ts';
import { fetchOpportunitiesStateless } from '../../_shared/mention-opportunities-client.ts';
import { resolveWebsite } from '../../_shared/seo-website.ts';
import { resolveSecret } from '../../_shared/secrets.ts';
import { readRankingPages } from '../serp-content.ts';

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

const CREDIT_COST = 18;

/**
 * Reading the pages that actually rank costs a Firecrawl fetch each. Priced into the SAME debit
 * rather than a second one: a handler with two debits needs two refunds, and the refund path is
 * the one nobody exercises until it is wrong.
 */
const READ_PAGES_COST = 5;
const READ_PAGES_LIMIT = 5;


/** Map DataForSEO numeric location_code → ISO-3166 alpha-2 country code so
 * the mention-monitoring opportunities endpoint can pin the correct locale.
 * Mirrors the `_country_to_dfs_location` table in
 * `mention_opportunity_service.py`. Default = US. */
function dfsLocationToCountry(loc: number): string {
  const map: Record<number, string> = {
    2840: 'US', 2826: 'GB', 2276: 'DE', 2250: 'FR', 2380: 'IT', 2724: 'ES',
    2300: 'GR', 2528: 'NL', 2056: 'BE', 2040: 'AT', 2756: 'CH', 2620: 'PT',
    2372: 'IE', 2124: 'CA', 2036: 'AU', 2616: 'PL', 2752: 'SE', 2208: 'DK',
    2578: 'NO', 2246: 'FI', 2792: 'TR', 2100: 'BG', 2642: 'RO', 2196: 'CY',
  };
  return map[loc] || 'US';
}

export async function handleResearch(req: Request, body: any): Promise<Response> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Authenticate
  const auth = await authenticate(req);
  if (!auth.success) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  // Service-role/secret callers (e.g. agent-chat sending the service key) authenticate at
  // 'secret' level with auth.userId === null; they pass the acting user_id in the body.
  // User-JWT callers keep auth.userId. Accept either.
  const userId = auth.userId ?? body.user_id;
  if (!userId) {
    return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  }

  // Declared OUTSIDE the try because the refund lives in the catch: a refund that cannot see
  // which wallet was charged would hand the money back to the wrong one.
  let workspaceId: string | null = null;
  // Same reason, and the same trap: the refund lives in the catch. A cost decided inside the try
  // is out of scope exactly where the money has to be handed back.
  let creditCost = CREDIT_COST;

  try {

    if (!body.topic || !body.target_keyword) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: topic, target_keyword' },
        400,
      );
    }

    const dfs = await dataforseoCredentials(supabase);
    if (!dfs.login || !dfs.password) {
      // Say WHERE to put them. The old message was true and useless: the credentials WERE
      // configured, on the MIVAA host, and no reader of this error could have known that this
      // particular function looks somewhere else.
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

    const locationCode = body.location_code || 2840;
    const languageCode = body.language_code || 'en';

    // Opt OUT, not in: a plan written without reading the competition is the default this was
    // built to replace.
    const readPages = body.read_ranking_pages !== false;
    creditCost = CREDIT_COST + (readPages ? READ_PAGES_COST : 0);

    // Entitlement gate BEFORE the debit and the upstream calls (#212 + invariant 10).
    // Also resolves the workspace the research is filed under (was a late `.single()`
    // lookup, which errors → null for multi-workspace users — same bug pipeline.ts fixed).
    const { workspaceId: resolvedWs, response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId);
    workspaceId = resolvedWs ?? null;
    if (entResponse) return entResponse;

    // Billed to the WORKSPACE, not to whoever pressed the button.
    const { data: debitResult, error: debitError } = await supabase.rpc(
      'debit_credits',
      {
        p_user_id: userId,
        p_amount: creditCost,
        p_operation_type: 'seo_research',
        p_description: `SEO keyword research: "${body.target_keyword}"`,
        p_metadata: {
          topic: body.topic,
          target_keyword: body.target_keyword,
          location_code: locationCode,
          read_ranking_pages: readPages,
        },
        p_workspace_id: workspaceId,
      },
    );

    if (debitError || !debitResult?.[0]?.success) {
      const msg = debitResult?.[0]?.error_message || debitError?.message || 'Insufficient credits';
      return jsonResponse({ success: false, error: msg }, 402);
    }

    console.log(`[seo-research] Starting research for "${body.target_keyword}" (user: ${userId})`);

    // Run DataForSEO research + mention-monitoring opportunities IN PARALLEL.
    // The opportunities call hits MIVAA's /opportunities-stateless endpoint,
    // which fans out to DataForSEO SERP / Labs (PAA, AI Overview, featured
    // snippet, related searches, top organic, video / news / shopping
    // carousels, knowledge graph, paid bidders) on the SAME keyword.
    const client = new DataForSEOClient(dfs.login, dfs.password);
    const countryCode = dfsLocationToCountry(locationCode);
    const [research, serpSignals] = await Promise.all([
      client.researchKeyword(
        body.target_keyword,
        body.topic,
        locationCode,
        languageCode,
      ),
      fetchOpportunitiesStateless({
        subjectLabel: body.target_keyword,
        languageCodes: [languageCode],
        countryCodes: [countryCode],
        limitPerType: 5,
      }).catch((e) => {
        console.warn(`[seo-research] opportunities enrichment failed: ${(e as Error).message}`);
        return null;
      }),
    ]);

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

    // Read the pages that actually rank. Until this, `serpInsights[].headings` was `[]` with the
    // comment "Not available from SERP" and `contentGapOpportunities` was a list of competitor
    // TITLES — so the planner was told "here are the gaps" and handed ten page titles.
    //
    // Failures are STATED, never dropped: a page Firecrawl could not fetch stays in the list with
    // its reason, so nothing downstream can read three pages as a survey of ten.
    if (readPages) {
      const targets = research.serpInsights
        .filter((c) => !!c.url)
        .map((c) => ({ url: c.url, position: c.position }));
      const ranking = await readRankingPages(targets, { limit: READ_PAGES_LIMIT });
      research.rankingContent = ranking;

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
    }

    // File this research under a connected website — explicit body.website_id when the
    // agent picked one, else the workspace's default site (null when none connected).
    const website = await resolveWebsite(supabase, { workspaceId, explicitWebsiteId: body.website_id });

    // Persist to database
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
      // A persist failure leaves an empty research_id that the planner/pipeline can't dereference —
      // so the 18-credit charge would buy an unusable result. Throw into the catch below, which refunds
      // + returns 500 (the user retries) rather than silently charging for a broken result.
      throw new Error(`Failed to persist research: ${insertError?.message ?? 'no row returned'}`);
    }

    console.log(`[seo-research] Complete. Research ID: ${researchRow?.id}`);

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

    // Attempt credit refund on failure
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_operation_type: 'seo_research_refund',
        p_description: `Refund: SEO research failed`,
        p_metadata: { error: error.message },
        p_workspace_id: workspaceId,
      });
      console.log('[seo-research] Credits refunded');
    } catch (refundErr) {
      console.error('[seo-research] Refund failed:', refundErr);
    }

    return jsonResponse(
      { success: false, error: error.message || 'Research failed' },
      500,
    );
  }
}
