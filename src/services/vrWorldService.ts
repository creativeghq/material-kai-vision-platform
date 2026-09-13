/**
 * VR World Service
 * Frontend service for WorldLabs Marble VR world generation and retrieval.
 */

import { supabase } from '@/integrations/supabase/client';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';

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
  isPano?: boolean;  // Set true for panoramic source images
}

// Credit costs — must match CREDIT_COSTS in generate-vr-world edge function.
// WorldLabs Marble API v1.x pricing ($1 = 1,250 WL credits, 1.50x markup).
// The $1.264 figure below is the source for the 'marble-1.1' row in ai_model_pricing.
// marble-1.0-draft was retired; 1.1 is the only tier.
export const VR_CREDIT_COSTS: Record<string, number> = {
  'marble-1.1': 190,       // 1580 WL cr = $1.264 × 1.50 markup
};

/** Inpainting credit costs. */
export const INPAINTING_CREDIT_COSTS: Record<'flux-fill-pro' | 'flux-fill-dev' | 'sd-inpainting', number> = {
  'flux-fill-pro': 7.5,   // $0.050 x 1.50 markup x 100
  'flux-fill-dev': 3.75,  // $0.025 x 1.50 markup x 100
  'sd-inpainting': 0.45,  // $0.003 x 1.50 markup x 100
};

export type InpaintingModel = keyof typeof INPAINTING_CREDIT_COSTS;

/** `ai_model_pricing.model_key` per selectable inpaint model — mirrors `_INPAINT_PRICING_KEYS`
 *  in mivaa-pdf-extractor/app/api/sam_routes.py. Both must list the same models. */
const INPAINT_PRICING_KEYS: Record<InpaintingModel, string> = {
  'flux-fill-pro': 'inpaint-flux-fill-pro',
  'flux-fill-dev': 'inpaint-flux-fill-dev',
  'sd-inpainting': 'inpaint-sd-inpainting',
};

/**
 * Read the live per-model inpaint prices. Returns the fallback constants on any failure —
 * a pricing lookup must never block the editor, and showing the seeded value is better
 * than showing nothing. Credits = cost_per_unit x markup_multiplier x 100, the same
 * conversion credits_integration_service applies server-side.
 */
type PriceRow = { model_key: string; cost_per_unit: number | string | null; markup_multiplier: number | string | null };

/** Credits for one pricing row, or null when the row does not add up to a number. */
function creditsOf(row: PriceRow): number | null {
  const credits = Number(row.cost_per_unit) * Number(row.markup_multiplier) * 100;
  return Number.isFinite(credits) && credits >= 0 ? Math.round(credits * 100) / 100 : null;
}

/** `ai_model_pricing.model_key` for the reference-image path — mirrors `_ANYDOOR_PRICING_KEY` in sam_routes.py. */
export const ANYDOOR_PRICING_KEY = 'inpaint-anydoor';

export interface InpaintPricing {
  /** Per selectable tier, for fills described in words. */
  tiers: Record<InpaintingModel, number>;
  /** Placing a real product photo — the row MIVAA meters when `reference_image_url` is set. */
  anydoor: number;
}

/** First-paint fallbacks, derived the way the live rows are ($0.0067 x 1.50 for AnyDoor, verified 2026-09-13). */
export const INPAINT_PRICING_FALLBACK: InpaintPricing = {
  tiers: INPAINTING_CREDIT_COSTS,
  anydoor: creditsOf({ model_key: ANYDOOR_PRICING_KEY, cost_per_unit: 0.0067, markup_multiplier: 1.5 }) ?? 1,
};

let inpaintPricingPromise: Promise<InpaintPricing> | null = null;

/** One read of every inpaint row, shared for the page; the fallbacks stand in on any failure. */
export function loadInpaintPricing(): Promise<InpaintPricing> {
  if (inpaintPricingPromise) return inpaintPricingPromise;
  inpaintPricingPromise = (async () => {
    const { data, error } = await supabase
      .from('ai_model_pricing')
      .select('model_key, cost_per_unit, markup_multiplier')
      .in('model_key', [...Object.values(INPAINT_PRICING_KEYS), ANYDOOR_PRICING_KEY])
      .eq('is_active', true);
    if (error || !data?.length) return INPAINT_PRICING_FALLBACK;
    const byKey = new Map((data as PriceRow[]).map((r) => [r.model_key, r]));
    const tiers = { ...INPAINTING_CREDIT_COSTS };
    for (const model of Object.keys(INPAINT_PRICING_KEYS) as InpaintingModel[]) {
      const row = byKey.get(INPAINT_PRICING_KEYS[model]);
      const credits = row ? creditsOf(row) : null;
      if (credits !== null) tiers[model] = credits;
    }
    const anydoorRow = byKey.get(ANYDOOR_PRICING_KEY);
    const anydoor = (anydoorRow ? creditsOf(anydoorRow) : null) ?? INPAINT_PRICING_FALLBACK.anydoor;
    return { tiers, anydoor };
  })().catch(() => {
    inpaintPricingPromise = null;
    return INPAINT_PRICING_FALLBACK;
  });
  return inpaintPricingPromise;
}

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
    const { data: { user } } = await supabase.auth.getUser();
    const workspaceId = getActiveWorkspaceId(user?.id);

    const { data, error } = await supabase.functions.invoke('generate-vr-world', {
      body: {
        source_image_url: params.sourceImageUrl,
        prompt: params.prompt,
        room_type: params.roomType,
        style: params.style,
        model: params.model || 'marble-1.1',
        is_pano: params.isPano,
        workspace_id: workspaceId,
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
