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
export const validateMaterialRecognitionResponse = (response: any): ValidationResult<RecognitionResult[]> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  if (!response.success) {
    errors.push(`API call failed: ${response.error?.message || 'Unknown error'}`);
    return { isValid: false, errors, warnings };
  }

  if (!response.data) {
    errors.push('Response data is missing');
    return { isValid: false, errors, warnings };
  }

  const data = response.data;

  // Validate materials array
  if (!data.materials || !Array.isArray(data.materials)) {
    errors.push('Materials array is missing or invalid');
    return { isValid: false, errors, warnings };
  }

  const validatedMaterials: RecognitionResult[] = [];

  data.materials.forEach((material: any, index: number) => {
    const materialErrors: string[] = [];

    // Required fields validation
    if (!material.id && !material.fileName) {
      materialErrors.push(`Material ${index}: Missing id or fileName`);
    }
    if (typeof material.confidence !== 'number' || material.confidence < 0 || material.confidence > 1) {
      materialErrors.push(`Material ${index}: Invalid confidence value (should be 0-1)`);
    }
    if (!material.materialType || typeof material.materialType !== 'string') {
      materialErrors.push(`Material ${index}: Missing or invalid materialType`);
    }
    if (typeof material.processingTime !== 'number' || material.processingTime < 0) {
      materialErrors.push(`Material ${index}: Invalid processingTime`);
    }

    // Optional fields validation
    if (material.properties && typeof material.properties !== 'object') {
      warnings.push(`Material ${index}: Properties should be an object`);
    }
    if (material.composition && typeof material.composition !== 'object') {
      warnings.push(`Material ${index}: Composition should be an object`);
    }
    if (material.sustainability && typeof material.sustainability !== 'object') {
      warnings.push(`Material ${index}: Sustainability should be an object`);
    }

    if (materialErrors.length === 0) {
      validatedMaterials.push({
        id: material.id || `generated_${Date.now()}_${index}`,
        fileName: material.fileName || 'unknown',
        materialId: material.id || 'unknown',
        confidence: material.confidence,
        materialType: material.materialType,
        properties: material.properties || {},
        composition: material.composition || {},
        sustainability: material.sustainability || {},
        imageUrl: material.imageUrl || '',
        processingTime: material.processingTime,
        matchedMaterial: material.matchedMaterial,
        extractedProperties: material.extractedProperties,
      });
    } else {
      errors.push(...materialErrors);
    }
  });

  return {
    isValid: errors.length === 0,
    data: validatedMaterials,
    errors,
    warnings
  };
};

// ✅ AI Test Response Validator
export const validateAITestResponse = (response: any): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  if (!response.success) {
    errors.push(`AI test failed: ${response.error?.message || 'Unknown error'}`);
    return { isValid: false, errors, warnings };
  }

  if (!response.data) {
    errors.push('Response data is missing');
    return { isValid: false, errors, warnings };
  }

  const data = response.data;

  // Validate required fields
  if (!data.response || typeof data.response !== 'string') {
    errors.push('Missing or invalid response text');
  }

  if (typeof data.processingTime !== 'number' || data.processingTime < 0) {
    warnings.push('Invalid or missing processingTime');
  }

  if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
    warnings.push('Invalid confidence value (should be 0-1)');
  }

  // Validate optional arrays
  if (data.recommendations && !Array.isArray(data.recommendations)) {
    warnings.push('Recommendations should be an array');
  }

  if (data.materials && !Array.isArray(data.materials)) {
    warnings.push('Materials should be an array');
  }

  if (data.entities && !Array.isArray(data.entities)) {
    warnings.push('Entities should be an array');
  }

  return {
    isValid: errors.length === 0,
    data: data,
    errors,
    warnings
  };
};

// ✅ Visual Search Response Validator
export const validateVisualSearchResponse = (response: any): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  if (!response.success) {
    errors.push(`Visual search failed: ${response.error?.message || 'Unknown error'}`);
    return { isValid: false, errors, warnings };
  }

  if (!response.data) {
    errors.push('Response data is missing');
    return { isValid: false, errors, warnings };
  }

  const data = response.data;

  // Validate matches array
  const matches = data.matches || data.results || [];
  if (!Array.isArray(matches)) {
    errors.push('Matches/results should be an array');
    return { isValid: false, errors, warnings };
  }

  // Validate search metadata
  if (!data.query_id && !data.search_id) {
    warnings.push('Missing search/query ID');
  }

  // Validate execution time
  const executionTime = data.search_statistics?.search_time_ms || data.search_execution_time_ms;
  if (typeof executionTime !== 'number' || executionTime < 0) {
    warnings.push('Invalid or missing execution time');
  }

  // Validate individual matches
  matches.forEach((match: any, index: number) => {
    if (!match.id && !match.material_id) {
      warnings.push(`Match ${index}: Missing ID`);
    }
    if (!match.name && !match.material_name) {
      warnings.push(`Match ${index}: Missing name`);
    }
    if (typeof match.similarity_score !== 'number' || match.similarity_score < 0 || match.similarity_score > 1) {
      warnings.push(`Match ${index}: Invalid similarity score`);
    }
  });

  return {
    isValid: errors.length === 0,
    data: data,
    errors,
    warnings
  };
};

// ✅ Generic API Response Validator
export const validateStandardizedApiResponse = (response: any): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, warnings };
  }

  // Check for required fields
  if (typeof response.success !== 'boolean') {
    errors.push('Missing or invalid success field');
  }

  if (!response.success && !response.error) {
    errors.push('Failed response missing error information');
  }

  if (response.success && !response.data) {
    warnings.push('Successful response missing data field');
  }

  // Validate metadata if present
  if (response.metadata) {
    if (!response.metadata.timestamp) {
      warnings.push('Missing timestamp in metadata');
    }
    if (!response.metadata.requestId) {
      warnings.push('Missing requestId in metadata');
    }
    if (!response.metadata.apiType) {
      warnings.push('Missing apiType in metadata');
    }
  } else {
    warnings.push('Missing metadata object');
  }

  return {
    isValid: errors.length === 0,
    data: response.data,
    errors,
    warnings
  };
};

// ✅ Validation utility with logging
export const validateAndLog = <T>(
  response: any,
  validator: (response: any) => ValidationResult<T>,
  context: string
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
