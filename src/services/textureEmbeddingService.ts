/**
 * Texture Embedding Service
 * 
 * Generates 256D texture embeddings from images and material properties
 * Integrates with MIVAA gateway for texture analysis
 */

import { supabase } from '@/integrations/supabase/client';
import { mivaaService } from './mivaaIntegrationService';

export interface TextureEmbeddingRequest {
  imageId?: string;
  imageUrl?: string;
  imageData?: string;
  materialProperties?: Record<string, any>;
  workspaceId: string;
}

export interface TextureEmbeddingResult {
  imageId?: string;
  embedding: number[];
  texturePatterns: string[];
  roughness: number;
  confidence: number;
  metadata: {
    model: string;
    dimensions: number;
    generatedAt: string;
    processingTimeMs: number;
  };
}

export class TextureEmbeddingService {
  private static instance: TextureEmbeddingService;
  private cache: Map<string, TextureEmbeddingResult> = new Map();

  private constructor() {}

  static getInstance(): TextureEmbeddingService {
    if (!TextureEmbeddingService.instance) {
      TextureEmbeddingService.instance = new TextureEmbeddingService();
    }
    return TextureEmbeddingService.instance;
  }

  /**
   * Generate texture embedding for a single image
   */
  async generateTextureEmbedding(request: TextureEmbeddingRequest): Promise<TextureEmbeddingResult> {
    const startTime = Date.now();
    const cacheKey = request.imageId || request.imageUrl || 'unknown';

    // Check cache
    if (this.cache.has(cacheKey)) {
      console.log(`✅ Texture embedding found in cache for ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }

    try {
      console.log(`🔲 Generating texture embedding for image: ${cacheKey}`);

      // Call MIVAA gateway for texture analysis
      const response = await mivaaService.callMivaaEndpoint('texture_analysis', {
        image_url: request.imageUrl,
        image_data: request.imageData,
        texture_properties: request.materialProperties?.texture || {},
        analysis_type: 'texture_pattern_embedding',
        options: {
          model: 'texture-pattern-extractor-v1',
          dimensions: 256,
          normalize: true,
        },
      });

      if (!response.success || !response.data?.texture_embedding) {
        throw new Error('Failed to generate texture embedding from MIVAA gateway');
      }

      const result: TextureEmbeddingResult = {
        imageId: request.imageId,
        embedding: response.data.texture_embedding,
        texturePatterns: response.data.texture_patterns || [],
        roughness: response.data.roughness || 0.5,
        confidence: response.data.confidence || 0.85,
        metadata: {
          model: 'texture-pattern-extractor-v1',
          dimensions: 256,
          generatedAt: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
        },
      };

      // Cache the result
      this.cache.set(cacheKey, result);

      console.log(`✅ Texture embedding generated (256D) in ${result.metadata.processingTimeMs}ms`);
      return result;

    } catch (error) {
      console.error('❌ Texture embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Batch generate texture embeddings for multiple images
   */
  async batchGenerateTextureEmbeddings(
    requests: TextureEmbeddingRequest[],
    batchSize: number = 10
  ): Promise<TextureEmbeddingResult[]> {
    console.log(`🔲 Batch generating texture embeddings for ${requests.length} images`);

    const results: TextureEmbeddingResult[] = [];

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(requests.length / batchSize)}`);

      const batchResults = await Promise.allSettled(
        batch.map(req => this.generateTextureEmbedding(req))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`❌ Failed to generate texture embedding for image ${batch[index].imageId}:`, result.reason);
        }
      });
    }

    console.log(`✅ Generated ${results.length}/${requests.length} texture embeddings`);
    return results;
  }

  /**
   * Store texture embeddings in database
   */
  async storeTextureEmbeddings(
    embeddings: TextureEmbeddingResult[],
    workspaceId: string
  ): Promise<{ stored: number; failed: number }> {
    let stored = 0;
    let failed = 0;

    for (const embedding of embeddings) {
      try {
        if (!embedding.imageId) {
          console.warn('⚠️ Skipping embedding without imageId');
          failed++;
          continue;
        }

        // Update document_images table with texture embedding
        const { error } = await supabase
          .from('document_images')
          .update({
            texture_embedding_256: embedding.embedding,
            metadata: {
              texture_patterns: embedding.texturePatterns,
              texture_roughness: embedding.roughness,
              texture_confidence: embedding.confidence,
              texture_model: embedding.metadata.model,
            },
          })
          .eq('id', embedding.imageId)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(`❌ Failed to store texture embedding for image ${embedding.imageId}:`, error);
          failed++;
        } else {
          stored++;
        }
      } catch (error) {
        console.error(`❌ Error storing texture embedding:`, error);
        failed++;
      }
    }

    console.log(`✅ Stored ${stored} texture embeddings, ${failed} failed`);
    return { stored, failed };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('✅ Texture embedding cache cleared');
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

export const textureEmbeddingService = TextureEmbeddingService.getInstance();

