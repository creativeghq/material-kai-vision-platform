/**
 * generate-pbr-maps
 *
 * Generates PBR (Physically Based Rendering) texture maps from a product image.
 * Uses a multi-strategy approach:
 *   1. Try MIVAA backend SVBRDF extraction endpoint
 *   2. Fallback: use Replicate for normal map generation + source as albedo
 *   3. Last resort: source image as albedo with partial status
 *
 * Stores results in Supabase Storage and updates product metadata JSONB.
 *
 * Credits: 8
 * Requires: REPLICATE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const replicateToken = Deno.env.get('REPLICATE_API_TOKEN') || '';
const mivaaBaseUrl = Deno.env.get('MIVAA_BACKEND_URL') || '';

const CREDIT_COST = 8;
const REPLICATE_NORMAL_MODEL = 'cjwbw/controlnet-normal';
const REPLICATE_IMG2IMG_MODEL = 'stability-ai/stable-diffusion-img2img';
const MAX_POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 4000;

interface PbrRequest {
  product_id: string;
  source_image_url: string;
  user_id?: string;
  generate_tileable?: boolean;
}

interface PbrMaps {
  albedo_url: string;
  normal_url: string | null;
  roughness_url: string | null;
  metalness_url: string | null;
  tileable_url: string | null;
  status: 'completed' | 'partial' | 'failed';
  generated_at: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Storage helpers ──────────────────────────────────────────────────────────

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download image: ${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  return { bytes, contentType };
}

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  imageSource: string | Uint8Array,
  productId: string,
  mapType: string,
  contentType = 'image/jpeg',
): Promise<string> {
  let bytes: Uint8Array;

  if (typeof imageSource === 'string') {
    const downloaded = await downloadImage(imageSource);
    bytes = downloaded.bytes;
    contentType = downloaded.contentType;
  } else {
    bytes = imageSource;
  }

  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `pbr-maps/${productId}/${mapType}.${ext}`;

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed (${mapType}): ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

// ── Credit helpers ───────────────────────────────────────────────────────────

async function deductCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  description: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('debit_user_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'pbr_generation',
    p_description: description,
  });
  if (error) throw new Error(`Credit deduction failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (row && !row.success) throw new Error(`Credit deduction failed: ${row.error_message}`);
}

async function checkCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`Failed to check credits: ${error.message}`);
  return data?.balance ?? 0;
}

// ── Replicate helpers ────────────────────────────────────────────────────────

async function callReplicate(
  model: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (!replicateToken) throw new Error('REPLICATE_API_TOKEN not configured');

  const createResp = await fetch(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${replicateToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({ input }),
    },
  );

  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`Replicate create failed (${createResp.status}): ${err}`);
  }

  const prediction = await createResp.json();

  if (prediction.status === 'succeeded') {
    return prediction.output;
  }

  if (prediction.status === 'failed') {
    throw new Error(`Replicate prediction failed: ${prediction.error}`);
  }

  // Poll for completion
  const predictionId = prediction.id;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusResp = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { 'Authorization': `Bearer ${replicateToken}` } },
    );

    if (!statusResp.ok) continue;
    const status = await statusResp.json();

    if (status.status === 'succeeded') {
      return status.output;
    }

    if (status.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${status.error}`);
    }
  }

  throw new Error(`Replicate prediction timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

function extractOutputUrl(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  throw new Error('Unexpected output format from Replicate');
}

// ── MIVAA SVBRDF extraction ─────────────────────────────────────────────────

async function tryMivaaSvbrdf(
  sourceImageUrl: string,
): Promise<{ normal: string; roughness: string; metalness: string } | null> {
  if (!mivaaBaseUrl) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const resp = await fetch(`${mivaaBaseUrl}/api/svbrdf/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ image_url: sourceImageUrl }),
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn(`[generate-pbr-maps] MIVAA SVBRDF returned ${resp.status}`);
      return null;
    }

    const result = await resp.json();
    if (result.normal_url && result.roughness_url) {
      return {
        normal: result.normal_url,
        roughness: result.roughness_url,
        metalness: result.metalness_url || null,
      };
    }

    return null;
  } catch (err) {
    console.warn('[generate-pbr-maps] MIVAA SVBRDF unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Replicate-based normal map generation ────────────────────────────────────

async function generateNormalMap(sourceImageUrl: string): Promise<string | null> {
  try {
    console.log('[generate-pbr-maps] Attempting normal map via Replicate controlnet-normal');
    const output = await callReplicate(REPLICATE_NORMAL_MODEL, {
      image: sourceImageUrl,
      prompt: 'normal map of this surface material texture',
      num_samples: '1',
      image_resolution: '512',
      ddim_steps: 20,
      scale: 9,
    });
    return extractOutputUrl(output);
  } catch (err) {
    console.warn('[generate-pbr-maps] controlnet-normal failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Tileable texture generation ──────────────────────────────────────────────

async function generateTileableTexture(sourceImageUrl: string): Promise<string | null> {
  try {
    console.log('[generate-pbr-maps] Generating tileable version via img2img');
    const output = await callReplicate(REPLICATE_IMG2IMG_MODEL, {
      image: sourceImageUrl,
      prompt: 'seamless tileable texture version of this material surface, perfectly repeating pattern, no visible seams',
      negative_prompt: 'seams, borders, edges, watermark, text, logo, low quality',
      prompt_strength: 0.45,
      num_inference_steps: 30,
      guidance_scale: 7.5,
    });
    return extractOutputUrl(output);
  } catch (err) {
    console.warn('[generate-pbr-maps] tileable generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Product metadata helpers ─────────────────────────────────────────────────

async function getProductMetadata(
  supabase: ReturnType<typeof createClient>,
  productId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('products')
    .select('metadata')
    .eq('id', productId)
    .single();
  if (error) throw new Error(`Failed to fetch product: ${error.message}`);
  return (data?.metadata as Record<string, unknown>) || {};
}

async function updateProductPbrMaps(
  supabase: ReturnType<typeof createClient>,
  productId: string,
  pbrMaps: PbrMaps,
): Promise<void> {
  const existingMeta = await getProductMetadata(supabase, productId);
  const updatedMeta = { ...existingMeta, pbr_maps: pbrMaps };

  const { error } = await supabase
    .from('products')
    .update({ metadata: updatedMeta })
    .eq('id', productId);
  if (error) throw new Error(`Failed to update product metadata: ${error.message}`);
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(withApiLogging('generate-pbr-maps', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let userId: string;

  if (token === supabaseServiceKey) {
    // Internal server-to-server call — user_id must be in body
    const rawBody = await req.json() as PbrRequest;
    if (!rawBody.user_id) {
      return jsonResponse({ success: false, error: 'user_id required for internal calls' }, 400);
    }
    userId = rawBody.user_id;
    return await handleRequest(supabase, rawBody, userId);
  }

  // User JWT validation
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }
  userId = user.id;

  let body: PbrRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  return await handleRequest(supabase, body, userId);
}));

async function handleRequest(
  supabase: ReturnType<typeof createClient>,
  body: PbrRequest,
  userId: string,
): Promise<Response> {
  const { product_id, source_image_url, generate_tileable = true } = body;

  // ── Validate inputs ────────────────────────────────────────────────────────
  if (!product_id) {
    return jsonResponse({ success: false, error: 'product_id is required' }, 400);
  }
  if (!source_image_url) {
    return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);
  }

  // ── Check credits ──────────────────────────────────────────────────────────
  try {
    const balance = await checkCredits(supabase, userId);
    if (balance < CREDIT_COST) {
      return jsonResponse({
        success: false,
        error: `Insufficient credits. Required: ${CREDIT_COST}, available: ${balance}`,
      }, 402);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-pbr-maps] Credit check error:', message);
    return jsonResponse({ success: false, error: message }, 500);
  }

  try {
    console.log(`[generate-pbr-maps] Starting PBR generation for product ${product_id}`);

    const pbrMaps: PbrMaps = {
      albedo_url: '',
      normal_url: null,
      roughness_url: null,
      metalness_url: null,
      tileable_url: null,
      status: 'partial',
      generated_at: new Date().toISOString(),
    };

    // ── Step 1: Upload source image as albedo ────────────────────────────────
    console.log('[generate-pbr-maps] Uploading albedo (source image)');
    pbrMaps.albedo_url = await uploadToStorage(
      supabase,
      source_image_url,
      product_id,
      'albedo',
    );

    // ── Step 2: Try MIVAA SVBRDF extraction first ────────────────────────────
    const svbrdfResult = await tryMivaaSvbrdf(source_image_url);

    if (svbrdfResult) {
      console.log('[generate-pbr-maps] MIVAA SVBRDF extraction succeeded');

      // Upload SVBRDF maps to our storage (parallel for lower latency)
      const uploadPromises = [
        uploadToStorage(supabase, svbrdfResult.normal, product_id, 'normal'),
        uploadToStorage(supabase, svbrdfResult.roughness, product_id, 'roughness'),
        ...(svbrdfResult.metalness
          ? [uploadToStorage(supabase, svbrdfResult.metalness, product_id, 'metalness')]
          : []),
      ];
      const uploadResults = await Promise.all(uploadPromises);
      pbrMaps.normal_url = uploadResults[0];
      pbrMaps.roughness_url = uploadResults[1];
      if (svbrdfResult.metalness) {
        pbrMaps.metalness_url = uploadResults[2];
      }
      pbrMaps.status = 'completed';
    } else {
      // ── Step 3: Fallback to Replicate for normal map ─────────────────────
      console.log('[generate-pbr-maps] MIVAA unavailable, falling back to Replicate');

      const normalMapUrl = await generateNormalMap(source_image_url);
      if (normalMapUrl) {
        pbrMaps.normal_url = await uploadToStorage(
          supabase,
          normalMapUrl,
          product_id,
          'normal',
        );
        pbrMaps.status = 'completed';
      } else {
        console.warn('[generate-pbr-maps] Normal map generation failed, status will be partial');
      }
    }

    // ── Step 4: Generate tileable texture if requested ────────────────────────
    if (generate_tileable) {
      const tileableUrl = await generateTileableTexture(source_image_url);
      if (tileableUrl) {
        pbrMaps.tileable_url = await uploadToStorage(
          supabase,
          tileableUrl,
          product_id,
          'tileable',
        );
      }
    }

    // ── Step 5: Update product metadata ──────────────────────────────────────
    await updateProductPbrMaps(supabase, product_id, pbrMaps);

    // ── Step 6: Deduct credits ───────────────────────────────────────────────
    await deductCredits(
      supabase,
      userId,
      CREDIT_COST,
      `PBR map generation for product ${product_id} (status: ${pbrMaps.status})`,
    );

    console.log(`[generate-pbr-maps] Complete. Status: ${pbrMaps.status}`);

    return jsonResponse({
      success: true,
      product_id,
      pbr_maps: pbrMaps,
      credits_used: CREDIT_COST,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-pbr-maps] Error:', message);
    return jsonResponse({ success: false, error: message }, 500);
  }
}
