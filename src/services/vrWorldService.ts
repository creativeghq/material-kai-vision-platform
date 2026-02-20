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

// Credit costs (must match edge function)
export const VR_CREDIT_COSTS: Record<string, number> = {
  'marble-0.1-mini': 50,
  'marble-0.1-plus': 200,
};

export const vrWorldService = {
  /**
   * Trigger VR world generation via edge function.
   * Returns the vr_world_id immediately; the edge function handles the rest.
   * The frontend polls the vr_worlds table for status updates.
   */
  async generateVRWorld(params: GenerateVRParams): Promise<{ vrWorldId: string }> {
    const { data, error } = await supabase.functions.invoke('generate-vr-world', {
      body: {
        source_image_url: params.sourceImageUrl,
        prompt: params.prompt,
        room_type: params.roomType,
        style: params.style,
        model: params.model || 'marble-0.1-mini',
      },
    });

    if (error) throw new Error(error.message || 'Failed to generate VR world');
    if (!data?.success) throw new Error(data?.error || 'Failed to generate VR world');

    return { vrWorldId: data.data.id };
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
