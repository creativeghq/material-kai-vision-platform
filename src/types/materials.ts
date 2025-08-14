// Material categories are now defined using the MATERIAL_CATEGORIES constant below
// This provides better type safety and consistency across the application

/**
 * Detection methods available for material recognition
 */
export type DetectionMethod =
  | 'visual'
  | 'spectral'
  | 'thermal'
  | 'ocr'
  | 'voice'
  | 'combined';

/**
 * Processing status for jobs and uploads
 */
export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Physical and mechanical properties of materials
 * All values should include appropriate units in documentation
 */
export interface MaterialProperties {
  /** Density in g/cm³ */
  density?: number;
  /** Yield strength in MPa */
  yieldStrength?: number;
  /** Tensile strength in MPa */
  tensileStrength?: number;
  /** Thermal conductivity in W/m·K */
  thermalConductivity?: number;
  /** Flexural modulus in GPa */
  flexuralModulus?: number;
  /** Melting point in °C */
  meltingPoint?: number;
  /** Glass transition temperature in °C */
  glassTransition?: number;
  /** Additional custom properties with proper typing */
  customProperties?: Record<string, string | number | boolean>;
}

/**
 * Chemical composition data for materials
 */
export interface ChemicalComposition {
  /** Primary elements/compounds with percentage */
  elements: Record<string, number>;
  /** Additional chemical properties */
  properties?: {
    /** pH level if applicable */
    ph?: number;
    /** Molecular weight */
    molecularWeight?: number;
    /** Chemical formula */
    formula?: string;
  };
}

/**
 * Safety data and handling information
 */
export interface SafetyData {
  /** Hazard classification */
  hazardClass?: string;
  /** Safety warnings */
  warnings: string[];
  /** Handling instructions */
  handlingInstructions?: string;
  /** Personal protective equipment requirements */
  ppe?: string[];
  /** Storage requirements */
  storageRequirements?: string;
}

/**
 * Metadata for legacy compatibility and additional properties
 */
export interface MaterialMetadata {
  color?: string;
  finish?: string;
  size?: string;
  brand?: string;
  /** Additional properties - use sparingly, prefer specific fields */
  additionalProperties?: Record<string, string | number | boolean>;
}

/**
 * Core Material entity representing a material in the system
 */
export interface Material {
  /** Unique identifier for the material */
  id: string;
  /** Display name of the material */
  name: string;
  /** Material category classification */
  category: MaterialCategory;
  /** Optional description of the material */
  description?: string;
  /** Physical and mechanical properties */
  properties: MaterialProperties;
  /** Chemical composition data */
  composition?: ChemicalComposition;
  /** Safety and handling information */
  safety?: SafetyData;
  /** Industry standards and certifications */
  standards: string[];
  /** AI embedding vector for similarity search */
  embedding?: number[];
  /** URL to thumbnail image */
  thumbnailUrl?: string;
  /** Creation timestamp in ISO 8601 format */
  createdAt: string;
  /** Last update timestamp in ISO 8601 format */
  updatedAt: string;
  /** ID of user who created this material */
  createdBy?: string;
  /** Additional metadata and custom properties */
  metadata: MaterialMetadata;
  /** URL to main image (legacy compatibility) */
  imageUrl?: string;
}

/**
 * File upload information and metadata
 */
export interface UploadedFile {
  /** Unique identifier for the uploaded file */
  id: string;
  /** ID of the user who uploaded the file */
  userId: string;
  /** Original filename */
  fileName: string;
  /** Type of file uploaded */
  fileType: 'image' | 'document' | '3d_model';
  /** File size in bytes */
  fileSize: number;
  /** Storage path or URL */
  storagePath: string;
  /** File-specific metadata */
  metadata: FileMetadata;
  /** Current upload/processing status */
  uploadStatus: ProcessingStatus;
  /** Upload timestamp in ISO 8601 format */
  createdAt: string;
}

/**
 * Metadata specific to uploaded files
 */
export interface FileMetadata {
  /** Original file extension */
  extension?: string;
  /** MIME type */
  mimeType?: string;
  /** Image dimensions if applicable */
  dimensions?: {
    width: number;
    height: number;
  };
  /** File checksum for integrity verification */
  checksum?: string;
  /** Additional custom metadata */
  customProperties?: Record<string, string | number | boolean>;
}

/**
 * AI recognition result for material identification
 */
