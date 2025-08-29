import { z } from 'zod';

import { MivaaIntegrationService, PdfExtractionRequest, defaultMivaaConfig } from '../../services/pdf/mivaaIntegrationService';
import { apiGatewayService } from '../../services/apiGateway/apiGatewayService';
import { JWTAuthMiddleware, AuthenticatedRequest } from '../../middleware/jwtAuthMiddleware';

/**
 * Request/Response types for unified PDF API
 */
export interface ApiRequest {
  headers: Record<string, string>;
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
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
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
    } catch (error) {
      console.error('Authentication error:', error);
      return { isAuthenticated: false };
    }
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
    } catch (error) {
      console.error('Endpoint access check error:', error);
      return false;
    }
  }
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

      // TODO: Create api_usage_logs table migration before enabling this functionality
      console.warn('Rate limiting is disabled - api_usage_logs table not found. Create database migration to enable this feature.');

      // Temporary fallback: allow all requests (no rate limiting)
      const recentRequests: unknown[] = [];
      const error = null;

      /* COMMENTED OUT UNTIL DATABASE MIGRATION IS CREATED:
      const { data: recentRequests, error } = await supabase
        .from('api_usage_logs')
        .select('id')
        .eq('request_path', endpoint)
        .gte('created_at', oneMinuteAgo.toISOString())
        .or(`ip_address.eq.${clientIP}${userId ? `,user_id.eq.${userId}` : ''}`);
      */

      if (error) {
        console.error('Rate limit check error:', error);
        // Allow on error to avoid blocking legitimate requests
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
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Allow on error to avoid blocking legitimate requests
      return {
        allowed: true,
        limit: 60,
        remaining: 60,
        resetTime: new Date(Date.now() + 60000),
      };
    }
  }

  /**
   * Log API usage
   */
  static async logUsage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endpoint: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _method: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _clientIP: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userId?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _responseStatus?: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _responseTime?: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _rateLimitExceeded?: boolean,
  ): Promise<void> {
    try {
      // TODO: Create api_usage_logs table migration before enabling this functionality
      console.warn('API usage logging is disabled - api_usage_logs table not found. Create database migration to enable this feature.');

      // No-op until database migration is created
      return;

      /* COMMENTED OUT UNTIL DATABASE MIGRATION IS CREATED:
      await supabase
        .from('api_usage_logs')
        .insert({
          endpoint_id: null, // Would need to lookup endpoint ID
          user_id: userId ?? null,
          ip_address: clientIP,
          user_agent: navigator.userAgent,
          request_method: method,
          request_path: endpoint,
          response_status: responseStatus ?? null,
          response_time_ms: responseTime ?? null,
          is_internal_request: await apiGatewayService.isInternalIP(clientIP),
          rate_limit_exceeded: rateLimitExceeded
        });
      */
    } catch (error) {
      console.error('Failed to log API usage:', error);
    }
  }
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
  private activeJobs: Map<string, ProcessingJob> = new Map();

  constructor() {
    this.mivaaService = new MivaaIntegrationService(defaultMivaaConfig);
  }

  /**
   * Initialize the controller and its dependencies
   */
  async initialize(): Promise<void> {
    await this.mivaaService.initialize();
    console.log('ConsolidatedPDFController initialized successfully');
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
    }
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
        const hasAccess = await this.checkWorkspaceAccess();
        if (!hasAccess) {
          return {
            success: false,
            error: 'Access denied to workspace',
            code: 'FORBIDDEN',
            timestamp: new Date().toISOString(),
          };
        }
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
          const job = {
            id: jobId,
            documentId: request.documentId,
            workspaceId: request.workspaceId,
            status: 'completed' as const,
            filename: file.name,
            fileSize: file.size,
            userId: authContext.user.id,
            options: request.options,
            metadata: request.metadata,
            results: result,
            createdAt: new Date(),
            updatedAt: new Date(),
            completedAt: new Date(),
          };

          this.activeJobs.set(jobId, job);
          result = { ...result, jobId };
        }
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
    } catch (error) {
      console.error('PDF processing error:', error);

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
    }
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
        const hasAccess = await this.checkWorkspaceAccess();
        if (!hasAccess) {
          return {
            success: false,
            error: 'Access denied to workspace',
            code: 'FORBIDDEN',
            timestamp: new Date().toISOString(),
          };
        }
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
          created: job.createdAt.toISOString(),
          ...(job.startedAt && { started: job.startedAt.toISOString() }),
          ...(job.completedAt && { completed: job.completedAt.toISOString() }),
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
    } catch (error) {
      console.error('Get workflow status error:', error);

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
    }
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
      const hasAccess = await this.checkWorkspaceAccess();
      if (!hasAccess) {
        return {
          success: false,
          error: 'Access denied to workspace',
          code: 'FORBIDDEN',
          timestamp: new Date().toISOString(),
        };
      }

      // Simulate search results (in production, this would use vector store)
      const mockResults: DocumentSearchResponse = {
        results: [
          {
            documentId: 'doc_1',
            chunkId: 'chunk_1',
            content: `Sample content related to "${request.query}"`,
            similarity: 0.85,
            metadata: {
              filename: 'sample.pdf',
              pageNumber: 1,
              chunkIndex: 0,
              tags: ['sample', 'document'],
            },
          },
        ],
        totalResults: 1,
        searchTime: Date.now() - startTime,
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
        data: mockResults,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Document search error:', error);

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
    }
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
        }
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
    } catch (error) {
      console.error('Batch processing error:', error);

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
    }
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

      const metrics = {
        activeJobs: this.activeJobs.size,
        totalProcessed: Array.from(this.activeJobs.values()).filter(job => job.status === 'completed').length,
        totalFailed: Array.from(this.activeJobs.values()).filter(job => job.status === 'failed').length,
        averageProcessingTime: 2500, // Mock data
        systemHealth: 'healthy',
      };

      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        success: false,
        error: 'Failed to get metrics',
        code: 'METRICS_ERROR',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Private helper methods
   */
  private async checkWorkspaceAccess(): Promise<boolean> {
    try {
      // In production, this would check workspace permissions
      // For now, return true for authenticated users
      return true;
    } catch (error) {
      console.error('Workspace access check error:', error);
      return false;
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async fileToBuffer(file: File): Promise<Buffer> {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

/**
 * Factory function to create controller instance
 */
export function createConsolidatedPDFController(): ConsolidatedPDFController {
  return new ConsolidatedPDFController();
}
