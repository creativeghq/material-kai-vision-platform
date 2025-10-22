/**
 * Advanced Multi-Vector Search Service
 * 
 * Implements weighted multi-vector similarity search with configurable weights
 * and hybrid query capabilities across all 6 embedding types:
 * 1. Text (1536D) - Semantic text understanding
 * 2. Visual CLIP (512D) - Visual-text cross-modal understanding
 * 3. Multimodal Fusion (2048D) - Combined text+visual understanding
 * 4. Color (256D) - Color palette and harmony matching
 * 5. Texture (256D) - Surface texture and pattern matching
 * 6. Application (512D) - Use-case and context matching
 */

import { supabase } from '@/integrations/supabase/client';
import { MultiVectorGenerationService } from './multiVectorGenerationService';

// Search query interfaces
export interface MultiVectorSearchQuery {
  text?: string;
  imageData?: string;
  imageUrl?: string;
  colors?: string[];
  texture?: string;
  application?: string;
  weights?: EmbeddingWeights;
  filters?: SearchFilters;
  options?: SearchOptions;
}

export interface EmbeddingWeights {
  text?: number;
  visual?: number;
  multimodal?: number;
  color?: number;
  texture?: number;
  application?: number;
}

export interface SearchFilters {
  categories?: string[];
  priceRange?: [number, number];
  materialTypes?: string[];
  sourceDocuments?: string[];
  dateRange?: [string, string];
  minConfidence?: number;
}

export interface SearchOptions {
  maxResults?: number;
  similarityThreshold?: number;
  includeMetadata?: boolean;
  includeEmbeddings?: boolean;
  searchType?: 'products' | 'chunks' | 'images' | 'all';
  sortBy?: 'similarity' | 'relevance' | 'date' | 'name';
  enableHybridSearch?: boolean;
}

export interface MultiVectorSearchResult {
  id: string;
  type: 'product' | 'chunk' | 'image';
  name?: string;
  title?: string;
  description?: string;
  content?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  category?: string;
  similarity: {
    overall: number;
    text?: number;
    visual?: number;
    multimodal?: number;
    color?: number;
    texture?: number;
    application?: number;
  };
  confidence: number;
  similarity_score?: number;
  quality_score?: number;
  confidence_score?: number;
  metadata?: Record<string, any>;
  embeddings?: Record<string, number[]>;
  tags?: string[];
  properties?: Record<string, any>;
}

export interface SearchResponse {
  success: boolean;
  query: MultiVectorSearchQuery;
  results: MultiVectorSearchResult[];
  totalFound: number;
  searchTime: number;
  metadata: {
    embeddingTypesUsed: string[];
    weightsApplied: EmbeddingWeights;
    filtersApplied: SearchFilters;
    searchStrategy: string;
  };
}

export class MultiVectorSearchService {
  private static readonly DEFAULT_WEIGHTS: EmbeddingWeights = {
    text: 0.25,
    visual: 0.25,
    multimodal: 0.20,
    color: 0.10,
    texture: 0.10,
    application: 0.10,
  };

  private static readonly DEFAULT_OPTIONS: SearchOptions = {
    maxResults: 20,
    similarityThreshold: 0.7,
    includeMetadata: true,
    includeEmbeddings: false,
    searchType: 'products',
    sortBy: 'similarity',
    enableHybridSearch: true,
  };

