/**
 * Vector Similarity Search Service
 * Connects to the vector-similarity-search edge function
 */

import { supabase } from "@/integrations/supabase/client";

export interface VectorSearchRequest {
  query_embedding?: number[];
  image_embedding?: number[];
  text_query?: string;
  image_data?: string; // base64
  match_threshold?: number;
  match_count?: number;
  categories?: string[];
  search_type?: 'material' | 'knowledge' | 'hybrid';
}

export interface VectorSearchResult {
  material_id: string;
  similarity_score: number;
  material_name: string;
  properties: any;
  category: string;
  embedding_type?: string;
  metadata?: any;
}

export interface VectorSearchResponse {
  success: boolean;
  search_id: string;
  results: VectorSearchResult[];
  total_matches: number;
  processing_time_ms: number;
  search_metadata: {
    query_type: string;
    similarity_threshold: number;
    embedding_dimensions: number;
  };
}

class VectorSimilarityService {
  
  /**
   * Perform vector similarity search
   */
  async search(request: VectorSearchRequest): Promise<VectorSearchResponse> {
    try {
      console.log('Starting vector similarity search:', request.search_type);

      const { data, error } = await supabase.functions.invoke('vector-similarity-search', {
        body: {
          user_id: (await supabase.auth.getUser()).data.user?.id,
          ...request
        }
      });

      if (error) {
        console.error('Vector search error:', error);
        throw new Error(`Search failed: ${error.message}`);
      }

      return data as VectorSearchResponse;

    } catch (error) {
      console.error('Error in vector search:', error);
      throw error;
    }
  }

  /**
   * Search by text query
   */
  async searchByText(
    query: string, 
    options: { 
      threshold?: number; 
      count?: number; 
      categories?: string[];
    } = {}
  ): Promise<VectorSearchResponse> {
    return this.search({
      text_query: query,
      match_threshold: options.threshold || 0.7,
      match_count: options.count || 10,
      categories: options.categories,
      search_type: 'hybrid'
    });
  }

  /**
   * Search by image
   */
  async searchByImage(
    imageData: string, 
    options: { 
      threshold?: number; 
      count?: number; 
      categories?: string[];
    } = {}
  ): Promise<VectorSearchResponse> {
    return this.search({
      image_data: imageData,
      match_threshold: options.threshold || 0.8,
      match_count: options.count || 10,
      categories: options.categories,
      search_type: 'material'
    });
  }

  /**
   * Hybrid search (text + image)
   */
  async hybridSearch(
    query: string,
    imageData: string,
    options: { 
      threshold?: number; 
      count?: number; 
      categories?: string[];
    } = {}
  ): Promise<VectorSearchResponse> {
    return this.search({
      text_query: query,
      image_data: imageData,
      match_threshold: options.threshold || 0.7,
      match_count: options.count || 15,
      categories: options.categories,
      search_type: 'hybrid'
    });
  }

  /**
   * Search similar materials to existing material
   */
  async findSimilarMaterials(
    materialId: string,
    options: { 
      threshold?: number; 
      count?: number; 
      excludeSelf?: boolean;
    } = {}
  ): Promise<VectorSearchResponse> {
    try {
      // Get the material's embedding first
      const { data: material, error } = await supabase
        .from('material_embeddings')
        .select('embedding')
        .eq('material_id', materialId)
        .limit(1)
        .single();

      if (error || !material) {
        throw new Error('Material embedding not found');
      }

      const results = await this.search({
        query_embedding: JSON.parse(material.embedding),
        match_threshold: options.threshold || 0.8,
        match_count: options.count || 10,
        search_type: 'material'
      });

      // Filter out the original material if requested
      if (options.excludeSelf) {
        results.results = results.results.filter(r => r.material_id !== materialId);
      }

      return results;

    } catch (error) {
      console.error('Error finding similar materials:', error);
      throw error;
    }
  }

  /**
   * Search materials by properties
   */
  async searchByProperties(
    properties: Record<string, any>,
    options: { 
      threshold?: number; 
      count?: number;
    } = {}
  ): Promise<VectorSearchResponse> {
    // Convert properties to a searchable query
    const queryText = Object.entries(properties)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    return this.searchByText(queryText, options);
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(timeRange = '7 days'): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('search_analytics')
        .select('*')
        .gte('created_at', new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;

    } catch (error) {
      console.error('Error getting search analytics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const vectorSimilarityService = new VectorSimilarityService();
export { VectorSimilarityService };