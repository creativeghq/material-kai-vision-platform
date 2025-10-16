/**
 * API Error Handler
 * 
 * Provides standardized error handling for API calls with
 * user-friendly messages and proper error categorization.
 */

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  statusCode?: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Handle API errors with proper categorization and user feedback
 */
export function handleApiError(error: unknown, context?: string): ApiErrorResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const statusCode = (error as any)?.status || (error as any)?.statusCode;

  // Network errors
  if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
    return {
      success: false,
      error: 'NETWORK_ERROR',
      code: 'NETWORK_ERROR',
      message: 'Network connection failed. Please check your internet connection.',
      retryable: true,
      statusCode: 0,
    };
  }

  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('504') || statusCode === 504) {
    return {
      success: false,
      error: 'TIMEOUT_ERROR',
      code: 'TIMEOUT_ERROR',
      message: 'Request timed out. The server took too long to respond.',
      details: { originalError: errorMessage },
      retryable: true,
      statusCode: 504,
    };
  }

  // Authentication errors
  if (errorMessage.includes('401') || statusCode === 401) {
    return {
      success: false,
      error: 'AUTHENTICATION_ERROR',
      code: 'UNAUTHORIZED',
      message: 'Authentication failed. Please log in again.',
      retryable: false,
      statusCode: 401,
    };
  }

  // Authorization errors
  if (errorMessage.includes('403') || statusCode === 403) {
    return {
      success: false,
      error: 'AUTHORIZATION_ERROR',
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
      retryable: false,
      statusCode: 403,
    };
  }

  // Not found errors
  if (errorMessage.includes('404') || statusCode === 404) {
    return {
      success: false,
      error: 'NOT_FOUND_ERROR',
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      retryable: false,
      statusCode: 404,
    };
  }

  // Validation errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid') || statusCode === 400) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      code: 'BAD_REQUEST',
      message: 'Invalid input. Please check your data and try again.',
      details: { originalError: errorMessage },
      retryable: false,
      statusCode: 400,
    };
  }

  // Server errors
  if (statusCode && statusCode >= 500) {
    return {
      success: false,
      error: 'SERVER_ERROR',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Server error. Please try again later or contact support.',
      details: { statusCode, originalError: errorMessage },
      retryable: true,
      statusCode,
    };
  }

  // Generic error
  return {
    success: false,
    error: 'UNKNOWN_ERROR',
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred. Please try again.',
    details: { originalError: errorMessage, context },
    retryable: true,
  };
}

/**
 * Wrap API call with error handling
 */
export async function callApi<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<ApiResponse<T>> {
  try {
    const data = await fn();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: ApiErrorResponse): boolean {
  return error.retryable;
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: ApiErrorResponse): string {
  const messages: Record<string, string> = {
    NETWORK_ERROR: 'Unable to connect. Please check your internet connection.',
    TIMEOUT_ERROR: 'The request took too long. Please try again.',
    AUTHENTICATION_ERROR: 'Your session has expired. Please log in again.',
    AUTHORIZATION_ERROR: 'You do not have permission to perform this action.',
    NOT_FOUND_ERROR: 'The requested item was not found.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    SERVER_ERROR: 'Server error. Please try again later.',
    UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
  };

  return messages[error.code] || error.message || 'An error occurred.';
}

/**
 * Log API error for debugging
 */
export function logApiError(error: ApiErrorResponse, context?: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] API Error${context ? ` (${context})` : ''}: ${error.code} - ${error.message}`;

  if (error.statusCode && error.statusCode >= 500) {
    console.error(logMessage, error.details);
  } else if (error.statusCode && error.statusCode >= 400) {
    console.warn(logMessage, error.details);
  } else {
    console.log(logMessage, error.details);
  }
}

