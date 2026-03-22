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
 *   - gemini-3.1-flash-image-preview (fast, 6 credits)
 *   - gemini-3-pro-image-preview     (4K quality, 15 credits)
 *
 * Requires: GOOGLE_GENERATIVE_AI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  generateImageWithGemini,
  type GeminiImageModel,
  type ImageAspectRatio,
} from '../_shared/ai-client.ts';
import {
  buildNarrativePrompt,
  buildFloorPlanRenderPrompt,
  buildFloorPlanDiagramPrompt,
} from '../_shared/interior-prompt-builder.ts';
import { getGenerationPrompt } from '../_shared/prompt-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '';
const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') || '';

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
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: toBase64(imageBuffer) } },
            { text: `You are an interior design analyst. Study this room photo carefully and produce a precise, exhaustive design specification. This spec will be used to replicate the exact visual look in a different room — not the layout, only the aesthetics.

Output a structured specification. Be specific about every color (e.g. "warm white", "charcoal dark grey", "terracotta"), every material, every pattern, and every finish.

FLOORS: [exact material — tile/stone/marble/wood/concrete, precise color and tone, tile size and format e.g. "600x600mm large format", laying pattern — straight/diagonal/herringbone/chevron, finish — matte/gloss/honed/polished, grout color and approximate joint width]

WALLS - PRIMARY SURFACE: [tile or paint or cladding material, exact color, size/format if tiled, texture, finish, laying pattern, grout color and joint width]

WALLS - SECONDARY ZONES (if walls have two different treatments or a dual-color split): [describe each zone: material, color, exactly where the split occurs — e.g. "lower third in dark tile, upper two thirds in white plaster"]

WALL NICHES / RECESSES: [if present: tile treatment inside niche, color contrast vs surrounding wall]

CEILING: [color, finish — matte/gloss, any coving/cornice/shadow-gap/cove lighting details]

BASIN / SINK: [type — undermount/vessel/wall-hung/integrated, shape — rectangular/round/oval, color/material]

VANITY UNIT: [color, material — wood/lacquer/stone, door style — flat/shaker/handleless, handle style if present]

TAPS & FITTINGS: [metal finish — chrome/brushed nickel/brushed brass/matte black/gunmetal/rose gold, style — deck-mounted/wall-mounted/freestanding]

MIRROR: [shape — rectangular/round/arch/irregular, framed or frameless, any integrated LED backlight or front strip]

SHOWER AREA: [enclosure type — frameless walk-in/framed/wet-room open, glass type — clear/fluted/smoked, any shower niche: position and tile treatment inside vs outside, shower head style — overhead rain/wall-mounted/handheld]

TOWEL RAILS & ACCESSORIES: [style — ladder/bar/ring, metal finish — must match taps or note if different]

LIGHTING: [fixture types visible — recessed downlights/LED strips/sconces/pendant/mirror light, color temperature — warm/neutral/cool, overall mood — bright clinical / warm intimate / soft natural]

FULL COLOR PALETTE: [list every distinct color in the room: e.g. "off-white walls", "warm grey large floor tile", "brushed brass hardware", "deep charcoal accent shelf", "sage green towel"]
${style ? `\nDESIGN STYLE: ${style}` : ''}

Be thorough. Every detail you miss will not appear in the renovation.` },
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
}

/**
 * Step 2 prompt: applies an extracted text design spec to a room image.
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
 * Build a Flux text prompt that applies an extracted design spec to a room.
 * Used for Copy Style — the spec was extracted from the inspiration image by Gemini Vision.
 */
function buildFluxCopyStylePrompt(designSpec: string, roomType?: string, userInstruction?: string): string {
  const room = roomType || 'interior space';
  return `Apply the following complete interior design aesthetic to this ${room}. Preserve every fixture position and the spatial layout exactly — nothing moves.\n\n${designSpec}\n${userInstruction ? `\nAdditional instruction: ${userInstruction}\n` : ''}\nUltra-realistic physically accurate materials and lighting. 24mm architectural lens, corrected verticals, no fisheye distortion.`;
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
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');

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
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
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
      { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } },
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
  'gemini-3.1-flash-image-preview': 6,
  'gemini-3-pro-image-preview': 15,
  'flux-depth-pro': 20,
};

type GenerationMode = 'text-to-image' | 'image-edit' | 'redesign' | 'copy-style' | 'floor-plan-render' | 'floor-plan-text' | 'materials-selection-board';
type BoardMode = 'presentation-board' | 'selection-board' | 'photorealistic-render';

interface GenerateInteriorRequest {
  mode?: GenerationMode;
  // Common
  prompt?: string;
  room_type?: string;
  style?: string;
  sqm?: number;
  aspect_ratio?: ImageAspectRatio;
  model_tier?: 'fast' | 'pro';
  // Material references (multi-reference generation)
  material_images?: string[]; // up to 14 catalog product image URLs
  // Image edit / floor plan render
  reference_image_url?: string;
  edit_instruction?: string;
  // Second uploaded image: style/mood reference for dual-image Copy Style and Redesign modes
  style_reference_url?: string;
  // Materials Selection Board
  board_mode?: BoardMode;
  // User context
  user_id?: string;
  workspace_id?: string;
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
  suffix = '',
): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const path = `gemini/${jobId}${suffix}.${ext}`;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

