/** Generate Social Image Edge Function */

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse } from '../_shared/http.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { debitExternalServiceCredits, recordExternalServiceOutcome } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { generateImageWithGemini } from '../_shared/ai-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

type ImageType = 'lifestyle' | 'product' | 'interior' | 'artistic';
type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

const IMAGE_MODEL = 'gemini-nano-banana-2.1' as const;
const ACCEPTED_MODELS = new Set(['auto', 'gemini']);
const CREDIT_ESTIMATE = 6;

// ── Upload the base64 image to Supabase Storage ──────────────────────────────
async function storeImage(
  supabase: DbClient,
  imageData: string,
  filename: string,
): Promise<string> {
  if (imageData.startsWith('data:')) {
    const base64Data = imageData.split(',')[1];
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const { data, error } = await supabase.storage
      .from('generation-images')
      .upload(`social/${filename}`, bytes, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    const { data: urlData } = supabase.storage.from('generation-images').getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  // Passing anything else through is a failure the caller cannot detect and the refund never sees.
  throw new Error(`Generator returned no usable image (got ${JSON.stringify(imageData.slice(0, 40))})`);
}

Deno.serve(withApiLogging('generate-social-image', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const userId = auth.user.id;

  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const body = await req.json();
  const {
    prompt,
    image_type = 'lifestyle' as ImageType,
    model = 'auto',
    aspect_ratio = '1:1' as AspectRatio,
    post_id,
    // The draft below was hardcoded `instagram`, in a table whose analytics group BY platform.
    platform,
  } = body;
  // Reassigned below when a post_id pins the workspace — the post's workspace is authoritative,
  // so the debit and the write cannot land in different tenants. (#365 AD-30)
  let workspace_id: string | null | undefined = body.workspace_id;

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

    // Both ids were checked, INDEPENDENTLY, and nothing compared them to each other. For a user
    // who belongs to two workspaces that is a charge/write split: `workspace_id: A` routes the
    // debit to A's pool (see the 7th argument to debitExternalServiceCredits below), while
    // `post_id` pointing at a post in B is where the image actually lands. A pays, B receives.
    // Both ownership checks pass, nothing raises, and the spend appears against a workspace that
    // has nothing to show for it. (#365 AD-30, same shape as EX-1 in #364)
    const postWorkspace = (existingPost as { workspace_id: string }).workspace_id;
    if (workspace_id && workspace_id !== postWorkspace) {
      return jsonResponse({
        success: false,
        error: 'workspace_id does not match the post’s workspace — refusing to bill one workspace for another’s image',
      }, 400);
    }
    workspace_id = postWorkspace;
  }


  if (!prompt) return jsonResponse({ success: false, error: 'prompt is required' }, 400);

  if (!ACCEPTED_MODELS.has(model)) {
    return jsonResponse({ success: false, error: "model must be 'auto' or 'gemini'" }, 400);
  }

  // ① Debit credits BEFORE the upstream image generation (invariant #10 — debit-before,
  // refund-on-failure). Never a non-atomic pre-flight read + deduct-on-success: a race
  // between the read and the charge delivers a free image.
  const operationType = body.purpose === 'article' ? 'seo_article_image' : 'social_image_generation';
  const debitResult = await debitExternalServiceCredits(
    supabase, userId, IMAGE_MODEL, operationType, 1,
    { model: IMAGE_MODEL, image_type, aspect_ratio, workspace_id, post_id, purpose: body.purpose ?? 'social' },
    // 7th arg. Omitting it sent p_workspace_id: null, so the debit ALWAYS hit the caller's
    // personal wallet — a workspace with a funded shared pool still drained individual
    // members' credits, and the per-member monthly cap never applied. Every other generator
    // in this family passes it.
    workspace_id ?? null,
  );
  if (!debitResult.success) {
    return jsonResponse({ success: false, error: debitResult.error || 'Insufficient credits', required: CREDIT_ESTIMATE }, 402);
  }

  try {
    // ③ Generate. The debit above already wrote this image's cost row, so the client logs failures only.
    const img = await generateImageWithGemini(prompt, {
      userId, workspaceId: workspace_id ?? undefined, task: operationType, logUsage: false,
      model: IMAGE_MODEL, aspectRatio: aspect_ratio,
    });
    const imageUrl = `data:${img.mimeType};base64,${img.base64}`;

    await recordExternalServiceOutcome(supabase, debitResult.usage_log_id, true);

    // ④ Store in Supabase Storage
    const filename = `${Date.now()}-gemini.png`;
    const storedUrl = await storeImage(supabase, imageUrl, filename);

    // ⑥ Update social_posts if post_id provided
    // `attachedPostId` is what the response reports: the caller needs to know WHICH draft now
    // holds this image, whether it was theirs or the one created below. Without it the tool
    // could only say "here is a URL", so the next step had to re-attach it by hand.
    let attachedPostId: string | null = post_id ?? null;
    if (post_id) {
      const { data: existingPost } = await supabase
        .from('social_posts')
        .select('credits_used, credits_breakdown, image_urls')
        .eq('id', post_id)
        .single();

      if (existingPost) {
        const newBreakdown = { ...(existingPost.credits_breakdown || {}), image: debitResult.credits_debited };
        const newImageUrls = [...(existingPost.image_urls || []), storedUrl];
        await supabase
          .from('social_posts')
          .update({
            image_urls: newImageUrls,
            credits_used: (existingPost.credits_used || 0) + debitResult.credits_debited,
            credits_breakdown: newBreakdown,
            generation_model: IMAGE_MODEL,
          })
          .eq('id', post_id);
      }
    } else if (workspace_id && body.purpose !== 'article') {
      // Reported, not thrown: the credits are debited and the image is already stored, and the
      // response below hands the caller `image_url` either way — so failing here would take
      // away something they have. But a discarded result meant the draft never appeared in the
      // workspace's planner and nothing said why (#347 audit).
      const { data: newPost, error: postErr } = await supabase.from('social_posts').insert({
        workspace_id,
        user_id: userId,
        platform: typeof platform === 'string' && platform ? platform : 'instagram',
        post_type: 'image',
        image_urls: [storedUrl],
        status: 'draft',
        credits_used: debitResult.credits_debited,
        credits_breakdown: { image: debitResult.credits_debited },
        generation_model: IMAGE_MODEL,
        metadata: { prompt, image_type, aspect_ratio },
      }).select('id').single();
      if (postErr) {
        console.error('[generate-social-image] image stored but the draft post row FAILED', postErr);
      }
      attachedPostId = newPost?.id ?? null;
    }

    return jsonResponse({
      success: true,
      image_url: storedUrl,
      post_id: attachedPostId,
      model_used: IMAGE_MODEL,
      credits_used: debitResult.credits_debited,
      credits_remaining: debitResult.new_balance,
      aspect_ratio: aspect_ratio,
      aspect_ratio_requested: aspect_ratio,
      aspect_ratio_enforced: true,
    });

  } catch (err) {
    console.error('[generate-social-image] Error:', err);
    // Refund the upfront debit — no usable image was delivered.
    if (debitResult.success && debitResult.credits_debited > 0) {
      await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: debitResult.credits_debited,
        p_operation_type: 'social_image_generation_refund',
        p_description: 'Refund: social image generation failed',
        p_metadata: { model: IMAGE_MODEL, error: String(err) },
        // Refund to the SAME wallet the debit came from, or the money lands in the wrong
        // place on failure.
        p_workspace_id: workspace_id ?? null,
      }).then(() => {}, () => {});
    }
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
