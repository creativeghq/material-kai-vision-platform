import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  generateStandardEmbedding,
  generateSemanticAnalysis
} from '../_shared/embedding-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// API Configuration - Now using MIVAA gateway instead of direct API calls
const HUGGING_FACE_API_KEY = Deno.env.get('HUGGING_FACE_API_KEY');

// Core Visual Search Interfaces
interface VisualSearchRequest {
  // Search input options
  query_image?: string; // Base64 encoded image or URL
  query_text?: string; // Text description for hybrid search
  query_embedding?: number[]; // Pre-computed CLIP embedding
  
  // Search configuration
  search_type: 'visual_similarity' | 'semantic_analysis' | 'hybrid' | 'material_properties';
  search_strategy?: 'comprehensive' | 'fast' | 'accurate';
  
  // Filtering options
  filters?: {
    material_types?: string[];
    confidence_threshold?: number;
    similarity_threshold?: number;
    property_filters?: Record<string, any>;
    date_range?: {
      start?: string;
      end?: string;
    };
  };
  
  // Fusion weights for hybrid search
  fusion_weights?: {
    visual_similarity?: number; // 0.0 - 1.0
    semantic_relevance?: number; // 0.0 - 1.0  
    material_properties?: number; // 0.0 - 1.0
    llama_confidence?: number; // 0.0 - 1.0
  };
  
  // Result configuration
  limit?: number;
  offset?: number;
  include_analytics?: boolean;
  include_embeddings?: boolean;
  
  // Context
  user_id?: string;
  workspace_id?: string;
  session_id?: string;
}

interface VisualSearchResult {
  // Material identification
  material_id: string;
  material_name: string;
  material_type: string;
  
  // Analysis data
  visual_analysis: {
    clip_embedding?: number[];
    llama_analysis?: {
      detailed_description: string;
      material_properties: Record<string, any>;
      confidence_score: number;
      visual_features: {
        color_palette?: string[];
        texture_analysis?: string;
        pattern_detection?: string;
        lighting_conditions?: string;
      };
    };
  };
  
  // Scoring and ranking
  scores: {
    visual_similarity_score: number;
    semantic_relevance_score: number;
    material_property_score: number;
    combined_score: number;
    confidence_score: number;
  };
  
  // Metadata
  metadata: {
    source: string;
    created_at: string;
    processing_method: string;
    search_rank: number;
    analysis_timestamp: string;
  };
}

interface SearchResponse {
  results: VisualSearchResult[];
  search_metadata: {
    query_type: string;
    search_strategy: string;
    total_results: number;
    search_time_ms: number;
    fusion_weights_used: Record<string, number>;
    embedding_models_used: string[];
    cache_hit: boolean;
  };
  analytics?: {
    material_type_distribution: Record<string, number>;
    confidence_distribution: {
      high: number; // >= 0.8
      medium: number; // 0.6 - 0.8
      low: number; // < 0.6
    };
    processing_method_distribution: Record<string, number>;
    avg_similarity_score: number;
  };
}

// CLIP Embedding Service (Basic Implementation)
class CLIPEmbeddingService {
  private readonly huggingFaceBaseUrl = 'https://api-inference.huggingface.co';
  private readonly clipModel = 'openai/clip-vit-base-patch32';

  async generateEmbedding(imageData: string): Promise<number[]> {
    if (!HUGGING_FACE_API_KEY) {
      throw new Error('Hugging Face API key not configured');
    }

    try {
      // Convert base64 to buffer if needed
      const imageBuffer = imageData.startsWith('data:image/') 
        ? this.base64ToBuffer(imageData)
        : new TextEncoder().encode(imageData);

      const response = await fetch(`${this.huggingFaceBaseUrl}/models/${this.clipModel}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer as any,
      });

      if (!response.ok) {
        throw new Error(`CLIP API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(`CLIP processing error: ${result.error}`);
      }

      // Return the first embedding (should be 512-dimensional)
      return result.embeddings?.[0] || result[0] || [];
      
    } catch (error) {
      console.error('CLIP embedding generation failed:', error);
      throw new Error(`Failed to generate CLIP embedding: ${error.message}`);
    }
  }

  private base64ToBuffer(base64Data: string): Uint8Array {
    // Remove data URL prefix if present
    const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    
    // Convert base64 to binary string
    const binaryString = atob(base64);
    
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  }
}

