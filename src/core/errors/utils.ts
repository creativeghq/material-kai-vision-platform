/**
 * Error Handling Utility Functions
 * Common patterns and helpers for error handling across the application
 */

import { AppError, ErrorContext, ErrorCategory, ErrorSeverity, APIError, NetworkError, ValidationError, DatabaseError, ExternalServiceError } from './AppError';
import { errorLogger } from './ErrorLogger';

/**
 * Create error context for a service operation
 */
export function createErrorContext(
  service: string,
  operation: string,
  metadata?: Record<string, unknown>,
): ErrorContext {
  return {
    operation,
    service,
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
  };
}

/**
 * Wrap async operations with standardized error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
): Promise<T> {
  try {
    errorLogger.logDebug(`Starting operation: ${context.operation}`, {
      service: context.service,
      operation: context.operation,
      ...(context.metadata && { metadata: context.metadata }),
    });

    const result = await operation();

    errorLogger.logDebug(`Completed operation: ${context.operation}`, {
      service: context.service,
      operation: context.operation,
      metadata: { ...context.metadata, success: true },
    });

    return result;
  } catch (error) {
    const appError = error instanceof AppError
      ? error
      : new AppError({
          code: 'OPERATION_ERROR',
          message: `Operation failed: ${context.operation}`,
          category: ErrorCategory.PROCESSING,
          severity: ErrorSeverity.HIGH,
          context,
          originalError: error instanceof Error ? error : new Error(String(error)),
        });

    errorLogger.logError(appError);
    throw appError;
  }
}

/**
 * Handle API response errors with proper categorization
 */
export function handleAPIError(
  error: unknown,
  context: ErrorContext,
  endpoint?: string,
): never {
  let apiError: APIError;

  // Type guard to check if error has response property
  if (error && typeof error === 'object' && 'response' in error) {
    const errorWithResponse = error as { response: { status: number; statusText?: string; data?: unknown } };
    // HTTP error response
    const status = errorWithResponse.response.status;
    const statusText = errorWithResponse.response.statusText || 'Unknown Error';

    let code = 'API_ERROR';
    let severity = ErrorSeverity.HIGH;

    if (status === 401) {
      code = 'API_UNAUTHORIZED';
      severity = ErrorSeverity.CRITICAL;
    } else if (status === 403) {
      code = 'API_FORBIDDEN';
      severity = ErrorSeverity.HIGH;
    } else if (status === 404) {
      code = 'API_NOT_FOUND';
      severity = ErrorSeverity.MEDIUM;
    } else if (status === 429) {
      code = 'API_RATE_LIMIT';
      severity = ErrorSeverity.MEDIUM;
    } else if (status >= 500) {
      code = 'API_SERVER_ERROR';
      severity = ErrorSeverity.CRITICAL;
    }

    apiError = new APIError(
      `API request failed: ${status} ${statusText}${endpoint ? ` (${endpoint})` : ''}`,
      {
        ...context,
        metadata: {
          ...context.metadata,
          endpoint,
          status,
          statusText,
          severity,
          responseData: errorWithResponse.response.data,
        },
      },
      error instanceof Error ? error : new Error(String(error)),
      code,
    );
  } else if (error && typeof error === 'object' && 'request' in error) {
    // Network error
    apiError = new APIError(
      `Network error: No response received${endpoint ? ` from ${endpoint}` : ''}`,
      {
        ...context,
        metadata: {
          ...context.metadata,
          endpoint,
          networkError: true,
        },
      },
      error instanceof Error ? error : new Error(String(error)),
      'API_NETWORK_ERROR',
    );
  } else {
    // Request setup error
    apiError = new APIError(
      `Request setup error: ${error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)}${endpoint ? ` for ${endpoint}` : ''}`,
      {
        ...context,
        metadata: {
          ...context.metadata,
          endpoint,
          setupError: true,
        },
      },
      error instanceof Error ? error : new Error(String(error)),
      'API_REQUEST_ERROR',
    );
  }

  errorLogger.logError(apiError);
  throw apiError;
}

/**
 * Handle network errors with retry logic awareness
 */
export function handleNetworkError(
  error: unknown,
  context: ErrorContext,
  retryAttempt?: number,
): never {
  const networkError = new NetworkError(
    `Network operation failed: ${error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)}`,
    {
      ...context,
      metadata: {
        ...context.metadata,
        retryAttempt,
        networkError: true,
        errorCode: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
        errorType: error && typeof error === 'object' && 'type' in error ? error.type : undefined,
      },
    },
    error instanceof Error ? error : new Error(String(error)),
  );

  errorLogger.logError(networkError);
  throw networkError;
}

/**
 * Handle validation errors with field-specific context
 */
export function handleValidationError(
  message: string,
  context: ErrorContext,
  field?: string,
  value?: unknown,
): never {
  const validationError = new ValidationError(
    message,
    {
      ...context,
      metadata: {
        ...context.metadata,
        field,
        value: typeof value === 'object' ? JSON.stringify(value) : value,
        validationError: true,
      },
    },
  );

  errorLogger.logError(validationError);
  throw validationError;
}

/**
 * Handle database errors with query context
 */
export function handleDatabaseError(
  error: unknown,
  context: ErrorContext,
  query?: string,
  params?: unknown[],
): never {
  const dbError = new DatabaseError(
    `Database operation failed: ${error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)}`,
    {
      ...context,
      metadata: {
        ...context.metadata,
        query,
        params,
        databaseError: true,
        errorCode: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
        errorDetail: error && typeof error === 'object' && 'detail' in error ? error.detail : undefined,
      },
    },
    error instanceof Error ? error : new Error(String(error)),
  );

  errorLogger.logError(dbError);
  throw dbError;
}

/**
 * Handle external service errors with service-specific context
 */
export function handleExternalServiceError(
  error: unknown,
  context: ErrorContext,
  serviceName: string,
  endpoint?: string,
): never {
  const serviceError = new ExternalServiceError(
    `External service error (${serviceName}): ${error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)}`,
    {
      ...context,
      metadata: {
        ...context.metadata,
        serviceName,
        endpoint,
        externalServiceError: true,
        serviceResponse: error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response ? error.response.data : undefined,
      },
    },
    error instanceof Error ? error : new Error(String(error)),
  );

  errorLogger.logError(serviceError);
  throw serviceError;
}

/**
 * Safely extract error message from unknown error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error occurred';
}

/**
 * Check if an error is retryable based on its type and context
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    // Don't retry validation errors or authentication errors
    if (error.category === ErrorCategory.VALIDATION ||
        error.category === ErrorCategory.AUTHENTICATION ||
        error.category === ErrorCategory.AUTHORIZATION) {
      return false;
    }

    // Retry network errors and some API errors
    if (error.category === ErrorCategory.NETWORK) {
      return true;
    }

    if (error instanceof APIError) {
      // Retry rate limits and server errors, but not client errors
      return error.code === 'API_RATE_LIMIT' ||
             error.code === 'API_SERVER_ERROR' ||
             error.code === 'API_NETWORK_ERROR';
    }

    // Retry external service errors
    if (error.category === ErrorCategory.EXTERNAL_SERVICE) {
      return true;
    }
  }

  return false;
}

/**
 * Create a standardized error response for API endpoints
 */
export function createErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.getUserFriendlyMessage(),
        correlationId: error.correlationId,
        timestamp: error.timestamp,
      },
    };
  }

  // Fallback for non-AppError instances
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again or contact support.',
      correlationId: `fallback_${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
  };
}
