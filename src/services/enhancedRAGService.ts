import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';

import { ErrorHandler } from '../utils/errorHandler';
// Note: Embedding config imports removed as they're not used in this service

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
    detectedEntities: Record<string, unknown>;
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
  metadata: Record<string, unknown>;
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
  extractionContext: Record<string, unknown>;
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
  entitiesDetected: Record<string, unknown>;
  userContext: Record<string, unknown>;
  sessionContext: Record<string, unknown>;
  projectContext: Record<string, unknown>;
  resultsReturned: number;
  userSatisfaction?: number;
  clickedResults: string[];
  createdAt: string;
}

export class EnhancedRAGService {
  /**
   * Perform enhanced RAG search with ML-powered query understanding
   */
  static async search(
    request: EnhancedRAGRequest,
  ): Promise<EnhancedRAGResponse> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await mivaaApi.searchSemantic({
        query: request.query,
        limit: request.maxResults || 10,
        filters: request.context,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Enhanced RAG search failed');
      }

      const data = response.data;

      return data as EnhancedRAGResponse;
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        query: request.query,
        searchType: request.searchType,
        operation: 'Enhanced RAG search failed',
      });
      throw ragError;
    }
  }

  /**
   * Get material knowledge extractions for a specific material
   */
  static async getMaterialKnowledge(
    materialId: string,
  ): Promise<MaterialKnowledgeEntry[]> {
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

      return data.map((item: unknown) => ({
        id: (item as any).id,
        materialId: (item as any).material_id,
        extractionType: (item as any).extraction_type,
        extractedKnowledge: (item as any).extracted_knowledge,
        confidence: (item as any).confidence_score,
        extractionContext:
          ((item as any).extraction_context as Record<string, unknown>) || {},
        sourceFields: (item as any).source_fields || [],
        validationStatus: (item as any).validation_status,
        validatedBy: (item as any).validated_by,
        validationNotes: (item as any).validation_notes,
        createdAt: (item as any).created_at,
        updatedAt: (item as any).updated_at,
      }));
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        materialId,
        operation: 'Material knowledge fetch failed',
      });
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Generate embeddings and semantic analysis via MIVAA
      const response = await mivaaApi.analyzeKnowledge({
        content: `${entry.title}\n\n${entry.content}`,
        content_type: entry.contentType,
      });

      let analysisData = null;
      if (!response.success) {
        console.warn(
          'Knowledge analysis failed, proceeding without ML enhancement:',
          response.error,
        );
      } else {
        analysisData = response.data;
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
          embedding_1536:
            analysisData?.openai_embedding || analysisData?.custom_embedding,
          confidence_scores: analysisData?.confidence_scores,
          search_keywords: analysisData?.search_keywords,
          created_by: user.id,
          last_modified_by: user.id,
          status: 'draft',
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        entryTitle: entry.title,
        operation: 'Knowledge entry addition failed',
      });
      throw ragError;
    }
  }

  /**
   * Get knowledge relationships for a specific entry
   */
  static async getKnowledgeRelationships(
    entryId: string,
  ): Promise<KnowledgeRelationship[]> {
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

      return data.map((item: unknown) => ({
        id: (item as any).id,
        sourceId: (item as any).source_id,
        targetId: (item as any).target_id,
        relationshipType: (item as any).relationship_type,
        confidence: (item as any).confidence_score,
        relationshipStrength: (item as any).relationship_strength,
        relationshipContext: (item as any).relationship_context,
        bidirectional: (item as any).bidirectional,
        sourceType: (item as any).source_type,
        validationStatus: (item as any).validation_status,
        validatedBy: (item as any).validated_by,
        createdAt: (item as any).created_at,
        updatedAt: (item as any).updated_at,
      }));
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        entryId,
        operation: 'Knowledge relationships fetch failed',
      });
      throw ragError;
    }
  }

  /**
   * Get user's query history and intelligence
   */
  static async getQueryHistory(limit = 20): Promise<QueryIntelligence[]> {
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

      return data.map((item: unknown) => ({
        id: (item as any).id,
        userId: (item as any).user_id,
        originalQuery: (item as any).original_query,
        processedQuery: (item as any).processed_query,
        queryIntent: (item as any).query_intent,
        queryType: (item as any).query_type,
        entitiesDetected:
          ((item as any).entities_detected as Record<string, unknown>) || {},
        userContext:
          ((item as any).user_context as Record<string, unknown>) || {},
        sessionContext:
          ((item as any).session_context as Record<string, unknown>) || {},
        projectContext:
          ((item as any).project_context as Record<string, unknown>) || {},
        resultsReturned: (item as any).results_returned,
        userSatisfaction: (item as any).user_satisfaction,
        clickedResults: (item as any).clicked_results || [],
        createdAt: (item as any).created_at,
      }));
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        operation: 'Query history fetch failed',
      });
      throw ragError;
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
          // Additional analytics fields would be populated
        });
      }

      return { success: true };
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        satisfaction: feedback.satisfaction,
        operation: 'Feedback submission failed',
      });
      throw ragError;
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
      const totalSearches = data.length;
      const avgSatisfaction =
        data
          .filter((s: unknown) => (s as any).satisfaction_rating)
          .reduce(
            (sum: number, s: any) => sum + (s as any).satisfaction_rating,
            0,
          ) /
          data.filter((s: unknown) => (s as any).satisfaction_rating).length ||
        0;

      const avgResponseTime =
        data.reduce(
          (sum: number, s: any) => sum + ((s as any).response_time_ms || 0),
          0,
        ) / data.length || 0;

      const topQueries = data.reduce(
        (acc: any, search: any) => {
          acc[(search as any).query_text] =
            (acc[(search as any).query_text] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        totalSearches,
        avgSatisfaction: Math.round(avgSatisfaction * 100) / 100,
        avgResponseTime: Math.round(avgResponseTime),
        topQueries: Object.entries(topQueries)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 10)
          .map(([query, count]) => ({ query, count })),
        searchHistory: data.slice(0, 50), // Recent searches
      };
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        operation: 'Search analytics fetch failed',
      });
      throw ragError;
    }
  }

  /**
   * Extract knowledge from material descriptions and properties
   */
  static async extractMaterialKnowledge(
    materialId: string,
    forceReextraction = false,
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if already extracted recently
      if (!forceReextraction) {
        const { data: existingData } = await supabase
          .from('material_knowledge_extraction')
          .select('id')
          .eq('material_id', materialId)
          .gte(
            'created_at',
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          ) // 7 days
          .limit(1);

        if (existingData && existingData.length > 0) {
          console.log('Material knowledge already extracted recently');
          return {
            success: true,
            message: 'Knowledge already extracted recently',
          };
        }
      }

      // Trigger knowledge extraction via MIVAA
      const response = await mivaaApi.extractKnowledge({
        // Note: materialId may need to be converted to document_id or content
        document_id: materialId,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Knowledge extraction failed');
      }

      const data = response.data;

      return data;
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        materialId,
        operation: 'Material knowledge extraction failed',
      });
      throw ragError;
    }
  }

  /**
   * Validate extracted knowledge
   */
  static async validateKnowledge(
    extractionId: string,
    isValid: boolean,
    notes?: string,
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('material_knowledge_extraction')
        .update({
          validation_status: isValid ? 'approved' : 'rejected',
          validated_by: user.id,
          validation_notes: notes,
        })
        .eq('id', extractionId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      const ragError = ErrorHandler.handleError(error, {
        operation: 'Knowledge validation failed',
      });
      throw ragError;
    }
  }
}
