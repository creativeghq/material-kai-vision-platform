/**
 * RAG Knowledge Service
 * Integrates with rag-knowledge-search edge function for intelligent search
 */

import { supabase } from '@/integrations/supabase/client';

export interface RAGSearchRequest {
  query: string;
  search_type?: 'material' | 'knowledge' | 'hybrid';
  embedding_types?: string[];
  match_threshold?: number;
  match_count?: number;
  include_context?: boolean;
}

export interface RAGSearchResult {
  result_type: string;
  id: string;
  similarity_score: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RAGResponse {
  results: RAGSearchResult[];
  context?: string;
  query_embedding?: number[];
  search_params: RAGSearchRequest;
  processing_time_ms: number;
}

class RAGKnowledgeService {

  /**
   * Perform intelligent RAG search
   */
  async search(request: RAGSearchRequest): Promise<RAGResponse> {
    try {
      console.log('Starting RAG knowledge search:', request.query);

      const { data, error } = await supabase.functions.invoke('rag-knowledge-search', {
        body: request,
      });

      if (error) {
        console.error('RAG search error:', error);
        throw new Error(`RAG search failed: ${error.message}`);
      }

      return data as RAGResponse;

    } catch (error) {
      console.error('Error in RAG search:', error);
      throw error;
    }
  }

  /**
   * Search for materials with context
   */
  async searchMaterials(query: string, includeContext: boolean = true): Promise<RAGResponse> {
    return this.search({
      query,
      search_type: 'material',
      include_context: includeContext,
      match_count: 10,
      match_threshold: 0.7,
    });
  }

  /**
   * Search knowledge base
   */
  async searchKnowledge(query: string, includeContext: boolean = true): Promise<RAGResponse> {
    return this.search({
      query,
      search_type: 'knowledge',
      include_context: includeContext,
      match_count: 10,
      match_threshold: 0.7,
    });
  }

  /**
   * Hybrid search across materials and knowledge
   */
  async hybridSearch(query: string, includeContext: boolean = true): Promise<RAGResponse> {
    return this.search({
      query,
      search_type: 'hybrid',
      include_context: includeContext,
      match_count: 15,
      match_threshold: 0.6,
    });
  }

  /**
   * Search with custom parameters
   */
  async customSearch(
    query: string,
    options: {
      searchType?: 'material' | 'knowledge' | 'hybrid';
      embeddingTypes?: string[];
      threshold?: number;
      count?: number;
      includeContext?: boolean;
    },
  ): Promise<RAGResponse> {
    return this.search({
      query,
      search_type: options.searchType || 'hybrid',
      embedding_types: options.embeddingTypes || ['clip'],
      match_threshold: options.threshold || 0.7,
      match_count: options.count || 10,
      include_context: options.includeContext !== false,
    });
  }

  /**
   * Get search suggestions based on query
   */
  async getSearchSuggestions(partialQuery: string): Promise<string[]> {
    try {
      // Get recent successful searches
      const { data: analytics, error } = await supabase
        .from('search_analytics')
        .select('query_text')
        .gte('satisfaction_rating', 4)
        .ilike('query_text', `%${partialQuery}%`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.warn('Error getting search suggestions:', error);
        return [];
      }

      return analytics?.map(a => a.query_text) || [];

    } catch (error) {
      console.error('Error getting search suggestions:', error);
      return [];
    }
  }

  /**
   * Track search analytics
   */
  async trackSearch(
    query: string,
    results: RAGSearchResult[],
    processingTime: number,
    sessionId?: string,
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('search_analytics')
        .insert({
          query_text: query,
          total_results: results.length,
          results_shown: Math.min(results.length, 10),
          response_time_ms: processingTime,
          avg_relevance_score: results.length > 0
            ? results.reduce((sum, r) => sum + r.similarity_score, 0) / results.length
            : 0,
          session_id: sessionId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
        });

      if (error) {
        console.warn('Error tracking search analytics:', error);
      }

    } catch (error) {
      console.error('Error tracking search analytics:', error);
    }
  }

  /**
   * Rate search result quality
   */
  async rateSearchResults(
    queryText: string,
    satisfactionRating: number,
    clickedResults: string[] = [],
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('search_analytics')
        .update({
          satisfaction_rating: satisfactionRating,
          clicks_count: clickedResults.length,
        })
        .eq('query_text', queryText)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('Error rating search results:', error);
      }

    } catch (error) {
      console.error('Error rating search results:', error);
    }
  }
}

// Export singleton instance
export const ragKnowledgeService = new RAGKnowledgeService();
export { RAGKnowledgeService };