  /**
   * Perform advanced multi-vector search
   */
  static async search(query: MultiVectorSearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    console.log('🔍 Starting multi-vector search:', query);

    try {
      // Normalize weights and options
      const weights = { ...this.DEFAULT_WEIGHTS, ...query.weights };
      const options = { ...this.DEFAULT_OPTIONS, ...query.options };
      const filters = query.filters || {};

      // Generate query embeddings
      const queryEmbeddings = await this.generateQueryEmbeddings(query);
      
      if (!queryEmbeddings || Object.keys(queryEmbeddings).length === 0) {
        throw new Error('Failed to generate query embeddings');
      }

      // Determine search strategy
      const searchStrategy = this.determineSearchStrategy(queryEmbeddings, options);
      console.log(`📊 Search strategy: ${searchStrategy}`);

      // Perform search based on type
      let results: MultiVectorSearchResult[] = [];
      
      if (options.searchType === 'products' || options.searchType === 'all') {
        const productResults = await this.searchProducts(queryEmbeddings, weights, filters, options);
        results.push(...productResults);
      }

      if (options.searchType === 'chunks' || options.searchType === 'all') {
        const chunkResults = await this.searchChunks(queryEmbeddings, weights, filters, options);
        results.push(...chunkResults);
      }

      if (options.searchType === 'images' || options.searchType === 'all') {
        const imageResults = await this.searchImages(queryEmbeddings, weights, filters, options);
        results.push(...imageResults);
      }

      // Sort and limit results
      results = this.sortAndLimitResults(results, options);

      const searchTime = Date.now() - startTime;
      console.log(`✅ Multi-vector search completed: ${results.length} results in ${searchTime}ms`);

      return {
        success: true,
        query,
        results,
        totalFound: results.length,
        searchTime,
        metadata: {
          embeddingTypesUsed: Object.keys(queryEmbeddings),
          weightsApplied: weights,
          filtersApplied: filters,
          searchStrategy,
        },
      };

    } catch (error) {
      console.error('❌ Multi-vector search error:', error);
      return {
        success: false,
        query,
        results: [],
        totalFound: 0,
        searchTime: Date.now() - startTime,
        metadata: {
          embeddingTypesUsed: [],
          weightsApplied: query.weights || this.DEFAULT_WEIGHTS,
          filtersApplied: query.filters || {},
          searchStrategy: 'error',
        },
      };
    }
  }

  /**
   * Generate embeddings for the search query
   */
  private static async generateQueryEmbeddings(
    query: MultiVectorSearchQuery
  ): Promise<Record<string, number[]>> {
    const embeddings: Record<string, number[]> = {};

    // Generate text embedding
    if (query.text) {
      const textEmbedding = await this.generateTextEmbedding(query.text);
      if (textEmbedding) {
        embeddings.text = textEmbedding;
      }
    }

    // Generate visual embedding
    if (query.imageData || query.imageUrl) {
      const imageSource = query.imageData || query.imageUrl!;
      const visualEmbedding = await this.generateVisualEmbedding(imageSource);
      if (visualEmbedding) {
        embeddings.visual = visualEmbedding;
      }
    }

    // Generate multimodal fusion embedding
    if (embeddings.text && embeddings.visual) {
      embeddings.multimodal = [...embeddings.text, ...embeddings.visual];
    }

    // Generate color embedding
    if (query.colors && query.colors.length > 0) {
      const colorEmbedding = await this.generateColorEmbedding(query.colors);
      if (colorEmbedding) {
        embeddings.color = colorEmbedding;
      }
    }

    // Generate texture embedding
    if (query.texture) {
      const textureEmbedding = await this.generateTextureEmbedding(query.texture);
      if (textureEmbedding) {
        embeddings.texture = textureEmbedding;
      }
    }

    // Generate application embedding
    if (query.application) {
      const applicationEmbedding = await this.generateApplicationEmbedding(query.application);
      if (applicationEmbedding) {
        embeddings.application = applicationEmbedding;
      }
    }

    return embeddings;
  }

  /**
   * Determine optimal search strategy based on available embeddings
   */
  private static determineSearchStrategy(
    queryEmbeddings: Record<string, number[]>,
    options: SearchOptions
  ): string {
    const embeddingTypes = Object.keys(queryEmbeddings);
    
    if (embeddingTypes.length === 1) {
      return `single-vector-${embeddingTypes[0]}`;
    } else if (embeddingTypes.includes('multimodal')) {
      return 'multimodal-fusion';
    } else if (embeddingTypes.includes('text') && embeddingTypes.includes('visual')) {
      return 'text-visual-hybrid';
    } else {
      return `multi-vector-${embeddingTypes.length}`;
    }
  }

  /**
   * Search products using multi-vector similarity
   */
  private static async searchProducts(
    queryEmbeddings: Record<string, number[]>,
    weights: EmbeddingWeights,
    filters: SearchFilters,
    options: SearchOptions
  ): Promise<MultiVectorSearchResult[]> {
    try {
      // Build the SQL query for multi-vector similarity search
      const embeddingComparisons: string[] = [];
      const embeddingTypes = Object.keys(queryEmbeddings);

      // Add similarity calculations for each embedding type
      if (queryEmbeddings.text && weights.text! > 0) {
        const textVector = `[${queryEmbeddings.text.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (text_embedding_1536 <=> '${textVector}'::vector)) * ${weights.text} as text_similarity`
        );
      }

      if (queryEmbeddings.visual && weights.visual! > 0) {
        const visualVector = `[${queryEmbeddings.visual.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (visual_clip_embedding_512 <=> '${visualVector}'::vector)) * ${weights.visual} as visual_similarity`
        );
      }

