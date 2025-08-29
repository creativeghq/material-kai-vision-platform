/**
 * Service Interface Contracts for Dependency Injection
 *
 * This module defines the interface contracts for all services that will be registered
 * with the DI container. These interfaces enable loose coupling and testability by
 * allowing services to depend on abstractions rather than concrete implementations.
 */

import { EventEmitter } from 'events';

// ============================================================================
// COMMON TYPES AND INTERFACES
// ============================================================================

/**
 * Common logger interface used across all services
 */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Health check result interface
 */
export interface IHealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Base service interface that all services should implement
 */
export interface IBaseService {
  /**
   * Initialize the service (called after DI container setup)
   */
  initialize?(): Promise<void>;

  /**
   * Perform health check on the service
   */
  healthCheck(): Promise<IHealthCheckResult>;

  /**
   * Cleanup resources when service is disposed
   */
  dispose?(): Promise<void>;
}

// ============================================================================
// DOCUMENT CHUNKING SERVICE INTERFACE
// ============================================================================

/**
 * Chunking strategy configuration
 */
export interface IChunkingStrategy {
  type: 'fixed-size' | 'semantic' | 'hybrid';
  maxChunkSize: number;
  overlapSize: number;
  preserveStructure: boolean;
  sentenceBoundary?: boolean;
  paragraphBoundary?: boolean;
}

/**
 * Position information for a chunk within the document
 */
export interface IChunkPosition {
  startIndex: number;
  endIndex: number;
  pageNumber?: number;
  sectionId?: string;
  paragraphIndex?: number;
}

/**
 * Metadata associated with a document chunk
 */
export interface IChunkMetadata {
  source: string;
  workspaceId: string;
  documentId?: string;
  chunkIndex: number;
  totalChunks: number;
  extractedAt: Date;
  language?: string;
  contentType: 'text' | 'table' | 'image' | 'mixed';
  headers?: string[];
  tableData?: Record<string, unknown>;
  imageMetadata?: Record<string, unknown>;
  quality: {
    completeness: number;
    coherence: number;
    readability: number;
  };
}

/**
 * Document chunk with content, metadata, and position information
 */
export interface IDocumentChunk {
  id: string;
  content: string;
  metadata: IChunkMetadata;
  position: IChunkPosition;
  embeddings?: number[];
  hash: string;
}

/**
 * Input document for chunking
 */
export interface IDocumentInput {
  content: string;
  metadata: {
    source: string;
    workspaceId: string;
    documentId?: string;
    language?: string;
    extractedTables?: Record<string, unknown>[];
    extractedImages?: Record<string, unknown>[];
    structure?: {
      headers: string[];
      sections: Array<{
        id: string;
        title: string;
        startIndex: number;
        endIndex: number;
      }>;
    };
  };
}

/**
 * Chunking result with chunks and performance metrics
 */
export interface IChunkingResult {
  chunks: IDocumentChunk[];
  metrics: {
    totalProcessingTime: number;
    chunksGenerated: number;
    averageChunkSize: number;
    overlapEfficiency: number;
    qualityScore: number;
    memoryUsage: number;
  };
  success: boolean;
  errors?: string[];
}

/**
 * Document Chunking Service Interface
 */
export interface IDocumentChunkingService extends IBaseService {
  /**
   * Chunk a document using the specified strategy
   */
  chunkDocument(
    document: IDocumentInput,
    strategy: IChunkingStrategy
  ): Promise<IChunkingResult>;

  /**
   * Validate chunking strategy configuration
   */
  validateStrategy(strategy: IChunkingStrategy): boolean;

  /**
   * Get supported chunking strategies
   */
  getSupportedStrategies(): string[];

  /**
   * Calculate optimal chunk size for given content
   */
  calculateOptimalChunkSize(content: string): number;
}

// ============================================================================
// EMBEDDING GENERATION SERVICE INTERFACE
// ============================================================================

/**
 * Input interface for embedding generation
 */
