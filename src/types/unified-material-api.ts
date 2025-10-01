/**
 * Unified Material API Type Definitions
 * 
 * This module provides comprehensive TypeScript type definitions for the unified material API,
 * building upon the excellent foundation in materials.ts to add API-specific types for
 * Edge Functions, request/response patterns, and validation schemas.
 */

import type {
  Material,
  MaterialCategory,
  MaterialProperties,
  FunctionalMetadata,
  RecognitionResult as _RecognitionResult,
  MaterialData as _MaterialData,
  UploadedFile as _UploadedFile,
} from './materials';

// =============================================================================
// API Request/Response Base Types
// =============================================================================

/**
 * Standard API response wrapper for all material API endpoints
 */
export interface MaterialApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data payload */
  data?: T;
  /** Error message if request failed */
  error?: string;
  /** Additional error details for debugging */
  errorDetails?: Record<string, unknown>;
  /** Request processing time in milliseconds */
  processingTime?: number;
  /** API version used */
  version?: string;
  /** Request timestamp */
  timestamp: string;
}

/**
 * Paginated response wrapper for list endpoints
 */
export interface PaginatedResponse<T> {
  /** Array of items for current page */
  items: T[];
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there are more pages available */
  hasNextPage: boolean;
  /** Whether there are previous pages available */
  hasPreviousPage: boolean;
}

/**
 * Standard pagination parameters for list requests
 */
