import { BaseService } from './base/BaseService';
import { EmbeddingGenerationService, EmbeddingInput } from './embeddingGenerationService';

/**
 * Boundary Detection Result
 */
export interface BoundaryDetectionResult {
  chunk_id: string;
  chunk_text: string;
  boundary_score: number; // 0-1 confidence that this is a good boundary
  boundary_type: 'sentence' | 'paragraph' | 'section' | 'semantic' | 'weak';
  semantic_similarity: number; // Similarity to next chunk
  is_product_boundary: boolean; // Whether this marks a product boundary
  reasoning: string;
}

/**
 * Cluster Result
 */
export interface ClusterResult {
  cluster_id: number;
  chunk_ids: string[];
  centroid: number[];
  coherence: number; // 0-1 cluster quality score
  size: number;
  is_product_cluster: boolean;
}

/**
 * Boundary Detection Request
 */
export interface DetectBoundariesRequest {
  chunks: Array<{
    id: string;
    text: string;
    page_number?: number;
  }>;
  min_boundary_score?: number;
  clustering_enabled?: boolean;
  num_clusters?: number;
}

/**
 * BoundaryDetectionService
 * Detects semantic boundaries between chunks using embeddings and clustering
 * Primary: OpenAI text-embedding-3-small
 * Fallback: Llama-3.2-90B
 */
export class BoundaryDetectionService extends BaseService {
  private embeddingService: EmbeddingGenerationService;
  private embeddings: Map<string, number[]> = new Map();
  private clusteringMethod: 'kmeans' | 'hierarchical' | 'dbscan' = 'kmeans';

  constructor() {
    super({
      name: 'BoundaryDetectionService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
    });

    this.embeddingService = new EmbeddingGenerationService({
      embedding: {
        primary: {
          name: 'text-embedding-3-small',
          provider: 'openai',
          dimensions: 1536,
          maxTokens: 8191,
          costPerToken: 0.0001,
          normalization: 'l2',
          batchSize: 100,
        },
        fallback: [],
        textPreprocessing: {
          maxLength: 8000,
          truncateStrategy: 'tail',
          normalization: {
            lowercase: false,
            removeSpecialChars: false,
            removeExtraWhitespace: true,
            removeNewlines: false,
          },
        },
        caching: {
          enabled: true,
          ttl: 86400,
          keyStrategy: 'content-model-hash',
        },
        validation: {
          minTextLength: 1,
          maxTextLength: 8000,
          validateDimensions: true,
          validateNormalization: true,
        },
      },
      mivaa: {
        gatewayUrl: process.env.MIVAA_GATEWAY_URL || '',
        apiKey: process.env.MIVAA_API_KEY || '',
      },
      batch: {
        maxSize: 100,
        maxWaitTime: 5000,
        concurrency: 5,
      },
      cache: {
        enabled: true,
        ttl: 86400000, // 24 hours
        maxSize: 10000,
      },
      rateLimit: {
        requestsPerMinute: 3000,
        tokensPerMinute: 1000000,
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
      },
    });
  }

