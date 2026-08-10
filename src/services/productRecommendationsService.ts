/**
 * Product recommendations — reads the gold-layer `product_edges` table.
 *
 * There is ONE derivation of "what relates to this product" (issue #267):
 * `rebuild_product_edges(workspace)` derives the edges in SQL from silver, and
 * `get_related_products(...)` is the only read path. This file formats; it never
 * re-derives. The previous `find_similar_products` / `find_complementary_products`
 * RPCs were a second, live-per-query derivation that answered the same question
 * differently — they are gone, and
 * [tests/unit/productRelationDerivation.test.ts] fails the build if they come back.
 */

import { supabase } from '@/integrations/supabase/client';

/** Edge types carried by `product_edges` (CHECK-constrained in the DB). */
export type ProductEdgeType =
  | 'material_family'
  | 'pattern_match'
  | 'collection'
  | 'complementary'
  | 'alternative';

export type RecommendationMode = 'similar' | 'complementary';

/**
 * Which edge types answer each panel. "Similar" is everything that makes two
 * products interchangeable or kin; "complementary" is the pairing relation, derived
 * from `category_complement_rules` at rebuild time.
 */
const MODE_EDGE_TYPES: Record<RecommendationMode, ProductEdgeType[]> = {
  similar: ['collection', 'material_family', 'pattern_match', 'alternative'],
  complementary: ['complementary'],
};

export interface RecommendedProduct {
  id: string;
  name: string;
  thumbnail_url: string | null;
  category: string | null;
  /** Edge weight, 0..1 — the strength the derivation assigned. */
  similarity: number;
  edge_type: ProductEdgeType;
  /** Evidence text from the derivation, e.g. "Same collection: AXIS". */
  reason: string | null;
}

/** Shape `get_related_products` returns (jsonb array). */
interface RelatedEdgeRow {
  id: string;
  name: string | null;
  description: string | null;
  relationship_type: ProductEdgeType;
  relevance_score: number | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
}

/** Fetch the primary image URL for a set of product IDs */
async function fetchThumbnails(
  productIds: string[],
): Promise<Record<string, string | null>> {
  if (productIds.length === 0) return {};

  const { data: assocData } = await supabase
    .from('image_product_associations' as any)
    .select('product_id, image_id, overall_score')
    .in('product_id', productIds)
    .gte('overall_score', 0.4)
    .order('overall_score', { ascending: false });

  const map: Record<string, string | null> = {};

  if (assocData && (assocData as any[]).length > 0) {
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

  for (const id of productIds) {
    if (!(id in map)) map[id] = null;
  }

  return map;
}

/** The RPC already returns name/metadata — only the thumbnail needs a second trip. */
async function hydrate(rows: RelatedEdgeRow[]): Promise<RecommendedProduct[]> {
  if (rows.length === 0) return [];

  const thumbnails = await fetchThumbnails(rows.map((r) => r.id));

  return rows
    .filter((row) => row.id && row.name)
    .map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const category =
        (typeof meta.category === 'string' && meta.category) ||
        (typeof meta.type === 'string' && meta.type) ||
        null;

      return {
        id: row.id,
        name: row.name as string,
        thumbnail_url: thumbnails[row.id] ?? null,
        category,
        similarity: row.relevance_score ?? 0,
        edge_type: row.relationship_type,
        reason: row.reason ?? null,
      };
    });
}

export const productRecommendationsService = {
  /**
   * Related products for one product, read from the persisted edge set.
   *
   * Throws on RPC failure rather than returning `[]` — an empty strip must mean
   * "no edges derived", never "the read failed" (the silent-zero shape).
   */
  async getRelated(
    workspaceId: string,
    productId: string,
    mode: RecommendationMode,
    limit = 10,
  ): Promise<RecommendedProduct[]> {
    if (!workspaceId || !productId) return [];

    const { data, error } = await supabase.rpc('get_related_products', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
      p_types: MODE_EDGE_TYPES[mode],
      p_limit: limit,
    });

    if (error) {
      console.error(
        `[recommendations] get_related_products (${mode}) failed: ${error.message ?? JSON.stringify(error)}`,
      );
      throw error;
    }

    return hydrate((data as unknown as RelatedEdgeRow[]) ?? []);
  },
};
