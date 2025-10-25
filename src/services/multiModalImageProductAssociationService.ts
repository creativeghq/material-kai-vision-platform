/**
 * Multi-Modal Image-Product Association Service
 *
 * Creates intelligent image-product linking using:
 * - Spatial proximity (40% weight): Same page ±1, spatial distance
 * - Caption similarity (30% weight): Text similarity between image captions and product descriptions
 * - CLIP visual similarity (30% weight): Visual-text similarity using existing CLIP embeddings
 *
 * Replaces random associations with weighted confidence scoring for meaningful relationships.
 */

import { supabase } from '@/integrations/supabase/client';

import { EntityRelationshipService } from './entityRelationshipService';
import enhancedClipIntegrationService from './enhancedClipIntegrationService';

export interface ImageProductAssociation {
  imageId: string;
  productId: string;
  spatialScore: number;
  captionScore: number;
  clipScore: number;
  overallScore: number;
  confidence: number;
  reasoning: string;
  metadata: {
    spatialProximity: {
      pageDifference: number;
      spatialDistance?: number;
      samePageGroup: boolean;
    };
    captionSimilarity: {
      imageCaption: string;
      productDescription: string;
      textSimilarity: number;
    };
    clipSimilarity: {
      visualTextSimilarity: number;
      embeddingDistance: number;
      modelUsed: string;
    };
  };
}

export interface AssociationWeights {
  spatial: number;
  caption: number;
  clip: number;
}

export interface AssociationOptions {
  weights?: AssociationWeights;
  spatialThreshold?: number;
  captionThreshold?: number;
  clipThreshold?: number;
  overallThreshold?: number;
  maxAssociationsPerImage?: number;
  maxAssociationsPerProduct?: number;
}

export class MultiModalImageProductAssociationService {
  private static readonly DEFAULT_WEIGHTS: AssociationWeights = {
    spatial: 0.4,  // 40% weight for spatial proximity
    caption: 0.3,  // 30% weight for caption similarity
    clip: 0.3,     // 30% weight for CLIP visual similarity
  };

  private static readonly DEFAULT_OPTIONS: AssociationOptions = {
    weights: MultiModalImageProductAssociationService.DEFAULT_WEIGHTS,
    spatialThreshold: 0.3,      // Minimum spatial score
    captionThreshold: 0.4,      // Minimum caption similarity
    clipThreshold: 0.5,         // Minimum CLIP similarity
    overallThreshold: 0.6,      // Minimum overall score to create association
    maxAssociationsPerImage: 3, // Max products per image
    maxAssociationsPerProduct: 5, // Max images per product
  };

