/**
 * Custom Error Classes with Proper TypeScript Typing
 * Implements Phase 6 of TypeScript Quality Improvements
 */

/**
 * Base error class for Material-KAI Vision Platform
 */
export abstract class MaterialKAIError extends Error {
  public readonly code: string;
  public readonly timestamp: string;
  public readonly context: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date().toISOString();
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Validation error class for type and data validation failures
 */
export class ValidationError extends MaterialKAIError {
  public readonly field?: string;
  public readonly value?: unknown;
  public readonly expectedType?: string;

  constructor(
    message: string,
    field?: string,
    value?: unknown,
    expectedType?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 'VALIDATION_ERROR', context);
    this.field = field;
    this.value = value;
    this.expectedType = expectedType;
  }

  static forInvalidType(
    field: string,
    value: unknown,
    expectedType: string,
  ): ValidationError {
    return new ValidationError(
      `Invalid type for field '${field}'. Expected ${expectedType}, got ${typeof value}`,
      field,
      value,
      expectedType,
    );
  }

  static forMissingField(field: string): ValidationError {
    return new ValidationError(
      `Required field '${field}' is missing`,
      field,
      undefined,
      'defined value',
    );
  }

  static forInvalidValue(
    field: string,
    value: unknown,
    validValues: unknown[],
  ): ValidationError {
    return new ValidationError(
      `Invalid value for field '${field}'. Expected one of: ${validValues.join(', ')}`,
      field,
      value,
      `one of: ${validValues.join(', ')}`,
    );
  }
}

/**
 * API error class for service and endpoint failures
 */
export class APIError extends MaterialKAIError {
  public readonly statusCode?: number;
  public readonly endpoint?: string;
  public readonly method?: string;

  constructor(
    message: string,
    statusCode?: number,
    endpoint?: string,
    method?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 'API_ERROR', context);
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.method = method;
  }

  static forEndpoint(
    endpoint: string,
    method: string,
    statusCode: number,
    message?: string,
  ): APIError {
    return new APIError(
      message || `API call failed: ${method} ${endpoint}`,
      statusCode,
      endpoint,
      method,
    );
  }

  static forTimeout(endpoint: string, method: string): APIError {
    return new APIError(
      `API call timed out: ${method} ${endpoint}`,
      408,
      endpoint,
      method,
    );
  }
}

/**
 * Configuration error class for setup and config issues
 */
export class ConfigurationError extends MaterialKAIError {
  public readonly configKey?: string;
  public readonly configValue?: unknown;

  constructor(
    message: string,
    configKey?: string,
    configValue?: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.configKey = configKey;
    this.configValue = configValue;
  }

  static forMissingConfig(key: string): ConfigurationError {
    return new ConfigurationError(
      `Missing required configuration: ${key}`,
      key,
      undefined,
    );
  }

  static forInvalidConfig(
    key: string,
    value: unknown,
    expectedFormat: string,
  ): ConfigurationError {
    return new ConfigurationError(
      `Invalid configuration for '${key}'. Expected ${expectedFormat}`,
      key,
      value,
    );
  }
}

/**
 * Material processing error class for domain-specific errors
 */
export class MaterialProcessingError extends MaterialKAIError {
  public readonly materialId?: string;
  public readonly processingStage?: string;
  public readonly operationType?: string;

  constructor(
    message: string,
    materialId?: string,
    processingStage?: string,
    operationType?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 'MATERIAL_PROCESSING_ERROR', context);
    this.materialId = materialId;
    this.processingStage = processingStage;
    this.operationType = operationType;
  }

  static forAnalysisFailure(
    materialId: string,
    analysisType: string,
    reason: string,
  ): MaterialProcessingError {
    return new MaterialProcessingError(
      `Material analysis failed: ${reason}`,
      materialId,
      'analysis',
      analysisType,
    );
  }

  static forRecognitionFailure(
    reason: string,
    confidence?: number,
  ): MaterialProcessingError {
    return new MaterialProcessingError(
      `Material recognition failed: ${reason}`,
      undefined,
      'recognition',
      'image_analysis',
      { confidence },
    );
  }
}

/**
 * Type discrimination helper for error handling
 */
export type AppError =
  | ValidationError
  | APIError
  | ConfigurationError
  | MaterialProcessingError;

/**
 * Error type discrimination functions
 */
export function isValidationError(error: Error): error is ValidationError {
  return error instanceof ValidationError;
}

export function isAPIError(error: Error): error is APIError {
  return error instanceof APIError;
}

export function isConfigurationError(error: Error): error is ConfigurationError {
  return error instanceof ConfigurationError;
}

export function isMaterialProcessingError(error: Error): error is MaterialProcessingError {
  return error instanceof MaterialProcessingError;
}

export function isMaterialKAIError(error: Error): error is MaterialKAIError {
  return error instanceof MaterialKAIError;
}

/**
 * Error message typing for better error handling
 */
export interface ErrorContext {
  operation: string;
  service: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Error boundary types for React components
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: {
    componentStack: string;
  };
}

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
}

/**
 * Utility function to create standardized error responses
 */
export function createErrorResponse<T = never>(
  error: AppError,
  data?: T,
): {
  success: false;
  error: string;
  code: string;
  timestamp: string;
  data?: T;
} {
  return {
    success: false,
    error: error.message,
    code: error.code,
    timestamp: error.timestamp,
    data,
  };
}

/**
 * Utility function to create standardized success responses
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
): {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
} {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}
