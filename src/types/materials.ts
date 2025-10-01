/**
 * Core Material interface representing a material in the Material-KAI Vision Platform
 *
 * @interface Material
 * @description Defines the complete structure of a material entity with all its properties,
 * metadata, and relationships. This is the central data structure for material management.
 *
 * @example
 * ```typescript
 * const woodMaterial: Material = {
 *   id: "wood-oak-001",
 *   name: "Premium Oak Wood",
 *   description: "High-quality oak wood for premium applications",
 *   category: MaterialCategory.WOOD,
 *   properties: {
 *     density: 750,
 *     thermalConductivity: 0.16
 *   },
 *   metadata: {
 *     finish: "natural",
 *     application: "interior"
 *   },
 *   standards: ["ISO 13061", "ASTM D143"],
 *   createdAt: "2024-01-01T00:00:00Z",
 *   updatedAt: "2024-01-01T00:00:00Z"
 * };
 * ```
 */
export interface Material {
  /** Unique identifier for the material */
  id: string;
  /** Display name of the material */
  name: string;
  /** Detailed description of the material */
  description: string;
  /** Material category (wood, metal, plastic, etc.) */
  category: string;
  /** Physical and mechanical properties of the material */
  properties: MaterialProperties;
  /** Additional metadata for customization and configuration */
  metadata: {
    /** Surface finish type (matte, glossy, etc.) */
    finish?: string;
    /** Size classification (small, medium, large, custom) */
    size?: string;
    /** Installation method (adhesive, mechanical, etc.) */
    installationMethod?: string;
    /** Application area (interior, exterior, industrial) */
    application?: string;
    /** Additional custom properties */
    [key: string]: unknown;
  };
  /** Industry standards and certifications */
  standards: string[];
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** Optional thumbnail image URL */
  thumbnailUrl?: string;
  /** Optional primary image URL */
  imageUrl?: string;
  /** Custom metadata field values */
  metafieldValues?: MetafieldValue[];
  /** Associated image gallery */
  images?: MaterialImage[];
  /** Related materials and alternatives */
  relationships?: MaterialRelationship[];
}

export interface MaterialProperties {
  density?: number;
  thermalConductivity?: number;
  yieldStrength?: number;
  tensileStrength?: number;
  [key: string]: unknown;
}

export interface MaterialRelationship {
  id: string;
  type: 'compatible' | 'alternative' | 'component' | 'similar';
  targetMaterialId: string;
  description?: string;
}

export interface MetafieldValue {
  id: string;
  key: string;
  value: string;
  type: 'text' | 'number' | 'boolean' | 'url' | 'date';
}

export interface MaterialImage {
  id: string;
  url: string;
  alt?: string;
  caption?: string;
  isPrimary?: boolean;
}

export enum MaterialCategory {
  WOOD = 'wood',
  METAL = 'metal',
  PLASTIC = 'plastic',
  CERAMIC = 'ceramic',
  GLASS = 'glass',
  FABRIC = 'fabric',
  STONE = 'stone',
  COMPOSITE = 'composite'
}

// Import dynamic material categories service and types
import {
  MaterialCategory as DynamicMaterialCategory,
  MaterialProperty as DynamicMaterialProperty,
  LegacyMaterialCategories,
  getMaterialCategories,
  getMaterialProperties,
  dynamicMaterialCategoriesService
} from '../services/dynamicMaterialCategoriesService';

// Re-export types for convenience
export type { DynamicMaterialCategory, DynamicMaterialProperty, LegacyMaterialCategories };

// Export the dynamic service instance
export { dynamicMaterialCategoriesService };

// Type for material category with metadata (legacy format)
export type MaterialCategoryData = {
  name: string;
  finish: string[];
  size: string[];
  installationMethod: string[];
  application: string[];
};

// Legacy compatibility type
export type LegacyCategoryData = {
  name: string;
  description: string;
};

// Dynamic functions that fetch from database instead of hardcoded values
export async function getMaterialCategoriesAsync(): Promise<DynamicMaterialCategory[]> {
  return await getMaterialCategories();
}

export async function getAllMaterialFinishes(): Promise<string[]> {
  const properties = await getMaterialProperties();
  const finishProperty = properties.find(prop => prop.key === 'finish');
  return finishProperty?.validationRules?.examples || ['matte', 'glossy', 'satin', 'textured', 'smooth', 'brushed', 'polished'];
}

export async function getAllMaterialSizes(): Promise<string[]> {
  const properties = await getMaterialProperties();
  const sizeProperty = properties.find(prop => prop.key === 'size');
  return sizeProperty?.validationRules?.examples || ['small', 'medium', 'large', 'custom', 'standard', 'oversized'];
}

export async function getAllMaterialInstallationMethods(): Promise<string[]> {
  const properties = await getMaterialProperties();
  const installProperty = properties.find(prop => prop.key === 'installation_method');
  return installProperty?.validationRules?.examples || ['adhesive', 'mechanical', 'welded', 'screwed', 'nailed', 'clipped', 'interlocking'];
}