export interface IEmbeddingInput {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Output interface for generated embeddings
 */
export interface IEmbeddingOutput {
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
}

/**
 * Batch processing result interface
 */
export interface IBatchEmbeddingResult {
  successful: IEmbeddingOutput[];
  failed: Array<{
    id: string;
    error: string;
    input: IEmbeddingInput;
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
 * Embedding Generation Service Interface
 */
export interface IEmbeddingGenerationService extends IBaseService {
  /**
   * Generate embedding for a single text input
   */
  generateEmbedding(input: IEmbeddingInput): Promise<IEmbeddingOutput>;

  /**
   * Generate embeddings for multiple text inputs (batch processing)
   */
  generateEmbeddings(inputs: IEmbeddingInput[]): Promise<IBatchEmbeddingResult>;

  /**
   * Get embedding dimensions for the current model
   */
  getEmbeddingDimensions(): number;

  /**
   * Get current model information
   */
  getModelInfo(): {
    name: string;
    dimensions: number;
    maxTokens: number;
  };

  /**
   * Clear embedding cache
   */
  clearCache(): Promise<void>;

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    totalRequests: number;
  };
}

// ============================================================================
// MIVAA TO RAG TRANSFORMER SERVICE INTERFACE
// ============================================================================

/**
 * Mivaa document structure from PDF extractor
 */
export interface IMivaaDocument {
  id?: string;
  filename: string;
  markdown: string;
  tables: ITableData[];
  images: IImageMetadata[];
  metadata: IMivaaDocumentMetadata;
  extractionTimestamp: string;
  processingStats?: {
    pages: number;
    processingTime: number;
    extractionQuality: number;
  };
}

/**
 * Table data extracted by Mivaa
 */
export interface ITableData {
  id: string;
  caption?: string;
  headers: string[];
  rows: string[][];
  position: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  format: 'csv' | 'json' | 'markdown';
  rawData?: string;
}

/**
 * Image metadata from Mivaa extraction
 */
export interface IImageMetadata {
  id: string;
  filename: string;
  caption?: string;
  altText?: string;
  position: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  format: string;
  size: number;
  url?: string;
  base64?: string;
  extractedText?: string;
  confidence: number;
}

/**
 * Mivaa document metadata
 */
export interface IMivaaDocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pages: number;
  language?: string;
  keywords?: string[];
  extractionMethod: string;
  confidence: number;
  processingVersion: string;
}

/**
 * RAG-compatible document structure
 */
export interface IRagDocument {
  id: string;
  title: string;
  content: string;
  chunks: IDocumentChunk[];
  metadata: IRagMetadata;
  workspace: string;
  embeddings?: {
    document: number[];
    chunks: Array<{
      chunkId: string;
      embedding: number[];
    }>;
  };
  tables?: IProcessedTableData[];
  images?: IProcessedImageData[];
  structure?: IDocumentStructure;
  quality?: IQualityMetrics;
}

/**
 * RAG metadata interface
 */
export interface IRagMetadata {
  source: IMivaaDocumentMetadata;
  transformation: {
    timestamp: string;
    version: string;
    strategy: string;
  };
  processing: {
    chunksGenerated: number;
    tablesProcessed: number;
    imagesProcessed: number;
    totalProcessingTime: number;
  };
  quality: {
    overallScore: number;
    contentQuality: number;
    structurePreservation: number;
    metadataCompleteness: number;
  };
}

/**
 * Processed table data interface
 */
export interface IProcessedTableData {
  id: string;
  originalTable: ITableData;
  searchableText: string;
  summary?: string;
  structuredData: Record<string, unknown>;
  includeInChunks: boolean;
}

/**
 * Processed image data interface
 */
export interface IProcessedImageData {
  id: string;
  originalImage: IImageMetadata;
  description?: string;
  extractedText?: string;
  includeInChunks: boolean;
  searchableContent: string;
}

/**
 * Document structure interface
 */
export interface IDocumentStructure {
  tableOfContents: Array<{
    level: number;
    title: string;
    chunkIds: string[];
  }>;
  sections: Array<{
    id: string;
    title: string;
    startChunkIndex: number;
    endChunkIndex: number;
  }>;
  headers: string[];
}

/**
 * Quality metrics interface
 */
export interface IQualityMetrics {
  contentPreservation: number;
  structureIntegrity: number;
  metadataCompleteness: number;
  chunkingQuality: number;
  overallScore: number;
}

/**
 * Transformation configuration interface
 */
export interface ITransformationConfig {
  chunking: IChunkingStrategy;
  embeddings: {
    enabled: boolean;
    generateDocumentEmbedding: boolean;
    generateChunkEmbeddings: boolean;
  };
  tables: {
    includeInChunks: boolean;
    generateSummaries: boolean;
    extractSearchableText: boolean;
  };
  images: {
    includeInChunks: boolean;
    extractText: boolean;
    generateDescriptions: boolean;
  };
  structure: {
    preserveHeaders: boolean;
    generateTableOfContents: boolean;
    detectSections: boolean;
  };
  quality: {
    minimumChunkSize: number;
    maximumChunkSize: number;
    minimumConfidence: number;
  };
}

/**
 * Transformation result interface
 */
export interface ITransformationResult {
  ragDocument: IRagDocument;
  metrics: {
    processingTime: number;
    chunksGenerated: number;
    tablesProcessed: number;
    imagesProcessed: number;
    qualityScore: number;
  };
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Mivaa to RAG Transformer Service Interface
 */
export interface IMivaaToRagTransformerService extends IBaseService {
  /**
   * Transform a Mivaa document to RAG format
   */
  transformToRag(
    mivaaDocument: IMivaaDocument,
    workspaceId: string,
    documentId: string,
    config: ITransformationConfig
  ): Promise<ITransformationResult>;

