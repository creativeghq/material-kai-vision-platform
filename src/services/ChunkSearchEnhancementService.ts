/**
 * Chunk Search Enhancement Service
 * Integrates chunk analysis data (classifications, boundaries, validation scores)
 * into search results for improved relevance and filtering
 */

import { supabase } from '@/integrations/supabase/client';
import { BaseService } from './base/BaseService';
import {
  ChunkClassification,
  ChunkBoundary,
  ChunkValidationScore,
  ContentType,
  BoundaryType,
  ValidationStatus,
} from '@/types/chunk-analysis';

export interface EnhancedSearchResult {
  chunkId: string;
  content: string;
  classification?: ChunkClassification;
  boundaries?: ChunkBoundary[];
  validationScore?: ChunkValidationScore;
  relevanceScore: number;
  contentTypeMatch: boolean;
  boundaryQuality: number;
  validationStatus: ValidationStatus;
  overallQuality: number;
}

export interface ChunkSearchFilters {
  contentTypes?: ContentType[];
  boundaryTypes?: BoundaryType[];
  validationStatus?: ValidationStatus[];
  minConfidence?: number;
  minValidationScore?: number;
  minBoundaryQuality?: number;
  onlyValidated?: boolean;
}

export interface ChunkSearchRequest {
  query: string;
  workspaceId: string;
  filters?: ChunkSearchFilters;
  limit?: number;
  offset?: number;
}

export interface ChunkSearchResponse {
  results: EnhancedSearchResult[];
  total: number;
  processingTime: number;
  appliedFilters: ChunkSearchFilters;
}

/**
 * ChunkSearchEnhancementService
 * Enhances search results with chunk analysis data for better relevance
 */
export class ChunkSearchEnhancementService extends BaseService {
  constructor() {
    super({
      name: 'ChunkSearchEnhancementService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
    });
  }

  /**
   * Search chunks with analysis data
   */
  async searchChunks(request: ChunkSearchRequest): Promise<ChunkSearchResponse> {
    const startTime = performance.now();

    try {
      this.logger.info(`Searching chunks: ${request.query}`);

      // Step 1: Get base search results from document_chunks
      let query = supabase
        .from('document_chunks')
        .select(
          `
          id,
          content,
          workspace_id,
          created_at,
          chunk_classifications (
            id,
            content_type,
            confidence,
            reasoning,
            sub_categories
          ),
          chunk_boundaries (
            id,
            boundary_type,
            boundary_score,
            is_product_boundary
          ),
          chunk_validation_scores (
            id,
            overall_validation_score,
            validation_status,
            content_quality_score,
            boundary_quality_score
          )
        `
        )
        .eq('workspace_id', request.workspaceId)
        .textSearch('content', request.query);

      // Step 2: Apply filters
      if (request.filters?.contentTypes?.length) {
        query = query.in('chunk_classifications.content_type', request.filters.contentTypes);
      }

      if (request.filters?.validationStatus?.length) {
        query = query.in('chunk_validation_scores.validation_status', request.filters.validationStatus);
      }

      if (request.filters?.minConfidence) {
        query = query.gte('chunk_classifications.confidence', request.filters.minConfidence);
      }

      if (request.filters?.minValidationScore) {
        query = query.gte('chunk_validation_scores.overall_validation_score', request.filters.minValidationScore);
      }

      // Step 3: Apply pagination
      const limit = request.limit || 20;
      const offset = request.offset || 0;
      query = query.range(offset, offset + limit - 1);

      // Step 4: Execute query
      const { data, error, count } = await query;

      if (error) {
        this.logger.error(`Search failed: ${error.message}`);
        throw error;
      }

      // Step 5: Enhance results with analysis data
      const enhancedResults = (data || []).map((chunk: any) => this.enhanceChunkResult(chunk, request.filters));

      // Step 6: Sort by overall quality
      enhancedResults.sort((a, b) => b.overallQuality - a.overallQuality);

      const processingTime = performance.now() - startTime;

      return {
        results: enhancedResults,
        total: count || 0,
        processingTime,
        appliedFilters: request.filters || {},
      };
    } catch (error) {
      this.logger.error(`Search error: ${error}`);
      throw error;
    }
  }

