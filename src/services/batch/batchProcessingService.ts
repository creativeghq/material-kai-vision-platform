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
export interface BatchDocumentInput {
  id: string;
  content: string;
  metadata: {
    filename: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
    workspaceId: string;
    userId?: string;
    tags?: string[];
  };
  processingOptions?: {
    priority?: JobPriority;
    chunkingStrategy?: 'fixed-size' | 'semantic' | 'hybrid';
    skipValidation?: boolean;
    customMetadata?: Record<string, any>;
  };
}

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
  batchId: string;
  status: 'completed' | 'partial' | 'failed';
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  results: Array<{
    documentId: string;
    status: 'success' | 'failed';
    chunks?: Array<{
      id: string;
      content: string;
      embedding: number[];
      metadata: Record<string, any>;
    }>;
    error?: string;
    processingTime: number;
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
 * Progress tracking interface
 */
export interface BatchProgress {
  batchId: string;
  stage: 'queued' | 'validating' | 'chunking' | 'embedding' | 'finalizing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentDocument: number;
  totalDocuments: number;
  estimatedTimeRemaining?: number;
  currentOperation?: string;
  errors: string[];
  warnings: string[];
  lastUpdated: Date;
}

/**
 * Job types for the PDF transformation pipeline
 */
export type BatchJobType =
  | 'batch_validate_documents'
  | 'batch_chunk_documents'
  | 'batch_generate_embeddings'
  | 'batch_finalize_processing';

/**
 * Main batch processing service that orchestrates the entire PDF to RAG transformation pipeline
 */
export class BatchProcessingService extends EventEmitter {
  private readonly config: BatchProcessingConfig;
  private readonly jobQueue: BatchJobQueue;
  private readonly chunkingService: DocumentChunkingService;
  private readonly embeddingService: MivaaEmbeddingIntegration;
  private readonly logger: Logger;
  private readonly validationService: ValidationIntegrationService;

  private readonly activeBatches: Map<string, BatchProgress> = new Map();
  private readonly batchResults: Map<string, BatchProcessingResult> = new Map();
  private readonly resourcePool: Map<string, any> = new Map();

  private isInitialized = false;
  private performanceMetrics: {
    totalBatchesProcessed: number;
    totalDocumentsProcessed: number;
    averageBatchTime: number;
    systemLoad: number;
    memoryUsage: number;
  } = {
    totalBatchesProcessed: 0,
    totalDocumentsProcessed: 0,
    averageBatchTime: 0,
    systemLoad: 0,
    memoryUsage: 0,
  };

  constructor(config: Partial<BatchProcessingConfig> = {}) {
    super();

    // Initialize logger first
    this.logger = {
      info: (message: string) => console.log(`[INFO] ${message}`),
      error: (message: string) => console.error(`[ERROR] ${message}`),
      warn: (message: string) => console.warn(`[WARN] ${message}`),
      debug: (message: string) => console.debug(`[DEBUG] ${message}`),
    };

    this.config = {
      queue: {
        maxSize: 1000,
        maxConcurrency: 5,
        defaultPriority: 'normal',
        retryPolicy: {
          maxAttempts: 3,
          baseDelay: 2000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitterEnabled: true,
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
          strategy: 'hybrid',
          chunkSize: 1000,
          overlap: 200,
        },
        embedding: {
          batchSize: 50,
          enableCaching: true,
          rateLimitRpm: 3000,
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
        tempDirectory: './temp/batch',
        cleanupAfterMs: 3600000, // 1 hour
        enableCompression: true,
      },
      ...config,
    };

    this.jobQueue = new BatchJobQueue(this.config.queue);
    this.chunkingService = new DocumentChunkingService();

    // Initialize MIVAA embedding integration service
    this.embeddingService = new MivaaEmbeddingIntegration();


    // ValidationIntegrationService is a singleton
    this.validationService = ValidationIntegrationService.getInstance();

    this.setupEventHandlers();
    this.setupJobProcessors();
  }

  /**
   * Initialize the batch processing service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Services are initialized in their constructors - no initialize methods needed

      // Setup resource pooling if enabled
      if (this.config.performance.enableResourcePooling) {
        await this.initializeResourcePool();
      }

      // Start performance monitoring
      if (this.config.processing.enablePerformanceMetrics) {
        this.startPerformanceMonitoring();
      }

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', new Error(`Failed to initialize batch processing service: ${error instanceof Error ? error.message : String(error)}`));
      throw error;
    }
  }

  /**
   * Process a batch of documents
   */
  async processBatch(
    documents: BatchDocumentInput[],
    options: {
      batchId?: string;
      priority?: JobPriority;
      workspaceId: string;
      userId?: string;
      tags?: string[];
    },
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (documents.length === 0) {
      throw new Error('Cannot process empty batch');
    }

    if (documents.length > this.config.processing.maxDocumentsPerBatch) {
      throw new Error(`Batch size exceeds maximum limit of ${this.config.processing.maxDocumentsPerBatch}`);
    }

    const batchId = options.batchId || this.generateBatchId();
    const priority = options.priority || 'normal';

    // Initialize batch progress tracking
    const progress: BatchProgress = {
      batchId,
      stage: 'queued',
      progress: 0,
      currentDocument: 0,
      totalDocuments: documents.length,
      currentOperation: 'Initializing batch',
      errors: [],
      warnings: [],
      lastUpdated: new Date(),
    };

    this.activeBatches.set(batchId, progress);

    try {
      // Create batch processing jobs
      const jobIds = await this.createBatchJobs(batchId, documents, {
        priority,
        workspaceId: options.workspaceId,
        ...(options.userId && { userId: options.userId }),
        ...(options.tags && { tags: options.tags }),
      });

      this.emit('batchStarted', { batchId, documentCount: documents.length, jobIds });

      return batchId;
    } catch (error) {
      this.updateBatchProgress(batchId, {
        stage: 'failed',
        progress: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      });

      this.emit('batchFailed', { batchId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get batch progress
   */
  getBatchProgress(batchId: string): BatchProgress | null {
    return this.activeBatches.get(batchId) || null;
  }

  /**
   * Get batch result
   */
  getBatchResult(batchId: string): BatchProcessingResult | null {
    return this.batchResults.get(batchId) || null;
  }

  /**
   * Cancel a batch
   */
  async cancelBatch(batchId: string): Promise<boolean> {
    const progress = this.activeBatches.get(batchId);
    if (!progress) {
      return false;
    }

    try {
      // Cancel all related jobs
      const jobs = this.jobQueue.getJobsByWorkspace(batchId);
      const cancelPromises = jobs.map(job => this.jobQueue.cancelJob(job.id));
      await Promise.all(cancelPromises);

      this.updateBatchProgress(batchId, {
        stage: 'failed',
        progress: progress.progress,
        errors: [...progress.errors, 'Batch cancelled by user'],
      });

      this.emit('batchCancelled', { batchId });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', new Error(`Failed to cancel batch ${batchId}: ${errorMessage}`));
      return false;
    }
  }

  /**
   * Get service metrics
   */
  getMetrics(): {
    queue: any;
    performance: PerformanceMetrics;
    activeBatches: number;
    completedBatches: number;
  } {
    return {
      queue: this.jobQueue.getMetrics(),
      performance: { ...this.performanceMetrics },
      activeBatches: this.activeBatches.size,
      completedBatches: this.batchResults.size,
    };
  }

  /**
   * Cleanup completed batches and temporary files
   */
  async cleanup(olderThanMs: number = this.config.storage.cleanupAfterMs): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    let cleaned = 0;

    // Clean completed batch results
    for (const [batchId, result] of this.batchResults.entries()) {
      if (result.createdAt < cutoff) {
        this.batchResults.delete(batchId);
        cleaned++;
      }
    }

    // Clean job queue
    const queueCleaned = this.jobQueue.cleanup(olderThanMs);

    this.emit('cleanup', { batchesCleaned: cleaned, jobsCleaned: queueCleaned });

    return cleaned + queueCleaned;
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    try {
      // Stop performance monitoring
      this.stopPerformanceMonitoring();

      // Shutdown job queue
      await this.jobQueue.shutdown();

      // Cleanup resource pool
      if (this.config.performance.enableResourcePooling) {
        await this.cleanupResourcePool();
      }

      this.emit('shutdown');
    } catch (error) {
      this.emit('error', new Error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`));
      throw error;
    }
  }

  /**
   * Setup event handlers for job queue and services
   */
  private setupEventHandlers(): void {
    this.jobQueue.on('jobCompleted', () => {
      this.handleJobCompleted();
    });

    this.jobQueue.on('jobFailed', (job: BatchJob, result: JobResult) => {
      this.handleJobFailed(job, result);
    });

    this.jobQueue.on('jobStarted', () => {
      this.handleJobStarted();
    });
  }

  /**
   * Setup job processors for different batch job types
   */
  private setupJobProcessors(): void {
    this.jobQueue.registerProcessor('batch_validate_documents', async (job: BatchJob) => {
      return this.processValidationJob(job);
    });

    this.jobQueue.registerProcessor('batch_chunk_documents', async (job: BatchJob) => {
      return this.processChunkingJob(job);
    });

    this.jobQueue.registerProcessor('batch_generate_embeddings', async (job: BatchJob) => {
      return this.processEmbeddingJob(job);
    });

    this.jobQueue.registerProcessor('batch_finalize_processing', async (job: BatchJob) => {
      return this.processFinalizationJob(job);
    });
  }

  /**
   * Create batch processing jobs
   */
  private async createBatchJobs(
    batchId: string,
    documents: BatchDocumentInput[],
    options: {
      priority: JobPriority;
      workspaceId: string;
      userId?: string;
      tags?: string[];
    },
  ): Promise<string[]> {
    const jobIds: string[] = [];

    // Create validation job if enabled
    if (this.config.services.validation.enabled) {
      const validationJobId = await this.jobQueue.addJob(
        'batch_validate_documents',
        { batchId, documents },
        {
          priority: options.priority,
          workspaceId: batchId,
          ...(options.userId && { userId: options.userId }),
          source: 'batch-processing',
          tags: ['validation', ...(options.tags || [])],
        },
      );
      jobIds.push(validationJobId);
    }

    // Create chunking job
    const chunkingJobId = await this.jobQueue.addJob(
      'batch_chunk_documents',
      { batchId, documents },
      {
        priority: options.priority,
        workspaceId: batchId,
        ...(options.userId && { userId: options.userId }),
        source: 'batch-processing',
        ...(this.config.services.validation.enabled && jobIds.length > 0 && jobIds[0] && { dependencies: [jobIds[0]] }),
        tags: ['chunking', ...(options.tags || [])],
      },
    );
    jobIds.push(chunkingJobId);

    // Create embedding job
    const embeddingJobId = await this.jobQueue.addJob(
      'batch_generate_embeddings',
      { batchId, chunkingJobId },
      {
        priority: options.priority,
        workspaceId: batchId,
        ...(options.userId && { userId: options.userId }),
        source: 'batch-processing',
        dependencies: [chunkingJobId],
        tags: ['embedding', ...(options.tags || [])],
      },
    );
    jobIds.push(embeddingJobId);

    // Create finalization job
    const finalizationJobId = await this.jobQueue.addJob(
      'batch_finalize_processing',
      { batchId, embeddingJobId },
      {
        priority: options.priority,
        workspaceId: batchId,
        ...(options.userId && { userId: options.userId }),
        source: 'batch-processing',
        dependencies: [embeddingJobId],
        tags: ['finalization', ...(options.tags || [])],
      },
    );
    jobIds.push(finalizationJobId);

    return jobIds;
  }

  /**
   * Process validation job
   */
  private async processValidationJob(job: BatchJob): Promise<any> {
    const { batchId, documents } = job.payload;

    this.updateBatchProgress(batchId, {
      stage: 'validating',
      progress: 10,
      currentOperation: 'Validating documents',
    });

    const validationResults = [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];

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

    return { batchId, validationResults };
  }

  /**
   * Process chunking job
   */
  private async processChunkingJob(job: BatchJob): Promise<any> {
    const { batchId, documents } = job.payload;

    this.updateBatchProgress(batchId, {
      stage: 'chunking',
      progress: 30,
      currentOperation: 'Chunking documents',
    });

    const chunkingResults = [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];

      try {
        const strategy = document.processingOptions?.chunkingStrategy || this.config.services.chunking.strategy;

        const chunks = await this.chunkingService.chunkDocument(
          document.content,
          {
            type: strategy,
            maxChunkSize: this.config.services.chunking.chunkSize,
            overlapSize: this.config.services.chunking.overlap,
            preserveStructure: true,
          },
        );

        chunkingResults.push({
          documentId: document.id,
          chunks: chunks.chunks.map((chunk: any, index: number) => ({
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
  private async processEmbeddingJob(job: BatchJob): Promise<any> {
    const { batchId, chunkingJobId } = job.payload;

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
    const embeddingResults: any[] = [];
    const allChunks: any[] = [];

    // Collect all chunks from chunking results
    // This would need to be implemented based on how job results are stored

    // Generate embeddings in batches
    const batchSize = this.config.services.embedding.batchSize;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const chunkBatch = allChunks.slice(i, i + batchSize);

      try {
        const texts = chunkBatch.map(chunk => chunk.content);
        const result = await this.embeddingService.generateEmbeddings({
          model: 'text-embedding-3-large',
          dimensions: 1536,
          texts: texts,
          cache_ttl: 3600,
          metadata: {
            source: 'batch-processing',
            batch_id: batchId,
            chunk_count: texts.length,
          },
        });

        if (result.embeddings && result.embeddings.length > 0) {
          chunkBatch.forEach((chunk, index) => {
            embeddingResults.push({
              chunkId: chunk.id,
              embedding: result.embeddings[index],
              metadata: chunk.metadata,
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
  private async processFinalizationJob(job: BatchJob): Promise<any> {
    const { batchId } = job.payload;

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

    // Remove from active batches
    this.activeBatches.delete(batchId);

    this.emit('batchCompleted', { batchId, result: batchResult });

    return batchResult;
  }

  /**
   * Handle job completion
   */
  private handleJobCompleted(): void {
    // Update batch progress based on job type
    // Implementation depends on job coordination logic
  }

  /**
   * Handle job failure
   */
  private handleJobFailed(job: BatchJob, result: JobResult): void {
    const batchId = job.payload.batchId;
    if (batchId) {
      this.updateBatchProgress(batchId, {
        errors: [`Job ${job.type} failed: ${result.error}`],
      });
    }
  }

  /**
   * Handle job start
   */
  private handleJobStarted(): void {
    // Update batch progress when jobs start
    // Implementation depends on job coordination logic
  }

  /**
   * Update batch progress
   */
  private updateBatchProgress(batchId: string, updates: Partial<BatchProgress>): void {
    const current = this.activeBatches.get(batchId);
    if (!current) return;

    const updated: BatchProgress = {
      ...current,
      ...updates,
      lastUpdated: new Date(),
    };

    this.activeBatches.set(batchId, updated);
    this.emit('progressUpdated', updated);
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `batch_${timestamp}_${random}`;
  }

  /**
   * Initialize resource pool
   */
  private async initializeResourcePool(): Promise<void> {
    // Initialize shared resources for performance optimization
    // This could include connection pools, cached models, etc.
  }

  /**
   * Cleanup resource pool
   */
  private async cleanupResourcePool(): Promise<void> {
    // Cleanup shared resources
    this.resourcePool.clear();
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Implement performance monitoring logic
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Stop performance monitoring
   */
  private stopPerformanceMonitoring(): void {
    // Stop performance monitoring
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    this.performanceMetrics.memoryUsage = process.memoryUsage().heapUsed;
    // Update other metrics
  }
}
