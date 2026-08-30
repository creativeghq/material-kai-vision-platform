/**
 * generate-interior-gemini
 *
 * Gemini-backed interior design image generation edge function.
 * Handles four modes:
 *   1. text-to-image     — narrative prompt → new room render
 *   2. image-edit        — existing image + instruction → edited image
 *   3. floor-plan-render — floor plan image + style → photorealistic perspective interior render
 *   4. floor-plan-text   — text description → 2D floor plan diagram
 *
 * Models:
 *   - gemini-3.1-flash-image (fast, 6 credits)
 *   - gemini-3-pro-image     (4K quality, 15 credits)
 *
 * Requires: GOOGLE_GENERATIVE_AI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveReplicateToken, REPLICATE_NOT_CONFIGURED } from '../_shared/replicate-token.ts';
import { resolveOutputPath, isPlatformGeneratedImage, type SessionPathCtx } from '../_shared/storage-paths.ts';
import {
  generateImageWithGemini,
  generateImageWithGrok,
  editImageWithGrok,
  type GeminiImageModel,
  type ImageAspectRatio,
} from '../_shared/ai-client.ts';
import {
  buildNarrativePrompt,
  buildFloorPlanRenderPrompt,
  buildFloorPlanDiagramPrompt,
  buildDualReferenceStylePrompt,
} from '../_shared/interior-prompt-builder.ts';
import { getGenerationPrompt, loadPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';
import { resolveGenerationRouting, PRICING_KEY_BY_LABEL } from '../_shared/generation-routing.ts';
import { checkGenerationModelHealth, unavailableMessage } from '../_shared/generation-health.ts';
import {
  buildProductShotPrompt,
  buildProductLifestylePrompt,
  buildMaterialTexturePrompt,
} from '../_shared/product-prompt-builder.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { captureException } from '../_shared/sentry.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

import { fetchImageGuarded } from '../_shared/fetch-image.ts';
import { assertEditableSource } from '../_shared/image-edit-gate.ts';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GOOGLE_API_KEY = () => Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '';

/**
 * Safe chunked base64 encoder — avoids call-stack overflow on large images.
 */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Step 1 of the two-step style-transfer pipeline.
 * Sends the inspiration image to Gemini Vision and returns a structured text
 * design specification covering every visible surface, material, and finish.
 * This spec is then used in Step 2 to edit the room — the inspiration image
 * never reaches the image generator, eliminating spatial bleed entirely.
 */
async function extractDesignSpec(supabase: DbClient, imageBuffer: Uint8Array, style?: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s hard timeout

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GOOGLE_API_KEY()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: toBase64(imageBuffer) } },
              { text: renderPromptTemplate(await loadPrompt(supabase, 'tool', 'interior_aesthetic_analyst'), { style: style ? `\nDESIGN STYLE: ${style}` : '' }) },
            ],
          }],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Design spec extraction failed (${response.status}): ${await response.text()}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
    if (!text) throw new Error('Gemini returned no design spec');
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Step 2 prompt: applies an extracted text design spec to a room image.
 * Used for image-edit mode with a style reference — cosmetic changes only, no fixture replacement.
 * The inspiration image is NOT passed here — only text + room photo.
 */
async function buildApplySpecPrompt(supabase: DbClient, designSpec: string, userInstruction?: string): Promise<string> {
  return renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_apply_spec'), { design_spec: designSpec, user_instruction: userInstruction ? `\nADDITIONAL INSTRUCTION: ${userInstruction}` : '' });
}

/**
 * Step 2 prompt for copy-style mode.
 * Like buildApplySpecPrompt but allows fixture replacement — if the design spec describes
 * a different fixture type (e.g. walk-in shower where a bathtub exists), replace it fully.
 */
async function buildCopyStyleApplyPrompt(supabase: DbClient, designSpec: string, userInstruction?: string): Promise<string> {
  return renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_copy_style_apply'), { design_spec: designSpec, user_instruction: userInstruction ? `\nADDITIONAL INSTRUCTION: ${userInstruction}` : '' });
}

// ── Flux Depth Pro (Replicate) ────────────────────────────────────────────────

const STYLE_VOCAB: Record<string, string> = {
  modern: 'clean lines, neutral palette, functional furniture, minimal clutter, recessed lighting',
  minimalist: 'white surfaces, hidden storage, no ornamentation, single accent material, flooded with natural light',
  scandinavian: 'light birch wood, linen textiles, hygge warmth, muted sage and white palette, indoor plants',
  industrial: 'exposed brick, raw steel, polished concrete, Edison bulbs, dark moody palette',
  luxury: 'marble surfaces, bespoke furniture, statement lighting, rich jewel tones, layered textures',
  mediterranean: 'terracotta tiles, whitewashed plaster, wrought iron, arched openings, warm ochre tones',
  japandi: 'dark stained oak, limewash walls, wabi-sabi textures, low-profile furniture, deep calm palette',
  traditional: 'ornate mouldings, warm walnut wood, plush upholstery, Persian rugs, warm ambient lighting',
  cabin: 'exposed timber beams, wide plank flooring, natural stone, cozy fireside, warm wood tones',
  contemporary: 'bold geometric forms, mixed materials, statement art, dynamic lighting, open plan',
};

/**
 * Build a Flux text prompt for single-image room redesign.
 * No source image content — just the style direction we want applied.
 */
