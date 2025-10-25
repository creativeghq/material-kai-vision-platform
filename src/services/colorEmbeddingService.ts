/**
 * Color Embedding Service
 * 
 * Generates 256D color embeddings from images and material properties
 * Integrates with MIVAA gateway for color analysis
 */

import { supabase } from '@/integrations/supabase/client';
import { mivaaService } from './mivaaIntegrationService';

export interface ColorEmbeddingRequest {
  imageId?: string;
  imageUrl?: string;
  imageData?: string;
  materialProperties?: Record<string, any>;
  workspaceId: string;
}

export interface ColorEmbeddingResult {
  imageId?: string;
  embedding: number[];
  colorPalette: string[];
  confidence: number;
  metadata: {
    model: string;
    dimensions: number;
    generatedAt: string;
    processingTimeMs: number;
  };
}

export class ColorEmbeddingService {
  private static instance: ColorEmbeddingService;
  private cache: Map<string, ColorEmbeddingResult> = new Map();

  private constructor() {}

  static getInstance(): ColorEmbeddingService {
    if (!ColorEmbeddingService.instance) {
      ColorEmbeddingService.instance = new ColorEmbeddingService();
    }
    return ColorEmbeddingService.instance;
  }

  /**
   * Generate color embedding for a single image
   */
  async generateColorEmbedding(request: ColorEmbeddingRequest): Promise<ColorEmbeddingResult> {
    const startTime = Date.now();
    const cacheKey = request.imageId || request.imageUrl || 'unknown';

    // Check cache
    if (this.cache.has(cacheKey)) {
      console.log(`✅ Color embedding found in cache for ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }

    try {
      console.log(`🎨 Generating color embedding for image: ${cacheKey}`);

      // Call MIVAA gateway for color analysis
      const response = await mivaaService.callMivaaEndpoint('color_analysis', {
        image_url: request.imageUrl,
        image_data: request.imageData,
        color_palette: request.materialProperties?.colors || [],
        analysis_type: 'color_palette_embedding',
        options: {
          model: 'color-palette-extractor-v1',
          dimensions: 256,
          normalize: true,
        },
      });

      if (!response.success || !response.data?.color_embedding) {
        throw new Error('Failed to generate color embedding from MIVAA gateway');
      }

      const result: ColorEmbeddingResult = {
        imageId: request.imageId,
        embedding: response.data.color_embedding,
        colorPalette: response.data.color_palette || [],
        confidence: response.data.confidence || 0.85,
        metadata: {
          model: 'color-palette-extractor-v1',
          dimensions: 256,
          generatedAt: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
        },
      };

      // Cache the result
      this.cache.set(cacheKey, result);

      console.log(`✅ Color embedding generated (256D) in ${result.metadata.processingTimeMs}ms`);
      return result;

    } catch (error) {
      console.error('❌ Color embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Batch generate color embeddings for multiple images
   */
  async batchGenerateColorEmbeddings(
    requests: ColorEmbeddingRequest[],
    batchSize: number = 10
  ): Promise<ColorEmbeddingResult[]> {
    console.log(`🎨 Batch generating color embeddings for ${requests.length} images`);

    const results: ColorEmbeddingResult[] = [];

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(requests.length / batchSize)}`);

      const batchResults = await Promise.allSettled(
        batch.map(req => this.generateColorEmbedding(req))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`❌ Failed to generate color embedding for image ${batch[index].imageId}:`, result.reason);
        }
      });
    }

    console.log(`✅ Generated ${results.length}/${requests.length} color embeddings`);
    return results;
  }

  /**
   * Store color embeddings in database
   */
  async storeColorEmbeddings(
    embeddings: ColorEmbeddingResult[],
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

        // Update document_images table with color embedding
        const { error } = await supabase
          .from('document_images')
          .update({
            color_embedding_256: embedding.embedding,
            metadata: {
              color_palette: embedding.colorPalette,
              color_confidence: embedding.confidence,
              color_model: embedding.metadata.model,
            },
          })
          .eq('id', embedding.imageId)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(`❌ Failed to store color embedding for image ${embedding.imageId}:`, error);
          failed++;
        } else {
          stored++;
        }
      } catch (error) {
        console.error(`❌ Error storing color embedding:`, error);
        failed++;
      }
    }

    console.log(`✅ Stored ${stored} color embeddings, ${failed} failed`);
    return { stored, failed };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('✅ Color embedding cache cleared');
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

export const colorEmbeddingService = ColorEmbeddingService.getInstance();

