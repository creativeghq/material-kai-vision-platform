/**
 * Enhanced CLIP Integration Service
 * 
 * Leverages existing CLIP embeddings from VisualFeatureExtractionService and MaterialVisualSearchService
 * to improve product-image associations and enable advanced visual similarity search capabilities.
 * 
 * Features:
 * - Real CLIP embedding-based product-image matching
 * - Advanced visual similarity search with multi-modal queries
 * - Product recommendation based on visual similarity
 * - Cross-modal search (text-to-image, image-to-text)
 * - Batch processing for large-scale similarity computations
 */

// Removed direct Supabase client - using Edge Functions instead
import { VisualFeatureExtractionService } from './visualFeatureExtractionService';
// import { MaterialVisualSearchService } from './materialVisualSearchService'; // TODO: Add when available

export interface ClipEmbedding {
  embedding: number[];
  model: string;
  dimensions: number;
  confidence: number;
  created_at: string;
}

export interface ProductImageMatch {
  productId: string;
  imageId: string;
  visualSimilarity: number;
  textualSimilarity: number;
  combinedScore: number;
  confidence: number;
  reasoning: string;
  metadata: {
    clipModel: string;
    embeddingDimensions: number;
    processingTime: number;
    matchingMethod: 'clip_cosine' | 'hybrid_multimodal' | 'cross_modal';
  };
}

export interface VisualSearchQuery {
  type: 'image_to_products' | 'text_to_images' | 'hybrid_multimodal';
  imageData?: string;
  textQuery?: string;
  filters?: {
    materialType?: string;
    colorFamily?: string;
    priceRange?: [number, number];
    categories?: string[];
  };
  similarityThreshold?: number;
  maxResults?: number;
}

export interface VisualSearchResult {
  id: string;
  type: 'product' | 'image';
  name: string;
  description?: string;
  imageUrl?: string;
  similarity: number;
  confidence: number;
  metadata: Record<string, any>;
}

export interface ProductRecommendation {
  productId: string;
  name: string;
  description: string;
  imageUrl?: string;
  visualSimilarity: number;
  reasoningFactors: {
    colorSimilarity: number;
    textureSimilarity: number;
    shapeSimilarity: number;
    materialTypeSimilarity: number;
  };
  confidence: number;
}

export interface ClipIntegrationStats {
  productsWithEmbeddings: number;
  imagesWithEmbeddings: number;
  totalEmbeddings: number;
  averageEmbeddingDimensions: number;
  modelDistribution: Record<string, number>;
  lastUpdated: string;
}

export class EnhancedClipIntegrationService {
  private static readonly CLIP_EMBEDDING_DIMENSION = 512;
  private static readonly SIMILARITY_THRESHOLD = 0.75;
  private static readonly MAX_BATCH_SIZE = 100;