function buildFluxRedesignPrompt(style?: string, roomType?: string, instruction?: string): string {
  const room = roomType || 'interior space';
  const styleName = style || 'contemporary';
  const styleVocab = STYLE_VOCAB[styleName.toLowerCase()] || styleName;
  const base = `A photorealistic ${styleName} ${room}. ${styleVocab}. Premium materials, precise textures, professional interior photography quality.`;
  const extra = instruction ? ` ${instruction}.` : '';
  return `${base}${extra} Ultra-realistic physically accurate materials and lighting. 24mm architectural lens, corrected verticals, no fisheye distortion.`;
}

/**
 * Step 2 of the 3-step copy-style pipeline.
 * Gemini replaces ONLY the fixtures that differ from the design spec — keeping surfaces and
 * colors unchanged. The resulting intermediate image is then fed into Flux Depth Pro (step 3)
 * so its depth map reflects the correct fixtures rather than the originals.
 */
async function buildFixtureReplacementPrompt(supabase: DbClient, designSpec: string): Promise<string> {
  return renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_fixture_replacement'), { design_spec: designSpec });
}

/**
 * Build a Flux text prompt that applies an extracted design spec to a room.
 * Used for Copy Style — the spec was extracted from the inspiration image by Gemini Vision.
 */
async function buildFluxCopyStylePrompt(supabase: DbClient, designSpec: string, roomType?: string, userInstruction?: string): Promise<string> {
  const room = roomType || 'interior space';
  return renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_apply_aesthetic'), { room: room, design_spec: designSpec, user_instruction: userInstruction ? `\nAdditional instruction: ${userInstruction}\n` : '' });
}

/**
 * Call Flux Depth Pro on Replicate.
 * Uses depth-map extraction from the control image to lock spatial structure,
 * then applies the style prompt on top — positions are preserved by the model.
 *
 * @param controlImageUrl Public URL of the room image (structure donor)
 * @param prompt          Style description to apply
 * @param aspectRatio     Output aspect ratio
 * @returns               Replicate output image URL (temporary)
 */
async function callFluxDepthPro(
  controlImageUrl: string,
  prompt: string,
  aspectRatio: ImageAspectRatio = '16:9',
): Promise<string> {
  const { token: replicateToken } = await resolveReplicateToken();
  if (!replicateToken) throw new Error(REPLICATE_NOT_CONFIGURED);

  const requestBody = {
    input: {
      control_image: controlImageUrl,
      prompt,
      guidance: 15,
      num_inference_steps: 28,
      output_format: 'webp',
      aspect_ratio: aspectRatio,
    },
  };

  console.log('[flux-depth-pro] control_image:', controlImageUrl);
  console.log('[flux-depth-pro] prompt length:', prompt.length);
  console.log('[flux-depth-pro] aspect_ratio:', aspectRatio);

  const createRes = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-depth-pro/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${replicateToken}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error('[flux-depth-pro] API error:', createRes.status, err);
    throw new Error(`Flux Depth Pro creation failed (${createRes.status}): ${err}`);
  }

  const prediction = await createRes.json();
  console.log('[flux-depth-pro] prediction status:', prediction.status, 'id:', prediction.id);

  if (prediction.status === 'succeeded') {
    const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    return out as string;
  }
  if (prediction.status === 'failed') {
    throw new Error(`Flux Depth Pro failed: ${prediction.error}`);
  }

  // Poll until done (up to 3 min: 60 × 3s)
  const predictionId = prediction.id;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { Authorization: `Bearer ${replicateToken}` } },
    );
    const status = await statusRes.json();
    if (status.status === 'succeeded') {
      const out = Array.isArray(status.output) ? status.output[0] : status.output;
      return out as string;
    }
    if (status.status === 'failed') {
      throw new Error(`Flux Depth Pro failed: ${status.error}`);
    }
  }

  throw new Error('Flux Depth Pro timed out after 3 minutes');
}

// Credit costs and provider routing now live in _shared/generation-routing.ts so the
// billed model and the invoked model come from one derivation.

type GenerationMode = 'text-to-image' | 'image-edit' | 'redesign' | 'copy-style' | 'floor-plan-render' | 'floor-plan-text' | 'materials-selection-board' | 'product-shot' | 'product-lifestyle' | 'material-texture';
type BoardMode = 'presentation-board' | 'selection-board' | 'photorealistic-render';

interface GenerateInteriorRequest {
  mode?: GenerationMode;
  // Common
  prompt?: string;
  room_type?: string;
  style?: string;
  sqm?: number;
  aspect_ratio?: ImageAspectRatio;
  model_tier?: 'fast' | 'pro' | 'grok';
  // Material references (multi-reference generation)
  material_images?: string[]; // up to 14 catalog product image URLs
  // Image edit / floor plan render
  reference_image_url?: string;
  edit_instruction?: string;
  // Second uploaded image: style/mood reference for dual-image Copy Style and Redesign modes
  style_reference_url?: string;
  // Materials Selection Board
  board_mode?: BoardMode;
  // Product shot (purchase-sheet doors/windows, and catalog products): a clean studio
  // render of ONE item, driven by its structured spec rather than a room scene.
  // `item_name` + `spec` are reused by product-lifestyle and material-texture, which
  // describe the same "one named thing" rather than a room.
  item_type?: 'door' | 'window' | string;
  item_name?: string;
  spec?: Record<string, unknown>;
  // User context
  user_id?: string;
  workspace_id?: string;
  conversation_id?: string;
  // Call-site attribution, for the cost views (see ATTRIBUTION_SOURCES). Server-to-server only.
  source?: string;
  embed_key_id?: string;
}

/**
 * Where a generation was triggered from, for `ai_usage_logs.metadata.source`.
 *
 * An ALLOWLIST rather than free text, and honoured only for service-role callers, because this is
 * an attribution field: a value a user-JWT request could set is a value that can lie about who
 * spent the credits. Everything else falls through to no source at all, which reads as "the app",
 * and is the honest answer for a generation a signed-in member started themselves.
 *
 * Adding a value here is deliberate work. That is the point — a column that accepts anything is a
 * column no cost view can group by.
 */
