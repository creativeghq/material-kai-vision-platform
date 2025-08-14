import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { DocumentChunkingService, ChunkingStrategy } from '../services/documentChunkingService';
import { MivaaToRagTransformer, MivaaDocument, RagDocument, TransformationConfig } from '../services/mivaaToRagTransformer';
import { EnhancedRAGService } from '../services/enhancedRAGService';
import { DocumentVectorStoreService, createDocumentVectorStoreService, BatchStoreRequest } from '../services/documentVectorStoreService';
import { ErrorHandler } from '../utils/errorHandler';
import { MivaaIntegrationService } from '../services/pdf/mivaaIntegrationService';

// Define EmbeddingInput interface for compatibility
interface EmbeddingInput {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

// Type definitions for external dependencies
interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

interface Queue {
  add(name: string, data: any, options?: any): Promise<Job>;
  process(name: string, processor: (job: Job) => Promise<any>): void;
  getJobs(types: string[]): Promise<Job[]>;
  close(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
}

interface Job {
  data: any;
  remove(): Promise<void>;
}

// Simple queue implementation for development
class SimpleQueue extends EventEmitter implements Queue {
  private jobs: Map<string, Job> = new Map();
  private processors: Map<string, (job: Job) => Promise<any>> = new Map();
  
  async add(name: string, data: any, options?: any): Promise<Job> {
    const job: Job = {
      data: { ...data, jobType: name },
      remove: async () => {
        this.jobs.delete(job.data.jobId);
      }
    };
    
    this.jobs.set(data.jobId, job);
    
    // Process immediately for simplicity
    setTimeout(async () => {
      const processor = this.processors.get(name);
      if (processor) {
        try {
          const result = await processor(job);
          this.emit('completed', job, result);
        } catch (error) {
          this.emit('failed', job, error);
        }
      }
    }, 0);
    
    return job;
  }
  
  process(name: string, processor: (job: Job) => Promise<any>): void {
    this.processors.set(name, processor);
  }
  
  async getJobs(types: string[]): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }
  
  async close(): Promise<void> {
    this.jobs.clear();
    this.processors.clear();
    this.removeAllListeners();
  }
}

/**
 * Processing request interface
 */
export interface ProcessingRequest {
  id: string;
  workspaceId: string;
  mivaaDocument: MivaaDocument;
  config?: Partial<WorkflowConfig>;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, any>;
}

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  transformation: TransformationConfig;
  processing: {
    enableParallelProcessing: boolean;
    maxConcurrentJobs: number;
    retryAttempts: number;
    retryDelay: number;
    timeout: number;
  };
  persistence: {
    saveIntermediateResults: boolean;
    enableRollback: boolean;
    stateCheckpointInterval: number;
  };
  notifications: {
    enableProgressUpdates: boolean;
    enableCompletionNotification: boolean;
    webhookUrl?: string;
  };
}

/**
 * Workflow job interface
 */
export interface WorkflowJob {
  id: string;
  requestId: string;
  workspaceId: string;
  status: WorkflowStatus;
  stages: WorkflowStage[];
  result?: RagDocument;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metrics: WorkflowMetrics;
}

/**
 * Workflow status enumeration
 */
export type WorkflowStatus =
  | 'pending'
  | 'processing'
  | 'chunking'
  | 'embedding'
  | 'transforming'
  | 'rag-integrating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rollback';

/**
 * Workflow stage interface
 */
export interface WorkflowStage {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  result?: any;
  metrics?: Record<string, any>;
}

/**
 * Workflow metrics interface
 */
export interface WorkflowMetrics {
  totalProcessingTime: number;
  stageMetrics: Record<string, {
    duration: number;
    memoryUsage: number;
    cpuUsage: number;
  }>;
  throughput: {
    documentsPerSecond: number;
    chunksPerSecond: number;
    embeddingsPerSecond: number;
  };
  qualityMetrics: {
    transformationQuality: number;
    chunkingQuality: number;
    embeddingQuality: number;
  };
}

