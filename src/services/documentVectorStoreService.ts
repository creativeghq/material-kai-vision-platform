/**
 * Document Vector Store Service
 * Handles vector storage and retrieval operations for RAG document processing
 * Integrates with EmbeddingGenerationService and Supabase vector operations
 */

import { performance } from 'perf_hooks';

import { supabase } from '@/integrations/supabase/client';

import { AppError } from '../utils/errorHandler';

import { EmbeddingGenerationService } from './embeddingGenerationService';
import { DEFAULT_EMBEDDING_CONFIG } from '../config/embeddingConfig';
import { unifiedTextPreprocessor } from './textPreprocessor';

/**
 * Document chunk interface for vector storage
 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  workspaceId: string;
  content: string;
  chunkIndex: number;
  metadata: {
    pageNumber?: number;
    section?: string;
    title?: string;
    source?: string;
    processingStage?: string;
    [key: string]: unknown;
  };
}

/**
 * Vector store entry interface
 */
export interface VectorStoreEntry {
  id: string;
  documentId: string;
  workspaceId: string;
  chunkId: string;
  embedding: number[];
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Batch storage request interface
 */
export interface BatchStoreRequest {
  chunks: DocumentChunk[];
  workspaceId: string;
  documentId: string;
  options?: {
    batchSize?: number;
    skipExisting?: boolean;
    updateMetadata?: boolean;
  };
}

/**
 * Batch storage result interface
 */
export interface BatchStoreResult {
  successful: Array<{
    chunkId: string;
    vectorId: string;
    embedding: number[];
  }>;
  failed: Array<{
    chunkId: string;
    error: string;
    chunk: DocumentChunk;
  }>;
  metrics: {
    totalProcessed: number;
    successRate: number;
    processingTime: number;
    embeddingTime: number;
    storageTime: number;
    skipped: number;
  };
}

/**
 * Search request interface
 */
export interface DocumentSearchRequest {
  query: string;
  workspaceId: string;
  documentIds?: string[];
  limit?: number;
  threshold?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Search result interface
 */
export interface DocumentSearchResult {
  id: string;
  documentId: string;
  chunkId: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

/**
 * Search response interface
 */
export interface DocumentSearchResponse {
  results: DocumentSearchResult[];
  query: string;
  totalMatches: number;
  processingTime: number;
  searchMetadata: {
    embeddingTime: number;
    searchTime: number;
    threshold: number;
    workspaceId: string;
  };
}

/**
 * Service configuration interface
 */
export interface DocumentVectorStoreConfig {
  embedding: {
    model: string;
    dimensions: number;
    batchSize: number;
  };
  storage: {
    tableName: string;
    indexName: string;
    batchSize: number;
  };
  search: {
    defaultLimit: number;
    defaultThreshold: number;
    maxLimit: number;
  };
}

/**
 * Document Vector Store Service
 * Provides enterprise-grade vector storage and search capabilities for RAG documents
 */
export class DocumentVectorStoreService {
  private readonly config: DocumentVectorStoreConfig;
  private readonly embeddingService: EmbeddingGenerationService;
  private readonly metrics = {
    totalStored: 0,
    totalSearches: 0,
    averageStorageTime: 0,
    averageSearchTime: 0,
    cacheHits: 0,
    errors: 0,
  };

  constructor(
    config: DocumentVectorStoreConfig,
    embeddingService: EmbeddingGenerationService,
  ) {
    this.config = config;
    this.embeddingService = embeddingService;

    console.log('DocumentVectorStoreService initialized', {
      embeddingModel: config.embedding.model,
      dimensions: config.embedding.dimensions,
      tableName: config.storage.tableName,
    });
  }

