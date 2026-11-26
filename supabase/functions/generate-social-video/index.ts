/** Generate Social Video Edge Function — every model runs in generate-interior-video-v2. */

import { jsonResponse } from '../_shared/http.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Must be generate-interior-video-v2 VideoModel keys; the generator prices and charges them.
const SUPPORTED_MODELS = new Set<string>([
  'kling-v4.0', 'gemini-omni-1.2-flash-1080p', 'wan-3.0-480p', 'wan-3.0-720p', 'wan-3.0-1080p',
  'seedance-2.5-480p', 'seedance-2.5-720p',
  'h3-max-768p', 'h3-max-480p',
  'ray-3.2-720p', 'ray-3.2-1080p',
]);

Deno.serve(withApiLogging('generate-social-video', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const userId = auth.user.id;

  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const body = await req.json();

  // ── action: 'status' — where a job stands ──
  if (body?.action === 'status') {
    const jobId = typeof body.job_id === 'string' ? body.job_id : '';
    if (!jobId) return jsonResponse({ success: false, error: 'job_id is required' }, 400);

    const { data: job } = await supabase
      .from('generation_videos')
      .select('id, user_id, workspace_id, status, video_url, model, duration_s, credits_used, replicate_prediction_id, social_post_id, error_message')
      .eq('id', jobId)
      .maybeSingle();
    // 404 on a job in another tenant, never 403 — same reason as the post check below.
    if (!job || !(await userHasWorkspaceCapability(supabase, userId, (job as { workspace_id: string }).workspace_id, 'marketing.seo'))) {
      return jsonResponse({ success: false, error: 'Not found' }, 404);
    }

    if (job.status === 'completed' && job.video_url) {
      return jsonResponse({ success: true, status: 'completed', video_url: job.video_url, job_id: jobId, post_id: job.social_post_id ?? null });
    }
    if (job.status === 'failed') {
      return jsonResponse({ success: false, status: 'failed', error: job.error_message || 'The video generation failed.', job_id: jobId }, 200);
    }
    // A slow render is collected by generate-interior-video-v2's cron, which also attaches it to the post.
    return jsonResponse({ success: true, status: job.status || 'processing', job_id: jobId, post_id: job.social_post_id ?? null });
  }

  const {
    prompt,
    source_image_url,
    // Wan-only, forwarded to the generator, which is where they are SSRF-checked —
    // this function never fetches them itself.
    reference_image_urls,
    // No default: an explicit pick is never swapped by the generator, so a defaulted model
    // could not fall back when its provider has no key (#540). Absent → the generator's
    // social_reel preference order decides, and the response says which model ran.
    model,
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
  if (workspace_id && !(await userHasWorkspaceCapability(supabase, userId, workspace_id, 'marketing.seo'))) {
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
      || !(await userHasWorkspaceCapability(supabase, userId, (existingPost as { workspace_id: string }).workspace_id, 'marketing.seo'))) {
      return jsonResponse({ success: false, error: 'Not found' }, 404);
    }
  }


  if (!source_image_url) return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);

  // Invariant 7 (#364 EX-7). `source_image_url` is handed to Replicate (and forwarded to
  // generate-interior-video-v2 for delegated models), which fetches it from THEIR network. Validate before
  // it leaves rather than at whichever call site downloads something first.
  try {
    await assertSafeUrl(source_image_url, { allowSchemes: ['https:'] });
  } catch (e) {
    return jsonResponse(
      { success: false, error: e instanceof SSRFError ? `Rejected image URL: ${e.message}` : 'Invalid image URL' },
      400,
    );
  }

  if (model && !SUPPORTED_MODELS.has(model)) {
    return jsonResponse({ success: false, error: `Unknown model '${model}'. Supported: ${[...SUPPORTED_MODELS].join(', ')}` }, 400);
  }

  try {
    {
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
          // The generator clamps per model (15s for Omni, 30s for Wan and Seedance). Clamping to 8
          // here as well would have silently capped every Wan reel at 8 seconds — the
          // exact thing Wan was added to fix.
          duration_seconds,
          video_type: 'social_reel',
          ...(model ? { model } : {}),
          reference_image_urls,
          workspace_id,
        }),
      });
      if (!veoRes.ok) {
        // Surface the downstream failure instead of letting .json() throw opaquely
        // on a non-JSON error body.
        const errText = await veoRes.text().catch(() => '');
        throw new Error(`${model ?? 'social reel'} generation failed (${veoRes.status}): ${errText.substring(0, 300)}`);
      }
      const veoResult = await veoRes.json();
      if (!veoResult.success) {
        throw new Error(veoResult.error || `${model ?? 'social reel'} generation failed`);
      }

      // Attach it to the draft the video was made for.
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
        model_used: veoResult.model_used ?? model ?? null,
        ...(veoResult.substituted_from ? { substituted_from: veoResult.substituted_from } : {}),
        credits_used: veoResult.credits_used,
        status: veoResult.status,
      });
    }
  } catch (err) {
    console.error('[generate-social-video] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