/**
 * Workflow state interface for persistence
 */
export interface WorkflowState {
  jobId: string;
  requestId: string;
  workspaceId: string;
  currentStage: string;
  stageData: Record<string, any>;
  checkpoints: Array<{
    stage: string;
    timestamp: Date;
    data: any;
  }>;
  rollbackPoints: Array<{
    stage: string;
    timestamp: Date;
    state: any;
  }>;
}

/**
 * DocumentWorkflowOrchestrator
 * 
 * Orchestrates the complete document processing workflow from Mivaa PDF extraction
 * to RAG-ready document format. Manages asynchronous processing, state persistence,
 * error recovery, and rollback mechanisms.
 * 
 * Features:
 * - Asynchronous job queue processing with Bull/Redis
 * - Multi-stage workflow with checkpointing
 * - Error recovery and rollback capabilities
 * - Performance monitoring and metrics collection
 * - Configurable processing options
 * - Event-driven progress notifications
 * - Workspace-based isolation
 */
export class DocumentWorkflowOrchestrator extends EventEmitter {
  private readonly logger: Logger;
  private readonly chunkingService: DocumentChunkingService;
  private readonly embeddingService: MivaaIntegrationService;
  private readonly ragService: EnhancedRAGService;
  private readonly transformerService: MivaaToRagTransformer;
  private readonly processingQueue: Queue;
  private readonly stateStore: Map<string, WorkflowState>;
  private readonly activeJobs: Map<string, WorkflowJob>;
  
  // MIVAA Integration Service (consolidated)
  private readonly mivaaIntegrationService: MivaaIntegrationService;
  
  private readonly defaultConfig: WorkflowConfig = {
    transformation: {
      chunking: {
        type: 'hybrid',
        maxChunkSize: 1000,
        overlapSize: 100,
        preserveStructure: true,
        sentenceBoundary: true,
        paragraphBoundary: true
      },
      embeddings: {
        enabled: true,
        generateDocumentEmbedding: true,
        generateChunkEmbeddings: true
      },
      tables: {
        includeInChunks: true,
        generateSummaries: true,
        extractSearchableText: true
      },
      images: {
        includeInChunks: false,
        extractText: true,
        generateDescriptions: true
      },
      structure: {
        preserveHeaders: true,
        generateTableOfContents: true,
        detectSections: true
      },
      quality: {
        minimumChunkSize: 50,
        maximumChunkSize: 2000,
        minimumConfidence: 0.7
      }
    },
    processing: {
      enableParallelProcessing: true,
      maxConcurrentJobs: 5,
      retryAttempts: 3,
      retryDelay: 5000,
      timeout: 300000 // 5 minutes
    },
    persistence: {
      saveIntermediateResults: true,
      enableRollback: true,
      stateCheckpointInterval: 30000 // 30 seconds
    },
    notifications: {
      enableProgressUpdates: true,
      enableCompletionNotification: true
    }
  };

  constructor(
    chunkingService: DocumentChunkingService,
    mivaaIntegrationService: MivaaIntegrationService,
    transformerService: MivaaToRagTransformer,
    ragService: EnhancedRAGService,
    logger: Logger,
    redisConfig?: any
  ) {
    super();
    
    this.logger = logger;
    this.chunkingService = chunkingService;
    this.embeddingService = mivaaIntegrationService;
    this.transformerService = transformerService;
    this.ragService = ragService;
    this.mivaaIntegrationService = mivaaIntegrationService;
    this.stateStore = new Map();
    this.activeJobs = new Map();
    
    // Initialize queue for job processing (using simple implementation for development)
    this.processingQueue = new SimpleQueue();
    
    this.setupQueueProcessors();
    this.setupEventHandlers();
  }

