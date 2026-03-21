/**
 * generate-interior-video-v2
 *
 * Multi-model interior design video generation.
 * Routes to the best model based on video_type or explicit model override.
 *
 * Models:
 *   veo-2           → 30 credits (Google, cinematic walkthroughs)
 *   kling-1.6-pro   → 15 credits (Replicate, fast product/social)
 *   wan2.1-i2v      → 10 credits (Replicate, budget option)
 *   runway-gen4-turbo → 40 credits (Replicate, premium quality)
 *
 * Async handling: Replicate models can take 3-5 min. If polling times out
 * (55s), stores prediction_id in generation_videos and returns job_id for
 * frontend polling (same pattern as 3D generation).
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { generateVideoWithVeo } from '../_shared/ai-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY') || '';

type VideoModel = 'veo-2' | 'kling-1.6-pro' | 'wan2.1-i2v' | 'runway-gen4-turbo';
type VideoType = 'walkthrough' | 'product_spotlight' | 'before_after' | 'floorplan_flythrough' | 'social_reel';
type AspectRatio = '16:9' | '9:16' | '1:1';

const CREDIT_COSTS: Record<VideoModel, number> = {
  'veo-2':             30,
  'kling-1.6-pro':     15,
  'wan2.1-i2v':        10,
  'runway-gen4-turbo': 40,
};

// Auto-select model by video type
const TYPE_MODEL_MAP: Record<VideoType, VideoModel> = {
  walkthrough:          'veo-2',
  floorplan_flythrough: 'veo-2',
  product_spotlight:    'kling-1.6-pro',
  before_after:         'kling-1.6-pro',
  social_reel:          'kling-1.6-pro',
};

// Replicate model identifiers
const REPLICATE_MODELS: Record<string, string> = {
  'kling-1.6-pro':     'klingai/kling-1.6-pro',
  'wan2.1-i2v':        'wan-video/wan2.1-i2v-480p',
  'runway-gen4-turbo': 'runwayml/gen4-turbo',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function uploadVideoToStorage(
  supabase: ReturnType<typeof createClient>,
  videoData: string | ArrayBuffer,
  jobId: string,
  isBase64 = false,
): Promise<string> {
  const path = `videos/v2/${jobId}.mp4`;
  let bytes: Uint8Array;

  if (isBase64 && typeof videoData === 'string') {
    bytes = Uint8Array.from(atob(videoData), c => c.charCodeAt(0));
  } else if (typeof videoData === 'string') {
    // Download URL
    const res = await fetch(videoData);
    bytes = new Uint8Array(await res.arrayBuffer());
  } else {
    bytes = new Uint8Array(videoData);
  }

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType: 'video/mp4', upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

async function createReplicatePrediction(
  model: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
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
    throw new Error(`Replicate ${model} error ${res.status}: ${text}`);
  }
  return await res.json();
}

async function pollReplicate(
  predictionId: string,
  timeoutMs = 50_000,
): Promise<{ status: string; output?: string | string[]; error?: string }> {
  const start = Date.now();
  const url = `https://api.replicate.com/v1/predictions/${predictionId}`;

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(url, { headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` } });
    const data = await res.json() as { status: string; output?: string | string[]; error?: string };
    if (data.status === 'succeeded' || data.status === 'failed') return data;
  }

  return { status: 'processing' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: accept service role key (internal agent-chat call) OR user JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const body = await req.json();
  let userId: string;

  if (token === supabaseServiceKey && body.user_id) {
    // Internal server-to-server call (from agent-chat edge function)
    userId = body.user_id;
  } else {
    // User JWT validation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    userId = user.id;
  }

  const {
    source_image_url,
    video_type = 'walkthrough' as VideoType,
    model: requestedModel,
    prompt,
    aspect_ratio = '16:9' as AspectRatio,
    duration_seconds = 8,
    workspace_id,
    before_image_url,
  } = body;

  if (!source_image_url) {
    return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);
  }

  // Resolve model
  const resolvedModel: VideoModel = requestedModel || TYPE_MODEL_MAP[video_type as VideoType] || 'kling-1.6-pro';
  const creditCost = CREDIT_COSTS[resolvedModel];

  // ① Debit credits upfront
  const { data: debitData, error: debitError } = await supabase.rpc('debit_user_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_operation_type: 'interior_video_generation_v2',
    p_description: `Interior video v2 (${resolvedModel}, ${video_type})`,
    p_metadata: { model: resolvedModel, video_type, duration_seconds, aspect_ratio, workspace_id },
  });

  const debit = Array.isArray(debitData) ? debitData[0] : debitData;
  if (debitError || !debit?.success) {
    return jsonResponse({ success: false, error: debit?.error_message || 'Insufficient credits' }, 402);
  }

  // ② Create generation_videos record
  const { data: videoRecord, error: recordErr } = await supabase
    .from('generation_videos')
    .insert({
      user_id: userId,
      workspace_id,
      source_image_url,
      prompt,
      status: 'processing',
      model: resolvedModel,
      aspect_ratio,
      duration_s: duration_seconds,
      credits_used: creditCost,
      video_type,
      model_version: REPLICATE_MODELS[resolvedModel] || resolvedModel,
    })
    .select('id')
    .single();

  if (recordErr || !videoRecord) {
    await supabase.rpc('debit_user_credits', {
      p_user_id: userId,
      p_amount: -creditCost,
      p_operation_type: 'interior_video_generation_v2_refund',
      p_description: 'Refund: failed to create generation record',
    });
    return jsonResponse({ success: false, error: 'Failed to create generation record' }, 500);
  }

  const jobId = videoRecord.id;

  try {
    // ③ Generate video
    if (resolvedModel === 'veo-2') {
      // Use existing Veo integration from ai-client.ts
      const defaultPrompt = video_type === 'walkthrough'
        ? 'Smooth cinematic walkthrough of the interior space, slow dolly forward, professional real estate video'
        : video_type === 'floorplan_flythrough'
        ? 'Aerial cinematic flythrough of the floorplan, smooth overhead camera movement'
        : 'Professional interior design showcase video, smooth camera movement';

      const veoResult = await generateVideoWithVeo({
        sourceImageUrl: source_image_url,
        prompt: prompt || defaultPrompt,
        aspectRatio: aspect_ratio as '16:9' | '9:16',
        durationSeconds: Math.min(duration_seconds, 8),
      });

      const videoUrl = await uploadVideoToStorage(supabase, veoResult.videoBase64, jobId, true);

      await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        status: 'completed',
      });

    } else {
      // Replicate models
      const replicateModel = REPLICATE_MODELS[resolvedModel];
      if (!replicateModel) throw new Error(`Unknown Replicate model: ${resolvedModel}`);

      // Build model-specific input
      const replicateInput: Record<string, unknown> = {
        image: source_image_url,
        prompt: prompt || 'Professional cinematic interior design video, smooth camera movement',
        duration: duration_seconds,
        aspect_ratio,
      };

      // Model-specific params
      if (resolvedModel === 'kling-1.6-pro') {
        replicateInput.cfg_scale = 0.5;
        replicateInput.negative_prompt = 'blurry, distorted, shaky camera, poor quality';
      } else if (resolvedModel === 'before_after' && before_image_url) {
        replicateInput.image_end = before_image_url;
      } else if (resolvedModel === 'runway-gen4-turbo') {
        replicateInput.ratio = aspect_ratio;
        replicateInput.image_as_end_frame = false;
      }

      const prediction = await createReplicatePrediction(replicateModel, replicateInput);

      // Update record with prediction ID
      await supabase.from('generation_videos').update({
        replicate_prediction_id: prediction.id,
      }).eq('id', jobId);

      // Poll (50s budget — leave 10s for edge function overhead)
      const pollResult = await pollReplicate(prediction.id, 50_000);

      if (pollResult.status === 'succeeded') {
        const rawUrl = Array.isArray(pollResult.output) ? pollResult.output[0] : pollResult.output as string;
        const videoUrl = await uploadVideoToStorage(supabase, rawUrl, jobId);

        await supabase.from('generation_videos').update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);

        return jsonResponse({
          success: true,
          job_id: jobId,
          video_url: videoUrl,
          model_used: resolvedModel,
          credits_used: creditCost,
          video_type,
          status: 'completed',
        });

      } else if (pollResult.status === 'processing') {
        // Return async job for frontend polling
        return jsonResponse({
          success: true,
          job_id: jobId,
          async_job: true,
          prediction_id: prediction.id,
          model_used: resolvedModel,
          credits_used: creditCost,
          video_type,
          status: 'processing',
          message: 'Video generation in progress. Poll with job_id to check status.',
        });

      } else {
        throw new Error(pollResult.error || 'Replicate generation failed');
      }
    }

  } catch (err) {
    // Refund and mark failed
    await supabase.rpc('debit_user_credits', {
      p_user_id: userId,
      p_amount: -creditCost,
      p_operation_type: 'interior_video_generation_v2_refund',
      p_description: `Refund: ${resolvedModel} generation failed`,
    });

    await supabase.from('generation_videos').update({
      status: 'failed',
      error_message: String(err),
    }).eq('id', jobId);

    console.error('[generate-interior-video-v2] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
