/**
 * AI-derived material maps for a product (#321 / #260 item 6).
 *
 * WHAT THIS REPLACED. `products.metadata.pbr_maps` had four readers, no writer, and 0 rows for its
 * entire life — `generate-pbr-maps` has never existed in this repo. The renderers were real; only
 * the supplier was missing, so every material preview fell back to stretching the raw product photo
 * across a plane as if it were a seamless texture.
 *
 * NOTHING NEW GENERATES ANYTHING HERE. `generate-interior-gemini` already has a `material-texture`
 * mode whose whole purpose is "flatten a real supplier swatch into a tileable version of ITSELF,
 * rather than inventing a material the customer will not receive" — which is exactly the rule this
 * feature needs. This service calls that and records the result; the provider choice (Gemini or
 * Grok) and the credit debit already live in `resolveGenerationRouting`, so neither is re-decided
 * here.
 *
 * THE BENCH IS THE MODEL COLUMN. Several candidates can exist for one product/option; `is_selected`
 * marks the one the renderer uses. That is what makes "run two models and compare" a data question
 * rather than a code branch.
 *
 * ALBEDO ONLY, DELIBERATELY. A diffusion model asked for a normal map returns a picture that looks
 * like one — the RGB it produces are not surface directions, so a renderer doing arithmetic on them
 * lights the surface wrongly and it reads as plastic. The normal is derived from the selected
 * albedo instead (height-from-luminance), which needs an imaging stack; that belongs in MIVAA,
 * which already ships numpy/opencv/Pillow, and lands separately.
 */
import { supabase } from '@/integrations/supabase/client';

export interface MaterialMapCandidate {
  id: string;
  product_id: string;
  option_value_id: string | null;
  model: string;
  storage_bucket: string;
  albedo_path: string | null;
  normal_path: string | null;
  roughness_path: string | null;
  is_selected: boolean;
  source_image_url: string | null;
  created_at: string;
}

/** The URLs a renderer needs. Null throughout when nothing has been generated yet. */
export interface MaterialMapUrls {
  albedo_url: string | null;
  normal_url: string | null;
  roughness_url: string | null;
  model: string | null;
}

function publicUrl(bucket: string, path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Storage path out of a public URL.
 *
 * The generator returns a URL; the table stores a PATH, because a path is what
 * `build_storage_reference_set()` registers and therefore what stops the orphan cron reaping the
 * file. Returns null rather than guessing when the URL is not one of ours — a wrong path would
 * register protection for a file that does not exist while the real one gets collected.
 */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = url.slice(at + marker.length).split('?')[0];
  return path || null;
}

export const productMaterialMapsService = {
  /** Every candidate for a product, newest first. The comparison surface. */
  async listCandidates(productId: string, optionValueId?: string | null): Promise<MaterialMapCandidate[]> {
    let q = supabase
      .from('product_material_maps')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    q = optionValueId ? q.eq('option_value_id', optionValueId) : q.is('option_value_id', null);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MaterialMapCandidate[];
  },

  /** What the renderer should use right now, or all-null when nothing is generated. */
  async selectedFor(productId: string, optionValueId?: string | null): Promise<MaterialMapUrls> {
    let q = supabase
      .from('product_material_maps')
      .select('*')
      .eq('product_id', productId)
      .eq('is_selected', true)
      .limit(1);
    q = optionValueId ? q.eq('option_value_id', optionValueId) : q.is('option_value_id', null);
    const { data, error } = await q;
    if (error) throw error;
    const row = (data ?? [])[0] as MaterialMapCandidate | undefined;
    if (!row) return { albedo_url: null, normal_url: null, roughness_url: null, model: null };
    return {
      albedo_url: publicUrl(row.storage_bucket, row.albedo_path),
      normal_url: publicUrl(row.storage_bucket, row.normal_path),
      roughness_url: publicUrl(row.storage_bucket, row.roughness_path),
      model: row.model,
    };
  },

  /**
   * Derive a tileable albedo from the product's own image and record it as a candidate.
   *
   * `model_tier` picks the provider through the shared routing, so running this twice with
   * different tiers IS the bench — two candidates over the same source image, compared by eye.
   */
  async generateAlbedo(params: {
    workspaceId: string;
    productId: string;
    optionValueId?: string | null;
    sourceImageUrl: string;
    /** What the thing IS — the texture prompt is built from it. */
    itemName: string;
    modelTier?: string;
  }): Promise<MaterialMapCandidate> {
    const { data, error } = await supabase.functions.invoke('generate-interior-gemini', {
      body: {
        mode: 'material-texture',
        // The REAL product photo. Without it the mode invents a material instead of flattening
        // this one, which is the difference between a texture of the product and a texture of
        // something that looks like it.
        reference_image_url: params.sourceImageUrl,
        item_name: params.itemName,
        aspect_ratio: '1:1',
        model_tier: params.modelTier,
        workspace_id: params.workspaceId,
      },
    });
    if (error) throw error;
    const imageUrl: string | undefined = data?.image_url ?? data?.images?.[0]?.url ?? data?.url;
    if (!data?.success && !imageUrl) {
      throw new Error(data?.error || 'The texture generator returned no image.');
    }
    if (!imageUrl) throw new Error('The texture generator returned no image URL.');

    const bucket = 'generation-images';
    const path = storagePathFromPublicUrl(imageUrl, bucket);
    if (!path) {
      // Refuse rather than store a URL we cannot register. An unregistered file is reaped by the
      // orphan cron after the grace period and the row survives pointing at nothing.
      throw new Error('The generated texture is not in the expected bucket, so it cannot be stored safely.');
    }

    const { data: row, error: insErr } = await supabase
      .from('product_material_maps')
      .insert({
        workspace_id: params.workspaceId,
        product_id: params.productId,
        option_value_id: params.optionValueId ?? null,
        model: data?.model_label ?? data?.model ?? params.modelTier ?? 'gemini',
        storage_bucket: bucket,
        albedo_path: path,
        source_image_url: params.sourceImageUrl,
      })
      .select('*')
      .single();
    if (insErr) throw insErr;

    const candidate = row as MaterialMapCandidate;
    // First candidate for this product/option becomes the selected one, so a single generate is
    // enough to see it in the viewer. Later ones are compared explicitly.
    const existing = await this.listCandidates(params.productId, params.optionValueId ?? null);
    if (!existing.some((c) => c.is_selected)) await this.select(candidate.id);
    return candidate;
  },

  /** Make one candidate the renderer's. The partial unique index enforces one per product/option. */
  async select(candidateId: string): Promise<void> {
    const { data: row, error } = await supabase
      .from('product_material_maps')
      .select('product_id, option_value_id')
      .eq('id', candidateId)
      .single();
    if (error) throw error;
    const target = row as { product_id: string; option_value_id: string | null };

    // Clear first: the index refuses two selected rows, so setting before clearing would fail.
    let clear = supabase
      .from('product_material_maps')
      .update({ is_selected: false })
      .eq('product_id', target.product_id);
    clear = target.option_value_id
      ? clear.eq('option_value_id', target.option_value_id)
      : clear.is('option_value_id', null);
    const { error: clearErr } = await clear;
    if (clearErr) throw clearErr;

    const { error: setErr } = await supabase
      .from('product_material_maps')
      .update({ is_selected: true })
      .eq('id', candidateId);
    if (setErr) throw setErr;
  },

  async remove(candidateId: string): Promise<void> {
    const { error } = await supabase.from('product_material_maps').delete().eq('id', candidateId);
    if (error) throw error;
  },
};
