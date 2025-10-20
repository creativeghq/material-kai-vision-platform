import { createHash } from 'crypto';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

// Note: Winston logger removed - using console for logging instead

// Import unified embedding configuration
import {
  DEFAULT_EMBEDDING_CONFIG,
  UnifiedEmbeddingConfig,
  EmbeddingValidator,
  EmbeddingCacheKey,
  textPreprocessor,
} from '../config/embeddingConfig';

/**
 * Configuration interface for the EmbeddingGenerationService
 * Now extends the unified embedding configuration
 */
export interface EmbeddingGenerationConfig {
  // Unified embedding configuration
  embedding: UnifiedEmbeddingConfig;

  // Service-specific configuration
  mivaa: {
    gatewayUrl: string;
    apiKey: string;
    timeout?: number;
    model?: string;
  };
  batch: {
    maxSize: number;
    maxWaitTime: number;
    concurrency: number;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };
}

/**
 * Input interface for embedding generation
 */
export interface EmbeddingInput {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Output interface for generated embeddings
 * Enhanced with validation and normalization info
 */
export interface EmbeddingOutput {
  id: string;
  embedding: number[];
  dimensions: number;
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
  processingTime: number;
  cached: boolean;
  // New validation fields
  validated: boolean;
  normalized: boolean;
  preprocessedText?: string;
  originalTextLength: number;
}

/**
 * Batch processing result interface
 */
export interface BatchEmbeddingResult {
  successful: EmbeddingOutput[];
  failed: Array<{
    id: string;
    error: string;
    input: EmbeddingInput;
  }>;
  metrics: {
    totalProcessed: number;
    successRate: number;
    totalTokens: number;
    processingTime: number;
    cacheHitRate: number;
  };
}

/**
 * Cache entry interface
 */
interface CacheEntry {
  embedding: number[];
  dimensions: number;
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  timestamp: number;
  accessCount: number;
  normalized?: boolean;
}

/**
 * Rate limiter interface
 */
interface RateLimiter {
  requests: Array<{ timestamp: number; tokens: number }>;
  canMakeRequest(tokens: number): boolean;
  recordRequest(tokens: number): void;
  getWaitTime(tokens: number): number;
}

/**
 * Batch queue item interface
 */
interface BatchQueueItem {
  input: EmbeddingInput;
  resolve: (result: EmbeddingOutput) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Service for generating embeddings using MIVAA's embedding generation capabilities
 * Provides batch processing, caching, rate limiting, and comprehensive error handling
 */
export class EmbeddingGenerationService extends EventEmitter {
  private readonly config: EmbeddingGenerationConfig;
  private readonly logger: Console;
  private readonly cache: Map<string, CacheEntry>;
  private readonly rateLimiter: RateLimiter;
  private readonly batchQueue: BatchQueueItem[];
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessingBatch = false;
  private readonly metrics = {
    totalRequests: 0,
    totalTokens: 0,
    cacheHits: 0,
    cacheMisses: 0,
    batchesProcessed: 0,
    errors: 0,
    averageProcessingTime: 0,
    rateLimitHits: 0,
  };

  constructor(config: EmbeddingGenerationConfig, logger: Console = console) {
    super();
    this.config = {
      ...config,
      // Ensure we have the unified embedding config
      embedding: config.embedding || DEFAULT_EMBEDDING_CONFIG,
    };
    this.logger = logger;

    // Initialize cache
    this.cache = new Map();

    // Initialize rate limiter
    this.rateLimiter = this.createRateLimiter();

    // Initialize batch queue
    this.batchQueue = [];

    this.logger.info('EmbeddingGenerationService initialized with unified config', {
      gatewayUrl: config.mivaa.gatewayUrl,
      batchSize: config.batch.maxSize,
      cacheEnabled: config.cache.enabled,
      primaryModel: this.config.embedding.primary.name,
      dimensions: this.config.embedding.primary.dimensions,
    });
  }