  /**
   * Store document chunks with embeddings in batch
   */
  async storeBatch(request: BatchStoreRequest): Promise<BatchStoreResult> {
    const startTime = performance.now();
    const successful: BatchStoreResult['successful'] = [];
    const failed: BatchStoreResult['failed'] = [];
    let embeddingTime = 0;
    let storageTime = 0;
    let skipped = 0;

    console.log('Starting batch vector storage', {
      documentId: request.documentId,
      workspaceId: request.workspaceId,
      chunkCount: request.chunks.length,
      batchSize: request.options?.batchSize || this.config.embedding.batchSize,
    });

    try {
      // Check for existing entries if skipExisting is enabled
      let existingChunks: Set<string> = new Set();
      if (request.options?.skipExisting) {
        existingChunks = await this.getExistingChunkIds(
          request.documentId,
          request.workspaceId,
        );
      }

      // Filter out existing chunks
      const chunksToProcess = request.chunks.filter(chunk => {
        if (existingChunks.has(chunk.id)) {
          skipped++;
          return false;
        }
        return true;
      });

      if (chunksToProcess.length === 0) {
        console.log('All chunks already exist, skipping processing', {
          documentId: request.documentId,
          totalChunks: request.chunks.length,
          skipped,
        });

        return {
          successful: [],
          failed: [],
          metrics: {
            totalProcessed: 0,
            successRate: 1,
            processingTime: performance.now() - startTime,
            embeddingTime: 0,
            storageTime: 0,
            skipped,
          },
        };
      }

      // Process chunks in batches
      const batchSize = request.options?.batchSize || this.config.embedding.batchSize;
      const batches = this.chunkArray(chunksToProcess, batchSize);

      for (const batch of batches) {
        try {
          // Generate embeddings for batch
          const embeddingStart = performance.now();
          // Generate embeddings for each text in the batch using unified config
          const embeddingPromises = batch.map(async chunk => {
            const preprocessedText = await unifiedTextPreprocessor.preprocessForEmbedding(chunk.content);
            return this.embeddingService.generateEmbedding({
              id: chunk.id,
              text: preprocessedText,
            });
          });

          const embeddingResponses = await Promise.all(embeddingPromises);
          embeddingTime += performance.now() - embeddingStart;

          // Store vectors in database
          const storageStart = performance.now();
          const vectorEntries = embeddingResponses.map((embeddingResponse: { embedding: number[]; model?: string; dimensions?: number }, index: number) => {
            const chunk = batch[index];
            if (!chunk) {
              throw new Error(`Missing chunk at index ${index} for embedding batch`);
            }
            if (!embeddingResponse || !embeddingResponse.embedding) {
              throw new Error(`Failed to generate embedding for chunk ${index}`);
            }
            return {
              id: `${chunk.documentId}_${chunk.id}`,
              document_id: chunk.documentId,
              workspace_id: chunk.workspaceId,
              chunk_id: chunk.id,
              embedding: embeddingResponse.embedding,
              content: chunk.content,
              metadata: {
                ...chunk.metadata,
                chunkIndex: chunk.chunkIndex,
                embeddingModel: embeddingResponse.model || DEFAULT_EMBEDDING_CONFIG.primary.name,
                dimensions: embeddingResponse.dimensions || DEFAULT_EMBEDDING_CONFIG.primary.dimensions,
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          });

          // Insert into Supabase
          const { data: insertedData, error: insertError } = await supabase
            .from(this.config.storage.tableName as never)
            .insert(vectorEntries as never)
            .select('id, chunk_id, embedding');

          storageTime += performance.now() - storageStart;

          if (insertError) {
            const error = new AppError(
              `Failed to insert vector batch: ${insertError.message}`,
              500,
            );

            console.error('DocumentVectorStoreService.storeBatch:', error.message);

            // Add all batch items to failed
            batch.forEach(chunk => {
              failed.push({
                chunkId: chunk.id,
                error: error.message,
                chunk,
              });
            });
          } else {
            // Add successful items
            insertedData?.forEach((item: Record<string, unknown>) => {
              if (item && typeof item === 'object' && 'chunk_id' in item && 'id' in item && 'embedding' in item) {
                successful.push({
                  chunkId: item.chunk_id as string,
                  vectorId: item.id as string,
                  embedding: item.embedding as number[],
                });
              }
            });

            // Add failed embedding generations
            // Handle any failed embeddings if needed
            // Check if any embeddings failed to generate
            const failedEmbeddings = embeddingResponses.filter((response: { embedding?: number[] }) => !response || !response.embedding);
            if (failedEmbeddings.length > 0) {
              // Log warning about empty embedding response
              console.warn('Empty embedding response received', {
                batchSize: batch.length,
                documentId: request.documentId,
              });
            }
          }

        } catch (error) {
          console.error('Batch processing failed', {
            error: error instanceof Error ? error.message : String(error),
            batchSize: batch.length,
          });

          // Add all batch items to failed
          batch.forEach(chunk => {
            failed.push({
              chunkId: chunk.id,
              error: error instanceof Error ? error.message : String(error),
              chunk,
            });
          });
        }
      }

      // Update metrics
      this.metrics.totalStored += successful.length;
      this.updateAverageStorageTime(performance.now() - startTime);

      const result: BatchStoreResult = {
        successful,
        failed,
        metrics: {
          totalProcessed: chunksToProcess.length,
          successRate: successful.length / chunksToProcess.length,
          processingTime: performance.now() - startTime,
          embeddingTime,
          storageTime,
          skipped,
        },
      };

      console.log('Batch vector storage completed', {
        documentId: request.documentId,
        totalProcessed: chunksToProcess.length,
        successful: successful.length,
        failed: failed.length,
        skipped,
        processingTime: result.metrics.processingTime,
        successRate: result.metrics.successRate,
      });

      return result;

    } catch (error) {
      this.metrics.errors++;
      console.error('Batch storage operation failed', {
        documentId: request.documentId,
        error: error instanceof Error ? error.message : String(error),
        processingTime: performance.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Search for similar document chunks
   */
  async search(request: DocumentSearchRequest): Promise<DocumentSearchResponse> {
    const startTime = performance.now();
    let embeddingTime = 0;
    let searchTime = 0;

    try {
      console.log('Starting document vector search', {
        query: request.query.substring(0, 100),
        workspaceId: request.workspaceId,
        documentIds: request.documentIds?.length || 'all',
        limit: request.limit || this.config.search.defaultLimit,
      });

      // Generate query embedding using unified config
      const embeddingStart = performance.now();
      const preprocessedQuery = await unifiedTextPreprocessor.preprocessForRAG(request.query);
      const queryEmbeddingResponse = await this.embeddingService.generateEmbedding({
        id: `query_${Date.now()}`,
        text: preprocessedQuery,
      });

      const queryEmbedding = queryEmbeddingResponse.embedding;
      if (!queryEmbedding) {
        throw new AppError('Failed to generate query embedding', 500);
      }
      embeddingTime = performance.now() - embeddingStart;

      // Perform vector search via Supabase function
      const searchStart = performance.now();
      const { data, error } = await supabase.functions.invoke('document-vector-search', {
        body: {
          embedding: queryEmbedding,
          workspace_id: request.workspaceId,
          document_ids: request.documentIds,
          match_threshold: request.threshold || this.config.search.defaultThreshold,
          match_count: Math.min(
            request.limit || this.config.search.defaultLimit,
            this.config.search.maxLimit,
          ),
          metadata_filter: request.metadata,
        },
      });
      searchTime = performance.now() - searchStart;

      if (error) {
        throw new Error(`Vector search failed: ${error.message}`);
      }

      // Transform results
      const results: DocumentSearchResult[] = data.matches?.map((match: {
        id: string;
        document_id: string;
        chunk_id: string;
        content: string;
        similarity: number;
        metadata?: Record<string, unknown>;
        embedding?: number[];
      }) => ({
        id: match.id,
        documentId: match.document_id,
        chunkId: match.chunk_id,
        content: match.content,
        similarity: match.similarity,
        metadata: match.metadata || {},
        embedding: match.embedding,
      })) || [];

      // Update metrics
      this.metrics.totalSearches++;
      this.updateAverageSearchTime(performance.now() - startTime);

      const response: DocumentSearchResponse = {
        results,
        query: request.query,
        totalMatches: data.total_matches || results.length,
        processingTime: performance.now() - startTime,
        searchMetadata: {
          embeddingTime,
          searchTime,
          threshold: request.threshold || this.config.search.defaultThreshold,
          workspaceId: request.workspaceId,
        },
      };

      console.log('Document vector search completed', {
        query: request.query.substring(0, 100),
        resultsCount: results.length,
        totalMatches: response.totalMatches,
        processingTime: response.processingTime,
        embeddingTime,
        searchTime,
      });

      return response;

    } catch (error) {
      this.metrics.errors++;
      console.error('Document vector search failed', {
        query: request.query.substring(0, 100),
        workspaceId: request.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        processingTime: performance.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Delete document vectors from store
   */
  async deleteDocument(documentId: string, workspaceId: string): Promise<void> {
    try {
      console.log('Deleting document vectors', { documentId, workspaceId });

      const { error } = await supabase
        .from(this.config.storage.tableName as unknown as string)
        .delete()
        .eq('document_id', documentId)
        .eq('workspace_id', workspaceId);

      if (error) {
        throw new Error(`Failed to delete document vectors: ${error.message}`);
      }

      console.log('Document vectors deleted successfully', { documentId, workspaceId });

    } catch (error) {
      console.error('Failed to delete document vectors', {
        documentId,
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      embeddingServiceMetrics: {}, // getMetrics method not available on MivaaEmbeddingIntegration
    };
  }

  /**
   * Get existing chunk IDs for a document
   */
  private async getExistingChunkIds(documentId: string, workspaceId: string): Promise<Set<string>> {
    try {
      const { data, error } = await supabase
        .from(this.config.storage.tableName as unknown as string)
        .select('chunk_id')
        .eq('document_id', documentId)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.warn('Failed to fetch existing chunk IDs', {
          documentId,
          workspaceId,
          error: error.message,
        });
        return new Set();
      }

      return new Set(data?.map((item: any) => (item as Record<string, unknown>).chunk_id as string) || []);

    } catch (error) {
      console.warn('Error fetching existing chunk IDs', {
        documentId,
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Set();
    }
  }

  /**
   * Update average storage time metric
   */
  private updateAverageStorageTime(time: number): void {
    this.metrics.averageStorageTime =
      (this.metrics.averageStorageTime * (this.metrics.totalStored - 1) + time) / this.metrics.totalStored;
  }

  /**
   * Update average search time metric
   */
  private updateAverageSearchTime(time: number): void {
    this.metrics.averageSearchTime =
      (this.metrics.averageSearchTime * (this.metrics.totalSearches - 1) + time) / this.metrics.totalSearches;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

// Default configuration
export const defaultDocumentVectorStoreConfig: DocumentVectorStoreConfig = {
  embedding: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 10,
  },
  storage: {
    tableName: 'document_vectors',
    indexName: 'document_vectors_embedding_idx',
    batchSize: 50,
  },
  search: {
    defaultLimit: 10,
    defaultThreshold: 0.7,
    maxLimit: 100,
  },
};

// Export singleton instance factory
export const createDocumentVectorStoreService = (
  embeddingService: EmbeddingGenerationService,
  config: Partial<DocumentVectorStoreConfig> = {},
): DocumentVectorStoreService => {
  const finalConfig = { ...defaultDocumentVectorStoreConfig, ...config };
  return new DocumentVectorStoreService(finalConfig, embeddingService);
};
