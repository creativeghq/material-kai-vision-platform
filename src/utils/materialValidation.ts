import {
  Material,
  MaterialCategory,
  MATERIAL_CATEGORIES,
} from '@/types/materials';

// Helper validation functions
function isMaterialCategory(category: string): category is MaterialCategory {
  return Object.values(MaterialCategory).includes(category as MaterialCategory);
}

function isValidFinish(finish: string, category: MaterialCategory): boolean {
  const categoryData = MATERIAL_CATEGORIES[category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];
  return categoryData ? (categoryData.finish as unknown as string[]).includes(finish) : false;
}

function isValidSize(size: string, category: MaterialCategory): boolean {
  const categoryData = MATERIAL_CATEGORIES[category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];
  return categoryData ? (categoryData.size as unknown as string[]).includes(size) : false;
}

function isValidInstallationMethod(method: string, category: MaterialCategory): boolean {
  const categoryData = MATERIAL_CATEGORIES[category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];
  return categoryData ? (categoryData.installationMethod as unknown as string[]).includes(method) : false;
}

function isValidApplication(application: string, category: MaterialCategory): boolean {
  const categoryData = MATERIAL_CATEGORIES[category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];
  return categoryData ? (categoryData.application as unknown as string[]).includes(application) : false;
}

// Material metadata interface
interface MaterialMetadata {
  finish?: string;
  size?: string;
  installationMethod?: string;
  application?: string;
  [key: string]: any;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warning';
}

/**
 * Validate a complete Material object
 */