  /**
   * Generate embedding for a single text input with unified preprocessing
   */
  async generateEmbedding(input: EmbeddingInput): Promise<EmbeddingOutput> {
    const startTime = performance.now();
    const originalTextLength = input.text.length;

    try {
      // Validate input text
      const validation = textPreprocessor.validate(input.text);
      if (!validation.valid) {
        throw new Error(`Text validation failed: ${validation.error}`);
      }

      // Preprocess text using unified configuration
      const preprocessedText = textPreprocessor.preprocess(input.text);

      // Generate cache key using unified strategy
      const cacheKey = EmbeddingCacheKey.generate(
        preprocessedText,
        this.config.embedding.primary.name,
        this.config.embedding.caching.keyStrategy,
      );

      // Check cache first
      if (this.config.cache.enabled) {
        const cached = this.getCachedEmbedding(cacheKey);
        if (cached) {
          this.metrics.cacheHits++;
          this.emit('cacheHit', { id: input.id, text: input.text });

          return {
            id: input.id,
            embedding: cached.embedding,
            dimensions: cached.dimensions,
            model: cached.model,
            usage: cached.usage,
            metadata: input.metadata || {},
            processingTime: performance.now() - startTime,
            cached: true,
            validated: true,
            normalized: cached.normalized || false,
            preprocessedText,
            originalTextLength,
          };
        }
        this.metrics.cacheMisses++;
      }

      // Estimate token count for rate limiting
      const estimatedTokens = this.estimateTokenCount(preprocessedText);

      // Check rate limits
      if (!this.rateLimiter.canMakeRequest(estimatedTokens)) {
        const waitTime = this.rateLimiter.getWaitTime(estimatedTokens);
        this.metrics.rateLimitHits++;
        this.emit('rateLimitHit', { waitTime, tokens: estimatedTokens });

        if (waitTime > 0) {
          await this.delay(waitTime);
        }
      }

      // Generate embedding with retry logic using preprocessed text
      const result = await this.generateWithRetry(preprocessedText) as any;

      // Validate and normalize embedding
      const embeddingValidation = EmbeddingValidator.validateEmbedding(
        result.data[0].embedding,
        this.config.embedding.primary,
      );

      if (!embeddingValidation.valid) {
        throw new Error(`Embedding validation failed: ${embeddingValidation.error}`);
      }

      const finalEmbedding = embeddingValidation.normalized || result.data[0].embedding;

      // Record rate limit usage
      this.rateLimiter.recordRequest(result.usage.total_tokens);

      // Cache the result with validation info
      if (this.config.cache.enabled) {
        this.cacheEmbedding(cacheKey, {
          embedding: finalEmbedding,
          dimensions: finalEmbedding.length,
          model: result.model,
          usage: result.usage,
          normalized: embeddingValidation.normalized !== undefined,
        } as any);
      }

      // Update metrics
      this.metrics.totalRequests++;
      this.metrics.totalTokens += result.usage.total_tokens;
      this.updateAverageProcessingTime(performance.now() - startTime);

      const output: EmbeddingOutput = {
        id: input.id,
        embedding: finalEmbedding,
        dimensions: finalEmbedding.length,
        model: result.model,
        usage: {
          promptTokens: result.usage.prompt_tokens,
          totalTokens: result.usage.total_tokens,
        },
        metadata: input.metadata || {},
        processingTime: performance.now() - startTime,
        cached: false,
        // New validation fields
        validated: embeddingValidation.valid,
        normalized: embeddingValidation.normalized !== undefined,
        preprocessedText,
        originalTextLength,
      };

      this.emit('embeddingGenerated', output);
      return output;

    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to generate embedding', {
        id: input.id,
        error: error instanceof Error ? error.message : String(error),
        processingTime: performance.now() - startTime,
      });

