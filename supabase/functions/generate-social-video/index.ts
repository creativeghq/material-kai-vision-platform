/**
 * Generate Social Video Edge Function
 *
 * Generates short-form social media videos.
 *
 * DEFAULT: h3-max-768p → 25 credits (H3 Max — fal's post-train of MiniMax H3).
 * 5-15 seconds with stereo audio, rendered in seconds rather than minutes — the reel
 * format itself, and the only model here designed for it. It is delegated to
 * generate-interior-video-v2 like every other model below.
 *
 * Also selectable, all delegated: veo-2 (50), wan-3.0-480p/720p/1080p (30/55/110, 30s),
 * seedance-2.5-480p/720p (60/125, 30s one-pass).
 *
 * kling-3.0 (20) is the ONE model still run here, through Replicate, and it is the reason
 * the default moved: Replicate has been answering `auth_failed` to every probe, so the
 * previous default could not produce a video at all. Everything delegated runs on its
 * provider's own key and is unaffected.
 *
 * Credits are debited upfront and are non-refundable.
 * Uses async polling pattern: returns prediction_id if generation exceeds 50s.
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse } from '../_shared/http.ts';
import { createClient } from '@supabase/supabase-js';
import { replicateToken } from '../_shared/replicate-token.ts';
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

// 'kling-1.6-pro' removed 2026-08-12 (issue #4): `klingai/kling-1.6-pro` returns 404 from
// GET /v1/models — a read that needs no credit, so it is deleted upstream, not a symptom of
// our unfunded account's 402. It was selectable at 15 credits and always hard-failed.
type VideoModel = 'kling-3.0' | 'veo-2'
  | 'wan-3.0-480p' | 'wan-3.0-720p' | 'wan-3.0-1080p'
  | 'seedance-2.5-480p' | 'seedance-2.5-720p'
  | 'h3-max-768p' | 'h3-max-480p'
  | 'ray-3.2-720p' | 'ray-3.2-1080p';

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
  'wan-3.0-480p':  30,
  'wan-3.0-720p':  55,
  'wan-3.0-1080p': 110,
  'seedance-2.5-480p':  60,
  'seedance-2.5-720p':  125,
  'h3-max-768p':        25,
  'h3-max-480p':        15,
  'ray-3.2-720p':       20,
  'ray-3.2-1080p':      70,
};

//: Models handed to generate-interior-video-v2 rather than run here. A reel is the case
//: Wan exists for — 30 seconds with sound, against the 10 silent seconds this function
//: could offer before.
const DELEGATED_MODELS = new Set<string>([
  'veo-2', 'wan-3.0-480p', 'wan-3.0-720p', 'wan-3.0-1080p',
  'seedance-2.5-480p', 'seedance-2.5-720p',
  'h3-max-768p', 'h3-max-480p',
  'ray-3.2-720p', 'ray-3.2-1080p',
]);

const REPLICATE_MODELS: Record<string, string> = {
  'kling-3.0':     'kwaivgi/kling-v3-video',
};


async function createReplicatePrediction(
  model: string,
  input: Record<string, unknown>,
): Promise<{ id: string; status: string; urls: { get: string } }> {
  const token = await replicateToken();
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
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

  const token = await replicateToken();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(pollUrl, {
      headers: { 'Authorization': `Token ${token}` },
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

  // ── action: 'status' — collect a job that outran the 50s inline poll ──
  //
  // Everything below returns `status: 'processing'` with a job_id when Replicate has not
  // finished inside the request, and until now NOTHING ever came back for that job. The only
  // thing that touched those rows was `reconcile_stuck_generation_videos`, which after 30
  // minutes marks them FAILED and refunds — so a video that Replicate finished at 90 seconds
  // was thrown away and reported as a failure, with the credits handed back and the render
  // paid for at the provider. A slow video was, structurally, always a lost video.
  //
  // This is the collector. It lives here rather than in the tool because completing a job means
  // downloading the file into our bucket, attaching it to the post and writing the billing row
  // — the same three steps the inline success path does, and they belong in one place.
  if (body?.action === 'status') {
    const jobId = typeof body.job_id === 'string' ? body.job_id : '';
    if (!jobId) return jsonResponse({ success: false, error: 'job_id is required' }, 400);

    const { data: job } = await supabase
      .from('generation_videos')
      .select('id, user_id, workspace_id, status, video_url, model, duration_s, credits_used, replicate_prediction_id, social_post_id, error_message')
      .eq('id', jobId)
      .maybeSingle();
    // 404 on a job in another tenant, never 403 — same reason as the post check below.
    if (!job || !(await userCanAccessWorkspace(supabase, userId, (job as { workspace_id: string }).workspace_id))) {
      return jsonResponse({ success: false, error: 'Not found' }, 404);
    }

    if (job.status === 'completed' && job.video_url) {
      return jsonResponse({ success: true, status: 'completed', video_url: job.video_url, job_id: jobId, post_id: job.social_post_id ?? null });
    }
    if (job.status === 'failed') {
      return jsonResponse({ success: false, status: 'failed', error: job.error_message || 'The video generation failed.', job_id: jobId }, 200);
    }
    if (!job.replicate_prediction_id) {
      // A delegated model tracks its own job elsewhere; this collector only owns the Replicate leg.
      return jsonResponse({ success: true, status: job.status || 'processing', job_id: jobId, post_id: job.social_post_id ?? null });
    }

    // ONE poll, not a loop: the caller is asking "is it done yet", and blocking the request for
    // another 50s would just move the same timeout somewhere else.
    let pred: { status: string; output?: string | string[]; error?: string };
    try {
      const token = await replicateToken();
      const res = await fetch(`https://api.replicate.com/v1/predictions/${job.replicate_prediction_id}`, {
        headers: { 'Authorization': `Token ${token}` },
      });
      pred = await res.json() as typeof pred;
    } catch (e) {
      console.error('[generate-social-video] status poll failed:', e);
      return jsonResponse({ success: true, status: 'processing', job_id: jobId, note: 'Could not reach the provider just now; the job is still tracked.' });
    }

    if (pred.status === 'failed') {
      await supabase.from('generation_videos')
        .update({ status: 'failed', error_message: pred.error || 'Provider reported failure', completed_at: new Date().toISOString() })
        .eq('id', jobId);
      // The cron refunds on its own sweep; refunding here too would pay it back twice.
      return jsonResponse({ success: false, status: 'failed', error: pred.error || 'The video generation failed.', job_id: jobId }, 200);
    }
    if (pred.status !== 'succeeded') {
      return jsonResponse({ success: true, status: 'processing', job_id: jobId, post_id: job.social_post_id ?? null });
    }

    const rawUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    const storedUrl = rawUrl ? await storeVideo(supabase, rawUrl, `video-${Date.now()}.mp4`) : null;
    if (!storedUrl) {
      // Succeeded with nothing storable is a FAILURE, not a success carrying a null URL — the
      // same rule the inline path applies.
      await supabase.from('generation_videos')
        .update({ status: 'failed', error_message: 'The model returned no usable video', completed_at: new Date().toISOString() })
        .eq('id', jobId);
      return jsonResponse({ success: false, status: 'failed', error: 'The model returned no usable video.', job_id: jobId }, 200);
    }

    await supabase.from('generation_videos')
      .update({ status: 'completed', video_url: storedUrl, completed_at: new Date().toISOString() })
      .eq('id', jobId);

    // The attach is CHECKED and its failure is reported. Returning `completed` over a rejected
    // update would tell the operator the reel is on the post while the post still has no video —
    // the video exists either way, so the URL is still handed back, but the claim is not made.
    let attachError: string | null = null;
    if (job.social_post_id) {
      const { data: post } = await supabase
        .from('social_posts').select('credits_used, credits_breakdown').eq('id', job.social_post_id).single();
      if (post) {
        const { error: attachErr } = await supabase.from('social_posts').update({
          video_url: storedUrl,
          credits_used: (post.credits_used || 0) + (job.credits_used || 0),
          credits_breakdown: { ...(post.credits_breakdown || {}), video: job.credits_used || 0 },
        }).eq('id', job.social_post_id);
        if (attachErr) {
          console.error('[generate-social-video] status: video stored but the post attach FAILED', attachErr);
          attachError = attachErr.message;
        }
      } else {
        attachError = 'The post this video was made for no longer exists.';
      }
    }

    // Billing, on the same terms as the inline path: priced from ai_model_pricing, never
    // derived backwards from the credit price. Collected here because this is where the
    // render actually completed.
    try {
      const pricing = await getServicePricing(supabase, job.model);
      const units = pricing?.unit === 'second' ? (job.duration_s || 1) : 1;
      const rawCostUsd = pricing ? pricing.cost_per_unit * units : null;
      // Destructured and re-thrown: supabase-js RESOLVES with `{ error }` on an RLS denial and
      // only REJECTS on transport, so an undestructured insert inside a try/catch never reaches
      // the catch — the spend is charged and reported against nobody (#347).
      const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
        user_id: job.user_id,
        workspace_id: job.workspace_id ?? null,
        operation_type: 'social_video_generation',
        model_name: job.model,
        api_provider: 'replicate',
        input_tokens: 0, output_tokens: 0, input_cost_usd: 0, output_cost_usd: 0,
        raw_cost_usd: rawCostUsd,
        markup_multiplier: pricing?.markup_multiplier ?? null,
        billed_cost_usd: pricing ? rawCostUsd! * pricing.markup_multiplier : null,
        credits_debited: job.credits_used ?? 0,
        metadata: {
          model: job.model, duration_seconds: job.duration_s,
          replicate_prediction_id: job.replicate_prediction_id,
          billing_type: 'per_unit', units, unit: pricing?.unit ?? null,
          collected_by: 'status',
        },
      });
      if (usageErr) throw usageErr;
    } catch (e) {
      console.error('[generate-social-video] status: ai_usage_logs insert FAILED — spend unattributed', e);
      await captureException(e instanceof Error ? e : new Error(String(e)), {
        tags: { area: 'billing', operation: 'social_video_generation' },
        extra: { job_id: jobId, workspace_id: job.workspace_id ?? null },
        fingerprint: ['ai-usage-log-write-failed', 'social_video_generation'],
      });
    }

    return jsonResponse({
      success: true, status: 'completed', video_url: storedUrl, job_id: jobId,
      post_id: attachError ? null : (job.social_post_id ?? null),
      ...(attachError ? { attach_error: `The video is ready but could not be attached to the post: ${attachError}` } : {}),
    });
  }

  const {
    prompt,
    source_image_url,
    // Wan-only, forwarded to the generator, which is where they are SSRF-checked —
    // this function never fetches them itself.
    reference_image_urls,
    // Was 'kling-3.0', which runs on the Replicate path below — and Replicate answers
    // Was 'kling-3.0', which runs on the Replicate path below — and Replicate answers
    // auth_failed to every call, so the DEFAULT model was the one model here that
    // cannot currently produce anything. H3 Max is delegated, runs on fal's key, and is
    // the right shape for a reel besides: 15s with audio, in seconds, for 25 credits.
    model = 'h3-max-768p' as VideoModel,
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
          // The generator clamps per model (8s for veo-2, 30s for Wan and Seedance). Clamping to 8
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

      // Attach it to the draft. This branch returned the URL and walked away, and it is the
      // branch the DEFAULT model takes — so for every model except kling-3.0 (the one that
      // currently cannot render at all), a social video was generated, charged, stored, and
      // never written onto the post it was made for. `social_posts.video_url` was reachable
      // only through the Replicate path.
      // CHECKED: reporting `post_id` back over a rejected update would tell the caller the reel
      // is on the draft when it is not, and the next step (publish) would send a post with no
      // video and no error anywhere.
      let attachError: string | null = null;
      if (post_id && veoResult.video_url) {
        const { data: existingPost } = await supabase
          .from('social_posts').select('credits_used, credits_breakdown').eq('id', post_id).single();
        if (existingPost) {
          const spent = Number(veoResult.credits_used) || 0;
          const { error: attachErr } = await supabase.from('social_posts').update({
            video_url: veoResult.video_url,
            credits_used: (existingPost.credits_used || 0) + spent,
            credits_breakdown: { ...(existingPost.credits_breakdown || {}), video: spent },
          }).eq('id', post_id);
          if (attachErr) {
            console.error('[generate-social-video] video generated but the post attach FAILED', attachErr);
            attachError = attachErr.message;
          }
        } else {
          attachError = 'That post does not exist.';
        }
      }
      // …and point the generator's own job row back at the post, so a job that finishes later
      // can still find where its video belongs. The generator does not know about social posts,
      // so this is the only place the link can be made. Best-effort and logged: losing the link
      // costs a later collection, it does not invalidate the video that was just made.
      if (post_id && veoResult.job_id) {
        const { error: linkErr } = await supabase.from('generation_videos')
          .update({ social_post_id: post_id }).eq('id', veoResult.job_id);
        if (linkErr) console.error('[generate-social-video] could not link job to post:', linkErr.message);
      }

      return jsonResponse({
        success: true,
        video_url: veoResult.video_url ?? null,
        job_id: veoResult.job_id,
        post_id: attachError ? null : (post_id ?? null),
        ...(attachError ? { attach_error: `The video is ready but could not be attached to the post: ${attachError}` } : {}),
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
        post_id: post_id ?? null,
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
        // Which post this is FOR (#378 N7). The video URL is written onto the post on success, so
        // the relationship existed in one direction only: from the generation there was no way
        // back, and nothing could say what a video cost and what it was for without parsing URLs.
        social_post_id: post_id ?? null,
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
        post_id: post_id ?? null,
        model_used: model,
        credits_used: creditCost,
        message: 'Video is being generated. Poll it with { action: "status", job_id } — that call '
          + 'collects the finished render, stores it and attaches it to the post.',
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
