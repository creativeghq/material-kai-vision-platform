/**
 * Image Validation Types
 * TypeScript interfaces for image validation database schema
 *
 * Tables:
 * - image_validations: Image quality validation results
 */

/**
 * Image Validation Status Types
 */
export type ImageValidationStatus = 'pending' | 'valid' | 'invalid' | 'needs_review';

/**
 * Image Quality Metrics
 */
export interface ImageQualityMetrics {
  blur_score?: number; // 0-1, lower is better
  contrast_score?: number; // 0-1, higher is better
  brightness_score?: number; // 0-1, optimal range
  sharpness_score?: number; // 0-1, higher is better
  noise_level?: number; // 0-1, lower is better
}

/**
 * Image Validation Issue
 */
export interface ImageValidationIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion?: string;
}

/**
 * Image Validation Recommendation
 */
export interface ImageValidationRecommendation {
  type: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  action?: string;
}

/**
 * Image Validation Result
 */
export interface ImageValidation {
  id: string;
  image_id: string;
  workspace_id?: string;
  validation_status: ImageValidationStatus;
  quality_score: number; // 0-1, overall quality
  dimensions_valid: boolean;
  format_valid: boolean;
  file_size_valid: boolean;
  ocr_confidence?: number; // 0-1
  relevance_score?: number; // 0-1
  quality_metrics?: ImageQualityMetrics;
  issues?: ImageValidationIssue[];
  recommendations?: ImageValidationRecommendation[];
  validated_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Image Validation Insert
 */
export interface ImageValidationInsert {
  image_id: string;
  workspace_id?: string;
  validation_status?: ImageValidationStatus;
  quality_score: number;
  dimensions_valid?: boolean;
  format_valid?: boolean;
  file_size_valid?: boolean;
  ocr_confidence?: number;
  relevance_score?: number;
  quality_metrics?: ImageQualityMetrics;
  issues?: ImageValidationIssue[];
  recommendations?: ImageValidationRecommendation[];
  validated_at?: string;
}

/**
 * Image Validation Update
 */
export interface ImageValidationUpdate {
  validation_status?: ImageValidationStatus;
  quality_score?: number;
  dimensions_valid?: boolean;
  format_valid?: boolean;
  file_size_valid?: boolean;
  ocr_confidence?: number;
  relevance_score?: number;
  quality_metrics?: ImageQualityMetrics;
  issues?: ImageValidationIssue[];
  recommendations?: ImageValidationRecommendation[];
  validated_at?: string;
}

/**
 * Image Validation Request
 */
export interface ImageValidationRequest {
  image_id: string;
  workspace_id: string;
  validation_rules?: {
    min_width?: number;
    max_width?: number;
    min_height?: number;
    max_height?: number;
    min_quality_score?: number;
    allowed_formats?: string[];
    max_file_size?: number;
    min_ocr_confidence?: number;
  };
}

/**
 * Image Validation Response
 */
export interface ImageValidationResponse {
  validation: ImageValidation;
  passed: boolean;
  issues: ImageValidationIssue[];
  recommendations: ImageValidationRecommendation[];
}

/**
 * Batch Image Validation Request
 */
export interface BatchImageValidationRequest {
  image_ids: string[];
  workspace_id: string;
  validation_rules?: {
    min_width?: number;
    max_width?: number;
    min_height?: number;
    max_height?: number;
    min_quality_score?: number;
    allowed_formats?: string[];
    max_file_size?: number;
    min_ocr_confidence?: number;
  };
}

/**
 * Batch Image Validation Response
 */
export interface BatchImageValidationResponse {
  results: ImageValidation[];
  total: number;
  passed: number;
  failed: number;
  needs_review: number;
}

/**
 * Image Validation Statistics
 */
export interface ImageValidationStats {
  total_images: number;
  valid_images: number;
  invalid_images: number;
  needs_review_images: number;
  avg_quality_score: number;
  common_issues: Array<{
    type: string;
    count: number;
    severity: string;
  }>;
}

/**
 * Image Validation Configuration
 */
export interface ImageValidationConfig {
  min_width: number;
  max_width: number;
  min_height: number;
  max_height: number;
  min_quality_score: number;
  allowed_formats: string[];
  max_file_size: number; // in bytes
  min_ocr_confidence: number;
  blur_threshold: number;
  contrast_threshold: number;
  brightness_threshold: number;
}

/**
 * Combined Phase 2.1 Database Types
 */
export interface Phase21Database {
  image_validations: {
    Row: ImageValidation;
    Insert: ImageValidationInsert;
    Update: ImageValidationUpdate;
  };
}