// Visual Search Engine Core Class
class VisualSearchEngine {
  private clipService: CLIPEmbeddingService;
  private searchCache: Map<string, any>;

  constructor() {
    this.clipService = new CLIPEmbeddingService();
    this.searchCache = new Map();
  }

  async search(request: VisualSearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    console.log('🔍 Starting visual search:', { 
      type: request.search_type, 
      strategy: request.search_strategy || 'comprehensive'
    });

    try {
      // Input validation
      this.validateSearchRequest(request);

      // Generate cache key
      const cacheKey = this.generateCacheKey(request);
      const cachedResult = this.searchCache.get(cacheKey);
      
      if (cachedResult) {
        console.log('📦 Returning cached result');
        return {
          ...cachedResult,
          search_metadata: {
            ...cachedResult.search_metadata,
            cache_hit: true,
            search_time_ms: Date.now() - startTime
          }
        };
      }

      // Execute search based on type
      let results: VisualSearchResult[] = [];
      
      switch (request.search_type) {
        case 'visual_similarity':
          results = await this.performVisualSimilaritySearch(request);
          break;
        case 'semantic_analysis':
          results = await this.performSemanticAnalysisSearch(request);
          break;
        case 'hybrid':
          results = await this.performHybridSearch(request);
          break;
        case 'material_properties':
          results = await this.performMaterialPropertySearch(request);
          break;
        default:
          throw new Error(`Unsupported search type: ${request.search_type}`);
      }

      // Apply filtering
      results = this.applyFilters(results, request.filters);

      // Rank and score results
      results = this.rankAndScoreResults(results, request);

      // Limit results
      const limit = request.limit || 20;
      const offset = request.offset || 0;
      const paginatedResults = results.slice(offset, offset + limit);

      // Generate response
      const response: SearchResponse = {
        results: paginatedResults,
        search_metadata: {
          query_type: request.search_type,
          search_strategy: request.search_strategy || 'comprehensive',
          total_results: results.length,
          search_time_ms: Date.now() - startTime,
          fusion_weights_used: (request.fusion_weights || this.getDefaultFusionWeights()) as Record<string, number>,
          embedding_models_used: this.getUsedEmbeddingModels(request),
          cache_hit: false
        }
      };

      // Add analytics if requested
      if (request.include_analytics) {
        response.analytics = this.generateAnalytics(results);
      }

      // Cache result (cache for 5 minutes)
      this.searchCache.set(cacheKey, response);
      setTimeout(() => this.searchCache.delete(cacheKey), 5 * 60 * 1000);

      // Log search event
      await this.logSearchEvent(request, response);

      return response;

    } catch (error) {
      console.error('❌ Visual search failed:', error);
      throw new Error(`Visual search failed: ${error.message}`);
    }
  }

