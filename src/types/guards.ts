/**
 * TypeScript type guards for runtime type validation
 * Implements Phase 2 of TypeScript Quality Improvements
 */

import {
  Material,
  ProcessingJobStatus,
  RecognitionResult,
  MaterialAgentTaskRequest,
  AgentExecutionData,
  MaterialProperties,
  SpatialAnalysisData,
} from './materials';

/**
 * Type guard for Material objects
 * @param value - The value to check
 * @returns True if value is a valid Material
 */
export function isMaterial(value: unknown): value is Material {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.category === 'string' &&
    typeof obj.properties === 'object' &&
    typeof obj.metadata === 'object' &&
    Array.isArray(obj.standards) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}

/**
 * Type guard for ProcessingJob status validation
 * @param value - The value to check
 * @returns True if value is a valid ProcessingJobStatus
 */
export function isProcessingJobStatus(
  value: unknown,
): value is ProcessingJobStatus {
  return Object.values(ProcessingJobStatus).includes(
    value as ProcessingJobStatus,
  );
}

/**
 * Type guard for RecognitionResult material consistency
 * @param value - The value to check
 * @returns True if value is a valid RecognitionResult
 */
export function isRecognitionResult(
  value: unknown,
): value is RecognitionResult {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.materialId === 'string' &&
    typeof obj.confidence === 'number' &&
    obj.confidence >= 0 &&
    obj.confidence <= 1 &&
    isMaterial(obj.matchedMaterial) &&
    typeof obj.extractedProperties === 'object'
  );
}

/**
 * Type guard for MaterialAgentTaskRequest
 * @param value - The value to check
 * @returns True if value is a valid MaterialAgentTaskRequest
 */
export function isMaterialAgentTaskRequest(
  value: unknown,
): value is MaterialAgentTaskRequest {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    ['analysis', 'recognition', 'processing'].includes(
      obj.taskType as string,
    ) &&
    typeof obj.inputData === 'object' &&
    obj.inputData !== null
  );
}

/**
 * Type guard for AgentExecutionResult
 * @param value - The value to check
 * @returns True if value is a valid AgentExecutionResult
 */
export function isAgentExecutionResult(
  value: unknown,
): value is AgentExecutionData {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.agent_id === 'string' &&
    typeof obj.output === 'object' &&
    typeof obj.confidence === 'number' &&
    typeof obj.reasoning === 'string'
  );
}

/**
 * Type guard for MaterialProperties
 * @param value - The value to check
 * @returns True if value is a valid MaterialProperties
 */
export function isMaterialProperties(
  value: unknown,
): value is MaterialProperties {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  // All properties are optional, but if present must be correct types
  return (
    (obj.density === undefined || typeof obj.density === 'number') &&
    (obj.thermalConductivity === undefined ||
      typeof obj.thermalConductivity === 'number') &&
    (obj.yieldStrength === undefined ||
      typeof obj.yieldStrength === 'number') &&
    (obj.tensileStrength === undefined ||
      typeof obj.tensileStrength === 'number')
  );
}

/**
 * Type guard for SpatialAnalysisData
 * @param value - The value to check
 * @returns True if value is a valid SpatialAnalysisData
 */
export function isSpatialAnalysisData(
  value: unknown,
): value is SpatialAnalysisData {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.room_type === 'string' &&
    typeof obj.dimensions === 'object' &&
    Array.isArray(obj.features)
  );
}

/**
 * Runtime validation helper that throws if type guard fails
 * @param value - Value to validate
 * @param guard - Type guard function
 * @param errorMessage - Custom error message
 * @returns The validated value
 */
export function assertType<T>(
  value: unknown,
  guard: (val: unknown) => val is T,
  errorMessage: string,
): T {
  if (!guard(value)) {
    throw new TypeError(errorMessage);
  }
  return value;
}

/**
 * Safe parser that returns default value if validation fails
 * @param value - Value to parse
 * @param guard - Type guard function
 * @param defaultValue - Default value to return if validation fails
 * @returns The validated value or default
 */
export function parseWithDefault<T>(
  value: unknown,
  guard: (val: unknown) => val is T,
  defaultValue: T,
): T {
  return guard(value) ? value : defaultValue;
}

/**
 * Validation result interface
 */
export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Creates a validation result object
 * @param isValid - Whether validation passed
 * @param data - The validated data (if valid)
 * @param errors - Array of error messages (if invalid)
 * @returns ValidationResult object
 */
export function createValidationResult<T>(
  isValid: boolean,
  data?: T,
  errors?: string[],
): ValidationResult<T> {
  return {
    isValid,
    data,
    errors,
  };
}

/**
 * Validates with a type guard and returns a validation result
 * @param value - Value to validate
 * @param guard - Type guard function
 * @param errorMessage - Error message if validation fails
 * @returns ValidationResult
 */
export function validateWithGuard<T>(
  value: unknown,
  guard: (val: unknown) => val is T,
  errorMessage: string,
): ValidationResult<T> {
  if (guard(value)) {
    return createValidationResult(true, value);
  }
  return createValidationResult(false, undefined as T, [errorMessage]);
}
