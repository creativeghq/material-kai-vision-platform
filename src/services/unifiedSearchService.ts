/**
 * Unified Search Service
 *
 * Single service for ALL search operations across Materials Hub.
 * Replaces: EnhancedRAGService, MaterialSearchService, and other search wrappers.
 *
 * All searches go through Python MIVAA API backend with proper type safety.
 */

import { mivaaApi } from './mivaaApiClient';
import { ErrorHandler } from '../utils/errorHandler';
import { flowEventService } from '@/services/flows/flowEventService';
import { supabase } from '@/integrations/supabase/client';

// ==================== TYPE DEFINITIONS ====================

/**
 * Search strategy for the platform
 *
 * ONLY 'multi_vector' is supported and used throughout the platform.
 * This is the default and only search method, combining 7-vector fusion embeddings
 * (text 15%, visual 15%, understanding 20%, color 12.5%, texture 12.5%, style 12.5%, material 12.5%)
 * + JSONB metadata filtering + query understanding support.
 */
export type SearchStrategy = 'multi_vector';

/**
 * Unified search request matching Python backend SearchRequest schema
 */
export interface UnifiedSearchRequest {
  // Core search parameters
  query: string;
  strategy?: SearchStrategy;

  // Result configuration
  top_k?: number;                    // Number of results (default: 10)
  similarity_threshold?: number;     // Minimum similarity score (default: 0.7)

  // Workspace and filtering
  workspace_id: string;              // Required for scoped search
  document_ids?: string[];           // Filter by specific documents
  material_filters?: Record<string, any>;  // Material property filters

  // Image search parameters
  image_url?: string;                // Image URL for visual search
  image_base64?: string;             // Base64-encoded image

  // Aspect-biased retrieval (#277) — when set, the backend weights the matching per-aspect
  // embedding collection (image_<aspect>_embeddings) instead of the flat 7-vector fusion, so
  // "find similar colors / textures / styles / materials" actually biases toward that aspect.
  // Optional + backward-compatible: omit for a normal multi_vector fusion search.
  aspect?: 'color' | 'texture' | 'style' | 'material';

  // 🧠 Query Understanding (ENABLED BY DEFAULT)
  enable_query_understanding?: boolean;  // Auto-extract filters from natural language (default: true)

  // Search enhancement
  use_search_prompts?: boolean;      // Apply admin-configured prompts (default: true)
  custom_formatting_prompt?: string; // Custom prompt override
  include_related_products?: boolean; // Include related products (default: true)
  related_products_limit?: number;   // Max related products per result (default: 3)

  // Content options
  include_content?: boolean;         // Include chunk content (default: true)
}

/**
 * Search result from Python backend
 */
export interface SearchResult {
  // Core result data
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;

  // Scoring
  similarity_score: number;
  combined_score: number;
  keyword_score?: number;
  understanding_score?: number;

  // Context
  page_number: number;
  context_before?: string;
  context_after?: string;

  // Metadata
  chunk_metadata: Record<string, any>;
  document_tags: string[];
  filename?: string;
  processing_status?: string;
  created_at?: string;
  source_metadata?: Record<string, any>;

  // Related products (if enabled)
  related_products?: Array<{
    product_id: string;
    product_name: string;
    relevance_score: number;
    relationship_type: string;
  }>;

  // Product-level enrichment (when result is product-shaped, not chunk-shaped)
  name?: string;
  category?: string;
  metafield_values?: Record<string, unknown>;
}

/**
 * Unified search response matching Python backend SearchResponse schema
 */
export interface UnifiedSearchResponse {
  success: boolean;
  query: string;
  enhanced_query?: string;           // Enhanced query if prompts applied
  results: SearchResult[];
  total_results: number;
  search_type: string;               // Strategy used
  processing_time: number;           // Seconds
  search_metadata?: {
    prompts_applied?: string[];
    strategies_used?: string[];      // For 'all' strategy
    strategy_results?: Record<string, number>; // Results per strategy
  };
  error?: string;
}

/**
 * Material search specific result
 */
export interface MaterialSearchResult {
  id: string;
  name: string;
  category: string;
  description?: string;
  properties?: Record<string, any>;
  images: Array<{
    id: string;
    url: string;
    type: string;
    is_featured: boolean;
  }>;
  search_score?: number;
  match_type?: 'exact' | 'semantic' | 'visual' | 'vector' | 'hybrid';
}

// ==================== UNIFIED SEARCH SERVICE ====================

