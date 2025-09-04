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
 * Functional Metadata Categories for Comprehensive Material Analysis
 * These interfaces support the 9 functional metadata categories required for material tiles
 */

/**
 * 1. Slip and Safety Ratings - Critical for flooring applications
 */
export interface SlipSafetyRatings {
  /** R-values (DIN 51130) – Slip-resistance scale (R9–R13) */
  rValue?: 'R9' | 'R10' | 'R11' | 'R12' | 'R13';
  /** Barefoot Ramp Test (DIN 51097) – Class A, B, C for wet barefoot areas */
  barefootRampTest?: 'A' | 'B' | 'C';
  /** Pendulum Test Value (PTV / BS 7976) – Wet and dry slip resistance ratings */
  pendulumTestValue?: {
    /** Wet slip resistance value */
    wet?: number;
    /** Dry slip resistance value */
    dry?: number;
  };
  /** Dynamic Coefficient of Friction (DCOF, ANSI A137.1) – ≥0.42 recommended for floors */
  dcof?: number;
  /** Additional safety certifications */
  safetyCertifications?: string[];
}

/**
 * 2. Surface Gloss / Reflectivity - Aesthetic and functional surface properties
 */
export interface SurfaceGlossReflectivity {
  /** Gloss level classification */
  glossLevel?: 'super-polished' | 'polished' | 'satin' | 'semi-polished' | 'matte' | 'velvet' | 'anti-glare';
  /** Gloss value measurement (0-100) */
  glossValue?: number;
  /** Light reflectance value (percentage) */
  lightReflectance?: number;
  /** Surface finish description */
  surfaceFinish?: string;
  /** Reflectivity properties for specific applications */
  reflectivityProperties?: {
    /** Anti-glare rating for display areas */
    antiGlareRating?: number;
    /** Mirror-like finish capability */
    mirrorFinish?: boolean;
  };
}

/**
 * 3. Mechanical Properties - Structural performance characteristics
 */
export interface MechanicalPropertiesExtended {
  /** Mohs Hardness Scale (1–10) */
  mohsHardness?: number;
  /** PEI Rating (Class 0–5) - Abrasion resistance for foot traffic */
  peiRating?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Breaking Strength / Flexural Strength (N/mm²) */
  breakingStrength?: number;
  /** Impact Resistance (ISO 10545-5) */
  impactResistance?: {
    /** Test method used */
    testMethod?: string;
    /** Resistance value */
    value?: number;
    /** Classification (low/medium/high) */
    classification?: 'low' | 'medium' | 'high';
  };
  /** Additional mechanical certifications */
  mechanicalCertifications?: string[];
}

/**
 * 4. Thermal Properties - Heat-related performance characteristics
 */
export interface ThermalProperties {
  /** Thermal Conductivity (W/m·K) */
  thermalConductivity?: number;
  /** Thermal Expansion Coefficient (1/K) */
  thermalExpansionCoefficient?: number;
  /** Heat Resistance (maximum temperature in °C) */
  heatResistance?: number;
  /** Heat Reflective/Cool Roof Rating */
  coolRoofRating?: {
    /** Solar reflectance index */
    solarReflectance?: number;
    /** Thermal emittance */
    thermalEmittance?: number;
    /** SRI value */
    sriValue?: number;
  };
  /** Radiant Heating Compatibility */
  radiantHeatingCompatible?: boolean;
  /** Thermal shock resistance */
  thermalShockResistance?: string;
}

/**
 * 5. Water and Moisture Resistance - Moisture-related performance
 */
export interface WaterMoistureResistance {
  /** Water Absorption (ISO 10545-3) – Non-porous (<0.5%), Semi-porous, Porous */
  waterAbsorption?: {
    /** Absorption percentage */
    percentage?: number;
    /** Classification based on absorption rate */
    classification?: 'non-porous' | 'semi-porous' | 'porous';
    /** Test standard used */
    testStandard?: string;
  };
  /** Frost Resistance rating */
  frostResistance?: boolean;
  /** Hydrophobic/Nano-sealed treatment */
  hydrophobicTreatment?: {
    /** Is hydrophobic coating applied */
    applied?: boolean;
    /** Type of treatment */
    treatmentType?: string;
    /** Effectiveness rating */
    effectivenessRating?: number;
  };
  /** Mold/Mildew Resistant properties */
  moldMildewResistant?: boolean;
  /** Additional moisture certifications */
  moistureCertifications?: string[];
}

