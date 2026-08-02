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
              models: models || undefined,
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
      description: `Generate multiple interior design style variations in parallel using Replicate AI models + Gemini. Results appear progressively in the generation panel grid.
The grid already includes a Gemini tile, so do NOT also call generate_gemini for the same request — that would double-bill the user.

Good for:
- Text-to-image: user describes a room from scratch with no uploaded image
- Free-form style redesign: user uploads a room photo and wants to see it in different styles (e.g. "make this Scandinavian", "redesign in industrial style")

Do NOT call this tool when:
- A chip mode was explicitly selected (floor-plan-render, image-edit, floor-plan-text) — those are Gemini-only precise operations. This is enforced server-side; do not call generate_3d in those cases.
- Iterative edits on a previously generated image — use generate_gemini alone.
- Floor plan requests — use generate_gemini alone with mode=floor-plan-text.
- Materials selection board — use generate_gemini alone with mode=materials-selection-board.`,
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
  conversationId?: string, // Per-session storage folder key
) => {
  return tool(
    async ({ prompt: rawPrompt, roomType, style, mode, referenceImageUrl, modelTier: agentModelTier, materialImages, sqm, boardMode }) => {
      try {
        // Strip [model:grok] or [model:pro] prefix injected by the edit modal for auto-submit
        // The prefix encodes the model tier chosen by the user without going through the agent.
        let prompt = rawPrompt;
        let modelTier = agentModelTier;
        const modelPrefixMatch = rawPrompt?.match(/^\[model:(fast|pro|grok)\]\s*/);
        if (modelPrefixMatch) {
          modelTier = modelPrefixMatch[1] as 'fast' | 'pro' | 'grok';
          prompt = rawPrompt.slice(modelPrefixMatch[0].length);
        }

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
        const normalizedForcedMode = forcedMode; // pass through as-is (redesign, copy-style, image-edit all handled)
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

          // Copy style: 2 images uploaded (inspiration + room) — use Flux Depth Pro
          } else if (hasUploadedImage && images.length >= 2) {
            resolvedMode = 'copy-style';

          // Any uploaded image → full redesign via Flux Depth Pro
          } else if (referenceImageUrl || hasUploadedImage) {
            resolvedMode = 'redesign';

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

        // ── Resolve image URLs for each mode ──────────────────────────────────

        const ensurePublicUrl = async (candidate: string): Promise<string | undefined> => {
          if (!candidate) return undefined;
          if (candidate.startsWith('data:')) {
            console.warn('[generation-tools] image is still a data URL — uploading');
            return uploadDataUrl(candidate);
          }
          return candidate;
        };

        // image-edit: images[0] = the image to edit (Gemini targeted edit)
        let resolvedReferenceUrl: string | undefined = referenceImageUrl;
        if (!resolvedReferenceUrl && resolvedMode === 'image-edit') {
          const candidate = images[0] ?? conversationImages[conversationImages.length - 1];
          if (candidate) resolvedReferenceUrl = await ensurePublicUrl(candidate);
        }
        if (resolvedMode === 'image-edit' && !resolvedReferenceUrl) {
          return JSON.stringify({ success: false, error: 'No reference image available for editing. Please attach an image or generate one first.' });
        }

        // redesign: images[0] = room to redesign (Flux Depth Pro)
        let redesignReferenceUrl: string | undefined;
        if (resolvedMode === 'redesign') {
          const candidate = referenceImageUrl || images[0] || conversationImages[conversationImages.length - 1];
          if (candidate) redesignReferenceUrl = await ensurePublicUrl(candidate);
          if (!redesignReferenceUrl) {
            return JSON.stringify({ success: false, error: 'No room image available for redesign. Please attach an image.' });
          }
        }

        // copy-style: images[0] = Inspiration (style donor), images[1] = Your Room (layout donor)
        // NOTE: this matches the drag-and-drop slot order in AgentHub (Slot 0 = Inspiration, Slot 1 = Your Room)
        let copyStyleRoomUrl: string | undefined;
        let copyStyleInspirationUrl: string | undefined;
        if (resolvedMode === 'copy-style') {
          if (images.length >= 2) {
            copyStyleInspirationUrl = await ensurePublicUrl(images[0]); // Slot 0 = Inspiration
            copyStyleRoomUrl = await ensurePublicUrl(images[1]);        // Slot 1 = Your Room
          } else if (images.length === 1) {
            copyStyleRoomUrl = await ensurePublicUrl(images[0]);
          } else if (referenceImageUrl) {
            copyStyleRoomUrl = referenceImageUrl;
          }
          if (!copyStyleRoomUrl) {
            return JSON.stringify({ success: false, error: 'No room image available for copy-style. Please attach your room image.' });
          }
        }

        // floor-plan-render: use attached image
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

        // materials-selection-board: resolve reference from conversationImages or uploaded image
        let materialsBoardRefUrl = floorPlanImageUrl;
        if (resolvedMode === 'materials-selection-board' && !materialsBoardRefUrl) {
          const candidate = referenceImageUrl || conversationImages[conversationImages.length - 1] || images[0];
          if (candidate?.startsWith('data:')) {
            materialsBoardRefUrl = await uploadDataUrl(candidate) ?? candidate;
          } else {
            materialsBoardRefUrl = candidate;
          }
        }

        // Legacy: second image as style reference for floor-plan-render + image-edit
        let styleReferenceUrl: string | undefined;
        if (images.length >= 2 && (resolvedMode === 'floor-plan-render' || resolvedMode === 'image-edit')) {
          const second = images[1];
          styleReferenceUrl = second.startsWith('data:') ? await uploadDataUrl(second) : second;
        }

        const resolvedBoardMode = boardMode || 'selection-board';

        // ── Build request body ─────────────────────────────────────────────────
        const body: Record<string, unknown> = {
          mode: resolvedMode,
          prompt,
          room_type: roomType,
          style,
          sqm,
          model_tier: resolvedMode === 'materials-selection-board' ? 'pro' : (modelTier ?? 'fast') as 'fast' | 'pro' | 'grok',
          user_id: userId,
          workspace_id: workspaceId,
          conversation_id: conversationId,
          // Mode-specific image fields
          ...(resolvedMode === 'redesign' && redesignReferenceUrl
            ? { reference_image_url: redesignReferenceUrl }
            : {}),
          ...(resolvedMode === 'copy-style'
            ? {
                ...(copyStyleRoomUrl ? { reference_image_url: copyStyleRoomUrl } : {}),
                ...(copyStyleInspirationUrl ? { style_reference_url: copyStyleInspirationUrl } : {}),
              }
            : {}),
          ...(resolvedMode === 'materials-selection-board'
            ? {
                reference_image_url: materialsBoardRefUrl,
                board_mode: resolvedBoardMode,
                aspect_ratio: resolvedBoardMode === 'photorealistic-render' ? '16:9' : '1:1',
              }
            : resolvedMode !== 'redesign' && resolvedMode !== 'copy-style'
              ? { ...(floorPlanImageUrl ? { reference_image_url: floorPlanImageUrl } : {}) }
              : {}),
          // Style reference (legacy: floor-plan-render / image-edit with 2 images)
          ...(styleReferenceUrl ? { style_reference_url: styleReferenceUrl } : {}),
          // For image-edit mode, the prompt IS the edit instruction
          ...(resolvedMode === 'image-edit' ? { edit_instruction: prompt } : {}),
          ...((() => {
            const merged = [...(materialImages || []), ...pinnedMaterialImages].slice(0, 14);
            return merged.length > 0 ? { material_images: merged } : {};
          })()),
        };

        const geminiController = new AbortController();
        const geminiTimeoutId = setTimeout(() => geminiController.abort(), 300_000);
        let response;
        try {
          response = await fetch(`${SUPABASE_URL}/functions/v1/generate-interior-gemini`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify(body),
            signal: geminiController.signal,
          });
        } finally {
          clearTimeout(geminiTimeoutId);
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          throw new Error(errBody?.error || `Gemini generation error: ${response.statusText}`);
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
          'redesign': 'redesigned the room with structure preserved',
          'copy-style': 'applied the inspiration style to your room',
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
        const isAbort = error instanceof Error && error.name === 'AbortError';
        return JSON.stringify({
          success: false,
          error: isAbort
            ? 'Gemini generation timed out after 300s. The backend may be overloaded — please retry.'
            : error instanceof Error ? error.message : 'Generation failed',
        });
      }
    },
    {
      name: 'generate_gemini',
      description: `Generate or edit interior design images. Provides an immediate single result in the chat.

PARAMETER EXTRACTION — always do this before calling:
1. Extract roomType from user message (bedroom, living_room, kitchen, bathroom, dining_room, home_office, etc.)
2. Extract style from user message (modern, scandinavian, minimalist, industrial, japandi, luxury, etc.)
3. Set prompt to the user's full design description or edit instruction verbatim

DO NOT call alongside generate_3d — the variations grid already includes a Gemini tile, and double-calling will double-bill.

WHEN TO call this tool ALONE — do NOT call generate_3d in any of these cases:
- User has uploaded one or more images — call generate_gemini ONLY
- A chip mode is active (redesign, copy-style, image-edit, floor-plan-render, floor-plan-text)
- Iterative targeted edit on a previously generated image ("change the floor", "make it warmer")
- Floor plan requests
- Materials board generation

Mode routing (auto-detected if not set explicitly):
- redesign (1 image uploaded, "redesign"/"update style") → Flux Depth Pro locks room structure, applies new style. Positions NEVER change.
- copy-style (2 images: Image 1=inspiration, Image 2=your room) → Gemini Vision extracts full design spec from inspiration → Flux Depth Pro applies it to the room. Zero spatial bleed.
- image-edit (targeted change: "change floor to marble", "add a plant", "warmer lighting") → Gemini image editing on the uploaded or most recently generated image
- floor-plan-render (floor plan image uploaded) → photorealistic eye-level perspective render
- floor-plan-text (no image, user describes layout or provides sqm) → 2D floor plan diagram
- text-to-image (no images, pure text description) → new room generation
- materials-selection-board → professional materials board from a generated design`,
      schema: z.object({
        prompt: z.string().describe('Design description or edit instruction (e.g. "change the floor to marble and make walls warmer")'),
        roomType: z.string().optional().describe('ALWAYS extract from user message when present. Room type: bedroom, living_room, kitchen, bathroom, dining_room, home_office, hallway, studio, outdoor, kids_room, basement'),
        style: z.string().optional().describe('ALWAYS extract from user message when present. Design style: modern, minimalist, scandinavian, industrial, luxury, bohemian, traditional, mediterranean, japandi, art_deco, rustic, coastal'),
        mode: z.enum(['text-to-image', 'image-edit', 'redesign', 'copy-style', 'floor-plan-render', 'floor-plan-text', 'materials-selection-board']).optional().describe('Generation mode. redesign=Flux Depth Pro full redesign (1 image). copy-style=Flux Depth Pro copy aesthetic from inspiration (2 images). image-edit=Gemini targeted change. Omit to auto-detect.'),
        referenceImageUrl: z.string().optional().describe('URL of image to edit or floor plan to render. Leave empty when user has uploaded an image — it is used automatically.'),
        modelTier: z.enum(['fast', 'pro', 'grok']).optional().describe('fast=Gemini Flash (6 credits), pro=Gemini Pro (15 credits), grok=Aurora best spatial accuracy (15 credits). Use pro or grok when user requests maximum quality. materials-selection-board always uses pro.'),
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
  conversationId?: string, // Per-session storage folder key
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

        const stagingController = new AbortController();
        const stagingTimeoutId = setTimeout(() => stagingController.abort(), 300_000);
        let response;
        try {
          response = await fetch(`${SUPABASE_URL}/functions/v1/generate-virtual-staging`, {
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
              conversation_id: conversationId,
            }),
            signal: stagingController.signal,
          });
        } finally {
          clearTimeout(stagingTimeoutId);
        }

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
          source_image_url: resolvedImageUrl,
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
        const isAbort = error instanceof Error && error.name === 'AbortError';
        return JSON.stringify({
          success: false,
          error: isAbort
            ? 'Virtual staging timed out after 300s. The backend may be overloaded — please retry.'
            : error instanceof Error ? error.message : 'Virtual staging failed',
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

        // `generation_3d` has NO `metadata` column — models_results is a TOP-LEVEL column.
        // Naming the phantom column made PostgREST reject the whole select, so `error` was
        // always truthy and this tool answered "Job not found" for EVERY job that exists,
        // telling users their in-flight generation had vanished.
        const { data, error } = await supabase
          .from('generation_3d')
          .select('generation_status, progress_percentage, models_results, created_at')
          .eq('id', jobId)
          .maybeSingle();

        if (error) {
          return JSON.stringify({ success: false, error: `Could not read job status: ${error.message}` });
        }
        if (!data) {
          return JSON.stringify({ success: false, error: 'Job not found' });
        }

        // models_results is a jsonb OBJECT keyed by model label, not an array — normalise so
        // the counting below works either way.
        const rawResults = (data as { models_results?: unknown }).models_results;
        const modelsResults: any[] = Array.isArray(rawResults)
          ? rawResults
          : rawResults && typeof rawResults === 'object'
            ? Object.values(rawResults as Record<string, unknown>).filter((v) => v && typeof v === 'object')
            : [];

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

/**
 * LangChain Tool: Apply Lighting Preset
 *
 * Re-renders the same room under a different lighting preset via Gemini image-edit.
 * Mirrors the 6 preset options exposed in ProgressiveImageGrid's "Lighting Variants"
 * dropdown so chat-driven and click-driven flows produce identical results.
 */
export const createApplyLightingPresetTool = (
  userId: string,
  workspaceId: string,
  conversationImages: string[],
  onChunk?: (chunk: any) => void,
  conversationId?: string, // Per-session storage folder key
) => {
  const PRESET_PROMPTS: Record<string, string> = {
    golden_hour:    'golden hour — warm amber sunlight at a low angle, long soft shadows, cosy',
    bright_midday:  'bright midday daylight — crisp, even natural light, no harsh shadows',
    soft_overcast:  'soft overcast daylight — diffused natural light, calm serene mood',
    warm_evening:   'warm evening ambiance — soft warm artificial lighting, cosy glow, no daylight',
    night:          'night time interior — dark outside, warm interior lights on, atmospheric',
    dramatic_spots: 'dramatic spotlight / accent lighting — targeted beams on key surfaces',
  };

  return tool(
    async ({ sourceImageUrl, preset }) => {
      try {
        const resolvedImageUrl = sourceImageUrl || conversationImages[conversationImages.length - 1];
        if (!resolvedImageUrl) {
          return JSON.stringify({
            success: false,
            error: 'No image available. Generate or upload a room photo first, then ask for a lighting variant.',
          });
        }

        const presetPrompt = PRESET_PROMPTS[preset];
        if (!presetPrompt) {
          return JSON.stringify({ success: false, error: `Unknown preset: ${preset}` });
        }

        const editInstruction =
          `Change the lighting to: ${presetPrompt}. Keep all furniture positions, fixtures, walls, ` +
          `windows, doors, and architecture exactly where they are. Only modify the lighting and shadows. ` +
          `Photorealistic result. 24mm architectural lens, corrected verticals, no fisheye.`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300_000);
        let response;
        try {
          response = await fetch(`${SUPABASE_URL}/functions/v1/generate-interior-gemini`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({
              user_id: userId,
              workspace_id: workspaceId,
              conversation_id: conversationId,
              mode: 'image-edit',
              prompt: editInstruction,
              edit_instruction: editInstruction,
              reference_image_url: resolvedImageUrl,
              model_tier: 'fast',
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          throw new Error(errBody?.error || `Lighting variant error: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Lighting variant failed');

        // Reuse the existing gemini_image_ready chunk so the frontend renders this
        // exactly like any other Gemini image-edit result (no new card needed).
        onChunk?.({
          type: 'gemini_image_ready',
          job_id: result.job_id,
          image_url: result.image_url,
          mode: 'image-edit',
          model: result.model,
          credits_used: result.credits_used,
        });

        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          image_url: result.image_url,
          preset,
          credits_used: result.credits_used,
          message: `Re-lit the room with the "${preset.replace(/_/g, ' ')}" preset. ${result.credits_used} credits used.`,
        });
      } catch (error) {
        console.error('Lighting preset error:', error);
        const isAbort = error instanceof Error && error.name === 'AbortError';
        return JSON.stringify({
          success: false,
          error: isAbort
            ? 'Lighting variant timed out after 300s. Please retry.'
            : error instanceof Error ? error.message : 'Lighting variant failed',
        });
      }
    },
    {
      name: 'apply_lighting_preset',
      description: `Re-render the same room under a different lighting condition without changing furniture, walls, or layout. Use this when the user asks things like:
- "show this room at night" / "golden hour" / "sunset" / "bright daylight"
- "make it warmer / dimmer / brighter"
- "what does it look like at evening / overcast / with spotlights"

Picks one of 6 presets (golden_hour, bright_midday, soft_overcast, warm_evening, night, dramatic_spots).
Requires an existing room image — uses the most recent conversation image if no URL is given. ~6 credits.`,
      schema: z.object({
        preset: z.enum(['golden_hour', 'bright_midday', 'soft_overcast', 'warm_evening', 'night', 'dramatic_spots'])
          .describe('Lighting preset. Map natural language: sunset/sunrise→golden_hour, daylight/noon→bright_midday, cloudy/diffused→soft_overcast, evening/lamps/cosy→warm_evening, night/moonlit→night, showroom/dramatic/accent→dramatic_spots.'),
        sourceImageUrl: z.string().optional().describe('Public URL of the room image. If omitted, uses the most recently generated/uploaded image.'),
      }),
    }
  );
};

/**
 * LangChain Tool: Generate VR World
 *
 * Wraps the generate-vr-world edge function (WorldLabs Marble API) so the agent can
 * turn a generated/uploaded room image into an explorable 3D Gaussian Splat world.
 * Emits a vr_world_ready chunk that AgentHub renders via WorldViewer.
 */
export const createGenerateVRWorldTool = (
  userId: string,
  workspaceId: string,
  conversationImages: string[],
  onChunk?: (chunk: any) => void,
) => {
  // Mirror CREDIT_COSTS in generate-vr-world/index.ts
  const VR_CREDIT_COSTS: Record<string, number> = {
    'marble-1.0-draft': 18,
    'marble-1.1': 190,
  };

  return tool(
    async ({ sourceImageUrl, prompt, roomType, style, model }) => {
      try {
        const resolvedImageUrl = sourceImageUrl || conversationImages[conversationImages.length - 1];
        if (!resolvedImageUrl) {
          return JSON.stringify({
            success: false,
            error: 'No image available. Generate or upload a room photo first, then ask to explore it in VR.',
          });
        }

        const resolvedPrompt = prompt || `Interior design: ${roomType || 'room'} in ${style || 'modern'} style`;
        const resolvedModel = model || 'marble-1.0-draft';
        const creditsUsed = VR_CREDIT_COSTS[resolvedModel] ?? VR_CREDIT_COSTS['marble-1.0-draft'];

        // marble-1.1 takes ~5min — bump timeout accordingly
        const timeoutMs = resolvedModel === 'marble-1.1' ? 480_000 : 240_000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
          response = await fetch(`${SUPABASE_URL}/functions/v1/generate-vr-world`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({
              user_id: userId,
              // Route the debit to the shared workspace pool (matches the frontend path). Omitting it
              // made agent-initiated VR generations always bill personal credits.
              workspace_id: workspaceId,
              source_image_url: resolvedImageUrl,
              prompt: resolvedPrompt,
              room_type: roomType,
              style,
              model: resolvedModel,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          throw new Error(errBody?.error || `VR world error: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.success || !result.data) throw new Error(result.error || 'VR world generation failed');

        const world = result.data;
        onChunk?.({
          type: 'vr_world_ready',
          vr_world_id: world.id,
          status: world.status || 'completed',
          splat_url_100k: world.splat_url_100k,
          splat_url_500k: world.splat_url_500k,
          splat_url_full: world.splat_url_full,
          collider_glb_url: world.collider_glb_url,
          caption: world.caption,
          source_image_url: resolvedImageUrl,
          prompt: resolvedPrompt,
          credits_used: creditsUsed,
          model: resolvedModel,
        });

        return JSON.stringify({
          success: true,
          vr_world_id: world.id,
          model: resolvedModel,
          credits_used: creditsUsed,
          message: `Your VR world is ready. ${creditsUsed} credits used. Open the WorldViewer to walk through it.`,
        });
      } catch (error) {
        console.error('VR world generation error:', error);
        const isAbort = error instanceof Error && error.name === 'AbortError';
        return JSON.stringify({
          success: false,
          error: isAbort
            ? 'VR world generation timed out. Marble-1.1 can take 5+ minutes — please retry.'
            : error instanceof Error ? error.message : 'VR world generation failed',
        });
      }
    },
    {
      name: 'generate_vr_world',
      description: `Turn a room image into an explorable 3D VR world (Gaussian Splat) the user can walk through. Use this when the user asks to:
- "explore this in VR" / "walk through it" / "see it in 3D"
- "make this into a VR world" / "turn this room into something I can navigate"

Requires an existing room image — uses the most recent conversation image if no URL is given.
Models: marble-1.0-draft (~30-45s, 18 credits, default for quick previews) or marble-1.1 (~5min, 190 credits, higher quality).`,
      schema: z.object({
        sourceImageUrl: z.string().optional().describe('Public URL of the room image. If omitted, uses the most recently generated/uploaded image.'),
        prompt: z.string().optional().describe('Optional caption for the world (e.g. "Modern Scandinavian living room"). Auto-derived from roomType+style if omitted.'),
        roomType: z.string().optional().describe('Room type for caption (bedroom, living_room, kitchen, etc.)'),
        style: z.string().optional().describe('Design style for caption (modern, scandinavian, etc.)'),
        model: z.enum(['marble-1.0-draft', 'marble-1.1']).optional().describe('Model. marble-1.0-draft (default, fast, 18cr) or marble-1.1 (slow but higher quality, 190cr). Use 1.1 only when the user explicitly asks for "high quality" or "final" VR.'),
      }),
    }
  );
};
