/**
 * SEO Research Edge Function
 *
 * Performs keyword research using DataForSEO API.
 * Runs 6 parallel API calls: keyword expansion, related keywords,
 * bulk difficulty, PAA questions, SERP competitors, content analysis.
 *
 * Credit cost: 18 credits per research
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

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const dataforseoLogin = () => Deno.env.get('DATAFORSEO_LOGIN') || '';
const dataforseoPassword = () => Deno.env.get('DATAFORSEO_PASSWORD') || '';

const CREDIT_COST = 18;


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

  try {

    if (!body.topic || !body.target_keyword) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: topic, target_keyword' },
        400,
      );
    }

    if (!dataforseoLogin() || !dataforseoPassword()) {
      return jsonResponse(
        { success: false, error: 'DataForSEO credentials not configured' },
        500,
      );
    }

    const locationCode = body.location_code || 2840;
    const languageCode = body.language_code || 'en';

    // Entitlement gate BEFORE the debit and the upstream calls (#212 + invariant 10).
    // Also resolves the workspace the research is filed under (was a late `.single()`
    // lookup, which errors → null for multi-workspace users — same bug pipeline.ts fixed).
    const { workspaceId, response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId);
    if (entResponse) return entResponse;

    // Debit credits
    const { data: debitResult, error: debitError } = await supabase.rpc(
      'debit_credits',
      {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_operation_type: 'seo_research',
        p_description: `SEO keyword research: "${body.target_keyword}"`,
        p_metadata: {
          topic: body.topic,
          target_keyword: body.target_keyword,
          location_code: locationCode,
        },
        p_workspace_id: null,
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
    // carousels, knowledge graph, paid bidders) on the SAME keyword. Adds
    // ~3-5s latency in the worst case but runs concurrently with the main
    // research, so total wall-clock cost is unchanged. The stateless
    // endpoint authenticates via x-cron-secret — no extra user credits.
    const client = new DataForSEOClient(dataforseoLogin(), dataforseoPassword());
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
        credits_used: CREDIT_COST,
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
        credits_used: CREDIT_COST,
      },
    };

    return jsonResponse(response);
  } catch (error: any) {
    console.error('[seo-research] Error:', error);

    // Attempt credit refund on failure
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_operation_type: 'seo_research_refund',
        p_description: `Refund: SEO research failed`,
        p_metadata: { error: error.message },
        p_workspace_id: null,
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