      this.emit('error', { id: input.id, error });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple inputs using batch processing
   */
  async generateBatchEmbeddings(inputs: EmbeddingInput[]): Promise<BatchEmbeddingResult> {
    const startTime = performance.now();
    const successful: EmbeddingOutput[] = [];
    const failed: Array<{ id: string; error: string; input: EmbeddingInput }> = [];
    let totalTokens = 0;
    let cacheHits = 0;

    this.logger.info('Starting batch embedding generation', {
      batchSize: inputs.length,
      maxConcurrency: this.config.batch.concurrency,
    });

    // Process inputs in chunks based on concurrency limit
    const chunks = this.chunkArray(inputs, this.config.batch.concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (input) => {
        try {
          const result = await this.generateEmbedding(input);
          successful.push(result);
          totalTokens += result.usage.totalTokens;
          if (result.cached) cacheHits++;
        } catch (error) {
          failed.push({
            id: input.id,
            error: error instanceof Error ? error.message : String(error),
            input,
          });
        }
      });

      await Promise.all(promises);
    }

    const processingTime = performance.now() - startTime;
    this.metrics.batchesProcessed++;

    const result: BatchEmbeddingResult = {
      successful,
      failed,
      metrics: {
        totalProcessed: inputs.length,
        successRate: successful.length / inputs.length,
        totalTokens,
        processingTime,
        cacheHitRate: cacheHits / inputs.length,
      },
    };

    this.logger.info('Batch embedding generation completed', {
      totalProcessed: inputs.length,
      successful: successful.length,
      failed: failed.length,
      processingTime,
      successRate: result.metrics.successRate,
    });

    this.emit('batchCompleted', result);
    return result;
  }

