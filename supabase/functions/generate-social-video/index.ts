/**
 * Generate Social Video Edge Function
 *
 * Generates short-form social media videos via Replicate:
 *   kling-3.0      → 20 credits (fast, cinematic reels with audio)
 *   veo-2          → 30 credits (premium quality via generate-interior-video-v2)
 *
 * Credits are debited upfront and are non-refundable.
 * Uses async polling pattern: returns prediction_id if generation exceeds 50s.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { checkCreditBalance } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { MARKUP_MULTIPLIER } from '../_shared/pricing-constants.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY') || '';

type VideoModel = 'kling-3.0' | 'kling-1.6-pro' | 'veo-2';

const CREDIT_COSTS: Record<VideoModel, number> = {
  'kling-3.0':     20,
  'kling-1.6-pro': 15,
  'veo-2':         30,
};

const REPLICATE_MODELS: Record<string, string> = {
  'kling-3.0':     'kwaivgi/kling-v3-video',
  'kling-1.6-pro': 'klingai/kling-1.6-pro',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function createReplicatePrediction(
  model: string,
  input: Record<string, unknown>,
): Promise<{ id: string; status: string; urls: { get: string } }> {
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate error ${res.status}: ${text}`);
  }

  return await res.json();
}

async function pollReplicate(
  predictionId: string,
  timeoutMs = 50_000,
): Promise<{ status: string; output?: string | string[]; error?: string }> {
  const start = Date.now();
  const pollUrl = `https://api.replicate.com/v1/predictions/${predictionId}`;

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(pollUrl, {
      headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` },
    });
    const data = await res.json() as { status: string; output?: string | string[]; error?: string };

    if (data.status === 'succeeded' || data.status === 'failed') return data;
  }

  return { status: 'processing' };
}

Deno.serve(withApiLogging('generate-social-video', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const userId = auth.user.id;

  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const body = await req.json();
  const {
    prompt,
    source_image_url,
    model = 'kling-3.0' as VideoModel,
    aspect_ratio = '9:16',
    duration_seconds = 10,
    workspace_id,
    post_id,
  } = body;

  if (!source_image_url) return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);

  const creditCost = CREDIT_COSTS[model as VideoModel] ?? 15;

  // ③ Create prediction
  try {
    let predictionId: string;
    let replicateModel: string;

    // For veo-2: delegate entirely to generate-interior-video-v2 (it handles credit debit itself)
    if (model === 'veo-2') {
      const veoRes = await fetch(`${supabaseUrl}/functions/v1/generate-interior-video-v2`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          source_image_url,
          prompt,
          aspect_ratio,
          duration_seconds: Math.min(duration_seconds, 8),
          video_type: 'social_reel',
          model: 'veo-2',
          workspace_id,
        }),
      });
      const veoResult = await veoRes.json();
      if (!veoResult.success) {
        throw new Error(veoResult.error || 'Veo generation failed');
      }
      return jsonResponse({
        success: true,
        video_url: veoResult.video_url,
        job_id: veoResult.job_id,
        model_used: 'veo-2',
        credits_used: veoResult.credits_used,
        status: veoResult.status,
      });
    }

    // ① Pre-flight check (kling only — veo-2 handled above)
    const { sufficient, balance } = await checkCreditBalance(supabase, userId, 'kling-3.0');
    if (!sufficient) {
      return jsonResponse({ success: false, error: 'Insufficient credits', balance, required: creditCost }, 402);
    }

    // ② Debit upfront — non-refundable
    const { data: debitData, error: debitError } = await supabase.rpc('debit_user_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: 'social_video_generation',
      p_description: `Social video generation (${model}, ${duration_seconds}s)`,
      p_metadata: { model, aspect_ratio, duration_seconds, workspace_id },
    });

    const debit = Array.isArray(debitData) ? debitData[0] : debitData;
    if (debitError || !debit?.success) {
      return jsonResponse({ success: false, error: debit?.error_message || 'Credit debit failed' }, 402);
    }

    replicateModel = REPLICATE_MODELS[model] || REPLICATE_MODELS['kling-3.0'];
    const prediction = await createReplicatePrediction(replicateModel, {
      image: source_image_url,
      prompt: prompt || 'Smooth cinematic camera motion, professional quality',
      duration: duration_seconds,
      aspect_ratio,
      cfg_scale: 0.5,
    });
    predictionId = prediction.id;

    // ④ Poll (up to 50s)
    const pollResult = await pollReplicate(predictionId, 50_000);

    if (pollResult.status === 'succeeded') {
      const videoUrl = Array.isArray(pollResult.output) ? pollResult.output[0] : pollResult.output;

      if (post_id && videoUrl) {
        const { data: existingPost } = await supabase
          .from('social_posts')
          .select('credits_used, credits_breakdown')
          .eq('id', post_id)
          .single();

        if (existingPost) {
          await supabase.from('social_posts').update({
            video_url: videoUrl,
            credits_used: (existingPost.credits_used || 0) + creditCost,
            credits_breakdown: { ...(existingPost.credits_breakdown || {}), video: creditCost },
          }).eq('id', post_id);
        }
      }

      await supabase.from('ai_usage_logs').insert({
        user_id: userId,
        operation_type: 'social_video_generation',
        model_name: model,
        api_provider: 'replicate',
        input_tokens: 0, output_tokens: 0,
        input_cost_usd: 0, output_cost_usd: 0,
        raw_cost_usd: creditCost * 0.01 / MARKUP_MULTIPLIER,
        markup_multiplier: MARKUP_MULTIPLIER,
        billed_cost_usd: creditCost * 0.01,
        total_cost_usd: creditCost * 0.01,
        credits_debited: creditCost,
        metadata: { model, duration_seconds, aspect_ratio, replicate_prediction_id: predictionId },
      });

      return jsonResponse({
        success: true,
        video_url: videoUrl,
        prediction_id: predictionId,
        model_used: model,
        credits_used: creditCost,
        status: 'completed',
      });

    } else if (pollResult.status === 'processing') {
      // Store for async polling — credits already debited
      const { data: videoRecord } = await supabase.from('generation_videos').insert({
        user_id: userId,
        workspace_id,
        source_image_url,
        prompt,
        status: 'processing',
        model,
        aspect_ratio,
        duration_s: duration_seconds,
        credits_used: creditCost,
        video_type: 'social_reel',
        model_version: replicateModel,
        replicate_prediction_id: predictionId,
      }).select('id').single();

      return jsonResponse({
        success: true,
        status: 'processing',
        prediction_id: predictionId,
        job_id: videoRecord?.id,
        model_used: model,
        credits_used: creditCost,
        message: 'Video is being generated. Poll using the job_id to check status.',
      });

    } else {
      // Replicate reported failure — credits already spent, log and return error
      console.error('[generate-social-video] Replicate failure:', pollResult.error);
      return jsonResponse({ success: false, error: pollResult.error || 'Video generation failed' }, 500);
    }

  } catch (err) {
    console.error('[generate-social-video] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
