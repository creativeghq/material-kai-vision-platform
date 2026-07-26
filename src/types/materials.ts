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

/**
 * Material category enum — includes both the 10 DB upload categories
 * and legacy physical-material types for backwards compatibility.
 */
export enum MaterialCategory {
  // 10 DB upload categories (material_categories table)
  TILES = 'tiles',
  WOOD = 'wood',
  DECOR = 'decor',
  FURNITURE = 'furniture',
  GENERAL_MATERIALS = 'general_materials',
  PAINT_WALL_DECOR = 'paint_wall_decor',
  HEATING = 'heating',
  SANITARY = 'sanitary',
  KITCHEN = 'kitchen',
  LIGHTING = 'lighting',
  // Legacy physical-material types (kept for backwards compat)
  METAL = 'metal',
  PLASTIC = 'plastic',
  CERAMIC = 'ceramic',
  GLASS = 'glass',
  FABRIC = 'fabric',
  STONE = 'stone',
  COMPOSITE = 'composite',
}

/**
 * Material categories with metadata for validation and UI filtering.
 * Each category defines valid values for finish, size, installation method,
 * and application. Covers both DB upload categories and legacy types.
 */
export const MATERIAL_CATEGORIES = {
  // ═══ 10 DB Upload Categories ══════════════════════════════════════════════
  TILES: {
    name: 'Tiles',
    finish: ['glazed', 'unglazed', 'matte', 'glossy', 'polished', 'lappato', 'structured', 'natural'],
    size: ['small', 'medium', 'large', 'tile', 'slab', 'mosaic', 'custom'],
    installationMethod: ['adhesive', 'mortar', 'grouted', 'dry-set', 'wet-set', 'thin-set'],
    application: ['interior', 'exterior', 'flooring', 'wall', 'countertop', 'bathroom', 'shower', 'pool'],
  },
  WOOD: {
    name: 'Wood',
    finish: ['natural', 'stained', 'painted', 'varnished', 'oiled', 'waxed', 'lacquered', 'brushed', 'smoked'],
    size: ['small', 'medium', 'large', 'custom', 'standard', 'plank', 'board'],
    installationMethod: ['nailed', 'screwed', 'glued', 'interlocking', 'floating', 'stapled', 'click'],
    application: ['interior', 'exterior', 'structural', 'decorative', 'flooring', 'furniture'],
  },
  DECOR: {
    name: 'Decor',
    finish: ['matte', 'glazed', 'lacquered', 'natural', 'antiqued', 'hand-painted'],
    size: ['small', 'medium', 'large', 'custom'],
    installationMethod: ['freestanding', 'wall-mounted', 'hanging', 'adhesive'],
    application: ['interior', 'decorative', 'wall', 'tabletop', 'floor'],
  },
  FURNITURE: {
    name: 'Furniture',
    finish: ['lacquered', 'oiled', 'painted', 'powder-coated', 'chrome', 'natural', 'upholstered'],
    size: ['small', 'medium', 'large', 'custom', 'modular'],
    installationMethod: ['assembled', 'flatpack', 'freestanding', 'wall-mounted', 'built-in'],
    application: ['interior', 'exterior', 'residential', 'commercial', 'hospitality'],
  },
  GENERAL_MATERIALS: {
    name: 'General Materials',
    finish: ['polished', 'honed', 'leathered', 'flamed', 'bush-hammered', 'natural', 'matte'],
    size: ['slab', 'tile', 'panel', 'sheet', 'block', 'custom'],
    installationMethod: ['adhesive', 'mortar', 'mechanical', 'anchored', 'grouted', 'dry-stack'],
    application: ['interior', 'exterior', 'countertop', 'cladding', 'flooring', 'facade'],
  },
  PAINT_WALL_DECOR: {
    name: 'Paint / Wall Decors',
    finish: ['flat', 'matte', 'eggshell', 'satin', 'semi-gloss', 'gloss', 'textured'],
    size: ['can', 'roll', 'panel', 'custom'],
    installationMethod: ['brush', 'roller', 'spray', 'paste', 'adhesive'],
    application: ['interior', 'exterior', 'wall', 'ceiling', 'trim', 'bathroom', 'kitchen'],
  },
  HEATING: {
    name: 'Heating',
    finish: ['powder-coated', 'chrome', 'brushed-steel', 'white', 'anthracite', 'RAL-colour'],
    size: ['small', 'medium', 'large', 'custom'],
    installationMethod: ['wall-mounted', 'floor-standing', 'freestanding', 'recessed', 'plumbed'],
    application: ['residential', 'commercial', 'bathroom', 'living-room', 'hallway'],
  },
  SANITARY: {
    name: 'Sanitary',
    finish: ['white', 'matt-white', 'glossy', 'chrome', 'brushed-nickel', 'matt-black'],
    size: ['compact', 'standard', 'large', 'custom'],
    installationMethod: ['wall-hung', 'floor-standing', 'countertop', 'undermount', 'back-to-wall', 'concealed'],
    application: ['bathroom', 'cloakroom', 'en-suite', 'commercial', 'accessible'],
  },
  KITCHEN: {
    name: 'Kitchen',
    finish: ['matt', 'gloss', 'wood-grain', 'lacquered', 'Fenix', 'laminate', 'painted'],
    size: ['base-unit', 'wall-unit', 'tall-unit', 'custom'],
    installationMethod: ['fitted', 'flatpack', 'wall-mounted', 'freestanding', 'integrated'],
    application: ['residential', 'commercial', 'island', 'galley', 'open-plan'],
  },
  LIGHTING: {
    name: 'Lighting',
    finish: ['chrome', 'brushed-brass', 'matt-black', 'white', 'copper', 'antique-bronze', 'natural'],
    size: ['small', 'medium', 'large', 'custom'],
    installationMethod: ['pendant', 'surface-mounted', 'recessed', 'track', 'wall-bracket', 'plug-in'],
    application: ['residential', 'commercial', 'hospitality', 'outdoor', 'bathroom', 'task', 'ambient', 'accent'],
  },
  // ═══ Legacy Physical-Material Types (backwards compat) ════════════════════
  METAL: {
    name: 'Metal',
    finish: ['brushed', 'polished', 'matte', 'anodized', 'galvanized', 'powder-coated', 'painted'],
    size: ['small', 'medium', 'large', 'custom', 'sheet', 'rod', 'tube'],
    installationMethod: ['welded', 'bolted', 'screwed', 'riveted', 'clipped', 'magnetic'],
    application: ['structural', 'decorative', 'industrial', 'architectural', 'mechanical', 'electrical'],
  },
  PLASTIC: {
    name: 'Plastic',
    finish: ['smooth', 'textured', 'matte', 'glossy', 'transparent', 'translucent', 'opaque'],
    size: ['small', 'medium', 'large', 'custom', 'sheet', 'film', 'molded'],
    installationMethod: ['adhesive', 'mechanical', 'heat-welded', 'ultrasonic', 'snap-fit', 'threaded'],
    application: ['interior', 'exterior', 'packaging', 'automotive', 'medical', 'consumer'],
  },
  CERAMIC: {
    name: 'Ceramic',
    finish: ['glazed', 'unglazed', 'matte', 'glossy', 'textured', 'polished', 'natural'],
    size: ['small', 'medium', 'large', 'tile', 'slab', 'custom', 'mosaic'],
    installationMethod: ['adhesive', 'mortar', 'mechanical', 'grouted', 'dry-set', 'wet-set'],
    application: ['interior', 'exterior', 'flooring', 'wall', 'countertop', 'decorative'],
  },
  GLASS: {
    name: 'Glass',
    finish: ['clear', 'frosted', 'tinted', 'reflective', 'textured', 'laminated', 'tempered'],
    size: ['small', 'medium', 'large', 'custom', 'panel', 'sheet', 'block'],
    installationMethod: ['framed', 'structural', 'adhesive', 'mechanical', 'glazed', 'curtain-wall'],
    application: ['architectural', 'decorative', 'safety', 'insulating', 'solar', 'automotive'],
  },
  FABRIC: {
    name: 'Fabric',
    finish: ['natural', 'treated', 'waterproof', 'fire-resistant', 'stain-resistant', 'antimicrobial'],
    size: ['small', 'medium', 'large', 'roll', 'panel', 'custom', 'tile'],
    installationMethod: ['adhesive', 'stapled', 'sewn', 'velcro', 'magnetic', 'tensioned'],
    application: ['upholstery', 'drapery', 'wall-covering', 'acoustic', 'outdoor', 'industrial'],
  },
  STONE: {
    name: 'Stone',
    finish: ['natural', 'polished', 'honed', 'brushed', 'flamed', 'sandblasted', 'tumbled'],
    size: ['small', 'medium', 'large', 'slab', 'tile', 'block', 'veneer'],
    installationMethod: ['mortar', 'adhesive', 'mechanical', 'dry-stack', 'anchored', 'grouted'],
    application: ['interior', 'exterior', 'structural', 'decorative', 'landscaping', 'countertop'],
  },
  COMPOSITE: {
    name: 'Composite',
    finish: ['smooth', 'textured', 'wood-grain', 'stone-look', 'metallic', 'matte', 'glossy'],
    size: ['small', 'medium', 'large', 'custom', 'panel', 'plank', 'sheet'],
    installationMethod: ['mechanical', 'adhesive', 'interlocking', 'clipped', 'screwed', 'snap-fit'],
    application: ['interior', 'exterior', 'structural', 'decorative', 'marine', 'automotive'],
  },
} as const;

