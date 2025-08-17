import { z } from 'zod';

import { DocumentWorkflowOrchestrator, ProcessingRequest, WorkflowJob, WorkflowStatus } from '../orchestrators/DocumentWorkflowOrchestrator';
import { JWTAuthMiddleware, AuthenticatedRequest, AuthenticationResult } from '../middleware/jwtAuthMiddleware';

// Express types (would be imported from @types/express in real implementation)
interface Request {
  headers: Record<string, string | string[] | undefined>;
  body: any;
  params: Record<string, string>;
  query: Record<string, any>;
}

interface Response {
  status(code: number): Response;
  json(data: any): void;
  headersSent: boolean;
}

interface NextFunction {
  (): void;
}


class RateLimitHelper {
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  static async checkRateLimit(identifier: string, limit: number = 100, windowMs: number = 60000): Promise<boolean> {
    const now = Date.now();
    const key = identifier;

    const current = this.rateLimitStore.get(key);

    if (!current || now > current.resetTime) {
      // Reset or initialize
      this.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count++;
    return true;
  }

  static async logUsage(userId: string, workspaceId: string, endpoint: string, metadata?: any): Promise<void> {
    // Log usage for analytics and monitoring
    console.log(`Usage logged: ${userId} in ${workspaceId} accessed ${endpoint}`, metadata);
  }
}

// Validation Schemas
const ProcessDocumentSchema = z.object({
  mivaaDocument: z.object({
    id: z.string().min(1, 'Document ID is required'),
    filename: z.string().min(1, 'Filename is required'),
    content: z.string().min(1, 'Document content is required'),
    markdown: z.string().min(1, 'Markdown content is required'),
    metadata: z.object({
      pageCount: z.number().min(1),
      fileSize: z.number().min(1),
      mimeType: z.string().min(1),
      extractedAt: z.string().datetime(),
      confidence: z.number().min(0).max(1),
    }),
    pages: z.array(z.object({
      pageNumber: z.number().min(1),
      content: z.string(),
      images: z.array(z.object({
        id: z.string(),
        description: z.string().optional(),
        extractedText: z.string().optional(),
      })).optional(),
      tables: z.array(z.object({
        id: z.string(),
        headers: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        summary: z.string().optional(),
      })).optional(),
    })),
    tables: z.array(z.object({
      id: z.string(),
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      summary: z.string().optional(),
    })).optional(),
    images: z.array(z.object({
      id: z.string(),
      description: z.string().optional(),
      extractedText: z.string().optional(),
    })).optional(),
    extractionTimestamp: z.string().datetime(),
  }),
  config: z.object({
    transformation: z.object({
      chunking: z.object({
        type: z.enum(['semantic', 'fixed', 'hybrid']).optional(),
        maxChunkSize: z.number().min(100).max(5000).optional(),
        overlapSize: z.number().min(0).max(500).optional(),
        preserveStructure: z.boolean().optional(),
        sentenceBoundary: z.boolean().optional(),
        paragraphBoundary: z.boolean().optional(),
      }).optional(),
      embeddings: z.object({
        enabled: z.boolean().optional(),
        generateDocumentEmbedding: z.boolean().optional(),
        generateChunkEmbeddings: z.boolean().optional(),
      }).optional(),
      tables: z.object({
        includeInChunks: z.boolean().optional(),
        generateSummaries: z.boolean().optional(),
        extractSearchableText: z.boolean().optional(),
      }).optional(),
      images: z.object({
        includeInChunks: z.boolean().optional(),
        extractText: z.boolean().optional(),
        generateDescriptions: z.boolean().optional(),
      }).optional(),
      structure: z.object({
        preserveHeaders: z.boolean().optional(),
        generateTableOfContents: z.boolean().optional(),
        detectSections: z.boolean().optional(),
      }).optional(),
      quality: z.object({
        minimumChunkSize: z.number().min(10).optional(),
        maximumChunkSize: z.number().max(10000).optional(),
        minimumConfidence: z.number().min(0).max(1).optional(),
      }).optional(),
    }).optional(),
    processing: z.object({
      enableParallelProcessing: z.boolean().optional(),
      maxConcurrentJobs: z.number().min(1).max(20).optional(),
      retryAttempts: z.number().min(0).max(5).optional(),
      retryDelay: z.number().min(1000).optional(),
      timeout: z.number().min(30000).optional(),
    }).optional(),
    persistence: z.object({
      saveIntermediateResults: z.boolean().optional(),
      enableRollback: z.boolean().optional(),
      stateCheckpointInterval: z.number().min(5000).optional(),
    }).optional(),
    notifications: z.object({
      enableProgressUpdates: z.boolean().optional(),
      enableCompletionNotification: z.boolean().optional(),
      webhookUrl: z.string().url().optional(),
    }).optional(),
  }).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const JobIdSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
});

// Response Interfaces
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    requestId?: string;
    version: string;
  };
}

