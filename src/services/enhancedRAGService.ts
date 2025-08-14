import { supabase } from '@/integrations/supabase/client';
import { RagDocument } from './mivaaToRagTransformer';
import { ErrorHandler } from '../utils/errorHandler';

export interface EnhancedRAGRequest {
  query: string;
  context?: {
    projectType?: string;
    roomType?: string;
    stylePreferences?: string[];
    materialCategories?: string[];
  };
  searchType?: 'semantic' | 'hybrid' | 'perplexity' | 'comprehensive';
  maxResults?: number;
  includeRealTime?: boolean;
}

export interface EnhancedRAGResponse {
  success: boolean;
  query: string;
  processedQuery: string;
  queryIntent: string;
  results: {
    knowledgeBase: KnowledgeResult[];
    materialKnowledge: MaterialKnowledgeResult[];
    realTimeInfo?: PerplexityResult;
    recommendations: RecommendationResult[];
  };
  semanticAnalysis: {
    queryEmbedding: number[];
    detectedEntities: Record<string, any>;
    queryComplexity: number;
    suggestedRefinements: string[];
  };
  performance: {
    totalTime: number;
    embeddingTime: number;
    searchTime: number;
    perplexityTime?: number;
  };
  analytics: {
    sessionId: string;
    cacheHit: boolean;
    relevanceScores: number[];
  };
}

export interface KnowledgeResult {
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  source: string;
  metadata: Record<string, any>;
  pdfUrl?: string; // Link to original PDF on Supabase for additional details
  sourceUrl?: string; // General source URL (kept for backward compatibility)
}

export interface MaterialKnowledgeResult {
  materialId: string;
  materialName: string;
  extractedKnowledge: string;
  extractionType: string;
  confidence: number;
  relevanceScore: number;
}

export interface PerplexityResult {
  answer: string;
  sources: string[];
  confidence: number;
  relatedQuestions: string[];
}

export interface RecommendationResult {
  type: 'material' | 'style' | 'knowledge';
  id: string;
  title: string;
  description: string;
  score: number;
  reasoning: string;
}

export interface MaterialKnowledgeEntry {
  id: string;
  materialId: string;
  extractionType: string;
  extractedKnowledge: string;
  confidence: number;
  extractionContext: Record<string, any>;
  sourceFields: string[];
  validationStatus: string;
  validatedBy?: string;
  validationNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  confidence: number;
  relationshipStrength: number;
  relationshipContext?: string;
  bidirectional: boolean;
  sourceType: string;
  validationStatus: string;
  validatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueryIntelligence {
  id: string;
  userId?: string;
  originalQuery: string;
  processedQuery: string;
  queryIntent: string;
  queryType: string;
  entitiesDetected: Record<string, any>;
  userContext: Record<string, any>;
  sessionContext: Record<string, any>;
  projectContext: Record<string, any>;
  resultsReturned: number;
  userSatisfaction?: number;
  clickedResults: string[];
  createdAt: string;
}

export class EnhancedRAGService {
  /**
   * Perform enhanced RAG search with ML-powered query understanding
   */
  static async search(request: EnhancedRAGRequest): Promise<EnhancedRAGResponse> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('enhanced-rag-search', {
        body: {
          ...request,
          userId: user?.id
        }
      });

      if (error) {
        throw error;
      }

