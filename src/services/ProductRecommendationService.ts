/**
 * Product Recommendation Service
 *
 * Provides AI-powered product recommendations based on quality metrics,
 * user preferences, and enrichment data.
 */

import { supabase } from '@/integrations/supabase/client';

import { BaseService } from './base/BaseService';
import { QualityDashboardService } from './QualityDashboardService';

export interface ProductRecommendation {
  id: string;
  product_id: string;
  product_name: string;
  category: string;
  confidence_score: number;
  reason: string;
  quality_metrics: {
    image_quality: number;
    enrichment_quality: number;
    validation_score: number;
  };
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RecommendationRequest {
  workspace_id: string;
  user_preferences?: string[];
  limit?: number;
  min_confidence?: number;
}

export interface RecommendationResponse {
  recommendations: ProductRecommendation[];
  total_count: number;
  generation_time_ms: number;
}

class ProductRecommendationServiceImpl extends BaseService {
  private qualityDashboardService: any;

  constructor() {
    super({
      name: 'ProductRecommendationService',
      version: '1.0.0',
      environment: process.env.NODE_ENV as 'development' | 'production' | 'test' || 'development',
      enabled: true,
      timeout: 30000,
    });

    this.qualityDashboardService = (QualityDashboardService as any).getInstance();
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    await this.qualityDashboardService.initialize();
  }

  /**
   * Health check for the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Verify quality dashboard service is healthy
    const health = await this.qualityDashboardService.getHealth();
    if (health.status !== 'healthy') {
      throw new Error('Quality Dashboard Service is not healthy');
    }
  }

  /**
   * Get product recommendations for a workspace
   */
  async getRecommendations(request: RecommendationRequest): Promise<RecommendationResponse> {
    return this.executeOperation(async () => {
      const startTime = Date.now();
      const limit = request.limit || 10;
      const minConfidence = request.min_confidence || 0.7;

      // Get quality metrics to inform recommendations
      const metrics = await this.qualityDashboardService.getQualityMetrics(request.workspace_id);

      // Fetch high-quality products from database
      const { data: products, error } = await supabase
        .from('product_enrichments')
        .select('*')
        .eq('workspace_id', request.workspace_id)
        .gte('enrichment_score', minConfidence)
        .order('enrichment_score', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch products: ${error.message}`);
      }

      // Generate recommendations with quality-based scoring
      const recommendations: ProductRecommendation[] = (products || []).map(product => ({
        id: `rec-${product.id}`,
        product_id: product.id,
        product_name: product.product_name,
        category: product.product_category,
        confidence_score: this.calculateConfidenceScore(product, metrics),
        reason: this.generateRecommendationReason(product, metrics),
        quality_metrics: {
          image_quality: metrics.average_image_quality_score,
          enrichment_quality: metrics.average_enrichment_score,
          validation_score: metrics.validation_pass_rate,
        },
        metadata: product.metadata || {},
        created_at: new Date().toISOString(),
      }));

      const generationTime = Date.now() - startTime;

      return {
        recommendations,
        total_count: recommendations.length,
        generation_time_ms: generationTime,
      };
    }, 'getRecommendations');
  }

  /**
   * Get personalized recommendations based on user preferences
   */
  async getPersonalizedRecommendations(
    workspaceId: string,
    userPreferences: string[],
    limit: number = 10,
  ): Promise<ProductRecommendation[]> {
    return this.executeOperation(async () => {
      const { data: products, error } = await supabase
        .from('product_enrichments')
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('product_category', userPreferences)
        .order('enrichment_score', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch personalized recommendations: ${error.message}`);
      }

      const metrics = await this.qualityDashboardService.getQualityMetrics(workspaceId);

      return (products || []).map(product => ({
        id: `rec-${product.id}`,
        product_id: product.id,
        product_name: product.product_name,
        category: product.product_category,
        confidence_score: this.calculateConfidenceScore(product, metrics),
        reason: this.generateRecommendationReason(product, metrics),
        quality_metrics: {
          image_quality: metrics.average_image_quality_score,
          enrichment_quality: metrics.average_enrichment_score,
          validation_score: metrics.validation_pass_rate,
        },
        metadata: product.metadata || {},
        created_at: new Date().toISOString(),
      }));
    }, 'getPersonalizedRecommendations');
  }

  /**
   * Get trending products based on quality and engagement
   */
  async getTrendingProducts(workspaceId: string, limit: number = 10): Promise<ProductRecommendation[]> {
    return this.executeOperation(async () => {
      const { data: products, error } = await supabase
        .from('product_enrichments')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('enrichment_score', 0.75)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch trending products: ${error.message}`);
      }

      const metrics = await this.qualityDashboardService.getQualityMetrics(workspaceId);

      return (products || []).map(product => ({
        id: `rec-${product.id}`,
        product_id: product.id,
        product_name: product.product_name,
        category: product.product_category,
        confidence_score: this.calculateConfidenceScore(product, metrics),
        reason: 'Trending product with high quality metrics',
        quality_metrics: {
          image_quality: metrics.average_image_quality_score,
          enrichment_quality: metrics.average_enrichment_score,
          validation_score: metrics.validation_pass_rate,
        },
        metadata: product.metadata || {},
        created_at: new Date().toISOString(),
      }));
    }, 'getTrendingProducts');
  }

  /**
   * Private helper methods
   */

  private calculateConfidenceScore(product: any, metrics: any): number {
    // Weighted confidence based on enrichment score and quality metrics
    const enrichmentWeight = 0.4;
    const qualityWeight = 0.3;
    const validationWeight = 0.3;

    const enrichmentScore = product.enrichment_score || 0;
    const qualityScore = metrics.average_image_quality_score || 0;
    const validationScore = metrics.validation_pass_rate || 0;

    return (
      enrichmentScore * enrichmentWeight +
      qualityScore * qualityWeight +
      validationScore * validationWeight
    );
  }

  private generateRecommendationReason(product: any, metrics: any): string {
    const reasons: string[] = [];

    if (product.enrichment_score > 0.85) {
      reasons.push('Highly enriched product data');
    }

    if (metrics.average_image_quality_score > 0.8) {
      reasons.push('Excellent image quality');
    }

    if (metrics.validation_pass_rate > 0.85) {
      reasons.push('Passes all validation checks');
    }

    if (product.metadata && Object.keys(product.metadata).length > 5) {
      reasons.push('Rich metadata available');
    }

    return reasons.length > 0
      ? reasons.join(', ')
      : 'Recommended based on quality metrics';
  }
}

export const ProductRecommendationService = ProductRecommendationServiceImpl;

