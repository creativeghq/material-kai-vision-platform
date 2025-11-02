import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';

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
  filters?: Record<string, unknown>;
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
        ...(params.minConfidence && {
          min_confidence: params.minConfidence.toString(),
        }),
        include_images: (params.includeImages !== false).toString(),
        include_metafields: (params.includeMetafields !== false).toString(),
        include_relationships: (
          params.includeRelationships !== false
        ).toString(),
      });

      const response = await mivaaApi.searchMaterials({
        query: params.query || '',
        search_type: params.searchType as 'text' | 'semantic' | 'hybrid',
        limit: params.limit,
        filters: params.filters,
      });

      if (!response.success) {
        console.error('Material search error:', response.error);
        return {
          success: false,
          data: [],
          metadata: {},
          error: response.error || 'Search failed',
        };
      }

      return {
        success: response.success,
        data: response.data || [],
        metadata: {},
        error: response.error,
      };
    } catch (error) {
      console.error('Material search service error:', error);
      return {
        success: false,
        data: [],
        metadata: {},
        error: error instanceof Error ? error.message : 'Unknown search error',
      };
    }
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(
    _partial: string,
    _limit: number = 10,
  ): Promise<{
    success: boolean;
    data: Array<{
      text: string;
      type: string;
      category?: string;
    }>;
    error?: string;
  }> {
    try {
      const response = await mivaaApi.searchMaterials({
        query: '',
        search_type: 'text',
        limit: 10,
      });

      if (!response.success) {
        return {
          success: false,
          data: [],
          error: response.error || 'Failed to get suggestions',
        };
      }

      return {
        success: response.success,
        data: response.data || [],
        error: response.error,
      };
    } catch (error) {
      console.error('Suggestions error:', error);
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get material by ID using unified materials API
   */
  async getMaterialById(materialId: string): Promise<{
    success: boolean;
    data?: MaterialSearchResult;
    error?: string;
  }> {
    try {
      const response = await mivaaApi.searchMaterials({
        query: materialId,
        search_type: 'text',
        limit: 1,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get material',
        };
      }

      return {
        success: response.success,
        data: response.data?.[0],
        error: response.error,
      };
    } catch (error) {
      console.error('Get material error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upload image and associate with material
   */
  async uploadMaterialImage(
    materialId: string,
    imageFile: File,
    _options: {
      imageType?: 'primary' | 'variant' | 'texture' | 'analysis' | 'reference';
      isFeatured?: boolean;
      displayOrder?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    try {
      // For now, use Supabase storage directly
      // TODO: Implement MIVAA API image upload endpoint with options support
      const fileName = `${materialId}/${Date.now()}_${imageFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('material-images')
        .upload(fileName, imageFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        return {
          success: false,
          error: uploadError.message || 'Failed to upload image',
        };
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('material-images').getPublicUrl(fileName);

      return {
        success: true,
        data: {
          url: publicUrl,
          path: uploadData.path,
        },
      };
    } catch (error) {
      console.error('Image upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const materialSearchService = new MaterialSearchService();

// Export default
export default MaterialSearchService;
