/**
 * Generation Tools: create3DGenerationTool, createGeminiGenerationTool,
 * createVirtualStagingTool, createGenerationStatusTool
 * Also exports: EDIT_INTENT_PATTERNS, detectEditIntent
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * LangChain Tool: Interior Design Generation
 *
 * Calls MIVAA API to create generation job
 * Frontend polls database for real-time updates
 */
export const create3DGenerationTool = (
  userId: string,
  workspaceId: string,
  onChunk?: (chunk: any) => void,
  userImages: string[] = [], // User-attached images from conversation (data URLs or public URLs)
  conversationImages: string[] = [], // Previously generated image URLs (for edit intent detection)
) => {
  return tool(
    async ({ prompt, roomType, style, referenceImageUrl, models }) => {
      try {

        // Resolve the reference image:
        // 1. Agent-provided URL takes priority (public HTTP URL)
        // 2. Fall back to the user's first attached image
        // 3. If edit intent detected and no other image, use most recent generated image
        // 4. If it's a data URL, upload to Supabase storage to get a public URL
        //    (Replicate models require a public HTTP URL, not a base64 data URL)
        let resolvedImageUrl = referenceImageUrl || undefined;

        if (!resolvedImageUrl && userImages.length > 0) {
          const firstImage = userImages[0];
          if (firstImage.startsWith('data:')) {
            // Upload data URL to Supabase storage → get public URL for Replicate
            try {
              const commaIdx = firstImage.indexOf(',');
              const header = firstImage.slice(0, commaIdx); // "data:image/jpeg;base64"
              const base64Data = firstImage.slice(commaIdx + 1);
              const mimeType = header.slice(5, header.indexOf(';')); // "image/jpeg"
              const ext = mimeType.split('/')[1] || 'jpg';
              const fileName = `interior-ref-${Date.now()}.${ext}`;

              // Convert base64 to Uint8Array
              const binaryStr = atob(base64Data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('generation-images')
                .upload(`reference-images/${fileName}`, bytes, {
                  contentType: mimeType,
                  upsert: true,
                });

              if (!uploadError && uploadData) {
                const { data: urlData } = supabase.storage
                  .from('generation-images')
                  .getPublicUrl(uploadData.path);
                resolvedImageUrl = urlData.publicUrl;
                console.log('✅ Uploaded reference image to storage:', resolvedImageUrl);
              } else {
                console.error('❌ Failed to upload reference image:', uploadError);
              }
            } catch (uploadErr) {
              console.warn('⚠️ Image upload error, proceeding without reference:', uploadErr);
            }
          } else {
            // Already a public URL
            resolvedImageUrl = firstImage;
          }
        }

        // Auto-detect edit intent: if user prompt signals an edit (e.g. "change the floor",
        // "make it darker") and there are previously generated images, use the most recent one
        // as a reference so image-to-image mode is triggered across all 12 models.
        if (!resolvedImageUrl && conversationImages.length > 0 && detectEditIntent(prompt)) {
          resolvedImageUrl = conversationImages[conversationImages.length - 1];
          console.log('✅ Edit intent detected — using most recent generated image as reference:', resolvedImageUrl);
        }

        // Call MIVAA API to create job
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
        const interiorApiUrl = `${MIVAA_GATEWAY_URL}/api/interior`;

        // Add timeout to prevent edge function from hanging
        const TIMEOUT_MS = 60000; // 60 seconds (creating a job should be fast)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
          response = await fetch(interiorApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              room_type: roomType,
              style,
              image: resolvedImageUrl, // triggers image-to-image mode when set
              // Exclude gemini-interior: generate_gemini handles Gemini separately to avoid duplication
              models: models || undefined,
              exclude_models: ['gemini-interior'],
              user_id: userId,
              workspace_id: workspaceId,
              width: 768,
              height: 768,
            }),
            signal: controller.signal,
          });
        } catch (fetchError) {
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error(`Request timed out after ${TIMEOUT_MS}ms`);
          }
          throw fetchError;
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`MIVAA API error: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Generation failed');
        }

        // IMMEDIATELY send generation job info via streaming callback
        try {
          onChunk?.({
            type: 'generation_job_created',
            job_id: result.job_id,
            model_count: result.model_count,
            models: result.models,
            prompt: prompt,
            room_type: roomType,
            style: style,
          });
        } catch (e) {
          console.error('Failed to send generation_job_created chunk:', e);
        }

        const modeLabel = resolvedImageUrl ? 'image-to-image' : 'text-to-image';
        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          model_count: result.model_count,
          models: result.models,
          async_job: true,
          message: `Started generating ${result.model_count} interior design variations (${modeLabel}) for your ${roomType || 'space'}${style ? ` in ${style} style` : ''}. Watch progress in the panel below.`,
        });
      } catch (error) {
        console.error('Interior design generation error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Generation failed',
        });
      }
    },
    {
      name: 'generate_3d',
      description: `Generate multiple interior design style variations in parallel using Replicate AI models. Results appear progressively in the generation panel grid.
ALWAYS call generate_gemini alongside this tool in the same response.

Good for:
- Text-to-image: user describes a room from scratch with no uploaded image
- Free-form style redesign: user uploads a room photo and wants to see it in different styles (e.g. "make this Scandinavian", "redesign in industrial style")

Do NOT call this tool when:
- A chip mode was explicitly selected (floor-plan-render, image-edit, floor-plan-text) — those are Gemini-only precise operations. This is enforced server-side; do not call generate_3d in those cases.
- Iterative edits on a previously generated image — use generate_gemini alone.
- Floor plan requests — use generate_gemini alone with mode=floor-plan-text.`,
      schema: z.object({
        prompt: z.string().describe('Detailed design description (e.g., "Modern minimalist bedroom with oak flooring and white walls")'),
        roomType: z.string().optional().describe('Room type (bedroom, living_room, kitchen, bathroom, office, etc.)'),
        style: z.string().optional().describe('Design style (modern, minimalist, industrial, scandinavian, traditional, etc.)'),
        referenceImageUrl: z.string().optional().describe('Public HTTP URL of a reference image — only needed if NOT using the user uploaded image. Leave empty to use the uploaded image automatically.'),
        models: z.array(z.string()).optional().describe('Specific model IDs to restrict generation to. Omit to use all models for the selected mode.'),
      }),
    }
  );
};

// Edit intent patterns for multi-turn conversational editing
export const EDIT_INTENT_PATTERNS = [
  /change\s+the\s+(floor|wall|ceiling|furniture|tile|color|material|rug|sofa|door|window)/i,
  /replace\s+the\s+/i,
  /make\s+it\s+(more|less)\s+/i,
  /swap\s+(the|this)\s+/i,
  /now\s+(use|apply|add|make)\s+/i,
  /update\s+the\s+(floor|wall|ceiling|style|color)/i,
  /can\s+you\s+(change|update|replace|modify)/i,
  /different\s+(color|material|style|floor|wall)/i,
  /instead\s+of\s+/i,
  /keep\s+everything\s+but\s+/i,
];

export function detectEditIntent(message: string): boolean {
  return EDIT_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * LangChain Tool: Gemini Interior Design Generation
 *
 * Uses Gemini 3.1 Flash Image / Pro for:
 * - Fast text-to-image generation
 * - Multi-turn conversational image editing
 * - Floor plan → photorealistic render
 * - Two-step floor plan from text
 * - Multi-reference material generation
 */
export const createGeminiGenerationTool = (
  userId: string,
  workspaceId: string,
  images: string[],
  conversationImages: string[],
  onChunk?: (chunk: any) => void,
  pinnedMaterialImages: string[] = [],
  forcedMode?: string, // Explicit mode override from UI chip selection
) => {
  return tool(
    async ({ prompt, roomType, style, mode, referenceImageUrl, modelTier, materialImages, sqm, boardMode }) => {
      try {

        // Helper: upload a data URL to Supabase storage, return public URL.
        // Images should already be uploaded by the frontend — this is a last-resort fallback.
        const uploadDataUrl = async (dataUrl: string): Promise<string | undefined> => {
          try {
            const commaIdx = dataUrl.indexOf(',');
            const header = dataUrl.slice(0, commaIdx);
            const base64Data = dataUrl.slice(commaIdx + 1);
            const mimeType = header.slice(5, header.indexOf(';'));
            const ext = mimeType.split('/')[1] || 'jpg';
            const fileName = `gemini-ref-${Date.now()}.${ext}`;
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const { data: uploadData, error } = await supabase.storage
              .from('generation-images')
              .upload(`reference-images/${fileName}`, bytes, { contentType: mimeType, upsert: true });
            if (error || !uploadData) {
              console.error('[generation-tools] Storage upload failed:', error?.message);
              return undefined;
            }
            return supabase.storage.from('generation-images').getPublicUrl(uploadData.path).data.publicUrl;
          } catch (e) {
            console.error('[generation-tools] uploadDataUrl error:', e);
            return undefined;
          }
        };

        // Auto-detect generation mode if not explicitly specified by the agent
        // forcedMode (from UI chip) always wins over both agent-specified mode and auto-detection
        // 'copy-style' is a UI-only alias — maps to floor-plan-render (style reference mode)
        const normalizedForcedMode = forcedMode === 'copy-style' ? 'floor-plan-render' : forcedMode;
        let resolvedMode = (normalizedForcedMode as any) || mode;
        if (!resolvedMode) {
          const hasRecentGeneration = conversationImages.length > 0;
          const hasUploadedImage = images.length > 0;

          // Edit intent on a previously generated image (e.g. "change the floor")
          if (detectEditIntent(prompt) && hasRecentGeneration) {
            resolvedMode = 'image-edit';

          // Text-based floor plan generation (no image, mentions floor plan or has sqm)
          } else if (!referenceImageUrl && !hasUploadedImage && (/floor\s*plan|2d\s*plan|floor\s*map|room\s*layout.*diagram|draw.*layout|create.*plan|generate.*plan/i.test(prompt || '') || sqm)) {
            resolvedMode = 'floor-plan-text';

          // Floor plan image → perspective render (explicit floor plan keyword)
          } else if ((referenceImageUrl || hasUploadedImage) && /floor\s*plan|render.*layout|convert.*plan/i.test(prompt || '')) {
            resolvedMode = 'floor-plan-render';

          // Style reference (copy style / mood / palette from uploaded image)
          } else if ((referenceImageUrl || hasUploadedImage) && /copy.*style|use.*style|style.*reference|match.*mood|inspired by|palette|atmosphere/i.test(prompt || '')) {
            resolvedMode = 'floor-plan-render';

          // Any uploaded image defaults to image-edit (edits ON TOP of the original photo)
          } else if (referenceImageUrl || hasUploadedImage) {
            resolvedMode = 'image-edit';

          } else {
            resolvedMode = 'text-to-image';
          }
        }

        // materials-selection-board: requires a reference image (most recent generated image or explicit URL)
        if (resolvedMode === 'materials-selection-board' && !referenceImageUrl) {
          const fallback = conversationImages[conversationImages.length - 1] || images[0];
          if (!fallback) {
            return JSON.stringify({
              success: false,
              error: 'A generated design image is required to create a materials selection board. Please generate a design first, then ask for a materials board.',
            });
          }
        }

        // For image-edit: prefer (1) explicit referenceImageUrl, (2) uploaded image (should already
        // be a public URL after frontend pre-upload), (3) most recent generated image
        let resolvedReferenceUrl: string | undefined = referenceImageUrl;
        if (!resolvedReferenceUrl && resolvedMode === 'image-edit') {
          if (images.length > 0) {
            const candidate = images[0];
            // Images should already be public URLs (uploaded by frontend).
            // Fall back to uploadDataUrl only if still a data URL.
            if (candidate.startsWith('data:')) {
              console.warn('[generation-tools] image still a data URL — frontend upload may have failed, attempting re-upload');
              resolvedReferenceUrl = await uploadDataUrl(candidate);
            } else {
              resolvedReferenceUrl = candidate;
            }
          } else if (conversationImages.length > 0) {
            resolvedReferenceUrl = conversationImages[conversationImages.length - 1];
          }
        }

        // Hard guard: image-edit with no reference image would generate a completely unrelated result
        if (resolvedMode === 'image-edit' && !resolvedReferenceUrl) {
          return JSON.stringify({
            success: false,
            error: 'No reference image available for editing. Please attach an image or generate one first.',
          });
        }

        // For floor-plan-render: use attached image if available, upload data URL if needed
        let floorPlanImageUrl: string | undefined;
        if (resolvedMode === 'floor-plan-render') {
          const candidateUrl = resolvedReferenceUrl || (images.length > 0 ? images[0] : undefined);
          if (candidateUrl?.startsWith('data:')) {
            floorPlanImageUrl = await uploadDataUrl(candidateUrl) ?? candidateUrl;
          } else {
            floorPlanImageUrl = candidateUrl;
          }
        } else {
          floorPlanImageUrl = resolvedReferenceUrl;
        }

        // For materials-selection-board: resolve reference from conversationImages or uploaded image
        let materialsBoardRefUrl = floorPlanImageUrl;
        if (resolvedMode === 'materials-selection-board' && !materialsBoardRefUrl) {
          const candidate = referenceImageUrl || conversationImages[conversationImages.length - 1] || images[0];
          if (candidate?.startsWith('data:')) {
            materialsBoardRefUrl = await uploadDataUrl(candidate) ?? candidate;
          } else {
            materialsBoardRefUrl = candidate;
          }
        }

        const resolvedBoardMode = boardMode || 'selection-board';

        const body: Record<string, unknown> = {
          mode: resolvedMode,
          prompt,
          room_type: roomType,
          style,
          sqm,
          model_tier: resolvedMode === 'materials-selection-board' ? 'pro' : (modelTier ?? 'fast'),
          user_id: userId,
          workspace_id: workspaceId,
          ...(resolvedMode === 'materials-selection-board'
            ? {
                reference_image_url: materialsBoardRefUrl,
                board_mode: resolvedBoardMode,
                aspect_ratio: resolvedBoardMode === 'photorealistic-render' ? '16:9' : '1:1',
              }
            : { ...(floorPlanImageUrl ? { reference_image_url: floorPlanImageUrl } : {}) }),
          // For image-edit mode, the prompt IS the edit instruction — send it explicitly
          // so the edge function doesn't need to fallback-guess which field to use.
          ...(resolvedMode === 'image-edit' ? { edit_instruction: prompt } : {}),
          ...((() => {
            const merged = [...(materialImages || []), ...pinnedMaterialImages].slice(0, 14);
            return merged.length > 0 ? { material_images: merged } : {};
          })()),
        };

        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-interior-gemini`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Gemini generation error: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Gemini generation failed');
        }


        // Emit image result via streaming
        if (resolvedMode === 'materials-selection-board') {
          onChunk?.({
            type: 'materials_board_ready',
            job_id: result.job_id,
            image_url: result.image_url,
            board_mode: resolvedBoardMode,
            credits_used: result.credits_used,
          });
        } else {
          onChunk?.({
            type: 'gemini_image_ready',
            job_id: result.job_id,
            image_url: result.image_url,
            diagram_url: result.diagram_url,
            mode: resolvedMode,
            model: result.model,
            credits_used: result.credits_used,
          });
        }

        const modeLabels: Record<string, string> = {
          'text-to-image': 'generated a new design',
          'image-edit': 'applied your edit',
          'floor-plan-render': 'rendered your floor plan',
          'floor-plan-text': 'created your floor plan',
          'materials-selection-board': 'created your materials board',
        };

        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          image_url: result.image_url,
          model: result.model,
          credits_used: result.credits_used,
          message: `I've ${modeLabels[resolvedMode] || 'generated the image'}! ${modelTier === 'pro' ? 'Using Gemini Pro for maximum quality.' : 'You can ask me to refine it — e.g., "change the floor to marble" or "make it warmer".'}`,
        });
      } catch (error) {
        console.error('Gemini generation error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Generation failed',
        });
      }
    },
    {
      name: 'generate_gemini',
      description: `Generate or edit interior design images using Gemini AI. Provides an immediate single result in the chat.

PARAMETER EXTRACTION — always do this before calling:
1. Extract roomType from user message (bedroom, living_room, kitchen, bathroom, dining_room, home_office, etc.)
2. Extract style from user message (modern, scandinavian, minimalist, industrial, japandi, luxury, etc.)
3. Set prompt to the user's full design description or edit instruction verbatim

WHEN TO CALL ALONGSIDE generate_3d:
- Text-to-image or free-form style redesign → call BOTH. generate_3d fills the variation grid; this tool gives an immediate Gemini result.

WHEN TO call this tool ALONE (do NOT call generate_3d):
- A chip mode is active (floor-plan-render, image-edit, floor-plan-text) — generate_3d is already excluded server-side for these modes
- Iterative edit on a previously generated image ("change the floor", "make it warmer")
- Floor plan requests — use mode=floor-plan-text
- Materials board generation

Mode routing (auto-detected if not set explicitly):
- User uploads any room photo (default) → image-edit: edits DIRECTLY ON TOP of the uploaded photo, preserving spatial layout and element positions
- User uploads a floor plan image → floor-plan-render: generates a photorealistic EYE-LEVEL PERSPECTIVE interior render from the floor plan
- User uploads a reference photo and says "copy the style / palette / mood" → floor-plan-render: creates a new interior design inspired by the photo's aesthetic
- User says "change the floor / swap the tiles / make it darker" on a previously generated image → image-edit: edits the most recent generated image
- User asks for a new design from text only → text-to-image
- User mentions "floor plan" with dimensions or sqm, no image → floor-plan-text: generates a clean 2D floor plan diagram (top-down architectural drawing)
- User asks for a materials board / presentation board → materials-selection-board (requires a previously generated design)`,
      schema: z.object({
        prompt: z.string().describe('Design description or edit instruction (e.g. "change the floor to marble and make walls warmer")'),
        roomType: z.string().optional().describe('ALWAYS extract from user message when present. Room type: bedroom, living_room, kitchen, bathroom, dining_room, home_office, hallway, studio, outdoor, kids_room, basement'),
        style: z.string().optional().describe('ALWAYS extract from user message when present. Design style: modern, minimalist, scandinavian, industrial, luxury, bohemian, traditional, mediterranean, japandi, art_deco, rustic, coastal'),
        mode: z.enum(['text-to-image', 'image-edit', 'floor-plan-render', 'floor-plan-text', 'materials-selection-board']).optional().describe('Generation mode. Use floor-plan-render when user uploads a floor plan or any reference image. Use materials-selection-board to generate a professional materials board from a generated design. Omit to auto-detect.'),
        referenceImageUrl: z.string().optional().describe('URL of image to edit or floor plan to render. Leave empty when user has uploaded an image — it is used automatically.'),
        modelTier: z.enum(['fast', 'pro']).optional().describe('fast=Gemini 3.1 Flash (6 credits), pro=Gemini 3 Pro 4K (15 credits). Use pro when user requests maximum quality or 4K. materials-selection-board always uses pro.'),
        materialImages: z.array(z.string()).optional().describe('URLs of catalog material images to incorporate into the design (up to 14)'),
        sqm: z.number().optional().describe('Floor area in sqm for floor-plan-text generation'),
        boardMode: z.enum(['presentation-board', 'selection-board', 'photorealistic-render']).optional().describe('Board layout when mode=materials-selection-board. presentation-board=fitment + isometric + material column; selection-board=cutaway view with swatches; photorealistic-render=magazine-quality 16:9 render. Defaults to selection-board.'),
      }),
    }
  );
};

