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
  metadata: unknown;
}

export interface RAGResponse {
  results: RAGSearchResult[];
  context?: string;
  query_embedding?: number[];
  search_params: RAGSearchRequest;
  processing_time_ms: number;
}

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

class RAGService {
  /**
   * Perform intelligent search across materials and knowledge base
   */
  async searchKnowledge(request: RAGSearchRequest): Promise<RAGResponse> {
    const { data, error } = await supabase.functions.invoke('rag-knowledge-search', {
      body: request,
    });

    if (error) {
      throw new Error(`RAG search failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Quick material search with context generation
   */
  async quickSearch(query: string, includeContext: boolean = true): Promise<RAGResponse> {
    return this.searchKnowledge({
      query,
      search_type: 'hybrid',
      match_count: 5,
      include_context: includeContext,
      match_threshold: 0.6,
    });
  }

  /**
   * Material-specific search
   */
  async searchMaterials(query: string, category?: string): Promise<RAGResponse> {
    const request: RAGSearchRequest = {
      query,
      search_type: 'material',
      match_count: 10,
      include_context: false,
      match_threshold: 0.5,
    };

    // If category specified, we'll filter in the results
    const response = await this.searchKnowledge(request);

    if (category) {
      response.results = response.results.filter(
        result => result.metadata?.category === category,
      );
    }

    return response;
  }

  /**
   * Knowledge base search
   */
  async searchKnowledgeBase(query: string, contentType?: string): Promise<RAGResponse> {
    const response = await this.searchKnowledge({
      query,
      search_type: 'knowledge',
      match_count: 8,
      include_context: true,
      match_threshold: 0.6,
    });

    if (contentType) {
      response.results = response.results.filter(
        result => result.metadata?.content_type === contentType,
      );
    }

    return response;
  }

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
}

export const ragService = new RAGService();
