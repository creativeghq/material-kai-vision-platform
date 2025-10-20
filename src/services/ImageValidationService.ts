/**
 * Image Validation Service
 * Validates extracted images and ensures quality standards
 */

import { supabase } from '@/integrations/supabase/client';
import { BaseService, ServiceConfig } from './base/BaseService';
import {
  ImageValidation,
  ImageValidationInsert,
  ImageValidationUpdate,
  ImageValidationRequest,
  ImageValidationResponse,
  BatchImageValidationRequest,
  BatchImageValidationResponse,
  ImageValidationStats,
  ImageValidationConfig,
  ImageValidationStatus,
  ImageValidationIssue,
  ImageValidationRecommendation,
} from '@/types/image-validation';

/**
 * Image Validation Service Configuration
 */
interface ImageValidationServiceConfig extends ServiceConfig {
  defaultConfig: ImageValidationConfig;
}

/**
 * Image Validation Service
 * Validates image quality, dimensions, format, and relevance
 */
export class ImageValidationService extends BaseService<ImageValidationServiceConfig> {
  private defaultConfig: ImageValidationConfig;

  constructor() {
    super({
      name: 'ImageValidationService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
      timeout: 30000,
      retries: 2,
      defaultConfig: {
        min_width: 100,
        max_width: 4000,
        min_height: 100,
        max_height: 4000,
        min_quality_score: 0.6,
        allowed_formats: ['image/png', 'image/jpeg', 'image/webp'],
        max_file_size: 10 * 1024 * 1024, // 10MB
        min_ocr_confidence: 0.5,
        blur_threshold: 0.3,
        contrast_threshold: 0.3,
        brightness_threshold: 0.3,
      },
    });
    this.defaultConfig = this.config.defaultConfig;
  }

  /**
   * Initialize service
   */
  protected async doInitialize(): Promise<void> {
    console.log('ImageValidationService initialized');
  }

  /**
   * Validate a single image
   */
  async validateImage(request: ImageValidationRequest): Promise<ImageValidationResponse> {
    return this.executeOperation(async () => {
      // Get image metadata from database
      const { data: imageData, error: imageError } = await supabase
        .from('document_images')
        .select('*')
        .eq('id', request.image_id)
        .single();

      if (imageError || !imageData) {
        throw new Error(`Image not found: ${request.image_id}`);
      }

      // Merge validation rules
      const rules = { ...this.defaultConfig, ...request.validation_rules };

      // Perform validation checks
      const issues: ImageValidationIssue[] = [];
      const recommendations: ImageValidationRecommendation[] = [];
      let qualityScore = 1.0;

      // Check dimensions
      const dimensionsValid = this.validateDimensions(imageData, rules, issues);

      // Check format
      const formatValid = this.validateFormat(imageData, rules, issues);

      // Check file size
      const fileSizeValid = this.validateFileSize(imageData, rules, issues);

      // Calculate quality score
      qualityScore = this.calculateQualityScore(imageData, issues);

      // Generate recommendations
      this.generateRecommendations(issues, recommendations);

      // Determine validation status
      const validationStatus = this.determineValidationStatus(
        issues,
        qualityScore,
        rules.min_quality_score
      );

      // Create validation record
      const validationInsert: ImageValidationInsert = {
        image_id: request.image_id,
        workspace_id: request.workspace_id,
        validation_status: validationStatus,
        quality_score: qualityScore,
        dimensions_valid: dimensionsValid,
        format_valid: formatValid,
        file_size_valid: fileSizeValid,
        issues: issues.length > 0 ? issues : undefined,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        validated_at: new Date().toISOString(),
      };

      // Insert validation record
      const { data: validation, error: insertError } = await supabase
        .from('image_validations')
        .insert([validationInsert])
        .select()
        .single();

      if (insertError || !validation) {
        throw new Error(`Failed to insert validation: ${insertError?.message}`);
      }

      return {
        validation: validation as ImageValidation,
        passed: validationStatus === 'valid',
        issues,
        recommendations,
      };
    }, 'validateImage');
  }

  /**
   * Validate multiple images
   */
  async validateImages(request: BatchImageValidationRequest): Promise<BatchImageValidationResponse> {
    return this.executeOperation(async () => {
      const results: ImageValidation[] = [];
      let passed = 0;
      let failed = 0;
      let needsReview = 0;

      for (const imageId of request.image_ids) {
        try {
          const response = await this.validateImage({
            image_id: imageId,
            workspace_id: request.workspace_id,
            validation_rules: request.validation_rules,
          });

          results.push(response.validation);

          if (response.validation.validation_status === 'valid') {
            passed++;
          } else if (response.validation.validation_status === 'needs_review') {
            needsReview++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`Error validating image ${imageId}:`, error);
          failed++;
        }
      }

      return {
        results,
        total: request.image_ids.length,
        passed,
        failed,
        needs_review: needsReview,
      };
    }, 'validateImages');
  }

  /**
   * Get images needing review
   */
  async getImagesNeedingReview(workspaceId: string): Promise<ImageValidation[]> {
    return this.executeOperation(async () => {
      const { data, error } = await supabase
        .from('image_validations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('validation_status', 'needs_review')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch images needing review: ${error.message}`);
      }

      return (data || []) as ImageValidation[];
    }, 'getImagesNeedingReview');
  }