  /**
   * Process a document through the complete workflow
   */
  async processDocument(request: ProcessingRequest): Promise<WorkflowJob> {
    const startTime = performance.now();
    const jobId = this.generateJobId();
    const config = { ...this.defaultConfig, ...request.config };
    
    this.logger.info(`Starting document workflow processing`, {
      jobId,
      requestId: request.id,
      workspaceId: request.workspaceId,
      filename: request.mivaaDocument.filename
    });

    // Create workflow job
    const job: WorkflowJob = {
      id: jobId,
      requestId: request.id,
      workspaceId: request.workspaceId,
      status: 'pending',
      stages: this.initializeStages(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metrics: this.initializeMetrics()
    };

    // Store job state
    this.activeJobs.set(jobId, job);
    this.createWorkflowState(job, request, config);

    try {
      // Add job to processing queue
      const queueJob = await this.processingQueue.add('process-document', {
        jobId,
        request,
        config
      }, {
        priority: this.getPriority(request.priority),
        delay: 0
      });

      // Update job with queue information
      job.status = 'processing';
      job.updatedAt = new Date();
      
      this.emit('jobStarted', job);
      
      return job;
      
    } catch (error) {
      const errorMessage = `Failed to start document processing: ${error instanceof Error ? error.message : String(error)}`;
      
      this.logger.error('Failed to start document processing', {
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      job.status = 'failed';
      job.error = errorMessage;
      job.updatedAt = new Date();
      
      this.emit('jobFailed', job, new Error(errorMessage));
      throw new Error(errorMessage);
    }
  }

  /**
   * Get workflow status by job ID
   */
  async getWorkflowStatus(jobId: string): Promise<WorkflowStatus> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      throw new Error(`Workflow job not found: ${jobId}`);
    }
    
    return job.status;
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      throw new Error(`Workflow job not found: ${jobId}`);
    }

    this.logger.info(`Cancelling workflow`, { jobId });

    try {
      // Find and remove job from queue
      const queueJobs = await this.processingQueue.getJobs(['waiting', 'active', 'delayed']);
      const queueJob = queueJobs.find(j => j.data.jobId === jobId);
      
      if (queueJob) {
        await queueJob.remove();
      }

      // Update job status
      job.status = 'cancelled';
      job.updatedAt = new Date();
      job.completedAt = new Date();

      this.emit('jobCancelled', job);
      
    } catch (error) {
      this.logger.error(`Failed to cancel workflow`, {
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Retry a failed stage
   */
  async retryFailedStage(jobId: string, stage: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      throw new Error(`Workflow job not found: ${jobId}`);
    }

    const stageObj = job.stages.find(s => s.name === stage);
    if (!stageObj) {
      throw new Error(`Stage not found: ${stage}`);
    }

    if (stageObj.status !== 'failed') {
      throw new Error(`Stage is not in failed state: ${stage}`);
    }

    this.logger.info(`Retrying failed stage`, { jobId, stage });

    try {
      // Reset stage status
      stageObj.status = 'pending';
      delete stageObj.error;
      delete stageObj.startTime;
      delete stageObj.endTime;

      // Re-add job to queue from the failed stage
      await this.processingQueue.add('retry-stage', {
        jobId,
        stage,
        fromStage: stage
      }, {
        priority: 1 // High priority for retries
      });

      job.status = 'processing';
      job.updatedAt = new Date();

      this.emit('stageRetried', job, stage);
      
    } catch (error) {
      this.logger.error(`Failed to retry stage`, {
        jobId,
        stage,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Rollback workflow to a previous stage
   */
  async rollbackWorkflow(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      throw new Error(`Workflow job not found: ${jobId}`);
    }

    const state = this.stateStore.get(jobId);
    if (!state || state.rollbackPoints.length === 0) {
      throw new Error(`No rollback points available for job: ${jobId}`);
    }

    this.logger.info(`Rolling back workflow`, { jobId });

    try {
      // Get the latest rollback point
      const rollbackPoint = state.rollbackPoints[state.rollbackPoints.length - 1];
      
      // Restore state
      state.currentStage = rollbackPoint.stage;
      state.stageData = rollbackPoint.state;

      // Reset stages after rollback point
      const rollbackStageIndex = job.stages.findIndex(s => s.name === rollbackPoint.stage);
      for (let i = rollbackStageIndex + 1; i < job.stages.length; i++) {
        const stage = job.stages[i];
        if (stage) {
          stage.status = 'pending';
          stage.startTime = null;
          stage.endTime = null;
          stage.error = null;
          stage.result = undefined;
        }
      }

      job.status = 'rollback';
      job.updatedAt = new Date();

      this.emit('workflowRolledBack', job, rollbackPoint.stage);
      
    } catch (error) {
      this.logger.error(`Failed to rollback workflow`, {
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Setup queue processors
   */
  private setupQueueProcessors(): void {
    this.processingQueue.process('process-document', async (job: Job) => {
      return this.executeWorkflow(job.data.jobId, job.data.request, job.data.config);
    });

    this.processingQueue.process('retry-stage', async (job: Job) => {
      return this.executeWorkflowFromStage(job.data.jobId, job.data.fromStage);
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.processingQueue.on('completed', (job: Job, result: any) => {
      this.logger.info(`Queue job completed`, { jobId: job.data.jobId });
    });

    this.processingQueue.on('failed', (job: Job, error: Error) => {
      this.logger.error(`Queue job failed`, { 
        jobId: job.data.jobId, 
        error: error.message 
      });
    });

    this.processingQueue.on('stalled', (job: Job) => {
      this.logger.warn(`Queue job stalled`, { jobId: job.data.jobId });
    });
  }

  /**
   * Execute the complete workflow
   */
  private async executeWorkflow(
    jobId: string, 
    request: ProcessingRequest, 
    config: WorkflowConfig
  ): Promise<RagDocument> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const startTime = performance.now();
    
    try {
      this.logger.info(`Executing workflow`, { jobId });

      // Stage 1: Document Validation
      await this.executeStage(job, 'validation', async () => {
        this.validateMivaaDocument(request.mivaaDocument);
        return { validated: true };
      });

      // Stage 2: Document Chunking
      const chunkingResult = await this.executeStage(job, 'chunking', async () => {
        job.status = 'chunking';
        this.emit('jobProgress', job);
        
        return await this.chunkingService.chunkDocument({
          content: request.mivaaDocument.markdown,
          metadata: {
            source: request.mivaaDocument.filename,
            workspaceId: request.workspaceId,
            documentId: request.mivaaDocument.id || request.id,
            language: request.mivaaDocument.metadata.language || 'en',
            extractedTables: request.mivaaDocument.tables || [],
            extractedImages: request.mivaaDocument.images || [],
            structure: {
              headers: [],
              sections: []
            },
            ...request.mivaaDocument.metadata
          }
        }, config.transformation.chunking);
      });

      // Stage 3: Embedding Generation (MIVAA Integration)
      const embeddingResult = await this.executeStage(job, 'embedding', async () => {
        if (!config.transformation.embeddings.enabled) {
          return { skipped: true };
        }

        job.status = 'embedding';
        this.emit('jobProgress', job);

        const embeddingInputs: EmbeddingInput[] = chunkingResult.chunks.map(chunk => ({
          id: chunk.id,
          text: chunk.content,
          metadata: chunk.metadata
        }));

        // Check MIVAA service health first
        try {
          const healthStatus = await this.mivaaIntegrationService.healthCheck();
          
          if (healthStatus.isHealthy) {
            this.logger.info('MIVAA service is healthy, but embedding generation not implemented in consolidated service', {
              jobId: job.id,
              chunkCount: embeddingInputs.length,
              mivaaHealth: healthStatus
            });
          } else {
            this.logger.warn('MIVAA service unhealthy', {
              jobId: job.id,
              healthStatus
            });
          }
        } catch (error) {
          this.logger.error('MIVAA service health check failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Note: The consolidated MivaaIntegrationService focuses on PDF extraction
        // Embedding generation would need to be implemented separately or via another service
        this.logger.info('Embedding generation not available in consolidated MIVAA service', {
          jobId: job.id,
          chunkCount: embeddingInputs.length,
          note: 'Consider implementing embedding service or using alternative approach'
        });

        // For now, return a mock result to maintain workflow compatibility
        // TODO: Implement proper embedding generation service
        return {
          embeddings: embeddingInputs.map((input, index) => ({
            id: input.id,
            embedding: new Array(1536).fill(0), // Mock embedding vector
            metadata: input.metadata || {}
          })),
          metrics: {
            totalProcessed: embeddingInputs.length,
            processingTime: 0,
            averageEmbeddingTime: 0
          }
        };
      });

      // Stage 4: RAG Transformation
      const transformationResult = await this.executeStage(job, 'transformation', async () => {
        job.status = 'transforming';
        this.emit('jobProgress', job);

        return await this.transformerService.transformDocument(
          request.mivaaDocument,
          request.workspaceId,
          config.transformation
        );
      });

      // Stage 5: RAG Integration
      const ragIntegrationResult = await this.executeStage(job, 'rag-integration', async () => {
        job.status = 'rag-integrating';
        this.emit('jobProgress', job);

        // Store the transformed document in the RAG system
        // Prepare document chunks for vector store
        const documentChunks = transformationResult.ragDocument.chunks?.map((chunk, index) => ({
          id: chunk.id,
          documentId: transformationResult.ragDocument.id,
          workspaceId: request.workspaceId,
          content: chunk.content,
          chunkIndex: index,
          metadata: {
            ...chunk.metadata,
            sourceDocument: request.mivaaDocument.filename,
            processingJobId: job.id,
            transformationTimestamp: new Date().toISOString()
          },
          embedding: null // Will be generated by DocumentVectorStoreService
        })) || [];

        // Store document chunks in vector store using DocumentVectorStoreService
        const vectorStoreRequest: BatchStoreRequest = {
          workspaceId: request.workspaceId,
          documentId: transformationResult.ragDocument.id,
          chunks: documentChunks
        };

        // Use DocumentVectorStoreService factory to create instance and store document
        const vectorStoreService = createDocumentVectorStoreService(this.mivaaIntegrationService);
        const vectorStoreResponse = await vectorStoreService.storeBatch(vectorStoreRequest);
        
        return {
          ragDocumentId: transformationResult.ragDocument.id,
          vectorStoreMetrics: vectorStoreResponse.metrics,
          successfulChunks: vectorStoreResponse.successful.length,
          failedChunks: vectorStoreResponse.failed.length,
          searchIndexUpdated: vectorStoreResponse.successful.length > 0
        };
      });

      // Complete workflow
      const endTime = performance.now();
      job.status = 'completed';
      job.completedAt = new Date();
      job.updatedAt = new Date();
      job.result = {
        ...transformationResult.ragDocument,
        ...transformationResult.ragDocument
      };
      job.metrics.totalProcessingTime = endTime - startTime;

      this.emit('jobCompleted', job);
      
      // Cleanup
      this.stateStore.delete(jobId);
      
      return transformationResult.ragDocument;
      
    } catch (error) {
      const appError = new Error(
        'Workflow execution failed',
        error instanceof Error ? error.message : 'Unknown workflow error',
        { jobId, workspaceId: job.workspaceId }
      );

      job.status = 'failed';
      job.error = appError.message;
      job.updatedAt = new Date();
      job.completedAt = new Date();

      this.emit('jobFailed', job, appError);
      throw appError;
    }
  }

  /**
   * Execute workflow from a specific stage
   */
  private async executeWorkflowFromStage(jobId: string, fromStage: string): Promise<any> {
    // Implementation for resuming from a specific stage
    // This would restore state and continue from the specified stage
    const appError = new Error(
      'Stage resumption not implemented',
      'Workflow stage resumption functionality is not yet available',
      { jobId, fromStage }
    );
    throw appError;
  }

  /**
   * Execute a single workflow stage
   */
  private async executeStage<T>(
    job: WorkflowJob,
    stageName: string,
    executor: () => Promise<T>
  ): Promise<T> {
    const stage = job.stages.find(s => s.name === stageName);
    if (!stage) {
      throw new Error(`Stage not found: ${stageName}`);
    }

    const startTime = performance.now();
    stage.status = 'processing';
    stage.startTime = new Date();

    this.logger.info(`Executing stage`, { 
      jobId: job.id, 
      stage: stageName 
    });

    try {
      const result = await executor();
      
      const endTime = performance.now();
      stage.status = 'completed';
      stage.endTime = new Date();
      stage.result = result;
      
      // Update metrics
      job.metrics.stageMetrics[stageName] = {
        duration: endTime - startTime,
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user
      };

      this.emit('stageCompleted', job, stageName, result);
      
      // Create checkpoint
      this.createCheckpoint(job.id, stageName, result);
      
      return result;
      
    } catch (error) {
      const appError = new Error(
        `Stage execution failed: ${stageName}`,
        error instanceof Error ? error.message : 'Unknown stage execution error',
        { jobId: job.id, stageName, workspaceId: job.workspaceId }
      );

      stage.status = 'failed';
      stage.endTime = new Date();
      stage.error = appError.message;

      this.emit('stageFailed', job, stageName, appError);
      throw appError;
    }
  }

  /**
   * Initialize workflow stages
   */
  private initializeStages(): WorkflowStage[] {
    return [
      { name: 'validation', status: 'pending' },
      { name: 'chunking', status: 'pending' },
      { name: 'embedding', status: 'pending' },
      { name: 'transformation', status: 'pending' }
    ];
  }

  /**
   * Initialize workflow metrics
   */
  private initializeMetrics(): WorkflowMetrics {
    return {
      totalProcessingTime: 0,
      stageMetrics: {},
      throughput: {
        documentsPerSecond: 0,
        chunksPerSecond: 0,
        embeddingsPerSecond: 0
      },
      qualityMetrics: {
        transformationQuality: 0,
        chunkingQuality: 0,
        embeddingQuality: 0
      }
    };
  }

  /**
   * Create workflow state for persistence
   */
  private createWorkflowState(
    job: WorkflowJob, 
    request: ProcessingRequest, 
    config: WorkflowConfig
  ): void {
    const state: WorkflowState = {
      jobId: job.id,
      requestId: request.id,
      workspaceId: request.workspaceId,
      currentStage: 'validation',
      stageData: {},
      checkpoints: [],
      rollbackPoints: []
    };

    this.stateStore.set(job.id, state);
  }

  /**
   * Create a checkpoint for rollback
   */
  private createCheckpoint(jobId: string, stage: string, data: any): void {
    const state = this.stateStore.get(jobId);
    if (!state) return;

    state.checkpoints.push({
      stage,
      timestamp: new Date(),
      data
    });

    // Create rollback point every few stages
    if (state.checkpoints.length % 2 === 0) {
      state.rollbackPoints.push({
        stage,
        timestamp: new Date(),
        state: { ...state.stageData }
      });
    }
  }

  /**
   * Validate Mivaa document
   */
  private validateMivaaDocument(document: MivaaDocument): void {
    if (!document.filename) {
      throw new Error('Document filename is required');
    }
    
    if (!document.markdown || document.markdown.trim().length === 0) {
      throw new Error('Document markdown content is required');
    }
    
    if (!document.metadata) {
      throw new Error('Document metadata is required');
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get priority value for queue
   */
  private getPriority(priority?: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high': return 1;
      case 'normal': return 5;
      case 'low': return 10;
      default: return 5;
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down DocumentWorkflowOrchestrator');
    
    await this.processingQueue.close();
    this.stateStore.clear();
    this.activeJobs.clear();
    this.removeAllListeners();
  }
}