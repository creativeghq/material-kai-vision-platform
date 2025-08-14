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
  [key: string]: any;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context: ErrorContext | undefined;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: ErrorContext
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
  static handleError(error: any, context?: ErrorContext): AppError {
    // If it's already an AppError, create a new one with merged context
    if (error instanceof AppError) {
      if (context) {
        return new AppError(
          error.message,
          error.statusCode,
          error.isOperational,
          { ...error.context, ...context }
        );
      }
      return error;
    }

    // Handle Axios errors
    if (error.response) {
      const statusCode = error.response.status;
      const message = error.response.data?.message || error.message || 'HTTP request failed';
      
      return new AppError(message, statusCode, true, {
        ...context,
        httpStatus: statusCode,
        responseData: error.response.data
      });
    }

    // Handle network errors
    if (error.request) {
      return new ServiceUnavailableError('Network error - service unavailable', {
        ...context,
        errorCode: error.code,
        errorType: 'network'
      });
    }

    // Handle validation errors (Zod, etc.)
    if (error.name === 'ZodError') {
      return new ValidationError('Validation failed', {
        ...context,
        validationErrors: error.errors
      });
    }

    // Handle generic errors
    const message = error.message || 'An unexpected error occurred';
    return new AppError(message, 500, false, {
      ...context,
      originalError: error.name,
      stack: error.stack
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
      timestamp: new Date().toISOString()
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
      context?: any;
    };
  } {
    return {
      error: {
        message: error.message,
        code: error.name,
        statusCode: error.statusCode,
        ...(process.env.NODE_ENV === 'development' && { context: error.context })
      }
    };
  }

  /**
   * Wrap async functions with error handling
   */
  static wrapAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>
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