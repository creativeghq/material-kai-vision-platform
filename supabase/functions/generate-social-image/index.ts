/**
 * Generate Social Image Edge Function
 *
 * Routes to the best AI image model based on content type:
 *   lifestyle / people  → xAI Aurora (grok-2-aurora)   10 credits
 *   product / interior  → Gemini Imagen                  5 credits
 *   artistic / textured → FLUX 2 Pro (Replicate)         6 credits
 *
 * Credits are debited upfront and are non-refundable.
 * Stores result in Supabase Storage and updates social_posts.
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse } from '../_shared/http.ts';
import { createClient } from '@supabase/supabase-js';
import { replicateToken } from '../_shared/replicate-token.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { fetchImageGuarded } from '../_shared/fetch-image.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const XAI_API_KEY = () => Deno.env.get('XAI_API_KEY') || '';
const GEMINI_API_KEY = () => Deno.env.get('GEMINI_API_KEY') || '';

type ImageModel = 'aurora' | 'gemini' | 'flux' | 'auto';
type ImageType = 'lifestyle' | 'product' | 'interior' | 'artistic';
type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

const MODEL_SERVICE_KEYS: Record<Exclude<ImageModel, 'auto'>, string> = {
  aurora: 'xai-aurora',
  gemini: 'flux-2-pro', // Gemini billed at cheapest rate; actual Gemini billing via AI usage logs
  flux:   'flux-2-pro',
};

const CREDIT_COSTS: Record<Exclude<ImageModel, 'auto'>, number> = {
  aurora: 10,
  gemini: 5,
  flux:   6,
};

const ASPECT_RATIO_TO_SIZE: Record<AspectRatio, string> = {
  '1:1':  '1024x1024',
  '4:5':  '1024x1280',
  '9:16': '1024x1792',
  '16:9': '1792x1024',
};

function autoSelectModel(imageType: ImageType): Exclude<ImageModel, 'auto'> {
  switch (imageType) {
    case 'lifestyle': return 'aurora';
    case 'product':
    case 'interior':  return 'gemini';
    case 'artistic':  return 'flux';
    default:          return 'aurora';
  }
}


// ── xAI Aurora (OpenAI-compatible) ───────────────────────────────────────────
async function generateWithAurora(prompt: string, size: string): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'grok-2-aurora', prompt, n: 1, size }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Aurora API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { data: Array<{ url?: string; b64_json?: string }> };
  const imageData = data.data?.[0];
  if (!imageData?.url && !imageData?.b64_json) throw new Error('Aurora returned no image');
  return imageData.url || `data:image/png;base64,${imageData.b64_json}`;
}

// ── Google Gemini Imagen ──────────────────────────────────────────────────────
async function generateWithGemini(prompt: string, aspectRatio: AspectRatio): Promise<string> {
  const geminiAspect = aspectRatio === '1:1' ? '1:1'
    : aspectRatio === '9:16' ? '9:16'
    : aspectRatio === '16:9' ? '16:9'
    : '4:5';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: geminiAspect },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { predictions: Array<{ bytesBase64Encoded: string }> };
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Gemini returned no image');
  return `data:image/png;base64,${b64}`;
}

// ── Replicate FLUX 2 Pro ──────────────────────────────────────────────────────
async function generateWithFlux(prompt: string, aspectRatio: AspectRatio): Promise<string> {
  const fluxAspect = aspectRatio === '9:16' ? '9:16'
    : aspectRatio === '16:9' ? '16:9'
    : aspectRatio === '4:5' ? '4:5'
    : '1:1';

  const token = await replicateToken();
  const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: fluxAspect,
        output_format: 'webp',
        output_quality: 90,
        num_outputs: 1,
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Replicate FLUX error ${createRes.status}: ${text}`);
  }

  const prediction = await createRes.json() as { id: string; urls: { get: string } };
  const pollUrl = `https://api.replicate.com/v1/predictions/${prediction.id}`;

  const maxMs = 60_000;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(pollUrl, {
      headers: { 'Authorization': `Token ${token}` },
    });
    const status = await pollRes.json() as { status: string; output?: string[]; error?: string };

    if (status.status === 'succeeded' && status.output?.[0]) return status.output[0];
    if (status.status === 'failed') throw new Error(`FLUX failed: ${status.error || 'unknown'}`);
  }

  throw new Error('FLUX generation timed out after 60s');
}

// ── Upload image URL/base64 to Supabase Storage ───────────────────────────────
async function storeImage(
  supabase: DbClient,
  imageData: string,
  filename: string,
): Promise<string> {
  if (imageData.startsWith('http')) {
    // Through the shared guard (#364 EX-7): this was a bare `fetch(imageData)` with redirects
    // followed, no `res.ok` check and no size cap, so an error page was uploaded as `image/webp`
    // and served to the user as their generated image.
    const { bytes } = await fetchImageGuarded(imageData, { maxBytes: 32 * 1024 * 1024 });
    const { data, error } = await supabase.storage
      .from('generation-images')
      .upload(`social/${filename}`, bytes, { contentType: 'image/webp', upsert: true });
    // Returning `imageData` here handed back the PROVIDER's URL, which expires within the hour —
    // the caller then persisted an expiring link onto social_posts.image_urls and the picture was
    // gone by the time the post published. Throw instead; the caller refunds and reports.
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    const { data: urlData } = supabase.storage.from('generation-images').getPublicUrl(data.path);
    return urlData.publicUrl;
  }

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

  return imageData;
}

Deno.serve(withApiLogging('generate-social-image', async (req) => {
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
    model = 'auto' as ImageModel,
    aspect_ratio = '1:1' as AspectRatio,
    post_id,
    // The caller's target channel. It was accepted by the tool, sent on the wire and never read
    // here, so the fallback draft below was hardcoded `instagram` — a LinkedIn image filed under
    // the wrong platform, in a table whose analytics group BY platform.
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

    // Both ids were checked, INDEPENDENTLY, and nothing compared them to each other. For a user
    // who belongs to two workspaces that is a charge/write split: `workspace_id: A` routes the
    // debit to A's pool (see the 7th argument to debitExternalServiceCredits below), while
    // `post_id` pointing at a post in B is where the image actually lands. A pays, B receives.
    // Both ownership checks pass, nothing raises, and the spend appears against a workspace that
    // has nothing to show for it. (#365 AD-30, same shape as EX-1 in #364)
    //
    // The POST's workspace wins, because that is where the work is delivered.
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

  const resolvedModel: Exclude<ImageModel, 'auto'> = model === 'auto'
    ? autoSelectModel(image_type)
    : model as Exclude<ImageModel, 'auto'>;

  const creditCost = CREDIT_COSTS[resolvedModel];
  const serviceKey = MODEL_SERVICE_KEYS[resolvedModel];

  // ① Debit credits BEFORE the upstream image generation (invariant #10 — debit-before,
  // refund-on-failure). Never a non-atomic pre-flight read + deduct-on-success: a race
  // between the read and the charge delivers a free image.
  const debitResult = await debitExternalServiceCredits(
    supabase, userId, serviceKey, 'social_image_generation', 1,
    { model: resolvedModel, image_type, aspect_ratio, workspace_id, post_id },
    // 7th arg. Omitting it sent p_workspace_id: null, so the debit ALWAYS hit the caller's
    // personal wallet — a workspace with a funded shared pool still drained individual
    // members' credits, and the per-member monthly cap never applied. Every other generator
    // in this family passes it.
    workspace_id ?? null,
  );
  // What was ACTUALLY charged, derived from ai_model_pricing inside the debit. `creditCost` is
  // a pre-flight estimate and drifts from it — xai-aurora bills 10.5 and was reported as 10,
  // flux-2-pro bills 6.0 and was reported as 5. Persisting the estimate was a second
  // derivation of a money quantity (anti-regression rule #1).
  if (!debitResult.success) {
    return jsonResponse({ success: false, error: debitResult.error || 'Insufficient credits', required: creditCost }, 402);
  }

  try {
    // ③ Generate image
    let imageUrl: string;
    const size = ASPECT_RATIO_TO_SIZE[aspect_ratio];

    switch (resolvedModel) {
      case 'aurora':
        imageUrl = await generateWithAurora(prompt, size);
        break;
      case 'gemini':
        imageUrl = await generateWithGemini(prompt, aspect_ratio);
        break;
      case 'flux':
        imageUrl = await generateWithFlux(prompt, aspect_ratio);
        break;
    }

    // ④ Store in Supabase Storage
    const filename = `${Date.now()}-${resolvedModel}.${resolvedModel === 'flux' ? 'webp' : 'png'}`;
    const storedUrl = await storeImage(supabase, imageUrl!, filename);

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
            generation_model: resolvedModel,
          })
          .eq('id', post_id);
      }
    } else if (workspace_id) {
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
        generation_model: resolvedModel,
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
      model_used: resolvedModel,
      credits_used: debitResult.credits_debited,
      credits_remaining: debitResult.new_balance,
      aspect_ratio,
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
        p_metadata: { model: resolvedModel, error: String(err) },
        // Refund to the SAME wallet the debit came from, or the money lands in the wrong
        // place on failure.
        p_workspace_id: workspace_id ?? null,
      }).then(() => {}, () => {});
    }
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