  /**
   * Create intelligent image-product associations for a document
   */
  static async createDocumentAssociations(
    documentId: string,
    options: AssociationOptions = {},
  ): Promise<{
    associationsCreated: number;
    totalEvaluated: number;
    averageConfidence: number;
    associations: ImageProductAssociation[];
  }> {
    console.log(`🎯 Creating multi-modal image-product associations for document: ${documentId}`);

    const opts = { ...MultiModalImageProductAssociationService.DEFAULT_OPTIONS, ...options };

    try {
      // Get all images and products for the document
      const [images, products] = await Promise.all([
        MultiModalImageProductAssociationService.getDocumentImages(documentId),
        MultiModalImageProductAssociationService.getDocumentProducts(documentId),
      ]);

      if (images.length === 0 || products.length === 0) {
        console.log(`⚠️ No images (${images.length}) or products (${products.length}) found for document`);
        return {
          associationsCreated: 0,
          totalEvaluated: 0,
          averageConfidence: 0,
          associations: [],
        };
      }

      console.log(`📊 Evaluating ${images.length} images × ${products.length} products = ${images.length * products.length} potential associations`);

      // Evaluate all image-product combinations
      const allAssociations: ImageProductAssociation[] = [];
      let totalEvaluated = 0;

      for (const image of images) {
        for (const product of products) {
          totalEvaluated++;

          try {
            const association = await MultiModalImageProductAssociationService.evaluateAssociation(
              image,
              product,
              opts,
            );

            if (association.overallScore >= opts.overallThreshold) {
              allAssociations.push(association);
            }
          } catch (error) {
            console.warn(`⚠️ Error evaluating association between image ${image.id} and product ${product.id}:`, error);
          }
        }
      }

      // Sort by overall score and apply limits
      allAssociations.sort((a, b) => b.overallScore - a.overallScore);

      // Apply per-image and per-product limits
      const finalAssociations = MultiModalImageProductAssociationService.applyAssociationLimits(
        allAssociations,
        opts,
      );

      // Create database relationships
      const associationsCreated = await MultiModalImageProductAssociationService.createDatabaseAssociations(
        finalAssociations,
      );

      const averageConfidence = finalAssociations.length > 0
        ? finalAssociations.reduce((sum, assoc) => sum + assoc.confidence, 0) / finalAssociations.length
        : 0;

      console.log(`✅ Created ${associationsCreated} intelligent image-product associations`);
      console.log(`📊 Average confidence: ${(averageConfidence * 100).toFixed(1)}%`);

      return {
        associationsCreated,
        totalEvaluated,
        averageConfidence,
        associations: finalAssociations,
      };

    } catch (error) {
      console.error('❌ Error creating document associations:', error);
      throw new Error(`Failed to create image-product associations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Evaluate a single image-product association
   */
  private static async evaluateAssociation(
    image: any,
    product: any,
    options: AssociationOptions,
  ): Promise<ImageProductAssociation> {
    const weights = options.weights;

    // Calculate spatial proximity score
    const spatialScore = await MultiModalImageProductAssociationService.calculateSpatialScore(
      image,
      product,
    );

    // Calculate caption similarity score
    const captionScore = await MultiModalImageProductAssociationService.calculateCaptionScore(
      image,
      product,
    );

    // Calculate CLIP visual similarity score
    const clipScore = await MultiModalImageProductAssociationService.calculateClipScore(
      image,
      product,
    );

    // Calculate weighted overall score
    const overallScore = (
      spatialScore * weights.spatial +
      captionScore * weights.caption +
      clipScore * weights.clip
    );

    // Calculate confidence based on score distribution
    const confidence = MultiModalImageProductAssociationService.calculateConfidence(
      spatialScore,
      captionScore,
      clipScore,
      overallScore,
    );

    // Generate reasoning
    const reasoning = MultiModalImageProductAssociationService.generateReasoning(
      spatialScore,
      captionScore,
      clipScore,
      overallScore,
      weights,
    );

    return {
      imageId: image.id,
      productId: product.id,
      spatialScore,
      captionScore,
      clipScore,
      overallScore,
      confidence,
      reasoning,
      metadata: {
        spatialProximity: {
          pageDifference: Math.abs((image.page_number || 0) - (product.page_number || 0)),
          samePageGroup: Math.abs((image.page_number || 0) - (product.page_number || 0)) <= 1,
        },
        captionSimilarity: {
          imageCaption: image.caption || image.alt_text || '',
          productDescription: product.description || product.name || '',
          textSimilarity: captionScore,
        },
        clipSimilarity: {
          visualTextSimilarity: clipScore,
          embeddingDistance: 1 - clipScore, // Convert similarity to distance
          modelUsed: 'clip-vit-base-patch32',
        },
      },
    };
  }

  /**
   * Calculate spatial proximity score (0-1)
   */
  private static async calculateSpatialScore(image: any, product: any): Promise<number> {
    const imagePage = image.page_number || 0;
    const productPage = product.page_number || 0;

    // Same page = highest score
    if (imagePage === productPage) {
      return 1.0;
    }

    // Adjacent pages = high score
    const pageDifference = Math.abs(imagePage - productPage);
    if (pageDifference === 1) {
      return 0.8;
    }

    // Within 2 pages = medium score
    if (pageDifference <= 2) {
      return 0.6;
    }

    // Within 3 pages = low score
    if (pageDifference <= 3) {
      return 0.4;
    }

    // Further apart = very low score
    return Math.max(0.1, 1 / (pageDifference * 0.5));
  }

  /**
   * Calculate caption similarity score (0-1)
   */
  private static async calculateCaptionScore(image: any, product: any): Promise<number> {
    const imageText = (image.caption || image.alt_text || '').toLowerCase();
    const productText = (product.description || product.name || '').toLowerCase();

    if (!imageText || !productText) {
      return 0.0;
    }

    // Simple text similarity using word overlap
    const imageWords = new Set(imageText.split(/\s+/).filter(word => word.length > 2));
    const productWords = new Set(productText.split(/\s+/).filter(word => word.length > 2));

    if (imageWords.size === 0 || productWords.size === 0) {
      return 0.0;
    }

    // Calculate Jaccard similarity
    const intersection = new Set([...imageWords].filter(word => productWords.has(word)));
    const union = new Set([...imageWords, ...productWords]);

    const jaccardSimilarity = intersection.size / union.size;

    // Boost score if product name appears in image caption
    const productName = (product.name || '').toLowerCase();
    if (productName && imageText.includes(productName)) {
      return Math.min(1.0, jaccardSimilarity + 0.3);
    }

    return jaccardSimilarity;
  }

  /**
   * Calculate CLIP visual similarity score (0-1) using real CLIP embeddings
   */
  private static async calculateClipScore(image: any, product: any): Promise<number> {
    try {
      console.log(`🔍 Calculating CLIP score for image ${image.id} and product ${product.id}`);

      // Fetch real CLIP embeddings from database
      const imageEmbedding = await enhancedClipIntegrationService.getClipEmbedding(image.id, 'image');
      const productEmbedding = await enhancedClipIntegrationService.getClipEmbedding(product.id, 'product');

      // If both embeddings exist, calculate real cosine similarity
      if (imageEmbedding && imageEmbedding.length > 0 && productEmbedding && productEmbedding.length > 0) {
        const similarity = enhancedClipIntegrationService.calculateClipSimilarity(imageEmbedding, productEmbedding);
        console.log(`✅ CLIP similarity: ${similarity.toFixed(3)} for image ${image.id} and product ${product.id}`);
        return similarity;
      }

      // Fallback: Use text similarity if embeddings not available
      console.warn(`⚠️ CLIP embeddings not found for image ${image.id} or product ${product.id}, using text fallback`);
      const imageCaption = image.caption || image.alt_text || '';
      const productText = product.description || product.name || '';

      if (imageCaption && productText) {
        const textSimilarity = await MultiModalImageProductAssociationService.calculateCaptionScore(
          { caption: imageCaption },
          { description: productText },
        );
        return textSimilarity;
      }

      return 0.5; // Neutral fallback

    } catch (error) {
      console.warn('⚠️ Error calculating CLIP score:', error);
      return 0.5; // Neutral score on error
    }
  }

  /**
   * Calculate confidence based on score distribution
   */
  private static calculateConfidence(
    spatialScore: number,
    captionScore: number,
    clipScore: number,
    overallScore: number,
  ): number {
    // High confidence when all scores are consistently high
    const scoreVariance = MultiModalImageProductAssociationService.calculateVariance([
      spatialScore,
      captionScore,
      clipScore,
    ]);

    // Lower variance = higher confidence
    const consistencyBonus = Math.max(0, 0.3 - scoreVariance);

    // Base confidence from overall score
    const baseConfidence = overallScore;

    return Math.min(1.0, baseConfidence + consistencyBonus);
  }

  /**
   * Calculate variance of scores
   */
  private static calculateVariance(scores: number[]): number {
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const squaredDifferences = scores.map(score => Math.pow(score - mean, 2));
    return squaredDifferences.reduce((sum, diff) => sum + diff, 0) / scores.length;
  }

  /**
   * Generate human-readable reasoning for the association
   */
  private static generateReasoning(
    spatialScore: number,
    captionScore: number,
    clipScore: number,
    overallScore: number,
    weights: AssociationWeights,
  ): string {
    const reasons: string[] = [];

    // Spatial reasoning
    if (spatialScore >= 0.8) {
      reasons.push('same/adjacent page');
    } else if (spatialScore >= 0.6) {
      reasons.push('nearby pages');
    } else if (spatialScore >= 0.4) {
      reasons.push('moderate spatial proximity');
    }

    // Caption reasoning
    if (captionScore >= 0.7) {
      reasons.push('strong text similarity');
    } else if (captionScore >= 0.5) {
      reasons.push('moderate text similarity');
    } else if (captionScore >= 0.3) {
      reasons.push('some text overlap');
    }

    // CLIP reasoning
    if (clipScore >= 0.7) {
      reasons.push('high visual-text similarity');
    } else if (clipScore >= 0.5) {
      reasons.push('moderate visual relevance');
    }

    // Overall assessment
    let assessment = '';
    if (overallScore >= 0.8) {
      assessment = 'Strong association';
    } else if (overallScore >= 0.6) {
      assessment = 'Good association';
    } else if (overallScore >= 0.4) {
      assessment = 'Moderate association';
    } else {
      assessment = 'Weak association';
    }

    const reasonText = reasons.length > 0 ? ` (${reasons.join(', ')})` : '';
    return `${assessment}${reasonText}`;
  }

  /**
   * Apply per-image and per-product association limits
   */
  private static applyAssociationLimits(
    associations: ImageProductAssociation[],
    options: AssociationOptions,
  ): ImageProductAssociation[] {
    const imageAssociationCounts = new Map<string, number>();
    const productAssociationCounts = new Map<string, number>();
    const finalAssociations: ImageProductAssociation[] = [];

    for (const association of associations) {
      const imageCount = imageAssociationCounts.get(association.imageId) || 0;
      const productCount = productAssociationCounts.get(association.productId) || 0;

      // Check limits
      if (
        imageCount < options.maxAssociationsPerImage &&
        productCount < options.maxAssociationsPerProduct
      ) {
        finalAssociations.push(association);
        imageAssociationCounts.set(association.imageId, imageCount + 1);
        productAssociationCounts.set(association.productId, productCount + 1);
      }
    }

    return finalAssociations;
  }

  /**
   * Create database relationships from associations
   */
  private static async createDatabaseAssociations(
    associations: ImageProductAssociation[],
  ): Promise<number> {
    let created = 0;

    try {
      // Batch create product-image relationships
      const productImageLinks = associations.map(assoc => ({
        productId: assoc.productId,
        imageId: assoc.imageId,
        relevanceScore: assoc.overallScore,
      }));

      if (productImageLinks.length > 0) {
        await EntityRelationshipService.batchLinkProductsToImages(productImageLinks);
        created = productImageLinks.length;
      }

      // Store detailed association metadata
      if (associations.length > 0) {
        const { error } = await supabase
          .from('image_product_associations')
          .upsert(
            associations.map(assoc => ({
              image_id: assoc.imageId,
              product_id: assoc.productId,
              spatial_score: assoc.spatialScore,
              caption_score: assoc.captionScore,
              clip_score: assoc.clipScore,
              overall_score: assoc.overallScore,
              confidence: assoc.confidence,
              reasoning: assoc.reasoning,
              metadata: assoc.metadata,
            })),
            { onConflict: 'image_id,product_id' },
          );

        if (error) {
          console.warn('⚠️ Error storing association metadata:', error);
        }
      }

    } catch (error) {
      console.error('❌ Error creating database associations:', error);
    }

    return created;
  }

  /**
   * Get all images for a document
   */
  private static async getDocumentImages(documentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('document_images')
      .select('*')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true });

    if (error) {
      console.error('❌ Error fetching document images:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get all products for a document
   */
  private static async getDocumentProducts(documentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching document products:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get association statistics for a document
   */
  static async getDocumentAssociationStats(documentId: string): Promise<{
    totalImages: number;
    totalProducts: number;
    totalAssociations: number;
    averageConfidence: number;
    associationsByScore: Record<string, number>;
  }> {
    try {
      const [images, products] = await Promise.all([
        MultiModalImageProductAssociationService.getDocumentImages(documentId),
        MultiModalImageProductAssociationService.getDocumentProducts(documentId),
      ]);

      const { data: associations, error } = await supabase
        .from('image_product_associations')
        .select('overall_score, confidence')
        .in('image_id', images.map(img => img.id))
        .in('product_id', products.map(prod => prod.id));

      if (error) {
        console.error('❌ Error fetching association stats:', error);
        return {
          totalImages: images.length,
          totalProducts: products.length,
          totalAssociations: 0,
          averageConfidence: 0,
          associationsByScore: {},
        };
      }

      const totalAssociations = associations?.length || 0;
      const averageConfidence = totalAssociations > 0
        ? associations.reduce((sum, assoc) => sum + assoc.confidence, 0) / totalAssociations
        : 0;

      // Group associations by score ranges
      const associationsByScore = {
        'high (0.8+)': 0,
        'good (0.6-0.8)': 0,
        'moderate (0.4-0.6)': 0,
        'low (<0.4)': 0,
      };

      associations?.forEach(assoc => {
        if (assoc.overall_score >= 0.8) {
          associationsByScore['high (0.8+)']++;
        } else if (assoc.overall_score >= 0.6) {
          associationsByScore['good (0.6-0.8)']++;
        } else if (assoc.overall_score >= 0.4) {
          associationsByScore['moderate (0.4-0.6)']++;
        } else {
          associationsByScore['low (<0.4)']++;
        }
      });

      return {
        totalImages: images.length,
        totalProducts: products.length,
        totalAssociations,
        averageConfidence,
        associationsByScore,
      };

    } catch (error) {
      console.error('❌ Error getting association stats:', error);
      throw error;
    }
  }
}
