/**
 * Multi-Vector Generation Service
 *
 * Generates all 6 embedding types for comprehensive multi-modal search:
 * 1. Text (1536D) - OpenAI text-embedding-3-small
 * 2. Visual CLIP (512D) - CLIP visual embeddings
 * 3. Multimodal Fusion (2048D) - Combined text+visual
 * 4. Color (256D) - Specialized color embeddings
 * 5. Texture (256D) - Texture pattern embeddings
 * 6. Application (512D) - Use-case/application embeddings
 */

import { supabase } from '@/integrations/supabase/client';

// Embedding type definitions
export interface MultiVectorEmbeddings {
  text_embedding_1536?: number[];
  visual_clip_embedding_512?: number[];
  multimodal_fusion_embedding_2048?: number[];
  color_embedding_256?: number[];
  texture_embedding_256?: number[];
  application_embedding_512?: number[];
  metadata: {
    generated_at: string;
    model_versions: {
      text_model?: string;
      clip_model?: string;
      color_model?: string;
      texture_model?: string;
      application_model?: string;
    };
    generation_time_ms: number;
    confidence_scores: {
      text?: number;
      visual?: number;
      color?: number;
      texture?: number;
      application?: number;
    };
  };
}

export interface EmbeddingGenerationOptions {
  forceRegenerate?: boolean;
  embeddingTypes?: ('text' | 'visual' | 'multimodal' | 'color' | 'texture' | 'application')[];
  includeMetadata?: boolean;
  batchSize?: number;
}

export interface EmbeddingGenerationResult {
  success: boolean;
  embeddings?: MultiVectorEmbeddings;
  error?: string;
  processingTime: number;
  embeddingsGenerated: string[];
  skippedEmbeddings: string[];
}

export class MultiVectorGenerationService {
  private static readonly MIVAA_GATEWAY_URL = process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL || 'http://localhost:3000';
  private static readonly DEFAULT_MODELS = {
    text: 'text-embedding-3-small',
    clip: 'clip-vit-base-patch32',
    color: 'color-palette-extractor-v1',
    texture: 'texture-analysis-v1',
    application: 'use-case-classifier-v1',
  };

