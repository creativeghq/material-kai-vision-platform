export type MaterialCategory = 
  | 'metals'
  | 'plastics'
  | 'ceramics'
  | 'composites'
  | 'textiles'
  | 'wood'
  | 'glass'
  | 'rubber'
  | 'concrete'
  | 'other';

export type DetectionMethod = 
  | 'visual'
  | 'spectral'
  | 'thermal'
  | 'ocr'
  | 'voice'
  | 'combined';

export type ProcessingStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MaterialProperties {
  density?: number;
  yield_strength?: number;
  tensile_strength?: number;
  thermal_conductivity?: number;
  flexural_modulus?: number;
  melting_point?: number;
  glass_transition?: number;
  [key: string]: any;
}

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  description?: string;
  properties: MaterialProperties;
  chemical_composition: Record<string, any>;
  safety_data: Record<string, any>;
  standards: string[];
  embedding?: number[];
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  // Legacy properties for backward compatibility
  metadata: {
    color?: string;
    finish?: string;
    size?: string;
    brand?: string;
    properties?: any;
  };
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadedFile {
  id: string;
  user_id: string;
  file_name: string;
  file_type: 'image' | 'document' | '3d_model';
  file_size: number;
  storage_path: string;
  metadata: Record<string, any>;
  upload_status: ProcessingStatus;
  created_at: string;
}

export interface RecognitionResult {
  id: string;
  file_id: string;
  material_id?: string;
  material?: Material;
  confidence_score: number;
  detection_method: DetectionMethod;
  ai_model_version?: string;
  properties_detected: Record<string, any>;
  processing_time_ms?: number;
  user_verified: boolean;
  embedding?: number[];
  created_at: string;
  verified_at?: string;
  verified_by?: string;
  // Legacy properties for backward compatibility
  materialId: string;
  name: string;
  confidence: number;
  imageUrl: string;
  metadata: {
    color?: string;
    finish?: string;
    size?: string;
    brand?: string;
    properties?: any;
  };
  processingTime: number;
}

export interface ProcessingJob {
  id: string;
  user_id: string;
  job_type: 'recognition' | '3d_reconstruction' | 'batch_analysis';
  input_data: Record<string, any>;
  status: ProcessingStatus;
  priority: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  result?: Record<string, any>;
  error_message?: string;
  processing_time_ms?: number;
}

export interface MaterialKnowledge {
  id: string;
  title: string;
  content: string;
  source_type: 'datasheet' | 'research' | 'standard' | 'user_input';
  material_ids: string[];
  embedding?: number[];
  metadata: Record<string, any>;
  relevance_score: number;
  created_at: string;
  created_by?: string;
}

export interface RecognitionRequest {
  files: File[];
  options: {
    detection_methods: DetectionMethod[];
    confidence_threshold: number;
    include_similar_materials: boolean;
    extract_properties: boolean;
  };
}

export interface RecognitionResponse {
  results: RecognitionResult[];
  processing_time_ms: number;
  suggestions: Material[];
  confidence_distribution: Record<string, number>;
}

// Material categories as both type and enum for compatibility
export const MaterialCategories = {
  METALS: 'metals',
  PLASTICS: 'plastics', 
  CERAMICS: 'ceramics',
  COMPOSITES: 'composites',
  TEXTILES: 'textiles',
  WOOD: 'wood',
  GLASS: 'glass',
  RUBBER: 'rubber',
  CONCRETE: 'concrete',
  OTHER: 'other'
} as const;

// Legacy enum for backward compatibility
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

export interface MoodBoard {
  id: string;
  userId: string;
  title: string;
  description?: string;
  isPublic: boolean;
  items: Material[];
  createdAt: Date;
  updatedAt: Date;
}