/**
 * Helper functions to extract filter options from MATERIAL_CATEGORIES
 * These provide static data for UI filtering components
 */

/**
 * Get all material categories asynchronously
 * @returns Promise resolving to array of category objects with name and value
 */
export const getMaterialCategoriesAsync = async (): Promise<
  Array<{ name: string; value: string }>
> => {
  return Object.entries(MATERIAL_CATEGORIES).map(([key, value]) => ({
    name: value.name,
    value: key.toLowerCase(),
  }));
};

/**
 * Get all unique material finishes across all categories
 * @returns Promise resolving to array of finish types
 */
export const getAllMaterialFinishes = async (): Promise<string[]> => {
  const finishesSet = new Set<string>();
  Object.values(MATERIAL_CATEGORIES).forEach((category) => {
    category.finish.forEach((finish) => finishesSet.add(finish));
  });
  return Array.from(finishesSet).sort();
};

/**
 * Get all unique material sizes across all categories
 * @returns Promise resolving to array of size types
 */
export const getAllMaterialSizes = async (): Promise<string[]> => {
  const sizesSet = new Set<string>();
  Object.values(MATERIAL_CATEGORIES).forEach((category) => {
    category.size.forEach((size) => sizesSet.add(size));
  });
  return Array.from(sizesSet).sort();
};

