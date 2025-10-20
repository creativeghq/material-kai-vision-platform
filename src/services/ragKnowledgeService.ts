/**
 * RAG Knowledge Service
 * Integrates with rag-knowledge-search edge function for intelligent search
 */

import { supabase } from '@/integrations/supabase/client';

import { RAGSearchRequest, RAGSearchResult, RAGResponse } from '../types/rag';

// RAG interfaces moved to src/types/rag.ts for unified usage across the application

// Training interfaces from ragService.ts
export interface TrainingRequest {
  training_type: 'clip_finetuning' | 'material_classification' | 'embedding_optimization';
  model_base: string;
  dataset_export_options: {
    include_materials: boolean;
    include_knowledge_base: boolean;
    category_filter?: string[];
    min_confidence?: number;
  };
  training_config: {
    batch_size?: number;
    learning_rate?: number;
    epochs?: number;
    output_model_name: string;
  };
}

export interface TrainingResponse {
  success: boolean;
  dataset_url: string;
  training_url: string;
  dataset_stats: {
    total_items: number;
    export_timestamp: string;
    categories: string[];
  };
  estimated_training_time: string;
  message: string;
  timestamp: string;
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

      return analytics?.map((a: any) => a.query_text) || [];

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

  // ============================================================================
  // TRAINING AND KNOWLEDGE MANAGEMENT METHODS (from ragService.ts)
  // ============================================================================

  /**
   * Start model training on Hugging Face
   */
  async startTraining(request: TrainingRequest): Promise<TrainingResponse> {
    const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
      body: request,
    });

    if (error) {
      throw new Error(`Training setup failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Start CLIP fine-tuning for better embeddings
   */
  async startCLIPFineTuning(
    outputModelName: string,
    includeCategories?: string[],
    epochs: number = 3,
  ): Promise<TrainingResponse> {
    return this.startTraining({
      training_type: 'clip_finetuning',
      model_base: 'openai/clip-vit-base-patch32',
      dataset_export_options: {
        include_materials: true,
        include_knowledge_base: true,
        category_filter: includeCategories,
      },
      training_config: {
        output_model_name: outputModelName,
        epochs,
        batch_size: 8,
        learning_rate: 5e-5,
      },
    });
  }

  /**
   * Start material classification training
   */
  async startMaterialClassification(
    outputModelName: string,
    categories?: string[],
    epochs: number = 5,
  ): Promise<TrainingResponse> {
    return this.startTraining({
      training_type: 'material_classification',
      model_base: 'google/efficientnet-b0',
      dataset_export_options: {
        include_materials: true,
        include_knowledge_base: false,
        category_filter: categories,
      },
      training_config: {
        output_model_name: outputModelName,
        epochs,
        batch_size: 16,
        learning_rate: 3e-4,
      },
    });
  }

  /**
   * Add entry to knowledge base
   */
  async addKnowledgeEntry(entry: {
    title: string;
    content: string;
    content_type: 'material_spec' | 'technical_doc' | 'expert_knowledge';
    tags: string[];
    material_ids?: string[];
    source_url?: string;
  }): Promise<void> {
    const { error } = await supabase
      .from('knowledge_base_entries')
      .insert(entry);

    if (error) {
      throw new Error(`Failed to add knowledge entry: ${error.message}`);
    }
  }

  /**
   * Get training job status
   */
  async getTrainingStatus(jobType: string = 'model_training'): Promise<unknown[]> {
    const { data, error } = await supabase
      .from('processing_queue')
      .select('*')
      .eq('job_type', jobType)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new Error(`Failed to get training status: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Generate embeddings for a material
   */
  async generateMaterialEmbedding(
    materialId: string,
    embeddingType: 'clip' | 'efficientnet' | 'materialnet' = 'clip',
  ): Promise<void> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // This would typically be handled by a background job
    // For now, we'll create a processing queue entry
    const { error } = await supabase
      .from('processing_queue')
      .insert({
        user_id: user.id,
        job_type: 'generate_embedding',
        input_data: {
          material_id: materialId,
          embedding_type: embeddingType,
        },
        status: 'pending',
      });

    if (error) {
      throw new Error(`Failed to queue embedding generation: ${error.message}`);
    }
  }

  /**
   * Quick material search with context generation (from ragService.ts)
   */
  async quickSearch(query: string, includeContext: boolean = true): Promise<RAGResponse> {
    return this.search({
      query,
      search_type: 'hybrid',
      match_count: 5,
      include_context: includeContext,
      match_threshold: 0.6,
    });
  }

  /**
   * Knowledge base search (alias for searchKnowledge for compatibility)
   */
  async searchKnowledgeBase(query: string, contentType?: string): Promise<RAGResponse> {
    const response = await this.searchKnowledge(query, true);

    if (contentType) {
      response.results = response.results.filter(
        result => (result.metadata as any)?.content_type === contentType,
      );
    }

    return response;
  }
}

// Export singleton instance
export const ragKnowledgeService = new RAGKnowledgeService();
export { RAGKnowledgeService };
