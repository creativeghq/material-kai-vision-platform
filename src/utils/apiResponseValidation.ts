/**
 * ✅ API Response Validation Utilities
 *
 * Provides runtime validation for API responses to ensure data integrity
 * and catch integration issues early.
 */

import { RecognitionResult } from '@/types/materials';

// ✅ Validation result interface
export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors: string[];
  warnings: string[];
}

// ✅ Material Recognition Response Validator
export const validateMaterialRecognitionResponse = (response: unknown): ValidationResult<RecognitionResult[]> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  if (!(response as any).success) {
    errors.push(`API call failed: ${(response as any).error?.message || 'Unknown error'}`);
    return { isValid: false, errors, warnings };
  }

  if (!(response as any).data) {
    errors.push('Response data is missing');
    return { isValid: false, errors, warnings };
  }

  const data = (response as any).data;

  // Validate materials array
  if (!(data as any).materials || !Array.isArray((data as any).materials)) {
    errors.push('Materials array is missing or invalid');
    return { isValid: false, errors, warnings };
  }

  const validatedMaterials: RecognitionResult[] = [];

  (data as any).materials.forEach((material: any, index: number) => {
    const materialErrors: string[] = [];

    // Required fields validation
    if (!(material as any).id && !(material as any).fileName) {
      materialErrors.push(`Material ${index}: Missing id or fileName`);
    }
    if (typeof (material as any).confidence !== 'number' || (material as any).confidence < 0 || (material as any).confidence > 1) {
      materialErrors.push(`Material ${index}: Invalid confidence value (should be 0-1)`);
    }
    if (!(material as any).materialType || typeof (material as any).materialType !== 'string') {
      materialErrors.push(`Material ${index}: Missing or invalid materialType`);
    }
    if (typeof (material as any).processingTime !== 'number' || (material as any).processingTime < 0) {
      materialErrors.push(`Material ${index}: Invalid processingTime`);
    }

    // Optional fields validation
    if ((material as any).properties && typeof (material as any).properties !== 'object') {
      warnings.push(`Material ${index}: Properties should be an object`);
    }
    if ((material as any).composition && typeof (material as any).composition !== 'object') {
      warnings.push(`Material ${index}: Composition should be an object`);
    }
    if ((material as any).sustainability && typeof (material as any).sustainability !== 'object') {
      warnings.push(`Material ${index}: Sustainability should be an object`);
    }

    if (materialErrors.length === 0) {
      validatedMaterials.push({
        id: (material as any).id || `generated_${Date.now()}_${index}`,
        fileName: (material as any).fileName || 'unknown',
        materialId: (material as any).id || 'unknown',
        confidence: (material as any).confidence,
        materialType: (material as any).materialType,
        properties: (material as any).properties || {},
        composition: (material as any).composition || {},
        sustainability: (material as any).sustainability || {},
        imageUrl: (material as any).imageUrl || '',
        processingTime: (material as any).processingTime,
        matchedMaterial: (material as any).matchedMaterial,
        extractedProperties: (material as any).extractedProperties,
      });
    } else {
      errors.push(...materialErrors);
    }
  });

  return {
    isValid: errors.length === 0,
    data: validatedMaterials,
    errors,
    warnings,
  };
};

// ✅ AI Test Response Validator
export const validateAITestResponse = (response: unknown): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  if (!(response as any).success) {
    errors.push(`AI test failed: ${(response as any).error?.message || 'Unknown error'}`);
    return { isValid: false, errors, warnings };
  }

  if (!(response as any).data) {
    errors.push('Response data is missing');
    return { isValid: false, errors, warnings };
  }

  const data = (response as any).data;

  // Validate required fields
  if (!(data as any).response || typeof (data as any).response !== 'string') {
    errors.push('Missing or invalid response text');
  }

  if (typeof (data as any).processingTime !== 'number' || (data as any).processingTime < 0) {
    warnings.push('Invalid or missing processingTime');
  }

  if (typeof (data as any).confidence !== 'number' || (data as any).confidence < 0 || (data as any).confidence > 1) {
    warnings.push('Invalid confidence value (should be 0-1)');
  }

  // Validate optional arrays
  if ((data as any).recommendations && !Array.isArray((data as any).recommendations)) {
    warnings.push('Recommendations should be an array');
  }

  if ((data as any).materials && !Array.isArray((data as any).materials)) {
    warnings.push('Materials should be an array');
  }

  if ((data as any).entities && !Array.isArray((data as any).entities)) {
    warnings.push('Entities should be an array');
  }

  return {
    isValid: errors.length === 0,
    data: data,
    errors,
    warnings,
  };
};