  /**
   * Detect boundaries in chunks
   */
  async detectBoundaries(
    request: DetectBoundariesRequest,
  ): Promise<BoundaryDetectionResult[]> {
    const startTime = Date.now();

    try {
      // Generate embeddings for all chunks
      const embeddingInputs: EmbeddingInput[] = request.chunks.map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        metadata: { page_number: chunk.page_number },
      }));

      const embeddingResults = await this.embeddingService.generateBatchEmbeddings(
        embeddingInputs,
      );

      // Store embeddings
      for (const result of embeddingResults.successful) {
        this.embeddings.set(result.id, result.embedding);
      }

      // Calculate boundary scores
      const results: BoundaryDetectionResult[] = [];
      for (let i = 0; i < request.chunks.length; i++) {
        const chunk = request.chunks[i];
        const embedding = this.embeddings.get(chunk.id);

        if (!embedding) {
          continue;
        }

        // Calculate boundary score
        const boundaryScore = this.calculateBoundaryScore(chunk.text);

        // Calculate semantic similarity to next chunk
        let semanticSimilarity = 0;
        if (i < request.chunks.length - 1) {
          const nextChunk = request.chunks[i + 1];
          const nextEmbedding = this.embeddings.get(nextChunk.id);
          if (nextEmbedding) {
            semanticSimilarity = this.cosineSimilarity(embedding, nextEmbedding);
          }
        }

        // Determine boundary type
        const boundaryType = this.determineBoundaryType(
          chunk.text,
          boundaryScore,
          semanticSimilarity,
        );

        // Determine if this is a product boundary
        const isProductBoundary = this.isProductBoundary(
          chunk.text,
          boundaryScore,
          semanticSimilarity,
        );

        results.push({
          chunk_id: chunk.id,
          chunk_text: chunk.text,
          boundary_score: boundaryScore,
          boundary_type: boundaryType,
          semantic_similarity: semanticSimilarity,
          is_product_boundary: isProductBoundary,
          reasoning: this.generateReasoning(
            boundaryScore,
            boundaryType,
            semanticSimilarity,
          ),
        });
      }

      // Perform clustering if enabled
      if (request.clustering_enabled) {
        const clusters = await this.performClustering(
          request.chunks,
          request.num_clusters,
        );
        this.logger.info(`Detected ${clusters.length} clusters`);
      }

      this.logger.info(
        `Boundary detection completed in ${Date.now() - startTime}ms`,
      );
      return results;
    } catch (error) {
      this.logger.error('Boundary detection error:', error);
      throw error;
    }
  }

  /**
   * Calculate boundary score based on text characteristics
   */
  private calculateBoundaryScore(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    let score = 0.3; // Base score

    // Sentence boundary (most important)
    if (/[.!?]\s*$/.test(trimmed)) {
      score += 0.4;
    } else if (/[,;:]\s*$/.test(trimmed)) {
      score += 0.15;
    }

    // Paragraph boundary
    if (/\n\s*$/.test(text)) {
      score += 0.2;
    }

    // Section/heading boundary
    const lastLine = trimmed.split('\n').pop() || '';
    if (/^#+\s+/.test(lastLine) || /^[A-Z][A-Z\s]+$/.test(lastLine)) {
      score += 0.15;
    }

    // Penalize mid-word breaks
    if (/\w$/.test(trimmed) && !/[.!?,;:\s]$/.test(trimmed)) {
      score -= 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Determine boundary type
   */
  private determineBoundaryType(
    text: string,
    boundaryScore: number,
    semanticSimilarity: number,
  ): 'sentence' | 'paragraph' | 'section' | 'semantic' | 'weak' {
    if (boundaryScore < 0.3) return 'weak';
    if (/^#+\s+/.test(text.trim())) return 'section';
    if (/\n\s*$/.test(text)) return 'paragraph';
    if (/[.!?]\s*$/.test(text.trim())) return 'sentence';
    if (semanticSimilarity < 0.5) return 'semantic';
    return 'weak';
  }

  /**
   * Determine if this is a product boundary
   */
  private isProductBoundary(
    text: string,
    boundaryScore: number,
    semanticSimilarity: number,
  ): boolean {
    // High boundary score + low semantic similarity = likely product boundary
    return boundaryScore > 0.6 && semanticSimilarity < 0.6;
  }

  /**
   * Generate reasoning for boundary detection
   */
  private generateReasoning(
    boundaryScore: number,
    boundaryType: string,
    semanticSimilarity: number,
  ): string {
    const parts: string[] = [];

    if (boundaryScore > 0.7) {
      parts.push('Strong boundary marker');
    } else if (boundaryScore > 0.4) {
      parts.push('Moderate boundary marker');
    } else {
      parts.push('Weak boundary marker');
    }

    if (semanticSimilarity < 0.5) {
      parts.push('Low semantic similarity to next chunk');
    } else if (semanticSimilarity > 0.8) {
      parts.push('High semantic similarity to next chunk');
    }

    return parts.join('; ');
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Perform clustering on chunks
   */
  private async performClustering(
    chunks: Array<{ id: string; text: string }>,
    numClusters?: number,
  ): Promise<ClusterResult[]> {
    const k = numClusters || Math.min(5, Math.ceil(Math.sqrt(chunks.length)));
    const embeddings = Array.from(this.embeddings.values());

    if (embeddings.length < 2) {
      return [];
    }

    // Simple K-means clustering
    return this.performKMeansClustering(embeddings, k, chunks);
  }

  /**
   * K-means clustering implementation
   */
  private performKMeansClustering(
    embeddings: number[][],
    k: number,
    chunks: Array<{ id: string; text: string }>,
  ): ClusterResult[] {
    // Initialize centroids randomly
    const centroids: number[][] = [];
    for (let i = 0; i < k; i++) {
      const randomIdx = Math.floor(Math.random() * embeddings.length);
      centroids.push([...embeddings[randomIdx]]);
    }

    // Assign points to clusters
    const assignments = new Array(embeddings.length).fill(0);
    for (let i = 0; i < embeddings.length; i++) {
      let minDist = Infinity;
      let bestCluster = 0;

      for (let j = 0; j < centroids.length; j++) {
        const dist = this.euclideanDistance(embeddings[i], centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = j;
        }
      }

      assignments[i] = bestCluster;
    }

    // Build cluster results
    const clusterMap = new Map<number, number[]>();
    assignments.forEach((cluster, idx) => {
      if (!clusterMap.has(cluster)) {
        clusterMap.set(cluster, []);
      }
      clusterMap.get(cluster)!.push(idx);
    });

    return Array.from(clusterMap.entries()).map(([id, indices]) => ({
      cluster_id: id,
      chunk_ids: indices.map((i) => chunks[i].id),
      centroid: centroids[id],
      coherence: this.calculateClusterCoherence(
        indices.map((i) => embeddings[i]),
        centroids[id],
      ),
      size: indices.length,
      is_product_cluster: indices.length > 2,
    }));
  }

  /**
   * Euclidean distance between two vectors
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * Calculate cluster coherence
   */
  private calculateClusterCoherence(
    embeddings: number[][],
    centroid: number[],
  ): number {
    if (embeddings.length === 0) return 0;

    const distances = embeddings.map((e) =>
      this.euclideanDistance(e, centroid),
    );
    const avgDistance =
      distances.reduce((a, b) => a + b, 0) / distances.length;

    // Normalize to 0-1 range (lower distance = higher coherence)
    return Math.max(0, 1 - avgDistance / 10);
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    // EmbeddingGenerationService initializes automatically
  }

  /**
   * Health check for the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Verify embedding service is healthy
    if (!this.embeddingService) {
      throw new Error('Embedding service not initialized');
    }
  }
}

// Export singleton instance
export const boundaryDetectionService = new BoundaryDetectionService();

