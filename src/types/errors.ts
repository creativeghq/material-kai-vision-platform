/**
 * Comprehensive Error Type System for Material-KAI Vision Platform
 * 
 * @fileoverview Type-safe error handling system with Result/Option patterns
 * @author TypeScript Specialist
 * @version 1.0.0
 */

// =============================================================================
// CORE ERROR TYPES
// =============================================================================

/**
 * Base error interface for all application errors
 * 
 * @interface BaseError
 * @description Foundation for all error types in the application
 */
export interface BaseError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Optional error details */
  details?: Record<string, unknown>;
  /** Timestamp when error occurred */
  timestamp: string;
  /** Whether this error is recoverable */
  recoverable: boolean;
}

/**
 * Domain-specific error types
 */
export enum ErrorDomain {
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK', 
  DATABASE = 'DATABASE',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  MATERIAL_PROCESSING = 'MATERIAL_PROCESSING',
  AI_SERVICE = 'AI_SERVICE',
  FILE_PROCESSING = 'FILE_PROCESSING',
  EXTERNAL_API = 'EXTERNAL_API'
}

/**
 * Validation error for input validation failures
 */
export interface ValidationError extends BaseError {
  domain: ErrorDomain.VALIDATION;
  field?: string | undefined;
  expectedType?: string | undefined;
  actualValue?: unknown;
}

/**
 * Network error for connectivity issues
 */
export interface NetworkError extends BaseError {
  domain: ErrorDomain.NETWORK;
  statusCode?: number | undefined;
  endpoint?: string | undefined;
  retryable: boolean;
}

/**
 * Database error for data persistence issues
 */
export interface DatabaseError extends BaseError {
  domain: ErrorDomain.DATABASE;
  query?: string | undefined;
  constraint?: string | undefined;
}

/**
 * Material processing error for AI/ML operations
 */
export interface MaterialProcessingError extends BaseError {
  domain: ErrorDomain.MATERIAL_PROCESSING;
  materialId?: string | undefined;
  processingStage?: string | undefined;
  confidence?: number | undefined;
}

// =============================================================================
// RESULT TYPE PATTERN
// =============================================================================

/**
 * Result type for explicit error handling without exceptions
 * 
 * @template T - Success value type
 * @template E - Error type
 * @description Functional programming approach to error handling
 * 
 * @example
 * ```typescript
 * async function fetchMaterial(id: string): Promise<Result<Material, NetworkError>> {
 *   try {
 *     const material = await api.getMaterial(id);
 *     return ok(material);
 *   } catch (error) {
 *     return err({
 *       domain: ErrorDomain.NETWORK,
 *       code: 'FETCH_FAILED',
 *       message: 'Failed to fetch material',
 *       timestamp: new Date().toISOString(),
 *       recoverable: true
 *     });
 *   }
 * }
 * ```
 */
export type Result<T, E extends BaseError = BaseError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Option type for nullable value handling
 * 
 * @template T - Value type
 * @description Type-safe nullable values without null/undefined
 * 
 * @example
 * ```typescript
 * function findMaterial(query: string): Option<Material> {
 *   const material = materials.find(m => m.name.includes(query));
 *   return material ? some(material) : none();
 * }
 * ```
 */
export type Option<T> = 
  | { some: true; value: T }
  | { some: false };

// =============================================================================
// RESULT HELPERS
// =============================================================================

/**
 * Creates a successful Result
 * 
 * @param value - Success value
 * @returns Success Result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Creates a failed Result
 * 
 * @param error - Error information
 * @returns Error Result
 */
export function err<E extends BaseError>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard for successful Result
 * 
 * @param result - Result to check
 * @returns True if Result is successful
 */
export function isOk<T, E extends BaseError>(
  result: Result<T, E>
): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Type guard for failed Result
 * 
 * @param result - Result to check
 * @returns True if Result is an error
 */
export function isErr<T, E extends BaseError>(
  result: Result<T, E>
): result is { ok: false; error: E } {
  return !result.ok;
}

// =============================================================================
// OPTION HELPERS
// =============================================================================

/**
 * Creates an Option with a value
 * 
 * @param value - Value to wrap
 * @returns Option with value
 */
export function some<T>(value: T): Option<T> {
  return { some: true, value };
}

/**
 * Creates an empty Option
 * 
 * @returns Empty Option
 */
export function none<T>(): Option<T> {
  return { some: false };
}

/**
 * Type guard for Option with value
 * 
 * @param option - Option to check
 * @returns True if Option has value
 */
export function isSome<T>(option: Option<T>): option is { some: true; value: T } {
  return option.some;
}

/**
 * Type guard for empty Option
 * 
 * @param option - Option to check
 * @returns True if Option is empty
 */
export function isNone<T>(option: Option<T>): option is { some: false } {
  return !option.some;
}

// =============================================================================
// ERROR FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a validation error
 * 
 * @param message - Error message
 * @param field - Field that failed validation
 * @param expectedType - Expected type
 * @param actualValue - Actual invalid value
 * @returns ValidationError
 */
export function createValidationError(
  message: string,
  field?: string,
  expectedType?: string,
  actualValue?: unknown
): ValidationError {
  return {
    domain: ErrorDomain.VALIDATION,
    code: 'VALIDATION_FAILED',
    message,
    field,
    expectedType,
    actualValue,
    timestamp: new Date().toISOString(),
    recoverable: true
  };
}

/**
 * Creates a network error
 * 
 * @param message - Error message
 * @param statusCode - HTTP status code
 * @param endpoint - Failed endpoint
 * @returns NetworkError
 */
export function createNetworkError(
  message: string,
  statusCode?: number,
  endpoint?: string
): NetworkError {
  return {
    domain: ErrorDomain.NETWORK,
    code: 'NETWORK_ERROR',
    message,
    statusCode,
    endpoint,
    retryable: statusCode ? statusCode >= 500 : true,
    timestamp: new Date().toISOString(),
    recoverable: true
  };
}

/**
 * Creates a material processing error
 * 
 * @param message - Error message
 * @param materialId - ID of material being processed
 * @param processingStage - Stage where error occurred
 * @returns MaterialProcessingError
 */
export function createMaterialProcessingError(
  message: string,
  materialId?: string,
  processingStage?: string
): MaterialProcessingError {
  return {
    domain: ErrorDomain.MATERIAL_PROCESSING,
    code: 'PROCESSING_FAILED',
    message,
    materialId,
    processingStage,
    timestamp: new Date().toISOString(),
    recoverable: true
  };
}

// =============================================================================
// RESULT TRANSFORMATION UTILITIES
// =============================================================================

/**
 * Maps a successful Result to a new type
 * 
 * @param result - Input Result
 * @param fn - Transformation function
 * @returns Transformed Result
 */
export function mapResult<T, U, E extends BaseError>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

/**
 * Chains Result operations
 * 
 * @param result - Input Result
 * @param fn - Function that returns Result
 * @returns Chained Result
 */
export function flatMapResult<T, U, E extends BaseError>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}

/**
 * Unwraps Result value or throws error
 * 
 * @param result - Result to unwrap
 * @returns Unwrapped value
 * @throws Error if Result is failure
 */
export function unwrapResult<T, E extends BaseError>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw new Error(`Result unwrap failed: ${result.error.message}`);
}

/**
 * Unwraps Result value or returns default
 * 
 * @param result - Result to unwrap
 * @param defaultValue - Default value if Result is failure
 * @returns Value or default
 */
export function unwrapOr<T, E extends BaseError>(
  result: Result<T, E>,
  defaultValue: T
): T {
  return isOk(result) ? result.value : defaultValue;
}