const ATTRIBUTION_SOURCES = ['embed'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Fetch a remote image and return as Uint8Array.
 *
 * SSRF-guarded (invariant 7). `url` originates from `body.reference_image_url`, so a raw
 * fetch lets any authenticated user reach cloud metadata (169.254.169.254), loopback or
 * RFC1918. `redirect: 'error'` is required by the guard's contract (a public URL can 302 to
 * a blocked address after the check). The error message must not echo the URL or the upstream
 * status — that makes it a usable response oracle.
 *
 * `reference_image_url` is ALSO passed to Replicate (callFluxDepthPro),
 * which fetches it from Replicate's own network — validate before it leaves here.
 */
async function fetchImageBuffer(url: string): Promise<Uint8Array> {
  const { bytes } = await fetchImageGuarded(url);
  return bytes;
}

/** Upload base64 image to Supabase Storage, return permanent public URL */
async function uploadToStorage(
  supabase: DbClient,
  base64: string,
  mimeType: string,
  jobId: string,
  ctx: Partial<SessionPathCtx> = {},
  suffix = '',
): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const path = resolveOutputPath(ctx, 'gemini', `${jobId}${suffix}.${ext}`);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

/** Delete a file from Supabase Storage by its storage path (e.g. "gemini/job123-intermediate.webp") */
async function deleteFromStorage(
  supabase: DbClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from('generation-images').remove([path]);
  if (error) console.warn(`[storage] Failed to delete ${path}:`, error.message);
}

/** Extract storage path from a public URL (e.g. ".../generation-images/gemini/x.webp" → "gemini/x.webp") */
function storagePathFromUrl(publicUrl: string): string {
  const marker = '/generation-images/';
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? publicUrl.slice(idx + marker.length) : publicUrl;
}

/** Check user has enough credits before starting generation (fail fast, no wasted API calls) */
async function checkCredits(
  supabase: DbClient,
  userId: string,
  required: number,
  workspaceId?: string | null,
): Promise<void> {
  // Fail-fast via preflight_credits — mirrors the debit decision (pool-if-member-else-personal) AND
  // enforces the per-member monthly cap, so a capped member is rejected BEFORE the paid Gemini call
  // rather than after. Don't echo a foreign pool's balance back to the caller (info leak).
  const { data: pf, error } = await supabase.rpc('preflight_credits', {
    p_user_id: userId, p_amount: required, p_workspace_id: workspaceId ?? null,
  });
  if (error) throw new Error(`Credit check failed: ${error.message}`);
  const row = Array.isArray(pf) ? pf[0] : pf;
  if (!row?.sufficient) {
    throw new Error(`Insufficient credits. This operation needs ${required} credits.`);
  }
}

