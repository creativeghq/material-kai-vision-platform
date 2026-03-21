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

// Credit costs
const CREDIT_COSTS: Record<GeminiImageModel, number> = {
  'gemini-3.1-flash-image-preview': 6,
  'gemini-3-pro-image-preview': 15,
};

type GenerationMode = 'text-to-image' | 'image-edit' | 'floor-plan-render' | 'floor-plan-text' | 'materials-selection-board';
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
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
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
  const credits = CREDIT_COSTS[model];
  const aspectRatio: ImageAspectRatio = body.aspect_ratio ?? '16:9';

  // Detect mode
  const mode: GenerationMode = body.mode ?? detectMode(body);

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

      const instruction = body.edit_instruction ?? body.prompt ?? 'Redesign this room';
      const editText = `You are editing the reference interior photo. Apply ONLY the following change:

"${instruction}"

STRICT RULES — you MUST follow these exactly:
- Keep ALL furniture, objects, and decorative elements in their EXACT positions. Do NOT add, remove, or relocate anything.
- Keep ALL architectural features (walls, windows, doors, ceiling, floor layout) identical to the reference.
- Only modify what the instruction explicitly asks for.
- The result must look like the same room with ONLY the requested change applied.
- Photorealistic, professional interior photography quality.`;

      const sourceBuffer = await fetchImageBuffer(body.reference_image_url);
      const result = await generateImageWithGemini(
        { text: editText, images: [sourceBuffer] },
        { model, aspectRatio },
      );
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
    }

    // ── Mode 3: floor-plan-render (image input → photorealistic top-down) ──
    else if (mode === 'floor-plan-render') {
      if (!body.reference_image_url) {
        return jsonResponse({ success: false, error: 'reference_image_url required for floor-plan-render mode' }, 400);
      }

      const renderPrompt = buildFloorPlanRenderPrompt(body.style, body.prompt);
      const sourceBuffer = await fetchImageBuffer(body.reference_image_url);
      const result = await generateImageWithGemini(
        { text: renderPrompt, images: [sourceBuffer] },
        { model, aspectRatio: '1:1' },
      );
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
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
        { model: 'gemini-3.1-flash-image-preview', aspectRatio: '1:1' },
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
      models_queue: [{ id: model, name: `Gemini ${model}`, provider: 'google' }],
      models_results: {
        [model]: { success: true, image_url: imageUrl, board_mode: body.board_mode },
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
  if (body.reference_image_url && body.edit_instruction) return 'image-edit';
  if (body.reference_image_url && !body.edit_instruction) return 'floor-plan-render';
  if (!body.reference_image_url && (body.prompt?.toLowerCase().includes('floor plan') || body.sqm)) {
    return 'floor-plan-text';
  }
  return 'text-to-image';
}
