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

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { debitExternalServiceCredits, checkCreditBalance } from '../_shared/credit-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const XAI_API_KEY = Deno.env.get('XAI_API_KEY') || '';
const GEMINI_API_KEY = () => Deno.env.get('GEMINI_API_KEY') || '';
const REPLICATE_API_KEY = () => Deno.env.get('REPLICATE_API_KEY') || '';

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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── xAI Aurora (OpenAI-compatible) ───────────────────────────────────────────
async function generateWithAurora(prompt: string, size: string): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
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

  const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_KEY()}`,
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
      headers: { 'Authorization': `Token ${REPLICATE_API_KEY()}` },
    });
    const status = await pollRes.json() as { status: string; output?: string[]; error?: string };

    if (status.status === 'succeeded' && status.output?.[0]) return status.output[0];
    if (status.status === 'failed') throw new Error(`FLUX failed: ${status.error || 'unknown'}`);
  }

  throw new Error('FLUX generation timed out after 60s');
}

// ── Upload image URL/base64 to Supabase Storage ───────────────────────────────
async function storeImage(
  supabase: ReturnType<typeof createClient>,
  imageData: string,
  filename: string,
): Promise<string> {
  if (imageData.startsWith('http')) {
    const imgRes = await fetch(imageData);
    const arrayBuffer = await imgRes.arrayBuffer();
    const { data, error } = await supabase.storage
      .from('generation-images')
      .upload(`social/${filename}`, arrayBuffer, { contentType: 'image/webp', upsert: true });
    if (error) return imageData;
    const { data: urlData } = supabase.storage.from('generation-images').getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  if (imageData.startsWith('data:')) {
    const base64Data = imageData.split(',')[1];
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const { data, error } = await supabase.storage
      .from('generation-images')
      .upload(`social/${filename}`, bytes, { contentType: 'image/png', upsert: true });
    if (error) return imageData;
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
    workspace_id,
    post_id,
  } = body;

  if (!prompt) return jsonResponse({ success: false, error: 'prompt is required' }, 400);

  const resolvedModel: Exclude<ImageModel, 'auto'> = model === 'auto'
    ? autoSelectModel(image_type)
    : model as Exclude<ImageModel, 'auto'>;

  const creditCost = CREDIT_COSTS[resolvedModel];
  const serviceKey = MODEL_SERVICE_KEYS[resolvedModel];

  // ① Pre-flight check
  const { sufficient, balance } = await checkCreditBalance(supabase, userId, serviceKey);
  if (!sufficient) {
    return jsonResponse({ success: false, error: 'Insufficient credits', balance, required: creditCost }, 402);
  }

  // ② Debit upfront — non-refundable
  const debitResult = await debitExternalServiceCredits(
    supabase, userId, serviceKey, 'social_image_generation', 1,
    { model: resolvedModel, image_type, aspect_ratio, workspace_id, post_id },
  );
  if (!debitResult.success) {
    return jsonResponse({ success: false, error: debitResult.error || 'Credit debit failed' }, 402);
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

    // ⑤ Update social_posts if post_id provided
    if (post_id) {
      const { data: existingPost } = await supabase
        .from('social_posts')
        .select('credits_used, credits_breakdown, image_urls')
        .eq('id', post_id)
        .single();

      if (existingPost) {
        const newBreakdown = { ...(existingPost.credits_breakdown || {}), image: creditCost };
        const newImageUrls = [...(existingPost.image_urls || []), storedUrl];
        await supabase
          .from('social_posts')
          .update({
            image_urls: newImageUrls,
            credits_used: (existingPost.credits_used || 0) + creditCost,
            credits_breakdown: newBreakdown,
            generation_model: resolvedModel,
          })
          .eq('id', post_id);
      }
    } else if (workspace_id) {
      await supabase.from('social_posts').insert({
        workspace_id,
        user_id: userId,
        platform: 'instagram',
        post_type: 'image',
        image_urls: [storedUrl],
        status: 'draft',
        credits_used: creditCost,
        credits_breakdown: { image: creditCost },
        generation_model: resolvedModel,
        metadata: { prompt, image_type, aspect_ratio },
      });
    }

    return jsonResponse({
      success: true,
      image_url: storedUrl,
      model_used: resolvedModel,
      credits_used: creditCost,
      credits_remaining: debitResult.new_balance,
      aspect_ratio,
    });

  } catch (err) {
    console.error('[generate-social-image] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