export interface PaginationParams {
  /** Page number to retrieve (1-based, default: 1) */
  page?: number;
  /** Number of items per page (default: 20, max: 100) */
  pageSize?: number;
  /** Field to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Common filter parameters for material searches
 */
export interface MaterialFilterParams {
  /** Filter by material categories */
  categories?: MaterialCategory[];
  /** Search query string for name/description */
  search?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by creation date range */
  createdAfter?: string;
  /** Filter by creation date range */
  createdBefore?: string;
  /** Filter by creator user ID */
  createdBy?: string;
}

// =============================================================================
// Material CRUD API Types
// =============================================================================

/**
 * Request payload for creating a new material
 */
export interface CreateMaterialRequest {
  /** Material name */
  name: string;
  /** Material category */
  category: MaterialCategory;
  /** Optional description */
  description?: string;
  /** Physical and mechanical properties */
  properties: MaterialProperties;
  /** Comprehensive functional metadata */
  functionalMetadata?: FunctionalMetadata;
  /** Industry standards and certifications */
  standards?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Request payload for updating an existing material
 */
export interface UpdateMaterialRequest {
  /** Material ID to update */
  id: string;
  /** Updated material data (partial) */
  updates: Partial<Omit<CreateMaterialRequest, 'category'>>;
}

/**
 * Response payload for material operations
 */
export type MaterialResponse = MaterialApiResponse<Material>;

/**
 * Response payload for material list operations
 */
export type MaterialListResponse = MaterialApiResponse<PaginatedResponse<Material>>;

/**
 * Request parameters for material search
 */
export interface MaterialSearchRequest extends PaginationParams, MaterialFilterParams {
  /** Include functional metadata in response */
  includeFunctionalMetadata?: boolean;
  /** Include similar materials in response */
  includeSimilarMaterials?: boolean;
  /** Minimum confidence threshold for similarity */
  similarityThreshold?: number;
}

// =============================================================================
// Material Metafields API Types
// =============================================================================

/**
 * Definition of a dynamic metafield for materials
 */
export interface MaterialMetafieldDefinition {
  /** Unique identifier for the metafield */
  id: string;
  /** Human-readable name */
  name: string;
  /** Metafield description */
  description?: string;
  /** Material categories this metafield applies to */
  applicableCategories: MaterialCategory[];
  /** Data type for the metafield value */
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'select' | 'multiselect' | 'json';
  /** Whether this metafield is required */
  required: boolean;
  /** Default value for the metafield */
  defaultValue?: unknown;
  /** Validation configuration */
  validation?: {
    /** Minimum value (for numbers) */
    min?: number;
    /** Maximum value (for numbers) */
    max?: number;
    /** Minimum length (for strings) */
    minLength?: number;
    /** Maximum length (for strings) */
    maxLength?: number;
    /** Regular expression pattern (for strings) */
    pattern?: string;
    /** Available options (for select/multiselect) */
    options?: Array<{ value: string; label: string }>;
  };
  /** Display configuration */
  display?: {
    /** Display order in forms */
    order?: number;
    /** Group/section for organization */
    group?: string;
    /** Help text for users */
    helpText?: string;
    /** Placeholder text */
    placeholder?: string;
  };
  /** Creation metadata */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Creator user ID */
  createdBy: string;
}

/**
 * Value for a material metafield
 */
export interface MaterialMetafieldValue {
  /** Unique identifier */
  id: string;
  /** Material ID this value belongs to */
  materialId: string;
  /** Metafield definition ID */
  metafieldId: string;
  /** The actual value */
  value: unknown;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Request to create a metafield definition
 */
export interface CreateMetafieldDefinitionRequest {
  /** Human-readable name */
  name: string;
  /** Metafield description */
  description?: string;
  /** Material categories this metafield applies to */
  applicableCategories: MaterialCategory[];
  /** Data type for the metafield value */
  dataType: MaterialMetafieldDefinition['dataType'];
  /** Whether this metafield is required */
  required: boolean;
  /** Default value for the metafield */
  defaultValue?: unknown;
  /** Validation configuration */
  validation?: MaterialMetafieldDefinition['validation'];
  /** Display configuration */
  display?: MaterialMetafieldDefinition['display'];
}

/**
 * Request to set metafield values for a material
 */
export interface SetMaterialMetafieldsRequest {
  /** Material ID */
  materialId: string;
  /** Metafield values to set */
  metafields: Array<{
    /** Metafield definition ID */
    metafieldId: string;
    /** Value to set */
    value: unknown;
  }>;
}

/**
 * Response for metafield operations
 */
export type MetafieldResponse = MaterialApiResponse<MaterialMetafieldDefinition>;

/**
 * Response for metafield list operations
 */
export type MetafieldListResponse = MaterialApiResponse<PaginatedResponse<MaterialMetafieldDefinition>>;

// =============================================================================
// Material Images API Types
// =============================================================================

/**
 * Material image association record
 */
export interface MaterialImage {
  /** Unique identifier */
  id: string;
  /** Material ID this image belongs to */
  materialId: string;
  /** Original uploaded file reference */
  fileId: string;
  /** Image title/caption */
  title?: string;
  /** Image description */
  description?: string;
  /** Image type/purpose */
  type: 'primary' | 'texture' | 'sample' | 'installation' | 'application' | 'detail' | 'other';
  /** Display order for multiple images */
  displayOrder: number;
  /** Storage URLs for different sizes */
  urls: {
    /** Original full-size image */
    original: string;
    /** Large thumbnail (800px max) */
    large?: string;
    /** Medium thumbnail (400px max) */
    medium?: string;
    /** Small thumbnail (200px max) */
    small?: string;
  };
  /** Image metadata */
  metadata: {
    /** Original filename */
    filename: string;
    /** File size in bytes */
    fileSize: number;
    /** MIME type */
    mimeType: string;
    /** Image dimensions */
    dimensions: {
      width: number;
      height: number;
    };
    /** Color profile information */
    colorProfile?: string;
    /** EXIF data if available */
    exif?: Record<string, unknown>;
  };
  /** Whether this is the primary image for the material */
  isPrimary: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Creator user ID */
  createdBy: string;
}

/**
 * Request to upload and associate an image with a material
 */
export interface UploadMaterialImageRequest {
  /** Material ID to associate image with */
  materialId: string;
  /** Image file (base64 or file upload) */
  file: File | string;
  /** Image title/caption */
  title?: string;
  /** Image description */
  description?: string;
  /** Image type/purpose */
  type: MaterialImage['type'];
  /** Whether this should be the primary image */
  isPrimary?: boolean;
  /** Generate thumbnail variants */
  generateThumbnails?: boolean;
}

/**
 * Request to update image metadata
 */
export interface UpdateMaterialImageRequest {
  /** Image ID to update */
  id: string;
  /** Updates to apply */
  updates: {
    /** Image title/caption */
    title?: string;
    /** Image description */
    description?: string;
    /** Image type/purpose */
    type?: MaterialImage['type'];
    /** Display order */
    displayOrder?: number;
    /** Whether this should be the primary image */
    isPrimary?: boolean;
  };
}

/**
 * Response for image operations
 */
export type MaterialImageResponse = MaterialApiResponse<MaterialImage>;

/**
 * Response for image list operations
 */
export type MaterialImageListResponse = MaterialApiResponse<MaterialImage[]>;

// =============================================================================
// Material Relationships API Types
// =============================================================================

/**
 * Relationship between materials
 */
export interface MaterialRelationship {
  /** Unique identifier */
  id: string;
  /** Source material ID */
  sourceMaterialId: string;
  /** Target material ID */
  targetMaterialId: string;
  /** Type of relationship */
  relationshipType: 'variant' | 'alternative' | 'component' | 'complement' | 'replacement' | 'similar' | 'custom';
  /** Relationship strength (0-1) */
  strength: number;
  /** Custom relationship label (for 'custom' type) */
  customLabel?: string;
  /** Additional relationship metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: string;
  /** Creator user ID */
  createdBy: string;
}

/**
 * Request to create a material relationship
 */
export interface CreateMaterialRelationshipRequest {
  /** Source material ID */
  sourceMaterialId: string;
  /** Target material ID */
  targetMaterialId: string;
  /** Type of relationship */
  relationshipType: MaterialRelationship['relationshipType'];
  /** Relationship strength (0-1) */
  strength: number;
  /** Custom relationship label (for 'custom' type) */
  customLabel?: string;
  /** Additional relationship metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response for relationship operations
 */
export type MaterialRelationshipResponse = MaterialApiResponse<MaterialRelationship>;

/**
 * Response for relationship list operations
 */
export type MaterialRelationshipListResponse = MaterialApiResponse<MaterialRelationship[]>;

// =============================================================================
// Unified Search API Types
// =============================================================================

/**
 * Comprehensive search request across all material data
 */
export interface UnifiedMaterialSearchRequest extends PaginationParams {
  /** Search query string */
  query?: string;
  /** Material filters */
  filters?: MaterialFilterParams;
  /** Include results from these data types */
  includeTypes?: Array<'materials' | 'metafields' | 'images' | 'relationships'>;
  /** Vector similarity search configuration */
  vectorSearch?: {
    /** Query vector for similarity search */
    vector?: number[];
    /** Similarity threshold (0-1) */
    threshold?: number;
    /** Maximum number of similar results */
    maxResults?: number;
  };
  /** Fuzzy search configuration */
  fuzzySearch?: {
    /** Enable fuzzy matching */
    enabled: boolean;
    /** Fuzzy threshold (0-1) */
    threshold?: number;
  };
}

/**
 * Unified search result item
 */
export interface UnifiedSearchResult {
  /** Result type */
  type: 'material' | 'metafield' | 'image' | 'relationship';
  /** Relevance score (0-1) */
  score: number;
  /** Result data */
  data: Material | MaterialMetafieldDefinition | MaterialImage | MaterialRelationship;
  /** Highlighted text snippets */
  highlights?: string[];
  /** Context information */
  context?: Record<string, unknown>;
}

/**
 * Response for unified search operations
 */
export type UnifiedSearchResponse = MaterialApiResponse<PaginatedResponse<UnifiedSearchResult>>;

// =============================================================================
// Edge Function Response Types
// =============================================================================

/**
 * Standard response format for Supabase Edge Functions
 */
export interface EdgeFunctionResponse<T = unknown> {
  /** Whether the function executed successfully */
  success: boolean;
  /** Response data payload */
  data?: T;
  /** Error message if function failed */
  error?: string;
  /** Function execution time in milliseconds */
  executionTime?: number;
  /** Edge function version */
  version?: string;
  /** Execution timestamp */
  timestamp: string;
  /** Request ID for tracing */
  requestId?: string;
}

/**
 * Batch operation response for bulk material operations
 */
export interface BatchOperationResponse<T = unknown> {
  /** Overall operation success */
  success: boolean;
  /** Results for each item in the batch */
  results: Array<{
    /** Item identifier */
    id: string;
    /** Whether this item succeeded */
    success: boolean;
    /** Result data for successful items */
    data?: T;
    /** Error message for failed items */
    error?: string;
  }>;
  /** Summary statistics */
  summary: {
    /** Total items processed */
    total: number;
    /** Number of successful items */
    successful: number;
    /** Number of failed items */
    failed: number;
    /** Processing time in milliseconds */
    processingTime: number;
  };
}

// =============================================================================
// Real-time Subscription Types
// =============================================================================

/**
 * Real-time event for material data changes
 */
export interface MaterialRealtimeEvent {
  /** Event type */
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Table/entity that changed */
  table: 'materials' | 'material_metafield_definitions' | 'material_metafield_values' | 'material_images' | 'material_relationships';
  /** Changed record data */
  record: unknown;
  /** Previous record data (for updates) */
  old_record?: unknown;
  /** Event timestamp */
  timestamp: string;
  /** User who made the change */
  user_id?: string;
}

/**
 * Subscription configuration for real-time events
 */
export interface MaterialRealtimeSubscription {
  /** Tables to subscribe to */
  tables: MaterialRealtimeEvent['table'][];
  /** Filter conditions */
  filters?: {
    /** Material IDs to watch */
    materialIds?: string[];
    /** User IDs to watch */
    userIds?: string[];
    /** Event types to include */
    eventTypes?: MaterialRealtimeEvent['type'][];
  };
  /** Callback function for events */
  callback: (event: MaterialRealtimeEvent) => void;
}

// =============================================================================
// Validation Schema Types
// =============================================================================

/**
 * Runtime validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors if any */
  errors?: Array<{
    /** Field path where error occurred */
    path: string;
    /** Error message */
    message: string;
    /** Error code for programmatic handling */
    code?: string;
    /** Additional error context */
    context?: Record<string, unknown>;
  }>;
}

/**
 * Validation schema configuration
 */
export interface ValidationSchema {
  /** Schema type */
  type: string;
  /** Required fields */
  required?: string[];
  /** Field definitions */
  properties?: Record<string, {
    type: string;
    format?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: unknown[];
  }>;
  /** Additional validation rules */
  additionalProperties?: boolean;
}

// =============================================================================
// Utility Functions for Type Safety
// =============================================================================

/**
 * Type guard to check if a response is successful
 */
export function isSuccessfulResponse<T>(
  response: MaterialApiResponse<T>
): response is MaterialApiResponse<T> & { success: true; data: T } {
  return response.success && response.data !== undefined;
}

/**
 * Type guard to check if a search result is a material
 */
export function isMaterialSearchResult(
  result: UnifiedSearchResult
): result is UnifiedSearchResult & { type: 'material'; data: Material } {
  return result.type === 'material';
}

/**
 * Type guard to check if a search result is a metafield
 */
export function isMetafieldSearchResult(
  result: UnifiedSearchResult
): result is UnifiedSearchResult & { type: 'metafield'; data: MaterialMetafieldDefinition } {
  return result.type === 'metafield';
}

/**
 * Type guard to check if a search result is an image
 */
export function isImageSearchResult(
  result: UnifiedSearchResult
): result is UnifiedSearchResult & { type: 'image'; data: MaterialImage } {
  return result.type === 'image';
}

/**
 * Type guard to check if a search result is a relationship
 */
export function isRelationshipSearchResult(
  result: UnifiedSearchResult
): result is UnifiedSearchResult & { type: 'relationship'; data: MaterialRelationship } {
  return result.type === 'relationship';
}