  /**
   * Add input to batch queue for deferred processing
   */
  async queueForBatch(input: EmbeddingInput): Promise<EmbeddingOutput> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        input,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Start batch timer if not already running
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.processBatchQueue();
        }, this.config.batch.maxWaitTime);
      }

      // Process immediately if batch is full
      if (this.batchQueue.length >= this.config.batch.maxSize) {
        this.processBatchQueue();
      }
    });
  }

  /**
   * Get service metrics and statistics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.cache.size,
      queueSize: this.batchQueue.length,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      errorRate: this.metrics.errors / this.metrics.totalRequests || 0,
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Embedding cache cleared');
    this.emit('cacheCleared');
  }

  /**
   * Cleanup resources and stop processing
   */
  async cleanup(): Promise<void> {
    // Process any remaining items in queue
    if (this.batchQueue.length > 0) {
      await this.processBatchQueue();
    }

    // Clear timers
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Clear cache if needed
    if (this.config.cache.enabled) {
      this.clearCache();
    }

    this.logger.info('EmbeddingGenerationService cleanup completed');
  }

  /**
   * Create rate limiter instance
   */
  private createRateLimiter(): RateLimiter {
    const requests: Array<{ timestamp: number; tokens: number }> = [];

    return {
      requests,
      canMakeRequest: (tokens: number): boolean => {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Clean old requests
        while (requests.length > 0 && requests[0].timestamp < oneMinuteAgo) {
          requests.shift();
        }

        const currentRequests = requests.length;
        const currentTokens = requests.reduce((sum, req) => sum + req.tokens, 0);

        return (
          currentRequests < this.config.rateLimit.requestsPerMinute &&
          currentTokens + tokens <= this.config.rateLimit.tokensPerMinute
        );
      },
      recordRequest: (tokens: number): void => {
        requests.push({ timestamp: Date.now(), tokens });
      },
      getWaitTime: (_tokens: number): number => {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Find the oldest request that would need to expire
        const relevantRequests = requests.filter(req => req.timestamp >= oneMinuteAgo);

        if (relevantRequests.length === 0) return 0;

        const oldestRequest = relevantRequests[0];
        const waitTime = oldestRequest.timestamp + 60000 - now;

        return Math.max(0, waitTime);
      },
    };
  }

  /**
   * Generate embedding with retry logic using MIVAA backend
   */
  private async generateWithRetry(text: string): Promise<unknown> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.config.mivaa.gatewayUrl}/api/mivaa/gateway`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.mivaa.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Material-Kai-Vision-Platform-EmbeddingService/1.0',
          },
          body: JSON.stringify({
            action: 'batch_embedding',
            payload: {
              texts: [text],
              options: {
                model: this.config.mivaa.model || 'clip',
                normalize: true,
                batch_size: 1,
              },
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`MIVAA gateway error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(`MIVAA batch embedding error: ${result.error?.message || 'Unknown error'}`);
        }

        // Transform MIVAA response to match expected format
        const embeddingData = result.data.embeddings?.[0] || result.data;
        return {
          data: [{
            embedding: embeddingData.embedding || embeddingData,
          }],
          model: result.data.model || this.config.mivaa.model || 'mivaa-clip',
          usage: {
            prompt_tokens: Math.ceil(text.length / 4), // Estimate tokens
            total_tokens: Math.ceil(text.length / 4),
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.config.retry.maxAttempts) {
          break;
        }

        const delay = Math.min(
          this.config.retry.baseDelay * Math.pow(2, attempt - 1),
          this.config.retry.maxDelay,
        );

        this.logger.warn('MIVAA embedding generation attempt failed, retrying', {
          attempt,
          delay,
          error: lastError.message,
        });

        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Get cached embedding if available and not expired
   */
  private getCachedEmbedding(text: string): CacheEntry | null {
    const key = this.getCacheKey(text);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.config.cache.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access count
    entry.accessCount++;
    return entry;
  }

  /**
   * Cache embedding result
   */
  private cacheEmbedding(text: string, result: unknown): void {
    // Check cache size limit
    if (this.cache.size >= this.config.cache.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    const key = this.getCacheKey(text);
    const resultData = result as any;
    const entry: CacheEntry = {
      embedding: resultData.data[0].embedding,
      dimensions: resultData.data[0].embedding.length,
      model: resultData.model,
      usage: {
        promptTokens: resultData.usage.prompt_tokens,
        totalTokens: resultData.usage.total_tokens,
      },
      timestamp: Date.now(),
      accessCount: 1,
    };

    this.cache.set(key, entry);
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    return createHash('sha256')
      .update(`${this.config.mivaa.model || 'mivaa-clip'}:${text}`)
      .digest('hex');
  }

  /**
   * Evict least recently used cache entries
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Process batch queue
   */
  private async processBatchQueue(): Promise<void> {
    if (this.isProcessingBatch || this.batchQueue.length === 0) {
      return;
    }

    this.isProcessingBatch = true;

    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Extract items to process
    const itemsToProcess = this.batchQueue.splice(0, this.config.batch.maxSize);
    const inputs = itemsToProcess.map(item => item.input);

    try {
      const result = await this.generateBatchEmbeddings(inputs);

      // Resolve successful items
      result.successful.forEach(output => {
        const item = itemsToProcess.find(i => i.input.id === output.id);
        if (item) {
          item.resolve(output);
        }
      });

      // Reject failed items
      result.failed.forEach(failure => {
        const item = itemsToProcess.find(i => i.input.id === failure.id);
        if (item) {
          item.reject(new Error(failure.error));
        }
      });

    } catch (error) {
      // Reject all items on batch failure
      itemsToProcess.forEach(item => {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      });
    }

    this.isProcessingBatch = false;

    // Process remaining items if any
    if (this.batchQueue.length > 0) {
      this.batchTimer = setTimeout(() => {
        this.processBatchQueue();
      }, this.config.batch.maxWaitTime);
    }
  }

  /**
   * Update average processing time metric
   */
  private updateAverageProcessingTime(processingTime: number): void {
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime * (totalRequests - 1) + processingTime) / totalRequests;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Default configuration for EmbeddingGenerationService
 */
export const defaultEmbeddingConfig: EmbeddingGenerationConfig = {
  embedding: DEFAULT_EMBEDDING_CONFIG,
  mivaa: {
    gatewayUrl: process.env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr',
    apiKey: process.env.MIVAA_API_KEY || '',
    timeout: 30000,
    model: 'clip', // Default to CLIP for embeddings
  },
  batch: {
    maxSize: 100,
    maxWaitTime: 1000,
    concurrency: 5,
  },
  cache: {
    enabled: true,
    ttl: 3600000, // 1 hour
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
};
