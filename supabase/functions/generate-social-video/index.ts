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

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse } from '../_shared/http.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { checkCreditBalance, getServicePricing } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { captureException } from '../_shared/sentry.ts';
import { fetchBinaryGuarded } from '../_shared/fetch-image.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

/**
 * Download a finished Replicate video into our own bucket and return the public URL.
 *
 * The success path used to write `pollResult.output` straight onto social_posts.video_url.
 * Replicate's output URLs expire within about an hour, so the user paid 15-20 credits, saw
 * the video once, and the stored link 404'd by the time the post was scheduled or published.
 * generate-interior-video-v2 already downloads before persisting; this path did not.
 * 
 *
 * Returns null on failure so the caller can refuse to persist an expiring URL rather than
 * silently storing one — the mistake generate-social-image's storeImage() still makes by
 * returning the upstream URL when the upload errors.
 */
async function storeVideo(
  supabase: DbClient,
  videoUrl: string,
  filename: string,
): Promise<string | null> {
  try {
    // Through the shared guard (#364 EX-7): this was a bare `fetch(videoUrl)` with redirects
    // followed and no size cap, reading whatever the far end sent into the isolate. 200 MB
    // ceiling — a 10s clip is single-digit MB.
    const { bytes } = await fetchBinaryGuarded(videoUrl, {
      maxBytes: 200 * 1024 * 1024,
      contentTypePrefix: 'video/',
      timeoutMs: 45_000,
    });
    const { data, error } = await supabase.storage
      .from('generation-images')
      .upload(`social/${filename}`, bytes, { contentType: 'video/mp4', upsert: true });
    if (error) {
      console.error('[generate-social-video] storage upload failed:', error.message);
      return null;
    }
    const { data: urlData } = supabase.storage.from('generation-images').getPublicUrl(data.path);
    return urlData.publicUrl;
  } catch (e) {
    console.error('[generate-social-video] could not download the Replicate output:', e);
    return null;
  }
}


const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REPLICATE_API_KEY = () => Deno.env.get('REPLICATE_API_KEY') || '';

// 'kling-1.6-pro' removed 2026-08-12 (issue #4): `klingai/kling-1.6-pro` returns 404 from
// GET /v1/models — a read that needs no credit, so it is deleted upstream, not a symptom of
// our unfunded account's 402. It was selectable at 15 credits and always hard-failed.
type VideoModel = 'kling-3.0' | 'veo-2'
  | 'wan-3.0-480p' | 'wan-3.0-720p' | 'wan-3.0-1080p';

// `veo-2` here is NOT what gets charged: the veo branch below returns early, delegating to
// generate-interior-video-v2, which debits its own CREDIT_COSTS. This entry is only read by the
// insufficient-credits preflight message, so a stale number quotes the customer a price nobody
// charges. It sat at 30 after the generator moved to 50 — the same value in two files with no
// mechanism keeping them equal, which is why the floor test now checks both.
const CREDIT_COSTS: Record<VideoModel, number> = {
  'kling-3.0':     20,
  'veo-2':         50,
  // Delegated like veo-2, so these are preflight-message values only — but they must
  // still equal generate-interior-video-v2's map, because a stale number here quotes
  // the customer a price nobody charges. Pinned by tests/unit/videoCreditFloor.test.ts.
  'wan-3.0-480p':  40,
  'wan-3.0-720p':  80,
  'wan-3.0-1080p': 155,
};

//: Models handed to generate-interior-video-v2 rather than run here. A reel is the case
//: Wan exists for — 30 seconds with sound, against the 10 silent seconds this function
//: could offer before.
const DELEGATED_MODELS = new Set<string>([
  'veo-2', 'wan-3.0-480p', 'wan-3.0-720p', 'wan-3.0-1080p',
]);

const REPLICATE_MODELS: Record<string, string> = {
  'kling-3.0':     'kwaivgi/kling-v3-video',
};