  /**
   * Validate transformation configuration
   */
  validateConfig(config: ITransformationConfig): boolean;

  /**
   * Get default transformation configuration
   */
  getDefaultConfig(): ITransformationConfig;

  /**
   * Extract title from Mivaa document
   */
  extractTitle(mivaaDocument: IMivaaDocument): string;

  /**
   * Calculate quality metrics for transformation
   */
  calculateQualityMetrics(
    mivaaDocument: IMivaaDocument,
    ragDocument: IRagDocument
  ): IQualityMetrics;
}

// ============================================================================
// BATCH PROCESSING SERVICE INTERFACE
// ============================================================================

/**
 * Document input for batch processing
 */
export interface IBatchDocumentInput {
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
    priority?: 'low' | 'normal' | 'high';
    chunkingStrategy?: 'fixed-size' | 'semantic' | 'hybrid';
    skipValidation?: boolean;
    customMetadata?: Record<string, unknown>;
  };
}

/**
 * Batch processing result
 */
export interface IBatchProcessingResult {
  batchId: string;
  status: 'completed' | 'partial' | 'failed';
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  results: Array<{
    documentId: string;
    status: 'success' | 'failed';
    result?: unknown;
    error?: string;
    processingTime: number;
  }>;
  metrics: {
    totalProcessingTime: number;
    averageDocumentTime: number;
    throughput: number;
    memoryUsage: number;
    cacheHitRate: number;
  };
  startTime: Date;
  endTime?: Date;
}

/**
 * Batch job interface
 */
export interface IBatchJob {
  id: string;
  documents: IBatchDocumentInput[];
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: {
    processed: number;
    total: number;
    currentDocument?: string;
    currentOperation?: string;
  };
  config: {
    maxConcurrency: number;
    timeoutMs: number;
    retryAttempts: number;
  };
}

/**
 * Batch Processing Service Interface
 */
export interface IBatchProcessingService extends IBaseService, EventEmitter {
  /**
   * Submit a batch of documents for processing
   */
  submitBatch(
    documents: IBatchDocumentInput[],
    options?: {
      priority?: 'low' | 'normal' | 'high';
      maxConcurrency?: number;
      timeoutMs?: number;
    }
  ): Promise<string>; // Returns batch ID

  /**
   * Get batch processing status
   */
  getBatchStatus(batchId: string): Promise<IBatchJob | null>;

  /**
   * Get batch processing result
   */
  getBatchResult(batchId: string): Promise<IBatchProcessingResult | null>;

  /**
   * Cancel a batch job
   */
  cancelBatch(batchId: string): Promise<boolean>;

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    totalBatchesProcessed: number;
    totalDocumentsProcessed: number;
    averageBatchTime: number;
    systemLoad: number;
    memoryUsage: number;
  };

  /**
   * Pause batch processing
   */
  pause(): Promise<void>;

  /**
   * Resume batch processing
   */
  resume(): Promise<void>;

