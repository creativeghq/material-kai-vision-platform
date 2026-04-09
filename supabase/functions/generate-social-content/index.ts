/**
 * Generate Social Content Edge Function
 *
 * Generates platform-optimised captions and hashtags using Claude.
 * Returns 3 caption variants to let the user choose.
 *
 * Cost: 2 credits (social-caption service in credit-utils). Non-refundable.
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const CREDIT_COST = 2; // flat 2 credits per generation

const PLATFORM_SPECS: Record<string, { max_chars: number; hashtag_style: string; tone_notes: string }> = {
  instagram:  { max_chars: 2200, hashtag_style: 'mix of popular and niche', tone_notes: 'visual, aspirational, story-driven' },
  facebook:   { max_chars: 63206, hashtag_style: 'fewer hashtags (3-5)', tone_notes: 'conversational, community-focused' },
  linkedin:   { max_chars: 3000, hashtag_style: 'professional hashtags (3-5)', tone_notes: 'professional, insight-driven, thought leadership' },
  tiktok:     { max_chars: 2200, hashtag_style: 'trending hashtags', tone_notes: 'energetic, trend-aware, short punchy sentences' },
  pinterest:  { max_chars: 500, hashtag_style: 'descriptive hashtags', tone_notes: 'inspirational, descriptive, action-oriented' },
  youtube:    { max_chars: 5000, hashtag_style: 'searchable hashtags', tone_notes: 'descriptive, SEO-focused, detailed' },
  twitter:    { max_chars: 280, hashtag_style: '1-2 hashtags max', tone_notes: 'concise, punchy, engaging' },
  threads:    { max_chars: 500, hashtag_style: 'minimal hashtags', tone_notes: 'conversational, authentic' },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(withApiLogging('generate-social-content', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);

  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const userId = auth.user.id;

  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const body = await req.json();
  const {
    topic,
    platform,
    tone = 'professional',
    product_info,
    include_hashtags = true,
    hashtag_count = 10,
    workspace_id,
    post_id,
  } = body;

  if (!topic || !platform) {
    return jsonResponse({ success: false, error: 'topic and platform are required' }, 400);
  }

  const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.instagram;

  // ① Debit credits upfront — non-refundable
  const debitResult = await debitExternalServiceCredits(
    supabase, userId, 'social-caption', 'social_content_generation', 1,
    { platform, topic: topic.substring(0, 100), workspace_id },
  );

  if (!debitResult.success) {
    return jsonResponse({ success: false, error: debitResult.error || 'Insufficient credits' }, 402);
  }

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = `You are an expert social media content creator specialising in interior design, materials, and architecture.
Generate captions that are ${tone} in tone and optimised for ${platform}.
Platform specs: max ${spec.max_chars} characters. Tone: ${spec.tone_notes}.
${include_hashtags ? `Include ${hashtag_count} hashtags — style: ${spec.hashtag_style}.` : 'Do not include hashtags.'}
Always output valid JSON only, no markdown.`;

    const userPrompt = `Generate 3 caption variants for a ${platform} post about: "${topic}"
${product_info ? `Product/material details: ${product_info}` : ''}

Return exactly this JSON structure:
{
  "captions": [
    { "variant": 1, "caption": "...", "char_count": 0 },
    { "variant": 2, "caption": "...", "char_count": 0 },
    { "variant": 3, "caption": "...", "char_count": 0 }
  ],
  "hashtags": ["#tag1", "#tag2", ...],
  "best_time_hint": "Brief tip on when to post this type of content"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    let parsed: { captions: Array<{ variant: number; caption: string; char_count: number }>; hashtags: string[]; best_time_hint: string };

    try {
      const cleaned = rawText.replace(/^```json\s*/m, '').replace(/```\s*$/m, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[generate-social-content] Failed to parse Claude response:', rawText);
      return jsonResponse({ success: false, error: 'Failed to parse AI response' }, 500);
    }

    // Fill in char_counts
    parsed.captions = parsed.captions.map(c => ({
      ...c,
      char_count: c.caption.length,
    }));

    // Save draft post if no post_id provided
    let savedPostId = post_id;
    if (!savedPostId && workspace_id) {
      const { data: newPost } = await supabase
        .from('social_posts')
        .insert({
          workspace_id,
          user_id: userId,
          platform,
          post_type: 'image',
          caption: parsed.captions[0]?.caption,
          hashtags: parsed.hashtags,
          status: 'draft',
          credits_used: CREDIT_COST,
          credits_breakdown: { caption: CREDIT_COST },
          generation_model: 'claude-haiku-4-5',
          metadata: { topic, tone, all_captions: parsed.captions },
        })
        .select('id')
        .single();
      savedPostId = newPost?.id;
    } else if (post_id) {
      const { data: existingPost } = await supabase
        .from('social_posts')
        .select('credits_used, credits_breakdown')
        .eq('id', post_id)
        .single();

      if (existingPost) {
        const newBreakdown = { ...(existingPost.credits_breakdown || {}), caption: CREDIT_COST };
        await supabase
          .from('social_posts')
          .update({
            credits_used: (existingPost.credits_used || 0) + CREDIT_COST,
            credits_breakdown: newBreakdown,
            caption: parsed.captions[0]?.caption,
            hashtags: parsed.hashtags,
          })
          .eq('id', post_id);
      }
    }

    return jsonResponse({
      success: true,
      post_id: savedPostId,
      captions: parsed.captions,
      hashtags: parsed.hashtags,
      best_time_hint: parsed.best_time_hint,
      platform,
      credits_used: CREDIT_COST,
      credits_remaining: debitResult.new_balance,
    });

  } catch (err) {
    console.error('[generate-social-content] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
