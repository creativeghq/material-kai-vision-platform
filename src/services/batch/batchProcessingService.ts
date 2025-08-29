import { EventEmitter } from 'events';

import { DocumentChunkingService } from '../documentChunkingService';
import { MivaaEmbeddingIntegration } from '../mivaaEmbeddingIntegration';
import { ValidationIntegrationService } from '../validationIntegrationService';

import { BatchJobQueue, BatchJob, JobResult, JobPriority, QueueConfig } from './batchJobQueue';

// Simple logger interface to avoid winston dependency
interface Logger {
  info(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

/**
 * Performance metrics interface
 */
interface PerformanceMetrics {
  totalBatchesProcessed: number;
  totalDocumentsProcessed: number;
  averageBatchTime: number;
  systemLoad: number;
  memoryUsage: number;
}

/**
 * Batch processing configuration interface
 */
export interface BatchProcessingConfig {
  queue: Partial<QueueConfig>;
  processing: {
    maxConcurrentBatches: number;
    batchSize: number;
    maxDocumentsPerBatch: number;
    timeoutMs: number;
    enableProgressTracking: boolean;
    enablePerformanceMetrics: boolean;
  };
  services: {
    chunking: {
      strategy: 'fixed-size' | 'semantic' | 'hybrid';
      chunkSize: number;
      overlap: number;
    };
    embedding: {
      batchSize: number;
      enableCaching: boolean;
      rateLimitRpm: number;
    };
    validation: {
      enabled: boolean;
      strictMode: boolean;
    };
  };
  performance: {
    memoryLimitMB: number;
    cpuThrottleThreshold: number;
    enableResourcePooling: boolean;
  };
  storage: {
    tempDirectory: string;
    cleanupAfterMs: number;
    enableCompression: boolean;
  };
}

/**
 * Document input for batch processing
 */
export interface DocumentInput {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  processingOptions?: {
    chunkingStrategy?: string;
    embeddingModel?: string;
    validationLevel?: string;
  };
}

/**
 * Batch processing options
 */
export interface BatchProcessingOptions {
  batchId?: string;
  priority?: JobPriority;
  enableValidation?: boolean;
  enableChunking?: boolean;
  enableEmbedding?: boolean;
  customMetadata?: Record<string, unknown>;
}

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
  batchId: string;
  status: 'completed' | 'failed' | 'partial';
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  results: Array<{
    documentId: string;
    status: 'success' | 'failed';
    chunks?: Array<{
      id: string;
      content: string;
      embedding?: number[];
      metadata?: Record<string, unknown>;
    }>;
    error?: string;
  }>;
  metrics: {
    totalProcessingTime: number;
    averageDocumentTime: number;
    throughputPerMinute: number;
    memoryUsage: number;
    errorRate: number;
  };
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Batch progress information
 */
export interface BatchProgress {
  batchId: string;
  stage: 'queued' | 'validating' | 'chunking' | 'embedding' | 'finalizing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentDocument?: number;
  totalDocuments?: number;
  currentOperation?: string;
  estimatedTimeRemaining?: number;
  errors?: string[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BatchProcessingConfig = {
  queue: {
    maxSize: 1000,
    maxConcurrency: 5,
    defaultPriority: 'normal' as JobPriority,
    retryPolicy: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterEnabled: true,
    },
    deadLetterQueue: {
      enabled: true,
      maxSize: 100,
    },
    persistence: {
      enabled: false,
      interval: 5000,
    },
    metrics: {
      enabled: true,
      retentionPeriod: 86400000, // 24 hours
    },
  },
  processing: {
    maxConcurrentBatches: 3,
    batchSize: 10,
    maxDocumentsPerBatch: 100,
    timeoutMs: 300000, // 5 minutes
    enableProgressTracking: true,
    enablePerformanceMetrics: true,
  },
  services: {
    chunking: {
      strategy: 'semantic',
      chunkSize: 1000,
      overlap: 100,
    },
    embedding: {
      batchSize: 20,
      enableCaching: true,
      rateLimitRpm: 1000,
    },
    validation: {
      enabled: true,
      strictMode: false,
    },
  },
  performance: {
    memoryLimitMB: 2048,
    cpuThrottleThreshold: 80,
    enableResourcePooling: true,
  },
  storage: {
    tempDirectory: '/tmp/batch-processing',
    cleanupAfterMs: 3600000, // 1 hour
    enableCompression: true,
  },
};

/**
 * High-performance batch processing service for documents
 */
export class BatchProcessingService extends EventEmitter {
  private config: BatchProcessingConfig;
  private jobQueue: BatchJobQueue;
  private validationService: ValidationIntegrationService;
  private chunkingService: DocumentChunkingService;
  private embeddingService: MivaaEmbeddingIntegration;
  private logger: Logger;
  private performanceMetrics: PerformanceMetrics;
  private activeBatches: Map<string, BatchProgress>;
  private batchResults: Map<string, BatchProcessingResult>;
  private resourcePool: Map<string, unknown>;
  private isInitialized: boolean;

  constructor(
    validationService: ValidationIntegrationService,
    chunkingService: DocumentChunkingService,
    embeddingService: MivaaEmbeddingIntegration,
    config: Partial<BatchProcessingConfig> = {},
    logger?: Logger,
  ) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validationService = validationService;
    this.chunkingService = chunkingService;
    this.embeddingService = embeddingService;
    this.logger = logger || {
      info: (msg: string) => console.log(`[BatchProcessing] ${msg}`),
      error: (msg: string) => console.error(`[BatchProcessing] ${msg}`),
      warn: (msg: string) => console.warn(`[BatchProcessing] ${msg}`),
      debug: (msg: string) => console.debug(`[BatchProcessing] ${msg}`),
    };

    this.performanceMetrics = {
      totalBatchesProcessed: 0,
      totalDocumentsProcessed: 0,
      averageBatchTime: 0,
      systemLoad: 0,
      memoryUsage: 0,
    };

    this.activeBatches = new Map();
    this.batchResults = new Map();
    this.resourcePool = new Map();
    this.isInitialized = false;

    // Initialize job queue
    this.jobQueue = new BatchJobQueue(this.config.queue);

    // Set up job queue event handlers
    this.setupJobQueueHandlers();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing batch processing service...');

      // Initialize resource pool if enabled
      if (this.config.performance.enableResourcePooling) {
        await this.initializeResourcePool();
      }

      // Start performance monitoring if enabled
      if (this.config.processing.enablePerformanceMetrics) {
        this.startPerformanceMonitoring();
      }

      this.isInitialized = true;
      this.logger.info('Batch processing service initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize batch processing service: ${error}`);
      throw error;
    }
  }

  /**
   * Process a batch of documents
   */
  async processBatch(
    documents: DocumentInput[],
    options: BatchProcessingOptions = {},
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate input
    if (!documents || documents.length === 0) {
      throw new Error('No documents provided for batch processing');
    }

    if (documents.length > this.config.processing.maxDocumentsPerBatch) {
      throw new Error(
        `Batch size ${documents.length} exceeds maximum allowed ${this.config.processing.maxDocumentsPerBatch}`,
      );
    }

    const batchId = options.batchId || this.generateBatchId();
    const priority = options.priority || 'normal';

    this.logger.info(`Starting batch processing for ${documents.length} documents (batch: ${batchId})`);

    // Initialize batch progress
    this.activeBatches.set(batchId, {
      batchId,
      stage: 'queued',
      progress: 0,
      totalDocuments: documents.length,
      currentDocument: 0,
      currentOperation: 'Initializing batch processing',
    });

    try {
      // Create processing pipeline jobs
      const jobs: BatchJob[] = [];

      // 1. Validation job (if enabled)
      if (options.enableValidation !== false && this.config.services.validation.enabled) {
        jobs.push({
          id: `${batchId}_validation`,
          type: 'validation',
          priority,
          status: 'pending',
          payload: { batchId, documents, options },
          metadata: {
            workspaceId: 'default',
            source: 'batch-processing',
            createdAt: new Date(),
            updatedAt: new Date(),
            attempts: 0,
            maxAttempts: 3,
            ...options.customMetadata,
          },
        });
      }

      // 2. Chunking job (if enabled)
      if (options.enableChunking !== false) {
        jobs.push({
          id: `${batchId}_chunking`,
          type: 'chunking',
          priority,
          status: 'pending',
          payload: { batchId, documents },
          metadata: {
            workspaceId: 'default',
            source: 'batch-processing',
            createdAt: new Date(),
            updatedAt: new Date(),
            attempts: 0,
            maxAttempts: 3,
            ...options.customMetadata,
          },
        });
      }

      // 3. Embedding job (if enabled)
      if (options.enableEmbedding !== false) {
        jobs.push({
          id: `${batchId}_embedding`,
          type: 'embedding',
          priority,
          status: 'pending',
          payload: { batchId, chunkingJobId: `${batchId}_chunking` },
          metadata: {
            workspaceId: 'default',
            source: 'batch-processing',
            createdAt: new Date(),
            updatedAt: new Date(),
            attempts: 0,
            maxAttempts: 3,
            ...options.customMetadata,
          },
        });
      }

      // 4. Finalization job
      jobs.push({
        id: `${batchId}_finalization`,
        type: 'finalization',
        priority,
        status: 'pending',
        payload: { batchId },
        metadata: {
          workspaceId: 'default',
          source: 'batch-processing',
          createdAt: new Date(),
          updatedAt: new Date(),
          attempts: 0,
          maxAttempts: 3,
          ...options.customMetadata,
        },
      });

      // Queue all jobs
      for (const job of jobs) {
        await this.jobQueue.addJob(job.type, job.payload, {
          priority: job.priority,
          workspaceId: job.metadata.workspaceId,
          source: job.metadata.source,
          maxAttempts: job.metadata.maxAttempts,
        });
      }

      this.updateBatchProgress(batchId, {
        stage: 'queued',
        progress: 5,
        currentOperation: `Queued ${jobs.length} processing jobs`,
      });

      this.emit('batchStarted', { batchId, documentCount: documents.length });

      return batchId;
    } catch (error) {
      this.logger.error(`Failed to start batch processing: ${error}`);
      this.updateBatchProgress(batchId, {
        stage: 'failed',
        progress: 0,
        currentOperation: 'Failed to start batch processing',
        errors: [error instanceof Error ? error.message : String(error)],
      });
      throw error;
    }
  }

  /**
   * Get batch progress
   */
  getBatchProgress(batchId: string): BatchProgress | undefined {
    return this.activeBatches.get(batchId);
  }

  /**
   * Get batch result
   */
  getBatchResult(batchId: string): BatchProcessingResult | undefined {
    return this.batchResults.get(batchId);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get queue metrics
   */
  getQueueMetrics(): ReturnType<BatchJobQueue['getMetrics']> {
    return this.jobQueue.getMetrics();
  }

  /**
   * Cancel a batch
   */
  async cancelBatch(batchId: string): Promise<void> {
    this.logger.info(`Cancelling batch: ${batchId}`);

    // Cancel related jobs
    const jobIds = [
      `${batchId}_validation`,
      `${batchId}_chunking`,
      `${batchId}_embedding`,
      `${batchId}_finalization`,
    ];

    for (const jobId of jobIds) {
      try {
        await this.jobQueue.cancelJob(jobId);
      } catch (error) {
        this.logger.warn(`Failed to cancel job ${jobId}: ${error}`);
      }
    }

    // Update batch status
    this.updateBatchProgress(batchId, {
      stage: 'failed',
      progress: 0,
      currentOperation: 'Batch cancelled',
    });

    this.activeBatches.delete(batchId);
    this.emit('batchCancelled', { batchId });
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down batch processing service...');

    try {
      // Stop performance monitoring
      if (this.config.processing.enablePerformanceMetrics) {
        this.stopPerformanceMonitoring();
      }

      // Cleanup resource pool
      if (this.config.performance.enableResourcePooling) {
        await this.cleanupResourcePool();
      }

      // Shutdown job queue
      await this.jobQueue.shutdown();

      this.isInitialized = false;
      this.logger.info('Batch processing service shut down successfully');
    } catch (error) {
      this.logger.error(`Error during shutdown: ${error}`);
      throw error;
    }
  }

  /**
   * Setup job queue event handlers
   */
  private setupJobQueueHandlers(): void {
    this.jobQueue.on('jobCompleted', (job: BatchJob, result: JobResult) => {
      if (result.success) {
        this.handleJobCompleted();
      } else {
        this.handleJobFailed(job, result);
      }
    });

    this.jobQueue.on('jobStarted', () => {
      this.handleJobStarted();
    });
  }

  /**
   * Process validation job
   */
  private async processValidationJob(job: BatchJob): Promise<{ validationResults: Array<{ documentId: string; isValid: boolean; errors: string[] }> }> {
    const payload = job.payload as { batchId: string; documents: Array<{ id: string; [key: string]: unknown }>; options: Record<string, unknown> };
    const { batchId, documents } = payload;

    this.updateBatchProgress(batchId, {
      stage: 'validating',
      progress: 10,
      currentOperation: 'Validating documents',
    });

    const validationResults = [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      if (!document) continue;

      try {
        const validatedDocument = await this.validationService.validateMivaaDocument(
          document,
          { partial: false, sanitize: true, trackPerformance: true },
        );
        const isValid = !!validatedDocument;

        validationResults.push({
          documentId: document.id,
          isValid,
          errors: isValid ? [] : ['Content validation failed'],
        });

        this.updateBatchProgress(batchId, {
          progress: 10 + (i / documents.length) * 20,
          currentDocument: i + 1,
          currentOperation: `Validating document ${i + 1}/${documents.length}`,
        });
      } catch (error) {
        validationResults.push({
          documentId: document.id,
          isValid: false,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    return { validationResults };
  }

  /**
   * Process chunking job
   */
  private async processChunkingJob(job: BatchJob): Promise<{ batchId: string; chunkingResults: Array<{ documentId: string; chunks: Array<{ id: string; content: string; metadata: Record<string, unknown> }>; error?: string }> }> {
    const payload = job.payload as { batchId: string; documents: Array<{ id: string; content: string; processingOptions?: { chunkingStrategy?: string }; [key: string]: unknown }> };
    const { batchId, documents } = payload;

    this.updateBatchProgress(batchId, {
      stage: 'chunking',
      progress: 30,
      currentOperation: 'Chunking documents',
    });

    const chunkingResults = [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      if (!document) continue;

      try {
        const strategy = document.processingOptions?.chunkingStrategy || this.config.services.chunking.strategy;

        const documentInput = {
          id: document.id,
          content: document.content,
          metadata: {
            source: 'batch-processing',
            workspaceId: 'default',
            documentId: document.id,
          },
        } as import('../documentChunkingService').DocumentInput;

        const chunks = await this.chunkingService.chunkDocument(
          documentInput,
          {
            type: strategy as 'semantic',
            maxChunkSize: this.config.services.chunking.chunkSize,
            overlapSize: this.config.services.chunking.overlap,
            preserveStructure: true,
          },
        );

        chunkingResults.push({
          documentId: document.id,
          chunks: chunks.chunks.map((chunk, index: number) => ({
            id: `${document.id}_chunk_${index}`,
            content: chunk.content,
            metadata: {
              ...chunk.metadata,
              documentId: document.id,
              chunkIndex: index,
            },
          })),
        });

        this.updateBatchProgress(batchId, {
          progress: 30 + (i / documents.length) * 30,
          currentDocument: i + 1,
          currentOperation: `Chunking document ${i + 1}/${documents.length}`,
        });
      } catch (error) {
        chunkingResults.push({
          documentId: document.id,
          error: error instanceof Error ? error.message : String(error),
          chunks: [],
        });
      }
    }

    return { batchId, chunkingResults };
  }

  /**
   * Process embedding job
   */
  private async processEmbeddingJob(job: BatchJob): Promise<{ batchId: string; embeddingResults: Array<{ chunkId: string; embedding: number[] | null; metadata?: Record<string, unknown>; error?: string }> }> {
    const payload = job.payload as { batchId: string; chunkingJobId: string };
    const { batchId, chunkingJobId } = payload;

    this.updateBatchProgress(batchId, {
      stage: 'embedding',
      progress: 60,
      currentOperation: 'Generating embeddings',
    });

    // Get chunking results from previous job
    const chunkingJob = this.jobQueue.getJob(chunkingJobId);
    if (!chunkingJob) {
      throw new Error('Chunking job not found');
    }

    // Process embeddings in batches
    const embeddingResults: Array<{ chunkId: string; embedding: number[] | null; metadata?: Record<string, unknown>; error?: string }> = [];
    const allChunks: Array<{ id: string; content: string; metadata?: Record<string, unknown> }> = [];

    // Collect all chunks from chunking results
    // This would need to be implemented based on how job results are stored

    // Generate embeddings in batches
    const batchSize = this.config.services.embedding.batchSize;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const chunkBatch = allChunks.slice(i, i + batchSize);

      try {
        const texts = chunkBatch.map(chunk => chunk.content);
        const firstText = texts[0];
        if (!firstText) {
          throw new Error('No text content found in chunk batch');
        }

        const result = await this.embeddingService.generateEmbedding({
          model: 'text-embedding-3-large',
          dimensions: 1536,
          text: firstText,
        });

        if (result.embedding && result.embedding.length > 0) {
          chunkBatch.forEach((chunk) => {
            embeddingResults.push({
              chunkId: chunk.id,
              embedding: result.embedding,
              metadata: chunk.metadata || {},
            });
          });
        } else {
          // Handle embedding generation failure
          chunkBatch.forEach(chunk => {
            embeddingResults.push({
              chunkId: chunk.id,
              error: 'Failed to generate embedding',
              embedding: null,
            });
          });
        }

        this.updateBatchProgress(batchId, {
          progress: 60 + ((i + chunkBatch.length) / allChunks.length) * 30,
          currentOperation: `Generated embeddings for ${i + chunkBatch.length}/${allChunks.length} chunks`,
        });
      } catch (error) {
        // Handle embedding errors
        chunkBatch.forEach(chunk => {
          embeddingResults.push({
            chunkId: chunk.id,
            error: error instanceof Error ? error.message : String(error),
            embedding: null,
          });
        });
      }
    }

    return { batchId, embeddingResults };
  }

  /**
   * Process finalization job
   */
  private async processFinalizationJob(job: BatchJob): Promise<{ success: boolean; batchId: string; summary: Record<string, unknown> }> {
    const payload = job.payload as { batchId: string };
    const { batchId } = payload;

    this.updateBatchProgress(batchId, {
      stage: 'finalizing',
      progress: 90,
      currentOperation: 'Finalizing batch processing',
    });

    // Collect all results and create final batch result
    const batchResult: BatchProcessingResult = {
      batchId,
      status: 'completed',
      totalDocuments: 0,
      processedDocuments: 0,
      failedDocuments: 0,
      results: [],
      metrics: {
        totalProcessingTime: 0,
        averageDocumentTime: 0,
        throughputPerMinute: 0,
        memoryUsage: process.memoryUsage().heapUsed,
        errorRate: 0,
      },
      createdAt: new Date(),
      completedAt: new Date(),
    };

    // Store final result
    this.batchResults.set(batchId, batchResult);

    // Update progress to completed
    this.updateBatchProgress(batchId, {
      stage: 'completed',
      progress: 100,
      currentOperation: 'Batch processing completed',
    });

    // Clean up active batch
    this.activeBatches.delete(batchId);

    // Emit completion event
    this.emit('batchCompleted', { batchId, result: batchResult });

    return {
      success: true,
      batchId,
      summary: {
        totalDocuments: batchResult.totalDocuments,
        processedDocuments: batchResult.processedDocuments,
        failedDocuments: batchResult.failedDocuments,
        processingTime: batchResult.metrics.totalProcessingTime,
      },
    };
  }

  /**
   * Handle job completion
   */
  private handleJobCompleted(): void {
    // Update metrics and cleanup
    this.performanceMetrics.totalBatchesProcessed++;
  }

  /**
   * Handle job failure
   */
  private handleJobFailed(job: BatchJob, result: JobResult): void {
    const payload = job.payload as { batchId: string };
    const batchId = payload.batchId;

    this.logger.error(`Job ${job.id} failed: ${result.error}`);

    this.updateBatchProgress(batchId, {
      stage: 'failed',
      progress: 0,
      currentOperation: 'Job failed',
      errors: [result.error || 'Unknown error'],
    });
  }

  /**
   * Handle job started
   */
  private handleJobStarted(): void {
    // Update metrics
  }

  /**
   * Update batch progress
   */
  private updateBatchProgress(batchId: string, updates: Partial<BatchProgress>): void {
    const current = this.activeBatches.get(batchId);
    if (current) {
      const updated = { ...current, ...updates };
      this.activeBatches.set(batchId, updated);
      this.emit('batchProgress', updated);
    }
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize resource pool
   */
  private async initializeResourcePool(): Promise<void> {
    // Initialize resource pool for performance optimization
    this.resourcePool.set('initialized', true);
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Start monitoring system performance
  }

  /**
   * Stop performance monitoring
   */
  private stopPerformanceMonitoring(): void {
    // Stop monitoring system performance
  }

  /**
   * Cleanup resource pool
   */
  private async cleanupResourcePool(): Promise<void> {
    // Cleanup allocated resources
    this.resourcePool.clear();
  }
}