  /**
   * Get validation statistics
   */
  async getValidationStats(workspaceId: string): Promise<ImageValidationStats> {
    return this.executeOperation(async () => {
      const { data, error } = await supabase
        .from('image_validations')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) {
        throw new Error(`Failed to fetch validation stats: ${error.message}`);
      }

      const validations = (data || []) as ImageValidation[];
      const stats: ImageValidationStats = {
        total_images: validations.length,
        valid_images: validations.filter(v => v.validation_status === 'valid').length,
        invalid_images: validations.filter(v => v.validation_status === 'invalid').length,
        needs_review_images: validations.filter(v => v.validation_status === 'needs_review').length,
        avg_quality_score: validations.reduce((sum, v) => sum + v.quality_score, 0) / validations.length || 0,
        common_issues: this.getCommonIssues(validations),
      };

      return stats;
    }, 'getValidationStats');
  }

  /**
   * Private helper methods
   */

  private validateDimensions(
    imageData: any,
    rules: ImageValidationConfig,
    issues: ImageValidationIssue[]
  ): boolean {
    const width = imageData.width || 0;
    const height = imageData.height || 0;

    if (width < rules.min_width || width > rules.max_width) {
      issues.push({
        type: 'invalid_width',
        severity: 'high',
        description: `Image width ${width}px is outside allowed range (${rules.min_width}-${rules.max_width}px)`,
      });
      return false;
    }

    if (height < rules.min_height || height > rules.max_height) {
      issues.push({
        type: 'invalid_height',
        severity: 'high',
        description: `Image height ${height}px is outside allowed range (${rules.min_height}-${rules.max_height}px)`,
      });
      return false;
    }

    return true;
  }

  private validateFormat(
    imageData: any,
    rules: ImageValidationConfig,
    issues: ImageValidationIssue[]
  ): boolean {
    const format = imageData.mime_type || '';

    if (!rules.allowed_formats.includes(format)) {
      issues.push({
        type: 'invalid_format',
        severity: 'high',
        description: `Image format ${format} is not allowed. Allowed formats: ${rules.allowed_formats.join(', ')}`,
      });
      return false;
    }

    return true;
  }

  private validateFileSize(
    imageData: any,
    rules: ImageValidationConfig,
    issues: ImageValidationIssue[]
  ): boolean {
    const fileSize = imageData.file_size || 0;

    if (fileSize > rules.max_file_size) {
      issues.push({
        type: 'file_too_large',
        severity: 'medium',
        description: `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum of ${(rules.max_file_size / 1024 / 1024).toFixed(2)}MB`,
      });
      return false;
    }

    return true;
  }

  private calculateQualityScore(imageData: any, issues: ImageValidationIssue[]): number {
    let score = 1.0;

    // Deduct points for each issue
    issues.forEach(issue => {
      if (issue.severity === 'high') {
        score -= 0.3;
      } else if (issue.severity === 'medium') {
        score -= 0.15;
      } else {
        score -= 0.05;
      }
    });

    return Math.max(0, Math.min(1, score));
  }

  private generateRecommendations(
    issues: ImageValidationIssue[],
    recommendations: ImageValidationRecommendation[]
  ): void {
    issues.forEach(issue => {
      if (issue.type === 'invalid_width' || issue.type === 'invalid_height') {
        recommendations.push({
          type: 'resize_image',
          description: 'Resize image to meet dimension requirements',
          priority: 'high',
          action: 'resize',
        });
      } else if (issue.type === 'invalid_format') {
        recommendations.push({
          type: 'convert_format',
          description: 'Convert image to supported format (PNG, JPEG, or WebP)',
          priority: 'high',
          action: 'convert',
        });
      } else if (issue.type === 'file_too_large') {
        recommendations.push({
          type: 'compress_image',
          description: 'Compress image to reduce file size',
          priority: 'medium',
          action: 'compress',
        });
      }
    });
  }

  private determineValidationStatus(
    issues: ImageValidationIssue[],
    qualityScore: number,
    minQualityScore: number
  ): ImageValidationStatus {
    const criticalIssues = issues.filter(i => i.severity === 'high');

    if (criticalIssues.length > 0) {
      return 'invalid';
    }

    if (qualityScore < minQualityScore) {
      return 'needs_review';
    }

    return 'valid';
  }

  private getCommonIssues(validations: ImageValidation[]): Array<{
    type: string;
    count: number;
    severity: string;
  }> {
    const issueMap = new Map<string, { count: number; severity: string }>();

    validations.forEach(validation => {
      validation.issues?.forEach(issue => {
        const key = issue.type;
        const existing = issueMap.get(key);
        issueMap.set(key, {
          count: (existing?.count || 0) + 1,
          severity: issue.severity,
        });
      });
    });

    return Array.from(issueMap.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        severity: data.severity,
      }))
      .sort((a, b) => b.count - a.count);
  }
}

/**
 * Export singleton instance
 */
export const imageValidationService = new ImageValidationService();