  /**
   * Get chunks by content type
   */
  async getChunksByContentType(
    workspaceId: string,
    contentType: ContentType,
    limit = 20
  ): Promise<EnhancedSearchResult[]> {
    try {
      const { data, error } = await supabase
        .from('chunk_classifications')
        .select(
          `
          chunk_id,
          content_type,
          confidence,
          document_chunks (
            id,
            content,
            chunk_boundaries (
              boundary_type,
              boundary_score
            ),
            chunk_validation_scores (
              overall_validation_score,
              validation_status
            )
          )
        `
        )
        .eq('workspace_id', workspaceId)
        .eq('content_type', contentType)
        .limit(limit);

      if (error) throw error;

      return (data || []).map((item: any) => this.enhanceChunkResult(item.document_chunks, {}));
    } catch (error) {
      this.logger.error(`Failed to get chunks by content type: ${error}`);
      throw error;
    }
  }

  /**
   * Get product boundaries
   */
  async getProductBoundaries(workspaceId: string, limit = 20): Promise<ChunkBoundary[]> {
    try {
      const { data, error } = await supabase
        .from('chunk_boundaries')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_product_boundary', true)
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error(`Failed to get product boundaries: ${error}`);
      throw error;
    }
  }

  /**
   * Get chunks needing review
   */
  async getChunksNeedingReview(workspaceId: string, limit = 20): Promise<EnhancedSearchResult[]> {
    try {
      const { data, error } = await supabase
        .from('chunk_validation_scores')
        .select(
          `
          chunk_id,
          validation_status,
          overall_validation_score,
          document_chunks (
            id,
            content,
            chunk_classifications (
              content_type,
              confidence
            ),
            chunk_boundaries (
              boundary_type,
              boundary_score
            )
          )
        `
        )
        .eq('workspace_id', workspaceId)
        .eq('validation_status', 'needs_review')
        .limit(limit);

      if (error) throw error;

      return (data || []).map((item: any) => this.enhanceChunkResult(item.document_chunks, {}));
    } catch (error) {
      this.logger.error(`Failed to get chunks needing review: ${error}`);
      throw error;
    }
  }

  /**
   * Enhance chunk result with analysis data
   */
  private enhanceChunkResult(chunk: any, filters?: ChunkSearchFilters): EnhancedSearchResult {
    const classification = chunk.chunk_classifications?.[0];
    const boundary = chunk.chunk_boundaries?.[0];
    const validation = chunk.chunk_validation_scores?.[0];

    const contentTypeMatch = !filters?.contentTypes || filters.contentTypes.includes(classification?.content_type);
    const boundaryQuality = boundary?.boundary_score || 0.5;
    const validationStatus = validation?.validation_status || 'pending';
    const validationScore = validation?.overall_validation_score || 0.5;

    // Calculate overall quality score
    const overallQuality =
      (classification?.confidence || 0) * 0.4 +
      boundaryQuality * 0.3 +
      validationScore * 0.3;

    return {
      chunkId: chunk.id,
      content: chunk.content,
      classification,
      boundaries: chunk.chunk_boundaries || [],
      validationScore: validation,
      relevanceScore: classification?.confidence || 0,
      contentTypeMatch,
      boundaryQuality,
      validationStatus,
      overallQuality,
    };
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    // Service is ready after construction
  }

  /**
   * Health check for the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Verify database connectivity by checking if we can query
    const { error } = await supabase
      .from('document_chunks')
      .select('id')
      .limit(1);

    if (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  }
}

export const chunkSearchEnhancementService = new ChunkSearchEnhancementService();