/** Deduct credits from user balance */
async function deductCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  description: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('debit_user_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'interior_generation',
    p_description: description,
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

Deno.serve(async (req) => {
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
  const model: GeminiImageModel =
    body.model_tier === 'pro'
      ? 'gemini-3-pro-image-preview'
      : 'gemini-3.1-flash-image-preview';
  const aspectRatio: ImageAspectRatio = body.aspect_ratio ?? '16:9';
  const mode: GenerationMode = body.mode ?? detectMode(body);
  const isFluxMode = mode === 'redesign' || mode === 'copy-style';
  const credits = isFluxMode ? CREDIT_COSTS['flux-depth-pro'] : CREDIT_COSTS[model];
  const modelLabel = isFluxMode ? 'flux-depth-pro' : model;

  try {
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
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
    }

    // ── Mode 2: image-edit ─────────────────────────────────────────────────
    else if (mode === 'image-edit') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for image-edit mode' }, 400);
      }

      const sourceBuffer = await fetchImageBuffer(body.reference_image_url);

      if (body.style_reference_url) {
        // Two-step style-transfer pipeline:
        //   Step 1 — Vision: send inspiration image to Gemini text model → extract precise design spec (text)
        //   Step 2 — Edit:   send room image + text spec to image model → cosmetic renovation
        // The inspiration image never reaches the image generator → zero spatial bleed.
        const styleBuffer = await fetchImageBuffer(body.style_reference_url);
        let applyPrompt: string;
        try {
          const designSpec = await extractDesignSpec(styleBuffer, body.style);
          console.log('[generate-interior-gemini] Design spec extracted, length:', designSpec.length);
          applyPrompt = buildApplySpecPrompt(designSpec, body.prompt);
        } catch (specErr) {
          // Fallback: use user instruction directly without spec extraction
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
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
      } else {
        const instruction = body.edit_instruction ?? body.prompt ?? 'Redesign this room with updated materials and finishes';
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
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
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
      imageUrl = await uploadToStorage(supabase, base64, 'image/webp', jobId);
    }

    // ── Mode 4: copy-style — Gemini Vision spec + Flux Depth Pro ──────────
    // Step 1: Gemini Vision reads inspiration image → structured text spec
    // Step 2: Flux Depth Pro applies that spec to the room (depth-locked)
    // The inspiration image NEVER reaches Flux → zero spatial bleed.
    else if (mode === 'copy-style') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for copy-style mode' }, 400);
      }
      if (!body.style_reference_url) {
        return jsonResponse({ success: false, error: 'style_reference_url (inspiration image) required for copy-style mode' }, 400);
      }

      // Step 1 — extract design spec from inspiration image
      const inspirationBuffer = await fetchImageBuffer(body.style_reference_url);
      let fluxPrompt: string;
      try {
        const designSpec = await extractDesignSpec(inspirationBuffer, body.style);
        console.log('[generate-interior-gemini] Copy-style spec extracted, length:', designSpec.length);
        fluxPrompt = buildFluxCopyStylePrompt(designSpec, body.room_type, body.prompt);
      } catch (specErr) {
        console.warn('[generate-interior-gemini] Spec extraction failed for copy-style, using fallback:', specErr);
        fluxPrompt = buildFluxRedesignPrompt(body.style, body.room_type, body.prompt ?? 'Apply a high-end complete visual transformation.');
      }

      // Step 2 — apply via Flux Depth Pro (structure locked to reference_image_url = Your Room)
      // Falls back to Gemini image-edit if Flux fails for any reason.
      try {
        const replicateUrl = await callFluxDepthPro(body.reference_image_url, fluxPrompt, aspectRatio);
        const imgBuffer = await fetchImageBuffer(replicateUrl);
        const base64 = toBase64(imgBuffer);
        imageUrl = await uploadToStorage(supabase, base64, 'image/webp', jobId);
      } catch (fluxErr) {
        console.warn('[generate-interior-gemini] Flux failed for copy-style, falling back to Gemini:', fluxErr);
        const sourceBuffer = await fetchImageBuffer(body.reference_image_url);
        const applyPrompt = buildApplySpecPrompt(fluxPrompt, body.prompt);
        const result = await generateImageWithGemini(
          { text: applyPrompt, images: [sourceBuffer] },
          { model, aspectRatio },
        );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
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
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
      } else {
        // Single image: floor plan → perspective render, or style reference → new design
        const renderPrompt = buildFloorPlanRenderPrompt(body.style, body.prompt);
        const result = await generateImageWithGemini(
          { text: renderPrompt, images: [sourceBuffer] },
          { model, aspectRatio: '1:1' },
        );
        imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
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
      imageUrl = await uploadToStorage(supabase, diagramResult.base64, diagramResult.mimeType, jobId);
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
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
    }

    else {
      return jsonResponse({ success: false, error: `Unknown mode: ${mode}` }, 400);
    }

    // Deduct credits (modes 1-3)
    await deductCredits(
      supabase,
      resolvedUserId,
      credits,
      `Interior design generation (${model}, ${mode})`,
    );

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
    return jsonResponse({ success: false, error: message }, 500);
  }
});

function detectMode(body: GenerateInteriorRequest): GenerationMode {
  // With a reference image, default to image-edit regardless of edit_instruction presence.
  // Callers that want floor-plan-render or copy-style MUST pass mode explicitly.
  if (body.reference_image_url) return 'image-edit';
  if (!body.reference_image_url && (body.prompt?.toLowerCase().includes('floor plan') || body.sqm)) {
    return 'floor-plan-text';
  }
  return 'text-to-image';
}
