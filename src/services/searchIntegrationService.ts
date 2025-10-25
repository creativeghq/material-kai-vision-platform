/**
 * Search Integration Service
 * 
 * Unified service that integrates all search types:
 * - Semantic search (text embeddings)
 * - Visual search (CLIP embeddings)
 * - Multimodal search (combined embeddings)
 * - Multi-vector search (all 6 embedding types)
 * - Hybrid search (semantic + keyword)
 * - Material search (properties-based)
 */

import { supabase } from '@/integrations/supabase/client';
import { MultiVectorSearchService, type MultiVectorSearchQuery, type SearchResponse } from './multiVectorSearchService';

export interface SearchRequest {
  query?: string;
  imageUrl?: string;
  imageData?: string;
  searchType: 'semantic' | 'visual' | 'multimodal' | 'multi-vector' | 'hybrid' | 'material';
  limit?: number;
  threshold?: number;
  filters?: Record<string, any>;
  workspace_id?: string;
}

export interface SearchResult {
  id: string;
  type: 'product' | 'chunk' | 'image';
  name?: string;
  title?: string;
  description?: string;
  content?: string;
  imageUrl?: string;
  similarity: number;
  confidence: number;
  metadata?: Record<string, any>;
  source?: string;
}

export class SearchIntegrationService {
  private static instance: SearchIntegrationService;

  private constructor() {}

  static getInstance(): SearchIntegrationService {
    if (!SearchIntegrationService.instance) {
      SearchIntegrationService.instance = new SearchIntegrationService();
    }
    return SearchIntegrationService.instance;
  }

  /**
   * Perform unified search across all types
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const startTime = Date.now();
    console.log(`🔍 Performing ${request.searchType} search:`, request.query || request.imageUrl);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const workspaceId = request.workspace_id || user?.id || 'default';

      // Route to appropriate search method
      switch (request.searchType) {
        case 'semantic':
          return await this.semanticSearch(request.query || '', request.limit || 20, workspaceId);
        case 'visual':
          return await this.visualSearch(request.imageUrl || request.imageData || '', request.limit || 20, workspaceId);
        case 'multimodal':
          return await this.multimodalSearch(request, workspaceId);
        case 'multi-vector':
          return await this.multiVectorSearch(request, workspaceId);
        case 'hybrid':
          return await this.hybridSearch(request, workspaceId);
        case 'material':
          return await this.materialSearch(request.query || '', request.limit || 20, workspaceId);
        default:
          throw new Error(`Unknown search type: ${request.searchType}`);
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      throw error;
    }
  }

  /**
   * Semantic search using text embeddings
   */
  private async semanticSearch(query: string, limit: number, workspaceId: string): Promise<SearchResult[]> {
    try {
      console.log(`📝 Semantic search for: ${query}`);

      const response = await MultiVectorSearchService.search({
        text: query,
        options: {
          maxResults: limit,
          searchType: 'all',
          similarityThreshold: 0.7,
        },
      });

      return this.formatResults(response.results);
    } catch (error) {
      console.error('❌ Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Visual search using CLIP embeddings
   */
  private async visualSearch(imageSource: string, limit: number, workspaceId: string): Promise<SearchResult[]> {
    try {
      console.log(`🖼️ Visual search for image`);

      const response = await MultiVectorSearchService.search({
        imageUrl: imageSource.startsWith('http') ? imageSource : undefined,
        imageData: !imageSource.startsWith('http') ? imageSource : undefined,
        options: {
          maxResults: limit,
          searchType: 'all',
          similarityThreshold: 0.7,
        },
      });

      return this.formatResults(response.results);
    } catch (error) {
      console.error('❌ Visual search failed:', error);
      return [];
    }
  }

  /**
   * Multimodal search combining text and image
   */
  private async multimodalSearch(request: SearchRequest, workspaceId: string): Promise<SearchResult[]> {
    try {
      console.log(`🎨 Multimodal search`);

      const response = await MultiVectorSearchService.search({
        text: request.query,
        imageUrl: request.imageUrl,
        imageData: request.imageData,
        weights: {
          text: 0.4,
          visual: 0.4,
          multimodal: 0.2,
        },
        options: {
          maxResults: request.limit || 20,
          searchType: 'all',
          similarityThreshold: request.threshold || 0.7,
        },
      });

      return this.formatResults(response.results);
    } catch (error) {
      console.error('❌ Multimodal search failed:', error);
      return [];
    }
  }

  /**
   * Multi-vector search using all 6 embedding types
   */
  private async multiVectorSearch(request: SearchRequest, workspaceId: string): Promise<SearchResult[]> {
    try {
      console.log(`🔀 Multi-vector search`);

      const query: MultiVectorSearchQuery = {
        text: request.query,
        imageUrl: request.imageUrl,
        imageData: request.imageData,
        weights: {
          text: 0.25,
          visual: 0.25,
          multimodal: 0.20,
          color: 0.10,
          texture: 0.10,
          application: 0.10,
        },
        options: {
          maxResults: request.limit || 20,
          searchType: 'all',
          similarityThreshold: request.threshold || 0.7,
        },
      };

      const response = await MultiVectorSearchService.search(query);
      return this.formatResults(response.results);
    } catch (error) {
      console.error('❌ Multi-vector search failed:', error);
      return [];
    }
  }

  /**
   * Hybrid search combining semantic and keyword
   */
  private async hybridSearch(request: SearchRequest, workspaceId: string): Promise<SearchResult[]> {
    try {
      console.log(`🔗 Hybrid search`);

      const response = await MultiVectorSearchService.search({
        text: request.query,
        options: {
          maxResults: request.limit || 20,
          searchType: 'all',
          similarityThreshold: request.threshold || 0.7,
          enableHybridSearch: true,
        },
      });

      return this.formatResults(response.results);
    } catch (error) {
      console.error('❌ Hybrid search failed:', error);
      return [];
    }
  }

  /**
   * Material search using properties
   */
  private async materialSearch(query: string, limit: number, workspaceId: string): Promise<SearchResult[]> {
    try {
      console.log(`🏭 Material search for: ${query}`);

      const response = await MultiVectorSearchService.search({
        text: query,
        options: {
          maxResults: limit,
          searchType: 'products',
          similarityThreshold: 0.7,
        },
      });

      return this.formatResults(response.results);
    } catch (error) {
      console.error('❌ Material search failed:', error);
      return [];
    }
  }

  /**
   * Format search results
   */
  private formatResults(results: any[]): SearchResult[] {
    return results.map(result => ({
      id: result.id,
      type: result.type,
      name: result.name,
      title: result.title,
      description: result.description,
      content: result.content,
      imageUrl: result.imageUrl,
      similarity: result.similarity?.overall || result.similarity_score || 0,
      confidence: result.confidence || result.confidence_score || 0,
      metadata: result.metadata,
      source: result.type,
    }));
  }
}

export const searchIntegrationService = SearchIntegrationService.getInstance();

