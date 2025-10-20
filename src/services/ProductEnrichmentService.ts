/**
 * Product Enrichment Service
 * Enriches chunks with product metadata and descriptions
 */

import { supabase } from '@/integrations/supabase/client';
import {
  ProductEnrichment,
  ProductEnrichmentInsert,
  ProductEnrichmentUpdate,
  ProductEnrichmentRequest,
  ProductEnrichmentResponse,
  BatchProductEnrichmentRequest,
  BatchProductEnrichmentResponse,
  ProductEnrichmentStats,
  ProductEnrichmentConfig,
  ProductEnrichmentStatus,
  ProductCategory,
} from '@/types/product-enrichment';

import { BaseService, ServiceConfig } from './base/BaseService';

/**
 * Product Enrichment Service Configuration
 */
interface ProductEnrichmentServiceConfig extends ServiceConfig {
  defaultConfig: ProductEnrichmentConfig;
}

/**
 * Product Enrichment Service
 * Enriches chunks with product metadata, descriptions, and related products
 */
export class ProductEnrichmentService extends BaseService<ProductEnrichmentServiceConfig> {
  private defaultConfig: ProductEnrichmentConfig;

  constructor() {
    super({
      name: 'ProductEnrichmentService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
      timeout: 30000,
      retries: 2,
      defaultConfig: {
        extract_metadata: true,
        extract_specifications: true,
        find_related_products: true,
        link_images: true,
        generate_descriptions: true,
        min_confidence_score: 0.6,
        max_related_products: 5,
        max_specifications: 10,
        max_images_per_product: 5,
      },
    });
    this.defaultConfig = this.config.defaultConfig;
  }

  /**
   * Initialize service
   */
  protected async doInitialize(): Promise<void> {
    console.log('ProductEnrichmentService initialized');
  }

  /**
   * Enrich a single chunk with product data
   */
  async enrichChunk(request: ProductEnrichmentRequest): Promise<ProductEnrichmentResponse> {
    return this.executeOperation(async () => {
      // Get chunk data
      const { data: chunkData, error: chunkError } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('id', request.chunk_id)
        .single();

      if (chunkError || !chunkData) {
        throw new Error(`Chunk not found: ${request.chunk_id}`);
      }

      // Merge enrichment rules
      const rules = { ...this.defaultConfig, ...request.enrichment_rules };

      // Extract product information
      const productName = this.extractProductName(request.chunk_content);
      const productCategory = this.extractProductCategory(request.chunk_content);
      const productDescription = this.extractProductDescription(request.chunk_content);
      const metadata = rules.extract_metadata ? this.extractMetadata(request.chunk_content) : undefined;
      const specifications = rules.extract_specifications ? this.extractSpecifications(request.chunk_content) : undefined;
      const relatedProducts = rules.find_related_products ? this.findRelatedProducts(request.chunk_content, rules.max_related_products) : undefined;
      const imageReferences = rules.link_images ? this.linkImages(request.related_images || []) : undefined;

      // Calculate enrichment score
      const enrichmentScore = this.calculateEnrichmentScore(
        productName,
        productDescription,
        metadata,
        specifications,
        imageReferences,
      );

      // Determine enrichment status
      const enrichmentStatus = this.determineEnrichmentStatus(enrichmentScore, rules.min_confidence_score);

      // Create enrichment record
      const enrichmentInsert: ProductEnrichmentInsert = {
        chunk_id: request.chunk_id,
        workspace_id: request.workspace_id,
        enrichment_status: enrichmentStatus,
        product_name: productName,
        product_category: productCategory,
        product_description: productDescription,
        metadata,
        specifications,
        related_products: relatedProducts,
        image_references: imageReferences,
        confidence_score: enrichmentScore,
        enrichment_score: enrichmentScore,
        enriched_at: new Date().toISOString(),
      };

      // Insert enrichment record
      const { data: enrichment, error: insertError } = await supabase
        .from('product_enrichments')
        .insert([enrichmentInsert])
        .select()
        .single();

      if (insertError || !enrichment) {
        throw new Error(`Failed to insert enrichment: ${insertError?.message}`);
      }

      return {
        enrichment: enrichment as ProductEnrichment,
        success: enrichmentStatus === 'enriched',
        issues: enrichment.issues || [],
        recommendations: enrichment.recommendations || [],
      };
    }, 'enrichChunk');
  }

  /**
   * Enrich multiple chunks
   */
  async enrichChunks(request: BatchProductEnrichmentRequest): Promise<BatchProductEnrichmentResponse> {
    return this.executeOperation(async () => {
      // Get all chunks
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('*')
        .in('id', request.chunk_ids);

      if (chunksError || !chunks) {
        throw new Error(`Failed to fetch chunks: ${chunksError?.message}`);
      }

      const results: ProductEnrichment[] = [];
      let enriched = 0;
      let failed = 0;
      let needsReview = 0;

      for (const chunk of chunks) {
        try {
          const response = await this.enrichChunk({
            chunk_id: chunk.id,
            workspace_id: request.workspace_id,
            chunk_content: chunk.content,
            enrichment_rules: request.enrichment_rules,
          });

          results.push(response.enrichment);

          if (response.enrichment.enrichment_status === 'enriched') {
            enriched++;
          } else if (response.enrichment.enrichment_status === 'needs_review') {
            needsReview++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`Error enriching chunk ${chunk.id}:`, error);
          failed++;
        }
      }

      return {
        results,
        total: request.chunk_ids.length,
        enriched,
        failed,
        needs_review: needsReview,
      };
    }, 'enrichChunks');
  }

