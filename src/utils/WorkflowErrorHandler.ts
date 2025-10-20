/**
 * Centralized Error Handling for Platform Workflows
 *
 * This module provides standardized error handling across all platform workflows
 * to eliminate back-and-forth debugging cycles and ensure consistent error reporting.
 */

export interface WorkflowError {
  code: string;
  message: string;
  details?: Record<string, any>;
  retryable?: boolean;
  context?: string;
  timestamp?: string;
  requestId?: string;
}

export interface WorkflowResponse<T = any> {
  success: boolean;
  data?: T;
  error?: WorkflowError;
  metadata?: {
    requestId?: string;
    processingTime?: number;
    timestamp: string;
    version?: string;
    endpoint?: string;
  };
}

export class WorkflowErrorHandler {
  private static readonly ERROR_CODES = {
    // Network & API Errors
    NETWORK_ERROR: 'NETWORK_ERROR',
    API_TIMEOUT: 'API_TIMEOUT',
    API_RATE_LIMIT: 'API_RATE_LIMIT',
    API_UNAUTHORIZED: 'API_UNAUTHORIZED',
    API_FORBIDDEN: 'API_FORBIDDEN',
    API_NOT_FOUND: 'API_NOT_FOUND',
    API_SERVER_ERROR: 'API_SERVER_ERROR',

    // Database Errors
    DATABASE_CONNECTION: 'DATABASE_CONNECTION',
    DATABASE_QUERY_ERROR: 'DATABASE_QUERY_ERROR',
    DATABASE_CONSTRAINT_VIOLATION: 'DATABASE_CONSTRAINT_VIOLATION',
    DATABASE_SCHEMA_MISMATCH: 'DATABASE_SCHEMA_MISMATCH',

    // Validation Errors
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    INVALID_PAYLOAD_FORMAT: 'INVALID_PAYLOAD_FORMAT',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',

    // MIVAA Service Errors
    MIVAA_SERVICE_UNAVAILABLE: 'MIVAA_SERVICE_UNAVAILABLE',
    MIVAA_PROCESSING_FAILED: 'MIVAA_PROCESSING_FAILED',
    MIVAA_INVALID_RESPONSE: 'MIVAA_INVALID_RESPONSE',
    MIVAA_TIMEOUT: 'MIVAA_TIMEOUT',

    // PDF Processing Errors
    PDF_PROCESSING_FAILED: 'PDF_PROCESSING_FAILED',
    PDF_EXTRACTION_FAILED: 'PDF_EXTRACTION_FAILED',
    PDF_INVALID_FORMAT: 'PDF_INVALID_FORMAT',

    // Material Recognition Errors
    MATERIAL_RECOGNITION_FAILED: 'MATERIAL_RECOGNITION_FAILED',
    IMAGE_PROCESSING_FAILED: 'IMAGE_PROCESSING_FAILED',
    INSUFFICIENT_IMAGE_QUALITY: 'INSUFFICIENT_IMAGE_QUALITY',

    // Workflow Errors
    WORKFLOW_STEP_FAILED: 'WORKFLOW_STEP_FAILED',
    WORKFLOW_TIMEOUT: 'WORKFLOW_TIMEOUT',
    WORKFLOW_CANCELLED: 'WORKFLOW_CANCELLED',

    // Generic Errors
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  } as const;

  private static readonly RETRYABLE_ERRORS = new Set([
    'NETWORK_ERROR',
    'API_TIMEOUT',
    'API_RATE_LIMIT',
    'API_SERVER_ERROR',
    'DATABASE_CONNECTION',
    'MIVAA_SERVICE_UNAVAILABLE',
    'MIVAA_TIMEOUT',
  ]);

  /**
   * Handle and standardize errors from any workflow
   */
  static handleError(
    error: any,
    context: string,
    requestId?: string,
  ): WorkflowResponse {
    const workflowError = this.classifyError(error, context);

    // Add context and metadata
    workflowError.context = context;
    workflowError.timestamp = new Date().toISOString();
    workflowError.requestId = requestId;

    // Log error for debugging
    console.error(`[${context}] Workflow Error:`, {
      code: workflowError.code,
      message: workflowError.message,
      details: workflowError.details,
      retryable: workflowError.retryable,
      requestId,
    });

    return {
      success: false,
      error: workflowError,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
  }

  /**
   * Classify error and assign appropriate error code
   */
  private static classifyError(error: any, context: string): WorkflowError {
    // Handle different error types
    if (error?.code) {
      // Already a WorkflowError
      if (typeof error.code === 'string' && error.code in this.ERROR_CODES) {
        return error as WorkflowError;
      }
    }

    // Network/Fetch errors
    if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
      return {
        code: this.ERROR_CODES.NETWORK_ERROR,
        message: 'Network connection failed',
        details: { originalError: error.message },
        retryable: true,
      };
    }

    // HTTP Status errors
    if (error?.status || error?.statusCode) {
      const status = error.status || error.statusCode;
      return this.classifyHttpError(status, error);
    }

    // Database errors (Supabase)
    if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
      return {
        code: this.ERROR_CODES.DATABASE_SCHEMA_MISMATCH,
        message: 'Database table or column does not exist',
        details: { originalError: error.message },
        retryable: false,
      };
    }

