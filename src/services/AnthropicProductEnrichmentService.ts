/**
 * Anthropic Product Enrichment Service
 * Uses Claude 3.5 Sonnet to enrich product metadata and descriptions
 */

import Anthropic from '@anthropic-ai/sdk';

import { supabase } from '@/integrations/supabase/client';

import { BaseService, ServiceConfig } from './base/BaseService';

interface ProductEnrichmentRequest {
  chunk_id: string;
  chunk_content: string;
  workspace_id: string;
  existing_images?: Array<{ id: string; url: string }>;
}

interface ProductEnrichmentResult {
  chunk_id: string;
  enrichment_status: 'enriched' | 'partial' | 'failed';
  product_name: string;
  product_category: string;
  product_description: string;
  long_description: string;
  specifications: Record<string, unknown>;
  related_products: string[];
  confidence_score: number;
  processing_time_ms: number;
}

/**
 * Anthropic Product Enrichment Service
 * Uses Claude 3.5 Sonnet for advanced product enrichment
 */
export class AnthropicProductEnrichmentService extends BaseService<ServiceConfig> {
  private anthropicClient: Anthropic;
  private model: string = 'claude-3-5-sonnet-20241022';
  private maxTokens: number = 2048;

  constructor() {
    super({
      name: 'AnthropicProductEnrichmentService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
      timeout: 60000,
      retries: 2,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.anthropicClient = new Anthropic({ apiKey });
  }

  protected async doInitialize(): Promise<void> {
    console.log('AnthropicProductEnrichmentService initialized');
  }

  /**
   * Enrich a single chunk with product data using Claude
   */
  async enrichChunk(
    request: ProductEnrichmentRequest,
  ): Promise<ProductEnrichmentResult> {
    return this.executeOperation(async () => {
      const startTime = Date.now();

      // Build Claude prompt for enrichment
      const prompt = `You are an expert product analyst and technical writer. Analyze this product content and provide comprehensive enrichment:

CONTENT TO ANALYZE:
${request.chunk_content}

Provide enrichment in JSON format:
{
  "product_name": "<primary product name>",
  "product_category": "<category>",
  "product_description": "<1-2 sentence summary>",
  "long_description": "<detailed description with key features and benefits>",
  "specifications": {
    "<spec_name>": "<value>",
    "<spec_name>": "<value>"
  },
  "related_products": ["<related_product_1>", "<related_product_2>"],
  "confidence_score": <0-1>,
  "key_features": ["<feature1>", "<feature2>"],
  "use_cases": ["<use_case1>", "<use_case2>"],
  "material_composition": "<if applicable>",
  "dimensions": "<if applicable>",
  "weight": "<if applicable>"
}

Focus on:
1. Accurate product identification
2. Clear, professional descriptions
3. Comprehensive specifications
4. Related products that complement this one
5. High confidence only if information is clear`;

      // Call Claude API
      const response = await this.anthropicClient.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse response
      const responseText =
        response.content[0].type === 'text' ? response.content[0].text : '{}';
      const enrichmentData = JSON.parse(responseText);

      // Determine enrichment status
      const confidenceScore = enrichmentData.confidence_score || 0;
      const enrichmentStatus =
        confidenceScore >= 0.7
          ? 'enriched'
          : confidenceScore >= 0.4
            ? 'partial'
            : 'failed';

      // Store enrichment result in database
      const { data: enrichment, error: insertError } = await supabase
        .from('product_enrichments')
        .insert([
          {
            chunk_id: request.chunk_id,
            workspace_id: request.workspace_id,
            enrichment_status: enrichmentStatus,
            product_name: enrichmentData.product_name || '',
            product_category: enrichmentData.product_category || '',
            product_description: enrichmentData.product_description || '',
            metadata: {
              long_description: enrichmentData.long_description,
              key_features: enrichmentData.key_features,
              use_cases: enrichmentData.use_cases,
              material_composition: enrichmentData.material_composition,
              dimensions: enrichmentData.dimensions,
              weight: enrichmentData.weight,
              model_used: this.model,
            },
            specifications: enrichmentData.specifications || {},
            related_products: enrichmentData.related_products || [],
            confidence_score: confidenceScore,
            enrichment_score: confidenceScore,
            enriched_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.warn(`Failed to store enrichment: ${insertError.message}`);
      }

      return {
        chunk_id: request.chunk_id,
        enrichment_status: enrichmentStatus,
        product_name: enrichmentData.product_name || '',
        product_category: enrichmentData.product_category || '',
        product_description: enrichmentData.product_description || '',
        long_description: enrichmentData.long_description || '',
        specifications: enrichmentData.specifications || {},
        related_products: enrichmentData.related_products || [],
        confidence_score: confidenceScore,
        processing_time_ms: Date.now() - startTime,
      };
    }, 'enrichChunk');
  }

  /**
   * Enrich multiple chunks in batch
   */
  async enrichChunks(
    requests: ProductEnrichmentRequest[],
  ): Promise<ProductEnrichmentResult[]> {
    return this.executeOperation(async () => {
      const results: ProductEnrichmentResult[] = [];

      for (const request of requests) {
        try {
          const result = await this.enrichChunk(request);
          results.push(result);
        } catch (error) {
          console.error(`Failed to enrich chunk ${request.chunk_id}:`, error);
          results.push({
            chunk_id: request.chunk_id,
            enrichment_status: 'failed',
            product_name: '',
            product_category: '',
            product_description: '',
            long_description: '',
            specifications: {},
            related_products: [],
            confidence_score: 0,
            processing_time_ms: 0,
          });
        }
      }

      return results;
    }, 'enrichChunks');
  }
}

