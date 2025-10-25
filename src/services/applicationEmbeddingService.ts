/**
 * Application Embedding Service
 * 
 * Generates 512D application embeddings from material properties and use cases
 * Integrates with MIVAA gateway for application classification
 */

import { supabase } from '@/integrations/supabase/client';
import { mivaaService } from './mivaaIntegrationService';

export interface ApplicationEmbeddingRequest {
  productId?: string;
  chunkId?: string;
  materialProperties?: Record<string, any>;
  description?: string;
  applications?: string[];
  workspaceId: string;
}

export interface ApplicationEmbeddingResult {
  entityId?: string;
  entityType: 'product' | 'chunk';
  embedding: number[];
  applications: string[];
  applicationScores: Record<string, number>;
  confidence: number;
  metadata: {
    model: string;
    dimensions: number;
    generatedAt: string;
    processingTimeMs: number;
  };
}

export class ApplicationEmbeddingService {
  private static instance: ApplicationEmbeddingService;
  private cache: Map<string, ApplicationEmbeddingResult> = new Map();

  private constructor() {}

  static getInstance(): ApplicationEmbeddingService {
    if (!ApplicationEmbeddingService.instance) {
      ApplicationEmbeddingService.instance = new ApplicationEmbeddingService();
    }
    return ApplicationEmbeddingService.instance;
  }

  /**
   * Generate application embedding for a product or chunk
   */
  async generateApplicationEmbedding(request: ApplicationEmbeddingRequest): Promise<ApplicationEmbeddingResult> {
    const startTime = Date.now();
    const cacheKey = request.productId || request.chunkId || 'unknown';

    // Check cache
    if (this.cache.has(cacheKey)) {
      console.log(`✅ Application embedding found in cache for ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }

    try {
      console.log(`🏭 Generating application embedding for entity: ${cacheKey}`);

      // Call MIVAA gateway for application classification
      const response = await mivaaService.callMivaaEndpoint('application_classification', {
        material_properties: request.materialProperties || {},
        description: request.description || '',
        known_applications: request.applications || [],
        analysis_type: 'application_use_case_embedding',
        options: {
          model: 'application-classifier-v1',
          dimensions: 512,
          normalize: true,
        },
      });

      if (!response.success || !response.data?.application_embedding) {
        throw new Error('Failed to generate application embedding from MIVAA gateway');
      }

      const result: ApplicationEmbeddingResult = {
        entityId: request.productId || request.chunkId,
        entityType: request.productId ? 'product' : 'chunk',
        embedding: response.data.application_embedding,
        applications: response.data.applications || [],
        applicationScores: response.data.application_scores || {},
        confidence: response.data.confidence || 0.85,
        metadata: {
          model: 'application-classifier-v1',
          dimensions: 512,
          generatedAt: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
        },
      };

      // Cache the result
      this.cache.set(cacheKey, result);

      console.log(`✅ Application embedding generated (512D) in ${result.metadata.processingTimeMs}ms`);
      return result;

    } catch (error) {
      console.error('❌ Application embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Batch generate application embeddings for multiple products/chunks
   */
  async batchGenerateApplicationEmbeddings(
    requests: ApplicationEmbeddingRequest[],
    batchSize: number = 10
  ): Promise<ApplicationEmbeddingResult[]> {
    console.log(`🏭 Batch generating application embeddings for ${requests.length} entities`);

    const results: ApplicationEmbeddingResult[] = [];

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(requests.length / batchSize)}`);

      const batchResults = await Promise.allSettled(
        batch.map(req => this.generateApplicationEmbedding(req))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const entityId = batch[index].productId || batch[index].chunkId;
          console.error(`❌ Failed to generate application embedding for ${entityId}:`, result.reason);
        }
      });
    }

    console.log(`✅ Generated ${results.length}/${requests.length} application embeddings`);
    return results;
  }

  /**
   * Store application embeddings in database
   */
  async storeApplicationEmbeddings(
    embeddings: ApplicationEmbeddingResult[],
    workspaceId: string
  ): Promise<{ stored: number; failed: number }> {
    let stored = 0;
    let failed = 0;

    for (const embedding of embeddings) {
      try {
        if (!embedding.entityId) {
          console.warn('⚠️ Skipping embedding without entityId');
          failed++;
          continue;
        }

        const table = embedding.entityType === 'product' ? 'products' : 'document_chunks';
        const { error } = await supabase
          .from(table)
          .update({
            application_embedding_512: embedding.embedding,
            metadata: {
              applications: embedding.applications,
              application_scores: embedding.applicationScores,
              application_confidence: embedding.confidence,
              application_model: embedding.metadata.model,
            },
          })
          .eq('id', embedding.entityId)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(`❌ Failed to store application embedding for ${embedding.entityId}:`, error);
          failed++;
        } else {
          stored++;
        }
      } catch (error) {
        console.error(`❌ Error storing application embedding:`, error);
        failed++;
      }
    }

    console.log(`✅ Stored ${stored} application embeddings, ${failed} failed`);
    return { stored, failed };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('✅ Application embedding cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

export const applicationEmbeddingService = ApplicationEmbeddingService.getInstance();

