/**
 * Quality Dashboard Service
 *
 * Aggregates quality metrics from Image Validation, Product Enrichment,
 * and Validation Rules services to provide comprehensive quality insights.
 */

import { supabase } from '@/integrations/supabase/client';

import { BaseService } from './base/BaseService';
import { ImageValidationService } from './ImageValidationService';
import { ProductEnrichmentService } from './ProductEnrichmentService';
import { ValidationRulesService } from './ValidationRulesService';

export interface QualityMetrics {
  timestamp: string;
  workspace_id: string;

  // Image Validation Metrics
  total_images_validated: number;
  valid_images: number;
  invalid_images: number;
  images_needing_review: number;
  average_image_quality_score: number;

  // Product Enrichment Metrics
  total_chunks_enriched: number;
  enriched_chunks: number;
  unenriched_chunks: number;
  average_enrichment_score: number;

  // Validation Rules Metrics
  total_validations: number;
  passed_validations: number;
  failed_validations: number;
  validation_pass_rate: number;

  // Overall Quality Score
  overall_quality_score: number;
  quality_trend: 'improving' | 'stable' | 'declining';
}

export interface QualityTrend {
  date: string;
  overall_score: number;
  image_quality: number;
  enrichment_quality: number;
  validation_pass_rate: number;
}

export interface QualityIssue {
  id: string;
  type: 'image_validation' | 'enrichment' | 'validation_rule';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  affected_count: number;
  recommendation: string;
  created_at: string;
}

export interface QualityDashboardData {
  metrics: QualityMetrics;
  trends: QualityTrend[];
  issues: QualityIssue[];
  recommendations: string[];
}

class QualityDashboardServiceImpl extends BaseService {
  private imageValidationService: ImageValidationService;
  private productEnrichmentService: ProductEnrichmentService;
  private validationRulesService: ValidationRulesService;

  constructor() {
    super({
      name: 'QualityDashboardService',
      version: '1.0.0',
      environment: process.env.NODE_ENV as 'development' | 'production' | 'test' || 'development',
      enabled: true,
      timeout: 30000,
    });

    this.imageValidationService = ImageValidationService.getInstance();
    this.productEnrichmentService = ProductEnrichmentService.getInstance();
    this.validationRulesService = ValidationRulesService.getInstance();
  }

  protected async doHealthCheck(): Promise<void> {
    // Health check implementation
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    // Initialize dependent services
    await this.imageValidationService.initialize();
    await this.productEnrichmentService.initialize();
    await this.validationRulesService.initialize();
  }

  /**
   * Get comprehensive quality metrics for a workspace
   */
  async getQualityMetrics(workspaceId: string): Promise<QualityMetrics> {
    return this.executeOperation(async () => {
      // Get image validation stats
      const imageStats = await this.imageValidationService.getValidationStats(workspaceId);

      // Get product enrichment stats
      const enrichmentStats = await this.productEnrichmentService.getEnrichmentStats(workspaceId);

      // Get validation rules stats
      const validationStats = await this.validationRulesService.getValidationStats(workspaceId);

      // Calculate overall quality score (weighted average)
      const imageQualityWeight = 0.3;
      const enrichmentQualityWeight = 0.35;
      const validationQualityWeight = 0.35;

      const imageQualityScore = imageStats.total_images > 0
        ? imageStats.valid_images / imageStats.total_images
        : 0;

      const enrichmentQualityScore = (enrichmentStats as any).total_chunks > 0
        ? (enrichmentStats as any).enriched_chunks / (enrichmentStats as any).total_chunks
        : 0;

      const overallQualityScore =
        (imageQualityScore * imageQualityWeight) +
        (enrichmentQualityScore * enrichmentQualityWeight) +
        (validationStats.pass_rate * validationQualityWeight);

      const metrics: QualityMetrics = {
        timestamp: new Date().toISOString(),
        workspace_id: workspaceId,
        total_images_validated: imageStats.total_images,
        valid_images: imageStats.valid_images,
        invalid_images: imageStats.invalid_images,
        images_needing_review: (imageStats as any).needs_review || 0,
        average_image_quality_score: (imageStats as any).avg_quality_score || imageStats.avg_quality_score,
        total_chunks_enriched: (enrichmentStats as any).total_chunks || 0,
        enriched_chunks: enrichmentStats.enriched_count,
        unenriched_chunks: (enrichmentStats as any).unenriched_chunks || 0,
        average_enrichment_score: enrichmentStats.avg_enrichment_score,
        total_validations: validationStats.total_validations,
        passed_validations: validationStats.passed_validations,
        failed_validations: validationStats.failed_validations,
        validation_pass_rate: validationStats.pass_rate,
        overall_quality_score: overallQualityScore,
        quality_trend: this.calculateTrend(overallQualityScore),
      };

      return metrics;
    }, 'getQualityMetrics');
  }

