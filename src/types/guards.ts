/**
 * Type Guards for Material Kai Vision Platform
 * 
 * This module contains comprehensive type guard functions that provide runtime type checking
 * and enable proper TypeScript type narrowing throughout the application.
 * 
 * @fileoverview Comprehensive type guards for runtime validation and type narrowing
 * @author TypeScript Specialist
 * @version 1.0.0
 */

import type {
  MaterialData,
  NeRFData,
  SpatialAnalysisData,
  AgentExecutionData,
  Material,
  RecognitionResult,
  ProcessingJob,
  ProcessingStatus,
  DetectionMethod,
  MaterialProperties,
  FunctionalMetadata,
  ChemicalComposition,
  SafetyData,
  MaterialMetadata,
  UploadedFile,
  FileMetadata,
} from './materials';

// =============================================================================
// CORE MATERIAL TYPE GUARDS
// =============================================================================

/**
 * Type guard to validate MaterialData objects
 * @param obj - Unknown object to validate
 * @returns True if obj is a valid MaterialData object
 */
export function isMaterialData(obj: unknown): obj is MaterialData {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const data = obj as Record<string, unknown>;

  // Check for required basic properties
  if (typeof data.material_id !== 'string' && data.material_id !== undefined) {
    return false;
  }

  if (typeof data.identification_confidence !== 'number' && data.identification_confidence !== undefined) {
    return false;
  }

  // Validate properties structure if present
  if (data.properties !== undefined) {
    if (!isValidMaterialProperties(data.properties)) {
      return false;
    }
  }

  // Validate visual characteristics if present
  if (data.visual_characteristics !== undefined) {
    if (!isValidVisualCharacteristics(data.visual_characteristics)) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to validate NeRFData objects
 * @param obj - Unknown object to validate
 * @returns True if obj is a valid NeRFData object
 */
export function isNeRFData(obj: unknown): obj is NeRFData {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const data = obj as Record<string, unknown>;

  // Check required reconstruction_id
  if (typeof data.reconstruction_id !== 'string') {
    return false;
  }

  // Validate point_cloud structure if present
  if (data.point_cloud !== undefined) {
    if (!isValidPointCloud(data.point_cloud)) {
      return false;
    }
  }

  // Validate mesh_data structure if present
  if (data.mesh_data !== undefined) {
    if (!isValidMeshData(data.mesh_data)) {
      return false;
    }
  }

  // Validate quality_metrics if present
  if (data.quality_metrics !== undefined) {
    if (!isValidQualityMetrics(data.quality_metrics)) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to validate SpatialAnalysisData objects
 * @param obj - Unknown object to validate
 * @returns True if obj is a valid SpatialAnalysisData object
 */
export function isSpatialAnalysisData(obj: unknown): obj is SpatialAnalysisData {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const data = obj as Record<string, unknown>;

  // Check required room_geometry
  if (!data.room_geometry || !isValidRoomGeometry(data.room_geometry)) {
    return false;
  }

  // Validate spatial_features if present
  if (data.spatial_features !== undefined) {
    if (!Array.isArray(data.spatial_features) || 
        !data.spatial_features.every(isValidSpatialFeature)) {
      return false;
    }
  }

  // Validate lighting_analysis if present
  if (data.lighting_analysis !== undefined) {
    if (!isValidLightingAnalysis(data.lighting_analysis)) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to validate AgentExecutionData objects
 * @param obj - Unknown object to validate
 * @returns True if obj is a valid AgentExecutionData object
 */
export function isAgentExecutionData(obj: unknown): obj is AgentExecutionData {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const data = obj as Record<string, unknown>;

  // Validate material_analysis if present
  if (data.material_analysis !== undefined) {
    if (!isValidMaterialAnalysis(data.material_analysis)) {
      return false;
    }
  }

  // Validate spatial_analysis if present (reuse existing guard)
  if (data.spatial_analysis !== undefined) {
    if (!isSpatialAnalysisData(data.spatial_analysis)) {
      return false;
    }
  }

  // Validate generation_results if present
  if (data.generation_results !== undefined) {
    if (!isValidGenerationResults(data.generation_results)) {
      return false;
    }
  }

  // Validate processing_metrics if present
  if (data.processing_metrics !== undefined) {
    if (!isValidProcessingMetrics(data.processing_metrics)) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to validate core Material objects
 * @param obj - Unknown object to validate
 * @returns True if obj is a valid Material object
 */
export function isMaterial(obj: unknown): obj is Material {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const material = obj as Record<string, unknown>;

  // Check required fields
  if (typeof material.id !== 'string' ||
      typeof material.name !== 'string' ||
      typeof material.createdAt !== 'string' ||
      typeof material.updatedAt !== 'string') {
    return false;
  }

  // Validate properties object
  if (!material.properties || !isValidMaterialProperties(material.properties)) {
    return false;
  }

  // Validate standards array
  if (!Array.isArray(material.standards) ||
      !material.standards.every(standard => typeof standard === 'string')) {
    return false;
  }

  // Validate metadata object
  if (!material.metadata || !isValidMaterialMetadata(material.metadata)) {
    return false;
  }

  return true;
}

// =============================================================================
// PROCESSING AND STATUS TYPE GUARDS
// =============================================================================

/**
 * Type guard for ProcessingStatus enum values
 * @param value - Value to check
 * @returns True if value is a valid ProcessingStatus
 */
export function isProcessingStatus(value: unknown): value is ProcessingStatus {
  return typeof value === 'string' && 
         ['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(value);
}

/**
 * Type guard for DetectionMethod enum values
 * @param value - Value to check
 * @returns True if value is a valid DetectionMethod
 */
export function isDetectionMethod(value: unknown): value is DetectionMethod {
  return typeof value === 'string' && 
         ['visual', 'spectral', 'thermal', 'ocr', 'voice', 'combined'].includes(value);
}

/**
 * Type guard to validate ProcessingJob objects
 * @param obj - Unknown object to validate
 * @returns True if obj is a valid ProcessingJob object
 */
export function isProcessingJob(obj: unknown): obj is ProcessingJob {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const job = obj as Record<string, unknown>;

  return typeof job.id === 'string' &&
         typeof job.userId === 'string' &&
         typeof job.jobType === 'string' &&
         isProcessingStatus(job.status) &&
         typeof job.createdAt === 'string';
}

/**
 * Type guard to validate RecognitionResult objects
 * @param obj - Unknown object to validate
 * @returns True if obj is a valid RecognitionResult object
 */
export function isRecognitionResult(obj: unknown): obj is RecognitionResult {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const result = obj as Record<string, unknown>;

  return typeof result.id === 'string' &&
         typeof result.fileId === 'string' &&
         typeof result.confidenceScore === 'number' &&
         result.confidenceScore >= 0 &&
         result.confidenceScore <= 1;
}

// =============================================================================
// HELPER TYPE GUARDS FOR NESTED STRUCTURES
// =============================================================================

/**
 * Helper type guard for MaterialProperties validation
 */
function isValidMaterialProperties(obj: unknown): obj is MaterialProperties {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const props = obj as Record<string, unknown>;

  // All properties are optional, but if present they must be numbers or objects
  const numericProps = ['density', 'yieldStrength', 'tensileStrength', 'thermalConductivity', 'flexuralModulus', 'meltingPoint', 'glassTransition'];
  
  for (const prop of numericProps) {
    if (props[prop] !== undefined && typeof props[prop] !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Helper type guard for visual characteristics validation
 */
function isValidVisualCharacteristics(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const visual = obj as Record<string, unknown>;

  // Check dominant_colors structure
  if (visual.dominant_colors !== undefined) {
    if (!Array.isArray(visual.dominant_colors)) {
      return false;
    }
    
    for (const color of visual.dominant_colors) {
      if (!color || typeof color !== 'object') {
        return false;
      }
      const colorObj = color as Record<string, unknown>;
      if (typeof colorObj.color !== 'string' || typeof colorObj.percentage !== 'number') {
        return false;
      }
    }
  }

  return true;
}

/**
 * Helper type guard for point cloud validation
 */
function isValidPointCloud(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const pointCloud = obj as Record<string, unknown>;

  // Validate points array
  if (!Array.isArray(pointCloud.points)) {
    return false;
  }

  // Check if each point has valid x, y, z coordinates
  for (const point of pointCloud.points) {
    if (!point || typeof point !== 'object') {
      return false;
    }
    const p = point as Record<string, unknown>;
    if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Helper type guard for mesh data validation
 */
function isValidMeshData(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const meshData = obj as Record<string, unknown>;

  // Validate vertices array
  if (!Array.isArray(meshData.vertices)) {
    return false;
  }

  // Validate faces array
  if (!Array.isArray(meshData.faces)) {
    return false;
  }

  return true;
}

/**
 * Helper type guard for quality metrics validation
 */
function isValidQualityMetrics(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const metrics = obj as Record<string, unknown>;

  return typeof metrics.quality_score === 'number' &&
         typeof metrics.input_image_count === 'number' &&
         typeof metrics.processing_time_ms === 'number' &&
         metrics.quality_score >= 0 && metrics.quality_score <= 1;
}

/**
 * Helper type guard for room geometry validation
 */
function isValidRoomGeometry(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const geometry = obj as Record<string, unknown>;

  // Check required dimensions
  if (!geometry.dimensions || typeof geometry.dimensions !== 'object') {
    return false;
  }

  const dims = geometry.dimensions as Record<string, unknown>;
  if (typeof dims.width !== 'number' || 
      typeof dims.height !== 'number' || 
      typeof dims.depth !== 'number') {
    return false;
  }

  // Check boundary_points array
  if (!Array.isArray(geometry.boundary_points)) {
    return false;
  }

  // Check numeric metrics
  return typeof geometry.area_sq_m === 'number' &&
         typeof geometry.volume_cu_m === 'number';
}

/**
 * Helper type guard for spatial features validation
 */
function isValidSpatialFeature(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const feature = obj as Record<string, unknown>;

  const validTypes = ['wall', 'window', 'door', 'column', 'beam', 'alcove', 'corner', 'opening'];
  
  return typeof feature.type === 'string' &&
         validTypes.includes(feature.type) &&
         typeof feature.position === 'object' &&
         typeof feature.dimensions === 'object' &&
         typeof feature.confidence === 'number' &&
         feature.confidence >= 0 && feature.confidence <= 1;
}

/**
 * Helper type guard for lighting analysis validation
 */
function isValidLightingAnalysis(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const lighting = obj as Record<string, unknown>;

  // Validate natural_light array
  if (!Array.isArray(lighting.natural_light)) {
    return false;
  }

  return true;
}

/**
 * Helper type guard for material analysis validation
 */
function isValidMaterialAnalysis(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const analysis = obj as Record<string, unknown>;

  // Check required fields
  if (!Array.isArray(analysis.identified_materials) ||
      typeof analysis.confidence_score !== 'number' ||
      typeof analysis.summary !== 'string') {
    return false;
  }

  // Validate confidence score range
  if (analysis.confidence_score < 0 || analysis.confidence_score > 1) {
    return false;
  }

  // Validate each identified material
  return analysis.identified_materials.every(isMaterialData);
}

/**
 * Helper type guard for generation results validation
 */
function isValidGenerationResults(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const results = obj as Record<string, unknown>;

  return Array.isArray(results.model_references) &&
         results.model_references.every(ref => typeof ref === 'string') &&
         typeof results.generation_params === 'object' &&
         typeof results.quality_assessment === 'object';
}

/**
 * Helper type guard for processing metrics validation
 */
function isValidProcessingMetrics(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const metrics = obj as Record<string, unknown>;

  return typeof metrics.total_time_ms === 'number' &&
         typeof metrics.error_count === 'number' &&
         metrics.total_time_ms >= 0 &&
         metrics.error_count >= 0;
}

/**
 * Helper type guard for MaterialMetadata validation
 */
function isValidMaterialMetadata(obj: unknown): obj is MaterialMetadata {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const metadata = obj as Record<string, unknown>;

  // All fields are optional, but if present must be strings
  const stringFields = ['color', 'finish', 'size', 'brand', 'installationMethod', 'application'];
  
  for (const field of stringFields) {
    if (metadata[field] !== undefined && typeof metadata[field] !== 'string') {
      return false;
    }
  }

  return true;
}

// =============================================================================
// API RESPONSE TYPE GUARDS
// =============================================================================

/**
 * Generic type guard for API responses with status discrimination
 * @param obj - Unknown response object
 * @returns True if obj has a valid response structure
 */
export function isApiResponse(obj: unknown): obj is { status: string; [key: string]: unknown } {
  return obj !== null && 
         typeof obj === 'object' && 
         'status' in obj && 
         typeof (obj as { status: unknown }).status === 'string';
}

/**
 * Type guard for successful API responses
 * @param obj - Unknown response object
 * @returns True if obj represents a successful API response
 */
export function isSuccessApiResponse<T>(obj: unknown): obj is { status: 'success'; data: T } {
  return isApiResponse(obj) && 
         obj.status === 'success' && 
         'data' in obj;
}

/**
 * Type guard for error API responses
 * @param obj - Unknown response object
 * @returns True if obj represents an error API response
 */
export function isErrorApiResponse(obj: unknown): obj is { status: 'error'; error: string } {
  if (!isApiResponse(obj) || obj.status !== 'error') {
    return false;
  }
  
  return 'error' in obj &&
         typeof (obj as unknown as { error: unknown }).error === 'string';
}

// =============================================================================
// UTILITY TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if an object has specific properties
 * @param obj - Object to check
 * @param properties - Array of property names that must exist
 * @returns True if obj has all specified properties
 */
export function hasProperties<T extends Record<string, unknown>>(
  obj: unknown,
  properties: (keyof T)[]
): obj is T {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const record = obj as Record<string, unknown>;
  return properties.every(prop => prop in record);
}

/**
 * Type guard to check if a value is a non-empty string
 * @param value - Value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if a value is a valid number (not NaN or Infinity)
 * @param value - Value to check
 * @returns True if value is a valid finite number
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && 
         !isNaN(value) && 
         isFinite(value);
}

/**
 * Type guard to check if a value is a valid confidence score (0-1)
 * @param value - Value to check
 * @returns True if value is a number between 0 and 1 inclusive
 */
export function isValidConfidenceScore(value: unknown): value is number {
  return isValidNumber(value) && value >= 0 && value <= 1;
}

// =============================================================================
// ERROR HANDLING TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if an error has a response property
 * @param error - Error object to check
 * @returns True if error has response property with status
 */
export function hasResponseProperty(error: unknown): error is { response: { status: number; statusText?: string; data?: unknown } } {
  return error !== null &&
         typeof error === 'object' &&
         'response' in error &&
         typeof (error as { response: unknown }).response === 'object' &&
         (error as { response: { status: unknown } }).response !== null &&
         'status' in (error as { response: { status: unknown } }).response &&
         typeof (error as { response: { status: unknown } }).response.status === 'number';
}

/**
 * Type guard for validation errors with specific structure
 * @param error - Error object to check
 * @returns True if error represents a validation error
 */
export function isValidationError(error: unknown): error is { message: string; validationType: string; details?: unknown } {
  return error !== null &&
         typeof error === 'object' &&
         'message' in error &&
         'validationType' in error &&
         typeof (error as { message: unknown }).message === 'string' &&
         typeof (error as { validationType: unknown }).validationType === 'string';
}

// =============================================================================
// DISCRIMINATED UNION TYPE GUARDS
// =============================================================================

/**
 * Type guard for discriminated union based on status field
 * @param obj - Object with potential status discriminator
 * @param status - Expected status value
 * @returns True if obj has the specified status
 */
export function hasStatus<T extends string>(obj: unknown, status: T): obj is { status: T; [key: string]: unknown } {
  return isApiResponse(obj) && obj.status === status;
}

/**
 * Type guard for result objects with success/error discrimination
 * @param result - Result object to validate
 * @returns Type predicate for successful results
 */
export function isSuccessResult<T>(result: unknown): result is { success: true; data: T } {
  return result !== null &&
         typeof result === 'object' &&
         'success' in result &&
         (result as { success: unknown }).success === true &&
         'data' in result;
}

/**
 * Type guard for error results
 * @param result - Result object to validate
 * @returns Type predicate for error results
 */
export function isErrorResult(result: unknown): result is { success: false; error: string } {
  return result !== null &&
         typeof result === 'object' &&
         'success' in result &&
         (result as { success: unknown }).success === false &&
         'error' in result &&
         typeof (result as { error: unknown }).error === 'string';
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validates and narrows unknown data to a specific type using a type guard
 * @param data - Unknown data to validate
 * @param guard - Type guard function to use
 * @param errorMessage - Custom error message if validation fails
 * @returns Validated data or throws an error
 * @throws Error if validation fails
 */
export function validateWithGuard<T>(
  data: unknown,
  guard: (obj: unknown) => obj is T,
  errorMessage?: string
): T {
  if (guard(data)) {
    return data;
  }
  
  throw new Error(errorMessage || 'Type validation failed');
}

/**
 * Safely validates data and returns either validated data or null
 * @param data - Unknown data to validate
 * @param guard - Type guard function to use
 * @returns Validated data or null if validation fails
 */
export function safeValidate<T>(
  data: unknown,
  guard: (obj: unknown) => obj is T
): T | null {
  try {
    return validateWithGuard(data, guard);
  } catch {
    return null;
  }
}

/**
 * Creates a validation result object with success/failure information
 * @param data - Unknown data to validate
 * @param guard - Type guard function to use
 * @returns Validation result with success flag and data or error
 */
export function createValidationResult<T>(
  data: unknown,
  guard: (obj: unknown) => obj is T
): { success: true; data: T } | { success: false; error: string } {
  if (guard(data)) {
    return { success: true, data };
  }
  
  return { 
    success: false, 
    error: `Validation failed for type ${guard.name || 'unknown'}` 
  };
}