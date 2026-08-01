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
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';

// Pre-flight estimate ONLY — shown before the call, never persisted. The real charge is
// derived inside debitExternalServiceCredits from ai_model_pricing and comes back as
// debitResult.credits_debited. Reporting this constant instead was a second derivation of a
// money quantity (anti-regression rule #1): a caption is actually billed 0.3 and was reported
// as 2 — a 6.7x overstatement that could never reconcile against credit_transactions or
// ai_usage_logs, and that any future "what did this post cost" rollup would inherit.
// (audit #306 finding 20)
const CREDIT_COST = 2;

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

  // SECURITY (audit #294/#306 finding 3): `workspace_id` and `post_id` arrive in the request
  // BODY and everything below runs on the service-role client. Unguarded, a user in
  // workspace A could spend workspace B's pooled credits (the debit is routed by this very
  // id), plant drafts in B's queue, and overwrite the caption/hashtags/images of any of B's
  // existing posts by id. zernio-api/handlers/publish.ts does this check correctly one
  // directory away.
  if (workspace_id && !(await userCanAccessWorkspace(supabase, userId, workspace_id))) {
    // 404, not 403 — do not confirm that a workspace id exists (id enumeration).
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  // Same for an existing post: verify it lives in a workspace the caller belongs to before
  // any update touches it.
  if (post_id) {
    const { data: existingPost, error: postErr } = await supabase
      .from('social_posts')
      .select('workspace_id')
      .eq('id', post_id)
      .maybeSingle();
    if (postErr) {
      return jsonResponse({ success: false, error: 'Could not verify post' }, 500);
    }
    if (!existingPost
      || !(await userCanAccessWorkspace(supabase, userId, (existingPost as { workspace_id: string }).workspace_id))) {
      return jsonResponse({ success: false, error: 'Not found' }, 404);
    }
  }


  if (!topic || !platform) {
    return jsonResponse({ success: false, error: 'topic and platform are required' }, 400);
  }

  const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.instagram;

  // ① Debit credits upfront — refunded by refundCredits() if generation fails
  const debitResult = await debitExternalServiceCredits(
    supabase, userId, 'social-caption', 'social_content_generation', 1,
    { platform, topic: topic.substring(0, 100), workspace_id },
    workspace_id ?? null,
  );

  if (!debitResult.success) {
    return jsonResponse({ success: false, error: debitResult.error || 'Insufficient credits' }, 402);
  }

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY() });

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

    const claudeStart = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });
    const claudeLatencyMs = Date.now() - claudeStart;

    // Track Claude usage in ai_call_logs (cost + tokens) — credits already
    // debited upfront via debitExternalServiceCredits, so this is observability only.
    try {
      const { AICallLogger } = await import('../_shared/ai-logger.ts');
      const aiLogger = new AICallLogger(supabaseUrl, supabaseServiceKey);
      await aiLogger.logClaudeCall(
        'social_content_generation',
        'claude-haiku-4-5',
        message,
        claudeLatencyMs,
        0.9,
        { model_confidence: 0.9, completeness: 0.9, consistency: 0.9, validation: 0.9 },
        'use_ai_result',
      );
    } catch (logErr) {
      console.warn('[generate-social-content] Logger failed:', logErr);
    }

    const firstBlock = Array.isArray(message.content) ? message.content[0] : undefined;
    const rawText = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';
    let parsed: { captions: Array<{ variant: number; caption: string; char_count: number }>; hashtags: string[]; best_time_hint: string };

    try {
      const cleaned = rawText.replace(/^```json\s*/m, '').replace(/```\s*$/m, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[generate-social-content] Failed to parse Claude response:', rawText);
      await refundCredits(supabase, userId, debitResult.credits_debited, workspace_id);
      return jsonResponse({ success: false, error: 'Failed to parse AI response' }, 500);
    }

    // The AI may return a malformed shape — guard before mapping so we don't 500
    // after the credit was already debited.
    if (!parsed || !Array.isArray(parsed.captions)) {
      console.error('[generate-social-content] AI response missing captions array:', rawText);
      await refundCredits(supabase, userId, debitResult.credits_debited, workspace_id);
      return jsonResponse({ success: false, error: 'AI response missing captions' }, 500);
    }

    // Fill in char_counts
    parsed.captions = parsed.captions.map(c => ({
      ...c,
      char_count: (c?.caption || '').length,
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
          credits_used: debitResult.credits_debited,
          credits_breakdown: { caption: debitResult.credits_debited },
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
        const newBreakdown = { ...(existingPost.credits_breakdown || {}), caption: debitResult.credits_debited };
        await supabase
          .from('social_posts')
          .update({
            credits_used: (existingPost.credits_used || 0) + debitResult.credits_debited,
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
    await refundCredits(supabase, userId, debitResult.credits_debited, workspace_id);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));

/** Best-effort refund of the upfront debit when generation fails after the debit. */
async function refundCredits(supabase: any, userId: string, amount: number, workspace_id?: string): Promise<void> {
  if (!amount || amount <= 0) return;
  try {
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: 'social_content_generation_refund',
      p_description: 'Refund: social content generation failed',
      p_metadata: { workspace_id },
      p_workspace_id: workspace_id ?? null,
    });
  } catch (refundErr) {
    console.error('[generate-social-content] Refund failed:', refundErr);
  }
}