  /**
   * Generate CLIP embeddings for product text descriptions
   */
  static async generateProductClipEmbeddings(
    productId: string,
    productText: string,
    options: {
      forceRegenerate?: boolean;
      includeMetadata?: boolean;
    } = {},
  ): Promise<ClipEmbedding | null> {
    try {
      console.log(`🔗 Generating CLIP embeddings for product: ${productId}`);

      // Check if embeddings already exist
      if (!options.forceRegenerate) {
        const existing = await this.getProductClipEmbedding(productId);
        if (existing) {
          console.log(`✅ Using existing CLIP embeddings for product: ${productId}`);
          return existing;
        }
      }

      // Generate CLIP text embeddings using MIVAA gateway directly
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL || 'http://localhost:3000'}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'clip_embedding_generation',
          payload: {
            text_query: productText,
            embedding_type: 'text_similarity',
            options: {
              normalize: true,
              dimensions: 512,
            },
          },
        }),
      });

      if (!response.ok) {
        console.warn(`⚠️ Failed to generate CLIP embeddings for product: ${productId} - HTTP ${response.status}`);
        return null;
      }

      const result = await response.json();

      if (!result.success || !result.data?.embedding) {
        console.warn(`⚠️ Failed to generate CLIP embeddings for product: ${productId} - Invalid response`);
        return null;
      }

      const clipEmbedding: ClipEmbedding = {
        embedding: result.data.embedding,
        model: result.data.model_used || 'clip-vit-base-patch32',
        dimensions: result.data.embedding.length,
        confidence: result.data.confidence || 1.0,
        created_at: new Date().toISOString(),
      };

      // Store in products table
      await this.storeProductClipEmbedding(productId, clipEmbedding);

      console.log(`✅ Generated and stored CLIP embeddings for product: ${productId}`);
      return clipEmbedding;

    } catch (error) {
      console.error(`❌ Error generating CLIP embeddings for product ${productId}:`, error);
      return null;
    }
  }

  /**
   * Get existing CLIP embedding for a product
   */
  static async getProductClipEmbedding(productId: string): Promise<ClipEmbedding | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('embedding, embedding_model, updated_at')
        .eq('id', productId)
        .single();

      if (error || !data?.embedding) {
        return null;
      }

      return {
        embedding: JSON.parse(data.embedding),
        model: data.embedding_model || 'clip-vit-base-patch32',
        dimensions: JSON.parse(data.embedding).length,
        confidence: 1.0,
        created_at: data.updated_at,
      };

    } catch (error) {
      console.error(`❌ Error retrieving CLIP embedding for product ${productId}:`, error);
      return null;
    }
  }

  /**
   * Store CLIP embedding for a product
   */
  private static async storeProductClipEmbedding(
    productId: string,
    clipEmbedding: ClipEmbedding,
  ): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({
        embedding: JSON.stringify(clipEmbedding.embedding),
        embedding_model: clipEmbedding.model,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (error) {
      throw new Error(`Failed to store CLIP embedding for product ${productId}: ${error.message}`);
    }
  }

  /**
   * Calculate cosine similarity between two CLIP embeddings
   */
  static calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return Math.max(0, Math.min(1, similarity)); // Clamp to [0, 1]
  }

  /**
   * Enhanced product-image matching using real CLIP embeddings
   */
  static async calculateRealClipScore(
    imageId: string,
    productId: string,
  ): Promise<{ score: number; confidence: number; metadata: Record<string, any> }> {
    try {
      console.log(`🔍 Calculating real CLIP score for image ${imageId} and product ${productId}`);

      // Get image CLIP embedding from material_visual_analysis
      const { data: imageAnalysis, error: imageError } = await supabase
        .from('material_visual_analysis')
        .select('clip_embedding, clip_model_version')
        .eq('material_id', imageId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (imageError || !imageAnalysis?.clip_embedding) {
        console.warn(`⚠️ No CLIP embedding found for image: ${imageId}`);
        return { score: 0.5, confidence: 0.3, metadata: { reason: 'no_image_embedding' } };
      }

      // Get product CLIP embedding
      const productEmbedding = await this.getProductClipEmbedding(productId);
      if (!productEmbedding) {
        console.warn(`⚠️ No CLIP embedding found for product: ${productId}`);
        return { score: 0.5, confidence: 0.3, metadata: { reason: 'no_product_embedding' } };
      }

      // Parse image embedding
      const imageEmbedding = JSON.parse(imageAnalysis.clip_embedding);

      // Calculate cosine similarity
      const similarity = this.calculateCosineSimilarity(imageEmbedding, productEmbedding.embedding);

      // Calculate confidence based on embedding quality and model consistency
      const modelMatch = imageAnalysis.clip_model_version === productEmbedding.model;
      const confidence = modelMatch ? 0.95 : 0.85;

      console.log(`✅ CLIP similarity: ${similarity.toFixed(3)} (confidence: ${confidence.toFixed(3)})`);

      return {
        score: similarity,
        confidence,
        metadata: {
          imageModel: imageAnalysis.clip_model_version,
          productModel: productEmbedding.model,
          modelMatch,
          embeddingDimensions: imageEmbedding.length,
          method: 'clip_cosine_similarity',
        },
      };

    } catch (error) {
      console.error(`❌ Error calculating real CLIP score:`, error);
      return { score: 0.5, confidence: 0.1, metadata: { error: error.message } };
    }
  }

  /**
   * Perform advanced visual similarity search
   */
  static async performVisualSimilaritySearch(
    query: VisualSearchQuery,
  ): Promise<{ results: VisualSearchResult[]; metadata: Record<string, any> }> {
    try {
      console.log(`🔍 Performing visual similarity search: ${query.type}`);
      const startTime = Date.now();

      let queryEmbedding: number[] | null = null;
      let searchMetadata: Record<string, any> = {
        queryType: query.type,
        similarityThreshold: query.similarityThreshold || this.SIMILARITY_THRESHOLD,
        maxResults: query.maxResults || 20,
      };

      // Generate query embedding based on type
      if (query.type === 'image_to_products' && query.imageData) {
        queryEmbedding = await this.generateImageClipEmbedding(query.imageData);
        searchMetadata.hasImageQuery = true;
      } else if (query.type === 'text_to_images' && query.textQuery) {
        queryEmbedding = await this.generateTextClipEmbedding(query.textQuery);
        searchMetadata.hasTextQuery = true;
      } else if (query.type === 'hybrid_multimodal') {
        // Combine image and text embeddings
        const imageEmb = query.imageData ? await this.generateImageClipEmbedding(query.imageData) : null;
        const textEmb = query.textQuery ? await this.generateTextClipEmbedding(query.textQuery) : null;

        if (imageEmb && textEmb) {
          // Average the embeddings for hybrid search
          queryEmbedding = imageEmb.map((val, idx) => (val + textEmb[idx]) / 2);
          searchMetadata.hybridMode = true;
        } else {
          queryEmbedding = imageEmb || textEmb;
        }
      }

      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Search based on query type
      let results: VisualSearchResult[] = [];

      if (query.type === 'image_to_products' || query.type === 'hybrid_multimodal') {
        results = await this.searchSimilarProducts(queryEmbedding, query);
      } else if (query.type === 'text_to_images') {
        results = await this.searchSimilarImages(queryEmbedding, query);
      }

      // Apply filters
      if (query.filters) {
        results = this.applySearchFilters(results, query.filters);
      }

      // Sort by similarity and limit results
      results = results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, query.maxResults || 20);

      const processingTime = Date.now() - startTime;
      searchMetadata.processingTime = processingTime;
      searchMetadata.resultsCount = results.length;

      console.log(`✅ Visual search completed: ${results.length} results in ${processingTime}ms`);

      return { results, metadata: searchMetadata };

    } catch (error) {
      console.error(`❌ Error performing visual similarity search:`, error);
      return { results: [], metadata: { error: error.message } };
    }
  }

  /**
   * Generate CLIP embedding for image data using MIVAA gateway
   */
  private static async generateImageClipEmbedding(imageData: string): Promise<number[] | null> {
    try {
      // Use MIVAA gateway directly for image embedding generation
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL || 'http://localhost:3000'}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'clip_embedding_generation',
          payload: {
            image_data: imageData,
            embedding_type: 'visual_similarity',
            options: {
              normalize: true,
              dimensions: 512,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`MIVAA gateway error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data?.embedding) {
        return Array.isArray(result.data.embedding) ? result.data.embedding : null;
      }

      return null;
    } catch (error) {
      console.error('❌ Error generating image CLIP embedding:', error);
      return null;
    }
  }

  /**
   * Generate CLIP embedding for text query using MIVAA gateway
   */
  private static async generateTextClipEmbedding(textQuery: string): Promise<number[] | null> {
    try {
      // Use MIVAA gateway directly for text embedding generation
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL || 'http://localhost:3000'}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'clip_embedding_generation',
          payload: {
            text_query: textQuery,
            embedding_type: 'text_similarity',
            options: {
              normalize: true,
              dimensions: 512,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`MIVAA gateway error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data?.embedding) {
        return Array.isArray(result.data.embedding) ? result.data.embedding : null;
      }

      return null;
    } catch (error) {
      console.error('❌ Error generating text CLIP embedding:', error);
      return null;
    }
  }

  /**
   * Search for products similar to query embedding
   */
  private static async searchSimilarProducts(
    queryEmbedding: number[],
    query: VisualSearchQuery,
  ): Promise<VisualSearchResult[]> {
    try {
      // Get all products with embeddings
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, description, embedding, embedding_model')
        .not('embedding', 'is', null)
        .limit(query.maxResults ? query.maxResults * 2 : 100); // Get more to filter

      if (error || !products) {
        throw new Error(`Failed to fetch products: ${error?.message}`);
      }

      const results: VisualSearchResult[] = [];
      const threshold = query.similarityThreshold || this.SIMILARITY_THRESHOLD;

      for (const product of products) {
        try {
          const productEmbedding = JSON.parse(product.embedding);
          const similarity = this.calculateCosineSimilarity(queryEmbedding, productEmbedding);

          if (similarity >= threshold) {
            results.push({
              id: product.id,
              type: 'product',
              name: product.name,
              description: product.description,
              similarity,
              confidence: 0.9,
              metadata: {
                embeddingModel: product.embedding_model,
                embeddingDimensions: productEmbedding.length,
              },
            });
          }
        } catch (embeddingError) {
          console.warn(`⚠️ Error processing product ${product.id}:`, embeddingError);
        }
      }

      return results;

    } catch (error) {
      console.error('❌ Error searching similar products:', error);
      return [];
    }
  }

  /**
   * Search for images similar to query embedding
   */
  private static async searchSimilarImages(
    queryEmbedding: number[],
    query: VisualSearchQuery,
  ): Promise<VisualSearchResult[]> {
    try {
      // Get images with CLIP embeddings from material_visual_analysis
      const { data: analyses, error } = await supabase
        .from('material_visual_analysis')
        .select(`
          material_id,
          clip_embedding,
          clip_model_version,
          images!inner(id, filename, url, caption, alt_text)
        `)
        .not('clip_embedding', 'is', null)
        .limit(query.maxResults ? query.maxResults * 2 : 100);

      if (error || !analyses) {
        throw new Error(`Failed to fetch image analyses: ${error?.message}`);
      }

      const results: VisualSearchResult[] = [];
      const threshold = query.similarityThreshold || this.SIMILARITY_THRESHOLD;

      for (const analysis of analyses) {
        try {
          const imageEmbedding = JSON.parse(analysis.clip_embedding);
          const similarity = this.calculateCosineSimilarity(queryEmbedding, imageEmbedding);

          if (similarity >= threshold && analysis.images) {
            const image = analysis.images;
            results.push({
              id: image.id,
              type: 'image',
              name: image.filename || image.caption || 'Untitled Image',
              description: image.alt_text || image.caption,
              imageUrl: image.url,
              similarity,
              confidence: 0.9,
              metadata: {
                clipModel: analysis.clip_model_version,
                embeddingDimensions: imageEmbedding.length,
              },
            });
          }
        } catch (embeddingError) {
          console.warn(`⚠️ Error processing image analysis ${analysis.material_id}:`, embeddingError);
        }
      }

      return results;

    } catch (error) {
      console.error('❌ Error searching similar images:', error);
      return [];
    }
  }

  /**
   * Apply search filters to results
   */
  private static applySearchFilters(
    results: VisualSearchResult[],
    filters: NonNullable<VisualSearchQuery['filters']>,
  ): VisualSearchResult[] {
    return results.filter(result => {
      // Material type filter
      if (filters.materialType && result.metadata?.materialType !== filters.materialType) {
        return false;
      }

      // Color family filter
      if (filters.colorFamily && result.metadata?.colorFamily !== filters.colorFamily) {
        return false;
      }

      // Price range filter (for products)
      if (filters.priceRange && result.type === 'product') {
        const price = result.metadata?.price;
        if (price && (price < filters.priceRange[0] || price > filters.priceRange[1])) {
          return false;
        }
      }

      // Categories filter
      if (filters.categories && filters.categories.length > 0) {
        const resultCategories = result.metadata?.categories || [];
        const hasMatchingCategory = filters.categories.some(cat =>
          resultCategories.includes(cat)
        );
        if (!hasMatchingCategory) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Generate product recommendations based on visual similarity
   */
  static async generateProductRecommendations(
    referenceProductId: string,
    options: {
      maxRecommendations?: number;
      similarityThreshold?: number;
      includeReasoningFactors?: boolean;
    } = {},
  ): Promise<ProductRecommendation[]> {
    try {
      console.log(`🎯 Generating product recommendations for: ${referenceProductId}`);

      // Get reference product embedding
      const referenceEmbedding = await this.getProductClipEmbedding(referenceProductId);
      if (!referenceEmbedding) {
        console.warn(`⚠️ No CLIP embedding found for reference product: ${referenceProductId}`);
        return [];
      }

      // Search for similar products
      const searchQuery: VisualSearchQuery = {
        type: 'image_to_products',
        similarityThreshold: options.similarityThreshold || 0.7,
        maxResults: options.maxRecommendations || 10,
      };

      const searchResults = await this.searchSimilarProducts(referenceEmbedding.embedding, searchQuery);

      // Filter out the reference product itself
      const filteredResults = searchResults.filter(result => result.id !== referenceProductId);

      // Convert to ProductRecommendation format
      const recommendations: ProductRecommendation[] = [];

      for (const result of filteredResults) {
        const recommendation: ProductRecommendation = {
          productId: result.id,
          name: result.name,
          description: result.description || '',
          imageUrl: result.imageUrl,
          visualSimilarity: result.similarity,
          reasoningFactors: {
            colorSimilarity: result.similarity * 0.8, // Approximate based on overall similarity
            textureSimilarity: result.similarity * 0.9,
            shapeSimilarity: result.similarity * 0.7,
            materialTypeSimilarity: result.similarity * 0.85,
          },
          confidence: result.confidence,
        };

        recommendations.push(recommendation);
      }

      console.log(`✅ Generated ${recommendations.length} product recommendations`);
      return recommendations;

    } catch (error) {
      console.error('❌ Error generating product recommendations:', error);
      return [];
    }
  }

  /**
   * Batch process CLIP embeddings for multiple products
   */
  static async batchGenerateProductEmbeddings(
    products: Array<{ id: string; text: string }>,
    options: {
      batchSize?: number;
      forceRegenerate?: boolean;
      onProgress?: (completed: number, total: number) => void;
    } = {},
  ): Promise<{ successful: number; failed: number; results: Array<{ productId: string; success: boolean; embedding?: ClipEmbedding }> }> {
    try {
      console.log(`🔄 Batch processing CLIP embeddings for ${products.length} products`);

      const batchSize = options.batchSize || this.MAX_BATCH_SIZE;
      const results: Array<{ productId: string; success: boolean; embedding?: ClipEmbedding }> = [];
      let successful = 0;
      let failed = 0;

      // Process in batches
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        const batchPromises = batch.map(async product => {
          try {
            const embedding = await this.generateProductClipEmbeddings(
              product.id,
              product.text,
              { forceRegenerate: options.forceRegenerate }
            );

            if (embedding) {
              successful++;
              return { productId: product.id, success: true, embedding };
            } else {
              failed++;
              return { productId: product.id, success: false };
            }
          } catch (error) {
            console.error(`❌ Error processing product ${product.id}:`, error);
            failed++;
            return { productId: product.id, success: false };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Report progress
        if (options.onProgress) {
          options.onProgress(results.length, products.length);
        }

        console.log(`📊 Batch ${Math.floor(i / batchSize) + 1} completed: ${batchResults.length} products processed`);
      }

      console.log(`✅ Batch processing completed: ${successful} successful, ${failed} failed`);

      return { successful, failed, results };

    } catch (error) {
      console.error('❌ Error in batch processing:', error);
      return { successful: 0, failed: products.length, results: [] };
    }
  }

  /**
   * Get comprehensive statistics about CLIP integration
   */
  static async getClipIntegrationStats(): Promise<{
    productsWithEmbeddings: number;
    imagesWithEmbeddings: number;
    totalEmbeddings: number;
    averageEmbeddingDimensions: number;
    modelDistribution: Record<string, number>;
    lastUpdated: string;
  }> {
    try {
      // Get product embedding stats
      const { data: productStats, error: productError } = await supabase
        .from('products')
        .select('embedding, embedding_model')
        .not('embedding', 'is', null);

      // Get image embedding stats
      const { data: imageStats, error: imageError } = await supabase
        .from('material_visual_analysis')
        .select('clip_embedding, clip_model_version')
        .not('clip_embedding', 'is', null);

      if (productError || imageError) {
        throw new Error(`Failed to fetch stats: ${productError?.message || imageError?.message}`);
      }

      const modelDistribution: Record<string, number> = {};
      let totalDimensions = 0;
      let embeddingCount = 0;

      // Process product embeddings
      if (productStats) {
        for (const product of productStats) {
          const model = product.embedding_model || 'unknown';
          modelDistribution[model] = (modelDistribution[model] || 0) + 1;

          try {
            const embedding = JSON.parse(product.embedding);
            totalDimensions += embedding.length;
            embeddingCount++;
          } catch (error) {
            console.warn('⚠️ Error parsing product embedding:', error);
          }
        }
      }

      // Process image embeddings
      if (imageStats) {
        for (const analysis of imageStats) {
          const model = analysis.clip_model_version || 'unknown';
          modelDistribution[model] = (modelDistribution[model] || 0) + 1;

          try {
            const embedding = JSON.parse(analysis.clip_embedding);
            totalDimensions += embedding.length;
            embeddingCount++;
          } catch (error) {
            console.warn('⚠️ Error parsing image embedding:', error);
          }
        }
      }

      return {
        productsWithEmbeddings: productStats?.length || 0,
        imagesWithEmbeddings: imageStats?.length || 0,
        totalEmbeddings: embeddingCount,
        averageEmbeddingDimensions: embeddingCount > 0 ? Math.round(totalDimensions / embeddingCount) : 0,
        modelDistribution,
        lastUpdated: new Date().toISOString(),
      };

    } catch (error) {
      console.error('❌ Error getting CLIP integration stats:', error);
      return {
        productsWithEmbeddings: 0,
        imagesWithEmbeddings: 0,
        totalEmbeddings: 0,
        averageEmbeddingDimensions: 0,
        modelDistribution: {},
        lastUpdated: new Date().toISOString(),
      };
    }
  }
}
