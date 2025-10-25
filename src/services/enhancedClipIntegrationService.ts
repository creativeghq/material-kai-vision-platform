/**
 * Enhanced CLIP Integration Service
 *
 * Handles CLIP-specific operations:
 * - Generate CLIP embeddings via Python API
 * - Calculate real cosine similarity
 * - Batch CLIP processing
 * - Product recommendations via visual similarity
 * - Integration with multiModalImageProductAssociationService
 */

import { supabase } from '@/integrations/supabase/client';

export interface ClipEmbeddingResult {
  entityId: string;
  entityType: 'product' | 'image';
  embedding: number[]; // 512D CLIP embedding
  confidence: number;
  generatedAt: string;
  success: boolean;
  error?: string;
}

export interface VisualRecommendation {
  productId: string;
  productName: string;
  similarity: number;
  imageCount: number;
}

export class EnhancedClipIntegrationService {
  private static instance: EnhancedClipIntegrationService;
  private readonly CLIP_EMBEDDING_DIM = 512;
  private readonly SIMILARITY_THRESHOLD = 0.5;

  private constructor() {}

  static getInstance(): EnhancedClipIntegrationService {
    if (!EnhancedClipIntegrationService.instance) {
      EnhancedClipIntegrationService.instance = new EnhancedClipIntegrationService();
    }
    return EnhancedClipIntegrationService.instance;
  }

