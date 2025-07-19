import { pipeline } from '@huggingface/transformers';
import { MLResult, TextEmbeddingResult, FeatureExtractionOptions } from './types';
import { DeviceDetector } from './deviceDetector';
import { BaseService, ServiceConfig } from '../base/BaseService';

/**
 * Configuration interface for TextEmbedderService
 */
export interface TextEmbedderServiceConfig extends ServiceConfig {
  modelName?: string;
  device?: string;
  enableProgressCallback?: boolean;
  defaultPooling?: 'mean' | 'cls';
  defaultNormalize?: boolean;
}

/**
 * Text Embedding Service using HuggingFace Transformers
 * Provides text embedding generation capabilities with standardized service patterns
 */
export class TextEmbedderService extends BaseService<TextEmbedderServiceConfig> {
  private embedder: any = null;

  /**
   * Initialize the text embedding service
   */
  protected async doInitialize(): Promise<void> {
    try {
      console.log('Initializing text embedding model...');
      
      const modelName = this.config.modelName || 'mixedbread-ai/mxbai-embed-xsmall-v1';
      const device = this.config.device || DeviceDetector.getOptimalDevice();
      
      this.embedder = await pipeline(
        'feature-extraction',
        modelName,
        {
          device: device as any, // Type assertion for device compatibility
          progress_callback: this.config.enableProgressCallback ? (progress: any) => {
            console.log(`Text embedder loading: ${Math.round(progress.progress * 100)}%`);
          } : undefined
        }
      );

      console.log('Text embedding model initialized successfully');
    } catch (error) {
      const errorMessage = `Text embedder initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMessage, error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Perform health check for the text embedding service
   */
  protected async doHealthCheck(): Promise<void> {
    if (!this.embedder) {
      throw new Error('Text embedder not initialized');
    }

    // Test with a simple embedding generation
    try {
      await this.embedder('health check', { pooling: 'mean', normalize: true });
    } catch (error) {
      throw new Error(`Text embedder health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate text embeddings for single text or array of texts
   */
  async generateEmbedding(
    text: string | string[],
    options: FeatureExtractionOptions = {
      pooling: this.config.defaultPooling || 'mean',
      normalize: this.config.defaultNormalize !== false
    }
  ): Promise<MLResult> {
    return this.executeOperation(async () => {
      if (!this.embedder) {
        throw new Error('Text embedder not available');
      }

      const embeddings = await this.embedder(text, options);

      // Handle single text vs array
      const embeddingData = Array.isArray(text)
        ? embeddings.tolist()
        : embeddings.tolist()[0];

      const result: TextEmbeddingResult = Array.isArray(text)
        ? {
            embedding: embeddingData,
            dimensions: embeddingData[0]?.length || 0
          }
        : {
            embedding: embeddingData,
            dimensions: embeddingData?.length || 0
          };

      return {
        success: true,
        data: result
      };
    }, 'generateEmbedding');
  }

  /**
   * Calculate similarity between two text embeddings
   */
  async calculateSimilarity(text1: string, text2: string): Promise<MLResult> {
    return this.executeOperation(async () => {
      const embedding1Result = await this.generateEmbedding(text1);
      const embedding2Result = await this.generateEmbedding(text2);

      if (!embedding1Result.success || !embedding2Result.success) {
        throw new Error('Failed to generate embeddings for similarity calculation');
      }

      const emb1 = (embedding1Result.data as TextEmbeddingResult).embedding as number[];
      const emb2 = (embedding2Result.data as TextEmbeddingResult).embedding as number[];

      // Calculate cosine similarity
      const dotProduct = emb1.reduce((sum, a, i) => sum + a * emb2[i], 0);
      const magnitude1 = Math.sqrt(emb1.reduce((sum, a) => sum + a * a, 0));
      const magnitude2 = Math.sqrt(emb2.reduce((sum, a) => sum + a * a, 0));
      
      const similarity = dotProduct / (magnitude1 * magnitude2);

      return {
        success: true,
        data: {
          similarity,
          text1,
          text2,
          embedding1: emb1,
          embedding2: emb2
        }
      };
    }, 'calculateSimilarity');
  }

  /**
   * Get model information
   */
  getModelInfo(): { name: string; initialized: boolean; device?: string } {
    return {
      name: this.config.modelName || 'mxbai-embed-xsmall-v1',
      initialized: this.isInitialized,
      device: this.config.device
    };
  }

  /**
   * Get embedding dimensions for the current model
   */
  async getEmbeddingDimensions(): Promise<number> {
    return this.executeOperation(async () => {
      const testResult = await this.generateEmbedding('test');
      if (!testResult.success) {
        throw new Error('Failed to determine embedding dimensions');
      }
      return (testResult.data as TextEmbeddingResult).dimensions;
    }, 'getEmbeddingDimensions');
  }

  /**
   * Static factory method to create TextEmbedderService instance
   */
  static createInstance(config: Partial<TextEmbedderServiceConfig> = {}): TextEmbedderService {
    const defaultConfig: TextEmbedderServiceConfig = {
      name: 'TextEmbedderService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      modelName: 'mixedbread-ai/mxbai-embed-xsmall-v1',
      enableProgressCallback: true,
      defaultPooling: 'mean',
      defaultNormalize: true,
      timeout: 30000,
      retries: 3,
      rateLimit: {
        requestsPerMinute: 60,
        burstLimit: 10
      },
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000
      },
      ...config
    };

    const instance = TextEmbedderService.getInstance<TextEmbedderService>();
    instance.config = defaultConfig;
    return instance;
  }
}

// Export singleton instance for backward compatibility
export const textEmbedderService = TextEmbedderService.createInstance();