async function createReplicatePrediction(
  model: string,
  input: Record<string, unknown>,
): Promise<{ id: string; status: string; urls: { get: string } }> {
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
      headers: { 'Authorization': `Token ${REPLICATE_API_KEY()}` },
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
    // Wan-only, forwarded to the generator, which is where they are SSRF-checked —
    // this function never fetches them itself.
    reference_image_urls,
    model = 'kling-3.0' as VideoModel,
    aspect_ratio = '9:16',
    duration_seconds = 10,
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


  if (!source_image_url) return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);

  // Invariant 7 (#364 EX-7). `source_image_url` is handed to Replicate (and forwarded to
  // generate-interior-video-v2 for veo-2), which fetches it from THEIR network. Validate before
  // it leaves rather than at whichever call site downloads something first.
  try {
    await assertSafeUrl(source_image_url, { allowSchemes: ['https:'] });
  } catch (e) {
    return jsonResponse(
      { success: false, error: e instanceof SSRFError ? `Rejected image URL: ${e.message}` : 'Invalid image URL' },
      400,
    );
  }

  const creditCost = CREDIT_COSTS[model as VideoModel] ?? 15;

  // ③ Create prediction
  let creditsDebited = false;
  const refundCredits = async () => {
    if (!creditsDebited) return;
    creditsDebited = false; // guard against double refund
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_operation_type: 'social_video_generation.refund',
        p_description: `Refund: social video generation failed (${model})`,
        p_metadata: { model, aspect_ratio, duration_seconds, workspace_id },
        p_workspace_id: workspace_id ?? null,
      });
    } catch (e) {
      console.error('[generate-social-video] Refund failed (non-fatal):', e);
    }
  };

  try {
    let predictionId: string;
    let replicateModel: string;

    // Delegate entirely to generate-interior-video-v2 (it handles the credit debit itself)
    if (DELEGATED_MODELS.has(model)) {
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
          // The generator clamps per model (8s for veo-2, 30s for Wan). Clamping to 8
          // here as well would have silently capped every Wan reel at 8 seconds — the
          // exact thing Wan was added to fix.
          duration_seconds,
          video_type: 'social_reel',
          model,
          reference_image_urls,
          workspace_id,
        }),
      });
      if (!veoRes.ok) {
        // Surface the downstream failure instead of letting .json() throw opaquely
        // on a non-JSON error body.
        const errText = await veoRes.text().catch(() => '');
        throw new Error(`${model} generation failed (${veoRes.status}): ${errText.substring(0, 300)}`);
      }
      const veoResult = await veoRes.json();
      if (!veoResult.success) {
        throw new Error(veoResult.error || `${model} generation failed`);
      }
      return jsonResponse({
        success: true,
        video_url: veoResult.video_url,
        job_id: veoResult.job_id,
        model_used: model,
        credits_used: veoResult.credits_used,
        status: veoResult.status,
      });
    }

    // ① Pre-flight check (kling only — delegated models handled above)
    const { sufficient, balance } = await checkCreditBalance(supabase, userId, model, 1, workspace_id ?? null);
    // Was hardcoded 'kling-3.0' regardless of the model actually requested, so a user
    // with 15-19 credits passed the preflight and then got a 402 from the debit for a
    // 20- or 30-credit model. Check the model being bought.
    if (!sufficient) {
      return jsonResponse({ success: false, error: 'Insufficient credits', balance, required: creditCost }, 402);
    }

    // ② Debit upfront — REFUNDED on any failure path (see refundCredits + creditsDebited
    // guard below).
    const { data: debitData, error: debitError } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: 'social_video_generation',
      p_description: `Social video generation (${model}, ${duration_seconds}s)`,
      p_metadata: { model, aspect_ratio, duration_seconds, workspace_id },
      p_workspace_id: workspace_id ?? null,
    });

    const debit = Array.isArray(debitData) ? debitData[0] : debitData;
    if (debitError || !debit?.success) {
      return jsonResponse({ success: false, error: debit?.error_message || 'Credit debit failed' }, 402);
    }
    // Credits are now spent; refund on any failure path so we don't charge for a video
    // that was never produced. Mirrors generate-interior-video-v2.
    creditsDebited = true;

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
      const rawVideoUrl = Array.isArray(pollResult.output) ? pollResult.output[0] : pollResult.output;
      // Persist OUR copy, never Replicate's expiring URL.
      const videoUrl = rawVideoUrl
        ? await storeVideo(supabase, rawVideoUrl, `video-${Date.now()}.mp4`)
        : null;

      // A `succeeded` prediction with no usable output, or an output we could not store, is a
      // FAILURE — not a success carrying `video_url: null` (#364 EX-12). The old code fell
      // straight through: it kept the 20 credits, wrote an ai_usage_logs row for a video that
      // does not exist, told the caller `status: 'completed'`, and left the post with no video.
      // Refund and say so.
      if (!videoUrl) {
        console.error('[generate-social-video] Replicate succeeded but delivered no storable video');
        await refundCredits();
        return jsonResponse(
          { success: false, error: 'The model returned no usable video; credits refunded.' },
          502,
        );
      }

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

      // Cost comes from `ai_model_pricing`, NOT from the credit price. This used to
      // read `creditCost * 0.01`, i.e. it derived our USD cost backwards from what we
      // charge the tenant — a fabricated number that tracked the credit table rather
      // than the provider. For kling-3.0 that produced $0.20 against a real cost of
      // $0.10/second x duration (=$1.00 for a 10s clip), understating ~7x.
      // Kling rows are priced per SECOND, so units = duration.
      const videoPricing = await getServicePricing(supabase, model);
      if (!videoPricing) {
        console.warn(`[generate-social-video] no ai_model_pricing row for "${model}" — cost logged as null`);
      }
      const units = videoPricing?.unit === 'second' ? duration_seconds : 1;
      const rawCostUsd = videoPricing ? videoPricing.cost_per_unit * units : null;
      const billedCostUsd = videoPricing ? rawCostUsd! * videoPricing.markup_multiplier : null;

      // Billing row: never throw, never silent. The result was discarded entirely — spend
      // charged to a tenant and reported against nobody. try/catch because supabase-js RESOLVES
      // with `{ error }` on an RLS denial and REJECTS on transport (#347).
      try {
        const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
          user_id: userId,
          workspace_id: workspace_id ?? null,
          operation_type: 'social_video_generation',
          model_name: model,
          api_provider: 'replicate',
          input_tokens: 0, output_tokens: 0,
          input_cost_usd: 0, output_cost_usd: 0,
          raw_cost_usd: rawCostUsd,
          markup_multiplier: videoPricing?.markup_multiplier ?? null,
          billed_cost_usd: billedCostUsd,
          credits_debited: creditCost,
          metadata: {
            model, duration_seconds, aspect_ratio, replicate_prediction_id: predictionId,
            billing_type: 'per_unit', units, unit: videoPricing?.unit ?? null,
          },
        });
        if (usageErr) throw usageErr;
      } catch (usageErr) {
        console.error('[generate-social-video] ai_usage_logs insert FAILED — spend is unattributed', usageErr);
        await captureException(
          usageErr instanceof Error ? usageErr : new Error(String((usageErr as { message?: string })?.message ?? usageErr)),
          {
            tags: { area: 'billing', operation: 'social_video_generation' },
            extra: { user_id: userId, workspace_id: workspace_id ?? null, credits: creditCost },
            fingerprint: ['ai-usage-log-write-failed', 'social_video_generation'],
          },
        );
      }

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
      const { data: videoRecord, error: insertError } = await supabase.from('generation_videos').insert({
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

      if (insertError || !videoRecord?.id) {
        // Without a tracking row the user can never poll this job — refund and fail
        // rather than returning success with an undefined job_id.
        console.error('[generate-social-video] generation_videos insert failed:', insertError);
        await refundCredits();
        return jsonResponse(
          { success: false, error: 'Failed to persist video job; credits refunded.' },
          500,
        );
      }

      return jsonResponse({
        success: true,
        status: 'processing',
        prediction_id: predictionId,
        job_id: videoRecord.id,
        model_used: model,
        credits_used: creditCost,
        message: 'Video is being generated. Poll using the job_id to check status.',
      });

    } else {
      // Replicate reported failure — refund the upfront debit (no video produced).
      console.error('[generate-social-video] Replicate failure:', pollResult.error);
      await refundCredits();
      return jsonResponse({ success: false, error: pollResult.error || 'Video generation failed' }, 500);
    }

  } catch (err) {
    console.error('[generate-social-video] Error:', err);
    await refundCredits();
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
