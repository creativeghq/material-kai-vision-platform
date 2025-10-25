/**
 * Multi-Vector Generation Service
 *
 * Generates all 6 embedding types with optimization:
 * - Batch processing (10-50 items at once)
 * - Caching to avoid regeneration
 * - Retry logic with exponential backoff
 * - Metadata tracking
 * - Integration with real_embeddings_service.py
 */

import { supabase } from '@/integrations/supabase/client';

export interface EmbeddingResult {
  entityId: string;
  entityType: 'product' | 'chunk' | 'image';
  embeddings: {
    text_1536?: number[];
    visual_clip_512?: number[];
    multimodal_2048?: number[];
    color_256?: number[];
    texture_256?: number[];
    application_512?: number[];
  };
  metadata: {
    modelVersions: Record<string, string>;
    confidenceScores: Record<string, number>;
    generationTimesMs: Record<string, number>;
    generatedAt: string;
  };
  success: boolean;
  error?: string;
}

export interface BatchGenerationOptions {
  batchSize?: number;
  useCache?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
  timeout?: number;
}

export class MultiVectorGenerationService {
  private static instance: MultiVectorGenerationService;
  private cache: Map<string, EmbeddingResult> = new Map();
  private readonly DEFAULT_BATCH_SIZE = 20;
  private readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private readonly DEFAULT_RETRY_DELAY = 1000;
  private readonly DEFAULT_TIMEOUT = 30000;

  private constructor() {}

  static getInstance(): MultiVectorGenerationService {
    if (!MultiVectorGenerationService.instance) {
      MultiVectorGenerationService.instance = new MultiVectorGenerationService();
    }
    return MultiVectorGenerationService.instance;
  }

  /**
   * Batch generate embeddings for multiple products
   */
  async batchGenerateProductEmbeddings(
    products: any[],
    options: BatchGenerationOptions = {}
  ): Promise<EmbeddingResult[]> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      useCache = true,
      retryAttempts = this.DEFAULT_RETRY_ATTEMPTS,
    } = options;

    console.log(`🔄 Batch generating embeddings for ${products.length} products (batch size: ${batchSize})`);

    const results: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)}`);

      const batchResults = await Promise.allSettled(
        batch.map(product =>
          this.generateProductEmbeddings(product, {
            useCache,
            retryAttempts,
          })
        )
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`❌ Failed to generate embeddings for product ${batch[index].id}:`, result.reason);
          results.push({
            entityId: batch[index].id,
            entityType: 'product',
            embeddings: {},
            metadata: {
              modelVersions: {},
              confidenceScores: {},
              generationTimesMs: {},
              generatedAt: new Date().toISOString(),
            },
            success: false,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });
    }

    console.log(`✅ Batch generation complete: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * Generate embeddings for a single product
   */
  async generateProductEmbeddings(
    product: any,
    options: BatchGenerationOptions = {}
  ): Promise<EmbeddingResult> {
    const { useCache = true, retryAttempts = this.DEFAULT_RETRY_ATTEMPTS } = options;

    // Check cache
    if (useCache) {
      const cached = this.getCachedEmbedding(product.id);
      if (cached) {
        console.log(`💾 Using cached embeddings for product ${product.id}`);
        return cached;
      }
    }

    // Generate with retry
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const result = await this.callMivaaGateway('generate_embeddings', {
          entity_id: product.id,
          entity_type: 'product',
          text_content: product.description || product.name || '',
          image_url: product.image_url,
          material_properties: product.properties,
          embedding_types: ['text_1536', 'visual_clip_512', 'multimodal_2048', 'color_256', 'texture_256', 'application_512'],
        });

        if (result.success) {
          const embeddingResult: EmbeddingResult = {
            entityId: product.id,
            entityType: 'product',
            embeddings: result.embeddings || {},
            metadata: result.metadata || {
              modelVersions: {},
              confidenceScores: {},
              generationTimesMs: {},
              generatedAt: new Date().toISOString(),
            },
            success: true,
          };

          // Cache result
          if (useCache) {
            this.cacheEmbedding(product.id, embeddingResult);
          }

          return embeddingResult;
        }
      } catch (error) {
        lastError = error as Error;
        if (attempt < retryAttempts) {
          const delay = this.DEFAULT_RETRY_DELAY * Math.pow(2, attempt - 1);
          console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      entityId: product.id,
      entityType: 'product',
      embeddings: {},
      metadata: {
        modelVersions: {},
        confidenceScores: {},
        generationTimesMs: {},
        generatedAt: new Date().toISOString(),
      },
      success: false,
      error: lastError?.message || 'Failed after all retry attempts',
    };
  }

  /**
   * Batch generate embeddings for chunks
   */
  async batchGenerateChunkEmbeddings(
    chunks: any[],
    options: BatchGenerationOptions = {}
  ): Promise<EmbeddingResult[]> {
    const { batchSize = this.DEFAULT_BATCH_SIZE } = options;

    console.log(`🔄 Batch generating embeddings for ${chunks.length} chunks`);

    const results: EmbeddingResult[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(chunk =>
          this.generateChunkEmbeddings(chunk, options)
        )
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            entityId: batch[index].id,
            entityType: 'chunk',
            embeddings: {},
            metadata: {
              modelVersions: {},
              confidenceScores: {},
              generationTimesMs: {},
              generatedAt: new Date().toISOString(),
            },
            success: false,
            error: result.reason?.message,
          });
        }
      });
    }

    return results;
  }

  /**
   * Generate embeddings for a single chunk
   */
  async generateChunkEmbeddings(
    chunk: any,
    options: BatchGenerationOptions = {}
  ): Promise<EmbeddingResult> {
    const { useCache = true } = options;

    if (useCache) {
      const cached = this.getCachedEmbedding(chunk.id);
      if (cached) return cached;
    }

    try {
      const result = await this.callMivaaGateway('generate_embeddings', {
        entity_id: chunk.id,
        entity_type: 'chunk',
        text_content: chunk.content || '',
        embedding_types: ['text_1536', 'visual_clip_512', 'multimodal_2048'],
      });

      const embeddingResult: EmbeddingResult = {
        entityId: chunk.id,
        entityType: 'chunk',
        embeddings: result.embeddings || {},
        metadata: result.metadata || {
          modelVersions: {},
          confidenceScores: {},
          generationTimesMs: {},
          generatedAt: new Date().toISOString(),
        },
        success: result.success,
      };

      if (useCache) {
        this.cacheEmbedding(chunk.id, embeddingResult);
      }

      return embeddingResult;
    } catch (error) {
      return {
        entityId: chunk.id,
        entityType: 'chunk',
        embeddings: {},
        metadata: {
          modelVersions: {},
          confidenceScores: {},
          generationTimesMs: {},
          generatedAt: new Date().toISOString(),
        },
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Cache management
   */
  private getCachedEmbedding(id: string): EmbeddingResult | null {
    return this.cache.get(id) || null;
  }

  private cacheEmbedding(id: string, result: EmbeddingResult): void {
    this.cache.set(id, result);
  }

  clearCache(): void {
    this.cache.clear();
    console.log('✅ Embedding cache cleared');
  }

  /**
   * Call MIVAA gateway
   */
  private async callMivaaGateway(action: string, payload: any): Promise<any> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration not found');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!response.ok) {
      throw new Error(`MIVAA gateway error: ${response.statusText}`);
    }

    return response.json();
  }
}

export default MultiVectorGenerationService.getInstance();