/**
 * 6. Chemical and Hygiene Resistance - Chemical resistance and cleanliness
 */
export interface ChemicalHygieneResistance {
  /** Chemical Resistance (ISO 10545-13) */
  chemicalResistance?: {
    /** Acid resistance rating */
    acidResistance?: 'excellent' | 'good' | 'fair' | 'poor';
    /** Alkali resistance rating */
    alkaliResistance?: 'excellent' | 'good' | 'fair' | 'poor';
    /** Test standard used */
    testStandard?: string;
  };
  /** Stain Resistance (ISO 10545-14) – Class 1–5 */
  stainResistance?: {
    /** Stain resistance class (1-5, higher is better) */
    class?: 1 | 2 | 3 | 4 | 5;
    /** Test method used */
    testMethod?: string;
  };
  /** Antibacterial/Antimicrobial Surface properties */
  antimicrobialProperties?: {
    /** Has antimicrobial treatment */
    antimicrobialTreatment?: boolean;
    /** Type of antimicrobial agent */
    agentType?: string;
    /** Effectiveness percentage */
    effectiveness?: number;
    /** Duration of effectiveness */
    duration?: string;
  };
  /** Food-safe Certification */
  foodSafeCertified?: boolean;
  /** Chemical resistance certifications */
  chemicalCertifications?: string[];
}

/**
 * 7. Acoustic and Electrical Properties - Sound and electrical characteristics
 */
export interface AcousticElectricalProperties {
  /** Sound Absorption/Acoustic Rating */
  acousticProperties?: {
    /** Noise Reduction Coefficient (NRC) */
    nrc?: number;
    /** Sound absorption coefficient */
    soundAbsorption?: number;
    /** Decibel reduction rating */
    decibelReduction?: number;
  };
  /** Impact Insulation Class (IIC) */
  impactInsulationClass?: number;
  /** Electrical properties */
  electricalProperties?: {
    /** Anti-static (ESD-safe) rating */
    antiStatic?: boolean;
    /** Conductive properties for specialized applications */
    conductive?: boolean;
    /** Electrical resistance value */
    electricalResistance?: number;
    /** ESD safety certification */
    esdCertified?: boolean;
  };
  /** Acoustic certifications */
  acousticCertifications?: string[];
}

/**
 * 8. Environmental and Sustainability - Eco-friendly and sustainability metrics
 */
export interface EnvironmentalSustainability {
  /** VOC Emission Rating */
  vocEmissionRating?: {
    /** Greenguard certification level */
    greenguard?: 'certified' | 'gold' | 'none';
    /** FloorScore certification */
    floorScore?: boolean;
    /** VOC emission level (mg/m³/h) */
    emissionLevel?: number;
  };
  /** Recycled Content percentage */
  recycledContent?: {
    /** Pre-consumer recycled content percentage */
    preConsumer?: number;
    /** Post-consumer recycled content percentage */
    postConsumer?: number;
    /** Total recycled content percentage */
    total?: number;
  };
  /** Environmental certifications and ratings */
  ecoLabels?: {
    /** LEED credits available */
    leedCredits?: number;
    /** BREEAM credits available */
    breeamCredits?: number;
    /** Other eco-label certifications */
    otherCertifications?: string[];
  };
  /** Low-carbon and sustainable material properties */
  sustainabilityMetrics?: {
    /** Geopolymer content (eco-friendly alternative to cement) */
    geopolymerRating?: number;
    /** Carbon footprint (kg CO2 equivalent) */
    carbonFootprint?: number;
    /** Recyclable at end of life */
    recyclable?: boolean;
    /** Circular material rating */
    circularMaterialRating?: number;
  };
}

/**
 * 9. Dimensional and Aesthetic - Size, appearance, and aesthetic properties
 */
