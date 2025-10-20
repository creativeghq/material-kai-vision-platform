import { z } from 'zod';

import { MivaaIntegrationService, PdfExtractionRequest, defaultMivaaConfig } from '../../services/pdf/mivaaIntegrationService';
import { apiGatewayService } from '../../services/apiGateway/apiGatewayService';
import { JWTAuthMiddleware, AuthenticatedRequest } from '../../middleware/jwtAuthMiddleware';
import { supabase } from '../../integrations/supabase/client';
import { DocumentVectorStoreService, createDocumentVectorStoreService } from '../../services/documentVectorStoreService';
import { EmbeddingGenerationService, defaultEmbeddingConfig } from '../../services/embeddingGenerationService';

/**
 * Request/Response types for unified PDF API
 */
export interface ApiRequest {
  headers: { [key: string]: string };
  body: unknown;
  user?: { id: string };
  file?: File;
  path: string;
  method: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp: string;
}

export interface AuthContext {
  user?: { id: string };
  isAuthenticated: boolean;
}

/**
 * Job status and processing types
 */
export type JobStatus = 'pending' | 'processing' | 'extracting' | 'transforming' | 'rag-integrating' | 'completed' | 'failed';

export interface ProcessingJob {
  id: string;
  status: JobStatus;
  workspaceId?: string;
  results?: unknown;
  error?: unknown;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  // Additional properties that may exist in actual job objects
  [key: string]: unknown;
}

export interface BatchOptions {
  maxConcurrency?: number;
  failFast?: boolean;
}

export interface BatchProcessingOptions {
  extractionType?: 'markdown' | 'tables' | 'images' | 'all';
  options?: {
    extractionType: 'markdown' | 'tables' | 'images' | 'all';
  };
  batchOptions?: BatchOptions;
}

/**
 * Unified request types combining both controller patterns
 */
export interface UnifiedPdfProcessingRequest {
  documentId: string;
  workspaceId?: string;
  options: {
    extractionType: 'markdown' | 'tables' | 'images' | 'all';
    enableRAGIntegration?: boolean;
    enableFunctionalMetadata?: boolean;
    pageRange?: {
      start?: number;
      end?: number;
    };
    chunkingOptions?: {
      maxChunkSize?: number;
      overlapSize?: number;
    };
    embeddingOptions?: {
      model?: string;
      dimensions?: number;
    };
    outputFormat?: 'json' | 'zip';
    workspaceAware?: boolean;
  };
  metadata?: {
    filename?: string;
    source?: 'upload' | 'url' | 'workspace';
    tags?: string[];
    priority?: 'low' | 'normal' | 'high';
    workspace?: {
      projectId?: string;
      userId?: string;
      tags?: string[];
    };
  };
}

export interface WorkflowStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    currentStage: string;
    completedStages: string[];
    totalStages: number;
    percentage: number;
  };
  results?: {
    extractedContent?: unknown;
    ragIntegration?: {
      documentsStored: number;
      embeddingsGenerated: number;
      vectorsIndexed: number;
    };
  };
  error?: {
    stage: string;
    message: string;
    code: string;
  };
  timestamps: {
    created: string;
    started?: string;
    completed?: string;
  };
}

export interface DocumentSearchRequest {
  workspaceId: string;
  query: string;
  options?: {
    limit?: number;
    threshold?: number;
    includeMetadata?: boolean;
    filterByTags?: string[];
  };
}

export interface DocumentSearchResponse {
  results: Array<{
    documentId: string;
    chunkId: string;
    content: string;
    similarity: number;
    metadata: {
      filename?: string;
      pageNumber?: number;
      chunkIndex: number;
      tags?: string[];
    };
  }>;
  totalResults: number;
  searchTime: number;
}

/**
 * Request validation schemas
 */
