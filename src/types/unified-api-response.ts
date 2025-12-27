/**
 * Unified API Response Types
 *
 * This module provides standardized TypeScript interfaces for all API responses,
 * ensuring type safety and consistency across the frontend application.
 *
 * These types match the backend UnifiedApiResponse schema defined in
 * mivaa-pdf-extractor/app/schemas/unified_response.py
 */

/**
 * Detailed error information
 */
export interface ErrorDetail {
  /** Machine-readable error code (e.g., 'VALIDATION_ERROR', 'SERVICE_UNAVAILABLE') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error context and debugging information */
  details?: Record<string, unknown>;
  /** Whether the request can be retried */
  retryable?: boolean;
}

/**
 * Response metadata for tracking and debugging
 */
export interface ResponseMetadata {
  /** Unique request identifier for tracing */
  request_id?: string;
  /** Request processing time in milliseconds */
  processing_time: number;
  /** Response timestamp in ISO 8601 format */
  timestamp: string;
  /** API version */
  version?: string;
  /** API endpoint path */
  endpoint?: string;
}

/**
 * Unified API response format for all endpoints
 *
 * @template T - Type of the response data payload
 *
 * @example
 * ```typescript
 * // Success response
 * const response: UnifiedApiResponse<SearchResults> = {
 *   success: true,
 *   data: { results: [...], total: 10 },
 *   metadata: {
 *     processing_time: 123.4,
 *     timestamp: '2024-01-15T10:30:00.000Z',
 *     endpoint: '/api/search'
 *   }
 * };
 *
 * // Error response
 * const errorResponse: UnifiedApiResponse = {
 *   success: false,
 *   error: {
 *     code: 'NOT_FOUND',
 *     message: 'Resource not found',
 *     retryable: false
 *   },
 *   metadata: {
 *     processing_time: 45.2,
 *     timestamp: '2024-01-15T10:30:00.000Z',
 *     endpoint: '/api/resource/123'
 *   }
 * };
 * ```
 */
export interface UnifiedApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data payload (present on success) */
  data?: T;
  /** Error details (present on failure) */
  error?: ErrorDetail;
  /** Response metadata for tracking and debugging */
  metadata: ResponseMetadata;
}

/**
 * Standard error codes for consistent error handling
 */
export enum ErrorCode {
  // Client Errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server Errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Processing Errors
  PDF_PROCESSING_ERROR = 'PDF_PROCESSING_ERROR',
  EMBEDDING_GENERATION_ERROR = 'EMBEDDING_GENERATION_ERROR',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  VECTOR_SEARCH_ERROR = 'VECTOR_SEARCH_ERROR',

  // Business Logic Errors
  INVALID_WORKSPACE = 'INVALID_WORKSPACE',
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
}

/**
 * Type guard to check if a response is successful
 */
export function isSuccessResponse<T>(
  response: UnifiedApiResponse<T>,
): response is UnifiedApiResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse(
  response: UnifiedApiResponse,
): response is UnifiedApiResponse & { success: false; error: ErrorDetail } {
  return response.success === false && response.error !== undefined;
}

/**
 * Extract data from response or throw error
 */
export function unwrapResponse<T>(response: UnifiedApiResponse<T>): T {
  if (isSuccessResponse(response)) {
    return response.data;
  }

  if (isErrorResponse(response)) {
    throw new Error(
      `API Error [${response.error.code}]: ${response.error.message}`,
    );
  }

  throw new Error('Invalid API response format');
}