/** Deduct credits — from the workspace pool when funded (with per-member cap), else personal. */
async function deductCredits(
  supabase: DbClient,
  userId: string,
  credits: number,
  description: string,
  workspaceId?: string | null,
): Promise<void> {
  const { data, error } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'interior_generation',
    p_description: description,
    p_workspace_id: workspaceId ?? null,
  });
  if (error) throw new Error(`Credit deduction failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (row && !row.success) throw new Error(`Credit deduction failed: ${row.error_message}`);
}

/** Refund a prior debit — to the same wallet the debit came from (refund_credits mirrors the decision). */
async function refundCredits(
  supabase: DbClient,
  userId: string,
  credits: number,
  description: string,
  workspaceId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'interior_generation_refund',
    p_description: description,
    p_workspace_id: workspaceId ?? null,
  });
  if (error) console.warn(`[generate-interior-gemini] refund failed: ${error.message}`);
}

// buildMaterialsBoardPrompt lived here. The DB rows (generation/materials_board_*) always
// won over it, and those rows used single-brace {style}/{room_type} that nothing substituted
// — so the model received the literal braces while this correct builder never ran (#347 3P).

// Studio product shot for a made-to-order door/window on a purchase spec sheet. NOT a room
// scene — a single isolated item on seamless white, front elevation, true-to-spec proportions,
// so the buyer/supplier sees exactly the configured item. Driven by the structured `spec`.
Deno.serve(withApiLogging('generate-interior-gemini', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse body first (needed for both auth paths)
  let body: GenerateInteriorRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  // Auth: accept service role key (internal server-to-server) OR user JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let resolvedUserId: string;
  // Only a server-to-server caller may attribute the spend to something other than "the app" —
  // see ATTRIBUTION_SOURCES. Set here, next to the check that establishes it, rather than
  // re-derived at the log insert where the reason would no longer be visible.
  const isServiceCall = token === supabaseServiceKey;

  if (isServiceCall && body.user_id) {
    // Internal server-to-server call (agent-chat, Python backend, etc.)
    resolvedUserId = body.user_id;
  } else {
    // User JWT validation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    resolvedUserId = user.id;
  }

  // Invariant 1 (#364 EX-1). `body.workspace_id` decides which pool is debited, which workspace
  // the `generation_3d` row belongs to, and which admins can read the `ai_usage_logs` row through
  // its `is_workspace_admin(workspace_id)` policy. Unverified, any signed-in user could name a
  // workspace they have never belonged to and write generation history and cost rows into it.
  // `debit_credits` already falls back to the personal wallet for a non-member, so this was never
  // credit theft — but the ROWS still landed in the victim's tenant, visible to their admins.
  // 404, not 403: a distinguishable "not yours" answer turns this into a workspace-id oracle.
  // Service-role callers are exempt: they are the platform itself (agent-chat, products-3d-api,
  // MIVAA), they derive the pair server-side, and they could write the rows directly anyway.
  if (!isServiceCall && body.workspace_id
    && !(await userCanAccessWorkspace(supabase, resolvedUserId, body.workspace_id))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  // Invariant 7 (#364 EX-7). Validate EVERY inbound image URL here, at the input, rather than
  // relying on `fetchImageBuffer` — because `redesign` and `copy-style` hand
  // `reference_image_url` straight to `callFluxDepthPro`, i.e. to Replicate, which fetches it
  // from THEIR network before anything here ever downloads it. A provider fetching an internal
  // address on our behalf is the same primitive as fetching it ourselves. Validating at the
  // input means a new mode cannot reintroduce the gap by forgetting to fetch first.
  try {
    for (const candidate of [
      body.reference_image_url,
      body.style_reference_url,
      ...(body.material_images ?? []).slice(0, 14),
    ]) {
      if (candidate) await assertSafeUrl(candidate, { allowSchemes: ['https:'] });
    }
  } catch (e) {
    // Never echo the URL or the upstream status — that turns the error into a response oracle.
    return jsonResponse(
      { success: false, error: e instanceof SSRFError ? `Rejected image URL: ${e.message}` : 'Invalid image URL' },
      400,
    );
  }

  const jobId = crypto.randomUUID();
  const uploadCtx: Partial<SessionPathCtx> = { userId: resolvedUserId, conversationId: body.conversation_id };
  const aspectRatio: ImageAspectRatio = body.aspect_ratio ?? '16:9';
  const mode: GenerationMode = body.mode ?? detectMode(body);

  // ── What may be edited (see _shared/image-edit-gate.ts) ──────────────────────────────
  // This function is the chokepoint for every image the platform alters: the agent's
  // generate_gemini tool, AgentHub's edit modal, projectsService, productMaterialMapsService
  // and generate-vr-world all land here. The gate goes HERE and not in the agent's prompt
  // because three of those five callers never involve a model turn at all.
  //
  // Above the debit on purpose: a blocked edit must not cost the user credits.
  //
  // Only the modes that transform a SUPPLIED image. text-to-image and floor-plan-text invent
  // an image from words and have no source to classify.
  const EDIT_MODES: GenerationMode[] = ['image-edit', 'redesign', 'copy-style', 'floor-plan-render'];
  if (EDIT_MODES.includes(mode) && body.reference_image_url) {
    // An image this platform generated is exempt — we made it, and re-classifying every
    // "warmer lighting" on our own render would tax the normal design loop for nothing.
    // Recognised by its storage path, not by the caller's word for it.
    //
    // This used to be a lone `/\/generation-images\/.*\/gen\//` regex, which matches ONLY the
    // per-session layout. The multi-model grid never produces that layout: MIVAA calls this
    // function with no conversation id, so every grid tile lands on the legacy `gemini/` prefix
    // and was treated as third-party content — paying for a Claude classification on every edit,
    // and refused outright whenever the classifier could not run. The rule now lives in
    // storage-paths.ts next to the builder that creates these paths, as an allowlist that
    // deliberately excludes `reference-images/` (same bucket, user-supplied).
    const isOurs = isPlatformGeneratedImage(body.reference_image_url);
    const gate = await assertEditableSource(
      supabase,
      body.reference_image_url,
      body.edit_instruction ?? body.prompt ?? '',
      isOurs,
      resolvedUserId,
      body.workspace_id ?? null,
    );
    if (!gate.allowed) {
      console.warn(`[generate-interior-gemini] edit refused (${gate.documentKind ?? 'unknown'}) user=${resolvedUserId} mode=${mode}`);
      return jsonResponse({ success: false, error: gate.message, refused: true }, 422);
    }
  }
  // Single source for provider + price (see _shared/generation-routing.ts): credits
  // are keyed off the label of the model that actually runs, so the two can't drift.
  // Pinned catalog materials make this a multi-image prompt, which only Gemini takes —
  // the routing collapses the tier to Gemini so the price collapses with it.
  const routing = resolveGenerationRouting(mode, body.model_tier, {
    multiReference: (body.material_images?.length ?? 0) > 0,
  });
  const useGrok = routing.provider === 'grok';
  const isFluxMode = routing.provider === 'flux';
  const model: GeminiImageModel = routing.geminiModel;
  const credits = routing.credits;
  const modelLabel = routing.modelLabel;

  // Ask the registry whether this model can run BEFORE taking any money. Without this a
  // `redesign` on the unfunded/uncredentialled Flux path debited 20 credits, failed, and
  // refunded 20 — a ledger that nets to zero and a user who waited for nothing and was told
  // nothing useful. Fails open, so an unreadable registry cannot block generation.
  // `PRICING_KEY_BY_LABEL` maps the response-payload label to the registry id for the one
  // case where they differ (`grok-aurora` → `xai-aurora`).
  const health = await checkGenerationModelHealth(
    supabase,
    PRICING_KEY_BY_LABEL[modelLabel] ?? modelLabel,
  );
  if (!health.runnable) {
    return jsonResponse(
      { success: false, error: unavailableMessage(modelLabel, health.reason), model: modelLabel },
      503,
    );
  }

  let debited = false;
  try {
    // Fail fast before spending 20-30s on generation
    await checkCredits(supabase, resolvedUserId, credits, body.workspace_id);
    // Debit BEFORE the paid Gemini call (invariant #10): the per-member cap is enforced atomically
    // at debit time, so concurrent over-cap requests can't all run paid compute before a debit lands.
    // Refunded in the catch below if generation fails.
    // `modelLabel`, not `model`: `model` is only meaningful when the provider IS Gemini, so a
    // Grok or Flux run wrote a ledger line reading "gemini-3.1-flash-image" beside the Grok
    // charge. The amount was right and the description named a different model — the same
    // split the routing module exists to close, one field further down.
    await deductCredits(supabase, resolvedUserId, credits, `Interior design generation (${modelLabel}, ${mode})`, body.workspace_id);
    debited = true;

    let imageUrl: string;

    // ── Mode 1: text-to-image ──────────────────────────────────────────────
    if (mode === 'text-to-image') {
      const narrative = await buildNarrativePrompt(supabase, {
        room_type: body.room_type,
        style: body.style,
        materials: body.material_images ? undefined : undefined,
        user_prompt: body.prompt,
        // The same pair the debit above used, so the prompt-build call and the image it feeds
        // land on the same tenant's cost line instead of one of them landing on nobody's.
        user_id: resolvedUserId,
        workspace_id: body.workspace_id,
      });

      // If material_images provided, fetch them as reference inputs
      let prompt: string | { text: string; images: (Uint8Array | string)[] } = narrative;
      if (body.material_images && body.material_images.length > 0) {
        const materialBuffers = await Promise.all(
          body.material_images.slice(0, 14).map(fetchImageBuffer),
        );
        prompt = { text: narrative, images: materialBuffers };
      }

      // Honour model_tier here too — this was the LAST generative mode still ignoring
      // it, so `model_tier: 'grok'` billed grok-aurora and ran Gemini Flash. It is also
      // now the hot path: the interior grid renders one tile per tier, so a silently
      // Gemini-serving Grok tile would be a duplicate image at the Grok price.
      // `useGrok` is already false when material_images made this multi-reference.
      const result = useGrok
        ? await generateImageWithGrok(narrative)
        : await generateImageWithGemini(prompt, { model, aspectRatio });
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
    }

    // ── Mode: product-shot (purchase-sheet door/window) ────────────────────
    // A single isolated item on seamless white, rendered true to its spec. Portrait by
    // default for doors, landscape-ish for windows. Used when a purchase item is NOT a
    // catalog product (no real photo), so the spec sheet still shows the configured item.
    else if (mode === 'product-shot') {
      const itemType = body.item_type ?? 'door';
      const hasName = Boolean(body.item_name && body.item_name.trim());
      const shotPrompt = buildProductShotPrompt(
        itemType,
        hasName ? body.item_name! : (body.prompt ?? ''),
        body.spec ?? {},
        hasName ? body.prompt : undefined,
      );
      const shotRatio = (body.aspect_ratio
        ?? (itemType.toLowerCase() === 'window' ? '4:3' : '3:4')) as ImageAspectRatio;
      // Honour model_tier here too. This mode was Gemini-only, so asking for Grok
      // silently billed the Grok rate and ran Gemini anyway.
      const result = useGrok
        ? await generateImageWithGrok(shotPrompt)
        : await generateImageWithGemini(shotPrompt, { model, aspectRatio: shotRatio });
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
    }

    // ── Mode: product-lifestyle ────────────────────────────────────────────
    // A catalog product staged in a room. With a reference photo the product is
    // preserved and only the room is generated around it.
    else if (mode === 'product-lifestyle') {
      const lifePrompt = buildProductLifestylePrompt(
        body.item_name ?? '',
        body.room_type,
        body.style,
        body.prompt,
        Boolean(body.reference_image_url),
      );
      const lifeRatio = (body.aspect_ratio ?? '4:3') as ImageAspectRatio;

      if (body.reference_image_url) {
        const productBuffer = await fetchImageBuffer(body.reference_image_url);
        const result = useGrok
          ? await editImageWithGrok(lifePrompt, productBuffer)
          : await generateImageWithGemini(
              { text: lifePrompt, images: [productBuffer] },
              { model, aspectRatio: lifeRatio },
            );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else {
        const result = useGrok
          ? await generateImageWithGrok(lifePrompt)
          : await generateImageWithGemini(lifePrompt, { model, aspectRatio: lifeRatio });
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      }
    }

    // ── Mode: material-texture ─────────────────────────────────────────────
    // A seamless swatch destined for a 3D material slot (#321/#260), not for display.
    // Square by default — a non-square tile distorts when repeated across UVs.
    else if (mode === 'material-texture') {
      const texPrompt = buildMaterialTexturePrompt(body.item_name ?? body.prompt ?? '', body.prompt);
      const texRatio = (body.aspect_ratio ?? '1:1') as ImageAspectRatio;

      if (body.reference_image_url) {
        // Flatten a real supplier swatch into a tileable version of ITSELF, rather
        // than inventing a material that the customer will not receive.
        const swatchBuffer = await fetchImageBuffer(body.reference_image_url);
        const result = useGrok
          ? await editImageWithGrok(texPrompt, swatchBuffer)
          : await generateImageWithGemini(
              { text: texPrompt, images: [swatchBuffer] },
              { model, aspectRatio: texRatio },
            );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else {
        const result = useGrok
          ? await generateImageWithGrok(texPrompt)
          : await generateImageWithGemini(texPrompt, { model, aspectRatio: texRatio });
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      }
    }

    // ── Mode 2: image-edit ─────────────────────────────────────────────────
    else if (mode === 'image-edit') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for image-edit mode' }, 400);
      }

      const sourceBuffer = await fetchImageBuffer(body.reference_image_url);
      const instruction = body.edit_instruction ?? body.prompt ?? 'Redesign this room with updated materials and finishes';

      if (useGrok) {
        // Grok Aurora edit — sends image directly, superior spatial accuracy
        const grokPrompt = renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_targeted_edit'), { instruction: instruction });

        const result = await editImageWithGrok(grokPrompt, sourceBuffer);
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else if (body.style_reference_url) {
        // Two-step style-transfer (Gemini):
        //   Step 1 — Vision: send inspiration to Gemini text model → extract design spec
        //   Step 2 — Edit: send room image + text spec → cosmetic renovation, zero spatial bleed
        const styleBuffer = await fetchImageBuffer(body.style_reference_url);
        let applyPrompt: string;
        try {
          const designSpec = await extractDesignSpec(supabase, styleBuffer, body.style);
          applyPrompt = await buildApplySpecPrompt(supabase, designSpec, body.prompt);
        } catch (specErr) {
          console.warn('[generate-interior-gemini] Spec extraction failed, using fallback:', specErr);
          applyPrompt = await buildApplySpecPrompt(supabase, 
            `Apply a complete visual transformation matching the style of the provided inspiration: ${body.style ?? 'high-end contemporary'}. Copy all surface materials, colors, tile patterns, fixture finishes, and hardware from the inspiration image.`,
            body.prompt,
          );
        }
        const result = await generateImageWithGemini(
          { text: applyPrompt, images: [sourceBuffer] },
          { model, aspectRatio },
        );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else {
        // Gemini direct edit
        const editText = renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_reference_redesign'), { instruction: instruction });

        const result = await generateImageWithGemini(
          { text: editText, images: [sourceBuffer] },
          { model, aspectRatio },
        );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      }
    }

    // ── Mode 3: redesign — Flux Depth Pro, single image ───────────────────
    // Extracts depth map from room image → locks structure → applies style.
    // Positions are mathematically preserved — no prompting trick required.
    else if (mode === 'redesign') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for redesign mode' }, 400);
      }

      const fluxPrompt = buildFluxRedesignPrompt(body.style, body.room_type, body.edit_instruction ?? body.prompt);
      const replicateUrl = await callFluxDepthPro(body.reference_image_url, fluxPrompt, aspectRatio);

      // Download from Replicate (temp URL) and persist to Supabase Storage
      const imgBuffer = await fetchImageBuffer(replicateUrl);
      const base64 = toBase64(imgBuffer);
      imageUrl = await uploadToStorage(supabase, base64, 'image/webp', jobId, uploadCtx);
    }

    // ── Mode 4: copy-style ─────────────────────────────────────────────────
    // Grok path (1-step): both images sent directly — Aurora natively understands
    //   "take the style from image 1, apply it to the room in image 2".
    //   Eliminates spec extraction delay and hallucination risk.
    // Gemini+Flux path (2-step): Gemini Vision extracts spec → Flux Depth Pro applies
    //   it depth-locked to the room. Inspiration never reaches Flux → zero spatial bleed.
    else if (mode === 'copy-style') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for copy-style mode' }, 400);
      }
      if (!body.style_reference_url) {
        return jsonResponse({ success: false, error: 'style_reference_url (inspiration image) required for copy-style mode' }, 400);
      }

      if (useGrok) {
        // Grok 1-step: inspiration + room → apply style directly
        // Aurora handles multi-image context natively via the edits endpoint
        const roomBuffer = await fetchImageBuffer(body.reference_image_url);
        const inspirationBuffer = await fetchImageBuffer(body.style_reference_url);

        // Encode inspiration as base64 data URL for embedding in the prompt
        const inspirationB64 = toBase64(inspirationBuffer);
        const grokCopyStylePrompt = renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_style_transfer'), { body: body.prompt ? `\nADDITIONAL INSTRUCTION: ${body.prompt}` : '', inspiration_b64: inspirationB64 });

        const result = await editImageWithGrok(grokCopyStylePrompt, roomBuffer);
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else {
        // Gemini + Flux 2-step pipeline (primary for non-grok)
        const inspirationBuffer = await fetchImageBuffer(body.style_reference_url);
        let fluxPrompt: string;
        let designSpec: string | null = null;
        try {
          designSpec = await extractDesignSpec(supabase, inspirationBuffer, body.style);
          fluxPrompt = await buildFluxCopyStylePrompt(supabase, designSpec, body.room_type, body.prompt);
        } catch (specErr) {
          console.warn('[copy-style] Spec extraction failed, using fallback:', specErr);
          fluxPrompt = buildFluxRedesignPrompt(body.style, body.room_type, body.prompt ?? 'Apply a high-end complete visual transformation.');
        }

        try {
          const replicateUrl = await callFluxDepthPro(body.reference_image_url, fluxPrompt, aspectRatio);
          if (!replicateUrl) throw new Error('Flux returned empty output URL');
          const imgBuffer = await fetchImageBuffer(replicateUrl);
          imageUrl = await uploadToStorage(supabase, toBase64(imgBuffer), 'image/webp', jobId, uploadCtx);
        } catch (fluxErr) {
          console.warn('[copy-style] Flux failed, falling back to Gemini:', String(fluxErr));
          const roomBuffer = await fetchImageBuffer(body.reference_image_url);
          if (designSpec) {
            const applyPrompt = await buildCopyStyleApplyPrompt(supabase, designSpec, body.prompt);
            const result = await generateImageWithGemini(
              { text: applyPrompt, images: [roomBuffer] },
              { model, aspectRatio },
            );
            imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
          } else {
            const dualPrompt = await buildDualReferenceStylePrompt(supabase, body.style, body.prompt);
            const result = await generateImageWithGemini(
              { text: dualPrompt, images: [inspirationBuffer, roomBuffer] },
              { model, aspectRatio },
            );
            imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
          }
        }
      }
    }

    // ── Mode 5: floor-plan-render (image input → photorealistic top-down) ──
    else if (mode === 'floor-plan-render') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for floor-plan-render mode' }, 400);
      }

      const sourceBuffer = await fetchImageBuffer(body.reference_image_url);

      if (body.style_reference_url) {
        // Two-step style-transfer pipeline (same as image-edit mode)
        const styleBuffer = await fetchImageBuffer(body.style_reference_url);
        let applyPrompt: string;
        try {
          const designSpec = await extractDesignSpec(supabase, styleBuffer, body.style);
          applyPrompt = await buildApplySpecPrompt(supabase, designSpec, body.prompt);
        } catch (specErr) {
          console.warn('[generate-interior-gemini] Spec extraction failed (floor-plan-render), using fallback:', specErr);
          applyPrompt = await buildApplySpecPrompt(supabase, 
            `Apply a complete visual transformation matching the style of the provided inspiration: ${body.style ?? 'high-end contemporary'}. Copy all surface materials, colors, tile patterns, fixture finishes, and hardware from the inspiration image.`,
            body.prompt,
          );
        }
        const result = await generateImageWithGemini(
          { text: applyPrompt, images: [sourceBuffer] },
          { model, aspectRatio: '1:1' },
        );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else {
        // Single image: floor plan → perspective render, or style reference → new design
        const renderPrompt = await buildFloorPlanRenderPrompt(supabase, body.style, body.prompt);
        const result = await generateImageWithGemini(
          { text: renderPrompt, images: [sourceBuffer] },
          { model, aspectRatio: '1:1' },
        );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      }
    }

    // ── Mode 4: floor-plan-text (text → 2D floor plan diagram) ─────────────
    else if (mode === 'floor-plan-text') {
      const diagramPrompt = await buildFloorPlanDiagramPrompt(supabase, {
        room_type: body.room_type,
        style: body.style,
        sqm: body.sqm,
        user_description: body.prompt,
      });

      const diagramResult = await generateImageWithGemini(
        diagramPrompt,
        { model, aspectRatio: '1:1' },
      );
      imageUrl = await uploadToStorage(supabase, diagramResult.base64, diagramResult.mimeType, jobId, uploadCtx);
    }

    // ── Mode 5: materials-selection-board ──────────────────────────────────
    else if (mode === 'materials-selection-board') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for materials-selection-board mode' }, 400);
      }

      const boardMode: BoardMode = body.board_mode ?? 'selection-board';
      // Defaults match the builder this replaced — an empty {{room_type}} would render
      // "a  presentation sheet for a  ", which is how the single-brace bug looked to the model.
      const boardPrompt = renderPromptTemplate(
        await getGenerationPrompt(supabase, `materials_board_${boardMode}`),
        {
          room_type: body.room_type ?? 'interior space',
          style: body.style ?? 'contemporary',
          user_prompt: body.prompt ?? '',
        },
      );
      const sourceBuffer = await fetchImageBuffer(body.reference_image_url);
      const result = await generateImageWithGemini(
        { text: boardPrompt, images: [sourceBuffer] },
        { model, aspectRatio: body.aspect_ratio ?? '1:1' },
      );
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
    }

    else {
      return jsonResponse({ success: false, error: `Unknown mode: ${mode}` }, 400);
    }

    // Image models are priced PER IMAGE, not per token, so there is no token-cost path
    // for them. Until 2026-08-02 this insert set no cost columns at all — every
    // interior_design_generation row carried a NULL raw/billed cost, so image generation
    // was invisible to every USD cost view while still debiting credits.
    // `getServicePricing` reads the same `ai_model_pricing` table as everything else.
    //
    // It also logged `model` (always a Gemini id) rather than `modelLabel`, so redesign
    // and copy-style runs — which actually invoke flux-depth-pro or Grok — were attributed
    // to Gemini. Cost per model was wrong for exactly the modes that cost the most.
    const pricingKey = routing.pricingKey;
    const imagePricing = await getServicePricing(supabase, pricingKey);
    if (!imagePricing) {
      console.warn(`[generate-interior-gemini] no ai_model_pricing row for "${pricingKey}" — cost logged as null`);
    }
    const rawCostUsd = imagePricing ? imagePricing.cost_per_unit : null;
    const billedCostUsd = imagePricing ? rawCostUsd! * imagePricing.markup_multiplier : null;

    // WHO the spend belongs to, not just who it was billed to.
    //
    // `workspace_id` was NULL on every row this function ever wrote, even though the same
    // `body.workspace_id` had already decided which pool the credits came out of. Two things broke
    // silently: no per-tenant cost view could see image generation at all, and the
    // `is_workspace_admin(workspace_id)` RLS policy on this table could never match — so a
    // workspace admin who was not personally the billed user saw none of their own workspace's AI
    // spend. The credits were right the whole time; only the reporting was blind.
    //
    // `source` + `embed_key_id` answer the follow-up question. Without them an embed generation —
    // triggered by an anonymous visitor on a merchant's website and charged to that merchant — is
    // indistinguishable from an operator generating a product shot in-app, because both arrive as
    // `mode: 'product-shot'`. A merchant cannot ask what their widget cost them, and nobody can ask
    // which key is burning credits: the daily cap is per-key, but the spend was not.
    const attributedSource = isServiceCall
      && (ATTRIBUTION_SOURCES as readonly string[]).includes(String(body.source ?? ''))
      ? String(body.source)
      : null;
    const attributedKeyId = attributedSource && UUID_RE.test(String(body.embed_key_id ?? ''))
      ? String(body.embed_key_id)
      : null;

    // Billing row: never throw (credits are already debited and the upstream call already
    // happened), but never silent either — the old `.then(() => {}, () => {})` discarded the
    // outcome, which is the `stamp_job_refresh_cost` shape: spend charged to a tenant and
    // reported against nobody. try/catch covers both failure modes, since supabase-js RESOLVES
    // with `{ error }` on an RLS denial and REJECTS on a transport error (#347 audit).
    try {
      const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
        user_id: resolvedUserId,
        workspace_id: body.workspace_id ?? null,
        operation_type: 'interior_design_generation',
        model_name: modelLabel,
        credits_debited: credits,
        raw_cost_usd: rawCostUsd,
        billed_cost_usd: billedCostUsd,
        markup_multiplier: imagePricing?.markup_multiplier ?? null,
        metadata: {
          mode,
          model: modelLabel,
          billing_type: 'per_unit',
          units: 1,
          ...(attributedSource ? { source: attributedSource } : {}),
          ...(attributedKeyId ? { embed_key_id: attributedKeyId } : {}),
        },
      });
      if (usageErr) throw usageErr;
    } catch (usageErr) {
      console.error('[generate-interior-gemini] ai_usage_logs insert FAILED — spend is unattributed', usageErr);
      await captureException(
        usageErr instanceof Error ? usageErr : new Error(String((usageErr as { message?: string })?.message ?? usageErr)),
        {
          tags: { area: 'billing', operation: 'interior_design_generation' },
          extra: { user_id: resolvedUserId, workspace_id: body.workspace_id ?? null, credits },
          fingerprint: ['ai-usage-log-write-failed', 'interior_design_generation'],
        },
      );
    }

    // Persist to generation_3d.
    // `request_type` is CHECK-constrained to exactly 'text_to_image' | 'image_to_image' |
    // 'hybrid'. This used to write the raw `mode` — 'text-to-image', 'image-edit',
    // 'product-shot', or 'materials_selection_board_<board_mode>' — none of which satisfy it.
    // The insert therefore failed EVERY time, its result was never destructured, and the
    // function still returned success:true. So the user was charged 6-20 credits, got their
    // image, and the generation never appeared in history, in ProgressiveImageGrid's job
    // poll, in MarketTrends, or in the admin cost card; job-cleanup-cron's "unsaved renders"
    // reaper and moodboardAPI.markGenerationSaved() both operated on a row that did not
    // exist. Corroborating: ai_usage_logs held interior_design_generation rows while
    // generation_3d held zero.
    // MIVAA's writer already gets this right and says so — interior_design_routes.py:698
    // carries the comment "use underscores to match DB constraint".
    // The specific mode is NOT lost: it is preserved in models_results below.
    const REQUEST_TYPE_BY_MODE: Record<string, 'text_to_image' | 'image_to_image' | 'hybrid'> = {
      'text-to-image': 'text_to_image',
      'floor-plan-text': 'text_to_image',
      'image-edit': 'image_to_image',
      'redesign': 'image_to_image',
      'copy-style': 'image_to_image',
      'floor-plan-render': 'image_to_image',
      'product-shot': 'image_to_image',
      // A reference image plus a prompt-driven board layout — neither pure branch fits.
      'materials-selection-board': 'hybrid',
    };
    const requestType = REQUEST_TYPE_BY_MODE[mode] ?? 'hybrid';

    const { error: genErr } = await supabase.from('generation_3d').insert({
      id: jobId,
      user_id: resolvedUserId,
      workspace_id: body.workspace_id,
      prompt: body.prompt ?? '',
      room_type: body.room_type,
      style: body.style,
      generation_status: 'completed',
      progress_percentage: 100,
      request_type: requestType,
      models_queue: (mode === 'redesign' || mode === 'copy-style')
        ? [{ id: 'flux-depth-pro', name: 'Flux Depth Pro', provider: 'replicate' }]
        : [{ id: model, name: `Gemini ${model}`, provider: 'google' }],
      models_results: {
        // `mode` is kept here because request_type can only hold one of three coarse values —
        // this is where the specific generation mode survives.
        mode,
        [modelLabel]: { success: true, image_url: imageUrl, board_mode: body.board_mode },
      },
      workflow_status: 'completed',
      completed_at: new Date().toISOString(),
    });
    if (genErr) {
      // Loud. The credits are already spent and the image already delivered; a history row
      // that silently fails to write is how this went unnoticed in the first place.
      console.error('[generate-interior-gemini] generation_3d insert failed:', genErr.message, 'mode:', mode);
    }

    return jsonResponse({
      success: true,
      job_id: jobId,
      mode,
      board_mode: body.board_mode,
      model,
      image_url: imageUrl,
      credits_used: credits,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate-interior-gemini] Error (mode=${mode}):`, message);
    // Generation failed after we debited → refund so the user isn't charged for nothing.
    if (debited) {
      await refundCredits(supabase, resolvedUserId, credits, `Interior generation failed (${mode})`, body.workspace_id);
    }
    // Insufficient credits is a client-state condition → 402, not a server error.
    const status = message.startsWith('Insufficient credits') ? 402 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}));

function detectMode(body: GenerateInteriorRequest): GenerationMode {
  // With a reference image, default to image-edit regardless of edit_instruction presence.
  // Callers that want floor-plan-render or copy-style MUST pass mode explicitly.
  if (body.reference_image_url) return 'image-edit';
  if (!body.reference_image_url && (body.prompt?.toLowerCase().includes('floor plan') || body.sqm)) {
    return 'floor-plan-text';
  }
  return 'text-to-image';
}