export interface RecognitionResult {
  /** Unique identifier for the recognition result */
  id: string;
  /** ID of the file that was analyzed */
  fileId: string;
  /** ID of the identified material (if any) */
  materialId?: string;
  /** Full material object (if populated) */
  material?: Material;
  /** AI confidence score (0-1) */
  confidenceScore: number;
  /** Method used for detection */
  detectionMethod: DetectionMethod;
  /** Version of AI model used */
  aiModelVersion?: string;
  /** Properties detected by AI */
  propertiesDetected: MaterialProperties;
  /** Processing time in milliseconds */
  processingTimeMs?: number;
  /** Whether result has been verified by user */
  userVerified: boolean;
  /** AI embedding vector */
  embedding?: number[];
  /** Recognition timestamp in ISO 8601 format */
  createdAt: string;
  /** Verification timestamp */
  verifiedAt?: string;
  /** ID of user who verified */
  verifiedBy?: string;
  /** Recognition metadata */
  metadata: RecognitionMetadata;
}

/**
 * Metadata for recognition results
 */
export interface RecognitionMetadata {
  /** Detected material name */
  detectedName?: string;
  /** Alternative material suggestions */
  alternatives?: Array<{
    materialId: string;
    confidence: number;
    name: string;
  }>;
  /** Processing details */
  processingDetails?: {
    /** Image preprocessing applied */
    preprocessing?: string[];
    /** Regions of interest analyzed */
    regionsAnalyzed?: number;
  };
  /** Legacy compatibility fields */
  legacy?: {
    imageUrl?: string;
    processingTime?: number;
  };
}

/**
 * Represents a processing job for material analysis operations
 */
export interface ProcessingJob {
  /** Unique identifier for the processing job */
  id: string;
  /** ID of the user who created the job */
  userId: string;
  /** Type of processing operation to perform */
  jobType: 'recognition' | '3d_reconstruction' | 'batch_analysis';
  /** Input data for the processing job */
  inputData: ProcessingJobInputData;
  /** Current status of the processing job */
  status: ProcessingStatus;
  /** Priority level for job execution (higher numbers = higher priority) */
  priority: number;
  /** Timestamp when the job was created */
  createdAt: string;
  /** Timestamp when processing started */
  startedAt?: string;
  /** Timestamp when processing completed */
  completedAt?: string;
  /** Results of the processing operation */
  result?: ProcessingJobResult;
  /** Error message if processing failed */
  errorMessage?: string;
  /** Time taken to process in milliseconds */
  processingTimeMs?: number;
}

/**
 * Input data structure for processing jobs
 */
export interface ProcessingJobInputData {
  /** File paths or identifiers to process */
  files?: string[];
  /** Processing parameters and configuration */
  parameters?: {
    /** Detection methods to use */
    detectionMethods?: DetectionMethod[];
    /** Confidence threshold for results */
    confidenceThreshold?: number;
    /** Whether to include similar materials */
    includeSimilarMaterials?: boolean;
    /** Whether to extract material properties */
    extractProperties?: boolean;
  };
  /** Additional metadata for the job */
  metadata?: {
    /** Source of the input data */
    source?: string;
    /** Batch identifier if part of a batch */
    batchId?: string;
    /** Custom tags for organization */
    tags?: string[];
  };
}

/**
 * Result data structure for processing jobs
 */
export interface ProcessingJobResult {
  /** Recognition results if applicable */
  recognitionResults?: RecognitionResult[];
  /** 3D reconstruction data if applicable */
  reconstructionData?: {
    /** Generated 3D model file path */
    modelPath?: string;
    /** Mesh quality metrics */
    qualityMetrics?: {
      /** Number of vertices in the mesh */
      vertexCount?: number;
      /** Number of faces in the mesh */
      faceCount?: number;
      /** Surface area of the model */
      surfaceArea?: number;
    };
  };
  /** Batch analysis summary if applicable */
  batchSummary?: {
    /** Total items processed */
    totalItems?: number;
    /** Successfully processed items */
    successfulItems?: number;
    /** Failed items */
    failedItems?: number;
    /** Overall confidence score */
    averageConfidence?: number;
  };
  /** Processing statistics */
  statistics?: {
    /** Memory usage during processing */
    memoryUsageMb?: number;
    /** CPU usage percentage */
    cpuUsagePercent?: number;
    /** GPU usage if applicable */
    gpuUsagePercent?: number;
  };
}

/**
 * Represents knowledge about materials from various sources
 */
export interface MaterialKnowledge {
  /** Unique identifier for the knowledge entry */
  id: string;
  /** Title or name of the knowledge entry */
  title: string;
  /** Main content of the knowledge entry */
  content: string;
  /** Type of source for this knowledge */
  sourceType: 'datasheet' | 'research' | 'standard' | 'user_input';
  /** IDs of materials this knowledge relates to */
  materialIds: string[];
  /** Vector embedding for semantic search */
  embedding?: number[];
  /** Additional metadata about the knowledge */
  metadata: KnowledgeMetadata;
  /** Relevance score for search results */
  relevanceScore: number;
  /** Timestamp when the knowledge was created */
  createdAt: string;
  /** ID of the user who created this knowledge */
  createdBy?: string;
}

