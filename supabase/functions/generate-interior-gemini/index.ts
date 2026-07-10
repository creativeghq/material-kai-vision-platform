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

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveOutputPath, type SessionPathCtx } from '../_shared/storage-paths.ts';
import {
  generateImageWithGemini,
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
import { getGenerationPrompt } from '../_shared/prompt-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GOOGLE_API_KEY = () => Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '';
const REPLICATE_API_TOKEN = () => Deno.env.get('REPLICATE_API_TOKEN') || '';

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
async function extractDesignSpec(imageBuffer: Uint8Array, style?: string): Promise<string> {
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
              { text: `You are an interior design aesthetic analyst. Study this photo and produce a precise specification of VISUAL AESTHETICS ONLY.

CRITICAL: Do NOT describe where elements are located, which wall they are on, or their spatial position. Only describe visual appearance — colors, materials, textures, finishes, and styles. Position information will cause fixtures to move in the wrong room.

FIXTURES PRESENT (list only the fixture types visibly present — e.g. freestanding bath, walk-in shower, wall-hung basin, toilet, vanity unit, towel rail, mirror):

FLOORS: [material, exact color/tone, tile size/format if applicable, laying pattern — straight/herringbone/chevron/diagonal, finish — matte/gloss/honed/polished, grout color and joint width]

WALLS - PRIMARY SURFACE: [material, exact color, size/format if tiled, texture, finish, laying pattern, grout color and joint width — this material covers 100% of every wall surface unless a secondary zone is specified below]

WALLS - SECONDARY ZONE (only if the inspiration clearly shows a dual-treatment split): [material, color, exact vertical split height as a percentage — e.g. "lower 40% dark charcoal tile, upper 60% white plaster". If no clear split exists, leave blank — do not invent a split.]

CEILING: [color, finish — matte/gloss, any shadow-gap or cove lighting]

BASIN/SINK STYLE: [shape, material/color, style — undermount/vessel/wall-hung — visual only, no location]

VANITY UNIT: [color, material, door style — flat/shaker/handleless, handle metal finish]

TAPS & FITTINGS: [metal finish — chrome/brushed nickel/brushed brass/matte black/gunmetal/rose gold]

MIRROR: [shape — rectangular/round/arch/irregular, framed or frameless, any integrated LED]

SHOWER: [glass type — clear/fluted/smoked, shower head style — rain/wall-mounted/handheld, any niche tile treatment]

BATHTUB (if present): [freestanding or built-in, shape, material/finish color]

TOWEL RAILS: [style — ladder/bar/ring, metal finish]

LIGHTING: [fixture types, color temperature — warm/neutral/cool, overall mood]

FULL COLOR PALETTE: [every distinct color — be specific: "warm white", "charcoal grey", "brushed brass"]
${style ? `\nDESIGN STYLE: ${style}` : ''}` },
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
function buildApplySpecPrompt(designSpec: string, userInstruction?: string): string {
  return `You are performing a cosmetic renovation of the room in this photograph.

CRITICAL — POSITIONS ARE LOCKED:
Every fixture and architectural element stays on its exact wall in its exact position. Do not move the toilet, sink, vanity, shower, bath, doors, windows, niches, mirrors, or towel rails. The camera angle is unchanged.

RENOVATION SPECIFICATION — apply every item below:
${designSpec}
${userInstruction ? `\nADDITIONAL INSTRUCTION: ${userInstruction}` : ''}

You are ONLY changing surfaces, finishes, colors, and material aesthetics. Nothing is added, removed, or relocated.

SELF-CHECK before finalising: confirm the toilet is on the same wall as in the original. Confirm the sink is in the same position. Confirm the shower is in the same corner. If anything moved, correct it.

Photorealistic professional interior photography. 24mm architectural lens, corrected verticals, no fisheye, ultra-realistic material textures and lighting.`;
}

/**
 * Step 2 prompt for copy-style mode.
 * Like buildApplySpecPrompt but allows fixture replacement — if the design spec describes
 * a different fixture type (e.g. walk-in shower where a bathtub exists), replace it fully.
 */
function buildCopyStyleApplyPrompt(designSpec: string, userInstruction?: string): string {
  return `You are redesigning this room to fully match the following design specification extracted from an inspiration image.

STRUCTURAL LOCK — these never change:
Wall positions, room dimensions, door and window openings, camera angle, and perspective are frozen. Every functional zone stays on the same side of the room (sink zone, toilet zone, bathing zone, seating area, etc.).

FIXTURE REPLACEMENT RULES:
- For each fixture or furniture piece in the room, check what the design spec describes for the equivalent functional zone.
- If the spec describes the SAME type (e.g. both have a bathtub): keep it but fully restyle its shape, finish, and material to match the spec exactly.
- If the spec describes a DIFFERENT type (e.g. spec says walk-in shower, room has bathtub): completely replace the fixture with what the spec describes. Erase the old shape entirely — no remnant. The replacement must match the spec's geometry, proportions, materials, and finish.
- If the spec describes NO fixture for that zone: remove the fixture and apply the wall finish from the spec.

DESIGN SPECIFICATION — apply every item below to ALL surfaces and fixtures:
${designSpec}
${userInstruction ? `\nADDITIONAL INSTRUCTION: ${userInstruction}` : ''}

SURFACE RULES: Every surface — floor, all walls, ceiling, tiles, cladding — must match the spec exactly. No original surface survives.

SELF-CHECK before finalising: every surface matches the spec. Every fixture either matches the spec type or has been replaced. Nothing moved to a different zone. Camera angle unchanged.

Photorealistic professional interior photography. 24mm architectural lens, corrected verticals, no fisheye, ultra-realistic material textures and lighting.`;
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
function buildFixtureReplacementPrompt(designSpec: string): string {
  return `You are preparing a room photo for a style pipeline. Your ONLY job in this step is fixture replacement — do NOT change any colors, tiles, surfaces, or finishes yet.

WHAT TO DO:
Look at the design specification below. For each fixture or furniture piece described, compare it to what is currently in the room photo.
- If the spec describes a DIFFERENT type of fixture (e.g. spec says walk-in shower, photo has a bathtub): fully replace the fixture with the type described in the spec. Match the general shape and proportions from the spec. Erase the original completely — no remnant of the old shape.
- If the spec describes the SAME type: leave it completely unchanged.
- If the spec describes NO fixture for a zone: remove it and leave a plain wall/floor.

WHAT NOT TO DO:
Do NOT change wall colors, tile patterns, floor materials, paint, hardware finishes, or any surface. Only the physical fixture shapes change in this step.

STRUCTURAL LOCK: wall positions, room dimensions, camera angle, and all fixture positions/zones stay exactly as in the photo.

DESIGN SPECIFICATION (use only to identify fixture types):
${designSpec}

Output a photorealistic photo of the room with only the fixture shapes updated as described above. Everything else is pixel-identical to the input.`;
}

/**
 * Build a Flux text prompt that applies an extracted design spec to a room.
 * Used for Copy Style — the spec was extracted from the inspiration image by Gemini Vision.
 */
function buildFluxCopyStylePrompt(designSpec: string, roomType?: string, userInstruction?: string): string {
  const room = roomType || 'interior space';
  return `Apply the following complete interior design aesthetic to this ${room}. Preserve every fixture position and the spatial layout exactly — nothing moves.

FULL SURFACE COVERAGE — CRITICAL:
Every wall surface must be covered floor-to-ceiling and edge-to-edge with the specified wall material. No partial application — the tile, cladding, or paint must extend to every corner, behind every fixture, above and below every element, all the way to the ceiling and floor junction. Zero original wall finish should remain visible anywhere. Same rule applies to floors — the specified floor material covers the entire floor plane without gaps.

${designSpec}
${userInstruction ? `\nAdditional instruction: ${userInstruction}\n` : ''}
Ultra-realistic physically accurate materials and lighting. 24mm architectural lens, corrected verticals, no fisheye distortion.`;
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
  if (!REPLICATE_API_TOKEN()) throw new Error('REPLICATE_API_TOKEN not set');

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
        Authorization: `Bearer ${REPLICATE_API_TOKEN()}`,
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
      { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN()}` } },
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

// ── Credit costs ──────────────────────────────────────────────────────────────

// Credit costs
const CREDIT_COSTS: Record<string, number> = {
  'gemini-3.1-flash-image': 6,
  'gemini-3-pro-image': 15,
  'flux-depth-pro': 20,
  'grok-aurora': 15,
};

type GenerationMode = 'text-to-image' | 'image-edit' | 'redesign' | 'copy-style' | 'floor-plan-render' | 'floor-plan-text' | 'materials-selection-board' | 'product-shot';
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
  // Product shot (purchase-sheet doors/windows): a clean studio render of ONE made-to-order
  // item, driven by its structured spec rather than a room scene.
  item_type?: 'door' | 'window' | string;
  item_name?: string;
  spec?: Record<string, unknown>;
  // User context
  user_id?: string;
  workspace_id?: string;
  conversation_id?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Fetch a remote image and return as Uint8Array */
async function fetchImageBuffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Upload base64 image to Supabase Storage, return permanent public URL */
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
  userId: string,
  required: number,
  workspaceId?: string | null,
): Promise<void> {
  // If the active workspace runs on shared credits (a funded pool), fail-fast against the
  // pool balance; otherwise fall back to the user's personal balance. The authoritative
  // check (incl. per-member monthly cap) happens at debit time in debit_credits.
  if (workspaceId) {
    const { data: pool } = await supabase
      .from('workspace_credits')
      .select('balance')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (pool) {
      if ((pool.balance ?? 0) < required) {
        throw new Error(`Insufficient workspace credits. Required: ${required}, Available: ${pool.balance ?? 0}`);
      }
      return;
    }
  }
  // maybeSingle: a user with no user_credits row is a legitimate "0 balance" case,
  // not a 500 — let the explicit insufficient-credits branch handle it.
  const { data, error } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Credit check failed: ${error.message}`);
  if (!data || (data.balance ?? 0) < required) {
    throw new Error(`Insufficient credits. Required: ${required}, Available: ${data?.balance ?? 0}`);
  }
}

/** Deduct credits — from the workspace pool when funded (with per-member cap), else personal. */
async function deductCredits(
  supabase: ReturnType<typeof createClient>,
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

function buildMaterialsBoardPrompt(boardMode: BoardMode, roomType?: string, style?: string, extraPrompt?: string): string {
  const room = roomType ?? 'interior space';
  const designStyle = style ?? 'contemporary';

  if (boardMode === 'presentation-board') {
    return `Architectural design presentation board for a ${designStyle} ${room} proposal. Strict vertical layout on a clean white background.

Top section titled "FITMENT SELECTION": Display a curated row of key fixtures and furniture pieces for this ${room}, each shown as a clean product render against white. Below each item include a short block of technical specifications (dimensions, material, finish, model reference).

Bottom section titled "DRAWINGS": Feature a detailed isometric 3D architectural drawing of the ${room} layout. The drawing uses thin technical annotation lines pointing to the main design elements. To the right of the drawing is a vertical "MATERIAL SELECTION" column showing square material swatches (stone, wood, metal, fabric as appropriate) with material name and finish label beneath each swatch.

Overall aesthetic: clean architectural presentation style, minimal sans-serif typography, precise linework, professional design studio quality. ${extraPrompt ?? ''}`;
  }

  if (boardMode === 'selection-board') {
    return `A professional interior design presentation sheet for a ${designStyle} ${room}. Clean white background with faint pencil architectural sketch outlines.

Central element: high-quality photorealistic 3D isometric cutaway render of the ${room} showing furniture, materials, and lighting in full detail.

Surrounding the central render: circular close-up material swatch callouts (wood veneer, stone, fabric, metal finishes) connected to specific elements inside the room by thin precise leader lines. Each swatch has a descriptive text label (material name, finish, supplier reference).

Bottom strip: three small vignette detail renders highlighting key material moments — a close-up of a surface texture, a joinery detail, and a lighting effect.

Style: 8K resolution, soft natural lighting, architectural visualization quality, professional interior design studio presentation. ${extraPrompt ?? ''}`;
  }

  // photorealistic-render
  return `Ultra-photorealistic luxury ${designStyle} ${room} in a warm minimal style with premium materials. Natural sunlight entering from an extra-large floor-to-ceiling side window, soft daylight and gentle realistic shadows, high-end interior magazine photography quality.

Wide corner perspective at eye level (150–160 cm) using an 18mm lens. Corrected perspective with straight vertical lines, no fisheye, stepped back to show more floor, ceiling, and architectural volume without enlarging any objects. Strict true-to-life scale throughout.

Premium materials: ceiling-height cabinetry with richer wood grain, flawless alignment, shadow-gap details and integrated handles. Back wall features a warm stone slab surface with subtle veining in a continuous slab look. Complemented by a warm under-cabinet LED strip. Large stone/ceramic surfaces matching the same material family throughout.

Photorealistic micro-textures, natural imperfections, and realistic reflections; no CGI or plastic look.

Negative prompt: oversized props, exaggerated scale, distorted proportions, fisheye, warped lines, CGI, 3D render, plastic texture, fake materials, blurry details, label artifacts, duplicated objects, watermark, text artifacts. ${extraPrompt ?? ''}`;
}

// Studio product shot for a made-to-order door/window on a purchase spec sheet. NOT a room
// scene — a single isolated item on seamless white, front elevation, true-to-spec proportions,
// so the buyer/supplier sees exactly the configured item. Driven by the structured `spec`.
function buildProductShotPrompt(itemType: string, name: string, spec: Record<string, unknown>, extraPrompt?: string): string {
  const t = (itemType || 'door').toLowerCase();
  // Render the spec as readable "Key: value" lines so the model honours real measurements/finishes.
  const specLines = Object.entries(spec || {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${String(v)}`)
    .join('\n');

  if (t === 'window') {
    return `Studio product photograph of a SINGLE ${name || 'window'}, shown as a clean front elevation, centred on a seamless pure-white background. Architectural product-catalogue style: even soft lighting, no room, no furniture, no people, no props, subtle contact shadow only.

Render the window EXACTLY to this specification — honour the frame type, opening type, glazing and finish; keep proportions true to the width/height ratio:
${specLines || '- a standard casement window'}

The opening mechanism must be visually clear (e.g. tilt-turn vs casement vs sliding) with correct hinge/sash lines. Realistic glass with faint reflection, accurate frame finish colour and material. Sharp focus, high detail, no text, no watermark, no dimension labels. ${extraPrompt ?? ''}`.trim();
  }

  // door (default)
  return `Studio product photograph of a SINGLE ${name || 'interior door'}, shown as a clean front elevation, centred on a seamless pure-white background. Architectural product-catalogue style: even soft lighting, no room, no furniture, no people, no props, subtle contact shadow only.

Render the door EXACTLY to this specification — honour the finish, frame, hardware, opening direction and handing; keep proportions true to the width/height ratio:
${specLines || '- a flush interior door with a satin finish'}

Show the door leaf within its frame, with the handle/hardware on the correct side per the handing. Accurate finish colour, wood grain or paint texture as specified, realistic materials. Sharp focus, high detail, no text, no watermark, no dimension labels. ${extraPrompt ?? ''}`.trim();
}

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

  if (token === supabaseServiceKey && body.user_id) {
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

  const jobId = crypto.randomUUID();
  const uploadCtx: Partial<SessionPathCtx> = { userId: resolvedUserId, conversationId: body.conversation_id };
  const useGrok = body.model_tier === 'grok';
  const model: GeminiImageModel =
    body.model_tier === 'pro'
      ? 'gemini-3-pro-image'
      : 'gemini-3.1-flash-image';
  const aspectRatio: ImageAspectRatio = body.aspect_ratio ?? '16:9';
  const mode: GenerationMode = body.mode ?? detectMode(body);
  const isFluxMode = (mode === 'redesign') || (mode === 'copy-style' && !useGrok);
  const credits = isFluxMode
    ? CREDIT_COSTS['flux-depth-pro']
    : useGrok
    ? CREDIT_COSTS['grok-aurora']
    : CREDIT_COSTS[model];
  const modelLabel = isFluxMode ? 'flux-depth-pro' : useGrok ? 'grok-aurora' : model;

  try {
    // Fail fast before spending 20-30s on generation
    await checkCredits(supabase, resolvedUserId, credits, body.workspace_id);

    let imageUrl: string;

    // ── Mode 1: text-to-image ──────────────────────────────────────────────
    if (mode === 'text-to-image') {
      const narrative = await buildNarrativePrompt({
        room_type: body.room_type,
        style: body.style,
        materials: body.material_images ? undefined : undefined,
        user_prompt: body.prompt,
      });

      // If material_images provided, fetch them as reference inputs
      let prompt: string | { text: string; images: (Uint8Array | string)[] } = narrative;
      if (body.material_images && body.material_images.length > 0) {
        const materialBuffers = await Promise.all(
          body.material_images.slice(0, 14).map(fetchImageBuffer),
        );
        prompt = { text: narrative, images: materialBuffers };
      }

      const result = await generateImageWithGemini(prompt, { model, aspectRatio });
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
      const result = await generateImageWithGemini(shotPrompt, { model, aspectRatio: shotRatio });
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
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
        const grokPrompt = `You are making a targeted edit to this interior design photo.

INSTRUCTION: "${instruction}"

SPATIAL RULES — never break these:
- Every fixed element stays in its exact position: sink, vanity, toilet, shower, bath, doors, windows, niches, alcoves, built-ins.
- Room dimensions, wall positions, ceiling height, and all architectural structure are unchanged.
- Camera angle and perspective match the reference photo exactly.

DESIGN CHANGES to apply exactly as instructed:
- Update all surface materials as described (floor, walls, ceiling).
- Update fixture finishes: taps, rails, handles, mirrors — keep position, change finish as instructed.
- Update furniture and vanity: keep placement, update color/material/finish.
- Update lighting: keep fixture positions, change style or temperature as instructed.

OUTPUT: Photorealistic professional interior photography. Ultra-realistic textures, accurate reflections. 24mm architectural lens, corrected verticals, no fisheye.`;

        const result = await editImageWithGrok(grokPrompt, sourceBuffer);
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else if (body.style_reference_url) {
        // Two-step style-transfer (Gemini):
        //   Step 1 — Vision: send inspiration to Gemini text model → extract design spec
        //   Step 2 — Edit: send room image + text spec → cosmetic renovation, zero spatial bleed
        const styleBuffer = await fetchImageBuffer(body.style_reference_url);
        let applyPrompt: string;
        try {
          const designSpec = await extractDesignSpec(styleBuffer, body.style);
          applyPrompt = buildApplySpecPrompt(designSpec, body.prompt);
        } catch (specErr) {
          console.warn('[generate-interior-gemini] Spec extraction failed, using fallback:', specErr);
          applyPrompt = buildApplySpecPrompt(
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
        const editText = `You are redesigning the interior shown in the reference photo.

INSTRUCTION: "${instruction}"

SPATIAL RULES (never break these):
- Every fixed element stays in its exact position: sink, vanity, toilet, shower, bath, doors, windows, niches, alcoves, built-ins.
- Room dimensions, wall positions, ceiling height, and all architectural structure are unchanged.
- Camera angle and perspective match the reference photo exactly.

DESIGN CHANGES to apply:
- Update all surface materials as described: floor tiles (color, size, pattern, grout), wall tiles (color, size, format, zone splits, grout), ceiling finish.
- Update all fixture finishes: taps, towel rails, shower heads, handles, mirrors — keep their style/position, change their finish as instructed.
- Update furniture and vanity: keep placement, update color/material/finish as instructed.
- Update lighting: keep fixture positions, change style or color temperature as instructed.
- If no specific material is mentioned, make an intelligent high-end upgrade consistent with the instruction's style direction.

OUTPUT: Photorealistic professional interior photography. Ultra-realistic material textures, accurate reflections, natural lighting. 24mm architectural lens, corrected verticals, no fisheye.`;

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
        const grokCopyStylePrompt = `You are performing a style transfer on an interior room.

The INSPIRATION IMAGE (provided as context below) shows a reference interior design aesthetic.
The ROOM IMAGE (attached) is the room to redesign.

TASK: Apply the complete aesthetic from the inspiration image to the room:
- Extract: wall finish, color, tile pattern and size, floor material, fixture style, hardware finishes, lighting mood, color palette.
- Apply ALL of these to the room image exactly. Every surface must be updated.

STRUCTURAL LOCK — never change:
- Room dimensions, wall positions, door and window openings, camera angle, perspective.
- All fixture positions stay in their zones (sink zone, toilet zone, bathing/seating area).

SURFACE COVERAGE — critical:
- Every wall surface covered floor-to-ceiling, edge-to-edge with the specified wall material. Zero original wall visible.
- Floor material covers the entire floor plane without gaps.
${body.prompt ? `\nADDITIONAL INSTRUCTION: ${body.prompt}` : ''}

INSPIRATION IMAGE (base64): data:image/jpeg;base64,${inspirationB64}

OUTPUT: Photorealistic professional interior photography. 24mm lens, corrected verticals, ultra-realistic textures.`;

        const result = await editImageWithGrok(grokCopyStylePrompt, roomBuffer);
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      } else {
        // Gemini + Flux 2-step pipeline (primary for non-grok)
        const inspirationBuffer = await fetchImageBuffer(body.style_reference_url);
        let fluxPrompt: string;
        let designSpec: string | null = null;
        try {
          designSpec = await extractDesignSpec(inspirationBuffer, body.style);
          fluxPrompt = buildFluxCopyStylePrompt(designSpec, body.room_type, body.prompt);
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
            const applyPrompt = buildCopyStyleApplyPrompt(designSpec, body.prompt);
            const result = await generateImageWithGemini(
              { text: applyPrompt, images: [roomBuffer] },
              { model, aspectRatio },
            );
            imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
          } else {
            const dualPrompt = buildDualReferenceStylePrompt(body.style, body.prompt);
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
          const designSpec = await extractDesignSpec(styleBuffer, body.style);
          applyPrompt = buildApplySpecPrompt(designSpec, body.prompt);
        } catch (specErr) {
          console.warn('[generate-interior-gemini] Spec extraction failed (floor-plan-render), using fallback:', specErr);
          applyPrompt = buildApplySpecPrompt(
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
        const renderPrompt = buildFloorPlanRenderPrompt(body.style, body.prompt);
        const result = await generateImageWithGemini(
          { text: renderPrompt, images: [sourceBuffer] },
          { model, aspectRatio: '1:1' },
        );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId, uploadCtx);
      }
    }

    // ── Mode 4: floor-plan-text (text → 2D floor plan diagram) ─────────────
    else if (mode === 'floor-plan-text') {
      const diagramPrompt = buildFloorPlanDiagramPrompt({
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
      const hardcodedPrompt = buildMaterialsBoardPrompt(boardMode, body.room_type, body.style, body.prompt);
      const boardPrompt = await getGenerationPrompt(
        supabase,
        `materials_board_${boardMode}`,
        hardcodedPrompt,
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

    await deductCredits(
      supabase,
      resolvedUserId,
      credits,
      `Interior design generation (${model}, ${mode})`,
      body.workspace_id,
    );

    await supabase.from('ai_usage_logs').insert({
      user_id: resolvedUserId,
      operation_type: 'interior_design_generation',
      model_name: model,
      credits_debited: credits,
      metadata: { mode, model },
    }).then(() => {}, () => {});

    // Persist to generation_3d
    await supabase.from('generation_3d').insert({
      id: jobId,
      user_id: resolvedUserId,
      workspace_id: body.workspace_id,
      prompt: body.prompt ?? '',
      room_type: body.room_type,
      style: body.style,
      generation_status: 'completed',
      progress_percentage: 100,
      request_type: mode === 'materials-selection-board' ? `materials_selection_board_${body.board_mode ?? 'selection-board'}` : mode,
      models_queue: (mode === 'redesign' || mode === 'copy-style')
        ? [{ id: 'flux-depth-pro', name: 'Flux Depth Pro', provider: 'replicate' }]
        : [{ id: model, name: `Gemini ${model}`, provider: 'google' }],
      models_results: {
        [modelLabel]: { success: true, image_url: imageUrl, board_mode: body.board_mode },
      },
      workflow_status: 'completed',
      completed_at: new Date().toISOString(),
    });

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