      return data as EnhancedRAGResponse;
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Enhanced RAG search failed',
        { query: request.query, searchType: request.searchType, originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Get material knowledge extractions for a specific material
   */
  static async getMaterialKnowledge(materialId: string): Promise<MaterialKnowledgeEntry[]> {
    try {
      const { data, error } = await supabase
        .from('material_knowledge_extraction')
        .select('*')
        .eq('material_id', materialId)
        .eq('validation_status', 'approved')
        .order('confidence_score', { ascending: false });

      if (error) {
        throw error;
      }

      return data.map(item => ({
        id: item.id,
        materialId: item.material_id,
        extractionType: item.extraction_type,
        extractedKnowledge: item.extracted_knowledge,
        confidence: item.confidence_score,
        extractionContext: (item.extraction_context as Record<string, any>) || {},
        sourceFields: item.source_fields || [],
        validationStatus: item.validation_status,
        validatedBy: item.validated_by,
        validationNotes: item.validation_notes,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }));
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Material knowledge fetch failed',
        { materialId, originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Add new knowledge entry to enhanced knowledge base
   */
  static async addKnowledgeEntry(entry: {
    title: string;
    content: string;
    contentType?: string;
    sourceUrl?: string;
    pdfUrl?: string; // Link to PDF stored on Supabase for additional details
    materialIds?: string[];
    materialCategories?: string[];
    semanticTags?: string[];
    language?: string;
    readingLevel?: number;
    technicalComplexity?: number;
  }) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Generate embeddings and semantic analysis via edge function
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-knowledge-content', {
        body: {
          title: entry.title,
          content: entry.content,
          contentType: entry.contentType
        }
      });

      if (analysisError) {
        console.warn('Knowledge analysis failed, proceeding without ML enhancement:', analysisError);
      }

      const { data, error } = await supabase
        .from('enhanced_knowledge_base')
        .insert({
          title: entry.title,
          content: entry.content,
          content_type: entry.contentType || 'article',
          source_url: entry.sourceUrl,
          pdf_url: entry.pdfUrl, // Store PDF URL for additional details
          material_ids: entry.materialIds || [],
          material_categories: entry.materialCategories || [],
          semantic_tags: entry.semanticTags || [],
          language: entry.language || 'en',
          reading_level: entry.readingLevel,
          technical_complexity: entry.technicalComplexity,
          openai_embedding: analysisData?.openai_embedding,
          huggingface_embedding: analysisData?.huggingface_embedding,
          custom_embedding: analysisData?.custom_embedding,
          confidence_scores: analysisData?.confidence_scores,
          search_keywords: analysisData?.search_keywords,
          created_by: user.id,
          last_modified_by: user.id,
          status: 'draft'
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Knowledge entry addition failed',
        { entryTitle: entry.title, originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Get knowledge relationships for a specific entry
   */
  static async getKnowledgeRelationships(entryId: string): Promise<KnowledgeRelationship[]> {
    try {
      const { data, error } = await supabase
        .from('knowledge_relationships')
        .select('*')
        .or(`source_id.eq.${entryId},target_id.eq.${entryId}`)
        .eq('validation_status', 'approved')
        .order('confidence_score', { ascending: false });

      if (error) {
        throw error;
      }

      return data.map(item => ({
        id: item.id,
        sourceId: item.source_id,
        targetId: item.target_id,
        relationshipType: item.relationship_type,
        confidence: item.confidence_score,
        relationshipStrength: item.relationship_strength,
        relationshipContext: item.relationship_context,
        bidirectional: item.bidirectional,
        sourceType: item.source_type,
        validationStatus: item.validation_status,
        validatedBy: item.validated_by,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }));
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Knowledge relationships fetch failed',
        { entryId, originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Get user's query history and intelligence
   */
  static async getQueryHistory(limit = 20): Promise<QueryIntelligence[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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

      return data.map(item => ({
        id: item.id,
        userId: item.user_id,
        originalQuery: item.original_query,
        processedQuery: item.processed_query,
        queryIntent: item.query_intent,
        queryType: item.query_type,
        entitiesDetected: (item.entities_detected as Record<string, any>) || {},
        userContext: (item.user_context as Record<string, any>) || {},
        sessionContext: (item.session_context as Record<string, any>) || {},
        projectContext: (item.project_context as Record<string, any>) || {},
        resultsReturned: item.results_returned,
        userSatisfaction: item.user_satisfaction,
        clickedResults: item.clicked_results || [],
        createdAt: item.created_at
      }));
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Query history fetch failed',
        { originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Provide feedback on search results
   */
  static async provideFeedback(searchId: string, feedback: {
    satisfaction: number; // 1-5 scale
    clickedResults: string[];
    followUpQuery?: string;
    notes?: string;
  }) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('query_intelligence')
        .update({
          user_satisfaction: feedback.satisfaction,
          clicked_results: feedback.clickedResults
        })
        .eq('id', searchId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      // Store additional feedback if provided
      if (feedback.followUpQuery || feedback.notes) {
        await supabase
          .from('search_analytics')
          .insert({
            user_id: user.id,
            query_text: feedback.followUpQuery || 'feedback',
            satisfaction_rating: feedback.satisfaction,
            // Additional analytics fields would be populated
          });
      }

      return { success: true };
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Feedback submission failed',
        { satisfaction: feedback.satisfaction, originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Get search analytics and insights
   */
  static async getSearchAnalytics(timeRange = '30 days') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeRange.split(' ')[0]));

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
      const totalSearches = data.length;
      const avgSatisfaction = data
        .filter(s => s.satisfaction_rating)
        .reduce((sum, s) => sum + s.satisfaction_rating, 0) / 
        data.filter(s => s.satisfaction_rating).length || 0;
      
      const avgResponseTime = data
        .reduce((sum, s) => sum + (s.response_time_ms || 0), 0) / data.length || 0;

      const topQueries = data
        .reduce((acc, search) => {
          acc[search.query_text] = (acc[search.query_text] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      return {
        totalSearches,
        avgSatisfaction: Math.round(avgSatisfaction * 100) / 100,
        avgResponseTime: Math.round(avgResponseTime),
        topQueries: Object.entries(topQueries)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .slice(0, 10)
          .map(([query, count]) => ({ query, count })),
        searchHistory: data.slice(0, 50) // Recent searches
      };
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Search analytics fetch failed',
        { originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Extract knowledge from material descriptions and properties
   */
  static async extractMaterialKnowledge(materialId: string, forceReextraction = false) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if already extracted recently
      if (!forceReextraction) {
        const { data: existingData } = await supabase
          .from('material_knowledge_extraction')
          .select('id')
          .eq('material_id', materialId)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // 7 days
          .limit(1);

        if (existingData && existingData.length > 0) {
          console.log('Material knowledge already extracted recently');
          return { success: true, message: 'Knowledge already extracted recently' };
        }
      }

      // Trigger knowledge extraction via edge function
      const { data, error } = await supabase.functions.invoke('extract-material-knowledge', {
        body: {
          materialId,
          userId: user.id,
          forceReextraction
        }
      });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Material knowledge extraction failed',
        { materialId, originalError: (error as Error).message }
      );
      throw ragError;
    }
  }

  /**
   * Validate extracted knowledge
   */
  static async validateKnowledge(extractionId: string, isValid: boolean, notes?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('material_knowledge_extraction')
        .update({
          validation_status: isValid ? 'approved' : 'rejected',
          validated_by: user.id,
          validation_notes: notes
        })
        .eq('id', extractionId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      const ragError = ErrorHandler.createValidationError(
        'Knowledge validation failed',
        { originalError: (error as Error).message }
      );
      throw ragError;
    }
  }
}