  /**
   * Generate CLIP embeddings for products (batch)
   */
  async generateProductClipEmbeddings(products: any[]): Promise<ClipEmbeddingResult[]> {
    console.log(`🎬 Generating CLIP embeddings for ${products.length} products`);

    const results = await Promise.allSettled(
      products.map(product => this.generateProductClipEmbedding(product))
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as ClipEmbeddingResult).success).length;
    console.log(`✅ CLIP generation complete: ${successCount}/${results.length} successful`);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        entityId: products[index].id,
        entityType: 'product',
        embedding: [],
        confidence: 0,
        generatedAt: new Date().toISOString(),
        success: false,
        error: (result.reason as Error).message,
      };
    });
  }

  /**
   * Generate CLIP embedding for a single product
   */
  async generateProductClipEmbedding(product: any): Promise<ClipEmbeddingResult> {
    try {
      // Call MIVAA gateway to generate CLIP embedding
      const response = await this.callMivaaGateway('generate_clip_embedding', {
        entity_id: product.id,
        entity_type: 'product',
        text_content: product.description || product.name || '',
        image_url: product.image_url,
      });

      if (!response.success || !response.embedding) {
        throw new Error(response.error || 'Failed to generate CLIP embedding');
      }

      const result: ClipEmbeddingResult = {
        entityId: product.id,
        entityType: 'product',
        embedding: response.embedding,
        confidence: response.confidence || 0.9,
        generatedAt: new Date().toISOString(),
        success: true,
      };

      // Store in database
      await this.storeClipEmbedding(result);

      return result;
    } catch (error) {
      console.error(`❌ Failed to generate CLIP for product ${product.id}:`, error);
      return {
        entityId: product.id,
        entityType: 'product',
        embedding: [],
        confidence: 0,
        generatedAt: new Date().toISOString(),
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Generate CLIP embeddings for images (batch)
   */
  async generateImageClipEmbeddings(images: any[]): Promise<ClipEmbeddingResult[]> {
    console.log(`🎬 Generating CLIP embeddings for ${images.length} images`);

    const results = await Promise.allSettled(
      images.map(image => this.generateImageClipEmbedding(image))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        entityId: images[index].id,
        entityType: 'image',
        embedding: [],
        confidence: 0,
        generatedAt: new Date().toISOString(),
        success: false,
        error: (result.reason as Error).message,
      };
    });
  }

  /**
   * Generate CLIP embedding for a single image
   */
  async generateImageClipEmbedding(image: any): Promise<ClipEmbeddingResult> {
    try {
      const response = await this.callMivaaGateway('generate_clip_embedding', {
        entity_id: image.id,
        entity_type: 'image',
        image_url: image.url || image.storage_path,
        text_content: image.caption || '',
      });

      if (!response.success || !response.embedding) {
        throw new Error(response.error || 'Failed to generate CLIP embedding');
      }

      const result: ClipEmbeddingResult = {
        entityId: image.id,
        entityType: 'image',
        embedding: response.embedding,
        confidence: response.confidence || 0.9,
        generatedAt: new Date().toISOString(),
        success: true,
      };

      await this.storeClipEmbedding(result);
      return result;
    } catch (error) {
      console.error(`❌ Failed to generate CLIP for image ${image.id}:`, error);
      return {
        entityId: image.id,
        entityType: 'image',
        embedding: [],
        confidence: 0,
        generatedAt: new Date().toISOString(),
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Calculate real CLIP similarity between two embeddings
   */
  calculateClipSimilarity(embedding1: number[], embedding2: number[]): number {
    if (!embedding1 || !embedding2 || embedding1.length === 0 || embedding2.length === 0) {
      return 0;
    }

    // Cosine similarity
    const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
    const magnitude1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Get visual recommendations for an image
   */
  async getVisualRecommendations(imageId: string, limit: number = 10): Promise<VisualRecommendation[]> {
    try {
      // Get image CLIP embedding
      const imageEmbedding = await this.getClipEmbedding(imageId, 'image');
      if (!imageEmbedding || imageEmbedding.length === 0) {
        console.warn(`No CLIP embedding found for image ${imageId}`);
        return [];
      }

      // Get all product CLIP embeddings
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, image_url')
        .limit(1000);

      if (error) throw error;
      if (!products || products.length === 0) return [];

      // Calculate similarities
      const recommendations: VisualRecommendation[] = [];

      for (const product of products) {
        const productEmbedding = await this.getClipEmbedding(product.id, 'product');
        if (!productEmbedding || productEmbedding.length === 0) continue;

        const similarity = this.calculateClipSimilarity(imageEmbedding, productEmbedding);

        if (similarity >= this.SIMILARITY_THRESHOLD) {
          recommendations.push({
            productId: product.id,
            productName: product.name,
            similarity,
            imageCount: 0, // Could be fetched if needed
          });
        }
      }

      // Sort by similarity and limit
      return recommendations.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    } catch (error) {
      console.error('Error getting visual recommendations:', error);
      return [];
    }
  }

  /**
   * Store CLIP embedding in database
   */
  private async storeClipEmbedding(result: ClipEmbeddingResult): Promise<void> {
    try {
      const { error } = await supabase
        .from('embeddings')
        .upsert({
          entity_id: result.entityId,
          entity_type: result.entityType,
          embedding_type: 'visual_clip_512',
          embedding_vector: result.embedding,
          confidence: result.confidence,
          generated_at: result.generatedAt,
        }, {
          onConflict: 'entity_id,entity_type,embedding_type',
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error storing CLIP embedding:', error);
    }
  }

  /**
   * Retrieve CLIP embedding from database
   */
  async getClipEmbedding(entityId: string, entityType: 'product' | 'image'): Promise<number[] | null> {
    try {
      const { data, error } = await supabase
        .from('embeddings')
        .select('embedding_vector')
        .eq('entity_id', entityId)
        .eq('entity_type', entityType)
        .eq('embedding_type', 'visual_clip_512')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw error;
      }

      return data?.embedding_vector || null;
    } catch (error) {
      console.error(`Error retrieving CLIP embedding for ${entityId}:`, error);
      return null;
    }
  }

  /**
   * Call MIVAA gateway
   */
  private async callMivaaGateway(action: string, payload: any): Promise<any> {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration not found');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!response.ok) {
      throw new Error(`MIVAA gateway error: ${response.statusText}`);
    }

    return response.json();
  }
}

export default EnhancedClipIntegrationService.getInstance();

