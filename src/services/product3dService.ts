/**
 * Product 3D models (#321 asset foundation).
 *
 * One row per (product, format) in `product_3d_models`: glb/gltf feed the web
 * viewer, usdz feeds iOS AR Quick Look. Files live in `generation-images` under
 * the entity-scoped `3d/{product_id}/` prefix (same carve-out as `pbr-maps/` —
 * the model's lifecycle follows the product, not a session). The table is
 * registered in `build_storage_reference_set()`, so a live row protects its
 * file from the storage-orphan cron; deleting the row releases the file for GC.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { safeStorageName } from '@/utils/storagePaths';
import { inspectModelFile, type ModelInspection } from '@/services/modelInspection';

export type Product3DModel = Tables<'product_3d_models'>;
export type ModelFormat = 'glb' | 'gltf' | 'usdz';

const BUCKET = 'generation-images';

const FORMAT_BY_EXT: Record<string, ModelFormat> = {
  glb: 'glb',
  gltf: 'gltf',
  usdz: 'usdz',
};

const MIME_BY_FORMAT: Record<ModelFormat, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  usdz: 'model/vnd.usdz+zip',
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

  /**
   * Upload a model file and upsert its row. Replacing a format overwrites the
   * row (UNIQUE product_id+format); the previous file drops out of the GC
   * reference set and the orphan cron reaps it after the grace window.
   */
  async uploadModel(
    workspaceId: string,
    productId: string,
    file: File,
    dimensions?: ModelDimensions,
  ): Promise<Product3DModel> {
    const format = modelFormatFromFilename(file.name);
    if (!format) throw new Error('Unsupported model format — use .glb, .gltf or .usdz');

    // Read the model's own facts before uploading it (#321 M0 deferred). usdz is a zip container
    // that GLTFLoader cannot read; it is uploaded as-is and measured from its glb sibling.
    let inspection: ModelInspection | null = null;
    if (format === 'glb' || format === 'gltf') {
      try {
        inspection = await inspectModelFile(file);
      } catch {
        throw new Error('That file could not be read as a glTF model. Re-export it and try again.');
      }
      // Refuse the empty-scene export HERE rather than letting it break a viewer later. Its empty
      // bounding box is what produced the -Infinity placement M0 had to guard against.
      if (!inspection.isRenderable) {
        throw new Error(
          'This model contains no renderable mesh — it is probably an empty scene or lights only. '
          + 'Check the export settings.',
        );
      }
    }

    const path = `3d/${productId}/${Date.now()}-${safeStorageName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      // Browsers rarely know model MIME types; the bucket allowlist requires the real one.
      contentType: MIME_BY_FORMAT[format],
    });
    if (uploadError) throw uploadError;

    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('product_3d_models')
      .upsert(
        {
          product_id: productId,
          workspace_id: workspaceId,
          format,
          storage_bucket: BUCKET,
          storage_path: path,
          file_size_bytes: file.size,
          // An explicitly supplied dimension always wins — someone correcting a model authored in
          // the wrong units must not be overwritten by the wrong units. Otherwise the file's own
          // measurement is used, which is better than the hand-typed number it replaces.
          width_m: dimensions?.width_m ?? inspection?.widthM ?? null,
          height_m: dimensions?.height_m ?? inspection?.heightM ?? null,
          depth_m: dimensions?.depth_m ?? inspection?.depthM ?? null,
          material_names: inspection?.materialNames ?? null,
          mesh_count: inspection?.meshCount ?? null,
          status: 'ready',
          source: 'upload',
          created_by: auth.user?.id ?? null,
        },
        { onConflict: 'product_id,format' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Update the real-world dimensions on every format row of a product. */
  async updateDimensions(productId: string, dimensions: ModelDimensions): Promise<void> {
    const { error } = await supabase
      .from('product_3d_models')
      .update({
        width_m: dimensions.width_m ?? null,
        height_m: dimensions.height_m ?? null,
        depth_m: dimensions.depth_m ?? null,
      })
      .eq('product_id', productId);
    if (error) throw error;
  },

  /**
   * Delete a model row + its file. Row first: if the file removal then fails,
   * the orphan cron still reaps it once the reference is gone.
   */
  async deleteModel(model: Product3DModel): Promise<void> {
    const { error } = await supabase.from('product_3d_models').delete().eq('id', model.id);
    if (error) throw error;
    await supabase.storage.from(model.storage_bucket).remove([model.storage_path]);
  },
};
