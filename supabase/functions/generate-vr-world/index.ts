/**
 * Generate VR World Edge Function
 *
 * Orchestrates WorldLabs Marble API to generate explorable 3D worlds
 * from interior design images. Handles:
 * 1. Image upload to WorldLabs
 * 2. World generation via Marble API
 * 3. Polling for completion
 * 4. Storing asset URLs in vr_worlds table
 * 5. Credit debit/refund
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Read at use-site so platform_secrets bootstrap (run in the handler) is honored.
const worldlabsApiKey = () => Deno.env.get('WORLDLABS_API_KEY') || '';

const WORLDLABS_BASE_URL = 'https://api.worldlabs.ai/marble/v1';

// Credit costs per model (raw cost × MARKUP_MULTIPLIER × 100 credits/$)
// WorldLabs pricing: $1 = 1,250 WL credits
// marble-1.0-draft: 230 WL cr = $0.184 raw × 1.50 = $0.276 → 28 credits
// marble-1.1:      1580 WL cr = $1.264 raw × 1.50 = $1.896 → 190 credits
const CREDIT_COSTS: Record<string, number> = {
  'marble-1.0-draft': 28,
  'marble-1.1': 190,
};

// Max polling duration (3 minutes for draft, 7 minutes for 1.1)
const MAX_POLL_DURATION: Record<string, number> = {
  'marble-1.0-draft': 180_000,
  'marble-1.1': 420_000,
};

interface GenerateVRRequest {
  source_image_url: string;
  prompt: string;
  room_type?: string;
  style?: string;
  model?: string;
  is_pano?: boolean;  // Set true for panoramic source images
  user_id?: string;   // Required when called server-to-server with the service role key
}

Deno.serve(withApiLogging('generate-vr-world', async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // Auth: accept service role key (internal call from agent-chat) OR user JWT.
  // Internal callers must pass user_id in the body since there's no JWT to derive it from.
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  let userId: string;
  let body: GenerateVRRequest;

  if (token === supabaseServiceKey) {
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }
    if (!body.user_id) {
      return jsonResponse({ success: false, error: 'user_id required for internal calls' }, 400);
    }
    userId = body.user_id;
  } else {
    const auth = await authenticate(req);
    if (!auth.success || !auth.userId) {
      return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
    }
    userId = auth.userId;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }
  }

  let vrWorldId: string | null = null;

  try {

    if (!body.source_image_url) {
      return jsonResponse({ success: false, error: 'Missing source_image_url' }, 400);
    }
    if (!body.prompt) {
      return jsonResponse({ success: false, error: 'Missing prompt' }, 400);
    }

    const model = body.model || 'marble-1.0-draft';
    const creditCost = CREDIT_COSTS[model] || CREDIT_COSTS['marble-1.0-draft'];

    // Check and debit credits
    const { data: debitResult, error: debitError } = await supabase.rpc('debit_user_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: 'vr_generation',
      p_description: `VR World generation (${model})`,
      p_metadata: { model, source_image_url: body.source_image_url },
    });

    if (debitError || !debitResult?.[0]?.success) {
      const msg = debitResult?.[0]?.error_message || debitError?.message || 'Insufficient credits';
      return jsonResponse({ success: false, error: msg }, 402);
    }

    // Build display name from prompt
    const displayName = body.prompt.length > 60
      ? body.prompt.substring(0, 57) + '...'
      : body.prompt;

    // Insert vr_worlds record
    const { data: vrWorld, error: insertError } = await supabase
      .from('vr_worlds')
      .insert({
        user_id: userId,
        source_image_url: body.source_image_url,
        source_prompt: body.prompt,
        display_name: displayName,
        model,
        status: 'uploading',
        credits_charged: creditCost,
        metadata: {
          room_type: body.room_type,
          style: body.style,
        },
      })
      .select('id')
      .single();

    if (insertError || !vrWorld) {
      // Refund the credits we debited just above. Without this, a transient
      // DB error after debit but before insert leaves the user out of pocket
      // because the catch block's refund relies on `vrWorldId` (which is null
      // here — the insert that would have set it just failed).
      try {
        await supabase.rpc('credit_user_credits', {
          p_user_id: userId,
          p_amount: creditCost,
          p_operation_type: 'vr_generation_refund',
          p_description: 'VR World generation refund (insert_failed)',
          p_metadata: { model, reason: 'vr_worlds insert failed', error: insertError?.message },
        });
      } catch (refundErr) {
        console.error('[generate-vr-world] insert-stage refund failed:', refundErr);
      }
      throw new Error(`Failed to create VR world record: ${insertError?.message}`);
    }

    vrWorldId = vrWorld.id;
    console.log(`[generate-vr-world] Created record ${vrWorldId} for user ${userId}`);

    // Step 1: Upload image to WorldLabs
    console.log(`[generate-vr-world] Uploading image to WorldLabs...`);
    const mediaAsset = await uploadImageToWorldLabs(body.source_image_url);
    console.log(`[generate-vr-world] Image uploaded, media_asset_id: ${mediaAsset.id}`);

    // Step 2: Generate world
    await supabase
      .from('vr_worlds')
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', vrWorldId);

    console.log(`[generate-vr-world] Starting world generation...`);
    const operation = await startWorldGeneration(mediaAsset.id, body.prompt, model, body.is_pano);
    console.log(`[generate-vr-world] Operation started: ${operation.operationId}`);

    await supabase
      .from('vr_worlds')
      .update({
        operation_id: operation.operationId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vrWorldId);

    // Step 3: Poll for completion
    const maxDuration = MAX_POLL_DURATION[model] || 180_000;
    const world = await pollForCompletion(operation.operationId, maxDuration);
    console.log(`[generate-vr-world] World completed: ${world.id}`);

    // Step 4: Extract asset URLs
    const assets = extractAssetUrls(world);

    // Step 5: Update record with completed data
    await supabase
      .from('vr_worlds')
      .update({
        world_id: world.id,
        caption: assets.caption || world.caption || null,
        splat_url_100k: assets.splat100k,
        splat_url_500k: assets.splat500k,
        splat_url_full: assets.splatFull,
        collider_glb_url: assets.colliderGlb,
        panorama_url: assets.panorama,
        thumbnail_url: assets.thumbnail,
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vrWorldId);

    console.log(`[generate-vr-world] Record ${vrWorldId} completed successfully`);

    // Emit flow event (fire-and-forget)
    emitFlowEvent('vr_world_created', {
      world_id: vrWorldId,
      source_image: assets.thumbnail || assets.panorama,
      quality_tier: model,
      user_id: userId,
    }).catch(() => {});

    // Notify user their VR world is ready
    supabase.from('user_notifications').insert({
      user_id: userId,
      type: 'vr_world_ready',
      title: 'Your VR world is ready!',
      body: 'Your 3D environment has been generated and is ready to explore.',
      action_url: null,
      is_read: false,
      metadata: { vr_world_id: vrWorldId },
    }).then(() => {});

    // Return constructed response directly (avoids an extra DB read)
    return jsonResponse({
      success: true,
      data: {
        id: vrWorldId,
        world_id: world.id,
        user_id: userId,
        caption: assets.caption || world.caption || null,
        splat_url_100k: assets.splat100k,
        splat_url_500k: assets.splat500k,
        splat_url_full: assets.splatFull,
        collider_glb_url: assets.colliderGlb,
        panorama_url: assets.panorama,
        thumbnail_url: assets.thumbnail,
        status: 'completed',
      },
    });

  } catch (error) {
    console.error('[generate-vr-world] Error:', error);

    // Update record as failed and refund credits
    if (vrWorldId) {
      try {
        await supabase
          .from('vr_worlds')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', vrWorldId);
      } catch (updateError) {
        console.error('[generate-vr-world] Failed to update status:', updateError);
      }

      // Notify user of failure
      if (userId) {
        supabase.from('user_notifications').insert({
          user_id: userId,
          type: 'vr_world_failed',
          title: 'VR world generation failed',
          body: 'Something went wrong generating your 3D world. Any credits used have been refunded.',
          action_url: null,
          is_read: false,
          metadata: { vr_world_id: vrWorldId },
        }).then(() => {});
      }

      // Refund credits (always runs even if status update fails)
      try {
        const { data: vrRecord } = await supabase
          .from('vr_worlds')
          .select('credits_charged')
          .eq('id', vrWorldId)
          .single();

        if (vrRecord?.credits_charged > 0) {
          await supabase.rpc('credit_user_credits', {
            p_user_id: userId,
            p_amount: vrRecord.credits_charged,
            p_operation_type: 'vr_generation_refund',
            p_description: `VR World generation refund (failed)`,
            p_metadata: { vr_world_id: vrWorldId },
          });
          console.log(`[generate-vr-world] Refunded ${vrRecord.credits_charged} credits to user ${userId}`);
        }
      } catch (refundError) {
        console.error('[generate-vr-world] Refund failed:', refundError);
      }
    } else if (userId) {
      // Failure happened AFTER credit debit but BEFORE vr_worlds row insert
      // (e.g. insert errored at line 145). Without this branch the user has
      // been charged but has no record to drive the refund block above —
      // credits were silently kept by the platform.
      try {
        const creditCost = (typeof body !== 'undefined' && body?.model && CREDIT_COSTS[body.model])
          || CREDIT_COSTS['marble-1.0-draft'];
        await supabase.rpc('credit_user_credits', {
          p_user_id: userId,
          p_amount: creditCost,
          p_operation_type: 'vr_generation_refund',
          p_description: 'VR World generation refund (record creation failed)',
          p_metadata: { failure_stage: 'pre_record_insert' },
        });
        console.log(`[generate-vr-world] Refunded ${creditCost} credits (no vr_world record) to user ${userId}`);
      } catch (refundError) {
        console.error('[generate-vr-world] Pre-record refund failed:', refundError);
      }
    }

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'VR world generation failed',
        vr_world_id: vrWorldId,
      },
      500
    );
  }
}));

// --- WorldLabs API helpers ---

async function uploadImageToWorldLabs(imageUrl: string): Promise<{ id: string }> {
  // First, download the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download source image: ${imageResponse.status}`);
  }
  const imageBlob = await imageResponse.blob();
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

  // Determine file extension
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = extMap[contentType] || 'jpg';
  const filename = `design-image.${ext}`;

  // Prepare upload with WorldLabs
  const prepareResponse = await fetch(`${WORLDLABS_BASE_URL}/media-assets:prepare_upload`, {
    method: 'POST',
    headers: {
      'WLT-Api-Key': worldlabsApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_name: filename,
      kind: 'image',
      extension: ext,
    }),
  });

  if (!prepareResponse.ok) {
    const errText = await prepareResponse.text();
    throw new Error(`WorldLabs prepare-upload failed (${prepareResponse.status}): ${errText}`);
  }

  const prepareData = await prepareResponse.json();
  // WorldLabs returns media_asset_id (not id) in the media_asset object
  const mediaAssetId = prepareData.media_asset?.media_asset_id || prepareData.media_asset?.id;
  const uploadUrl = prepareData.upload_info?.upload_url;
  const requiredHeaders = prepareData.upload_info?.required_headers || {};

  if (!uploadUrl || !mediaAssetId) {
    throw new Error(`WorldLabs prepare-upload returned no upload_url or media_asset.id. Response: ${JSON.stringify(prepareData)}`);
  }

  // Upload the image to the signed URL
  const uploadResponse = await fetch(uploadUrl, {
    method: prepareData.upload_info?.upload_method || 'PUT',
    headers: {
      'Content-Type': contentType,
      ...requiredHeaders,
    },
    body: imageBlob,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`WorldLabs image upload failed (${uploadResponse.status}): ${errText}`);
  }

  return { id: mediaAssetId };
}

async function startWorldGeneration(
  mediaAssetId: string,
  prompt: string,
  model: string,
  isPano?: boolean,
): Promise<{ operationId: string }> {
  const response = await fetch(`${WORLDLABS_BASE_URL}/worlds:generate`, {
    method: 'POST',
    headers: {
      'WLT-Api-Key': worldlabsApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      display_name: prompt.length > 60 ? prompt.substring(0, 57) + '...' : prompt,
      world_prompt: {
        type: 'image',
        image_prompt: {
          source: 'media_asset',
          media_asset_id: mediaAssetId,
        },
        text_prompt: prompt,
        ...(isPano ? { is_pano: true } : {}),
      },
      model,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`WorldLabs worlds:generate failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const operationId = data.operation_id || data.name;

  if (!operationId) {
    throw new Error('WorldLabs worlds:generate returned no operation_id');
  }

  return { operationId };
}

async function pollForCompletion(
  operationId: string,
  maxDurationMs: number,
): Promise<any> {
  const startTime = Date.now();
  let pollInterval = 2000; // Start at 2s
  const maxInterval = 10000; // Cap at 10s

  while (Date.now() - startTime < maxDurationMs) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const response = await fetch(`${WORLDLABS_BASE_URL}/operations/${operationId}`, {
      headers: {
        'WLT-Api-Key': worldlabsApiKey(),
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WorldLabs poll failed (${response.status}): ${errText}`);
    }

    const data = await response.json();

    if (data.done) {
      if (data.error) {
        throw new Error(`WorldLabs generation failed: ${JSON.stringify(data.error)}`);
      }

      // The world data is in data.response
      const world = data.response;
      if (!world) {
        // Try fetching the world directly using world_id from metadata
        const worldId = data.metadata?.world_id;
        if (worldId) {
          return await fetchWorld(worldId);
        }
        throw new Error('WorldLabs generation completed but no world data returned');
      }
      return world;
    }

    // Increase poll interval with backoff
    pollInterval = Math.min(pollInterval + 2000, maxInterval);
  }

  throw new Error(`VR world generation timed out after ${maxDurationMs / 1000}s`);
}

async function fetchWorld(worldId: string): Promise<any> {
  const response = await fetch(`${WORLDLABS_BASE_URL}/worlds/${worldId}`, {
    headers: {
      'WLT-Api-Key': worldlabsApiKey(),
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`WorldLabs fetch world failed (${response.status}): ${errText}`);
  }

  // GET /worlds/{id} wraps the world in { "world": {...} }
  const data = await response.json();
  return data.world ?? data;
}

function extractAssetUrls(world: any): {
  splat100k?: string;
  splat500k?: string;
  splatFull?: string;
  colliderGlb?: string;
  panorama?: string;
  thumbnail?: string;
  caption?: string;
} {
  const a = world.assets || {};
  return {
    splat100k:  a.splats?.spz_urls?.['100k'],
    splat500k:  a.splats?.spz_urls?.['500k'],
    splatFull:  a.splats?.spz_urls?.['full_res'],
    colliderGlb: a.mesh?.collider_mesh_url,
    panorama:   a.imagery?.pano_url,
    thumbnail:  a.thumbnail_url,
    caption:    a.caption,
  };
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
