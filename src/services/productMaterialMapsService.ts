/** AI-derived material maps for a product (#321 / #260 item 6). */
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

  /** Selected albedo per PRODUCT (no option value), as `productId -> url`, in one query (#404). */
  async selectedAlbedoByProduct(productIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (productIds.length === 0) return out;
    const { data, error } = await supabase
      .from('product_material_maps')
      .select('product_id, storage_bucket, albedo_path')
      .in('product_id', productIds)
      .eq('is_selected', true)
      .is('option_value_id', null);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      product_id: string; storage_bucket: string; albedo_path: string | null;
    }>) {
      const url = publicUrl(row.storage_bucket, row.albedo_path);
      if (url) out.set(row.product_id, url);
    }
    return out;
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