  /**
   * Get enrichments needing review
   */
  async getEnrichmentsNeedingReview(workspaceId: string): Promise<ProductEnrichment[]> {
    return this.executeOperation(async () => {
      const { data, error } = await supabase
        .from('product_enrichments')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('enrichment_status', 'needs_review')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch enrichments needing review: ${error.message}`);
      }

      return (data || []) as ProductEnrichment[];
    }, 'getEnrichmentsNeedingReview');
  }

  /**
   * Get enrichment statistics
   */
  async getEnrichmentStats(workspaceId: string): Promise<ProductEnrichmentStats> {
    return this.executeOperation(async () => {
      const { data, error } = await supabase
        .from('product_enrichments')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) {
        throw new Error(`Failed to fetch enrichment stats: ${error.message}`);
      }

      const enrichments = (data || []) as ProductEnrichment[];
      const stats: ProductEnrichmentStats = {
        total_enrichments: enrichments.length,
        enriched_count: enrichments.filter(e => e.enrichment_status === 'enriched').length,
        failed_count: enrichments.filter(e => e.enrichment_status === 'failed').length,
        needs_review_count: enrichments.filter(e => e.enrichment_status === 'needs_review').length,
        avg_confidence_score: enrichments.reduce((sum, e) => sum + (e.confidence_score || 0), 0) / enrichments.length || 0,
        avg_enrichment_score: enrichments.reduce((sum, e) => sum + (e.enrichment_score || 0), 0) / enrichments.length || 0,
        categories_distribution: this.getCategoriesDistribution(enrichments),
        common_issues: this.getCommonIssues(enrichments),
      };

      return stats;
    }, 'getEnrichmentStats');
  }

  /**
   * Private helper methods
   */

  private extractProductName(content: string): string | undefined {
    const nameMatch = content.match(/(?:product|item|model)[\s:]*([^\n.]+)/i);
    return nameMatch ? nameMatch[1].trim() : undefined;
  }

  private extractProductCategory(content: string): ProductCategory | undefined {
    const categories: ProductCategory[] = [
      'electronics',
      'furniture',
      'clothing',
      'food',
      'books',
      'tools',
      'home',
      'sports',
    ];

    for (const category of categories) {
      if (content.toLowerCase().includes(category)) {
        return category;
      }
    }

    return 'other';
  }

  private extractProductDescription(content: string): string | undefined {
    const lines = content.split('\n');
    return lines.slice(0, 3).join(' ').substring(0, 500);
  }

  private extractMetadata(content: string) {
    return {
      sku: this.extractField(content, /sku[\s:]*([^\n]+)/i),
      brand: this.extractField(content, /brand[\s:]*([^\n]+)/i),
      model: this.extractField(content, /model[\s:]*([^\n]+)/i),
      color: this.extractField(content, /color[\s:]*([^\n]+)/i),
      size: this.extractField(content, /size[\s:]*([^\n]+)/i),
    };
  }

  private extractSpecifications(content: string) {
    const specs = [];
    const specPattern = /([^:]+):\s*([^\n]+)/g;
    let match;

    while ((match = specPattern.exec(content)) && specs.length < 10) {
      specs.push({
        name: match[1].trim(),
        value: match[2].trim(),
      });
    }

    return specs.length > 0 ? specs : undefined;
  }

  private findRelatedProducts(content: string, maxCount: number): string[] | undefined {
    const products = [];
    const productPattern = /(?:also|related|similar)[\s:]*([^\n]+)/gi;
    let match;

    while ((match = productPattern.exec(content)) && products.length < maxCount) {
      products.push(match[1].trim());
    }

    return products.length > 0 ? products : undefined;
  }

  private linkImages(imageIds: string[]) {
    return imageIds.slice(0, 5).map((id, index) => ({
      image_id: id,
      is_primary: index === 0,
      relevance_score: 1 - index * 0.1,
    }));
  }

  private calculateEnrichmentScore(
    productName: string | undefined,
    description: string | undefined,
    metadata: any,
    specifications: any,
    images: any,
  ): number {
    let score = 0;
    let maxScore = 0;

    if (productName) {
      score += 0.3;
    }
    maxScore += 0.3;

    if (description) {
      score += 0.2;
    }
    maxScore += 0.2;

    if (metadata && Object.keys(metadata).length > 0) {
      score += 0.2;
    }
    maxScore += 0.2;

    if (specifications && specifications.length > 0) {
      score += 0.15;
    }
    maxScore += 0.15;

    if (images && images.length > 0) {
      score += 0.15;
    }
    maxScore += 0.15;

    return maxScore > 0 ? Math.min(1, score / maxScore) : 0;
  }

  private determineEnrichmentStatus(score: number, minScore: number): ProductEnrichmentStatus {
    if (score >= minScore) {
      return 'enriched';
    } else if (score >= minScore * 0.7) {
      return 'needs_review';
    } else {
      return 'failed';
    }
  }

  private extractField(content: string, pattern: RegExp): string | undefined {
    const match = content.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private getCategoriesDistribution(enrichments: ProductEnrichment[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    enrichments.forEach(e => {
      const category = e.product_category || 'other';
      distribution[category] = (distribution[category] || 0) + 1;
    });

    return distribution;
  }

  private getCommonIssues(enrichments: ProductEnrichment[]): Array<{
    type: string;
    count: number;
    severity: string;
  }> {
    const issueMap = new Map<string, { count: number; severity: string }>();

    enrichments.forEach(enrichment => {
      enrichment.issues?.forEach(issue => {
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
export const productEnrichmentService = new ProductEnrichmentService();