  /**
   * Get processing status
   */
  isProcessing(): boolean;
}

// ============================================================================
// DOCUMENT INTEGRATION SERVICE INTERFACE
// ============================================================================

/**
 * Workspace context for multi-tenant support
 */
export interface IWorkspaceContext {
  workspaceId: string;
  userId: string;
  permissions: string[];
  settings?: Record<string, unknown>;
}

/**
 * JWT authentication token structure
 */
export interface IAuthToken {
  token: string;
  expiresAt: Date;
  refreshToken?: string;
}

/**
 * Document processing request structure
 */
export interface IDocumentProcessingRequest {
  file: File;
  workspaceContext: IWorkspaceContext;
  options?: {
    extractTables?: boolean;
    extractImages?: boolean;
    preserveLayout?: boolean;
    generateEmbeddings?: boolean;
    chunkSize?: number;
    overlap?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Document processing status tracking
 */
export interface IDocumentProcessingStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep: string;
  startTime: string;
  endTime?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    filename: string;
    fileSize: number;
    totalSteps: number;
    completedSteps: number;
    workspaceId: string;
    userId: string;
  };
}

/**
 * Document processing result
 */
export interface IDocumentProcessingResult {
  success: boolean;
  processingId: string;
  documentId: string;
  mivaaResponse: {
    markdownContent: string;
    extractedTables: Record<string, unknown>[];
    extractedImages: Record<string, unknown>[];
    metadata: Record<string, unknown>;
  };
  ragIntegration: {
    knowledgeEntries: string[];
    embeddings?: number[][];
    chunks: Record<string, unknown>[];
  };
  processingTime: number;
  statistics: {
    totalPages: number;
    totalChunks: number;
    totalTables: number;
    totalImages: number;
    averageChunkSize: number;
  };
  qualityMetrics: {
    extractionQuality: number;
    chunkingQuality: number;
    overallQuality: number;
  };
}

/**
 * Circuit breaker state for resilient service communication
 */
export interface ICircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

/**
 * Performance metrics tracking
 */
export interface IPerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  lastUpdated: Date;
}

/**
 * Document Integration Service Interface
 *
 * Main orchestration service for PDF-to-RAG workflow integration.
 * Bridges the Mivaa PDF extractor microservice with the existing RAG system.
 */
export interface IDocumentIntegrationService extends IBaseService {
  /**
   * Process a document through the complete Mivaa -> RAG pipeline
   */
  processDocument(request: IDocumentProcessingRequest): Promise<IDocumentProcessingResult>;

  /**
   * Get processing status by ID
   */
  getProcessingStatus(processingId: string): IDocumentProcessingStatus | null;

  /**
   * Cancel processing by ID
   */
  cancelProcessing(processingId: string): Promise<boolean>;

  /**
   * Get service health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    circuitBreaker: ICircuitBreakerState;
    performanceMetrics: IPerformanceMetrics;
    activeProcessing: number;
  };
}

// ============================================================================
// VALIDATION INTEGRATION SERVICE INTERFACE
// ============================================================================

/**
 * Validation result interface
 */
export interface IValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  warnings: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  metadata: {
    validatedAt: Date;
    validationTime: number;
    rulesApplied: string[];
  };
}

/**
 * Validation Integration Service Interface
 */
export interface IValidationIntegrationService extends IBaseService {
  /**
   * Validate document input
   */
  validateDocument(document: IDocumentInput): Promise<IValidationResult>;

  /**
   * Validate batch input
   */
  validateBatch(documents: IBatchDocumentInput[]): Promise<IValidationResult>;

  /**
   * Validate chunking result
   */
  validateChunkingResult(result: IChunkingResult): Promise<IValidationResult>;

  /**
   * Validate embedding result
   */
  validateEmbeddingResult(result: IEmbeddingOutput): Promise<IValidationResult>;

  /**
   * Get validation rules
   */
  getValidationRules(): string[];

  /**
   * Enable/disable strict validation mode
   */
  setStrictMode(enabled: boolean): void;

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    totalValidations: number;
    successRate: number;
    averageValidationTime: number;
    commonErrors: Array<{
      code: string;
      count: number;
      message: string;
    }>;
  };
}
