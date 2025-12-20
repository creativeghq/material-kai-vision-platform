/**
 * Material Product Matcher Service
 * Uses AI-powered semantic search to match Spaceformer analysis to actual products
 * Leverages MIVAA's multi-vector search (text + visual + material embeddings)
 */

import { mivaaApi } from './mivaaApiClient';

export interface DetectedMaterial {
  type: string; // From Claude: "sofa", "flooring", "curtains", etc.
  description: string; // Claude's reasoning about the material
  confidence: number;
  application_method?: string; // "tile", "paint", "wallpaper", etc.
  surface_area?: number;
}

export interface MatchedProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  type: string;
  metadata: any;
  image_url?: string;
  match_score: number;
  match_reason: string;
}

class MaterialProductMatcherService {
  /**
   * Extract materials from Spaceformer analysis
   * Uses Claude Vision's structured output directly
   */
  extractMaterialsFromAnalysis(analysis: any): DetectedMaterial[] {
    const materials: DetectedMaterial[] = [];

    // Extract from material_placements (Claude's material suggestions)
    if (analysis.material_placements && Array.isArray(analysis.material_placements)) {
      analysis.material_placements.forEach((placement: any) => {
        materials.push({
          type: placement.application_method || 'material',
          description: placement.reasoning || `${placement.application_method} material`,
          confidence: placement.confidence || 0.8,
          application_method: placement.application_method,
          surface_area: placement.surface_area,
        });
      });
    }

    // Extract from layout_suggestions (Claude's furniture/fixture suggestions)
    if (analysis.layout_suggestions && Array.isArray(analysis.layout_suggestions)) {
      analysis.layout_suggestions.forEach((suggestion: any) => {
        materials.push({
          type: suggestion.item_type,
          description: suggestion.reasoning || `${suggestion.item_type} for the room`,
          confidence: suggestion.confidence || 0.8,
        });
      });
    }

    // Extract from spatial_features (Claude's detected features)
    if (analysis.spatial_features && Array.isArray(analysis.spatial_features)) {
      analysis.spatial_features.forEach((feature: any) => {
        // Only include furniture and fixtures, not structural elements
        if (feature.type === 'furniture' || feature.type === 'fixture') {
          materials.push({
            type: feature.type,
            description: `${feature.type} detected in the space`,
            confidence: feature.importance || 0.7,
          });
        }
      });
    }

    return materials;
  }

  /**
   * Search for matching products using AI-powered semantic search
   * Uses MIVAA's multi-vector search combining text, visual, and material embeddings
   */
  async findMatchingProducts(
    materials: DetectedMaterial[],
    workspaceId: string,
    limit: number = 5
  ): Promise<MatchedProduct[]> {
    const allMatches: MatchedProduct[] = [];

    for (const material of materials) {
      try {
        // Build semantic search query from Claude's analysis
        const searchQuery = `${material.type} ${material.description}`.trim();

        console.log(`🔍 Searching for: "${searchQuery}" (confidence: ${material.confidence})`);

        // Use MIVAA semantic search API
        const response = await mivaaApi.searchSemantic({
          query: searchQuery,
          limit: limit,
          filters: {
            workspace_id: workspaceId,
          },
        });

        if (!response.success || !response.data?.results) {
          console.warn(`No results for: ${searchQuery}`);
          continue;
        }

        // Process search results
        const results = response.data.results;
        results.forEach((result: any) => {
          // Extract product data from search result
          const product = result.metadata || result;

          allMatches.push({
            id: product.id || result.id,
            name: product.name || result.name || 'Unknown Product',
            description: product.description || result.content || '',
            category: product.category || product.type || 'other',
            type: product.type || product.category || 'other',
            metadata: product.metadata || product,
            image_url: product.image_url || product.metadata?.image_url || product.metadata?.images?.[0],
            match_score: result.similarity_score || result.score || material.confidence || 0.8,
            match_reason: material.description || `Matches ${material.type}`,
          });
        });
      } catch (error) {
        console.error(`Error searching for "${material.type}":`, error);
      }
    }

    // Remove duplicates (keep highest score)
    const uniqueMatches = new Map<string, MatchedProduct>();
    allMatches.forEach((match) => {
      const existing = uniqueMatches.get(match.id);
      if (!existing || match.match_score > existing.match_score) {
        uniqueMatches.set(match.id, match);
      }
    });

    // Sort by match score and return top results
    return Array.from(uniqueMatches.values())
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, limit * 2); // Return top matches
  }
}

export const materialProductMatcher = new MaterialProductMatcherService();

