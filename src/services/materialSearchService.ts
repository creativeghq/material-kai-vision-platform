import { supabase } from '@/integrations/supabase/client';

export interface MaterialSearchResult {
  id: string;
  name: string;
  category: string;
  description?: string;
  properties?: unknown;
  images: Array<{
    id: string;
    url: string;
    type: string;
    is_featured: boolean;
  }>;
  metafield_values: Array<{
    field_name: string;
    display_name: string;
    field_type: string;
    value_text?: string;
    value_number?: number;
    value_boolean?: boolean;
    confidence_score?: number;
  }>;
  search_score?: number;
  match_type?: 'exact' | 'semantic' | 'visual' | 'vector' | 'hybrid';
}

export interface SearchParams {
  query: string;
  searchType?: 'text' | 'semantic' | 'hybrid';
  category?: string;
  limit?: number;
  minConfidence?: number;
  includeImages?: boolean;
  includeMetafields?: boolean;
  includeRelationships?: boolean;
}

export class MaterialSearchService {
  /**
   * Search materials using the unified material search API
   */
  async search(params: SearchParams): Promise<{
    success: boolean;
    data: MaterialSearchResult[];
    metadata: unknown;
    error?: string;
  }> {
    try {
      // Search parameters for future use
      new URLSearchParams({
        q: params.query,
        search_type: params.searchType || 'hybrid',
        limit: (params.limit || 20).toString(),
        ...(params.category && { category: params.category }),
        ...(params.minConfidence && { min_confidence: params.minConfidence.toString() }),
        include_images: (params.includeImages !== false).toString(),
        include_metafields: (params.includeMetafields !== false).toString(),
        include_relationships: (params.includeRelationships !== false).toString()
      });

      const { data, error } = await supabase.functions.invoke('unified-material-search', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (error) {
        console.error('Material search error:', error);
        return {
          success: false,
          data: [],
          metadata: {},
          error: error.message || 'Search failed'
        };
      }

      return {
        success: data.success,
        data: data.data || [],
        metadata: data.metadata || {},
        error: data.error
      };

    } catch (error) {
      console.error('Material search service error:', error);
      return {
        success: false,
        data: [],
        metadata: {},
        error: error instanceof Error ? error.message : 'Unknown search error'
      };
    }
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(_partial: string, _limit: number = 10): Promise<{
    success: boolean;
    data: Array<{
      text: string;
      type: string;
      category?: string;
    }>;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('unified-material-search', {
        method: 'GET',
        body: null // GET request for suggestions endpoint
      });

      if (error) {
        return {
          success: false,
          data: [],
          error: error.message || 'Failed to get suggestions'
        };
      }

      return {
        success: data.success,
        data: data.data || [],
        error: data.error
      };

    } catch (error) {
      console.error('Suggestions error:', error);
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get material by ID using unified materials API
   */
  async getMaterialById(_materialId: string): Promise<{
    success: boolean;
    data?: MaterialSearchResult;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('unified-materials-api', {
        method: 'GET',
        body: null // GET request with materialId in path
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Failed to get material'
        };
      }

      return {
        success: data.success,
        data: data.data,
        error: data.error
      };

    } catch (error) {
      console.error('Get material error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload image and associate with material
   */
  async uploadMaterialImage(
    materialId: string,
    imageFile: File,
    options: {
      imageType?: 'primary' | 'variant' | 'texture' | 'analysis' | 'reference';
      isFeatured?: boolean;
      displayOrder?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const base64Data = await base64Promise;

      const { data, error } = await supabase.functions.invoke('material-images-api', {
        body: {
          material_id: materialId,
          image_data: base64Data,
          image_type: options.imageType || 'primary',
          is_featured: options.isFeatured || false,
          display_order: options.displayOrder || 0,
          file_name: imageFile.name,
          metadata: options.metadata || {}
        }
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Failed to upload image'
        };
      }

      return {
        success: data.success,
        data: data.data,
        error: data.error
      };

    } catch (error) {
      console.error('Image upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create or update metafield value
   */
  async updateMetafieldValue(
    materialId: string,
    fieldId: string,
    value: unknown,
    options: {
      confidenceScore?: number;
      extractionMethod?: string;
      sourceUrl?: string;
    } = {}
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('material-metafield-values', {
        body: {
          material_id: materialId,
          field_id: fieldId,
          value: value,
          confidence_score: options.confidenceScore || 1.0,
          extraction_method: options.extractionMethod || 'manual',
          source_url: options.sourceUrl
        }
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Failed to update metafield'
        };
      }

      return {
        success: data.success,
        data: data.data,
        error: data.error
      };

    } catch (error) {
      console.error('Metafield update error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const materialSearchService = new MaterialSearchService();

// Export default
export default MaterialSearchService;