// ✅ Visual Search Response Validator
export const validateVisualSearchResponse = (response: unknown): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  if (!(response as any).success) {
    errors.push(`Visual search failed: ${(response as any).error?.message || 'Unknown error'}`);
    return { isValid: false, errors, warnings };
  }

  if (!(response as any).data) {
    errors.push('Response data is missing');
    return { isValid: false, errors, warnings };
  }

  const data = (response as any).data;

  // Validate matches array
  const matches = (data as any).matches || (data as any).results || [];
  if (!Array.isArray(matches)) {
    errors.push('Matches/results should be an array');
    return { isValid: false, errors, warnings };
  }

  // Validate search metadata
  if (!(data as any).query_id && !(data as any).search_id) {
    warnings.push('Missing search/query ID');
  }

  // Validate execution time
  const executionTime = (data as any).search_statistics?.search_time_ms || (data as any).search_execution_time_ms;
  if (typeof executionTime !== 'number' || executionTime < 0) {
    warnings.push('Invalid or missing execution time');
  }

  // Validate individual matches
  matches.forEach((match: any, index: number) => {
    if (!(match as any).id && !(match as any).material_id) {
      warnings.push(`Match ${index}: Missing ID`);
    }
    if (!(match as any).name && !(match as any).material_name) {
      warnings.push(`Match ${index}: Missing name`);
    }
    if (typeof (match as any).similarity_score !== 'number' || (match as any).similarity_score < 0 || (match as any).similarity_score > 1) {
      warnings.push(`Match ${index}: Invalid similarity score`);
    }
  });

  return {
    isValid: errors.length === 0,
    data: data,
    errors,
    warnings,
  };
};

// ✅ Generic API Response Validator
export const validateStandardizedApiResponse = (response: unknown): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  // Check for required fields
  if (typeof (response as any).success !== 'boolean') {
    errors.push('Missing or invalid success field');
  }

  if (!(response as any).success && !(response as any).error) {
    errors.push('Failed response missing error information');
  }

  if ((response as any).success && !(response as any).data) {
    warnings.push('Successful response missing data field');
  }

  // Validate metadata if present
  if ((response as any).metadata) {
    if (!(response as any).metadata.timestamp) {
      warnings.push('Missing timestamp in metadata');
    }
    if (!(response as any).metadata.requestId) {
      warnings.push('Missing requestId in metadata');
    }
    if (!(response as any).metadata.apiType) {
      warnings.push('Missing apiType in metadata');
    }
  } else {
    warnings.push('Missing metadata object');
  }

  return {
    isValid: errors.length === 0,
    data: (response as any).data,
    errors,
    warnings,
  };
};

// ✅ Validation utility with logging
export const validateAndLog = <T>(
  response: any,
  validator: (response: unknown) => ValidationResult<T>,
  context: string,
): ValidationResult<T> => {
  const result = validator(response);

  if (!result.isValid) {
    console.error(`❌ ${context} validation failed:`, result.errors);
  }

  if (result.warnings.length > 0) {
    console.warn(`⚠️ ${context} validation warnings:`, result.warnings);
  }

  if (result.isValid) {
    console.log(`✅ ${context} validation passed`);
  }

  return result;
};

// ✅ Export all validators
export const validators = {
  materialRecognition: validateMaterialRecognitionResponse,
  aiTest: validateAITestResponse,
  visualSearch: validateVisualSearchResponse,
  standardized: validateStandardizedApiResponse,
};
