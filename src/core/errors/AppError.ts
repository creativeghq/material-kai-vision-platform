/**
 * Centralized Error Handling System
 * Provides structured error handling with context preservation and correlation tracking
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  API = 'api',
  DATABASE = 'database',
  PROCESSING = 'processing',
  CONFIGURATION = 'configuration',
  EXTERNAL_SERVICE = 'external_service',
  UNKNOWN = 'unknown'
}

export interface ErrorContext {
  operation: string;
  service: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ErrorDetails {
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  originalError?: Error;
  stack?: string;
  correlationId: string;
}

/**
 * Base application error class with structured context and correlation tracking
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly originalError?: Error;
  public readonly correlationId: string;
  public readonly timestamp: string;

  constructor(details: Omit<ErrorDetails, 'correlationId' | 'timestamp'>) {
    super(details.message);

    this.name = 'AppError';
    this.code = details.code;
    this.category = details.category;
    this.severity = details.severity;
    this.context = details.context;
    // Only assign originalError if it's defined to satisfy exactOptionalPropertyTypes
    if (details.originalError !== undefined) {
      this.originalError = details.originalError;
    }
    this.correlationId = this.generateCorrelationId();
    this.timestamp = new Date().toISOString();

    // Preserve original stack trace if available
    if (details.originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${details.originalError.stack}`;
    }

    // Ensure the error is properly captured
    Error.captureStackTrace?.(this, AppError);
  }

  private generateCorrelationId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert error to structured log format
   */
  toLogFormat(): Record<string, unknown> {
    return {
      correlationId: this.correlationId,
      timestamp: this.timestamp,
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack,
      } : undefined,
    };
  }

  /**
   * Convert error to user-friendly format (without sensitive details)
   */
  toUserFormat(): { message: string; code: string; correlationId: string } {
    return {
      message: this.getUserFriendlyMessage(),
      code: this.code,
      correlationId: this.correlationId,
    };
  }

  public getUserFriendlyMessage(): string {
    // Map technical errors to user-friendly messages
    const userFriendlyMessages: Record<string, string> = {
      'NETWORK_ERROR': 'Connection issue. Please check your internet connection and try again.',
      'API_RATE_LIMIT': 'Too many requests. Please wait a moment and try again.',
      'VALIDATION_ERROR': 'Invalid input provided. Please check your data and try again.',
      'AUTHENTICATION_ERROR': 'Authentication failed. Please log in again.',
      'AUTHORIZATION_ERROR': 'You do not have permission to perform this action.',
      'DATABASE_ERROR': 'Data storage issue. Please try again later.',
      'EXTERNAL_SERVICE_ERROR': 'External service unavailable. Please try again later.',
      'CONFIGURATION_ERROR': 'System configuration issue. Please contact support.',
    };

    return userFriendlyMessages[this.code] || 'An unexpected error occurred. Please try again or contact support.';
  }
}

/**
 * Specific error classes for common scenarios
 */
export class ValidationError extends AppError {
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context,
      ...(originalError !== undefined && { originalError }),
    });
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super({
      code: 'NETWORK_ERROR',
      message,
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      context,
      ...(originalError !== undefined && { originalError }),
    });
  }
}

export class APIError extends AppError {
  constructor(message: string, context: ErrorContext, originalError?: Error, code = 'API_ERROR') {
    super({
      code,
      message,
      category: ErrorCategory.API,
      severity: ErrorSeverity.HIGH,
      context,
      ...(originalError !== undefined && { originalError }),
    });
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super({
      code: 'DATABASE_ERROR',
      message,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.CRITICAL,
      context,
      ...(originalError !== undefined && { originalError }),
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      message,
      category: ErrorCategory.EXTERNAL_SERVICE,
      severity: ErrorSeverity.HIGH,
      context,
      ...(originalError !== undefined && { originalError }),
    });
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super({
      code: 'CONFIGURATION_ERROR',
      message,
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.CRITICAL,
      context,
      ...(originalError !== undefined && { originalError }),
    });
  }
}