interface ProcessDocumentResponse {
  jobId: string;
  status: WorkflowStatus;
  estimatedCompletionTime?: string;
  stages: Array<{
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  }>;
}

interface JobStatusResponse {
  jobId: string;
  status: WorkflowStatus;
  progress: {
    currentStage: string;
    completedStages: number;
    totalStages: number;
    percentage: number;
  };
  result?: any;
  error?: string | undefined;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | undefined;
  estimatedTimeRemaining?: number | undefined;
}

interface JobProgressResponse {
  jobId: string;
  status: WorkflowStatus;
  stages: Array<{
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
    startTime?: string | undefined;
    endTime?: string | undefined;
    duration?: number | undefined;
    error?: string | undefined;
    metrics?: Record<string, any> | undefined;
  }>;
  metrics: {
    totalProcessingTime: number;
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
  };
  realTimeUpdates: {
    lastUpdate: string;
    nextUpdate?: string | undefined;
  };
}

/**
 * Document Integration API Controller
 *
 * Provides comprehensive endpoints for document processing workflow integration
 * with the DocumentWorkflowOrchestrator. Includes authentication, validation,
 * rate limiting, and comprehensive error handling.
 */
export class DocumentIntegrationController {
  private orchestrator: DocumentWorkflowOrchestrator;
  private readonly API_VERSION = '1.0.0';

  constructor(orchestrator: DocumentWorkflowOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Authentication Middleware
   * Validates JWT tokens or API keys and extracts user context
   */
  private async authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Convert Express Request to AuthenticatedRequest format
      const authRequest: AuthenticatedRequest = {
        headers: req.headers as Record<string, string>,
        body: req.body,
      };

      // Extract workspace ID if provided
      const extractedWorkspaceId = JWTAuthMiddleware.extractWorkspaceId(authRequest);
      if (extractedWorkspaceId) {
        authRequest.workspaceId = extractedWorkspaceId;
      }

      // Authenticate using JWT middleware with proper options
      const authResult: AuthenticationResult = await JWTAuthMiddleware.authenticate(authRequest, {
        allowApiKey: true,
        requiredScopes: [],
        workspaceRequired: false,
      });

      if (!authResult.success) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: authResult.error?.code || 'AUTH_FAILED',
            message: authResult.error?.message || 'Authentication failed',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(authResult.error?.statusCode || 401).json(errorResponse);
        return;
      }

