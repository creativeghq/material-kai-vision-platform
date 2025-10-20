/**
 * Chunk Analysis Types
 * TypeScript interfaces for chunk analysis database schema
 *
 * Tables:
 * - chunk_classifications: Content type classification results
 * - chunk_boundaries: Semantic boundary detection results
 * - chunk_validation_scores: Quality metrics and validation status
 */

/**
 * Content Classification Types
 */
export type ContentType =
  | "product"
  | "specification"
  | "introduction"
  | "legal_disclaimer"
  | "technical_detail"
  | "marketing"
  | "other";

export interface ChunkClassification {
  id: string;
  chunk_id: string;
  workspace_id?: string;
  content_type: ContentType;
  confidence: number; // 0-1
  reasoning?: string;
  sub_categories?: string[];
  model_name: string;
  model_version?: string;
  processing_time_ms?: number;
  processed_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChunkClassificationInsert {
  chunk_id: string;
  workspace_id?: string;
  content_type: ContentType;
  confidence: number;
  reasoning?: string;
  sub_categories?: string[];
  model_name?: string;
  model_version?: string;
  processing_time_ms?: number;
  processed_at?: string;
}

export interface ChunkClassificationUpdate {
  content_type?: ContentType;
  confidence?: number;
  reasoning?: string;
  sub_categories?: string[];
  model_name?: string;
  model_version?: string;
  processing_time_ms?: number;
  processed_at?: string;
}

/**
 * Boundary Detection Types
 */
export type BoundaryType = "sentence" | "paragraph" | "section" | "semantic" | "weak";

export interface ChunkBoundary {
  id: string;
  chunk_id: string;
  next_chunk_id?: string;
  workspace_id?: string;
  boundary_score: number; // 0-1
  boundary_type: BoundaryType;
  semantic_similarity?: number; // 0-1
  is_product_boundary: boolean;
  reasoning?: string;
  model_name: string;
  model_version?: string;
  embedding_dimensions: number;
  processing_time_ms?: number;
  processed_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChunkBoundaryInsert {
  chunk_id: string;
  next_chunk_id?: string;
  workspace_id?: string;
  boundary_score: number;
  boundary_type: BoundaryType;
  semantic_similarity?: number;
  is_product_boundary?: boolean;
  reasoning?: string;
  model_name?: string;
  model_version?: string;
  embedding_dimensions?: number;
  processing_time_ms?: number;
  processed_at?: string;
}

export interface ChunkBoundaryUpdate {
  boundary_score?: number;
  boundary_type?: BoundaryType;
  semantic_similarity?: number;
  is_product_boundary?: boolean;
  reasoning?: string;
  model_name?: string;
  model_version?: string;
  embedding_dimensions?: number;
  processing_time_ms?: number;
  processed_at?: string;
}

/**
 * Validation Score Types
 */
export type ValidationStatus = "pending" | "validated" | "needs_review" | "rejected";

export interface ValidationIssue {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface ValidationRecommendation {
  type: string;
  description: string;
  priority: "low" | "medium" | "high";
}

export interface ChunkValidationScore {
  id: string;
  chunk_id: string;
  workspace_id?: string;
  content_quality_score?: number; // 0-1
  boundary_quality_score?: number; // 0-1
  semantic_coherence_score?: number; // 0-1
  completeness_score?: number; // 0-1
  overall_validation_score: number; // 0-1
  validation_status: ValidationStatus;
  validation_notes?: string;
  issues?: ValidationIssue[];
  recommendations?: ValidationRecommendation[];
  validator_model: string;
  model_version?: string;
  processing_time_ms?: number;
  validated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChunkValidationScoreInsert {
  chunk_id: string;
  workspace_id?: string;
  content_quality_score?: number;
  boundary_quality_score?: number;
  semantic_coherence_score?: number;
  completeness_score?: number;
  overall_validation_score: number;
  validation_status?: ValidationStatus;
  validation_notes?: string;
  issues?: ValidationIssue[];
  recommendations?: ValidationRecommendation[];
  validator_model?: string;
  model_version?: string;
  processing_time_ms?: number;
  validated_at?: string;
}

export interface ChunkValidationScoreUpdate {
  content_quality_score?: number;
  boundary_quality_score?: number;
  semantic_coherence_score?: number;
  completeness_score?: number;
  overall_validation_score?: number;
  validation_status?: ValidationStatus;
  validation_notes?: string;
  issues?: ValidationIssue[];
  recommendations?: ValidationRecommendation[];
  validator_model?: string;
  model_version?: string;
  processing_time_ms?: number;
  validated_at?: string;
}

/**
 * Combined Phase 1 Database Types
 */
export interface Phase1Database {
  chunk_classifications: {
    Row: ChunkClassification;
    Insert: ChunkClassificationInsert;
    Update: ChunkClassificationUpdate;
  };
  chunk_boundaries: {
    Row: ChunkBoundary;
    Insert: ChunkBoundaryInsert;
    Update: ChunkBoundaryUpdate;
  };
  chunk_validation_scores: {
    Row: ChunkValidationScore;
    Insert: ChunkValidationScoreInsert;
    Update: ChunkValidationScoreUpdate;
  };
}

/**
 * Query Result Types
 */
export interface ClassificationStats {
  content_type: ContentType;
  count: number;
  avg_confidence: number;
  min_confidence: number;
  max_confidence: number;
}

export interface BoundaryStats {
  boundary_type: BoundaryType;
  count: number;
  avg_score: number;
  product_boundaries: number;
}

export interface ValidationStats {
  validation_status: ValidationStatus;
  count: number;
  avg_score: number;
  issues_count: number;
}

