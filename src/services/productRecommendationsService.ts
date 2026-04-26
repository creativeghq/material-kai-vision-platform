import { supabase } from '@/integrations/supabase/client';

export interface SimilarProduct {
  product_id: string;
  similarity: number;
  match_source: 'vector' | 'same_collection' | 'fallback';
}

export interface ComplementaryProduct {
  product_id: string;
  similarity: number;
  match_source: 'multi_signal' | 'category_rule' | 'cross_collection';
  relationship_label: string | null;
}

export interface RecommendedProduct {
  id: string;
  name: string;
  thumbnail_url: string | null;
  category: string | null;
  similarity: number;
  match_source: string;
  relationship_label?: string | null;
}

/** Fetch the primary image URL for a set of product IDs */
async function fetchThumbnails(
  productIds: string[],
): Promise<Record<string, string | null>> {
  if (productIds.length === 0) return {};

  // Try image_product_associations first
  const { data: assocData } = await supabase
    .from('image_product_associations' as any)
    .select('product_id, image_id, overall_score')
    .in('product_id', productIds)
    .gte('overall_score', 0.4)
    .order('overall_score', { ascending: false });

  const map: Record<string, string | null> = {};

  if (assocData && (assocData as any[]).length > 0) {
    // Get image URLs from document_images
    const imageIds = [...new Set((assocData as any[]).map((r: any) => r.image_id))];
    const { data: imgData } = await supabase
      .from('document_images')
      .select('id, image_url')
      .in('id', imageIds as string[]);

    const imgUrlMap: Record<string, string> = {};
    if (imgData) {
      for (const img of imgData as any[]) {
        imgUrlMap[img.id] = img.image_url;
      }
    }

    // Pick best image per product (highest overall_score)
    const seen = new Set<string>();
    for (const row of (assocData as any[]).sort((a: any, b: any) => b.overall_score - a.overall_score)) {
      if (!seen.has(row.product_id)) {
        seen.add(row.product_id);
        map[row.product_id] = imgUrlMap[row.image_id] ?? null;
      }
    }
  }

  // Remaining products without images
  for (const id of productIds) {
    if (!(id in map)) map[id] = null;
  }

  return map;
}

/** Hydrate raw RPC rows with product name, category, and thumbnail */
async function hydrateProducts(
  rows: Array<{ product_id: string; similarity: number; match_source: string; relationship_label?: string | null }>,
): Promise<RecommendedProduct[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.product_id);

  const [{ data: products }, thumbnails] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, category_id, properties')
      .in('id', ids),
    fetchThumbnails(ids),
  ]);

  const productMap: Record<string, any> = {};
  if (products) {
    for (const p of products as any[]) productMap[p.id] = p;
  }

  return rows
    .map((row) => {
      const p = productMap[row.product_id];
      if (!p) return null;
      const category =
        p.properties?.category ||
        p.properties?.type ||
        p.category_id ||
        null;
      const rec: RecommendedProduct = {
        id: row.product_id,
        name: p.name,
        thumbnail_url: thumbnails[row.product_id] ?? null,
        category,
        similarity: row.similarity,
        match_source: row.match_source,
        relationship_label: (row as any).relationship_label ?? null,
      };
      return rec;
    })
    .filter((r): r is RecommendedProduct => r !== null);
}

export const productRecommendationsService = {
  /** Products most visually similar to the given product (same collection or vector) */
  async getSimilar(productId: string, limit = 8): Promise<RecommendedProduct[]> {
    const { data, error } = await supabase.rpc('find_similar_products', {
      source_product_id: productId,
      match_count: limit,
    });

    if (error) {
      console.error(`[recommendations] getSimilar error: ${error.message ?? JSON.stringify(error)}`);
      return [];
    }

    return hydrateProducts((data as SimilarProduct[]) ?? []);
  },

  /** Products that pair well with the given product (cross-collection harmony) */
  async getComplementary(productId: string, limit = 8): Promise<RecommendedProduct[]> {
    const { data, error } = await supabase.rpc('find_complementary_products', {
      source_product_id: productId,
      match_count: limit,
    });

    if (error) {
      console.error(`[recommendations] getComplementary error: ${error.message ?? JSON.stringify(error)}`);
      return [];
    }

    return hydrateProducts((data as ComplementaryProduct[]) ?? []);
  },
};