      // Attach auth context to request
      (req as any).authContext = authResult.authContext;
      next();
    } catch (error) {
      const errorResponse: ApiResponse = {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: this.API_VERSION,
        },
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * Rate Limiting Middleware
   * Implements rate limiting based on user ID and workspace
   */
  private async rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authContext = (req as any).authContext;
      if (!authContext) {
        next();
        return;
      }

      const identifier = `${authContext.userId}:${authContext.workspaceId}`;
      const isAllowed = await RateLimitHelper.checkRateLimit(identifier, 100, 60000); // 100 requests per minute

      if (!isAllowed) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded. Please try again later.',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(429).json(errorResponse);
        return;
      }

      next();
    } catch (error) {
      next(); // Continue on rate limit errors
    }
  }

  /**
   * Workspace Authorization Middleware
   * Validates that the user has access to the requested workspace
   */
  private async authorizeWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authContext = (req as any).authContext;
      const requestedWorkspaceId = req.body.workspaceId || req.params.workspaceId || req.query.workspaceId;

      if (requestedWorkspaceId && requestedWorkspaceId !== authContext.workspaceId) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'WORKSPACE_ACCESS_DENIED',
            message: 'Access denied to the requested workspace',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(403).json(errorResponse);
        return;
      }

      next();
    } catch (error) {
      next();
    }
  }

  /**
   * POST /api/documents/process
   * Initiates document processing workflow
   */
  public processDocument = async (req: Request, res: Response): Promise<void> => {
    try {
      // Apply middleware
      await this.authenticateRequest(req, res, () => {});
      if (res.headersSent) return;

      await this.rateLimitMiddleware(req, res, () => {});
      if (res.headersSent) return;

      await this.authorizeWorkspace(req, res, () => {});
      if (res.headersSent) return;

      // Validate request body
      const validationResult = ProcessDocumentSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: validationResult.error.issues.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(400).json(errorResponse);
        return;
      }

      const authContext = (req as any).authContext;
      const { mivaaDocument, config, priority, metadata } = validationResult.data;

      // Create processing request with proper type handling
      const processingRequest: ProcessingRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workspaceId: authContext.workspaceId,
        mivaaDocument: {
          ...mivaaDocument,
          // Convert Zod schema types to MivaaDocument interface types
          tables: (mivaaDocument.tables || []).map(table => ({
            ...table,
            position: {
              page: 1,
              x: 0,
              y: 0,
              width: 100,
              height: 50,
            },
            confidence: 1.0,
            format: 'json' as const,
            rawData: JSON.stringify(table),
          })),
          images: (mivaaDocument.images || []).map(image => {
            const imageMetadata: any = {
              id: image.id,
              filename: image.id || 'unknown',
              position: {
                page: 1,
                x: 0,
                y: 0,
                width: 100,
                height: 50,
              },
              format: 'png',
              size: 0,
              confidence: 1.0,
            };

            // Only add optional properties if they have values
            if (image.description) {
              imageMetadata.caption = image.description;
            }
            if (image.extractedText) {
              imageMetadata.altText = image.extractedText;
              imageMetadata.extractedText = image.extractedText;
            }

            return imageMetadata;
          }),
          // Fix metadata to match MivaaDocumentMetadata interface
          metadata: {
            pages: mivaaDocument.metadata?.pageCount || 1,
            extractionMethod: 'mivaa-pdf-extractor',
            processingVersion: '1.0.0',
            confidence: mivaaDocument.metadata?.confidence || 1.0,
          },
        },
        priority: priority || 'normal', // Provide default value to handle exactOptionalPropertyTypes
        metadata: {
          ...metadata,
          userId: authContext.userId,
          requestedAt: new Date().toISOString(),
        },
      };

      // Add config only if it exists to handle exactOptionalPropertyTypes
      if (config) {
        processingRequest.config = config as any; // Type assertion to bypass exactOptionalPropertyTypes issue
      }

      // Start workflow processing
      const workflowJob = await this.orchestrator.processDocument(processingRequest);

      // Log usage
      await RateLimitHelper.logUsage(
        authContext.userId,
        authContext.workspaceId,
        'POST /api/documents/process',
        { jobId: workflowJob.id, documentId: mivaaDocument.id },
      );

      // Prepare response
      const responseData: ProcessDocumentResponse = {
        jobId: workflowJob.id,
        status: workflowJob.status,
        estimatedCompletionTime: this.calculateEstimatedCompletion(workflowJob),
        stages: workflowJob.stages.map(stage => ({
          name: stage.name,
          status: stage.status,
        })),
      };

      const successResponse: ApiResponse<ProcessDocumentResponse> = {
        success: true,
        data: responseData,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: processingRequest.id,
          version: this.API_VERSION,
        },
      };

      res.status(202).json(successResponse);

    } catch (error) {
      const errorResponse: ApiResponse = {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: 'Failed to initiate document processing',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: this.API_VERSION,
        },
      };

      res.status(500).json(errorResponse);
    }
  };

  /**
   * GET /api/documents/status/:jobId
   * Retrieves workflow status and basic progress information
   */
  public getJobStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      // Apply middleware
      await this.authenticateRequest(req, res, () => {});
      if (res.headersSent) return;

      await this.rateLimitMiddleware(req, res, () => {});
      if (res.headersSent) return;

      // Validate job ID
      const validationResult = JobIdSchema.safeParse(req.params);
      if (!validationResult.success) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_JOB_ID',
            message: 'Invalid job ID format',
            details: validationResult.error.issues,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(400).json(errorResponse);
        return;
      }

      const { jobId } = validationResult.data;
      const authContext = (req as any).authContext;

      // Get workflow status
      const status = await this.orchestrator.getWorkflowStatus(jobId);

      // Get job details (this would need to be implemented in the orchestrator)
      const jobDetails = await this.getJobDetails(jobId);

      // Verify workspace access
      if (jobDetails.workspaceId !== authContext.workspaceId) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'JOB_ACCESS_DENIED',
            message: 'Access denied to the requested job',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(403).json(errorResponse);
        return;
      }

      // Calculate progress
      const progress = this.calculateProgress(jobDetails);

      // Log usage
      await RateLimitHelper.logUsage(
        authContext.userId,
        authContext.workspaceId,
        'GET /api/documents/status',
        { jobId },
      );

      // Prepare response
      const responseData: JobStatusResponse = {
        jobId,
        status,
        progress,
        result: jobDetails.result,
        error: jobDetails.error,
        createdAt: jobDetails.createdAt.toISOString(),
        updatedAt: jobDetails.updatedAt.toISOString(),
        completedAt: jobDetails.completedAt?.toISOString(),
        estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(jobDetails),
      };

      const successResponse: ApiResponse<JobStatusResponse> = {
        success: true,
        data: responseData,
        metadata: {
          timestamp: new Date().toISOString(),
          version: this.API_VERSION,
        },
      };

      res.status(200).json(successResponse);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(404).json(errorResponse);
        return;
      }

      const errorResponse: ApiResponse = {
        success: false,
        error: {
          code: 'STATUS_RETRIEVAL_ERROR',
          message: 'Failed to retrieve job status',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: this.API_VERSION,
        },
      };

      res.status(500).json(errorResponse);
    }
  };

  /**
   * GET /api/documents/progress/:jobId
   * Retrieves detailed workflow progress with stage-by-stage information
   */
  public getJobProgress = async (req: Request, res: Response): Promise<void> => {
    try {
      // Apply middleware
      await this.authenticateRequest(req, res, () => {});
      if (res.headersSent) return;

      await this.rateLimitMiddleware(req, res, () => {});
      if (res.headersSent) return;

      // Validate job ID
      const validationResult = JobIdSchema.safeParse(req.params);
      if (!validationResult.success) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_JOB_ID',
            message: 'Invalid job ID format',
            details: validationResult.error.issues,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(400).json(errorResponse);
        return;
      }

      const { jobId } = validationResult.data;
      const authContext = (req as any).authContext;

      // Get job details
      const jobDetails = await this.getJobDetails(jobId);

      // Verify workspace access
      if (jobDetails.workspaceId !== authContext.workspaceId) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'JOB_ACCESS_DENIED',
            message: 'Access denied to the requested job',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(403).json(errorResponse);
        return;
      }

      // Log usage
      await RateLimitHelper.logUsage(
        authContext.userId,
        authContext.workspaceId,
        'GET /api/documents/progress',
        { jobId },
      );

      // Prepare detailed progress response
      const responseData: JobProgressResponse = {
        jobId,
        status: jobDetails.status,
        stages: jobDetails.stages.map(stage => ({
          name: stage.name,
          status: stage.status,
          startTime: stage.startTime?.toISOString(),
          endTime: stage.endTime?.toISOString(),
          duration: stage.startTime && stage.endTime
            ? stage.endTime.getTime() - stage.startTime.getTime()
            : undefined,
          error: stage.error,
          metrics: stage.metrics,
        })),
        metrics: jobDetails.metrics,
        realTimeUpdates: {
          lastUpdate: jobDetails.updatedAt.toISOString(),
          nextUpdate: this.calculateNextUpdateTime(jobDetails),
        },
      };

      const successResponse: ApiResponse<JobProgressResponse> = {
        success: true,
        data: responseData,
        metadata: {
          timestamp: new Date().toISOString(),
          version: this.API_VERSION,
        },
      };

      res.status(200).json(successResponse);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: this.API_VERSION,
          },
        };

        res.status(404).json(errorResponse);
        return;
      }

      const errorResponse: ApiResponse = {
        success: false,
        error: {
          code: 'PROGRESS_RETRIEVAL_ERROR',
          message: 'Failed to retrieve job progress',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: this.API_VERSION,
        },
      };

      res.status(500).json(errorResponse);
    }
  };

  // Helper Methods

  private async getJobDetails(jobId: string): Promise<WorkflowJob> {
    // This would need to be implemented in the DocumentWorkflowOrchestrator
    // For now, we'll simulate the behavior
    throw new Error(`Workflow job not found: ${jobId}`);
  }

  private calculateProgress(job: WorkflowJob): { currentStage: string; completedStages: number; totalStages: number; percentage: number } {
    const totalStages = job.stages.length;
    const completedStages = job.stages.filter(stage => stage.status === 'completed').length;
    const currentStage = job.stages.find(stage => stage.status === 'processing')?.name ||
                        job.stages.find(stage => stage.status === 'pending')?.name ||
                        'completed';

    const percentage = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

    return {
      currentStage,
      completedStages,
      totalStages,
      percentage,
    };
  }

  private calculateEstimatedCompletion(_job: WorkflowJob): string {
    // Simple estimation based on average processing time
    const estimatedMinutes = 5; // Default estimation
    const completionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    return completionTime.toISOString();
  }

  private calculateEstimatedTimeRemaining(job: WorkflowJob): number | undefined {
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return 0;
    }

    // Simple estimation based on remaining stages
    const remainingStages = job.stages.filter(stage =>
      stage.status === 'pending' || stage.status === 'processing',
    ).length;

    return remainingStages * 60000; // 1 minute per stage estimate
  }

  private calculateNextUpdateTime(job: WorkflowJob): string | undefined {
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return undefined;
    }

    // Next update in 30 seconds for active jobs
    const nextUpdate = new Date(Date.now() + 30000);
    return nextUpdate.toISOString();
  }
}

// Export factory function for creating controller instance
export function createDocumentIntegrationController(orchestrator: DocumentWorkflowOrchestrator): DocumentIntegrationController {
  return new DocumentIntegrationController(orchestrator);
}
