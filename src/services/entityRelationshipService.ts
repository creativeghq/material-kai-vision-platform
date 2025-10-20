/**
 * Entity Relationship Service
 *
 * Manages relationships between:
 * - Chunks and Products
 * - Chunks and Images
 * - Products and Images
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  ChunkProductRelationship,
  ChunkImageRelationship,
  ProductImageRelationship,
} from '@/types/unified-material-api';

export class EntityRelationshipService {
  /**
   * Create a relationship between a chunk and a product
   */
  static async linkChunkToProduct(
    chunkId: string,
    productId: string,
    relationshipType: 'source' | 'related' | 'component' | 'alternative' = 'source',
    relevanceScore: number = 1.0,
  ): Promise<ChunkProductRelationship> {
    const { data, error } = await supabase
      .from('chunk_product_relationships')
      .upsert(
        {
          chunk_id: chunkId,
          product_id: productId,
          relationship_type: relationshipType,
          relevance_score: relevanceScore,
        },
        { onConflict: 'chunk_id,product_id' },
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Create a relationship between a chunk and an image
   */
  static async linkChunkToImage(
    chunkId: string,
    imageId: string,
    relationshipType: 'illustrates' | 'depicts' | 'related' | 'example' = 'illustrates',
    relevanceScore: number = 1.0,
  ): Promise<ChunkImageRelationship> {
    const { data, error } = await supabase
      .from('chunk_image_relationships')
      .upsert(
        {
          chunk_id: chunkId,
          image_id: imageId,
          relationship_type: relationshipType,
          relevance_score: relevanceScore,
        },
        { onConflict: 'chunk_id,image_id' },
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Create a relationship between a product and an image
   */
  static async linkProductToImage(
    productId: string,
    imageId: string,
    relationshipType: 'depicts' | 'illustrates' | 'variant' | 'related' = 'depicts',
    relevanceScore: number = 1.0,
  ): Promise<ProductImageRelationship> {
    const { data, error } = await supabase
      .from('product_image_relationships')
      .upsert(
        {
          product_id: productId,
          image_id: imageId,
          relationship_type: relationshipType,
          relevance_score: relevanceScore,
        },
        { onConflict: 'product_id,image_id' },
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get all products related to a chunk
   */
  static async getChunkProducts(chunkId: string): Promise<ChunkProductRelationship[]> {
    const { data, error } = await supabase
      .from('chunk_product_relationships')
      .select('*')
      .eq('chunk_id', chunkId)
      .order('relevance_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all images related to a chunk
   */
  static async getChunkImages(chunkId: string): Promise<ChunkImageRelationship[]> {
    const { data, error } = await supabase
      .from('chunk_image_relationships')
      .select('*')
      .eq('chunk_id', chunkId)
      .order('relevance_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all images related to a product
   */
  static async getProductImages(productId: string): Promise<ProductImageRelationship[]> {
    const { data, error } = await supabase
      .from('product_image_relationships')
      .select('*')
      .eq('product_id', productId)
      .order('relevance_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all chunks related to a product
   */
  static async getProductChunks(productId: string): Promise<ChunkProductRelationship[]> {
    const { data, error } = await supabase
      .from('chunk_product_relationships')
      .select('*')
      .eq('product_id', productId)
      .order('relevance_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all chunks related to an image
   */
  static async getImageChunks(imageId: string): Promise<ChunkImageRelationship[]> {
    const { data, error } = await supabase
      .from('chunk_image_relationships')
      .select('*')
      .eq('image_id', imageId)
      .order('relevance_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get all products related to an image
   */
  static async getImageProducts(imageId: string): Promise<ProductImageRelationship[]> {
    const { data, error } = await supabase
      .from('product_image_relationships')
      .select('*')
      .eq('image_id', imageId)
      .order('relevance_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Remove relationship between chunk and product
   */
  static async unlinkChunkFromProduct(chunkId: string, productId: string): Promise<void> {
    const { error } = await supabase
      .from('chunk_product_relationships')
      .delete()
      .eq('chunk_id', chunkId)
      .eq('product_id', productId);

    if (error) throw error;
  }

  /**
   * Remove relationship between chunk and image
   */
  static async unlinkChunkFromImage(chunkId: string, imageId: string): Promise<void> {
    const { error } = await supabase
      .from('chunk_image_relationships')
      .delete()
      .eq('chunk_id', chunkId)
      .eq('image_id', imageId);

    if (error) throw error;
  }

  /**
   * Remove relationship between product and image
   */
  static async unlinkProductFromImage(productId: string, imageId: string): Promise<void> {
    const { error } = await supabase
      .from('product_image_relationships')
      .delete()
      .eq('product_id', productId)
      .eq('image_id', imageId);

    if (error) throw error;
  }

  /**
   * Get complete entity graph for a chunk (products and images)
   */
  static async getChunkEntityGraph(chunkId: string) {
    const [products, images] = await Promise.all([
      this.getChunkProducts(chunkId),
      this.getChunkImages(chunkId),
    ]);

    return {
      chunkId,
      relatedProducts: products,
      relatedImages: images,
    };
  }

  /**
   * Get complete entity graph for a product (chunks and images)
   */
  static async getProductEntityGraph(productId: string) {
    const [chunks, images] = await Promise.all([
      this.getProductChunks(productId),
      this.getProductImages(productId),
    ]);

    return {
      productId,
      sourceChunks: chunks,
      relatedImages: images,
    };
  }

  /**
   * Get complete entity graph for an image (chunks and products)
   */
  static async getImageEntityGraph(imageId: string) {
    const [chunks, products] = await Promise.all([
      this.getImageChunks(imageId),
      this.getImageProducts(imageId),
    ]);

    return {
      imageId,
      relatedChunks: chunks,
      relatedProducts: products,
    };
  }

  /**
   * Batch link chunks to products
   */
  static async batchLinkChunksToProducts(
    links: Array<{ chunkId: string; productId: string; relevanceScore?: number }>,
  ): Promise<void> {
    const data = links.map(link => ({
      chunk_id: link.chunkId,
      product_id: link.productId,
      relationship_type: 'source',
      relevance_score: link.relevanceScore || 1.0,
    }));

    const { error } = await supabase
      .from('chunk_product_relationships')
      .upsert(data, { onConflict: 'chunk_id,product_id' });

    if (error) throw error;
  }

  /**
   * Batch link chunks to images
   */
  static async batchLinkChunksToImages(
    links: Array<{ chunkId: string; imageId: string; relevanceScore?: number }>,
  ): Promise<void> {
    const data = links.map(link => ({
      chunk_id: link.chunkId,
      image_id: link.imageId,
      relationship_type: 'illustrates',
      relevance_score: link.relevanceScore || 1.0,
    }));

    const { error } = await supabase
      .from('chunk_image_relationships')
      .upsert(data, { onConflict: 'chunk_id,image_id' });

    if (error) throw error;
  }

  /**
   * Batch link products to images
   */
  static async batchLinkProductsToImages(
    links: Array<{ productId: string; imageId: string; relevanceScore?: number }>,
  ): Promise<void> {
    const data = links.map(link => ({
      product_id: link.productId,
      image_id: link.imageId,
      relationship_type: 'depicts',
      relevance_score: link.relevanceScore || 1.0,
    }));

    const { error } = await supabase
      .from('product_image_relationships')
      .upsert(data, { onConflict: 'product_id,image_id' });

    if (error) throw error;
  }
}

