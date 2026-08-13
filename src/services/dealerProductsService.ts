/**
 * dealer/supplier "Add Product".
 *
 * Creates a product in the dealer's workspace through the SAME MIVAA ingest core as
 * catalog/XML (facet canonicalization → Voyage text embedding → full image suite). The
 * dynamic-meta form is driven by `material_metadata_fields` (spec fields per category) +
 * the facet whitelist, with canonical-value autocomplete from `facet_canonical_values`.
 */
import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';

export interface CategoryField {
  field_name: string;
  label: string;
  field_type: string; // 'text' | 'number' | 'boolean' | 'select' | ...
  /** Registry's `canonicalize` — this facet has canonical values worth autocompleting. */
  canonicalize: boolean;
}

export interface ManualImageRef {
  storage_url: string;
  storage_path: string;
  filename?: string;
  content_type?: string;
}

export interface ManualProductPayload {
  name: string;
  description?: string;
  material_category?: string;
  supply_mode?: 'platform_sold' | 'reference_only';
  price?: number | null;
  currency?: string;
  unit?: string;
  dimensions?: string;
  external_sku?: string;
  metadata?: Record<string, any>;
  images?: ManualImageRef[];
  // First-class product fields the admin product modal carries. The MIVAA core
  // doesn't model these; the create-manual endpoint applies them as a post-create
  // passthrough so the embedding/canonicalization path stays the single chokepoint.
  long_description?: string;
  status?: 'draft' | 'published' | 'archived';
  cost?: number | null;
  cost_currency?: string;
  category?: string;
  properties?: Record<string, any>;
  specifications?: Record<string, any>;
  /** Provenance tag → created_from_type. Defaults to 'dealer_manual' server-side. */
  source?: string;
}

export const dealerProductsService = {
  /** Spec fields expected for a material_category (best-effort — reference data). */
  async loadCategoryFields(materialCategory: string): Promise<CategoryField[]> {
    if (!materialCategory) return [];
    try {
      const { data } = await supabase
        .from('material_metadata_fields')
        .select('field_name, display_name, field_type, applies_to_categories, is_global, canonicalize, status')
        .eq('status', 'active');
      const rows = (data ?? []) as any[];
      return rows
        .filter((r) => {
          // `is_global` is THE universal flag. This used to infer universality from an
          // EMPTY `applies_to_categories` instead, and never read is_global at all — two
          // conflicting conventions for one concept inside the registry Phase 3 unifies.
          // The seed had 16 fields unscoped-and-not-global, so sanitary's bowl_shape and
          // flush_type were offered on tiles, and wood_type / weave / upholstery on
          // lighting. Empty scope now means the field applies to NOTHING; a field that is
          // neither global nor scoped is a data bug, and categoryFieldRegistry.test.ts
          // fails the build on one rather than letting it surface as stray form inputs.
          if (r.is_global === true) return true;
          const cats = r.applies_to_categories;
          return Array.isArray(cats) && cats.includes(materialCategory);
        })
        .map((r) => ({
          field_name: r.field_name,
          label: r.display_name || r.field_name,
          field_type: r.field_type || 'text',
          canonicalize: r.canonicalize === true,
        }));
    } catch {
      return [];
    }
  },

  /** Canonical values for a facet, for autocomplete (best-effort — may be RLS-gated). */
  async loadFacetValues(facetKey: string): Promise<string[]> {
    try {
      const { data } = await supabase
        .from('facet_canonical_values')
        .select('canonical_value')
        .eq('facet_key', facetKey)
        .limit(200);
      return (data ?? []).map((r: any) => r.canonical_value).filter(Boolean);
    } catch {
      return [];
    }
  },

  /** Upload one product image to generation-images; returns a ref for the create call. */
  async uploadImage(workspaceId: string, file: File, index: number): Promise<ManualImageRef> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const ts = Date.now();
    const path = `u/${workspaceId}/products/${ts}-${index}.${ext}`;
    const { error } = await supabase.storage.from('generation-images').upload(path, file, {
      upsert: true, contentType: file.type,
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from('generation-images').getPublicUrl(path);
    return { storage_url: pub.publicUrl, storage_path: path, filename: file.name, content_type: file.type };
  },

  /** Create the product via the shared MIVAA ingest core, scoped to the active workspace. */
  async createManualProduct(workspaceId: string, payload: ManualProductPayload): Promise<string> {
    const res = await mivaaApi.request<{ success: boolean; product_id: string }>(
      '/api/products/create-manual',
      {
        method: 'POST',
        headers: { 'X-Workspace-Id': workspaceId },
        body: JSON.stringify(payload),
      },
    );
    if (!res.success || !res.data?.product_id) {
      throw new Error(res.error || 'Product creation failed');
    }
    return res.data.product_id;
  },
};