export class UnifiedSearchService {
  /**
   * Main search method - handles ALL search strategies
   *
   * @param request - Unified search request
   * @returns Search results from Python backend
   */
  static async search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    try {
      const strategy = request.strategy || 'multi_vector';

      // Build request payload matching Python backend schema
      const payload = {
        query: request.query,
        workspace_id: request.workspace_id,
        top_k: request.top_k || 10,
        similarity_threshold: request.similarity_threshold || 0.7,
        document_ids: request.document_ids,
        material_filters: request.material_filters,
        image_url: request.image_url,
        image_base64: request.image_base64,
        use_search_prompts: request.use_search_prompts !== false,
        custom_formatting_prompt: request.custom_formatting_prompt,
        include_related_products: request.include_related_products !== false,
        related_products_limit: request.related_products_limit || 3,
        include_content: request.include_content !== false,
        // Aspect bias (#277) — backend weights image_<aspect>_embeddings when present.
        ...(request.aspect ? { aspect: request.aspect } : {}),
      };

      // Build query parameters
      const queryParams = new URLSearchParams({ strategy });

      // 🧠 Query understanding is ENABLED BY DEFAULT (can be disabled by setting to false)
      const enableQueryUnderstanding = request.enable_query_understanding !== false;
      queryParams.append('enable_query_understanding', enableQueryUnderstanding.toString());

      // Call Python backend with strategy and query understanding parameters
      const response = await mivaaApi.request(`/api/rag/search?${queryParams.toString()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Search failed');
      }

      const result = { success: true, ...response.data };

      flowEventService.emit('search_executed', {
        query: request.query,
        result_count: result.total_results ?? result.results?.length ?? 0,
        search_type: request.strategy || 'multi_vector',
      });

      return result;
    } catch (error) {
      const searchError = ErrorHandler.handleError(error, {
        query: request.query,
        strategy: request.strategy,
        operation: 'Unified search failed',
      });

      return {
        success: false,
        query: request.query,
        results: [],
        total_results: 0,
        search_type: request.strategy || 'semantic',
        processing_time: 0,
        error: searchError.message,
      };
    }
  }

  // ==================== SEARCH METHOD ====================

  /**
   * 🎯 Multi-Vector Search - The ONLY search method used in the platform
   * Combines 7-vector fusion embeddings + metadata filtering + query understanding (enabled by default)
   *
   * This method replaces all previous search methods (semantic, visual, hybrid, material, etc.)
   * All search functionality now uses multi_vector strategy exclusively.
   */
  static async searchMultiVector(params: {
    query: string;
    workspace_id: string;
    limit?: number;
    filters?: Record<string, any>;
    enableQueryUnderstanding?: boolean;  // Auto-extract filters from natural language (default: true, set to false to disable)
    image_url?: string;  // Optional image URL for visual search component
    image_base64?: string;  // Optional base64 image for visual search component
    aspect?: 'color' | 'texture' | 'style' | 'material';  // Bias toward one aspect (#277)
  }): Promise<UnifiedSearchResponse> {
    return this.search({
      query: params.query,
      workspace_id: params.workspace_id,
      strategy: 'multi_vector',
      material_filters: params.filters,
      top_k: params.limit,
      enable_query_understanding: params.enableQueryUnderstanding,
      image_url: params.image_url,
      image_base64: params.image_base64,
      aspect: params.aspect,
    });
  }

  // =============================================================================
  // ANALYTICS & FEEDBACK METHODS
  // =============================================================================

  /**
   * Get user's query history and intelligence
   */
  static async getQueryHistory(limit = 20): Promise<any[]> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('query_intelligence')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Query history fetch failed:', error);
      throw error;
    }
  }

  /**
   * Provide feedback on search results
   */
  static async provideFeedback(
    searchId: string,
    feedback: {
      satisfaction: number; // 1-5 scale
      clickedResults: string[];
      followUpQuery?: string;
      notes?: string;
    },
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('query_intelligence')
        .update({
          user_satisfaction: feedback.satisfaction,
          clicked_results: feedback.clickedResults,
        })
        .eq('id', searchId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      // Store additional feedback if provided
      if (feedback.followUpQuery || feedback.notes) {
        await supabase.from('search_analytics').insert({
          user_id: user.id,
          query_text: feedback.followUpQuery || 'feedback',
          satisfaction_rating: feedback.satisfaction,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Feedback submission failed:', error);
      throw error;
    }
  }

  /**
   * Get search analytics and insights
   */
  static async getSearchAnalytics(timeRange = '30 days') {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const startDate = new Date();
      startDate.setDate(
        startDate.getDate() - parseInt(timeRange.split(' ')[0]),
      );

      const { data, error } = await supabase
        .from('search_analytics')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Calculate insights
      const totalSearches = data?.length || 0;
      const avgSatisfaction =
        data && data.length > 0
          ? data
              .filter((s: any) => s.satisfaction_rating)
              .reduce((sum: number, s: any) => sum + s.satisfaction_rating, 0) /
            data.filter((s: any) => s.satisfaction_rating).length
          : 0;

      const avgResponseTime =
        data && data.length > 0
          ? data.reduce((sum: number, s: any) => sum + (s.response_time || 0), 0) /
            data.length
          : 0;

      return {
        totalSearches,
        avgSatisfaction,
        avgResponseTime,
        recentSearches: data || [],
      };
    } catch (error) {
      console.error('Analytics fetch failed:', error);
      throw error;
    }
  }
}

// Export singleton instance for convenience
export const unifiedSearchService = UnifiedSearchService;

// Export default
export default UnifiedSearchService;

