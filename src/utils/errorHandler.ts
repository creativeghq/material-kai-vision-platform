/**
 * Error Handler Utility
 *
 * Provides centralized error handling with context information,
 * logging, and standardized error responses.
 */

export interface ErrorContext {
  context?: string;
  service?: string;
  operation?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context: ErrorContext | undefined;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: ErrorContext,
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 400, true, context);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', context?: ErrorContext) {
    super(message, 404, true, context);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', context?: ErrorContext) {
    super(message, 401, true, context);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', context?: ErrorContext) {
    super(message, 503, true, context);
  }
}

export class ErrorHandler {
  /**
   * Handle and transform errors with context information
   */
  static handleError(error: unknown, context?: ErrorContext): AppError {
    // If it's already an AppError, create a new one with merged context
    if (error instanceof AppError) {
      if (context) {
        return new AppError(
          error.message,
          error.statusCode,
          error.isOperational,
          { ...error.context, ...context },
        );
      }
      return error;
    }

    // Handle Axios errors
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; data?: { message?: string } }; message?: string };
      const statusCode = axiosError.response.status;
      const message = axiosError.response.data?.message || axiosError.message || 'HTTP request failed';

      return new AppError(message, statusCode, true, {
        ...context,
        httpStatus: statusCode,
        responseData: axiosError.response.data,
      });
    }

    // Handle network errors
    if (error && typeof error === 'object' && 'request' in error) {
      const networkError = error as { code?: string };
      return new ServiceUnavailableError('Network error - service unavailable', {
        ...context,
        errorCode: networkError.code,
        errorType: 'network',
      });
    }

    // Handle validation errors (Zod, etc.)
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError' && 'errors' in error) {
      const zodError = error as { errors: unknown[] };
      return new ValidationError('Validation failed', {
        ...context,
        validationErrors: zodError.errors,
      });
    }

    // Handle generic errors
    const errorObj = error as Error;
    const message = errorObj.message || 'An unexpected error occurred';
    return new AppError(message, 500, false, {
      ...context,
      originalError: errorObj.name,
      stack: errorObj.stack,
    });
  }

  /**
   * Log error with appropriate level based on severity
   */
  static logError(error: AppError): void {
    const logData = {
      message: error.message,
      statusCode: error.statusCode,
      context: error.context,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };

    if (error.statusCode >= 500) {
      console.error('[ERROR]', logData);
    } else if (error.statusCode >= 400) {
      console.warn('[WARN]', logData);
    } else {
      console.info('[INFO]', logData);
    }
  }

  /**
   * Check if error is operational (expected) vs programming error
   */
  static isOperationalError(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }

  /**
   * Create a safe error response for API responses
   */
  static createErrorResponse(error: AppError): {
    error: {
      message: string;
      code: string;
      statusCode: number;
      context?: ErrorContext;
    };
  } {
    return {
      error: {
        message: error.message,
        code: error.name,
        statusCode: error.statusCode,
        ...(process.env.NODE_ENV === 'development' && error.context && { context: error.context }),
      },
    };
  }

  /**
   * Wrap async functions with error handling
   */
  static wrapAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        const appError = ErrorHandler.handleError(error);
        ErrorHandler.logError(appError);
        throw appError;
      }
    };
  }
}
