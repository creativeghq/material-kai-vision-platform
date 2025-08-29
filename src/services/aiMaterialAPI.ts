import { supabase } from '@/integrations/supabase/client';

export interface AIAnalysisRequest {
  fileId: string;
  analysisType: 'comprehensive' | 'quick' | 'properties_only';
  includeSimilar: boolean;
}

export interface MaterialProperties {
  density?: number;
  hardness?: number;
  melting_point?: number;
  thermal_conductivity?: number;
  electrical_conductivity?: number;
  color?: string;
  texture?: string;
  [key: string]: unknown;
}

export interface ChemicalComposition {
  elements: Record<string, number>;
  formula?: string;
  molecular_weight?: number;
  [key: string]: unknown;
}

export interface SimilarMaterial {
  id: string;
  name: string;
  category: string;
  confidence: number;
  similarity_score: number;
  properties?: MaterialProperties;
}

export interface AIAnalysisResult {
  success: boolean;
  result: {
    material_id?: string;
    analysis_id?: string;
    status: string;
    [key: string]: unknown;
  };
  analysis: {
    material_name: string;
    category: string;
    confidence: number;
    properties: MaterialProperties;
    chemical_composition: ChemicalComposition;
    safety_considerations: string[];
    standards: string[];
  };
  similar_materials: SimilarMaterial[];
  processing_time_ms: number;
}

export interface VectorSearchRequest {
  query: string;
  imageUrl?: string;
  categoryFilter?: string;
  confidenceThreshold?: number;
  limit?: number;
  searchType: 'text' | 'image' | 'hybrid';
}

export interface SearchResult {
  id: string;
  name: string;
  category: string;
  confidence: number;
  similarity_score: number;
  properties?: MaterialProperties;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeResult {
  id: string;
  title: string;
  content: string;
  source: string;
  relevance_score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchResult {
  success: boolean;
  results: SearchResult[];
  knowledge_results: KnowledgeResult[];
  search_metadata: {
    query: string;
    search_type: string;
    total_results: number;
    processing_time_ms: number;
    filters_applied: {
      category?: string;
      confidence_threshold?: number;
    };
  };
}

export interface VoiceInputRequest {
  audioData: string; // base64 encoded
  userId: string;
  language?: string;
  enhanceWithAI?: boolean;
}

export interface VoiceInputResult {
  success: boolean;
  transcription: string;
  enhanced_result?: {
    enhanced_description: string;
    extracted_properties: MaterialProperties;
    suggested_category: string;
    confidence_score: number;
  };
  similar_materials: SimilarMaterial[];
  processing_time_ms: number;
  record_id?: string;
}

export class AIMaterialAPI {
  // Advanced AI-powered material analysis
  static async analyzeWithAI(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    try {
      const { data, error } = await supabase.functions.invoke('ai-material-analysis', {
        body: {
          file_id: request.fileId,
          analysis_type: request.analysisType,
          include_similar: request.includeSimilar,
        },
      });

      if (error) {
        throw new Error(`AI analysis failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('AI material analysis error:', error);
      throw error;
    }
  }

  // Vector-based similarity search
  static async vectorSearch(request: VectorSearchRequest): Promise<VectorSearchResult> {
    try {
      const { data, error } = await supabase.functions.invoke('vector-similarity-search', {
        body: {
          query: request.query,
          image_url: request.imageUrl,
          category_filter: request.categoryFilter,
          confidence_threshold: request.confidenceThreshold || 0.7,
          limit: request.limit || 10,
          search_type: request.searchType,
        },
      });

      if (error) {
        throw new Error(`Vector search failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Vector search error:', error);
      throw error;
    }
  }

  // Voice-to-material description processing
  static async processVoiceInput(request: VoiceInputRequest): Promise<VoiceInputResult> {
    try {
      const { data, error } = await supabase.functions.invoke('voice-to-material', {
        body: {
          audio_data: request.audioData,
          user_id: request.userId,
          language: request.language || 'en',
          enhance_with_ai: request.enhanceWithAI !== false,
        },
      });

      if (error) {
        throw new Error(`Voice processing failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Voice input processing error:', error);
      throw error;
    }
  }

  // Get enhanced analytics for a user
  static async getUserAnalytics(userId: string, timeRange = '30 days') {
    try {
      const { data, error } = await supabase
        .from('analytics_events')
        .select(`
          event_type,
          event_data,
          created_at
        `)
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch analytics: ${error.message}`);
      }

      // Process analytics data
      const analytics = {
        total_recognitions: 0,
        ai_analyses: 0,
        voice_inputs: 0,
        vector_searches: 0,
        avg_confidence: 0,
        most_recognized_categories: {} as Record<string, number>,
        recent_activities: data?.slice(0, 10) || [],
      };

      let totalConfidence = 0;
      let confidenceCount = 0;

        data?.forEach(event => {
        const eventData = event.event_data as Record<string, unknown>;

        switch (event.event_type) {
          case 'material_identified':
            analytics.total_recognitions++;
            break;
          case 'ai_material_analysis':
            analytics.ai_analyses++;
            if (eventData?.confidence && typeof eventData.confidence === 'number') {
              totalConfidence += eventData.confidence;
              confidenceCount++;
            }
            break;
          case 'voice_material_description':
            analytics.voice_inputs++;
            break;
          case 'vector_search':
            analytics.vector_searches++;
            break;
        }

        // Track categories
        if (eventData?.material_category && typeof eventData.material_category === 'string') {
          const category = eventData.material_category;
          analytics.most_recognized_categories[category] =
            (analytics.most_recognized_categories[category] || 0) + 1;
        }
      });

      analytics.avg_confidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

      return analytics;
    } catch (error) {
      console.error('Error fetching user analytics:', error);
      throw error;
    }
  }

  // Batch processing for multiple files
  static async batchAnalyze(fileIds: string[], analysisType: AIAnalysisRequest['analysisType'] = 'quick') {
    try {
      const results = await Promise.allSettled(
        fileIds.map(fileId =>
          this.analyzeWithAI({
            fileId,
            analysisType,
            includeSimilar: false,
          }),
        ),
      );

      const successful = results
        .filter(result => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<AIAnalysisResult>).value);

      const failed = results
        .filter(result => result.status === 'rejected')
        .map(result => (result as PromiseRejectedResult).reason);

      return {
        successful_count: successful.length,
        failed_count: failed.length,
        results: successful,
        errors: failed,
      };
    } catch (error) {
      console.error('Batch analysis error:', error);
      throw error;
    }
  }

  // Real-time confidence tracking for ongoing recognition
  static async updateConfidenceScore(resultId: string, newConfidence: number, userId: string) {
    try {
      // Note: 'recognition_results' table doesn't exist in current schema
      // Using 'processing_results' as the closest available table
      const { error } = await supabase
        .from('processing_results')
        .update({
          result_data: { confidence_score: newConfidence },
          updated_at: new Date().toISOString()
        })
        .eq('id', resultId);

      if (error) {
        throw new Error(`Failed to update confidence: ${error.message}`);
      }

      // Log the confidence update
      await supabase
        .from('analytics_events')
        .insert({
          user_id: userId,
          event_type: 'confidence_updated',
          event_data: {
            result_id: resultId,
            new_confidence: newConfidence,
            updated_at: new Date().toISOString(),
          },
        });

      return { success: true };
    } catch (error) {
      console.error('Error updating confidence score:', error);
      throw error;
    }
  }
}
