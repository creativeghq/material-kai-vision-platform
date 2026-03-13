/**
 * generate-interior-gemini
 *
 * Gemini-backed interior design image generation edge function.
 * Handles four modes:
 *   1. text-to-image     — narrative prompt → new room render
 *   2. image-edit        — existing image + instruction → edited image
 *   3. floor-plan-render — floor plan image + style → photorealistic top-down render
 *   4. floor-plan-text   — text description → 2-step: diagram → photorealistic render
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

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Credit costs
const CREDIT_COSTS: Record<GeminiImageModel, number> = {
  'gemini-3.1-flash-image-preview': 6,
  'gemini-3-pro-image-preview': 15,
};

type GenerationMode = 'text-to-image' | 'image-edit' | 'floor-plan-render' | 'floor-plan-text';

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

  // Auth: accept service role JWT (internal server-to-server) OR user JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let resolvedUserId: string;

  // Decode JWT payload to check role claim (no crypto verification needed —
  // the Supabase gateway already rejects invalid JWTs via project signing secret)
  function decodeJwtRole(jwt: string): string | null {
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) return null;
      const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(padded));
      return payload?.role ?? null;
    } catch { return null; }
  }

  const jwtRole = decodeJwtRole(token);

  if (jwtRole === 'service_role' && body.user_id) {
    // Internal server-to-server call (Python backend, agent-chat, etc.)
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

      const editText = await buildNarrativePrompt({
        room_type: body.room_type,
        style: body.style,
        user_prompt: body.prompt,
        is_edit: true,
        edit_instruction: body.edit_instruction ?? body.prompt,
      });

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

      const renderPrompt = buildFloorPlanRenderPrompt(body.style);
      const sourceBuffer = await fetchImageBuffer(body.reference_image_url);
      const result = await generateImageWithGemini(
        { text: renderPrompt, images: [sourceBuffer] },
        { model, aspectRatio: '1:1' }, // floor plans are square
      );
      imageUrl = await uploadToStorage(supabase, result.base64, result.mimeType, jobId);
    }

    // ── Mode 4: floor-plan-text (text → 2-step: diagram → render) ──────────
    else if (mode === 'floor-plan-text') {
      // Step 1: Generate clean 2D diagram
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
      const diagramUrl = await uploadToStorage(
        supabase, diagramResult.base64, diagramResult.mimeType, jobId, '-diagram',
      );

      // Step 2: Apply photorealistic render to generated diagram
      const renderPrompt = buildFloorPlanRenderPrompt(body.style);
      const diagramBuffer = Uint8Array.from(atob(diagramResult.base64), (c) => c.charCodeAt(0));
      const renderResult = await generateImageWithGemini(
        { text: renderPrompt, images: [diagramBuffer] },
        { model, aspectRatio: '1:1' },
      );
      imageUrl = await uploadToStorage(supabase, renderResult.base64, renderResult.mimeType, jobId);

      // Deduct credits for 2 calls (step 1 always uses fast model = 6 credits)
      await deductCredits(
        supabase,
        resolvedUserId,
        credits + 6,
        `Floor plan 2-step generation (${model})`,
      );

      // Persist to generation_3d
      await supabase.from('generation_3d').insert({
        id: jobId,
        user_id: resolvedUserId,
        workspace_id: body.workspace_id,
        prompt: diagramPrompt,
        room_type: body.room_type,
        style: body.style,
        generation_status: 'completed',
        progress_percentage: 100,
        request_type: 'floor_plan_text',
        models_queue: [{ id: model, name: 'Gemini Floor Plan 2-Step', provider: 'google' }],
        models_results: {
          [model]: { success: true, image_url: imageUrl, diagram_url: diagramUrl },
        },
        workflow_status: 'completed',
        completed_at: new Date().toISOString(),
      });

      return jsonResponse({
        success: true,
        job_id: jobId,
        mode,
        model,
        image_url: imageUrl,
        diagram_url: diagramUrl,
        credits_used: credits + 6,
      });
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
      request_type: mode,
      models_queue: [{ id: model, name: `Gemini ${model}`, provider: 'google' }],
      models_results: {
        [model]: { success: true, image_url: imageUrl },
      },
      workflow_status: 'completed',
      completed_at: new Date().toISOString(),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      mode,
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
