/** Product 3D models (#321 asset foundation). */
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Product3DModel = Tables<'product_3d_models'>;
export type ModelFormat = 'glb' | 'gltf' | 'usdz';

const FORMAT_BY_EXT: Record<string, ModelFormat> = {
  glb: 'glb',
  gltf: 'gltf',
  usdz: 'usdz',
};

/** Format from a filename, or null when it isn't a supported model file. */
export function modelFormatFromFilename(filename: string): ModelFormat | null {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return FORMAT_BY_EXT[ext] ?? null;
}

export function modelPublicUrl(model: Pick<Product3DModel, 'storage_bucket' | 'storage_path'>): string {
  return supabase.storage.from(model.storage_bucket).getPublicUrl(model.storage_path).data.publicUrl;
}

export interface ModelDimensions {
  width_m?: number | null;
  height_m?: number | null;
  depth_m?: number | null;
}

export const product3dService = {
  /** All models for one product (at most one per format). */
  async listModels(productId: string): Promise<Product3DModel[]> {
    const { data, error } = await supabase
      .from('product_3d_models')
      .select('*')
      .eq('product_id', productId);
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Batch presence lookup for grids: product_id → formats available. One query
   * instead of N (mirrors the bulk shape of marketplacePricingService).
   */
  async modelFormatsByProduct(productIds: string[]): Promise<Map<string, ModelFormat[]>> {
    const out = new Map<string, ModelFormat[]>();
    if (productIds.length === 0) return out;
    const { data, error } = await supabase
      .from('product_3d_models')
      .select('product_id, format')
      .in('product_id', productIds)
      .eq('status', 'ready');
    if (error) throw error;
    for (const row of data ?? []) {
      const list = out.get(row.product_id) ?? [];
      list.push(row.format as ModelFormat);
      out.set(row.product_id, list);
    }
    return out;
  },
};