/**
 * Metadata structure for material knowledge entries
 */
export interface KnowledgeMetadata {
  /** Source document or publication */
  source?: {
    /** Title of the source document */
    title?: string;
    /** Authors of the source */
    authors?: string[];
    /** Publication date */
    publicationDate?: string;
    /** DOI or other identifier */
    identifier?: string;
    /** URL to the source */
    url?: string;
  };
  /** Keywords and tags for categorization */
  tags?: string[];
  /** Language of the content */
  language?: string;
  /** Confidence in the accuracy of the information */
  confidenceLevel?: 'low' | 'medium' | 'high';
  /** Last verification date */
  lastVerified?: string;
  /** Version of the knowledge entry */
  version?: string;
}

/**
 * Request structure for material recognition operations
 */
export interface RecognitionRequest {
  /** Files to be processed for material recognition */
  files: File[];
  /** Configuration options for the recognition process */
  options: RecognitionOptions;
}

/**
 * Configuration options for material recognition
 */
export interface RecognitionOptions {
  /** Detection methods to use for material identification */
  detectionMethods: DetectionMethod[];
  /** Minimum confidence threshold for results (0-1) */
  confidenceThreshold: number;
  /** Whether to include similar materials in results */
  includeSimilarMaterials: boolean;
  /** Whether to extract detailed material properties */
  extractProperties: boolean;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Specific material categories to focus on */
  targetCategories?: MaterialCategory[];
}

/**
 * Response structure for material recognition operations
 */
export interface RecognitionResponse {
  /** Array of recognition results */
  results: RecognitionResult[];
  /** Time taken to process the request in milliseconds */
  processingTimeMs: number;
  /** Suggested similar materials */
  suggestions: Material[];
  /** Distribution of confidence scores across categories */
  confidenceDistribution: ConfidenceDistribution;
  /** Metadata about the recognition process */
  metadata: RecognitionMetadata;
}

/**
 * Confidence distribution across material categories
 */
export interface ConfidenceDistribution {
  /** Confidence scores by material category */
  byCategory: Record<MaterialCategory, number>;
  /** Overall confidence score */
  overall: number;
  /** Number of materials detected */
  detectedCount: number;
}

/**
 * Metadata about the recognition process
 */
export interface RecognitionMetadata {
  /** Version of the recognition algorithm used */
  algorithmVersion: string;
  /** Models used in the recognition process */
  modelsUsed: string[];
  /** Processing statistics */
  processingStats: {
    /** Number of images processed */
    imageCount: number;
    /** Average processing time per image */
    avgProcessingTimeMs: number;
    /** Memory usage during processing */
    memoryUsageMb: number;
  };
}

/**
 * Consolidated material categories with proper TypeScript const assertion
 * This replaces the previous multiple MaterialCategory definitions
 */
export const MATERIAL_CATEGORIES = {
  METALS: 'metals',
  PLASTICS: 'plastics',
  CERAMICS: 'ceramics',
  COMPOSITES: 'composites',
  TEXTILES: 'textiles',
  WOOD: 'wood',
  GLASS: 'glass',
  RUBBER: 'rubber',
  CONCRETE: 'concrete',
  STONE: 'stone',
  OTHER: 'other'
} as const;

/**
 * Type derived from the material categories constant
 */
export type MaterialCategory = typeof MATERIAL_CATEGORIES[keyof typeof MATERIAL_CATEGORIES];

/**
 * @deprecated Use MATERIAL_CATEGORIES constant instead
 * Legacy enum maintained for backward compatibility only
 */
export enum MaterialCategory_OLD {
  STONE = 'stone',
  WOOD = 'wood',
  METAL = 'metal',
  CERAMIC = 'ceramic',
  FABRIC = 'fabric',
  PLASTIC = 'plastic',
  GLASS = 'glass',
  CONCRETE = 'concrete'
}

/**
 * Represents a mood board for organizing and sharing material collections
 */
export interface MoodBoard {
  /** Unique identifier for the mood board */
  id: string;
  /** ID of the user who created the mood board */
  userId: string;
  /** Title of the mood board */
  title: string;
  /** Optional description of the mood board */
  description?: string;
  /** Whether the mood board is publicly visible */
  isPublic: boolean;
  /** Materials included in the mood board */
  items: Material[];
  /** Timestamp when the mood board was created */
  createdAt: string;
  /** Timestamp when the mood board was last updated */
  updatedAt: string;
  /** Tags for categorizing the mood board */
  tags?: string[];
  /** Thumbnail image for the mood board */
  thumbnailUrl?: string;
  /** Number of likes/favorites */
  likesCount?: number;
  /** Number of views */
  viewsCount?: number;
}