/**
 * Get all unique installation methods across all categories
 * @returns Promise resolving to array of installation methods
 */
export const getAllMaterialInstallationMethods = async (): Promise<string[]> => {
  const methodsSet = new Set<string>();
  Object.values(MATERIAL_CATEGORIES).forEach((category) => {
    category.installationMethod.forEach((method) => methodsSet.add(method));
  });
  return Array.from(methodsSet).sort();
};

/**
 * Get all unique applications across all categories
 * @returns Promise resolving to array of application types
 */
export const getAllMaterialApplications = async (): Promise<string[]> => {
  const applicationsSet = new Set<string>();
  Object.values(MATERIAL_CATEGORIES).forEach((category) => {
    category.application.forEach((app) => applicationsSet.add(app));
  });
  return Array.from(applicationsSet).sort();
};

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

// MoodBoard interface for material collections
export interface MoodBoard {
  id: string;
  userId: string;
  title: string;
  description?: string;
  isPublic: boolean;
  items: MoodBoardItem[];
  createdAt: Date;
  updatedAt: Date;
  /** Project Workspace linkage (Phase 1). Null for standalone moodboards. */
  projectId?: string | null;
  /** Project room linkage. Only meaningful when projectId is set. */
  roomId?: string | null;
  /** Lifecycle status. 'completed' lets the storage-retention sweep purge the
   *  board's regenerable sheet PDFs (they rebuild on open). Defaults to 'active'. */
  status?: 'active' | 'completed' | 'archived';
  /** Set by the dormancy cron when an idle board is scheduled for hard-deletion; surfaced in-app
   *  as an at-risk badge + "Keep active" rescue so a user isn't silently deleted. */
  deletionScheduledAt?: string | null;
}

export interface MoodBoardItem {
  id: string;
  moodboard_id: string;
  material_id: string | null;
  notes?: string;
  position: number;
  added_at: string;
  // Media fields (set when material_id is null)
  media_url?: string;
  media_type?: 'image' | 'video' | 'vr_world';
  media_title?: string;
  material?: {
    id: string;
    name: string;
    category: string;
    thumbnail_url?: string;
    properties: Record<string, unknown>;
  };
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
  Failed = 'failed',
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
  id: string;
  fileName: string;
  materialId?: string;
  confidence: number;
  materialType: string;
  properties: Record<string, unknown>;
  composition: Record<string, unknown>;
  sustainability: Record<string, unknown>;
  imageUrl: string;
  processingTime: number;
  matchedMaterial?: Material;
  extractedProperties?: Record<string, unknown>;
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
export type MaterialCreateRequest = Omit<
  Material,
  'id' | 'createdAt' | 'updatedAt'
>;
export type MaterialUpdateRequest = Partial<
  Omit<Material, 'id' | 'createdAt' | 'updatedAt'>
>;

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
  [K in keyof T]?: T[K] extends string
    ? string | string[]
    : T[K] extends number
      ? { min?: number; max?: number } | number
      : T[K] extends boolean
        ? boolean
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
