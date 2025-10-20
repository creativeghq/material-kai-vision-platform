/**
 * Product Entity Service
 *
 * Manages product-centric entity relationships:
 * - Product → Chunks (source chunks)
 * - Product → Images (product images)
 * - Product → Embeddings (product embeddings)
 * - Product → Metafields (product metafields)
 *
 * Product is the central hub that links to all other entities
 */

import { supabase } from '@/integrations/supabase/client';
import type { Product, DocumentChunk, DocumentImage, EntityMetafieldValue } from '@/types/unified-material-api';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ProductEntityGraph {
  product: Product;
  sourceChunks: DocumentChunk[];
  images: DocumentImage[];
  embeddings: any[];
  metafields: EntityMetafieldValue[];
}

export class ProductEntityService {
  /**
   * Link product to source chunks
   */
  static async linkProductToChunks(
    productId: string,
    chunkIds: string[],
    relationshipType: 'source' | 'reference' | 'related' = 'source',
    relevanceScores?: Record<string, number>
  ): Promise<{ linksCreated: number; totalAttempted: number }> {
    console.log(`🔗 Linking product to ${chunkIds.length} chunks...`);

    let linksCreated = 0;
    const totalAttempted = chunkIds.length;

    try {
      for (const chunkId of chunkIds) {
        try {
          const relevanceScore = relevanceScores?.[chunkId] || 1.0;

          const { error } = await supabase
            .from('product_chunk_relationships')
            .upsert(
              {
                product_id: productId,
                chunk_id: chunkId,
                relationship_type: relationshipType,
                relevance_score: relevanceScore,
              },
              { onConflict: 'product_id,chunk_id' }
            );

          if (!error) {
            linksCreated++;
            console.log(`  ✅ Linked product to chunk (relevance: ${relevanceScore})`);
          } else {
            console.warn(`  ⚠️ Failed to link chunk: ${error.message}`);
          }
        } catch (error) {
          console.warn(`  ⚠️ Error linking chunk:`, error);
        }
      }

      console.log(`✅ Product-chunk linking completed: ${linksCreated}/${totalAttempted} links created`);
      return { linksCreated, totalAttempted };
    } catch (error) {
      console.error('Error linking product to chunks:', error);
      throw new Error(`Failed to link product to chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Link product to images
   */
  static async linkProductToImages(
    productId: string,
    imageIds: string[],
    relationshipType: 'primary' | 'texture' | 'sample' | 'installation' | 'related' = 'primary',
    relevanceScores?: Record<string, number>
  ): Promise<{ linksCreated: number; totalAttempted: number }> {
    console.log(`🖼️ Linking product to ${imageIds.length} images...`);

    let linksCreated = 0;
    const totalAttempted = imageIds.length;

    try {
      for (let i = 0; i < imageIds.length; i++) {
        const imageId = imageIds[i];

        try {
          const relevanceScore = relevanceScores?.[imageId] || 1.0;

          const { error } = await supabase
            .from('product_images')
            .upsert(
              {
                product_id: productId,
                image_id: imageId,
                image_type: relationshipType,
                display_order: i,
              },
              { onConflict: 'product_id,image_id' }
            );

          if (!error) {
            linksCreated++;
            console.log(`  ✅ Linked product to image ${i + 1} (type: ${relationshipType})`);
          } else {
            console.warn(`  ⚠️ Failed to link image: ${error.message}`);
          }
        } catch (error) {
          console.warn(`  ⚠️ Error linking image:`, error);
        }
      }

      console.log(`✅ Product-image linking completed: ${linksCreated}/${totalAttempted} links created`);
      return { linksCreated, totalAttempted };
    } catch (error) {
      console.error('Error linking product to images:', error);
      throw new Error(`Failed to link product to images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Link product to embeddings
   */
  static async linkProductToEmbeddings(
    productId: string,
    embeddings: Array<{ embedding: number[]; embeddingType: string; sourceContent: string; modelName: string }>
  ): Promise<{ embeddingsCreated: number; totalAttempted: number }> {
    console.log(`📊 Linking product to ${embeddings.length} embeddings...`);

    let embeddingsCreated = 0;
    const totalAttempted = embeddings.length;

    try {
      for (const emb of embeddings) {
        try {
          const { error } = await supabase
            .from('product_embeddings')
            .insert({
              product_id: productId,
              embedding_type: emb.embeddingType,
              embedding: emb.embedding,
              source_content: emb.sourceContent,
              model_name: emb.modelName,
              dimensions: emb.embedding.length,
            });

          if (!error) {
            embeddingsCreated++;
            console.log(`  ✅ Created ${emb.embeddingType} embedding`);
          } else {
            console.warn(`  ⚠️ Failed to create embedding: ${error.message}`);
          }
        } catch (error) {
          console.warn(`  ⚠️ Error creating embedding:`, error);
        }
      }

      console.log(`✅ Product-embedding linking completed: ${embeddingsCreated}/${totalAttempted} embeddings created`);
      return { embeddingsCreated, totalAttempted };
    } catch (error) {
      console.error('Error linking product to embeddings:', error);
      throw new Error(`Failed to link product to embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get complete product entity graph
   */
  static async getProductEntityGraph(productId: string): Promise<ProductEntityGraph> {
    console.log(`📊 Fetching product entity graph for ${productId}...`);

    try {
      // Get product
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        throw new Error(`Product not found: ${productId}`);
      }

      // Get source chunks
      const { data: chunkRelationships } = await supabase
        .from('product_chunk_relationships')
        .select('chunk_id')
        .eq('product_id', productId);

      const chunkIds = chunkRelationships?.map(r => r.chunk_id) || [];
      const { data: sourceChunks } = await supabase
        .from('document_chunks')
        .select('*')
        .in('id', chunkIds);

      // Get images
      const { data: productImages } = await supabase
        .from('product_images')
        .select('image_id')
        .eq('product_id', productId);

      const imageIds = productImages?.map(pi => pi.image_id).filter(Boolean) || [];
      const { data: images } = await supabase
        .from('document_images')
        .select('*')
        .in('id', imageIds);

      // Get embeddings
      const { data: embeddings } = await supabase
        .from('product_embeddings')
        .select('*')
        .eq('product_id', productId);

      // Get metafields
      const { data: metafields } = await supabase
        .from('product_metafield_values')
        .select('*')
        .eq('entity_id', productId);

      console.log(`✅ Product entity graph fetched:`);
      console.log(`   - Chunks: ${sourceChunks?.length || 0}`);
      console.log(`   - Images: ${images?.length || 0}`);
      console.log(`   - Embeddings: ${embeddings?.length || 0}`);
      console.log(`   - Metafields: ${metafields?.length || 0}`);

      return {
        product,
        sourceChunks: sourceChunks || [],
        images: images || [],
        embeddings: embeddings || [],
        metafields: metafields || [],
      };
    } catch (error) {
      console.error('Error fetching product entity graph:', error);
      throw new Error(`Failed to fetch product entity graph: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all products with their entity graphs (NO LIMIT - fetches all products)
   */
  static async getAllProductsWithGraphs(): Promise<ProductEntityGraph[]> {
    console.log(`📊 Fetching ALL products with entity graphs (no limit)...`);

    try {
      // Fetch ALL products without limit
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id');

      if (productsError || !products) {
        throw new Error('Failed to fetch products');
      }

      console.log(`📊 Found ${products.length} total products to process...`);

      const graphs: ProductEntityGraph[] = [];

      for (const product of products) {
        try {
          const graph = await this.getProductEntityGraph(product.id);
          graphs.push(graph);
        } catch (error) {
          console.warn(`⚠️ Failed to fetch graph for product ${product.id}:`, error);
        }
      }

      console.log(`✅ Fetched ${graphs.length} product entity graphs (ALL products)`);
      return graphs;
    } catch (error) {
      console.error('Error fetching all product entity graphs:', error);
      throw new Error(`Failed to fetch product entity graphs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL chunks (infinite - no limit)
   */
  static async getAllChunks(): Promise<DocumentChunk[]> {
    console.log(`📝 Fetching ALL chunks (no limit)...`);

    try {
      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${chunks?.length || 0} total chunks`);
      return chunks || [];
    } catch (error) {
      console.error('Error fetching all chunks:', error);
      throw new Error(`Failed to fetch chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL images (infinite - no limit)
   */
  static async getAllImages(): Promise<DocumentImage[]> {
    console.log(`🖼️ Fetching ALL images (no limit)...`);

    try {
      const { data: images, error } = await supabase
        .from('document_images')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${images?.length || 0} total images`);
      return images || [];
    } catch (error) {
      console.error('Error fetching all images:', error);
      throw new Error(`Failed to fetch images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL embeddings (infinite - no limit)
   */
  static async getAllEmbeddings(): Promise<any[]> {
    console.log(`📊 Fetching ALL embeddings (no limit)...`);

    try {
      const { data: embeddings, error } = await supabase
        .from('document_vectors')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${embeddings?.length || 0} total embeddings`);
      return embeddings || [];
    } catch (error) {
      console.error('Error fetching all embeddings:', error);
      throw new Error(`Failed to fetch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL product embeddings (infinite - no limit)
   */
  static async getAllProductEmbeddings(): Promise<any[]> {
    console.log(`📊 Fetching ALL product embeddings (no limit)...`);

    try {
      const { data: embeddings, error } = await supabase
        .from('product_embeddings')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${embeddings?.length || 0} total product embeddings`);
      return embeddings || [];
    } catch (error) {
      console.error('Error fetching all product embeddings:', error);
      throw new Error(`Failed to fetch product embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL metafields (infinite - no limit)
   */
  static async getAllMetafields(): Promise<EntityMetafieldValue[]> {
    console.log(`🏷️ Fetching ALL metafields (no limit)...`);

    try {
      const { data: metafields, error } = await supabase
        .from('product_metafield_values')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${metafields?.length || 0} total metafields`);
      return metafields || [];
    } catch (error) {
      console.error('Error fetching all metafields:', error);
      throw new Error(`Failed to fetch metafields: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL chunk metafields (infinite - no limit)
   */
  static async getAllChunkMetafields(): Promise<EntityMetafieldValue[]> {
    console.log(`🏷️ Fetching ALL chunk metafields (no limit)...`);

    try {
      const { data: metafields, error } = await supabase
        .from('chunk_metafield_values')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${metafields?.length || 0} total chunk metafields`);
      return metafields || [];
    } catch (error) {
      console.error('Error fetching all chunk metafields:', error);
      throw new Error(`Failed to fetch chunk metafields: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL image metafields (infinite - no limit)
   */
  static async getAllImageMetafields(): Promise<EntityMetafieldValue[]> {
    console.log(`🏷️ Fetching ALL image metafields (no limit)...`);

    try {
      const { data: metafields, error } = await supabase
        .from('image_metafield_values')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${metafields?.length || 0} total image metafields`);
      return metafields || [];
    } catch (error) {
      console.error('Error fetching all image metafields:', error);
      throw new Error(`Failed to fetch image metafields: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL material metafields (infinite - no limit)
   */
  static async getAllMaterialMetafields(): Promise<EntityMetafieldValue[]> {
    console.log(`🏷️ Fetching ALL material metafields (no limit)...`);

    try {
      const { data: metafields, error } = await supabase
        .from('material_metafield_values')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${metafields?.length || 0} total material metafields`);
      return metafields || [];
    } catch (error) {
      console.error('Error fetching all material metafields:', error);
      throw new Error(`Failed to fetch material metafields: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ALL materials (infinite - no limit)
   */
  static async getAllMaterials(): Promise<any[]> {
    console.log(`📦 Fetching ALL materials (no limit)...`);

    try {
      const { data: materials, error } = await supabase
        .from('materials_catalog')
        .select('*');

      if (error) throw error;

      console.log(`✅ Fetched ${materials?.length || 0} total materials`);
      return materials || [];
    } catch (error) {
      console.error('Error fetching all materials:', error);
      throw new Error(`Failed to fetch materials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get complete knowledge base (ALL entities - infinite)
   */
  static async getCompleteKnowledgeBase(): Promise<{
    products: ProductEntityGraph[];
    chunks: DocumentChunk[];
    images: DocumentImage[];
    embeddings: any[];
    productEmbeddings: any[];
    materials: any[];
    metafields: {
      products: EntityMetafieldValue[];
      chunks: EntityMetafieldValue[];
      images: EntityMetafieldValue[];
      materials: EntityMetafieldValue[];
    };
  }> {
    console.log(`📚 Fetching COMPLETE knowledge base (ALL entities, no limits)...`);

    try {
      const [
        products,
        chunks,
        images,
        embeddings,
        productEmbeddings,
        materials,
        productMetafields,
        chunkMetafields,
        imageMetafields,
        materialMetafields,
      ] = await Promise.all([
        this.getAllProductsWithGraphs(),
        this.getAllChunks(),
        this.getAllImages(),
        this.getAllEmbeddings(),
        this.getAllProductEmbeddings(),
        this.getAllMaterials(),
        this.getAllMetafields(),
        this.getAllChunkMetafields(),
        this.getAllImageMetafields(),
        this.getAllMaterialMetafields(),
      ]);

      console.log(`✅ Complete knowledge base fetched:`);
      console.log(`   📦 Products: ${products.length}`);
      console.log(`   📝 Chunks: ${chunks.length}`);
      console.log(`   🖼️ Images: ${images.length}`);
      console.log(`   📊 Embeddings: ${embeddings.length}`);
      console.log(`   📊 Product Embeddings: ${productEmbeddings.length}`);
      console.log(`   📦 Materials: ${materials.length}`);
      console.log(`   🏷️ Product Metafields: ${productMetafields.length}`);
      console.log(`   🏷️ Chunk Metafields: ${chunkMetafields.length}`);
      console.log(`   🏷️ Image Metafields: ${imageMetafields.length}`);
      console.log(`   🏷️ Material Metafields: ${materialMetafields.length}`);

      return {
        products,
        chunks,
        images,
        embeddings,
        productEmbeddings,
        materials,
        metafields: {
          products: productMetafields,
          chunks: chunkMetafields,
          images: imageMetafields,
          materials: materialMetafields,
        },
      };
    } catch (error) {
      console.error('Error fetching complete knowledge base:', error);
      throw new Error(`Failed to fetch knowledge base: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Paginate products (fetch ALL, display 20 per page)
   */
  static async getPaginatedProducts(
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<ProductEntityGraph>> {
    console.log(`📦 Fetching paginated products (page ${page}, size ${pageSize})...`);

    try {
      // Fetch ALL products
      const allProducts = await this.getAllProductsWithGraphs();

      // Calculate pagination
      const total = allProducts.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      // Validate page
      if (page < 1 || page > totalPages) {
        throw new Error(`Invalid page number. Total pages: ${totalPages}`);
      }

      // Get page data
      const data = allProducts.slice(startIndex, endIndex);

      console.log(`✅ Paginated products: ${data.length}/${total} (page ${page}/${totalPages})`);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      console.error('Error fetching paginated products:', error);
      throw new Error(`Failed to fetch paginated products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Paginate chunks (fetch ALL, display 20 per page)
   */
  static async getPaginatedChunks(
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<DocumentChunk>> {
    console.log(`📝 Fetching paginated chunks (page ${page}, size ${pageSize})...`);

    try {
      const allChunks = await this.getAllChunks();
      const total = allChunks.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      if (page < 1 || page > totalPages) {
        throw new Error(`Invalid page number. Total pages: ${totalPages}`);
      }

      const data = allChunks.slice(startIndex, endIndex);

      console.log(`✅ Paginated chunks: ${data.length}/${total} (page ${page}/${totalPages})`);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      console.error('Error fetching paginated chunks:', error);
      throw new Error(`Failed to fetch paginated chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Paginate images (fetch ALL, display 20 per page)
   */
  static async getPaginatedImages(
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<DocumentImage>> {
    console.log(`🖼️ Fetching paginated images (page ${page}, size ${pageSize})...`);

    try {
      const allImages = await this.getAllImages();
      const total = allImages.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      if (page < 1 || page > totalPages) {
        throw new Error(`Invalid page number. Total pages: ${totalPages}`);
      }

      const data = allImages.slice(startIndex, endIndex);

      console.log(`✅ Paginated images: ${data.length}/${total} (page ${page}/${totalPages})`);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      console.error('Error fetching paginated images:', error);
      throw new Error(`Failed to fetch paginated images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Paginate materials (fetch ALL, display 20 per page)
   */
  static async getPaginatedMaterials(
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<any>> {
    console.log(`📦 Fetching paginated materials (page ${page}, size ${pageSize})...`);

    try {
      const allMaterials = await this.getAllMaterials();
      const total = allMaterials.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      if (page < 1 || page > totalPages) {
        throw new Error(`Invalid page number. Total pages: ${totalPages}`);
      }

      const data = allMaterials.slice(startIndex, endIndex);

      console.log(`✅ Paginated materials: ${data.length}/${total} (page ${page}/${totalPages})`);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      console.error('Error fetching paginated materials:', error);
      throw new Error(`Failed to fetch paginated materials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Paginate embeddings (fetch ALL, display 20 per page)
   */
  static async getPaginatedEmbeddings(
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<any>> {
    console.log(`📊 Fetching paginated embeddings (page ${page}, size ${pageSize})...`);

    try {
      const allEmbeddings = await this.getAllEmbeddings();
      const total = allEmbeddings.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      if (page < 1 || page > totalPages) {
        throw new Error(`Invalid page number. Total pages: ${totalPages}`);
      }

      const data = allEmbeddings.slice(startIndex, endIndex);

      console.log(`✅ Paginated embeddings: ${data.length}/${total} (page ${page}/${totalPages})`);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      console.error('Error fetching paginated embeddings:', error);
      throw new Error(`Failed to fetch paginated embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Paginate metafields (fetch ALL, display 20 per page)
   */
  static async getPaginatedMetafields(
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<EntityMetafieldValue>> {
    console.log(`🏷️ Fetching paginated metafields (page ${page}, size ${pageSize})...`);

    try {
      const allMetafields = await this.getAllMetafields();
      const total = allMetafields.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      if (page < 1 || page > totalPages) {
        throw new Error(`Invalid page number. Total pages: ${totalPages}`);
      }

      const data = allMetafields.slice(startIndex, endIndex);

      console.log(`✅ Paginated metafields: ${data.length}/${total} (page ${page}/${totalPages})`);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      console.error('Error fetching paginated metafields:', error);
      throw new Error(`Failed to fetch paginated metafields: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

