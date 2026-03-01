/**
 * VR World Service
 * Frontend service for WorldLabs Marble VR world generation and retrieval.
 */

import { supabase } from '@/integrations/supabase/client';

export interface VRWorld {
  id: string;
  user_id: string;
  workspace_id?: string;
  source_image_url: string;
  source_prompt?: string;
  world_id?: string;
  operation_id?: string;
  display_name?: string;
  caption?: string;
  splat_url_100k?: string;
  splat_url_500k?: string;
  splat_url_full?: string;
  collider_glb_url?: string;
  panorama_url?: string;
  thumbnail_url?: string;
  model: string;
  status: 'pending' | 'uploading' | 'generating' | 'completed' | 'failed';
  error_message?: string;
  credits_charged: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface GenerateVRParams {
  sourceImageUrl: string;
  prompt: string;
  roomType?: string;
  style?: string;
  model?: string;
}

// Credit costs — must match CREDIT_COSTS in generate-vr-world edge function
export const VR_CREDIT_COSTS: Record<string, number> = {
  'marble-0.1-mini': 75,
  'marble-0.1-plus': 300,
};

// Inpainting credit costs per operation
export const INPAINTING_CREDIT_COSTS: Record<'flux-fill-pro' | 'flux-fill-dev' | 'sd-inpainting', number> = {
  'flux-fill-pro': 40,   // ~$0.015 — best quality, FLUX Fill Pro
  'flux-fill-dev': 20,   // ~$0.008 — standard quality, FLUX Fill Dev
  'sd-inpainting': 10,   // ~$0.003 — fast/cheap, Stable Diffusion
};

export type InpaintingModel = keyof typeof INPAINTING_CREDIT_COSTS;

export const INPAINTING_MODEL_LABELS: Record<InpaintingModel, string> = {
  'flux-fill-pro': 'Best (FLUX Pro)',
  'flux-fill-dev': 'Standard (FLUX Dev)',
  'sd-inpainting': 'Fast',
};

export const vrWorldService = {
  /**
   * Trigger VR world generation via edge function.
   * Returns the vr_world_id immediately; the edge function handles the rest.
   * The frontend polls the vr_worlds table for status updates.
   */
  async generateVRWorld(params: GenerateVRParams): Promise<{
    vrWorldId: string;
    status: string;
    splatUrl100k?: string;
    splatUrl500k?: string;
    splatUrlFull?: string;
    colliderGlbUrl?: string;
    panoramaUrl?: string;
    caption?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('generate-vr-world', {
      body: {
        source_image_url: params.sourceImageUrl,
        prompt: params.prompt,
        room_type: params.roomType,
        style: params.style,
        model: params.model || 'marble-0.1-mini',
      },
    });

    if (error) {
      // FunctionsHttpError exposes the raw Response via .context — extract the real error body
      const httpError = error as any;
      if (httpError?.context) {
        try {
          const body = await httpError.context.json();
          throw new Error(body?.error || error.message);
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
        }
      }
      throw new Error(error.message || 'Failed to generate VR world');
    }
    if (!data?.success) throw new Error(data?.error || 'Failed to generate VR world');

    const world = data.data as VRWorld;
    return {
      vrWorldId: world.id,
      status: world.status,
      splatUrl100k: world.splat_url_100k,
      splatUrl500k: world.splat_url_500k,
      splatUrlFull: world.splat_url_full,
      colliderGlbUrl: world.collider_glb_url,
      panoramaUrl: world.panorama_url,
      caption: world.caption,
    };
  },

  /**
   * Get a single VR world by ID (used for polling status).
   */
  async getVRWorld(id: string): Promise<VRWorld> {
    const { data, error } = await supabase
      .from('vr_worlds')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as VRWorld;
  },

  /**
   * List user's VR worlds, most recent first.
   */
  async listVRWorlds(limit = 20): Promise<VRWorld[]> {
    const { data, error } = await supabase
      .from('vr_worlds')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as VRWorld[];
  },
};