      if (queryEmbeddings.color && weights.color! > 0) {
        const colorVector = `[${queryEmbeddings.color.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (color_embedding_256 <=> '${colorVector}'::vector)) * ${weights.color} as color_similarity`
        );
      }

      if (queryEmbeddings.texture && weights.texture! > 0) {
        const textureVector = `[${queryEmbeddings.texture.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (texture_embedding_256 <=> '${textureVector}'::vector)) * ${weights.texture} as texture_similarity`
        );
      }

      if (queryEmbeddings.application && weights.application! > 0) {
        const applicationVector = `[${queryEmbeddings.application.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (application_embedding_512 <=> '${applicationVector}'::vector)) * ${weights.application} as application_similarity`
        );
      }

      if (embeddingComparisons.length === 0) {
        return [];
      }

      // Build the complete query
      const similarityCalculation = embeddingComparisons.join(' + ');
      const overallSimilarity = `(${similarityCalculation}) as overall_similarity`;

      let whereConditions = ['1=1'];
      
      // Add filters
      if (filters.categories && filters.categories.length > 0) {
        whereConditions.push(`category_id IN ('${filters.categories.join("','")}')`);
      }
      
      if (filters.sourceDocuments && filters.sourceDocuments.length > 0) {
        whereConditions.push(`source_document_id IN ('${filters.sourceDocuments.join("','")}')`);
      }

      if (filters.minConfidence) {
        whereConditions.push(`(${similarityCalculation}) >= ${filters.minConfidence}`);
      }

      const query = `
        SELECT 
          id,
          name,
          description,
          long_description,
          category_id,
          source_document_id,
          properties,
          specifications,
          metadata,
          ${embeddingComparisons.join(',\n          ')},
          ${overallSimilarity}
        FROM products 
        WHERE ${whereConditions.join(' AND ')}
          AND (${embeddingComparisons.map(comp => comp.split(' as ')[0].replace(/\* \d+\.?\d*/, '')).join(' IS NOT NULL OR ')}) IS NOT NULL
        ORDER BY overall_similarity DESC
        LIMIT ${options.maxResults}
      `;

      console.log('🔍 Executing product search query...');
      const { data: products, error } = await supabase.rpc('execute_raw_sql', { query });

      if (error) {
        console.error('❌ Product search error:', error);
        return [];
      }

      // Transform results
      return (products || []).map((product: any) => ({
        id: product.id,
        type: 'product' as const,
        name: product.name,
        description: product.description || product.long_description,
        similarity: {
          overall: product.overall_similarity || 0,
          text: product.text_similarity || undefined,
          visual: product.visual_similarity || undefined,
          color: product.color_similarity || undefined,
          texture: product.texture_similarity || undefined,
          application: product.application_similarity || undefined,
        },
        confidence: product.overall_similarity || 0,
        metadata: {
          category_id: product.category_id,
          source_document_id: product.source_document_id,
          properties: product.properties,
          specifications: product.specifications,
          ...product.metadata,
        },
      }));

    } catch (error) {
      console.error('❌ Product search error:', error);
      return [];
    }
  }

  /**
   * Search chunks using multi-vector similarity
   */
  private static async searchChunks(
    queryEmbeddings: Record<string, number[]>,
    weights: EmbeddingWeights,
    filters: SearchFilters,
    options: SearchOptions
  ): Promise<MultiVectorSearchResult[]> {
    try {
      const embeddingComparisons: string[] = [];

      if (queryEmbeddings.text && weights.text! > 0) {
        const textVector = `[${queryEmbeddings.text.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (text_embedding_1536 <=> '${textVector}'::vector)) * ${weights.text} as text_similarity`
        );
      }

      if (queryEmbeddings.visual && weights.visual! > 0) {
        const visualVector = `[${queryEmbeddings.visual.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (visual_clip_embedding_512 <=> '${visualVector}'::vector)) * ${weights.visual} as visual_similarity`
        );
      }

      if (embeddingComparisons.length === 0) {
        return [];
      }

      const similarityCalculation = embeddingComparisons.join(' + ');
      const overallSimilarity = `(${similarityCalculation}) as overall_similarity`;

      let whereConditions = ['1=1'];

      if (filters.sourceDocuments && filters.sourceDocuments.length > 0) {
        whereConditions.push(`document_id IN ('${filters.sourceDocuments.join("','")}')`);
      }

      if (filters.minConfidence) {
        whereConditions.push(`(${similarityCalculation}) >= ${filters.minConfidence}`);
      }

      const query = `
        SELECT
          chunk_id as id,
          content,
          document_id,
          metadata,
          ${embeddingComparisons.join(',\n          ')},
          ${overallSimilarity}
        FROM document_vectors
        WHERE ${whereConditions.join(' AND ')}
          AND (${embeddingComparisons.map(comp => comp.split(' as ')[0].replace(/\* \d+\.?\d*/, '')).join(' IS NOT NULL OR ')}) IS NOT NULL
        ORDER BY overall_similarity DESC
        LIMIT ${options.maxResults}
      `;

      const { data: chunks, error } = await supabase.rpc('execute_raw_sql', { query });

      if (error) {
        console.error('❌ Chunk search error:', error);
        return [];
      }

      return (chunks || []).map((chunk: any) => ({
        id: chunk.id,
        type: 'chunk' as const,
        content: chunk.content,
        similarity: {
          overall: chunk.overall_similarity || 0,
          text: chunk.text_similarity || undefined,
          visual: chunk.visual_similarity || undefined,
        },
        confidence: chunk.overall_similarity || 0,
        metadata: {
          document_id: chunk.document_id,
          ...chunk.metadata,
        },
      }));

    } catch (error) {
      console.error('❌ Chunk search error:', error);
      return [];
    }
  }

  /**
   * Search images using multi-vector similarity
   */
  private static async searchImages(
    queryEmbeddings: Record<string, number[]>,
    weights: EmbeddingWeights,
    filters: SearchFilters,
    options: SearchOptions
  ): Promise<MultiVectorSearchResult[]> {
    try {
      const embeddingComparisons: string[] = [];

      if (queryEmbeddings.visual && weights.visual! > 0) {
        const visualVector = `[${queryEmbeddings.visual.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (visual_clip_embedding_512 <=> '${visualVector}'::vector)) * ${weights.visual} as visual_similarity`
        );
      }

      if (queryEmbeddings.color && weights.color! > 0) {
        const colorVector = `[${queryEmbeddings.color.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (color_embedding_256 <=> '${colorVector}'::vector)) * ${weights.color} as color_similarity`
        );
      }

      if (queryEmbeddings.texture && weights.texture! > 0) {
        const textureVector = `[${queryEmbeddings.texture.join(',')}]`;
        embeddingComparisons.push(
          `(1 - (texture_embedding_256 <=> '${textureVector}'::vector)) * ${weights.texture} as texture_similarity`
        );
      }

      if (embeddingComparisons.length === 0) {
        return [];
      }

      const similarityCalculation = embeddingComparisons.join(' + ');
      const overallSimilarity = `(${similarityCalculation}) as overall_similarity`;

      let whereConditions = ['1=1'];

      if (filters.sourceDocuments && filters.sourceDocuments.length > 0) {
        whereConditions.push(`source_document_id IN ('${filters.sourceDocuments.join("','")}')`);
      }

      if (filters.minConfidence) {
        whereConditions.push(`(${similarityCalculation}) >= ${filters.minConfidence}`);
      }

      const query = `
        SELECT
          id,
          image_url,
          caption,
          alt_text,
          image_type,
          source_document_id,
          metadata,
          ${embeddingComparisons.join(',\n          ')},
          ${overallSimilarity}
        FROM document_images
        WHERE ${whereConditions.join(' AND ')}
          AND (${embeddingComparisons.map(comp => comp.split(' as ')[0].replace(/\* \d+\.?\d*/, '')).join(' IS NOT NULL OR ')}) IS NOT NULL
        ORDER BY overall_similarity DESC
        LIMIT ${options.maxResults}
      `;

      const { data: images, error } = await supabase.rpc('execute_raw_sql', { query });

      if (error) {
        console.error('❌ Image search error:', error);
        return [];
      }

      return (images || []).map((image: any) => ({
        id: image.id,
        type: 'image' as const,
        name: image.caption || image.alt_text,
        description: image.caption,
        imageUrl: image.image_url,
        similarity: {
          overall: image.overall_similarity || 0,
          visual: image.visual_similarity || undefined,
          color: image.color_similarity || undefined,
          texture: image.texture_similarity || undefined,
        },
        confidence: image.overall_similarity || 0,
        metadata: {
          image_type: image.image_type,
          source_document_id: image.source_document_id,
          ...image.metadata,
        },
      }));

    } catch (error) {
      console.error('❌ Image search error:', error);
      return [];
    }
  }

  /**
   * Sort and limit search results
   */
  private static sortAndLimitResults(
    results: MultiVectorSearchResult[],
    options: SearchOptions
  ): MultiVectorSearchResult[] {
    // Sort by the specified criteria
    switch (options.sortBy) {
      case 'similarity':
        results.sort((a, b) => b.similarity.overall - a.similarity.overall);
        break;
      case 'relevance':
        // Custom relevance scoring (combination of similarity and confidence)
        results.sort((a, b) => {
          const aRelevance = a.similarity.overall * a.confidence;
          const bRelevance = b.similarity.overall * b.confidence;
          return bRelevance - aRelevance;
        });
        break;
      case 'name':
        results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      default:
        // Default to similarity
        results.sort((a, b) => b.similarity.overall - a.similarity.overall);
    }

    // Apply similarity threshold
    if (options.similarityThreshold) {
      results = results.filter(result => result.similarity.overall >= options.similarityThreshold!);
    }

    // Limit results
    return results.slice(0, options.maxResults);
  }

  /**
   * Generate text embedding for query
   */
  private static async generateTextEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'text_embedding_generation',
          payload: {
            text_query: text,
            embedding_type: 'text_similarity',
            options: {
              model: 'text-embedding-3-small',
              dimensions: 1536,
              normalize: true,
            },
          },
        }),
      });

      const result = await response.json();
      return result.success ? result.data.embedding : null;
    } catch (error) {
      console.warn('⚠️ Text embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Generate visual embedding for query
   */
  private static async generateVisualEmbedding(imageSource: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clip_embedding_generation',
          payload: {
            image_data: imageSource,
            embedding_type: 'visual_similarity',
            options: {
              model: 'clip-vit-base-patch32',
              dimensions: 512,
              normalize: true,
            },
          },
        }),
      });

      const result = await response.json();
      return result.success ? result.data.embedding : null;
    } catch (error) {
      console.warn('⚠️ Visual embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Generate color embedding for query
   */
  private static async generateColorEmbedding(colors: string[]): Promise<number[] | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'color_analysis',
          payload: {
            color_palette: colors,
            analysis_type: 'color_palette_embedding',
            options: {
              model: 'color-palette-extractor-v1',
              dimensions: 256,
              normalize: true,
            },
          },
        }),
      });

      const result = await response.json();
      return result.success ? result.data.color_embedding : null;
    } catch (error) {
      console.warn('⚠️ Color embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Generate texture embedding for query
   */
  private static async generateTextureEmbedding(texture: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'texture_analysis',
          payload: {
            texture_description: texture,
            analysis_type: 'texture_pattern_embedding',
            options: {
              model: 'texture-analysis-v1',
              dimensions: 256,
              normalize: true,
            },
          },
        }),
      });

      const result = await response.json();
      return result.success ? result.data.texture_embedding : null;
    } catch (error) {
      console.warn('⚠️ Texture embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Generate application embedding for query
   */
  private static async generateApplicationEmbedding(application: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'application_classification',
          payload: {
            text_query: application,
            classification_type: 'use_case_embedding',
            options: {
              model: 'use-case-classifier-v1',
              dimensions: 512,
              normalize: true,
            },
          },
        }),
      });

      const result = await response.json();
      return result.success ? result.data.application_embedding : null;
    } catch (error) {
      console.warn('⚠️ Application embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  static calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get search performance statistics
   */
  static async getSearchStatistics(): Promise<{
    totalSearches: number;
    averageSearchTime: number;
    embeddingTypeUsage: Record<string, number>;
    searchTypeDistribution: Record<string, number>;
  }> {
    // This would typically be stored in a search analytics table
    // For now, return mock data
    return {
      totalSearches: 0,
      averageSearchTime: 0,
      embeddingTypeUsage: {
        text: 0,
        visual: 0,
        multimodal: 0,
        color: 0,
        texture: 0,
        application: 0,
      },
      searchTypeDistribution: {
        products: 0,
        chunks: 0,
        images: 0,
        all: 0,
      },
    };
  }
}
