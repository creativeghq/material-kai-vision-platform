import { createHash } from 'crypto';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

import { Logger } from 'winston';
import { OpenAI } from 'openai';

/**
 * Configuration interface for the EmbeddingGenerationService
 */
export interface EmbeddingGenerationConfig {
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
    dimensions?: number;
    baseURL?: string;
    timeout?: number;
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
  metadata?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Output interface for generated embeddings
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
  metadata?: Record<string, any>;
  processingTime: number;
  cached: boolean;
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
 * Service for generating embeddings using OpenAI's text-embedding models
 * Provides batch processing, caching, rate limiting, and comprehensive error handling
 */
export class EmbeddingGenerationService extends EventEmitter {
  private readonly config: EmbeddingGenerationConfig;
  private readonly logger: Logger;
  private readonly openai: OpenAI;
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

  constructor(config: EmbeddingGenerationConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
      timeout: config.openai.timeout || 30000,
    });

    // Initialize cache
    this.cache = new Map();

    // Initialize rate limiter
    this.rateLimiter = this.createRateLimiter();

    // Initialize batch queue
    this.batchQueue = [];

    this.logger.info('EmbeddingGenerationService initialized', {
      model: config.openai.model,
      batchSize: config.batch.maxSize,
      cacheEnabled: config.cache.enabled,
    });
  }

  /**
   * Generate embedding for a single text input
   */
  async generateEmbedding(input: EmbeddingInput): Promise<EmbeddingOutput> {
    const startTime = performance.now();

    try {
      // Check cache first
      if (this.config.cache.enabled) {
        const cached = this.getCachedEmbedding(input.text);
        if (cached) {
          this.metrics.cacheHits++;
          this.emit('cacheHit', { id: input.id, text: input.text });

          return {
            id: input.id,
            embedding: cached.embedding,
            dimensions: cached.dimensions,
            model: cached.model,
            usage: cached.usage,
            metadata: input.metadata,
            processingTime: performance.now() - startTime,
            cached: true,
          };
        }
        this.metrics.cacheMisses++;
      }

      // Estimate token count for rate limiting
      const estimatedTokens = this.estimateTokenCount(input.text);

      // Check rate limits
      if (!this.rateLimiter.canMakeRequest(estimatedTokens)) {
        const waitTime = this.rateLimiter.getWaitTime(estimatedTokens);
        this.metrics.rateLimitHits++;
        this.emit('rateLimitHit', { waitTime, tokens: estimatedTokens });

        if (waitTime > 0) {
          await this.delay(waitTime);
        }
      }

      // Generate embedding with retry logic
      const result = await this.generateWithRetry(input.text);

      // Record rate limit usage
      this.rateLimiter.recordRequest(result.usage.total_tokens);

      // Cache the result
      if (this.config.cache.enabled) {
        this.cacheEmbedding(input.text, result);
      }

      // Update metrics
      this.metrics.totalRequests++;
      this.metrics.totalTokens += result.usage.total_tokens;
      this.updateAverageProcessingTime(performance.now() - startTime);

      const output: EmbeddingOutput = {
        id: input.id,
        embedding: result.data[0].embedding,
        dimensions: result.data[0].embedding.length,
        model: result.model,
        usage: {
          promptTokens: result.usage.prompt_tokens,
          totalTokens: result.usage.total_tokens,
        },
        metadata: input.metadata,
        processingTime: performance.now() - startTime,
        cached: false,
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
      getWaitTime: (tokens: number): number => {
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
   * Generate embedding with retry logic
   */
  private async generateWithRetry(text: string): Promise<any> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.config.openai.model,
          input: text,
          dimensions: this.config.openai.dimensions,
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.config.retry.maxAttempts) {
          break;
        }

        const delay = Math.min(
          this.config.retry.baseDelay * Math.pow(2, attempt - 1),
          this.config.retry.maxDelay,
        );

        this.logger.warn('Embedding generation attempt failed, retrying', {
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
  private cacheEmbedding(text: string, result: any): void {
    // Check cache size limit
    if (this.cache.size >= this.config.cache.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    const key = this.getCacheKey(text);
    const entry: CacheEntry = {
      embedding: result.data[0].embedding,
      dimensions: result.data[0].embedding.length,
      model: result.model,
      usage: {
        promptTokens: result.usage.prompt_tokens,
        totalTokens: result.usage.total_tokens,
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
      .update(`${this.config.openai.model}:${text}`)
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
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'text-embedding-3-small',
    maxTokens: 8192,
    dimensions: 1536,
    timeout: 30000,
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