    if (error?.message?.includes('duplicate key') || error?.message?.includes('violates')) {
      return {
        code: this.ERROR_CODES.DATABASE_CONSTRAINT_VIOLATION,
        message: 'Database constraint violation',
        details: { originalError: error.message },
        retryable: false,
      };
    }

    // MIVAA service errors
    if (context.toLowerCase().includes('mivaa')) {
      if (error?.message?.includes('timeout')) {
        return {
          code: this.ERROR_CODES.MIVAA_TIMEOUT,
          message: 'MIVAA service request timed out',
          details: { originalError: error.message },
          retryable: true,
        };
      }

      return {
        code: this.ERROR_CODES.MIVAA_PROCESSING_FAILED,
        message: 'MIVAA service processing failed',
        details: { originalError: error.message },
        retryable: true,
      };
    }

    // PDF processing errors
    if (context.toLowerCase().includes('pdf')) {
      return {
        code: this.ERROR_CODES.PDF_PROCESSING_FAILED,
        message: 'PDF processing failed',
        details: { originalError: error.message },
        retryable: false,
      };
    }

    // Material recognition errors
    if (context.toLowerCase().includes('material') || context.toLowerCase().includes('recognition')) {
      return {
        code: this.ERROR_CODES.MATERIAL_RECOGNITION_FAILED,
        message: 'Material recognition failed',
        details: { originalError: error.message },
        retryable: true,
      };
    }

    // Generic error
    return {
      code: this.ERROR_CODES.UNKNOWN_ERROR,
      message: error?.message || 'An unknown error occurred',
      details: { originalError: error },
      retryable: false,
    };
  }

  /**
   * Classify HTTP status errors
   */
  private static classifyHttpError(status: number, error: any): WorkflowError {
    switch (status) {
      case 400:
        return {
          code: this.ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid request data',
          details: { status, originalError: error.message },
          retryable: false,
        };

      case 401:
        return {
          code: this.ERROR_CODES.API_UNAUTHORIZED,
          message: 'Authentication required',
          details: { status, originalError: error.message },
          retryable: false,
        };

      case 403:
        return {
          code: this.ERROR_CODES.API_FORBIDDEN,
          message: 'Access forbidden',
          details: { status, originalError: error.message },
          retryable: false,
        };

      case 404:
        return {
          code: this.ERROR_CODES.API_NOT_FOUND,
          message: 'Resource not found',
          details: { status, originalError: error.message },
          retryable: false,
        };

      case 429:
        return {
          code: this.ERROR_CODES.API_RATE_LIMIT,
          message: 'Rate limit exceeded',
          details: { status, originalError: error.message },
          retryable: true,
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          code: this.ERROR_CODES.API_SERVER_ERROR,
          message: 'Server error occurred',
          details: { status, originalError: error.message },
          retryable: true,
        };

      default:
        return {
          code: this.ERROR_CODES.UNKNOWN_ERROR,
          message: `HTTP ${status} error`,
          details: { status, originalError: error.message },
          retryable: status >= 500,
        };
    }
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: WorkflowError): boolean {
    return error.retryable === true || this.RETRYABLE_ERRORS.has(error.code);
  }

  /**
   * Create a success response
   */
  static createSuccessResponse<T>(
    data: T,
    metadata?: Record<string, any>,
  ): WorkflowResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        ...metadata,
      },
    };
  }

  /**
   * Wrap async operations with error handling
   */
  static async wrapAsync<T>(
    operation: () => Promise<T>,
    context: string,
    requestId?: string,
  ): Promise<WorkflowResponse<T>> {
    try {
      const startTime = Date.now();
      const result = await operation();
      const processingTime = Date.now() - startTime;

      return this.createSuccessResponse(result, {
        requestId,
        processingTime,
      });
    } catch (error) {
      return this.handleError(error, context, requestId);
    }
  }
}

export default WorkflowErrorHandler;