const UnifiedPdfProcessingRequestSchema = z.object({
  documentId: z.string().min(1, 'Document ID is required'),
  workspaceId: z.string().min(1, 'Workspace ID is required').optional(),
  options: z.object({
    extractionType: z.enum(['markdown', 'tables', 'images', 'all']),
    enableRAGIntegration: z.boolean().optional(),
    pageRange: z.object({
      start: z.number().int().positive().optional(),
      end: z.number().int().positive().optional(),
    }).optional(),
    chunkingOptions: z.object({
      maxChunkSize: z.number().int().positive().max(8000).optional(),
      overlapSize: z.number().int().min(0).max(500).optional(),
    }).optional(),
    embeddingOptions: z.object({
      model: z.string().optional(),
      dimensions: z.number().int().positive().optional(),
    }).optional(),
    outputFormat: z.enum(['json', 'zip']).optional(),
    workspaceAware: z.boolean().optional(),
  }),
  metadata: z.object({
    filename: z.string().optional(),
    source: z.enum(['upload', 'url', 'workspace']).optional(),
    tags: z.array(z.string()).optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    workspace: z.object({
      projectId: z.string().optional(),
      userId: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
});

const DocumentSearchRequestSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  query: z.string().min(1, 'Search query is required'),
  options: z.object({
    limit: z.number().int().positive().max(100).optional(),
    threshold: z.number().min(0).max(1).optional(),
    includeMetadata: z.boolean().optional(),
    filterByTags: z.array(z.string()).optional(),
  }).optional(),
});


/**
 * Authentication helper functions
 */
export class AuthenticationHelper {
  /**
   * Authenticate request using JWT middleware
   * Supports both JWT tokens and API keys
   */
  static async authenticateRequest(request: AuthenticatedRequest): Promise<AuthContext> {
    try {
      const authResult = await JWTAuthMiddleware.authenticate(request, {
        allowApiKey: true,
        allowInternalToken: false,
      });

      if (!authResult.success) {
        return { isAuthenticated: false };
      }

      return authResult.authContext;
    } catch (_error) {
      // Authentication error - return unauthenticated state
      return { isAuthenticated: false };
    },
  }

  /**
   * Check endpoint access for authenticated request
   * Uses JWT middleware for API key endpoint validation
   */
  static async checkEndpointAccess(request: AuthenticatedRequest, endpoint: string): Promise<boolean> {
    try {
      // If using API key, check endpoint access
      const apiKey = request.headers['x-api-key'] || request.headers['X-API-Key'];
      if (apiKey) {
        return await JWTAuthMiddleware.checkEndpointAccess(apiKey as string, endpoint);
      }

      // JWT tokens have full access by default
      return true;
    } catch (_error) {
      // Endpoint access check error - deny access
      return false;
    },
  },
}

/**
 * Rate limiting helper functions
 */
export class RateLimitHelper {
  /**
   * Check rate limit for endpoint and user/IP
   */
  static async checkRateLimit(endpoint: string, clientIP: string, userId?: string): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: Date;
  }> {
    try {
      // Get rate limit for this endpoint
      const rateLimit = await apiGatewayService.getRateLimit(endpoint, clientIP, userId);

      // Query recent requests from database
      const oneMinuteAgo = new Date(Date.now() - 60000);
      const { data: recentRequests, error } = await supabase
        .from('api_usage_logs')
        .select('id')
        .eq('request_path', endpoint)
        .gte('created_at', oneMinuteAgo.toISOString())
        .or(`ip_address.eq.${clientIP}${userId ? `,user_id.eq.${userId}` : ''}`);

      if (error) {
        // Rate limit check error - allow on error to avoid blocking legitimate requests
        return {
          allowed: true,
          limit: rateLimit,
          remaining: rateLimit,
          resetTime: new Date(Date.now() + 60000),
        };
      }

      const requestCount = recentRequests?.length || 0;
      const remaining = Math.max(0, rateLimit - requestCount);

      return {
        allowed: requestCount < rateLimit,
        limit: rateLimit,
        remaining,
        resetTime: new Date(Date.now() + 60000),
      };
    } catch (_error) {
      // Rate limiting error - allow on error to avoid blocking legitimate requests
      return {
        allowed: true,
        limit: 60,
        remaining: 60,
        resetTime: new Date(Date.now() + 60000),
      };
    },
  }

  /**
   * Log API usage
   */
  static async logUsage(
    endpoint: string,
    method: string,
    clientIP: string,
    userId?: string,
    responseStatus?: number,
    responseTime?: number,
    rateLimitExceeded?: boolean,
  ): Promise<void> {
    try {
      await supabase
        .from('api_usage_logs')
        .insert({
          user_id: userId ?? null,
          ip_address: clientIP,
          request_method: method,
          request_path: endpoint,
          response_status: responseStatus ?? null,
          response_time_ms: responseTime ?? null,
          is_internal_request: await apiGatewayService.isInternalIP(clientIP),
          rate_limit_exceeded: rateLimitExceeded ?? false,
        });
    } catch (_error) {
      // Failed to log API usage - continue without logging
    },
  },
}



/**
 * Consolidated PDF Controller Class
 *
 * Unified controller combining PDF integration and document workflow operations.
 * Provides a single interface for all PDF-related API operations including:
 * - PDF content extraction (markdown, tables, images)
 * - Document workflow management
 * - RAG integration and processing
 * - Batch processing operations
 * - Document search and retrieval
 * - Health monitoring and metrics
 */
export class ConsolidatedPDFController {
  private mivaaService: MivaaIntegrationService;
  private vectorStoreService: DocumentVectorStoreService;
  private activeJobs: Map<string, ProcessingJob> = new Map();

  constructor() {
    this.mivaaService = new MivaaIntegrationService(defaultMivaaConfig);
    // Initialize vector store service with embedding service
    const embeddingService = new EmbeddingGenerationService(defaultEmbeddingConfig);
    this.vectorStoreService = createDocumentVectorStoreService(embeddingService);
  }

  /**
   * Initialize the controller and its dependencies
   */
  async initialize(): Promise<void> {
    await this.mivaaService.initialize();
    // ConsolidatedPDFController initialized successfully
  }

  /**
   * Health check endpoint for all PDF services
   */
  async healthCheck(): Promise<ApiResponse> {
    try {
      const health = await this.mivaaService.getHealth();

      return {
        success: health.status === 'healthy',
        data: {
          status: health.status,
          service: 'consolidated-pdf',
          timestamp: new Date().toISOString(),
          components: {
            mivaaService: health.status === 'healthy',
            controller: { status: 'healthy' },
            database: { status: 'healthy' },
            authentication: { status: 'healthy' },
          },
          details: {
            uptime: health.uptime,
            version: defaultMivaaConfig.version,
            activeJobs: this.activeJobs.size,
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: 'Health check failed',
        code: 'HEALTH_CHECK_ERROR',
        data: {
          status: 'unhealthy',
          service: 'consolidated-pdf',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      };
    },
  }

  /**
   * Unified PDF processing endpoint
   * Handles both extraction and workflow processing
   */
  async processDocument(
    file: File,
    request: UnifiedPdfProcessingRequest,
    authContext: AuthContext,
  ): Promise<ApiResponse> {
    const startTime = Date.now();

    try {
      // Validate authentication
      if (!authContext.isAuthenticated || !authContext.user?.id) {
        return {
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
        };
      }

      // Validate request
      const validationResult = UnifiedPdfProcessingRequestSchema.safeParse(request);
      if (!validationResult.success) {
        return {
          success: false,
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          data: { details: validationResult.error.issues },
          timestamp: new Date().toISOString(),
        };
      }

      // Check workspace access if workspace is specified
      if (request.workspaceId) {
        const hasAccess = await this.checkWorkspaceAccess(authContext.user.id, request.workspaceId);
        if (!hasAccess) {
          return {
            success: false,
            error: 'Access denied to workspace',
            code: 'FORBIDDEN',
            timestamp: new Date().toISOString(),
          };
        },
      }

      // Create extraction request
      const extractionRequest: PdfExtractionRequest = {
        documentId: validationResult.data.documentId,
        options: {
          extractionType: validationResult.data.options.extractionType || 'all',
          ...(validationResult.data.options.pageRange && {
            pageRange: {
              ...(validationResult.data.options.pageRange.start !== undefined && { start: validationResult.data.options.pageRange.start }),
              ...(validationResult.data.options.pageRange.end !== undefined && { end: validationResult.data.options.pageRange.end }),
            },
          }),
          ...(validationResult.data.options.outputFormat && { outputFormat: validationResult.data.options.outputFormat }),
          ...(validationResult.data.options.workspaceAware !== undefined && { workspaceAware: validationResult.data.options.workspaceAware }),
        },
        file: await this.fileToBuffer(file),
        metadata: {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          uploadedAt: new Date(),
          source: 'upload' as const,
          ...(validationResult.data.metadata?.workspace && {
            workspace: {
              ...(validationResult.data.metadata.workspace.projectId && { projectId: validationResult.data.metadata.workspace.projectId }),
              ...(validationResult.data.metadata.workspace.userId && { userId: validationResult.data.metadata.workspace.userId }),
              ...(validationResult.data.metadata.workspace.tags && { tags: validationResult.data.metadata.workspace.tags }),
            },
          }),
          ...(validationResult.data.metadata?.tags && {
            tags: validationResult.data.metadata.tags,
          }),
          ...(validationResult.data.metadata?.priority && {
            priority: validationResult.data.metadata.priority,
          }),
        },
      };

      // Add workspace context if user is authenticated
      if (authContext.user?.id && extractionRequest.options.workspaceAware) {
        extractionRequest.metadata = {
          ...extractionRequest.metadata,
          workspace: {
            userId: authContext.user.id,
            ...extractionRequest.metadata?.workspace,
          },
        };
      }

      // Determine processing type based on options
      let result;
      if (request.options.enableRAGIntegration) {
        // Process for RAG integration
        result = await this.mivaaService.processForRag(extractionRequest);

        // If this is a workflow request, create job tracking
        if (request.workspaceId) {
          const jobId = this.generateJobId();

          // Create job in database
          await this.createProcessingJob({
            jobId,
            documentId: request.documentId,
            workspaceId: request.workspaceId,
            userId: authContext.user.id,
            jobType: 'pdf_rag_processing',
            filename: file.name,
            fileSize: file.size,
            options: request.options,
            metadata: request.metadata,
          });

          // Update job as completed
          await this.updateProcessingJob(jobId, {
            status: 'completed',
            results: result,
            completed_at: new Date().toISOString(),
          });

          result = { ...result, jobId };
        },
      } else if (request.options.enableFunctionalMetadata) {
        // Process for functional metadata extraction with enhanced error handling
        const functionalMetadataRequest = {
          ...extractionRequest,
          options: {
            ...extractionRequest.options,
            include_functional_metadata: true,
          },
        };

        let jobId: string | undefined;
        let job: ProcessingJob | undefined;

        try {
          // Create job tracking early for functional metadata processing
          if (request.workspaceId) {
            jobId = this.generateJobId();
            job = {
              id: jobId,
              documentId: request.documentId,
              workspaceId: request.workspaceId,
              status: 'processing' as const,
              filename: file.name,
              fileSize: file.size,
              userId: authContext.user.id,
              options: request.options,
              metadata: request.metadata,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            this.activeJobs.set(jobId, job);
          }

          // Attempt functional metadata extraction
          result = await this.mivaaService.extractFromPdf(functionalMetadataRequest);

          // Validate functional metadata response
          if (!result || typeof result !== 'object') {
            throw new Error('Invalid response from MIVAA functional metadata service');
          }

          // Check if functional metadata was actually extracted
          const hasValidFunctionalMetadata = (result.data as any)?.functional_properties &&
            Object.keys((result.data as any).functional_properties).length > 0;

          if (!hasValidFunctionalMetadata) {
            // Functional metadata extraction returned no results for document
            result = {
              ...result,
              status: 'partial',
              warnings: [
                ...(result.warnings || []),
                'No functional metadata could be extracted from this document',
              ],
            };
          }

          // Update job status on success
          if (jobId && job) {
            job.status = 'completed';
            job.results = result;
            job.completedAt = new Date().toISOString();
            job.updatedAt = new Date().toISOString();
            this.activeJobs.set(jobId, job);
            result = { ...result, jobId };
          }

        } catch (functionalMetadataError) {
          // Functional metadata extraction failed

          // Update job status on error
          if (jobId && job) {
            job.status = 'failed';
            job.error = {
              stage: 'functional_metadata_extraction',
              message: functionalMetadataError instanceof Error ? functionalMetadataError.message : 'Unknown functional metadata error',
              code: 'FUNCTIONAL_METADATA_ERROR',
            };
            job.updatedAt = new Date();
            this.activeJobs.set(jobId, job);
          }

          // Check if this is a critical failure or if we can fall back to standard extraction
          const isCriticalError = functionalMetadataError instanceof Error &&
            (functionalMetadataError.message.includes('MIVAA service unavailable') ||
             functionalMetadataError.message.includes('Authentication failed') ||
             functionalMetadataError.message.includes('Network timeout'));

          if (isCriticalError) {
            // Critical error - return failure
            throw new Error(`Functional metadata extraction failed: ${functionalMetadataError instanceof Error ? functionalMetadataError.message : 'Unknown error'}`);
          } else {
            // Non-critical error - fall back to standard extraction

            try {
              result = await this.mivaaService.extractFromPdf(extractionRequest);
              result = {
                ...result,
                status: 'partial',
                warnings: [
                  ...(result.warnings || []),
                  `Functional metadata extraction failed: ${functionalMetadataError instanceof Error ? functionalMetadataError.message : 'Unknown error'}. Standard extraction completed successfully.`,
                ],
              };

              // Update job with partial success
              if (jobId && job) {
                job.status = 'completed';
                job.results = result;
                job.completedAt = new Date().toISOString();
                job.updatedAt = new Date().toISOString();
                this.activeJobs.set(jobId, job);
                result = { ...result, jobId };
              },
            } catch (fallbackError) {
              // Both functional metadata and standard extraction failed
              throw new Error(`Both functional metadata and standard extraction failed. Functional metadata error: ${functionalMetadataError instanceof Error ? functionalMetadataError.message : 'Unknown error'}. Standard extraction error: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
            },
          },
        },
      } else {
        // Standard extraction
        result = await this.mivaaService.extractFromPdf(extractionRequest);
      }

      // Log usage
      await RateLimitHelper.logUsage(
        '/api/pdf/process',
        'POST',
        'client',
        authContext.user?.id,
        200,
        Date.now() - startTime,
      );

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (_error) {
      // PDF processing error

      // Log usage with error
      await RateLimitHelper.logUsage(
        '/api/pdf/process',
        'POST',
        'client',
        authContext.user?.id,
        500,
        Date.now() - startTime,
      );

      return {
        success: false,
        error: 'PDF processing failed',
        code: 'PROCESSING_ERROR',
        data: { message: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date().toISOString(),
      };
    },
  }

  /**
   * Get workflow status and progress
   */
  async getWorkflowStatus(
    jobId: string,
    authContext: AuthContext,
  ): Promise<ApiResponse<WorkflowStatusResponse>> {
    const startTime = Date.now();

    try {
      // Validate authentication
      if (!authContext.isAuthenticated || !authContext.user?.id) {
        return {
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
        };
      }

      // Get job from memory storage
      const job = this.activeJobs.get(jobId);
      if (!job) {
        return {
          success: false,
          error: 'Job not found',
          code: 'NOT_FOUND',
          timestamp: new Date().toISOString(),
        };
      }

      // Check workspace access
      if (job.workspaceId) {
        const hasAccess = await this.checkWorkspaceAccess(authContext.user.id, job.workspaceId);
        if (!hasAccess) {
          return {
            success: false,
            error: 'Access denied to workspace',
            code: 'FORBIDDEN',
            timestamp: new Date().toISOString(),
          };
        },
      }

      // Calculate progress
      const allStages = ['pending', 'processing', 'extracting', 'transforming', 'rag-integrating', 'completed'];
      const currentStageIndex = allStages.indexOf(job.status);
      const completedStages = allStages.slice(0, Math.max(0, currentStageIndex));
      const percentage = job.status === 'completed' ? 100 :
                        job.status === 'failed' ? 0 :
                        Math.round((currentStageIndex / (allStages.length - 1)) * 100);

      const statusResponse: WorkflowStatusResponse = {
        jobId: job.id,
        status: job.status === 'extracting' || job.status === 'transforming' || job.status === 'rag-integrating'
          ? 'processing'
          : job.status as 'pending' | 'processing' | 'completed' | 'failed',
        progress: {
          currentStage: job.status,
          completedStages,
          totalStages: allStages.length,
          percentage,
        },
        timestamps: {
          created: job.createdAt,
          ...(job.startedAt && { started: job.startedAt }),
          ...(job.completedAt && { completed: job.completedAt }),
        },
      };

      // Add optional properties only if they exist
      if (job.results) {
        statusResponse.results = job.results as {
          extractedContent?: unknown;
          ragIntegration?: {
            documentsStored: number;
            embeddingsGenerated: number;
            vectorsIndexed: number;
          };
        };
      }

      if (job.error) {
        statusResponse.error = job.error as {
          stage: string;
          message: string;
          code: string;
        };
      }

      // Log usage
      await RateLimitHelper.logUsage(
        '/api/pdf/status',
        'GET',
        'client',
        authContext.user.id,
        200,
        Date.now() - startTime,
      );

      return {
        success: true,
        data: statusResponse,
        timestamp: new Date().toISOString(),
      };
    } catch (_error) {
      // Get workflow status error

      // Log usage with error
      await RateLimitHelper.logUsage(
        '/api/pdf/status',
        'GET',
        'client',
        authContext.user?.id,
        500,
        Date.now() - startTime,
      );

      return {
        success: false,
        error: 'Failed to get workflow status',
        code: 'STATUS_RETRIEVAL_ERROR',
        timestamp: new Date().toISOString(),
      };
    },
  }

  /**
   * Search documents in workspace using vector similarity
   */
  async searchDocuments(
    request: DocumentSearchRequest,
    authContext: AuthContext,
  ): Promise<ApiResponse<DocumentSearchResponse>> {
    const startTime = Date.now();

    try {
      // Validate authentication
      if (!authContext.isAuthenticated || !authContext.user?.id) {
        return {
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
        };
      }

      // Validate request
      const validationResult = DocumentSearchRequestSchema.safeParse(request);
      if (!validationResult.success) {
        return {
          success: false,
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
        };
      }

      // Check workspace access
      const hasAccess = await this.checkWorkspaceAccess(authContext.user.id, request.workspaceId || '');
      if (!hasAccess) {
        return {
          success: false,
          error: 'Access denied to workspace',
          code: 'FORBIDDEN',
          timestamp: new Date().toISOString(),
        };
      }

      // Perform real vector search using DocumentVectorStoreService
      const searchResults = await this.vectorStoreService.search({
        query: request.query,
        workspaceId: request.workspaceId,
        limit: request.options?.limit || 10,
        threshold: request.options?.threshold || 0.7,
        metadata: request.options?.includeMetadata ? {} : undefined,
      });

      // Transform results to match DocumentSearchResponse format
      const transformedResults: DocumentSearchResponse = {
        results: searchResults.results.map(result => ({
          documentId: result.documentId,
          chunkId: result.chunkId,
          content: result.content,
          similarity: result.similarity,
          metadata: {
            filename: (result.metadata?.filename as string) || 'unknown',
            pageNumber: (result.metadata?.pageNumber as number) || 0,
            chunkIndex: (result.metadata?.chunkIndex as number) || 0,
            tags: (result.metadata?.tags as string[]) || [],
          },
        })),
        totalResults: searchResults.totalMatches,
        searchTime: searchResults.processingTime,
      };

      // Log usage
      await RateLimitHelper.logUsage(
        '/api/pdf/search',
        'POST',
        'client',
        authContext.user.id,
        200,
        Date.now() - startTime,
      );

      return {
        success: true,
        data: transformedResults,
        timestamp: new Date().toISOString(),
      };
    } catch (_error) {
      // Document search error

      // Log usage with error
      await RateLimitHelper.logUsage(
        '/api/pdf/search',
        'POST',
        'client',
        authContext.user?.id,
        500,
        Date.now() - startTime,
      );

      return {
        success: false,
        error: 'Document search failed',
        code: 'SEARCH_ERROR',
        timestamp: new Date().toISOString(),
      };
    },
  }

  /**
   * Batch process multiple PDFs
   */
  async batchProcess(
    files: File[],
    options: BatchProcessingOptions,
    authContext: AuthContext,
  ): Promise<ApiResponse> {
    const startTime = Date.now();

    try {
      // Validate authentication
      if (!authContext.isAuthenticated || !authContext.user?.id) {
        return {
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
        };
      }

      // Process files in batches
      const batchSize = options.batchOptions?.maxConcurrency || 3;
      const results = [];

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchPromises = batch.map(async (file, index) => ({
          file: file.name,
          index: i + index,
          result: await this.processDocument(
            file,
            {
              documentId: `batch_${Date.now()}_${i + index}`,
              options: options.options || { extractionType: 'all' },
              metadata: { filename: file.name, source: 'upload' },
            },
            authContext,
          ),
        }));

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // If failFast is enabled and any request failed, stop processing
        if (options.batchOptions?.failFast && batchResults.some(r => !r.result.success)) {
          break;
        },
      }

      // Log usage
      await RateLimitHelper.logUsage(
        '/api/pdf/batch',
        'POST',
        'client',
        authContext.user.id,
        200,
        Date.now() - startTime,
      );

      return {
        success: true,
        data: {
          totalFiles: files.length,
          processedFiles: results.length,
          results,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (_error) {
      // Batch processing error

      // Log usage with error
      await RateLimitHelper.logUsage(
        '/api/pdf/batch',
        'POST',
        'client',
        authContext.user?.id,
        500,
        Date.now() - startTime,
      );

      return {
        success: false,
        error: 'Batch processing failed',
        code: 'BATCH_PROCESSING_ERROR',
        timestamp: new Date().toISOString(),
      };
    },
  }

  /**
   * Get processing metrics and statistics
   */
  async getMetrics(authContext: AuthContext): Promise<ApiResponse> {
    try {
      // Validate authentication
      if (!authContext.isAuthenticated || !authContext.user?.id) {
        return {
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString(),
        };
      }

      // Calculate real metrics from active jobs
      const completedJobs = Array.from(this.activeJobs.values()).filter(job => job.status === 'completed');
      const failedJobs = Array.from(this.activeJobs.values()).filter(job => job.status === 'failed');

      // Calculate average processing time from completed jobs
      let averageProcessingTime = 0;
      if (completedJobs.length > 0) {
        const totalTime = completedJobs.reduce((sum, job) => {
          if (job.completedAt && job.startedAt) {
            return sum + (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime());
          }
          return sum;
        }, 0);
        averageProcessingTime = totalTime / completedJobs.length;
      }

      // Query database for additional metrics
      const { data: jobMetricsRaw } = await supabase
        .from('processing_jobs')
        .select('status, created_at, completed_at')
        .eq('user_id', authContext.user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      const jobMetrics = (jobMetricsRaw as Array<{ status: string }> | null);

      const metrics = {
        activeJobs: this.activeJobs.size,
        totalProcessed: completedJobs.length,
        totalFailed: failedJobs.length,
        averageProcessingTime: Math.round(averageProcessingTime),
        systemHealth: failedJobs.length === 0 ? 'healthy' : 'degraded',
        databaseMetrics: {
          totalJobs: jobMetrics?.length || 0,
          successRate: jobMetrics ? ((jobMetrics.filter(j => j.status === 'completed').length / jobMetrics.length) * 100).toFixed(2) : 'N/A',
        },
      };

      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (_error) {
      // Failed to get metrics
      return {
        success: false,
        error: 'Failed to get metrics',
        code: 'METRICS_ERROR',
        timestamp: new Date().toISOString(),
      };
    },
  }

  /**
   * Private helper methods
   */
  private async checkWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('workspace_permissions')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        // Error checking workspace access
        return false;
      }

      return !!data;
    } catch (_error) {
      // Failed to check workspace access
      return false;
    },
  }

  /**
   * Create processing job in database
   */
  private async createProcessingJob(jobData: {
    jobId: string;
    documentId: string;
    workspaceId: string;
    userId: string;
    jobType: string;
    filename?: string;
    fileSize?: number;
    options: any;
    metadata?: any;
  }): Promise<void> {
    try {
      await supabase
        .from('processing_jobs')
        .insert({
          job_id: jobData.jobId,
          document_id: jobData.documentId,
          workspace_id: jobData.workspaceId,
          user_id: jobData.userId,
          job_type: jobData.jobType,
          status: 'pending',
          filename: jobData.filename,
          file_size: jobData.fileSize,
          options: jobData.options,
          metadata: jobData.metadata,
        });
    } catch (_error) {
      // Failed to create processing job
    },
  }

  /**
   * Update processing job status
   */
  private async updateProcessingJob(jobId: string, updates: {
    status?: string;
    results?: any;
    error_details?: any;
    started_at?: string;
    completed_at?: string;
  }): Promise<void> {
    try {
      const updateData: any = { ...updates };

      await supabase
        .from('processing_jobs')
        .update(updateData)
        .eq('job_id', jobId);
    } catch (_error) {
      // Failed to update processing job
    },
  }



  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private async fileToBuffer(file: File): Promise<Buffer> {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },
}

/**
 * Factory function to create controller instance
 */
export function createConsolidatedPDFController(): ConsolidatedPDFController {
  return new ConsolidatedPDFController();
}
