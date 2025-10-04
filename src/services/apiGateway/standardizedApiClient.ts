/**
 * Standardized API Client Infrastructure
 *
 * This module provides consistent wrapper patterns for API calls while preserving
 * each API's unique schemas, authentication methods, and response formats.
 *
 * Key Principles:
 * - Standardize the INTERFACE, not the implementation
 * - Preserve API-specific parameter schemas
 * - Maintain unique error handling per API
 * - Keep response formats unchanged
 */


import { ApiConfig, ApiConfigManager } from '../../config';

// Standardized response wrapper (preserves original data structure)
export interface StandardizedApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: StandardizedError;
  metadata: {
    apiType: string;
    modelId?: string;
    timestamp: string;
    requestId: string;
    duration?: number;
  };
}

// Standardized error structure (preserves original error details)
export interface StandardizedError {
  code: string;
  message: string;
  details?: Record<string, any>; // Preserves API-specific error details
  originalError?: Error | any; // Keeps the raw error for debugging
  retryable: boolean;
  apiSpecific?: {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: Record<string, any>;
  };
}

// Base interface for all API clients (preserves unique implementations)
export interface StandardizedApiClient<TParams = any, TResponse = any> {
  readonly apiType: string;
  readonly modelId?: string;

  // Core execution method - parameters stay API-specific
  execute(params: TParams): Promise<StandardizedApiResponse<TResponse>>;

  // Validation using API-specific schemas
  validateParams(params: any): TParams;

  // Error handling preserving API-specific details
  handleError(error: Error | any): StandardizedError;

  // Health check for the API
  healthCheck(): Promise<boolean>;
}

// Abstract base class providing common functionality
export abstract class BaseApiClient<TParams, TResponse> implements StandardizedApiClient<TParams, TResponse> {
  protected readonly config: ApiConfig;
  protected readonly requestIdGenerator: () => string;

  constructor(
    public readonly apiType: string,
    public readonly modelId?: string,
  ) {
    const config = ApiConfigManager.getApiConfigByType(apiType);
    if (!config) {
      throw new Error(`API configuration not found for type: ${apiType}`);
    }
    this.config = config;
    this.requestIdGenerator = () => `${apiType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  abstract execute(params: TParams): Promise<StandardizedApiResponse<TResponse>>;
  abstract validateParams(params: any): TParams;
  abstract healthCheck(): Promise<boolean>;

  // Common error handling that preserves API-specific details
  handleError(error: Error | any): StandardizedError {
    const baseError: StandardizedError = {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      retryable: false,
      originalError: error,
    };

    if (error instanceof Error) {
      baseError.message = error.message;
      baseError.code = error.name || 'ERROR';
    }

    // Let subclasses enhance with API-specific error handling
    return this.enhanceError(baseError, error);
  }

  // Hook for API-specific error enhancement
  protected enhanceError(baseError: StandardizedError, _originalError: Error | any): StandardizedError {
    return baseError;
  }

  // Common response wrapper
  protected createResponse<T>(
    data: T,
    startTime: number,
    requestId: string,
  ): StandardizedApiResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        apiType: this.apiType,
        modelId: this.modelId || undefined,
        timestamp: new Date().toISOString(),
        requestId,
        duration: Date.now() - startTime,
      },
    };
  }

  // Common error response wrapper
  protected createErrorResponse(
    error: StandardizedError,
    startTime: number,
    requestId: string,
  ): StandardizedApiResponse {
    return {
      success: false,
      error,
      metadata: {
        apiType: this.apiType,
        modelId: this.modelId || undefined,
        timestamp: new Date().toISOString(),
        requestId,
        duration: Date.now() - startTime,
      },
    };
  }
}

// Retry configuration interface
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

// Default retry configuration
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT', 'SERVER_ERROR'],
};

// Retry utility function
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | any;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === retryConfig.maxAttempts) {
        break;
      }

      // Check if error is retryable
      const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      if (!retryConfig.retryableErrors.includes(errorCode)) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
        retryConfig.maxDelay,
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// NOTE: API Client Factory has been moved to apiClientFactory.ts
// Use the CentralizedApiClientFactory singleton instead

// Utility types for better TypeScript support
export type ApiClientFor<T extends ApiConfig> = T extends { type: infer _U }
  ? StandardizedApiClient<unknown, unknown>
  : never;

export type ExtractParams<T> = T extends StandardizedApiClient<infer P, unknown> ? P : never;
export type ExtractResponse<T> = T extends StandardizedApiClient<unknown, infer R> ? R : never;
