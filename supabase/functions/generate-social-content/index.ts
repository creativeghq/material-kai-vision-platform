/**
 * Generate Social Content Edge Function
 *
 * Generates platform-optimised captions and hashtags using Claude.
 * Returns 3 caption variants to let the user choose.
 *
 * Cost: 2 credits (social-caption service in credit-utils). Non-refundable.
 */

import { getGenerationPrompt, loadPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';
import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../_shared/http.ts';
import { generateStructuredWithClaude, z } from '../_shared/ai-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// The real charge is derived inside debitExternalServiceCredits from ai_model_pricing and
// comes back as debitResult.credits_debited — that is the ONLY number this function may report
// (anti-regression rule #1). The previous fix moved the three DB writes onto credits_debited
// and left the RESPONSE on a hardcoded 2, so the row said 0.3 and the screen said 2: the same
// 6.7x overstatement, now disagreeing with the row written by the same request. There is no
// constant here any more, because the estimate had no reader — nothing shows it before the call.

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


const CAPTION_RESULT = z.object({
  captions: z.array(z.object({
    variant: z.number(),
    caption: z.string(),
    char_count: z.number(),
  })).min(1),
  hashtags: z.array(z.string()),
  best_time_hint: z.string(),
});

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

  // SECURITY: `workspace_id` and `post_id` arrive in the request
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
    const systemPrompt = renderPromptTemplate(await loadPrompt(supabase, 'tool', 'social_content_system'), { tone: tone, platform: platform, max_chars: spec.max_chars, tone_notes: spec.tone_notes, hashtag_instruction: include_hashtags ? `Include ${hashtag_count} hashtags — style: ${spec.hashtag_style}.` : 'Do not include hashtags.' });

    const userPrompt = renderPromptTemplate(await getGenerationPrompt(supabase, 'social_caption_variants'), { platform: platform, topic: topic, product_info: product_info ? `Product/material details: ${product_info}` : '' });

    // Schema-locked, so there is no fenced-JSON strip, no JSON.parse, and no "did it come back
    // with a captions array" guard — the three things that used to turn a paid call into a
    // refund. A shape violation throws and the outer catch refunds, same as any other failure.
    // Cost logging comes with the shared client; the hand-rolled AICallLogger block this
    // replaced was the only reason the raw SDK path stayed honest.
    const { output: parsed } = await generateStructuredWithClaude(
      userPrompt,
      CAPTION_RESULT,
      {
        model: 'claude-haiku-4-5',
        systemPrompt,
        maxTokens: 1500,
        task: 'social_content_generation',
        userId,
        workspaceId: workspace_id ?? undefined,
      },
    );

    // char_count is ours to compute, not the model's to claim.
    parsed.captions = parsed.captions.map((c) => ({ ...c, char_count: (c?.caption || '').length }));

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
      credits_used: debitResult.credits_debited,
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