export interface DimensionalAesthetic {
  /** Edge rectification properties */
  edgeProperties?: {
    /** Rectified edges for precise installation */
    rectifiedEdges?: boolean;
    /** Calibration grade for dimensional accuracy */
    calibrationGrade?: string;
    /** Edge geometry type */
    edgeGeometry?: 'straight' | 'beveled' | 'rounded' | 'custom';
  };
  /** 3D Texture Rating and surface characteristics */
  textureProperties?: {
    /** 3D texture depth (mm) */
    textureDepth?: number;
    /** Texture rating (0-10 scale) */
    textureRating?: number;
    /** Texture type description */
    textureType?: string;
  };
  /** Color Uniformity/Shade Variation (V1–V4) */
  colorProperties?: {
    /** Shade variation class (V1-V4, V1 is most uniform) */
    shadeVariation?: 'V1' | 'V2' | 'V3' | 'V4';
    /** Color uniformity percentage */
    colorUniformity?: number;
    /** Color fastness rating */
    colorFastness?: string;
  };
  /** Special aesthetic properties */
  specialProperties?: {
    /** Translucency for backlit applications */
    translucent?: boolean;
    /** Backlit capability rating */
    backlitCapability?: number;
    /** Luminescent/Glow-in-the-dark properties */
    luminescent?: boolean;
    /** Photoluminescent duration (hours) */
    photoluminescentDuration?: number;
  };
}

/**
 * Comprehensive functional metadata container
 * Integrates all 9 functional metadata categories
 */
