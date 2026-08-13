/**
 * generate-interior-video-v2
 *
 * Multi-model interior design video generation.
 * Routes to the best model based on video_type or explicit model override.
 *
 * Models:
 *   veo-2           → 30 credits (Google, cinematic walkthroughs)
 *   kling-v3.0      → 20 credits (native SDK, cinematic + audio)
 *   (budget tier vacant — wan2.1-i2v-720p was deleted upstream by Replicate; see issue #4)
 *   runway-gen4-turbo → 40 credits (Replicate, premium quality)
 *
 * Async handling: Replicate models can take 3-5 min. If polling times out
 * (55s), stores prediction_id in generation_videos and returns job_id for
 * frontend polling (same pattern as 3D generation).
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { generateVideoWithVeo, generateVideoWithKling } from '../_shared/ai-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { resolveOutputPath, type SessionPathCtx } from '../_shared/storage-paths.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REPLICATE_API_KEY = () => Deno.env.get('REPLICATE_API_KEY') || '';

// 'wan2.1-i2v-720p' removed 2026-08-12 (issue #4): `wan-video/wan2.1-i2v-720p` returns 404 from
// GET /v1/models — a read that needs no credit, so this is upstream deletion, NOT our 402
// Insufficient-credit state. It was user-selectable at 12 credits and always hard-failed.
// The budget tier stays vacant until `wan-video/wan-2.2-i2v-fast` can be verified against a
// funded account (issue #4 Phase 5) — an unverified replacement would repeat the same bug.
type VideoModel = 'veo-2' | 'kling-v3.0' | 'runway-gen4-turbo';
type VideoType = 'walkthrough' | 'product_spotlight' | 'before_after' | 'floorplan_flythrough' | 'social_reel';
type AspectRatio = '16:9' | '9:16' | '1:1';

const CREDIT_COSTS: Record<VideoModel, number> = {
  'veo-2':              30,
  'kling-v3.0':         20,
  'runway-gen4-turbo':  40,
};

// Longest clip each model will produce.
//
// `duration_seconds` arrives from the request body and the Replicate branch passed it STRAIGHT to
// the provider unclamped, while CREDIT_COSTS above charges a FLAT per-model price. So
// `duration_seconds: 60` cost the caller exactly what `5` did and we paid the difference — and
// `ai_usage_logs` priced the same models per SECOND, so the logged cost and the charged cost
// disagreed by however long the clip was. The Veo and Kling branches each clamped in-branch;
// Replicate did not. Clamped once here, at the input, which is also what makes the flat credit
// price defensible: it is the price of a bounded clip. (audit #312)
const MAX_DURATION_SECONDS: Record<VideoModel, number> = {
  'veo-2':              8,
  'kling-v3.0':         10,
  'runway-gen4-turbo':  10,
};

// Auto-select model by video type
const TYPE_MODEL_MAP: Record<VideoType, VideoModel> = {
  walkthrough:          'veo-2',
  floorplan_flythrough: 'veo-2',
  product_spotlight:    'kling-v3.0',
  before_after:         'kling-v3.0',
  social_reel:          'kling-v3.0',
};

// Replicate model identifiers (Kling now uses native SDK, not Replicate)
const REPLICATE_MODELS: Record<string, string> = {
  'runway-gen4-turbo': 'runwayml/gen4-turbo',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function uploadVideoToStorage(
  supabase: DbClient,
  videoData: string | ArrayBuffer,
  jobId: string,
  isBase64 = false,
  ctx: Partial<SessionPathCtx> = {},
): Promise<string> {
  const path = resolveOutputPath(ctx, 'videos/v2', `${jobId}.mp4`);
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
      'Authorization': `Token ${REPLICATE_API_KEY()}`,
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
  // Edge function hard limit is ~60s. We leave ~15s margin for setup/teardown.
  // If the prediction isn't done in time we return 'processing' and the client
  // polls generation_videos.replicate_prediction_id (already persisted).
  timeoutMs = 45_000,
): Promise<{ status: string; output?: string | string[]; error?: string }> {
  const start = Date.now();
  const url = `https://api.replicate.com/v1/predictions/${predictionId}`;

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(url, { headers: { 'Authorization': `Token ${REPLICATE_API_KEY()}` } });
    const data = await res.json() as { status: string; output?: string | string[]; error?: string };
    if (data.status === 'succeeded' || data.status === 'failed') return data;
  }

  return { status: 'processing' };
}

Deno.serve(withApiLogging('generate-interior-video-v2', async (req) => {
  await bootstrapForFunction();
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

  // Resolve model. `requestedModel` is client-supplied, so reject an unknown key
  // here rather than letting it flow on: CREDIT_COSTS[unknown] is undefined, which
  // debits `undefined` credits, writes credits_used=undefined onto generation_videos,
  // and only fails much later at the provider switch — refunding undefined.
  const resolvedModel: VideoModel = requestedModel || TYPE_MODEL_MAP[video_type as VideoType] || 'kling-v3.0';
  const creditCost = CREDIT_COSTS[resolvedModel];
  if (typeof creditCost !== 'number') {
    return jsonResponse({
      success: false,
      error: `Unknown model '${resolvedModel}'. Supported: ${Object.keys(CREDIT_COSTS).join(', ')}`,
    }, 400);
  }

  // Clamped to the model's ceiling, and defended against a non-numeric or negative body value
  // (`Number('abc')` is NaN, and NaN silently defeats a bare Math.min). Everything downstream —
  // the provider call, the usage log, the stored record — uses this, never the raw body field.
  const requestedDuration = Number(duration_seconds);
  const durationSeconds = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? Math.min(Math.round(requestedDuration), MAX_DURATION_SECONDS[resolvedModel])
    : Math.min(8, MAX_DURATION_SECONDS[resolvedModel]);

  // `ai_model_pricing` keys differ from the model ids this function uses: the price
  // table carries `kling-3.0`, here it is `kling-v3.0`. Identity map only — no prices
  // are defined here. (Issue #4 Phase 1 deletes this map by making the id the key everywhere.)
  const PRICING_KEY_BY_MODEL: Record<string, string> = {
    'kling-v3.0': 'kling-3.0',
  };

  // This function debited credits per video but wrote NO ai_usage_logs row at all, so
  // interior video generation was absent from usage and cost reporting entirely — not a
  // null cost, no row. Kling/Wan rows are priced per SECOND, so units = actual duration.
  const logVideoUsage = async (actualSeconds: number) => {
    const key = PRICING_KEY_BY_MODEL[resolvedModel] ?? resolvedModel;
    const pricing = await getServicePricing(supabase, key);
    if (!pricing) {
      console.warn(`[generate-interior-video-v2] no ai_model_pricing row for "${key}" — cost logged as null`);
    }
    const units = pricing?.unit === 'second' ? actualSeconds : 1;
    const rawCostUsd = pricing ? pricing.cost_per_unit * units : null;
    await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      workspace_id: workspace_id ?? null,
      operation_type: 'interior_video_generation_v2',
      model_name: key,
      credits_debited: creditCost,
      raw_cost_usd: rawCostUsd,
      billed_cost_usd: rawCostUsd === null ? null : rawCostUsd * pricing!.markup_multiplier,
      markup_multiplier: pricing?.markup_multiplier ?? null,
      metadata: {
        model: resolvedModel, video_type, billing_type: 'per_unit',
        units, unit: pricing?.unit ?? null,
      },
    }).then(() => {}, () => {});
  };

  // ① Debit credits upfront
  const { data: debitData, error: debitError } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_operation_type: 'interior_video_generation_v2',
    p_description: `Interior video v2 (${resolvedModel}, ${video_type})`,
    p_metadata: { model: resolvedModel, video_type, duration_seconds: durationSeconds, aspect_ratio, workspace_id },
    p_workspace_id: workspace_id ?? null,
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
      duration_s: durationSeconds,
      credits_used: creditCost,
      video_type,
      model_version: REPLICATE_MODELS[resolvedModel] || resolvedModel,
    })
    .select('id')
    .single();

  if (recordErr || !videoRecord) {
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: 'interior_video_generation_v2_refund',
      p_description: 'Refund: failed to create generation record',
      p_workspace_id: workspace_id ?? null,
    });
    return jsonResponse({ success: false, error: 'Failed to create generation record' }, 500);
  }

  const jobId = videoRecord.id;
  const uploadCtx: Partial<SessionPathCtx> = { userId, conversationId: body.conversation_id };

  try {
    // ③ Generate video
    if (resolvedModel === 'veo-2') {
      // Use existing Veo integration from ai-client.ts
      const defaultPrompt = video_type === 'walkthrough'
        ? 'Smooth cinematic walkthrough of the interior space, slow dolly forward, professional real estate video'
        : video_type === 'floorplan_flythrough'
        ? 'Aerial cinematic flythrough of the floorplan, smooth overhead camera movement'
        : 'Professional interior design showcase video, smooth camera movement';

      const veoResult = await generateVideoWithVeo(
        prompt || defaultPrompt,
        {
          imageUrl: source_image_url,
          aspectRatio: aspect_ratio as '16:9' | '9:16',
          durationSeconds,
        },
      );

      const videoUrl = await uploadVideoToStorage(supabase, veoResult.base64, jobId, true, uploadCtx);
      await logVideoUsage(durationSeconds);

      // This write is the ONLY record that the job finished, and the "your video is ready"
      // notification fires immediately after it. Discarding the result meant an RLS denial or a
      // transport blip left the row stuck on `processing` with a null video_url while the user
      // was told it was ready — they click through to nothing, and the job never resolves.
      // Throwing hands it to the catch below, which refunds and records a terminal `failed`:
      // less pleasant, but true, and recoverable (#347 audit).
      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        status: 'completed',
      });

    } else if (resolvedModel === 'kling-v3.0') {
      // Kling v3.0 via native @ai-sdk/klingai
      const klingPrompt = prompt || 'Professional cinematic interior design video, smooth camera movement';
      const klingDuration = durationSeconds >= 10 ? 10 : 5;

      const klingResult = await generateVideoWithKling(klingPrompt, {
        model: 'kling-v3.0-i2v',
        imageUrl: source_image_url,
        durationSeconds: klingDuration as 5 | 10,
        aspectRatio: aspect_ratio as '16:9' | '9:16' | '1:1',
        mode: 'pro',
      });

      const videoUrl = await uploadVideoToStorage(supabase, klingResult.base64, jobId, true, uploadCtx);
      await logVideoUsage(klingDuration);

      // This write is the ONLY record that the job finished, and the "your video is ready"
      // notification fires immediately after it. Discarding the result meant an RLS denial or a
      // transport blip left the row stuck on `processing` with a null video_url while the user
      // was told it was ready — they click through to nothing, and the job never resolves.
      // Throwing hands it to the catch below, which refunds and records a terminal `failed`:
      // less pleasant, but true, and recoverable (#347 audit).
      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

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
      // Replicate models (Wan 720p, Runway Gen-4)
      const replicateModel = REPLICATE_MODELS[resolvedModel];
      if (!replicateModel) throw new Error(`Unknown model: ${resolvedModel}`);

      // Build model-specific input
      const replicateInput: Record<string, unknown> = {
        image: source_image_url,
        prompt: prompt || 'Professional cinematic interior design video, smooth camera movement',
        duration: durationSeconds,
        aspect_ratio,
      };

      // Model-specific params
      if (resolvedModel === 'runway-gen4-turbo') {
        replicateInput.ratio = aspect_ratio;
        replicateInput.image_as_end_frame = false;
      } else if (video_type === 'before_after' && before_image_url) {
        replicateInput.image_end = before_image_url;
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
        const videoUrl = await uploadVideoToStorage(supabase, rawUrl, jobId, false, uploadCtx);
        await logVideoUsage(durationSeconds);

        // Same as the two branches above: the completion write is the only record the job
        // finished, and the "ready" notification fires straight after it.
        const { error: completeErr } = await supabase.from('generation_videos').update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);
        if (completeErr) throw completeErr;

        emitFlowEvent('video_generation_completed', {
          user_id: userId,
          type: 'video_ready',
          title: 'Your video is ready!',
          body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
          job_id: jobId,
          video_type,
        }).catch(() => {});

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
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: 'interior_video_generation_v2_refund',
      p_description: `Refund: ${resolvedModel} generation failed`,
      p_workspace_id: workspace_id ?? null,
    });

    // The refund has already gone through, so this must not throw — but it must not vanish
    // either: if the terminal write fails the row stays on `processing` forever, and a stuck
    // row that was actually refunded is exactly the state nobody can reconstruct later.
    const { error: failErr } = await supabase.from('generation_videos').update({
      status: 'failed',
      error_message: String(err),
    }).eq('id', jobId);
    if (failErr) {
      console.error(`[generate-interior-video-v2] job ${jobId} refunded but could NOT be marked failed`, failErr);
    }

    emitFlowEvent('video_generation_failed', {
      user_id: userId,
      type: 'video_failed',
      title: 'Video generation failed',
      body: 'Something went wrong generating your video. Any credits used have been refunded.',
      job_id: jobId,
      video_type,
    }).catch(() => {});

    console.error('[generate-interior-video-v2] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