  /**
   * Generate all embedding types for a product
   */
  static async generateProductEmbeddings(
    productId: string,
    options: EmbeddingGenerationOptions = {},
  ): Promise<EmbeddingGenerationResult> {
    const startTime = Date.now();
    console.log(`🔄 Generating multi-vector embeddings for product ${productId}`);

    try {
      // Get product data
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        throw new Error(`Product not found: ${productError?.message}`);
      }

      // Get associated images
      const { data: images } = await supabase
        .from('document_images')
        .select('*')
        .eq('source_document_id', product.source_document_id);

      const embeddings: MultiVectorEmbeddings = {
        metadata: {
          generated_at: new Date().toISOString(),
          model_versions: {},
          generation_time_ms: 0,
          confidence_scores: {},
        },
      };

      const embeddingTypes = options.embeddingTypes || ['text', 'visual', 'multimodal', 'color', 'texture', 'application'];
      const embeddingsGenerated: string[] = [];
      const skippedEmbeddings: string[] = [];

      // 1. Generate Text Embedding (1536D)
      if (embeddingTypes.includes('text')) {
        const textContent = [
          product.name,
          product.description,
          product.long_description,
        ].filter(Boolean).join('\n\n');

        if (textContent) {
          const textEmbedding = await this.generateTextEmbedding(textContent);
          if (textEmbedding) {
            embeddings.text_embedding_1536 = textEmbedding.embedding;
            embeddings.metadata.model_versions.text_model = textEmbedding.model;
            embeddings.metadata.confidence_scores.text = textEmbedding.confidence;
            embeddingsGenerated.push('text_1536');
          }
        } else {
          skippedEmbeddings.push('text_1536 (no content)');
        }
      }

      // 2. Generate Visual CLIP Embedding (512D)
      if (embeddingTypes.includes('visual') && images && images.length > 0) {
        const primaryImage = images.find(img => img.image_type === 'product') || images[0];
        if (primaryImage) {
          const visualEmbedding = await this.generateVisualClipEmbedding(primaryImage.image_url);
          if (visualEmbedding) {
            embeddings.visual_clip_embedding_512 = visualEmbedding.embedding;
            embeddings.metadata.model_versions.clip_model = visualEmbedding.model;
            embeddings.metadata.confidence_scores.visual = visualEmbedding.confidence;
            embeddingsGenerated.push('visual_clip_512');
          }
        } else {
          skippedEmbeddings.push('visual_clip_512 (no images)');
        }
      }

      // 3. Generate Multimodal Fusion Embedding (2048D)
      if (embeddingTypes.includes('multimodal') && embeddings.text_embedding_1536 && embeddings.visual_clip_embedding_512) {
        const fusionEmbedding = this.generateMultimodalFusionEmbedding(
          embeddings.text_embedding_1536,
          embeddings.visual_clip_embedding_512,
        );
        embeddings.multimodal_fusion_embedding_2048 = fusionEmbedding;
        embeddingsGenerated.push('multimodal_fusion_2048');
      }

      // 4. Generate Color Embedding (256D)
      if (embeddingTypes.includes('color') && images && images.length > 0) {
        const primaryImage = images.find(img => img.image_type === 'product') || images[0];
        if (primaryImage) {
          const colorEmbedding = await this.generateColorEmbedding(primaryImage.image_url);
          if (colorEmbedding) {
            embeddings.color_embedding_256 = colorEmbedding.embedding;
            embeddings.metadata.model_versions.color_model = colorEmbedding.model;
            embeddings.metadata.confidence_scores.color = colorEmbedding.confidence;
            embeddingsGenerated.push('color_256');
          }
        } else {
          skippedEmbeddings.push('color_256 (no images)');
        }
      }

      // 5. Generate Texture Embedding (256D)
      if (embeddingTypes.includes('texture') && images && images.length > 0) {
        const primaryImage = images.find(img => img.image_type === 'product') || images[0];
        if (primaryImage) {
          const textureEmbedding = await this.generateTextureEmbedding(primaryImage.image_url);
          if (textureEmbedding) {
            embeddings.texture_embedding_256 = textureEmbedding.embedding;
            embeddings.metadata.model_versions.texture_model = textureEmbedding.model;
            embeddings.metadata.confidence_scores.texture = textureEmbedding.confidence;
            embeddingsGenerated.push('texture_256');
          }
        } else {
          skippedEmbeddings.push('texture_256 (no images)');
        }
      }

      // 6. Generate Application Embedding (512D)
      if (embeddingTypes.includes('application')) {
        const applicationContext = this.extractApplicationContext(product);
        if (applicationContext) {
          const applicationEmbedding = await this.generateApplicationEmbedding(applicationContext);
          if (applicationEmbedding) {
            embeddings.application_embedding_512 = applicationEmbedding.embedding;
            embeddings.metadata.model_versions.application_model = applicationEmbedding.model;
            embeddings.metadata.confidence_scores.application = applicationEmbedding.confidence;
            embeddingsGenerated.push('application_512');
          }
        } else {
          skippedEmbeddings.push('application_512 (no context)');
        }
      }

      // Update processing time
      embeddings.metadata.generation_time_ms = Date.now() - startTime;

      // Store embeddings in database
      await this.storeProductEmbeddings(productId, embeddings);

      console.log(`✅ Generated ${embeddingsGenerated.length} embeddings for product ${productId}`);
      console.log(`📊 Generated: ${embeddingsGenerated.join(', ')}`);
      if (skippedEmbeddings.length > 0) {
        console.log(`⚠️ Skipped: ${skippedEmbeddings.join(', ')}`);
      }

      return {
        success: true,
        embeddings,
        processingTime: Date.now() - startTime,
        embeddingsGenerated,
        skippedEmbeddings,
      };

    } catch (error) {
      console.error('❌ Multi-vector generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
        embeddingsGenerated: [],
        skippedEmbeddings: [],
      };
    }
  }

  /**
   * Generate text embedding using OpenAI
   */
  private static async generateTextEmbedding(text: string): Promise<{
    embedding: number[];
    model: string;
    confidence: number;
  } | null> {
    try {
      const response = await fetch(`${this.MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'text_embedding_generation',
          payload: {
            text_query: text,
            embedding_type: 'text_similarity',
            options: {
              model: this.DEFAULT_MODELS.text,
              dimensions: 1536,
              normalize: true,
            },
          },
        }),
      });

      const result = await response.json();
      if (result.success && result.data?.embedding) {
        return {
          embedding: result.data.embedding,
          model: result.data.model_used || this.DEFAULT_MODELS.text,
          confidence: result.data.confidence || 1.0,
        };
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Text embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Generate visual CLIP embedding
   */
  private static async generateVisualClipEmbedding(imageUrl: string): Promise<{
    embedding: number[];
    model: string;
    confidence: number;
  } | null> {
    try {
      const response = await fetch(`${this.MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clip_embedding_generation',
          payload: {
            image_data: imageUrl,
            embedding_type: 'visual_similarity',
            options: {
              model: this.DEFAULT_MODELS.clip,
              dimensions: 512,
              normalize: true,
            },
          },
        }),
      });

      const result = await response.json();
      if (result.success && result.data?.embedding) {
        return {
          embedding: result.data.embedding,
          model: result.data.model_used || this.DEFAULT_MODELS.clip,
          confidence: result.data.confidence || 1.0,
        };
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Visual CLIP embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Generate multimodal fusion embedding by concatenating text and visual embeddings
   */
  private static generateMultimodalFusionEmbedding(
    textEmbedding: number[],
    visualEmbedding: number[],
  ): number[] {
    // Simple concatenation approach for 2048D fusion embedding
    // Alternative approaches: weighted average, learned fusion, etc.
    return [...textEmbedding, ...visualEmbedding];
  }

  /**
   * Generate color embedding from image
   */
  private static async generateColorEmbedding(imageUrl: string): Promise<{
    embedding: number[];
    model: string;
    confidence: number;
  } | null> {
    try {
      const response = await fetch(`${this.MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'color_analysis',
          payload: {
            image_data: imageUrl,
            analysis_type: 'color_palette_embedding',
            options: {
              model: this.DEFAULT_MODELS.color,
              dimensions: 256,
              extract_dominant_colors: true,
              color_harmony_analysis: true,
            },
          },
        }),
      });

      const result = await response.json();
      if (result.success && result.data?.color_embedding) {
        return {
          embedding: result.data.color_embedding,
          model: result.data.model_used || this.DEFAULT_MODELS.color,
          confidence: result.data.confidence || 0.8,
        };
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Color embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Generate texture embedding from image
   */
  private static async generateTextureEmbedding(imageUrl: string): Promise<{
    embedding: number[];
    model: string;
    confidence: number;
  } | null> {
    try {
      const response = await fetch(`${this.MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'texture_analysis',
          payload: {
            image_data: imageUrl,
            analysis_type: 'texture_pattern_embedding',
            options: {
              model: this.DEFAULT_MODELS.texture,
              dimensions: 256,
              analyze_surface_properties: true,
              pattern_recognition: true,
            },
          },
        }),
      });

      const result = await response.json();
      if (result.success && result.data?.texture_embedding) {
        return {
          embedding: result.data.texture_embedding,
          model: result.data.model_used || this.DEFAULT_MODELS.texture,
          confidence: result.data.confidence || 0.8,
        };
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Texture embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Extract application context from product data
   */
  private static extractApplicationContext(product: any): string | null {
    const contexts: string[] = [];

    // Extract from product properties
    if (product.properties) {
      const props = typeof product.properties === 'string'
        ? JSON.parse(product.properties)
        : product.properties;

      if (props.application) contexts.push(props.application);
      if (props.use_case) contexts.push(props.use_case);
      if (props.room_type) contexts.push(props.room_type);
      if (props.environment) contexts.push(props.environment);
    }

    // Extract from specifications
    if (product.specifications) {
      const specs = typeof product.specifications === 'string'
        ? JSON.parse(product.specifications)
        : product.specifications;

      if (specs.suitable_for) contexts.push(specs.suitable_for);
      if (specs.installation_location) contexts.push(specs.installation_location);
      if (specs.performance_characteristics) contexts.push(specs.performance_characteristics);
    }

    // Extract from description using keywords
    const description = [product.description, product.long_description].filter(Boolean).join(' ');
    const applicationKeywords = [
      'bathroom', 'kitchen', 'outdoor', 'indoor', 'commercial', 'residential',
      'floor', 'wall', 'ceiling', 'countertop', 'backsplash', 'shower',
      'wet area', 'high traffic', 'decorative', 'structural',
    ];

    applicationKeywords.forEach(keyword => {
      if (description.toLowerCase().includes(keyword)) {
        contexts.push(keyword);
      }
    });

    return contexts.length > 0 ? contexts.join(', ') : null;
  }

  /**
   * Generate application embedding from context
   */
  private static async generateApplicationEmbedding(applicationContext: string): Promise<{
    embedding: number[];
    model: string;
    confidence: number;
  } | null> {
    try {
      const response = await fetch(`${this.MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'application_classification',
          payload: {
            text_query: applicationContext,
            classification_type: 'use_case_embedding',
            options: {
              model: this.DEFAULT_MODELS.application,
              dimensions: 512,
              context_aware: true,
            },
          },
        }),
      });

      const result = await response.json();
      if (result.success && result.data?.application_embedding) {
        return {
          embedding: result.data.application_embedding,
          model: result.data.model_used || this.DEFAULT_MODELS.application,
          confidence: result.data.confidence || 0.8,
        };
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Application embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Store product embeddings in database
   */
  private static async storeProductEmbeddings(
    productId: string,
    embeddings: MultiVectorEmbeddings,
  ): Promise<void> {
    const updateData: any = {
      embedding_metadata: embeddings.metadata,
    };

    // Add each embedding type if present
    if (embeddings.text_embedding_1536) {
      updateData.text_embedding_1536 = embeddings.text_embedding_1536;
    }
    if (embeddings.visual_clip_embedding_512) {
      updateData.visual_clip_embedding_512 = embeddings.visual_clip_embedding_512;
    }
    if (embeddings.multimodal_fusion_embedding_2048) {
      updateData.multimodal_fusion_embedding_2048 = embeddings.multimodal_fusion_embedding_2048;
    }
    if (embeddings.color_embedding_256) {
      updateData.color_embedding_256 = embeddings.color_embedding_256;
    }
    if (embeddings.texture_embedding_256) {
      updateData.texture_embedding_256 = embeddings.texture_embedding_256;
    }
    if (embeddings.application_embedding_512) {
      updateData.application_embedding_512 = embeddings.application_embedding_512;
    }

    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId);

    if (error) {
      throw new Error(`Failed to store embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for a chunk
   */
  static async generateChunkEmbeddings(
    chunkId: string,
    options: EmbeddingGenerationOptions = {},
  ): Promise<EmbeddingGenerationResult> {
    const startTime = Date.now();
    console.log(`🔄 Generating multi-vector embeddings for chunk ${chunkId}`);

    try {
      // Get chunk data
      const { data: chunk, error: chunkError } = await supabase
        .from('document_vectors')
        .select('*')
        .eq('chunk_id', chunkId)
        .single();

      if (chunkError || !chunk) {
        throw new Error(`Chunk not found: ${chunkError?.message}`);
      }

      const embeddings: MultiVectorEmbeddings = {
        metadata: {
          generated_at: new Date().toISOString(),
          model_versions: {},
          generation_time_ms: 0,
          confidence_scores: {},
        },
      };

      const embeddingTypes = options.embeddingTypes || ['text', 'visual', 'multimodal'];
      const embeddingsGenerated: string[] = [];
      const skippedEmbeddings: string[] = [];

      // Generate text embedding
      if (embeddingTypes.includes('text') && chunk.content) {
        const textEmbedding = await this.generateTextEmbedding(chunk.content);
        if (textEmbedding) {
          embeddings.text_embedding_1536 = textEmbedding.embedding;
          embeddings.metadata.model_versions.text_model = textEmbedding.model;
          embeddings.metadata.confidence_scores.text = textEmbedding.confidence;
          embeddingsGenerated.push('text_1536');
        }
      }

      // Update processing time
      embeddings.metadata.generation_time_ms = Date.now() - startTime;

      // Store embeddings
      await this.storeChunkEmbeddings(chunkId, embeddings);

      return {
        success: true,
        embeddings,
        processingTime: Date.now() - startTime,
        embeddingsGenerated,
        skippedEmbeddings,
      };

    } catch (error) {
      console.error('❌ Chunk multi-vector generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
        embeddingsGenerated: [],
        skippedEmbeddings: [],
      };
    }
  }

  /**
   * Store chunk embeddings in database
   */
  private static async storeChunkEmbeddings(
    chunkId: string,
    embeddings: MultiVectorEmbeddings,
  ): Promise<void> {
    const updateData: any = {
      embedding_metadata: embeddings.metadata,
    };

    if (embeddings.text_embedding_1536) {
      updateData.text_embedding_1536 = embeddings.text_embedding_1536;
    }
    if (embeddings.visual_clip_embedding_512) {
      updateData.visual_clip_embedding_512 = embeddings.visual_clip_embedding_512;
    }
    if (embeddings.multimodal_fusion_embedding_2048) {
      updateData.multimodal_fusion_embedding_2048 = embeddings.multimodal_fusion_embedding_2048;
    }

    const { error } = await supabase
      .from('document_vectors')
      .update(updateData)
      .eq('chunk_id', chunkId);

    if (error) {
      throw new Error(`Failed to store chunk embeddings: ${error.message}`);
    }
  }

  /**
   * Batch generate embeddings for multiple products
   */
  static async batchGenerateProductEmbeddings(
    productIds: string[],
    options: EmbeddingGenerationOptions = {},
  ): Promise<{
    successful: number;
    failed: number;
    results: EmbeddingGenerationResult[];
    totalProcessingTime: number;
  }> {
    const startTime = Date.now();
    const batchSize = options.batchSize || 5;
    const results: EmbeddingGenerationResult[] = [];
    let successful = 0;
    let failed = 0;

    console.log(`🔄 Batch generating embeddings for ${productIds.length} products (batch size: ${batchSize})`);

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      const batchPromises = batch.map(productId =>
        this.generateProductEmbeddings(productId, options),
      );

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.success) {
            successful++;
          } else {
            failed++;
          }
        } else {
          results.push({
            success: false,
            error: result.reason?.message || 'Unknown error',
            processingTime: 0,
            embeddingsGenerated: [],
            skippedEmbeddings: [],
          });
          failed++;
        }
      });

      // Small delay between batches to prevent rate limiting
      if (i + batchSize < productIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const totalProcessingTime = Date.now() - startTime;
    console.log(`✅ Batch processing complete: ${successful} successful, ${failed} failed (${totalProcessingTime}ms)`);

    return {
      successful,
      failed,
      results,
      totalProcessingTime,
    };
  }

  /**
   * Get embedding statistics for monitoring
   */
  static async getEmbeddingStatistics(): Promise<{
    products: {
      total: number;
      withTextEmbeddings: number;
      withVisualEmbeddings: number;
      withMultimodalEmbeddings: number;
      withColorEmbeddings: number;
      withTextureEmbeddings: number;
      withApplicationEmbeddings: number;
    };
    chunks: {
      total: number;
      withTextEmbeddings: number;
      withVisualEmbeddings: number;
    };
  }> {
    try {
      // Get product statistics
      const { data: productStats } = await supabase
        .from('products')
        .select(`
          id,
          text_embedding_1536,
          visual_clip_embedding_512,
          multimodal_fusion_embedding_2048,
          color_embedding_256,
          texture_embedding_256,
          application_embedding_512
        `);

      // Get chunk statistics
      const { data: chunkStats } = await supabase
        .from('document_vectors')
        .select(`
          chunk_id,
          text_embedding_1536,
          visual_clip_embedding_512
        `);

      const products = {
        total: productStats?.length || 0,
        withTextEmbeddings: productStats?.filter(p => p.text_embedding_1536).length || 0,
        withVisualEmbeddings: productStats?.filter(p => p.visual_clip_embedding_512).length || 0,
        withMultimodalEmbeddings: productStats?.filter(p => p.multimodal_fusion_embedding_2048).length || 0,
        withColorEmbeddings: productStats?.filter(p => p.color_embedding_256).length || 0,
        withTextureEmbeddings: productStats?.filter(p => p.texture_embedding_256).length || 0,
        withApplicationEmbeddings: productStats?.filter(p => p.application_embedding_512).length || 0,
      };

      const chunks = {
        total: chunkStats?.length || 0,
        withTextEmbeddings: chunkStats?.filter(c => c.text_embedding_1536).length || 0,
        withVisualEmbeddings: chunkStats?.filter(c => c.visual_clip_embedding_512).length || 0,
      };

      return { products, chunks };

    } catch (error) {
      console.error('❌ Error getting embedding statistics:', error);
      return {
        products: {
          total: 0,
          withTextEmbeddings: 0,
          withVisualEmbeddings: 0,
          withMultimodalEmbeddings: 0,
          withColorEmbeddings: 0,
          withTextureEmbeddings: 0,
          withApplicationEmbeddings: 0,
        },
        chunks: {
          total: 0,
          withTextEmbeddings: 0,
          withVisualEmbeddings: 0,
        },
      };
    }
  }
}