export interface FunctionalMetadata {
  /** 1. Slip and Safety Ratings */
  slipSafetyRatings?: SlipSafetyRatings;
  /** 2. Surface Gloss / Reflectivity */
  surfaceGlossReflectivity?: SurfaceGlossReflectivity;
  /** 3. Mechanical Properties (Extended) */
  mechanicalPropertiesExtended?: MechanicalPropertiesExtended;
  /** 4. Thermal Properties */
  thermalProperties?: ThermalProperties;
  /** 5. Water and Moisture Resistance */
  waterMoistureResistance?: WaterMoistureResistance;
  /** 6. Chemical and Hygiene Resistance */
  chemicalHygieneResistance?: ChemicalHygieneResistance;
  /** 7. Acoustic and Electrical Properties */
  acousticElectricalProperties?: AcousticElectricalProperties;
  /** 8. Environmental and Sustainability */
  environmentalSustainability?: EnvironmentalSustainability;
  /** 9. Dimensional and Aesthetic */
  dimensionalAesthetic?: DimensionalAesthetic;
  /** Last updated timestamp for functional metadata */
  functionalMetadataUpdatedAt?: string;
  /** Source of functional metadata extraction */
  functionalMetadataSource?: 'pdf_extraction' | 'manual_input' | 'api_import' | 'ai_analysis';
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
  /** Installation method for the material */
  installationMethod?: string;
  /** Application area or use case */
  application?: string;
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
  /** Comprehensive functional metadata for all 9 categories */
  functionalMetadata?: FunctionalMetadata;
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
 * Consolidated material categories with comprehensive tile types and meta properties
 * Each category includes finish, size, installation method, and application properties
 */
export const MATERIAL_CATEGORIES = {
  // Ceramics and Tiles
  CERAMICS: {
    name: 'ceramics',
    finish: ['glossy', 'matte', 'semi-gloss', 'textured'],
    size: ['4x4"', '6x6"', '8x8"', '12x12"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive', 'pressure sensitive adhesive'],
    application: ['floor', 'wall', 'backsplash', 'shower']
  },
  PORCELAIN: {
    name: 'porcelain',
    finish: ['polished', 'matte', 'textured', 'glazed'],
    size: ['12x12"', '18x18"', '24x24"', '30x30"', '36x36"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive', 'pressure sensitive adhesive'],
    application: ['floor', 'wall', 'outdoor', 'commercial']
  },
  TRAVERTINE: {
    name: 'travertine',
    finish: ['honed', 'polished', 'brushed', 'tumbled'],
    size: ['12x12"', '16x16"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'outdoor', 'pool deck']
  },
  MARBLE: {
    name: 'marble',
    finish: ['polished', 'honed', 'brushed', 'tumbled'],
    size: ['12x12"', '16x16"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'vanity']
  },
  GRANITE: {
    name: 'granite',
    finish: ['polished', 'honed', 'flamed', 'leathered'],
    size: ['12x12"', '18x18"', '24x24"', '30x30"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'outdoor']
  },
  SLATE: {
    name: 'slate',
    finish: ['natural cleft', 'honed', 'polished', 'riven'],
    size: ['12x12"', '16x16"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'roof', 'outdoor']
  },
  LIMESTONE: {
    name: 'limestone',
    finish: ['honed', 'polished', 'brushed', 'tumbled'],
    size: ['12x12"', '16x16"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'outdoor', 'pool deck']
  },
  QUARTZITE: {
    name: 'quartzite',
    finish: ['polished', 'honed', 'leathered', 'brushed'],
    size: ['12x12"', '18x18"', '24x24"', '30x30"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'outdoor']
  },
  SANDSTONE: {
    name: 'sandstone',
    finish: ['natural cleft', 'honed', 'polished', 'brushed'],
    size: ['12x12"', '16x16"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'outdoor', 'fireplace']
  },
  ONYX: {
    name: 'onyx',
    finish: ['polished', 'honed', 'brushed'],
    size: ['12x12"', '16x16"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  // Glass and Specialty Materials
  GLASS: {
    name: 'glass',
    finish: ['clear', 'frosted', 'tinted', 'patterned'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive', 'silicone'],
    application: ['floor', 'wall', 'backsplash', 'shower']
  },
  MOSAIC: {
    name: 'mosaic',
    finish: ['glossy', 'matte', 'mixed'],
    size: ['1x1"', '2x2"', 'sheets'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'backsplash', 'shower']
  },
  METAL: {
    name: 'metal',
    finish: ['brushed', 'polished', 'oxidized', 'painted'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive', 'mechanical fasteners'],
    application: ['floor', 'wall', 'backsplash', 'accent']
  },
  CONCRETE: {
    name: 'concrete',
    finish: ['polished', 'matte', 'textured', 'stained'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'outdoor', 'commercial']
  },
  WOOD: {
    name: 'wood',
    finish: ['natural', 'stained', 'oiled', 'lacquered'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['floating', 'glue down', 'nail down'],
    application: ['floor', 'wall', 'accent', 'furniture']
  },
  VINYL: {
    name: 'vinyl',
    finish: ['matte', 'glossy', 'textured'],
    size: ['12"', '18"', 'rolls'],
    installationMethod: ['glue down', 'floating', 'self-adhesive'],
    application: ['floor', 'wall', 'commercial', 'residential']
  },
  LAMINATE: {
    name: 'laminate',
    finish: ['matte', 'glossy', 'textured'],
    size: ['12x12"', '18x18"', 'rolls'],
    installationMethod: ['floating', 'glue down'],
    application: ['floor', 'commercial', 'residential']
  },
  CARPET: {
    name: 'carpet',
    finish: ['loop', 'cut', 'frieze', 'shag'],
    size: ['rolls', 'tiles'],
    installationMethod: ['glue down', 'tack strips'],
    application: ['floor', 'commercial', 'residential']
  },
  RUBBER: {
    name: 'rubber',
    finish: ['matte', 'textured'],
    size: ['rolls', 'tiles'],
    installationMethod: ['glue down', 'self-adhesive'],
    application: ['floor', 'commercial', 'industrial']
  },
  CORK: {
    name: 'cork',
    finish: ['natural', 'stained', 'oiled'],
    size: ['12x12"', '18x18"', 'rolls'],
    installationMethod: ['glue down', 'floating'],
    application: ['floor', 'wall', 'acoustic']
  },
  BAMBOO: {
    name: 'bamboo',
    finish: ['natural', 'stained', 'carbonized'],
    size: ['12x12"', '18x18"', 'rolls'],
    installationMethod: ['floating', 'glue down', 'nail down'],
    application: ['floor', 'wall', 'eco-friendly']
  },
  TERRAZZO: {
    name: 'terrazzo',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'commercial', 'outdoor']
  },
  RECYCLED_GLASS: {
    name: 'recycled_glass',
    finish: ['polished', 'matte', 'textured'],
    size: ['12x12"', '18x18"', '24x24"'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'eco-friendly']
  },
  ACRYLIC: {
    name: 'acrylic',
    finish: ['clear', 'tinted', 'patterned'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive', 'silicone'],
    application: ['floor', 'wall', 'shower', 'backsplash']
  },
  CORIAN: {
    name: 'corian',
    finish: ['polished', 'matte', 'textured'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  QUARTZ: {
    name: 'quartz',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  GRANITE_COMPOSITE: {
    name: 'granite_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  MARBLE_COMPOSITE: {
    name: 'marble_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  TRAVERTINE_COMPOSITE: {
    name: 'travertine_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  LIMESTONE_COMPOSITE: {
    name: 'limestone_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  QUARTZITE_COMPOSITE: {
    name: 'quartzite_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  SANDSTONE_COMPOSITE: {
    name: 'sandstone_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  ONYX_COMPOSITE: {
    name: 'onyx_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  SLATE_COMPOSITE: {
    name: 'slate_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  GLASS_COMPOSITE: {
    name: 'glass_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  METAL_COMPOSITE: {
    name: 'metal_composite',
    finish: ['polished', 'brushed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  CONCRETE_COMPOSITE: {
    name: 'concrete_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  WOOD_COMPOSITE: {
    name: 'wood_composite',
    finish: ['natural', 'stained', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  VINYL_COMPOSITE: {
    name: 'vinyl_composite',
    finish: ['matte', 'glossy', 'textured'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  LAMINATE_COMPOSITE: {
    name: 'laminate_composite',
    finish: ['matte', 'glossy', 'textured'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  CARPET_COMPOSITE: {
    name: 'carpet_composite',
    finish: ['loop', 'cut', 'frieze'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  RUBBER_COMPOSITE: {
    name: 'rubber_composite',
    finish: ['matte', 'textured'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  CORK_COMPOSITE: {
    name: 'cork_composite',
    finish: ['natural', 'stained'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  BAMBOO_COMPOSITE: {
    name: 'bamboo_composite',
    finish: ['natural', 'stained'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  TERRAZZO_COMPOSITE: {
    name: 'terrazzo_composite',
    finish: ['polished', 'honed', 'matte'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  RECYCLED_GLASS_COMPOSITE: {
    name: 'recycled_glass_composite',
    finish: ['polished', 'matte', 'textured'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  ACRYLIC_COMPOSITE: {
    name: 'acrylic_composite',
    finish: ['clear', 'tinted'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  },
  CORIAN_COMPOSITE: {
    name: 'corian_composite',
    finish: ['polished', 'matte', 'textured'],
    size: ['12x12"', '18x18"', '24x24"', 'custom'],
    installationMethod: ['thinset mortar', 'epoxy adhesive'],
    application: ['floor', 'wall', 'countertop', 'backsplash']
  }
} as const;

/**
 * Material category type derived from the MATERIAL_CATEGORIES constant
 */
export type MaterialCategory = keyof typeof MATERIAL_CATEGORIES;

/**
 * Type for individual material category objects
 */
export type MaterialCategoryDefinition = typeof MATERIAL_CATEGORIES[MaterialCategory];

/**
 * Utility type for extracting category names
 */
export type MaterialCategoryName = typeof MATERIAL_CATEGORIES[MaterialCategory]['name'];

/**
 * Utility type for extracting finish options for a specific category
 */
export type MaterialFinish<T extends MaterialCategory> = typeof MATERIAL_CATEGORIES[T]['finish'][number];

/**
 * Utility type for extracting size options for a specific category
 */
export type MaterialSize<T extends MaterialCategory> = typeof MATERIAL_CATEGORIES[T]['size'][number];

/**
 * Utility type for extracting installation methods for a specific category
 */
export type MaterialInstallationMethod<T extends MaterialCategory> = typeof MATERIAL_CATEGORIES[T]['installationMethod'][number];

/**
 * Utility type for extracting application areas for a specific category
 */
export type MaterialApplication<T extends MaterialCategory> = typeof MATERIAL_CATEGORIES[T]['application'][number];

/**
 * Type guard to check if a string is a valid material category
 */
export function isMaterialCategory(value: string): value is MaterialCategory {
  return value in MATERIAL_CATEGORIES;
}

/**
 * Get all available material categories
 */
export function getMaterialCategories(): MaterialCategory[] {
  return Object.keys(MATERIAL_CATEGORIES) as MaterialCategory[];
}

/**
 * Get category definition by category key
 */
export function getMaterialCategoryDefinition(category: MaterialCategory): MaterialCategoryDefinition {
  return MATERIAL_CATEGORIES[category];
}

/**
 * Get all available finishes for a specific category
 */
export function getMaterialFinishes(category: MaterialCategory): readonly string[] {
  return MATERIAL_CATEGORIES[category].finish;
}

/**
 * Get all available sizes for a specific category
 */
export function getMaterialSizes(category: MaterialCategory): readonly string[] {
  return MATERIAL_CATEGORIES[category].size;
}

/**
 * Get all available installation methods for a specific category
 */
export function getMaterialInstallationMethods(category: MaterialCategory): readonly string[] {
  return MATERIAL_CATEGORIES[category].installationMethod;
}

/**
 * Get all available applications for a specific category
 */
export function getMaterialApplications(category: MaterialCategory): readonly string[] {
  return MATERIAL_CATEGORIES[category].application;
}

/**
 * Validate if a finish is valid for a specific category
 */
export function isValidFinish(category: MaterialCategory, finish: string): boolean {
  return MATERIAL_CATEGORIES[category].finish.some(f => f === finish);
}

/**
 * Validate if a size is valid for a specific category
 */
export function isValidSize(category: MaterialCategory, size: string): boolean {
  return MATERIAL_CATEGORIES[category].size.some(s => s === size);
}

/**
 * Validate if an installation method is valid for a specific category
 */
export function isValidInstallationMethod(category: MaterialCategory, method: string): boolean {
  return MATERIAL_CATEGORIES[category].installationMethod.some(m => m === method);
}

/**
 * Validate if an application is valid for a specific category
 */
export function isValidApplication(category: MaterialCategory, application: string): boolean {
  return MATERIAL_CATEGORIES[category].application.some(a => a === application);
}

/**
 * Get category name by category key
 */
export function getMaterialCategoryName(category: MaterialCategory): string {
  return MATERIAL_CATEGORIES[category].name;
}

/**
 * Find category by name
 */
export function findMaterialCategoryByName(name: string): MaterialCategory | undefined {
  const categories = getMaterialCategories();
  return categories.find(category => MATERIAL_CATEGORIES[category].name === name);
}

/**
 * Get all unique finishes across all categories
 */
export function getAllMaterialFinishes(): string[] {
  const finishes = new Set<string>();
  const categories = getMaterialCategories();

  categories.forEach(category => {
    MATERIAL_CATEGORIES[category].finish.forEach(finish => {
      finishes.add(finish);
    });
  });

  return Array.from(finishes).sort();
}

/**
 * Get all unique sizes across all categories
 */
export function getAllMaterialSizes(): string[] {
  const sizes = new Set<string>();
  const categories = getMaterialCategories();

  categories.forEach(category => {
    MATERIAL_CATEGORIES[category].size.forEach(size => {
      sizes.add(size);
    });
  });

  return Array.from(sizes).sort();
}

/**
 * Get all unique installation methods across all categories
 */
export function getAllMaterialInstallationMethods(): string[] {
  const methods = new Set<string>();
  const categories = getMaterialCategories();

  categories.forEach(category => {
    MATERIAL_CATEGORIES[category].installationMethod.forEach(method => {
      methods.add(method);
    });
  });

  return Array.from(methods).sort();
}

/**
 * Get all unique applications across all categories
 */
export function getAllMaterialApplications(): string[] {
  const applications = new Set<string>();
  const categories = getMaterialCategories();

  categories.forEach(category => {
    MATERIAL_CATEGORIES[category].application.forEach(application => {
      applications.add(application);
    });
  });

  return Array.from(applications).sort();
}

/**
 * Represents a mood board for material inspiration
 */
export interface MoodBoard {
  /** Unique identifier for the mood board */
  id: string;
  /** Name of the mood board */
  name: string;
  /** Description of the mood board theme */
  description?: string;
  /** Array of material IDs included in the mood board */
  materialIds: string[];
  /** Array of material objects (populated when needed) */
  materials?: Material[];
  /** Color palette for the mood board */
  colorPalette?: string[];
  /** Tags for categorization */
  tags?: string[];
  /** Whether the mood board is public */
  isPublic: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** ID of the user who created the mood board */
  createdBy: string;
  /** Thumbnail image URL */
  thumbnailUrl?: string;
}