export async function getAllMaterialApplications(): Promise<string[]> {
  const properties = await getMaterialProperties();
  const appProperty = properties.find(prop => prop.key === 'application');
  return appProperty?.validationRules?.examples || ['interior', 'exterior', 'industrial', 'decorative', 'structural', 'functional'];
}

// User preferences for material selection
export interface UserPreferences {
  preferredMaterials: string[];
  budgetRange?: {
    min: number;
    max: number;
  };
  stylePreferences: string[];
  sustainabilityFocus: boolean;
  performanceRequirements: {
    durability?: number;
    maintenance?: 'low' | 'medium' | 'high';
    climateResistance?: boolean;
  };
}

export interface NeRFData {
  reconstruction_id: string;
  vertices: number[];
  faces: number[];
  textures: Record<string, unknown>;
}

export interface MaterialData {
  material_id: string;
  svbrdf_params: Record<string, number>;
  base_color: number[];
  roughness: number;
  metallic: number;
  normal: number[];
}
// Spatial feature interface
export interface SpatialFeature {
  id: string;
  type: 'point' | 'line' | 'surface' | 'volume';
  coordinates: number[];
  properties: Record<string, unknown>;
  confidence: number;
}


export interface SpatialAnalysisData {
  room_type: string;
  dimensions: { width: number; height: number; depth: number };
  features: SpatialFeature[];
}

export interface AgentExecutionData {
  agent_id: string;
  output: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

export interface AgentExecutionMetadata {
  execution_time: number;
  resources_used: Record<string, number>;
  agent_version: string;
}

export interface MaterialAgentTaskRequest {
  taskType: 'analysis' | 'recognition' | 'processing';
  inputData: {
    imageUrl?: string;
    textQuery?: string;
    materialType: string;
    properties: Record<string, unknown>;
  };
  options?: {
    confidenceThreshold?: number;
    maxResults?: number;
  };
}

export enum ProcessingJobStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed'
}

// File upload and processing types - Critical for Material Recognition API
export interface UploadedFile {
  id: string;
  user_id: string;
  file_name: string;
  file_type: 'image' | 'document' | '3d_model';
  file_size: number;
  storage_path: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  [key: string]: unknown;
}

export interface RecognitionRequest {
  files: File[];
  options: {
    detection_methods?: string[];
    confidence_threshold?: number;
    include_similar_materials?: boolean;
    extract_properties?: boolean;
  };
}

export interface ProcessingJob {
  id: string;
  user_id: string;
  job_type: 'recognition' | '3d_reconstruction' | 'batch_analysis';
  input_data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RecognitionResult {
  materialId: string;
  confidence: number;
  matchedMaterial: Material;
  extractedProperties: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export type OptionalKeys<T, K extends keyof T> = {
  [P in K]?: T[P];
};

// Generic constraints for repository interfaces
export interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findAll(filters?: Partial<T>): Promise<T[]>;
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

// Mapped types for API transformations
export type MaterialCreateRequest = Omit<Material, 'id' | 'createdAt' | 'updatedAt'>;
export type MaterialUpdateRequest = Partial<Omit<Material, 'id' | 'createdAt' | 'updatedAt'>>;

// Conditional types for better type inference
export type InferArrayElement<T> = T extends (infer U)[] ? U : never;
export type InferPromiseType<T> = T extends Promise<infer U> ? U : T;

// Advanced utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type Flatten<T> = T extends unknown[] ? T[number] : T;

// Database operation result types
export type QueryResult<T> = {
  data: T[];
  count: number;
  error: string | null;
  page?: number;
  limit?: number;
  hasMore?: boolean;
};

// Search and filter types with generics
export type SearchFilters<T> = {
  [K in keyof T]?: T[K] extends string ? string | string[] 
    : T[K] extends number ? { min?: number; max?: number } | number
    : T[K] extends boolean ? boolean
    : unknown;
};

export type SortOptions<T> = {
  field: keyof T;
  direction: 'asc' | 'desc';
};

// Pagination with generic support
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Functional metadata interface for material properties
export interface FunctionalMetadata {
  slipSafetyRatings?: Record<string, unknown>;
  surfaceGlossReflectivity?: Record<string, unknown>;
  mechanicalPropertiesExtended?: Record<string, unknown>;
  thermalProperties?: Record<string, unknown>;
  waterMoistureResistance?: Record<string, unknown>;
  chemicalHygieneResistance?: Record<string, unknown>;
  acousticElectricalProperties?: Record<string, unknown>;
  environmentalSustainability?: Record<string, unknown>;
  dimensionalAesthetic?: Record<string, unknown>;
  functionalMetadataSource?: string;
  functionalMetadataUpdatedAt?: string;
}
