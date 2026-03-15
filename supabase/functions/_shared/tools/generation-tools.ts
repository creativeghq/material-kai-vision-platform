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
export const create3DGenerationTool = (userId: string, workspaceId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ prompt, roomType, style, referenceImageUrl, models }) => {
      try {

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
              image: referenceImageUrl,
              models: models || undefined, // undefined = all models
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

        // Return a conversational response - agent can continue talking
        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          model_count: result.model_count,
          models: result.models,
          message: `I've started generating ${result.model_count} interior design variations for your ${roomType || 'space'}${style ? ` in ${style} style` : ''}. The generation is running in the background - you can see the progress in the generation panel below. Feel free to continue our conversation or ask me anything else while it processes!`,
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
      description: 'Generate interior design images using multiple AI models. Creates async job that frontend polls for updates. Supports text-to-image and image-to-image generation.',
      schema: z.object({
        prompt: z.string().describe('Detailed design description (e.g., "Modern minimalist bedroom with oak flooring and white walls")'),
        roomType: z.string().optional().describe('Room type (bedroom, living_room, kitchen, bathroom, office, etc.)'),
        style: z.string().optional().describe('Design style (modern, minimalist, industrial, scandinavian, traditional, etc.)'),
        referenceImageUrl: z.string().optional().describe('Reference image URL for image-to-image generation'),
        models: z.array(z.string()).optional().describe('Specific model IDs to use (e.g., ["flux-dev", "sdxl"]), or omit to use all 7 models'),
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
) => {
  return tool(
    async ({ prompt, roomType, style, mode, referenceImageUrl, editInstruction, modelTier, materialImages, sqm }) => {
      try {

        // Auto-detect edit intent if mode not specified
        let resolvedMode = mode;
        if (!resolvedMode) {
          const hasRecentGeneration = conversationImages.length > 0;
          if (detectEditIntent(prompt) && hasRecentGeneration) {
            resolvedMode = 'image-edit';
          } else if (referenceImageUrl && !editInstruction) {
            resolvedMode = 'floor-plan-render';
          } else if (prompt?.toLowerCase().includes('floor plan') || sqm) {
            resolvedMode = 'floor-plan-text';
          } else {
            resolvedMode = 'text-to-image';
          }
        }

        // For image-edit: use most recent generated image if no explicit reference
        const resolvedReferenceUrl =
          referenceImageUrl ||
          (resolvedMode === 'image-edit' ? conversationImages[conversationImages.length - 1] : undefined);

        // For floor-plan-render: use attached image if available
        const floorPlanImageUrl =
          resolvedMode === 'floor-plan-render'
            ? (resolvedReferenceUrl || (images.length > 0 ? images[0] : undefined))
            : resolvedReferenceUrl;

        const body: Record<string, unknown> = {
          mode: resolvedMode,
          prompt,
          room_type: roomType,
          style,
          sqm,
          model_tier: modelTier ?? 'fast',
          user_id: userId,
          workspace_id: workspaceId,
          ...(floorPlanImageUrl ? { reference_image_url: floorPlanImageUrl } : {}),
          ...(editInstruction ? { edit_instruction: editInstruction } : {}),
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
        onChunk?.({
          type: 'gemini_image_ready',
          job_id: result.job_id,
          image_url: result.image_url,
          diagram_url: result.diagram_url,
          mode: resolvedMode,
          model: result.model,
          credits_used: result.credits_used,
        });

        const modeLabels: Record<string, string> = {
          'text-to-image': 'generated a new design',
          'image-edit': 'applied your edit',
          'floor-plan-render': 'rendered your floor plan',
          'floor-plan-text': 'created your floor plan',
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
      description: `Generate or edit interior design images using Gemini AI. Use this for:
- Fast single image generation (text-to-image)
- Editing an existing generated image ("change the floor", "make it darker", "swap the tiles")
- Converting a 2D floor plan image to a photorealistic top-down render
- Generating a floor plan from a text description (two-step)
- Generating a design using specific catalog materials as references
Prefer this over generate_3d for single fast results and iterative editing.`,
      schema: z.object({
        prompt: z.string().describe('Design description or edit instruction'),
        roomType: z.string().optional().describe('Room type (bedroom, living_room, kitchen, bathroom, etc.)'),
        style: z.string().optional().describe('Design style (modern, scandinavian, industrial, cabin, japandi, etc.)'),
        mode: z.enum(['text-to-image', 'image-edit', 'floor-plan-render', 'floor-plan-text']).optional().describe('Generation mode. Omit to auto-detect.'),
        referenceImageUrl: z.string().optional().describe('URL of image to edit or floor plan to render'),
        editInstruction: z.string().optional().describe('Specific edit instruction when mode=image-edit'),
        modelTier: z.enum(['fast', 'pro']).optional().describe('fast=Gemini 3.1 Flash (6 credits), pro=Gemini 3 Pro 4K (15 credits)'),
        materialImages: z.array(z.string()).optional().describe('URLs of catalog material images to incorporate into the design (up to 14)'),
        sqm: z.number().optional().describe('Floor area in sqm for floor plan generation'),
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
