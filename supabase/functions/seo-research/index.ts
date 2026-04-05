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
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { DataForSEOClient } from '../_shared/dataforseo-client.ts';
import type { SEOResearchRequest, SEOResearchResponse } from '../_shared/seo-types.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const dataforseoLogin = Deno.env.get('DATAFORSEO_LOGIN') || '';
const dataforseoPassword = Deno.env.get('DATAFORSEO_PASSWORD') || '';

const CREDIT_COST = 18;

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(withApiLogging('seo-research', async (req) => {
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
  if (!auth.success || !auth.userId) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  const userId = auth.userId;

  try {
    const body: SEOResearchRequest = await req.json();

    if (!body.topic || !body.target_keyword) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: topic, target_keyword' },
        400,
      );
    }

    if (!dataforseoLogin || !dataforseoPassword) {
      return jsonResponse(
        { success: false, error: 'DataForSEO credentials not configured' },
        500,
      );
    }

    const locationCode = body.location_code || 2840;
    const languageCode = body.language_code || 'en';

    // Debit credits
    const { data: debitResult, error: debitError } = await supabase.rpc(
      'debit_user_credits',
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
      },
    );

    if (debitError || !debitResult?.[0]?.success) {
      const msg = debitResult?.[0]?.error_message || debitError?.message || 'Insufficient credits';
      return jsonResponse({ success: false, error: msg }, 402);
    }

    console.log(`[seo-research] Starting research for "${body.target_keyword}" (user: ${userId})`);

    // Run DataForSEO research
    const client = new DataForSEOClient(dataforseoLogin, dataforseoPassword);
    const research = await client.researchKeyword(
      body.target_keyword,
      body.topic,
      locationCode,
      languageCode,
    );

    // Get workspace ID for the user
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .single();

    // Persist to database
    const { data: researchRow, error: insertError } = await supabase
      .from('seo_keyword_research')
      .insert({
        user_id: userId,
        workspace_id: memberData?.workspace_id || null,
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

    if (insertError) {
      console.error('[seo-research] Failed to persist research:', insertError);
      // Don't fail the request — research data is still valid
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
      await supabase.rpc('debit_user_credits', {
        p_user_id: userId,
        p_amount: -CREDIT_COST,
        p_operation_type: 'seo_research_refund',
        p_description: `Refund: SEO research failed`,
        p_metadata: { error: error.message },
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
}));