/**
 * LangChain Tool: Virtual Staging
 *
 * Stages an empty room with AI-generated furniture using proplabs/virtual-staging.
 * Use when the user wants to see how an empty room would look furnished.
 */
export const createVirtualStagingTool = (
  userId: string,
  workspaceId: string,
  conversationImages: string[],
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ sourceImageUrl, room, furnitureStyle, furnitureItems }) => {
      try {

        // Fall back to most recent conversation image if no explicit URL given
        const resolvedImageUrl =
          sourceImageUrl || conversationImages[conversationImages.length - 1];

        if (!resolvedImageUrl) {
          return JSON.stringify({
            success: false,
            error: 'No image available to stage. Please provide a room photo or generate a design first.',
          });
        }

        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-virtual-staging`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            source_image_url: resolvedImageUrl,
            room,
            furniture_style: furnitureStyle || 'Default (AI decides)',
            furniture_items: furnitureItems,
            workspace_id: workspaceId,
            user_id: userId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Virtual staging error: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Virtual staging failed');
        }


        onChunk?.({
          type: 'virtual_staging_ready',
          job_id: result.job_id,
          image_url: result.image_url,
          room: result.room,
          furniture_style: result.furniture_style,
          credits_used: result.credits_used,
        });

        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          image_url: result.image_url,
          room: result.room,
          furniture_style: result.furniture_style,
          credits_used: result.credits_used,
          message: `Virtual staging complete! The ${result.room} has been staged in ${result.furniture_style} style. ${result.credits_used} credits used.`,
        });
      } catch (error) {
        console.error('Virtual staging error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Virtual staging failed',
        });
      }
    },
    {
      name: 'virtual_staging',
      description: `Stage an empty room with AI-generated furniture. Use this when the user wants to:
- See how an empty room would look with furniture
- Stage a property for real estate
- Visualize a room layout before buying furniture
Requires a room photo URL (from a previous generation or uploaded image). Ask the user for the room type and style preference if not specified.`,
      schema: z.object({
        sourceImageUrl: z.string().optional().describe('Public URL of the empty room image. If omitted, uses the most recently generated image.'),
        room: z.enum(['Living Room', 'Bedroom', 'Balcony', 'Dining Room', 'Office', 'Kitchen', 'Bathroom', 'Garden', 'Swimming Pool']).describe('Room type to stage'),
        furnitureStyle: z.enum(['Default (AI decides)', 'Modern', 'Scandinavian', 'Transitional', 'Rustic', 'Mid-Century Modern', 'Urban Industrial', 'Farmhouse', 'Coastal', 'Traditional', 'Modern Organic', 'Scandinavian Oasis', 'Transitional Luxury', 'B&W Modern', 'Farmhouse Hacienda', 'Metro Industrial', 'NYC Modern']).optional().describe('Furniture style'),
        furnitureItems: z.string().optional().describe('Specific furniture items to include, comma-separated'),
      }),
    },
  );
};

/**
 * LangChain Tool: Check Generation Status
 *
 * Allows agent to query the status of ongoing 3D generation jobs
 * Returns progress, completed/failed counts, and elapsed time
 */
export const createGenerationStatusTool = () => {
  return tool(
    async ({ jobId }) => {
      try {

        const { data, error } = await supabase
          .from('generation_3d')
          .select('generation_status, progress_percentage, metadata, created_at')
          .eq('id', jobId)
          .single();

        if (error || !data) {
          return JSON.stringify({
            success: false,
            error: 'Job not found'
          });
        }

        const metadata = data.metadata as any;
        const modelsResults = metadata?.models_results || [];

        const completedCount = modelsResults.filter(
          (m: any) => m.status === 'completed'
        ).length;

        const failedCount = modelsResults.filter(
          (m: any) => m.status === 'failed'
        ).length;

        const elapsedSeconds = Math.floor(
          (Date.now() - new Date(data.created_at).getTime()) / 1000
        );

        return JSON.stringify({
          success: true,
          status: data.generation_status,
          progress: data.progress_percentage,
          completed_models: completedCount,
          failed_models: failedCount,
          total_models: modelsResults.length,
          elapsed_seconds: elapsedSeconds,
          models_details: modelsResults.map((m: any) => ({
            name: m.model_name,
            status: m.status,
            has_images: m.image_urls?.length > 0
          }))
        });
      } catch (error) {
        console.error('Generation status check error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Status check failed'
        });
      }
    },
    {
      name: 'check_generation_status',
      description: 'Check the status and progress of a 3D interior design generation job. Use this when user asks about generation progress, status, or "how is it going".',
      schema: z.object({
        jobId: z.string().describe('The generation job ID (UUID) to check status for')
      })
    }
  );
};
