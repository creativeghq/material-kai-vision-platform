/**
 * Search Optimization Service
 * 
 * Optimizes search results using quality metrics and relevance scoring.
 */

import { BaseService } from './base/BaseService';
import { QualityDashboardService } from './QualityDashboardService';
import { supabase } from '@/integrations/supabase/client';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  relevance_score: number;
  quality_score: number;
  combined_score: number;
  metadata: Record<string, unknown>;
}

export interface OptimizedSearchRequest {
  workspace_id: string;
  query: string;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface OptimizedSearchResponse {
  results: SearchResult[];
  total_count: number;
  optimization_metrics: {
    average_relevance: number;
    average_quality: number;
    average_combined: number;
  };
  search_time_ms: number;
}

class SearchOptimizationServiceImpl extends BaseService {
  private qualityDashboardService: QualityDashboardService;

  constructor() {
    super({
      name: 'SearchOptimizationService',
      version: '1.0.0',
      environment: process.env.NODE_ENV as 'development' | 'production' | 'test' || 'development',
      enabled: true,
      timeout: 30000,
    });

    this.qualityDashboardService = QualityDashboardService.getInstance();
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    await this.qualityDashboardService.initialize();
  }

  /**
   * Health check for the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Verify quality dashboard service is healthy
    const health = await this.qualityDashboardService.getHealth();
    if (health.status !== 'healthy') {
      throw new Error('Quality Dashboard Service is not healthy');
    }
  }

  /**
   * Perform optimized search with quality-based ranking
   */
  async search(request: OptimizedSearchRequest): Promise<OptimizedSearchResponse> {
    return this.executeOperation(async () => {
      const startTime = Date.now();
      const limit = request.limit || 20;

      // Get quality metrics for scoring
      const metrics = await this.qualityDashboardService.getQualityMetrics(request.workspace_id);

      // Search for chunks matching the query
      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('workspace_id', request.workspace_id)
        .textSearch('content', request.query)
        .limit(limit * 2); // Fetch more to allow for filtering

      if (error) {
        throw new Error(`Search failed: ${error.message}`);
      }

      // Score and rank results
      const scoredResults: SearchResult[] = (chunks || [])
        .map(chunk => this.scoreSearchResult(chunk, request.query, metrics))
        .sort((a, b) => b.combined_score - a.combined_score)
        .slice(0, limit);

      // Calculate optimization metrics
      const avgRelevance = scoredResults.length > 0
        ? scoredResults.reduce((sum, r) => sum + r.relevance_score, 0) / scoredResults.length
        : 0;

      const avgQuality = scoredResults.length > 0
        ? scoredResults.reduce((sum, r) => sum + r.quality_score, 0) / scoredResults.length
        : 0;

      const avgCombined = scoredResults.length > 0
        ? scoredResults.reduce((sum, r) => sum + r.combined_score, 0) / scoredResults.length
        : 0;

      const searchTime = Date.now() - startTime;

      return {
        results: scoredResults,
        total_count: scoredResults.length,
        optimization_metrics: {
          average_relevance: avgRelevance,
          average_quality: avgQuality,
          average_combined: avgCombined,
        },
        search_time_ms: searchTime,
      };
    }, 'search');
  }

  /**
   * Get search suggestions based on quality data
   */
  async getSuggestions(workspaceId: string, query: string, limit: number = 5): Promise<string[]> {
    return this.executeOperation(async () => {
      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select('content')
        .eq('workspace_id', workspaceId)
        .textSearch('content', query)
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get suggestions: ${error.message}`);
      }

      // Extract unique terms from results
      const suggestions = new Set<string>();
      (chunks || []).forEach(chunk => {
        const words = chunk.content.split(/\s+/).slice(0, 5);
        words.forEach(word => {
          if (word.length > 3) {
            suggestions.add(word.toLowerCase());
          }
        });
      });

      return Array.from(suggestions).slice(0, limit);
    }, 'getSuggestions');
  }

  /**
   * Get related search results
   */
  async getRelatedResults(workspaceId: string, chunkId: string, limit: number = 5): Promise<SearchResult[]> {
    return this.executeOperation(async () => {
      // Get the original chunk
      const { data: originalChunk, error: chunkError } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('id', chunkId)
        .single();

      if (chunkError || !originalChunk) {
        throw new Error('Chunk not found');
      }

      // Get quality metrics
      const metrics = await this.qualityDashboardService.getQualityMetrics(workspaceId);

      // Find related chunks
      const { data: relatedChunks, error } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .neq('id', chunkId)
        .textSearch('content', originalChunk.content.split(/\s+/).slice(0, 5).join(' '))
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get related results: ${error.message}`);
      }

      return (relatedChunks || []).map(chunk =>
        this.scoreSearchResult(chunk, originalChunk.content, metrics)
      );
    }, 'getRelatedResults');
  }

  /**
   * Private helper methods
   */

  private scoreSearchResult(chunk: any, query: string, metrics: any): SearchResult {
    // Calculate relevance score based on text similarity
    const relevanceScore = this.calculateRelevance(chunk.content, query);

    // Calculate quality score based on metrics
    const qualityScore = this.calculateQualityScore(metrics);

    // Combined score (weighted average)
    const combinedScore = relevanceScore * 0.6 + qualityScore * 0.4;

    return {
      id: chunk.id,
      title: chunk.title || 'Untitled',
      content: chunk.content.substring(0, 200),
      relevance_score: relevanceScore,
      quality_score: qualityScore,
      combined_score: combinedScore,
      metadata: chunk.metadata || {},
    };
  }

  private calculateRelevance(content: string, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    let matches = 0;
    queryTerms.forEach(term => {
      if (contentLower.includes(term)) {
        matches++;
      }
    });

    return Math.min(matches / queryTerms.length, 1);
  }

  private calculateQualityScore(metrics: any): number {
    // Weighted quality score
    const imageWeight = 0.3;
    const enrichmentWeight = 0.35;
    const validationWeight = 0.35;

    return (
      (metrics.average_image_quality_score || 0) * imageWeight +
      (metrics.average_enrichment_score || 0) * enrichmentWeight +
      (metrics.validation_pass_rate || 0) * validationWeight
    );
  }
}

export const SearchOptimizationService = SearchOptimizationServiceImpl;