  /**
   * Get quality trends over time
   */
  async getQualityTrends(workspaceId: string, days: number = 30): Promise<QualityTrend[]> {
    return this.executeOperation(async () => {
      const { data, error } = await supabase
        .from('quality_metrics')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch quality trends: ${error.message}`);
      }

      return (data || []).map(row => ({
        date: row.created_at,
        overall_score: row.overall_quality_score,
        image_quality: row.average_image_quality_score,
        enrichment_quality: row.average_enrichment_score,
        validation_pass_rate: row.validation_pass_rate,
      }));
    }, 'getQualityTrends');
  }

  /**
   * Get quality issues and recommendations
   */
  async getQualityIssues(workspaceId: string): Promise<QualityIssue[]> {
    return this.executeOperation(async () => {
      const metrics = await this.getQualityMetrics(workspaceId);
      const issues: QualityIssue[] = [];

      // Check image validation issues
      if (metrics.invalid_images > metrics.valid_images * 0.1) {
        issues.push({
          id: `img-${Date.now()}`,
          type: 'image_validation',
          severity: 'warning',
          title: 'High Invalid Image Rate',
          description: `${metrics.invalid_images} images failed validation`,
          affected_count: metrics.invalid_images,
          recommendation: 'Review image validation rules and improve source image quality',
          created_at: new Date().toISOString(),
        });
      }

      // Check enrichment issues
      if (metrics.unenriched_chunks > metrics.enriched_chunks * 0.2) {
        issues.push({
          id: `enr-${Date.now()}`,
          type: 'enrichment',
          severity: 'warning',
          title: 'Low Enrichment Coverage',
          description: `${metrics.unenriched_chunks} chunks not enriched`,
          affected_count: metrics.unenriched_chunks,
          recommendation: 'Improve enrichment rules and content quality',
          created_at: new Date().toISOString(),
        });
      }

      // Check validation issues
      if (metrics.validation_pass_rate < 0.8) {
        issues.push({
          id: `val-${Date.now()}`,
          type: 'validation_rule',
          severity: 'error',
          title: 'Low Validation Pass Rate',
          description: `Only ${(metrics.validation_pass_rate * 100).toFixed(1)}% of validations passed`,
          affected_count: metrics.failed_validations,
          recommendation: 'Review validation rules and adjust thresholds',
          created_at: new Date().toISOString(),
        });
      }

      return issues;
    }, 'getQualityIssues');
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(workspaceId: string): Promise<QualityDashboardData> {
    return this.executeOperation(async () => {
      const [metrics, trends, issues] = await Promise.all([
        this.getQualityMetrics(workspaceId),
        this.getQualityTrends(workspaceId),
        this.getQualityIssues(workspaceId),
      ]);

      const recommendations = this.generateRecommendations(metrics, issues);

      return {
        metrics,
        trends,
        issues,
        recommendations,
      };
    }, 'getDashboardData');
  }

  /**
   * Private helper methods
   */

  private calculateTrend(score: number): 'improving' | 'stable' | 'declining' {
    // This would be enhanced with historical data
    if (score > 0.8) return 'improving';
    if (score < 0.6) return 'declining';
    return 'stable';
  }

  private generateRecommendations(metrics: QualityMetrics, issues: QualityIssue[]): string[] {
    const recommendations: string[] = [];

    if (metrics.average_image_quality_score < 0.7) {
      recommendations.push('Improve image quality by enforcing stricter validation rules');
    }

    if (metrics.average_enrichment_score < 0.7) {
      recommendations.push('Enhance product enrichment with better metadata extraction');
    }

    if (metrics.validation_pass_rate < 0.8) {
      recommendations.push('Review and adjust validation rule thresholds');
    }

    if (issues.length > 0) {
      recommendations.push(`Address ${issues.length} identified quality issues`);
    }

    return recommendations;
  }
}

export const QualityDashboardService = QualityDashboardServiceImpl;