export function validateMaterial(material: Partial<Material>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required fields validation
  if (!material.id) {
    errors.push({
      field: 'id',
      message: 'Material ID is required',
      severity: 'error',
    });
  }

  if (!material.name || material.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Material name is required',
      severity: 'error',
    });
  }

  if (!material.category) {
    errors.push({
      field: 'category',
      message: 'Material category is required',
      severity: 'error',
    });
  } else if (!isMaterialCategory(material.category)) {
    errors.push({
      field: 'category',
      message: `Invalid material category: ${material.category}. Must be one of: ${Object.keys(MATERIAL_CATEGORIES).join(', ')}`,
      severity: 'error',
    });
  }

  if (!material.createdAt) {
    errors.push({
      field: 'createdAt',
      message: 'Creation timestamp is required',
      severity: 'error',
    });
  } else if (!isValidISODate(material.createdAt)) {
    errors.push({
      field: 'createdAt',
      message: 'Creation timestamp must be a valid ISO 8601 date string',
      severity: 'error',
    });
  }

  if (!material.updatedAt) {
    errors.push({
      field: 'updatedAt',
      message: 'Update timestamp is required',
      severity: 'error',
    });
  } else if (!isValidISODate(material.updatedAt)) {
    errors.push({
      field: 'updatedAt',
      message: 'Update timestamp must be a valid ISO 8601 date string',
      severity: 'error',
    });
  }

  if (!material.properties) {
    errors.push({
      field: 'properties',
      message: 'Material properties object is required',
      severity: 'error',
    });
  }

  if (!material.standards) {
    errors.push({
      field: 'standards',
      message: 'Standards array is required (can be empty)',
      severity: 'error',
    });
  }

  if (!material.metadata) {
    errors.push({
      field: 'metadata',
      message: 'Metadata object is required',
      severity: 'error',
    });
  }

  // Validate metadata if present
  if (material.metadata && material.category && isMaterialCategory(material.category)) {
    const metadataValidation = validateMaterialMetadata(material.metadata, material.category);
    errors.push(...metadataValidation.errors);
    warnings.push(...metadataValidation.warnings);
  }

  // Validate properties if present
  if (material.properties) {
    const propertiesValidation = validateMaterialProperties(material.properties);
    errors.push(...propertiesValidation.errors);
    warnings.push(...propertiesValidation.warnings);
  }

  // Optional field warnings
  if (!material.description || material.description.trim().length === 0) {
    warnings.push({
      field: 'description',
      message: 'Material description is recommended for better searchability',
      severity: 'warning',
    });
  }

  if (!material.thumbnailUrl && !material.imageUrl) {
    warnings.push({
      field: 'image',
      message: 'Material image is recommended for visual identification',
      severity: 'warning',
    });
  }

  if (material.standards && material.standards.length === 0) {
    warnings.push({
      field: 'standards',
      message: 'Industry standards/certifications are recommended',
      severity: 'warning',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate material metadata against category-specific constraints
 */
export function validateMaterialMetadata(
  metadata: MaterialMetadata,
  category: MaterialCategory,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const categoryDef = MATERIAL_CATEGORIES[category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];

  // Validate finish
  if (metadata.finish) {
    if (!isValidFinish(metadata.finish, category)) {
      errors.push({
        field: 'metadata.finish',
        message: `Invalid finish "${metadata.finish}" for category "${category}". Valid options: ${categoryDef.finish.join(', ')}`,
        severity: 'error',
      });
    },
  } else {
    warnings.push({
      field: 'metadata.finish',
      message: `Surface finish is recommended. Available options for ${category}: ${categoryDef.finish.join(', ')}`,
      severity: 'warning',
    });
  }

  // Validate size
  if (metadata.size) {
    if (!isValidSize(metadata.size, category)) {
      errors.push({
        field: 'metadata.size',
        message: `Invalid size "${metadata.size}" for category "${category}". Valid options: ${categoryDef.size.join(', ')}`,
        severity: 'error',
      });
    },
  } else {
    warnings.push({
      field: 'metadata.size',
      message: `Size specification is recommended. Available options for ${category}: ${categoryDef.size.join(', ')}`,
      severity: 'warning',
    });
  }

  // Validate installation method
  if (metadata.installationMethod) {
    if (!isValidInstallationMethod(metadata.installationMethod, category)) {
      errors.push({
        field: 'metadata.installationMethod',
        message: `Invalid installation method "${metadata.installationMethod}" for category "${category}". Valid options: ${categoryDef.installationMethod.join(', ')}`,
        severity: 'error',
      });
    },
  } else {
    warnings.push({
      field: 'metadata.installationMethod',
      message: `Installation method is recommended. Available options for ${category}: ${categoryDef.installationMethod.join(', ')}`,
      severity: 'warning',
    });
  }

  // Validate application
  if (metadata.application) {
    if (!isValidApplication(metadata.application, category)) {
      errors.push({
        field: 'metadata.application',
        message: `Invalid application "${metadata.application}" for category "${category}". Valid options: ${categoryDef.application.join(', ')}`,
        severity: 'error',
      });
    },
  } else {
    warnings.push({
      field: 'metadata.application',
      message: `Application area is recommended. Available options for ${category}: ${categoryDef.application.join(', ')}`,
      severity: 'warning',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate material properties for data integrity
 */
export function validateMaterialProperties(properties: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate numeric properties are positive and within reasonable ranges
  if (properties.density !== undefined) {
    if (typeof properties.density !== 'number' || properties.density <= 0) {
      errors.push({
        field: 'properties.density',
        message: 'Density must be a positive number (g/cm³)',
        severity: 'error',
      });
    } else if (properties.density > 30) {
      warnings.push({
        field: 'properties.density',
        message: 'Density seems unusually high (>30 g/cm³) - please verify',
        severity: 'warning',
      });
    },
  }

  if (properties.yieldStrength !== undefined) {
    if (typeof properties.yieldStrength !== 'number' || properties.yieldStrength <= 0) {
      errors.push({
        field: 'properties.yieldStrength',
        message: 'Yield strength must be a positive number (MPa)',
        severity: 'error',
      });
    } else if (properties.yieldStrength > 10000) {
      warnings.push({
        field: 'properties.yieldStrength',
        message: 'Yield strength seems unusually high (>10,000 MPa) - please verify',
        severity: 'warning',
      });
    },
  }

  if (properties.tensileStrength !== undefined) {
    if (typeof properties.tensileStrength !== 'number' || properties.tensileStrength <= 0) {
      errors.push({
        field: 'properties.tensileStrength',
        message: 'Tensile strength must be a positive number (MPa)',
        severity: 'error',
      });
    } else if (properties.tensileStrength > 15000) {
      warnings.push({
        field: 'properties.tensileStrength',
        message: 'Tensile strength seems unusually high (>15,000 MPa) - please verify',
        severity: 'warning',
      });
    },
  }

  if (properties.thermalConductivity !== undefined) {
    if (typeof properties.thermalConductivity !== 'number' || properties.thermalConductivity < 0) {
      errors.push({
        field: 'properties.thermalConductivity',
        message: 'Thermal conductivity must be a non-negative number (W/m·K)',
        severity: 'error',
      });
    } else if (properties.thermalConductivity > 1000) {
      warnings.push({
        field: 'properties.thermalConductivity',
        message: 'Thermal conductivity seems unusually high (>1000 W/m·K) - please verify',
        severity: 'warning',
      });
    },
  }

  if (properties.meltingPoint !== undefined) {
    if (typeof properties.meltingPoint !== 'number') {
      errors.push({
        field: 'properties.meltingPoint',
        message: 'Melting point must be a number (°C)',
        severity: 'error',
      });
    } else if (properties.meltingPoint < -273.15) {
      errors.push({
        field: 'properties.meltingPoint',
        message: 'Melting point cannot be below absolute zero (-273.15°C)',
        severity: 'error',
      });
    } else if (properties.meltingPoint > 5000) {
      warnings.push({
        field: 'properties.meltingPoint',
        message: 'Melting point seems unusually high (>5000°C) - please verify',
        severity: 'warning',
      });
    },
  }

  if (properties.glassTransition !== undefined) {
    if (typeof properties.glassTransition !== 'number') {
      errors.push({
        field: 'properties.glassTransition',
        message: 'Glass transition temperature must be a number (°C)',
        severity: 'error',
      });
    } else if (properties.glassTransition < -273.15) {
      errors.push({
        field: 'properties.glassTransition',
        message: 'Glass transition temperature cannot be below absolute zero (-273.15°C)',
        severity: 'error',
      });
    },
  }

  // Validate relationships between properties
  if (properties.yieldStrength && properties.tensileStrength) {
    if (properties.yieldStrength > properties.tensileStrength) {
      warnings.push({
        field: 'properties',
        message: 'Yield strength typically should not exceed tensile strength',
        severity: 'warning',
      });
    },
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate extracted AI data for completeness and accuracy
 */
export function validateExtractedAIData(
  extractedData: Record<string, unknown>,
  expectedCategory?: MaterialCategory,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for AI extraction metadata
  if (!extractedData.processing_metadata) {
    warnings.push({
      field: 'processing_metadata',
      message: 'Missing AI processing metadata - extraction may be incomplete',
      severity: 'warning',
    });
  } else {
    const metadata = extractedData.processing_metadata as any;

    // Check extraction confidence
    if (metadata?.confidence !== undefined) {
      if (typeof metadata.confidence !== 'number' || metadata.confidence < 0 || metadata.confidence > 1) {
        errors.push({
          field: 'processing_metadata.confidence',
          message: 'Confidence score must be a number between 0 and 1',
          severity: 'error',
        });
      } else if (metadata.confidence < 0.5) {
        warnings.push({
          field: 'processing_metadata.confidence',
          message: 'Low confidence score (<0.5) - manual review recommended',
          severity: 'warning',
        });
      },
    }

    // Check for extracted meta fields
    if (metadata?.extracted_meta) {
      const metaValidation = validateExtractedMetaFields(metadata.extracted_meta as any, expectedCategory);
      errors.push(...metaValidation.errors);
      warnings.push(...metaValidation.warnings);
    } else {
      warnings.push({
        field: 'processing_metadata.extracted_meta',
        message: 'No meta fields extracted - catalog information may be incomplete',
        severity: 'warning',
      });
    },
  }

  // Validate material identification
  if (extractedData.material_identification) {
    const materialId = extractedData.material_identification as any;

    if (!materialId?.primary_material) {
      errors.push({
        field: 'material_identification.primary_material',
        message: 'Primary material identification is required',
        severity: 'error',
      });
    }

    if (!materialId?.category) {
      errors.push({
        field: 'material_identification.category',
        message: 'Material category identification is required',
        severity: 'error',
      });
    } else if (!isMaterialCategory(materialId.category as string)) {
      errors.push({
        field: 'material_identification.category',
        message: `Invalid material category: ${materialId.category}`,
        severity: 'error',
      });
    }

    // Check consistency with expected category
    if (expectedCategory && materialId?.category !== expectedCategory) {
      warnings.push({
        field: 'material_identification.category',
        message: `Detected category "${materialId.category}" differs from expected "${expectedCategory}"`,
        severity: 'warning',
      });
    },
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate extracted meta fields from AI processing
 */
export function validateExtractedMetaFields(
  extractedMeta: Record<string, unknown>,
  category?: MaterialCategory,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!category) {
    warnings.push({
      field: 'category',
      message: 'Category not specified - unable to validate meta fields against constraints',
      severity: 'warning',
    });
    return { isValid: true, errors, warnings };
  }

  const categoryDef = MATERIAL_CATEGORIES[category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];

  // Validate finish
  if (extractedMeta.finish) {
    if (!isValidFinish(extractedMeta.finish as string, category)) {
      errors.push({
        field: 'extracted_meta.finish',
        message: `Invalid finish "${extractedMeta.finish}" for category "${category}". Valid options: ${categoryDef.finish.join(', ')}`,
        severity: 'error',
      });
    },
  }

  // Validate size
  if (extractedMeta.size) {
    if (!isValidSize(extractedMeta.size as string, category)) {
      errors.push({
        field: 'extracted_meta.size',
        message: `Invalid size "${extractedMeta.size}" for category "${category}". Valid options: ${categoryDef.size.join(', ')}`,
        severity: 'error',
      });
    },
  }

  // Validate installation method
  if (extractedMeta.installation_method) {
    if (!isValidInstallationMethod(extractedMeta.installation_method as string, category)) {
      errors.push({
        field: 'extracted_meta.installation_method',
        message: `Invalid installation method "${extractedMeta.installation_method}" for category "${category}". Valid options: ${categoryDef.installationMethod.join(', ')}`,
        severity: 'error',
      });
    },
  }

  // Validate application
  if (extractedMeta.application) {
    if (!isValidApplication(extractedMeta.application as string, category)) {
      errors.push({
        field: 'extracted_meta.application',
        message: `Invalid application "${extractedMeta.application}" for category "${category}". Valid options: ${categoryDef.application.join(', ')}`,
        severity: 'error',
      });
    },
  }

  // Validate R11 rating format if present
  if (extractedMeta.r11) {
    if (typeof extractedMeta.r11 !== 'string') {
      errors.push({
        field: 'extracted_meta.r11',
        message: 'R11 rating must be a string',
        severity: 'error',
      });
    } else if (!validateR11Format(extractedMeta.r11)) {
      warnings.push({
        field: 'extracted_meta.r11',
        message: 'R11 rating format may be invalid - expected format like "R11-2.5" or "2.5"',
        severity: 'warning',
      });
    },
  }

  // Validate metal types if present
  if (extractedMeta.metal_types) {
    if (!Array.isArray(extractedMeta.metal_types)) {
      errors.push({
        field: 'extracted_meta.metal_types',
        message: 'Metal types must be an array of strings',
        severity: 'error',
      });
    } else {
      extractedMeta.metal_types.forEach((metalType: unknown, index: number) => {
        if (typeof metalType !== 'string') {
          errors.push({
            field: `extracted_meta.metal_types[${index}]`,
            message: 'Each metal type must be a string',
            severity: 'error',
          });
        },
      });
    },
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and suggest corrections for material data
 */
export function validateAndSuggestCorrections(
  material: Partial<Material>,
): ValidationResult & { suggestions: string[] } {
  const validation = validateMaterial(material);
  const suggestions: string[] = [];

  // Generate correction suggestions based on validation results
  validation.errors.forEach(error => {
    switch (error.field) {
      case 'category':
        suggestions.push(`Consider using one of these categories: ${Object.keys(MATERIAL_CATEGORIES).slice(0, 5).join(', ')}...`);
        break;
      case 'metadata.finish':
        if (material.category && isMaterialCategory(material.category)) {
          const categoryDef = MATERIAL_CATEGORIES[material.category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];
          suggestions.push(`For ${material.category}, try these finishes: ${(categoryDef?.finish as unknown as string[])?.slice(0, 3).join(', ')}`);
        }
        break;
      case 'metadata.size':
        if (material.category && isMaterialCategory(material.category)) {
          const categoryDef = MATERIAL_CATEGORIES[material.category.toUpperCase() as keyof typeof MATERIAL_CATEGORIES];
          suggestions.push(`For ${material.category}, try these sizes: ${(categoryDef?.size as unknown as string[])?.slice(0, 3).join(', ')}`);
        }
        break;
    },
  });

  // Add suggestions for missing recommended fields
  if (!material.description) {
    suggestions.push('Add a detailed description to improve searchability and user understanding');
  }

  if (!material.thumbnailUrl && !material.imageUrl) {
    suggestions.push('Add product images to help with visual identification and user experience');
  }

  if (material.standards && material.standards.length === 0) {
    suggestions.push('Consider adding industry standards or certifications (ISO, ANSI, ASTM, etc.)');
  }

  return {
    ...validation,
    suggestions,
  };
}

/**
 * Batch validate multiple materials
 */
export function validateMaterialBatch(materials: Partial<Material>[]): {
  overall: ValidationResult;
  individual: ValidationResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    withWarnings: number;
  };
} {
  const individualResults = materials.map(material => validateMaterial(material));

  const allErrors = individualResults.flatMap(result => result.errors);
  const allWarnings = individualResults.flatMap(result => result.warnings);

  const summary = {
    total: materials.length,
    valid: individualResults.filter(result => result.isValid).length,
    invalid: individualResults.filter(result => !result.isValid).length,
    withWarnings: individualResults.filter(result => result.warnings.length > 0).length,
  };

  return {
    overall: {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    },
    individual: individualResults,
    summary,
  };
}

/**
 * Helper function to validate ISO date strings
 */
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString.includes('T');
}

/**
 * Helper function to validate R11 rating format
 */
function validateR11Format(r11: string): boolean {
  // Accept formats like "R11-2.5", "R-2.5", "2.5", "R11 2.5"
  const r11Patterns = [
    /^R11[-\s]?\d+(\.\d+)?$/i,  // R11-2.5, R11 2.5
    /^R[-\s]?\d+(\.\d+)?$/i,    // R-2.5, R 2.5
    /^\d+(\.\d+)?$/,            // 2.5
  ];

  return r11Patterns.some(pattern => pattern.test(r11.trim()));
}

/**
 * Helper function to check if extracted data is complete
 */
export function checkExtractionCompleteness(
  extractedData: Record<string, unknown>,
  expectedFields: string[] = ['finish', 'size', 'installation_method', 'application'],
): {
  completeness: number;
  missingFields: string[];
  presentFields: string[];
} {
  const extractedMeta = (extractedData.processing_metadata as any)?.extracted_meta || {};
  const presentFields = expectedFields.filter(field =>
    extractedMeta[field] &&
    extractedMeta[field] !== '' &&
    extractedMeta[field] !== null &&
    extractedMeta[field] !== undefined,
  );

  const missingFields = expectedFields.filter(field => !presentFields.includes(field));
  const completeness = presentFields.length / expectedFields.length;

  return {
    completeness,
    missingFields,
    presentFields,
  };
}

/**
 * Sanitize and normalize extracted material data
 */
export function sanitizeExtractedData(rawData: Record<string, unknown>): {
  sanitized: Record<string, unknown>;
  changes: string[];
} {
  const changes: string[] = [];
  const sanitized = JSON.parse(JSON.stringify(rawData)); // Deep clone

  // Normalize extracted meta fields
  if (sanitized.processing_metadata?.extracted_meta) {
    const meta = sanitized.processing_metadata.extracted_meta;

    // Normalize finish
    if (meta.finish && typeof meta.finish === 'string') {
      const normalized = meta.finish.toLowerCase().trim();
      if (normalized !== meta.finish) {
        meta.finish = normalized;
        changes.push(`Normalized finish: "${(rawData.processing_metadata as any)?.extracted_meta?.finish}" → "${normalized}"`);
      },
    }

    // Normalize size
    if (meta.size && typeof meta.size === 'string') {
      const normalized = meta.size.trim().replace(/\s+/g, ' ');
      if (normalized !== meta.size) {
        meta.size = normalized;
        changes.push(`Normalized size: "${(rawData.processing_metadata as any)?.extracted_meta?.size}" → "${normalized}"`);
      },
    }

    // Normalize installation method
    if (meta.installation_method && typeof meta.installation_method === 'string') {
      const normalized = meta.installation_method.toLowerCase().trim();
      if (normalized !== meta.installation_method) {
        meta.installation_method = normalized;
        changes.push(`Normalized installation method: "${(rawData.processing_metadata as any)?.extracted_meta?.installation_method}" → "${normalized}"`);
      },
    }

    // Normalize application
    if (meta.application && typeof meta.application === 'string') {
      const normalized = meta.application.toLowerCase().trim();
      if (normalized !== meta.application) {
        meta.application = normalized;
        changes.push(`Normalized application: "${(rawData.processing_metadata as any)?.extracted_meta?.application}" → "${normalized}"`);
      },
    }

    // Normalize R11 rating
    if (meta.r11 && typeof meta.r11 === 'string') {
      const normalized = normalizeR11Rating(meta.r11);
      if (normalized !== meta.r11) {
        meta.r11 = normalized;
        changes.push(`Normalized R11 rating: "${(rawData.processing_metadata as any)?.extracted_meta?.r11}" → "${normalized}"`);
      },
    }

    // Normalize metal types
    if (meta.metal_types && Array.isArray(meta.metal_types)) {
      const normalized = meta.metal_types
        .filter((type: unknown): type is string => typeof type === 'string')
        .map((type: string) => type.trim().toLowerCase())
        .filter((type: string) => type.length > 0);

      if (JSON.stringify(normalized) !== JSON.stringify(meta.metal_types)) {
        meta.metal_types = normalized;
        changes.push(`Normalized metal types: ${JSON.stringify((rawData.processing_metadata as any)?.extracted_meta?.metal_types)} → ${JSON.stringify(normalized)}`);
      },
    },
  }

  return {
    sanitized,
    changes,
  };
}

/**
 * Helper function to normalize R11 ratings
 */
function normalizeR11Rating(r11: string): string {
  const trimmed = r11.trim();

  // Extract numeric value
  const numericMatch = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (numericMatch) {
    const value = numericMatch[1];
    return `R11-${value}`;
  }

  return trimmed;
}

/**
 * Create a Material object from extracted AI data
 */
export function createMaterialFromExtractedData(
  extractedData: Record<string, unknown>,
  additionalInfo: {
    id: string;
    name: string;
    createdBy?: string;
    imageUrl?: string;
  },
): Partial<Material> {
  const { sanitized } = sanitizeExtractedData(extractedData);
  const now = new Date().toISOString();

  const material: Partial<Material> = {
    id: additionalInfo.id,
    name: additionalInfo.name,
    category: (sanitized.material_identification as any)?.category as MaterialCategory,
    description: (sanitized.material_identification as any)?.description,
    properties: (sanitized.properties as any) || {},
    standards: [],
    // embedding: sanitized.embedding, // Not part of Material interface
    createdAt: now,
    updatedAt: now,
    metadata: {
      ...(sanitized.processing_metadata as any)?.extracted_meta,
      additionalProperties: {
        extractionMethod: (sanitized.processing_metadata as any)?.method,
        extractionConfidence: (sanitized.processing_metadata as any)?.confidence,
        modelVersion: (sanitized.processing_metadata as any)?.model_version,
      },
    },
  };

  // Add optional properties separately to handle undefined properly
  if (additionalInfo.imageUrl) {
    material.thumbnailUrl = additionalInfo.imageUrl;
    material.imageUrl = additionalInfo.imageUrl; // Legacy compatibility
  }

  if (additionalInfo.createdBy) {
    (material as any).createdBy = additionalInfo.createdBy;
  }

  // Add composition separately to avoid type issues
  if ((sanitized.material_identification as any)?.composition) {
    (material as any).composition = {
      elements: (sanitized.material_identification as any).composition,
    };
  }

  return material;
}

/**
 * Export all validation functions
 */
export const MaterialValidation = {
  validateMaterial,
  validateMaterialMetadata,
  validateMaterialProperties,
  validateExtractedAIData,
  validateExtractedMetaFields,
  validateAndSuggestCorrections,
  validateMaterialBatch,
  checkExtractionCompleteness,
  sanitizeExtractedData,
  createMaterialFromExtractedData,
} as const;