  private validateSearchRequest(request: VisualSearchRequest): void {
    if (!request.query_image && !request.query_text && !request.query_embedding) {
      throw new Error('At least one search input (image, text, or embedding) is required');
    }

    if (request.fusion_weights) {
      const weights = Object.values(request.fusion_weights);
      const sum = weights.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1.0) > 0.001) {
        throw new Error('Fusion weights must sum to 1.0');
      }
    }

    if (request.limit && (request.limit < 1 || request.limit > 100)) {
      throw new Error('Limit must be between 1 and 100');
    }
  }

  private generateCacheKey(request: VisualSearchRequest): string {
    // Create a hash-like key from the request (simplified)
    const keyParts = [
      request.search_type,
      request.query_text || '',
      request.query_image?.substring(0, 50) || '',
      JSON.stringify(request.filters || {}),
      JSON.stringify(request.fusion_weights || {}),
      request.limit || 20
    ];
    return btoa(keyParts.join('|')).substring(0, 32);
  }

  private async performVisualSimilaritySearch(request: VisualSearchRequest): Promise<VisualSearchResult[]> {
    console.log('🎯 Performing visual similarity search');
    
    let queryEmbedding: number[];
    
    if (request.query_embedding) {
      queryEmbedding = request.query_embedding;
    } else if (request.query_image) {
      queryEmbedding = await this.clipService.generateEmbedding(request.query_image);
    } else {
      throw new Error('Visual similarity search requires image input or pre-computed embedding');
    }

    // Search using the custom visual_material_search function from our database schema
    const { data, error } = await supabase.rpc('visual_material_search', {
      query_clip_embedding: queryEmbedding,
      similarity_threshold: request.filters?.similarity_threshold || 0.75,
      result_limit: request.limit || 20
    });

    if (error) {
      throw new Error(`Database search failed: ${error.message}`);
    }

    return this.formatSearchResults(data || [], 'visual_similarity');
  }

  private async performSemanticAnalysisSearch(request: VisualSearchRequest): Promise<VisualSearchResult[]> {
    console.log('🧠 Performing semantic analysis search');
    
    if (!request.query_text && !request.query_image) {
      throw new Error('Semantic search requires text query or image for analysis');
    }

    // If we have an image, use LLaMA Vision to analyze it first
    let searchQuery = request.query_text || '';
    
    if (request.query_image && !searchQuery) {
      // Use LLaMA Vision to generate semantic description
      searchQuery = await this.generateSemanticDescription(request.query_image);
    }

    // Generate text embedding for semantic search
    const textEmbedding = await this.generateTextEmbedding(searchQuery);

    // Search using description embeddings (1536D)
    const { data, error } = await supabase.rpc('visual_material_search', {
      query_description_embedding: textEmbedding,
      similarity_threshold: request.filters?.similarity_threshold || 0.7,
      result_limit: request.limit || 20
    });

    if (error) {
      throw new Error(`Semantic search failed: ${error.message}`);
    }

    return this.formatSearchResults(data || [], 'semantic_analysis');
  }

  private async performHybridSearch(request: VisualSearchRequest): Promise<VisualSearchResult[]> {
    console.log('🔄 Performing hybrid search');
    
    // Run multiple search strategies in parallel
    const searchPromises: Promise<VisualSearchResult[]>[] = [];

    // Visual similarity search (if image provided)
    if (request.query_image || request.query_embedding) {
      searchPromises.push(
        this.performVisualSimilaritySearch({
          ...request,
          search_type: 'visual_similarity'
        })
      );
    }

    // Semantic analysis search (if text provided or image for analysis)
    if (request.query_text || request.query_image) {
      searchPromises.push(
        this.performSemanticAnalysisSearch({
          ...request,
          search_type: 'semantic_analysis'
        })
      );
    }

    // Material property search (if applicable filters)
    if (request.filters?.property_filters || request.filters?.material_types) {
      searchPromises.push(
        this.performMaterialPropertySearch({
          ...request,
          search_type: 'material_properties'
        })
      );
    }

    // Wait for all searches to complete
    const searchResults = await Promise.all(searchPromises);

    // Fuse results using weighted ranking
    return this.fuseSearchResults(searchResults, request.fusion_weights);
  }

  private async performMaterialPropertySearch(request: VisualSearchRequest): Promise<VisualSearchResult[]> {
    console.log('🔧 Performing material property search');
    
    const filters = request.filters || {};
    
    // Build property-based query
    let query = supabase
      .from('material_visual_analysis')
      .select(`
        material_id,
        material_type,
        structured_description,
        analysis_confidence,
        visual_embedding_512,
        description_embedding_1536,
        created_at,
        processing_method
      `);

    // Apply material type filter
    if (filters.material_types?.length) {
      query = query.in('material_type', filters.material_types);
    }

    // Apply confidence threshold
    if (filters.confidence_threshold) {
      query = query.gte('analysis_confidence', filters.confidence_threshold);
    }

    // Apply property filters on structured_description JSONB
    if (filters.property_filters) {
      for (const [key, value] of Object.entries(filters.property_filters)) {
        query = query.contains('structured_description', { [key]: value });
      }
    }

    // Apply date range
    if (filters.date_range?.start) {
      query = query.gte('created_at', filters.date_range.start);
    }
    if (filters.date_range?.end) {
      query = query.lte('created_at', filters.date_range.end);
    }

    // Order by confidence and limit
    query = query.order('analysis_confidence', { ascending: false });
    query = query.limit(request.limit || 20);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Property search failed: ${error.message}`);
    }

    return this.formatSearchResults(data || [], 'material_properties');
  }

  private fuseSearchResults(
    searchResults: VisualSearchResult[][],
    fusionWeights?: VisualSearchRequest['fusion_weights']
  ): VisualSearchResult[] {
    console.log('🔀 Fusing search results from multiple strategies');
    
    const weights = fusionWeights || this.getDefaultFusionWeights();
    const materialScores = new Map<string, {
      material: VisualSearchResult;
      scores: Record<string, number>;
      totalScore: number;
    }>();

    // Process results from each search strategy
    searchResults.forEach((results, strategyIndex) => {
      const strategyName = this.getStrategyName(strategyIndex);
      const strategyWeight = weights?.[strategyName as keyof typeof weights] || 0.25;

      results.forEach((result) => {
        const materialId = result.material_id;
        
        if (!materialScores.has(materialId)) {
          materialScores.set(materialId, {
            material: result,
            scores: {},
            totalScore: 0
          });
        }

        const entry = materialScores.get(materialId)!;
        entry.scores[strategyName] = result.scores.combined_score * strategyWeight;
      });
    });

    // Calculate final scores and create fused results
    const fusedResults: VisualSearchResult[] = [];
    
    for (const [materialId, entry] of Array.from(materialScores.entries())) {
      const totalScore = Object.values(entry.scores).reduce((sum: number, score: number) => sum + score, 0);
      
      fusedResults.push({
        ...entry.material,
        scores: {
          ...entry.material.scores,
          combined_score: totalScore
        },
        metadata: {
          ...entry.material.metadata,
          search_rank: fusedResults.length + 1
        }
      });
    }

    // Sort by combined score (descending)
    return fusedResults
      .sort((a, b) => b.scores.combined_score - a.scores.combined_score)
      .map((result, index) => ({
        ...result,
        metadata: {
          ...result.metadata,
          search_rank: index + 1
        }
      }));
  }

  private getStrategyName(index: number): string {
    const strategies = ['visual_similarity', 'semantic_analysis', 'material_properties'];
    return strategies[index] || 'unknown';
  }

  private getDefaultFusionWeights(): Required<VisualSearchRequest['fusion_weights']> {
    return {
      visual_similarity: 0.4,
      semantic_relevance: 0.3,
      material_properties: 0.2,
      llama_confidence: 0.1
    };
  }

  private rankAndScoreResults(results: VisualSearchResult[], request: VisualSearchRequest): VisualSearchResult[] {
    // Enhanced ranking algorithm considering multiple factors
    return results
      .map((result, index) => {
        // Calculate combined score based on multiple factors
        const baseScore = result.scores.combined_score;
        const confidenceBoost = result.scores.confidence_score * 0.1;
        const recencyBoost = this.calculateRecencyBoost(result.metadata.created_at);
        
        const finalScore = Math.min(1.0, baseScore + confidenceBoost + recencyBoost);
        
        return {
          ...result,
          scores: {
            ...result.scores,
            combined_score: finalScore
          },
          metadata: {
            ...result.metadata,
            search_rank: index + 1
          }
        };
      })
      .sort((a, b) => b.scores.combined_score - a.scores.combined_score);
  }

  private calculateRecencyBoost(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const daysDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    
    // Boost recent materials (within 30 days) by up to 0.05
    return Math.max(0, 0.05 * (1 - daysDiff / 30));
  }

  private applyFilters(results: VisualSearchResult[], filters?: VisualSearchRequest['filters']): VisualSearchResult[] {
    if (!filters) return results;

    return results.filter(result => {
      // Material type filter
      if (filters.material_types?.length && !filters.material_types.includes(result.material_type)) {
        return false;
      }

      // Confidence threshold filter
      if (filters.confidence_threshold && result.scores.confidence_score < filters.confidence_threshold) {
        return false;
      }

      // Similarity threshold filter
      if (filters.similarity_threshold && result.scores.visual_similarity_score < filters.similarity_threshold) {
        return false;
      }

      return true;
    });
  }

  private formatSearchResults(data: any[], searchType: string): VisualSearchResult[] {
    return data.map((row, index) => ({
      material_id: row.material_id,
      material_name: row.material_name || `Material ${row.material_id}`,
      material_type: row.material_type,
      visual_analysis: {
        clip_embedding: row.visual_embedding_512 ? JSON.parse(row.visual_embedding_512) : undefined,
        llama_analysis: row.structured_description ? {
          detailed_description: row.structured_description.detailed_description || '',
          material_properties: row.structured_description.material_properties || {},
          confidence_score: row.analysis_confidence || 0,
          visual_features: row.structured_description.visual_features || {}
        } : undefined
      },
      scores: {
        visual_similarity_score: row.visual_similarity_score || 0,
        semantic_relevance_score: row.description_similarity_score || 0,
        material_property_score: row.material_property_score || 0,
        combined_score: row.combined_score || row.visual_similarity_score || 0,
        confidence_score: row.analysis_confidence || 0
      },
      metadata: {
        source: 'visual_search_engine',
        created_at: row.created_at,
        processing_method: row.processing_method || 'unknown',
        search_rank: index + 1,
        analysis_timestamp: new Date().toISOString()
      }
    }));
  }

  private async generateSemanticDescription(imageData: string): Promise<string> {
    // Use enhanced MIVAA service for semantic analysis (replaces direct TogetherAI calls)
    try {
      return await generateSemanticAnalysis(imageData, 'material_identification');
    } catch (error) {
      console.error('Semantic description generation failed:', error);
      // Fallback to generic description
      return 'Material image for visual search analysis';
    }
  }

  private async generateTextEmbedding(text: string): Promise<number[]> {
    // Use enhanced MIVAA service for text embeddings (replaces direct OpenAI calls)
    try {
      return await generateStandardEmbedding(text);
    } catch (error) {
      console.error('Text embedding generation failed:', error);
      throw new Error(`Failed to generate text embedding: ${error.message}`);
    }
  }

  private getUsedEmbeddingModels(request: VisualSearchRequest): string[] {
    const models = [];
    
    if (request.query_image || request.query_embedding) {
      models.push('openai/clip-vit-base-patch32');
    }
    
    if (request.query_text) {
      models.push('text-embedding-3-small (via MIVAA)');
    }
    
    if (request.search_type === 'semantic_analysis' || request.search_type === 'hybrid') {
      models.push('meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo (via MIVAA)');
    }
    
    return models;
  }

  private generateAnalytics(results: VisualSearchResult[]): SearchResponse['analytics'] {
    const materialTypes = new Map<string, number>();
    const confidenceBuckets = { high: 0, medium: 0, low: 0 };
    const processingMethods = new Map<string, number>();
    let totalSimilarity = 0;

    results.forEach(result => {
      // Material type distribution
      const type = result.material_type;
      materialTypes.set(type, (materialTypes.get(type) || 0) + 1);

      // Confidence distribution
      const confidence = result.scores.confidence_score;
      if (confidence >= 0.8) confidenceBuckets.high++;
      else if (confidence >= 0.6) confidenceBuckets.medium++;
      else confidenceBuckets.low++;

      // Processing method distribution
      const method = result.metadata.processing_method;
      processingMethods.set(method, (processingMethods.get(method) || 0) + 1);

      // Average similarity
      totalSimilarity += result.scores.visual_similarity_score;
    });

    return {
      material_type_distribution: Object.fromEntries(materialTypes),
      confidence_distribution: confidenceBuckets,
      processing_method_distribution: Object.fromEntries(processingMethods),
      avg_similarity_score: results.length > 0 ? totalSimilarity / results.length : 0
    };
  }

  private async logSearchEvent(request: VisualSearchRequest, response: SearchResponse): Promise<void> {
    try {
      await supabase.from('visual_search_history').insert({
        user_id: request.user_id,
        workspace_id: request.workspace_id,
        search_type: request.search_type,
        query_text: request.query_text,
        has_query_image: !!request.query_image,
        results_count: response.results.length,
        search_time_ms: response.search_metadata.search_time_ms,
        fusion_weights: request.fusion_weights,
        filters_applied: request.filters,
        cache_hit: response.search_metadata.cache_hit,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to log search event:', error);
      // Don't throw - logging failure shouldn't break search
    }
  }
}

// Main Edge Function Handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Only POST method allowed');
    }

    const request: VisualSearchRequest = await req.json();
    
    console.log('🚀 Visual Search Request:', {
      type: request.search_type,
      hasImage: !!request.query_image,
      hasText: !!request.query_text,
      strategy: request.search_strategy
    });

    // Initialize search engine and perform search
    const searchEngine = new VisualSearchEngine();
    const results = await searchEngine.search(request);

    console.log('✅ Visual search completed:', {
      resultsCount: results.results.length,
      searchTime: results.search_metadata.search_time_ms,
      totalResults: results.search_metadata.total_results
    });

    return new Response(
      JSON.stringify(results),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200,
      }
    );

  } catch (error) {
    console.error('❌ Visual search error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Visual search failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: error.message.includes('validation') ? 400 : 500,
      }
    );
  }
});