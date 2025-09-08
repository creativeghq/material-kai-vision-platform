import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import standardized Edge Function response types
import {
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Vector similarity search interfaces
interface VisualSearchMatch {
  material_id?: string;
  analysis_id: string;
  image_url: string;
  similarity_score: number;
  distance_metric: number;
  match_type: 'color' | 'texture' | 'material' | 'combined';
  material_data?: {
    name: string;
    category: string;
    properties: Record<string, any>;
    description: string;
  };
  visual_features?: {
    dominant_colors: Array<{ color: string; name: string; percentage: number }>;
    texture_description: string;
    material_classification: string;
  };
  confidence_breakdown: {
    color_match: number;
    texture_match: number;
    material_match: number;
    spatial_match: number;
  };
}

interface VisualSearchQueryRequest {
  // Query input methods
  query_image_url?: string;
  query_image_data?: string; // Base64
  query_vector?: number[]; // Direct vector input
  query_text?: string; // Text description for semantic search
  analysis_id?: string; // Use existing analysis as query
  
  // Search parameters
  search_type: 'color' | 'texture' | 'material' | 'combined' | 'semantic';
  similarity_threshold?: number;
  max_results?: number;
  distance_metric?: 'cosine' | 'euclidean' | 'inner_product';
  
  // Filtering options
  material_categories?: string[];
  color_filters?: {
    dominant_colors?: string[];
    color_temperature?: 'warm' | 'cool' | 'neutral';
    exclude_colors?: string[];
  };
  texture_filters?: {
    roughness_range?: [number, number];
    texture_scale?: 'fine' | 'medium' | 'coarse';
    pattern_types?: string[];
  };
  property_filters?: {
    durability?: string[];
    sustainability?: string[];
    applications?: string[];
  };
  
  // Context and user info
  user_id?: string;
  workspace_id?: string;
}

interface VisualSearchQueryResult {
  query_id: string;
  query_metadata: {
    search_type: string;
    similarity_threshold: number;
    max_results: number;
    distance_metric: string;
    applied_filters: string[];
  };
  matches: VisualSearchMatch[];
  search_statistics: {
    total_candidates: number;
    matches_found: number;
    average_similarity: number;
    search_time_ms: number;
    vector_dimension: number;
  };
  recommendations?: {
    related_searches: string[];
    filter_suggestions: string[];
    quality_insights: string;
  };
}

async function generateQueryVector(
  queryInput: VisualSearchQueryRequest
): Promise<{ vector: number[]; method: string }> {
  // If direct vector provided, use it
  if (queryInput.query_vector && queryInput.query_vector.length > 0) {
    return {
      vector: queryInput.query_vector,
      method: 'direct_vector'
    };
  }

  // If analysis_id provided, fetch its vector
  if (queryInput.analysis_id) {
    const { data, error } = await supabase
      .from('visual_search_embeddings')
      .select('embedding_vector')
      .eq('analysis_id', queryInput.analysis_id)
      .single();

    if (!error && data?.embedding_vector) {
      return {
        vector: data.embedding_vector,
        method: 'existing_analysis'
      };
    }
  }

  // If image provided, analyze it first
  if (queryInput.query_image_url || queryInput.query_image_data) {
    // Call the visual-search-analyze function to get embeddings
    const analyzeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/visual-search-analyze`;
    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        image_url: queryInput.query_image_url,
        image_data: queryInput.query_image_data,
        analysis_depth: 'standard',
        focus_areas: ['color', 'texture', 'material', 'spatial'],
        user_id: queryInput.user_id,
        workspace_id: queryInput.workspace_id
      })
    });

    if (analyzeResponse.ok) {
      const analyzeData = await analyzeResponse.json();
      const combinedVector = analyzeData.data?.analysis_result?.similarity_vectors?.combined_vector;
      
      if (combinedVector && combinedVector.length > 0) {
        return {
          vector: combinedVector,
          method: 'image_analysis'
        };
      }
    }
  }

  // If text query provided, generate text embeddings (placeholder for future text embedding service)
  if (queryInput.query_text) {
    // This would integrate with a text embedding service
    // For now, return a placeholder vector
    const textVector = new Array(512).fill(0).map(() => Math.random() - 0.5);
    return {
      vector: textVector,
      method: 'text_embedding'
    };
  }

  throw new Error('No valid query input provided for vector generation');
}

async function performVectorSimilaritySearch(
  queryVector: number[],
  searchParams: VisualSearchQueryRequest
): Promise<VisualSearchMatch[]> {
  const similarity_threshold = searchParams.similarity_threshold || 0.7;
  const max_results = Math.min(searchParams.max_results || 20, 100); // Cap at 100
  const distance_metric = searchParams.distance_metric || 'cosine';

  // Build the base query
  let query = supabase
    .from('visual_search_embeddings')
    .select(`
      analysis_id,
      image_url,
      analysis_metadata,
      embedding_vector,
      created_at,
      visual_search_analysis!inner(
        color_analysis,
        texture_analysis,
        material_classification,
        confidence_scores
      )
    `);

  // Apply material category filters
  if (searchParams.material_categories && searchParams.material_categories.length > 0) {
    // This would require a join with materials catalog or filtering on analysis results
    // For now, we'll filter post-query
  }

  const { data: searchResults, error: searchError } = await query
    .limit(max_results * 2); // Get more candidates for filtering

  if (searchError) {
    console.error('Vector search error:', searchError);
    throw new Error(`Database search failed: ${searchError.message}`);
  }

  if (!searchResults || searchResults.length === 0) {
    return [];
  }

  // Calculate similarity scores
  const matches: VisualSearchMatch[] = searchResults.map((result: any) => {
    const storedVector = result.embedding_vector;
    let similarityScore = 0;

    if (storedVector && storedVector.length === queryVector.length) {
      // Calculate cosine similarity
      if (distance_metric === 'cosine') {
        const dotProduct = queryVector.reduce((sum, val, i) => sum + val * storedVector[i], 0);
        const magnitudeA = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(storedVector.reduce((sum: number, val: number) => sum + val * val, 0));
        similarityScore = magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
      }
      // Calculate euclidean distance (convert to similarity)
      else if (distance_metric === 'euclidean') {
        const distance = Math.sqrt(
          queryVector.reduce((sum, val, i) => sum + Math.pow(val - storedVector[i], 2), 0)
        );
        similarityScore = 1 / (1 + distance); // Convert distance to similarity
      }
      // Calculate inner product
      else if (distance_metric === 'inner_product') {
        similarityScore = queryVector.reduce((sum, val, i) => sum + val * storedVector[i], 0);
      }
    }

    // Extract confidence breakdown from stored analysis
    const analysisData = result.visual_search_analysis?.[0];
    const confidenceScores = analysisData?.confidence_scores || {};

    return {
      analysis_id: result.analysis_id,
      image_url: result.image_url,
      similarity_score: similarityScore,
      distance_metric: similarityScore,
      match_type: searchParams.search_type as any,
      visual_features: {
        dominant_colors: analysisData?.color_analysis?.dominant_palette?.dominant_colors || [],
        texture_description: analysisData?.texture_analysis?.primary_texture?.roughness?.toString() || '',
        material_classification: analysisData?.material_classification?.[0]?.material_type || 'unknown'
      },
      confidence_breakdown: {
        color_match: confidenceScores.color_accuracy || 0,
        texture_match: confidenceScores.texture_accuracy || 0,
        material_match: confidenceScores.material_accuracy || 0,
        spatial_match: confidenceScores.overall || 0
      }
    };
  });

  // Filter by similarity threshold and sort by score
  return matches
    .filter(match => match.similarity_score >= similarity_threshold)
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, max_results);
}

async function applyContentFilters(
  matches: VisualSearchMatch[],
  filters: VisualSearchQueryRequest
): Promise<VisualSearchMatch[]> {
  let filteredMatches = [...matches];

  // Apply color filters
  if (filters.color_filters?.dominant_colors) {
    filteredMatches = filteredMatches.filter(match => {
      const matchColors = match.visual_features?.dominant_colors?.map(c => c.color.toLowerCase()) || [];
      return filters.color_filters!.dominant_colors!.some(filterColor => 
        matchColors.includes(filterColor.toLowerCase())
      );
    });
  }

  // Apply material category filters
  if (filters.material_categories && filters.material_categories.length > 0) {
    filteredMatches = filteredMatches.filter(match => {
      const materialType = match.visual_features?.material_classification?.toLowerCase() || '';
      return filters.material_categories!.some(category => 
        materialType.includes(category.toLowerCase())
      );
    });
  }

  return filteredMatches;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    const response = createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Only POST and GET methods are allowed for visual search queries',
      { allowed_methods: ['POST', 'GET'] }
    );
    return createJSONResponse(response, 405);
  }

  try {
    const startTime = Date.now();
    let body: VisualSearchQueryRequest;

    // Handle GET request with query parameters
    if (req.method === 'GET') {
      const url = new URL(req.url);
      body = {
        search_type: (url.searchParams.get('search_type') as any) || 'combined',
        similarity_threshold: parseFloat(url.searchParams.get('similarity_threshold') || '0.7'),
        max_results: parseInt(url.searchParams.get('max_results') || '20'),
        distance_metric: (url.searchParams.get('distance_metric') as any) || 'cosine',
      };

      // Only add optional string properties if they have actual values
      const queryText = url.searchParams.get('query_text');
      if (queryText) {
        body.query_text = queryText;
      }

      const analysisId = url.searchParams.get('analysis_id');
      if (analysisId) {
        body.analysis_id = analysisId;
      }

      const userId = url.searchParams.get('user_id');
      if (userId) {
        body.user_id = userId;
      }

      const workspaceId = url.searchParams.get('workspace_id');
      if (workspaceId) {
        body.workspace_id = workspaceId;
      }

      // Parse array parameters
      const categories = url.searchParams.get('categories');
      if (categories) {
        body.material_categories = categories.split(',').map(c => c.trim());
      }
    } else {
      body = await req.json();
    }

    // Input validation
    const validSearchTypes = ['color', 'texture', 'material', 'combined', 'semantic'];
    if (!validSearchTypes.includes(body.search_type)) {
      const response = createErrorResponse(
        'INVALID_SEARCH_TYPE',
        `Search type must be one of: ${validSearchTypes.join(', ')}`,
        { valid_types: validSearchTypes, provided: body.search_type }
      );
      return createJSONResponse(response, 400);
    }

    // Validate at least one query input
    if (!body.query_image_url && !body.query_image_data && !body.query_vector && !body.query_text && !body.analysis_id) {
      const response = createErrorResponse(
        'MISSING_QUERY_INPUT',
        'At least one query input is required: image_url, image_data, query_vector, query_text, or analysis_id',
        { required_fields: ['query_image_url', 'query_image_data', 'query_vector', 'query_text', 'analysis_id'] }
      );
      return createJSONResponse(response, 400);
    }

    const queryId = `VSQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`Starting visual search query ${queryId} with type: ${body.search_type}`);

    // Step 1: Generate or obtain query vector
    const { vector: queryVector, method: vectorMethod } = await generateQueryVector(body);

    // Step 2: Perform vector similarity search
    const rawMatches = await performVectorSimilaritySearch(queryVector, body);

    // Step 3: Apply content-based filters
    const filteredMatches = await applyContentFilters(rawMatches, body);

    // Step 4: Enhance matches with additional material data
    const enhancedMatches: VisualSearchMatch[] = [];
    
    for (const match of filteredMatches) {
      // Try to find corresponding material in catalog
      const { data: materialData } = await supabase
        .from('materials_catalog')
        .select('id, name, category, subcategory, description, properties')
        .or(`name.ilike.%${match.visual_features?.material_classification || ''}%,category.ilike.%${match.visual_features?.material_classification || ''}%`)
        .limit(1)
        .single();

      // Build enhanced match - only add material_data if we have valid data
      const enhancedMatch: VisualSearchMatch = { ...match };
      if (materialData) {
        enhancedMatch.material_data = {
          name: materialData.name,
          category: materialData.category,
          properties: materialData.properties || {},
          description: materialData.description || ''
        };
      }
      
      enhancedMatches.push(enhancedMatch);
    }

    const searchTime = Date.now() - startTime;

    // Calculate search statistics
    const searchStats = {
      total_candidates: rawMatches.length,
      matches_found: enhancedMatches.length,
      average_similarity: enhancedMatches.length > 0 
        ? enhancedMatches.reduce((sum, match) => sum + match.similarity_score, 0) / enhancedMatches.length 
        : 0,
      search_time_ms: searchTime,
      vector_dimension: queryVector.length
    };

    // Generate recommendations based on search results
    const recommendations = {
      related_searches: generateRelatedSearches(enhancedMatches, body.search_type),
      filter_suggestions: generateFilterSuggestions(enhancedMatches),
      quality_insights: generateQualityInsights(enhancedMatches, searchStats)
    };

    // Store search query for analytics
    try {
      await supabase
        .from('visual_search_queries')
        .insert({
          query_id: queryId,
          user_id: body.user_id,
          workspace_id: body.workspace_id,
          search_type: body.search_type,
          query_method: vectorMethod,
          similarity_threshold: body.similarity_threshold || 0.7,
          max_results: body.max_results || 20,
          distance_metric: body.distance_metric || 'cosine',
          matches_found: enhancedMatches.length,
          average_similarity: searchStats.average_similarity,
          search_time_ms: searchTime,
          applied_filters: {
            material_categories: body.material_categories,
            color_filters: body.color_filters,
            texture_filters: body.texture_filters,
            property_filters: body.property_filters
          },
          created_at: new Date().toISOString()
        });
    } catch (analyticsError) {
      console.error('Failed to store search analytics:', analyticsError);
      // Don't fail the request for analytics issues
    }

    console.log(`Visual search query ${queryId} completed: ${enhancedMatches.length} matches in ${searchTime}ms`);

    // Create standardized success response
    const resultData: VisualSearchQueryResult = {
      query_id: queryId,
      query_metadata: {
        search_type: body.search_type,
        similarity_threshold: body.similarity_threshold || 0.7,
        max_results: body.max_results || 20,
        distance_metric: body.distance_metric || 'cosine',
        applied_filters: [
          ...(body.material_categories ? ['material_categories'] : []),
          ...(body.color_filters ? ['color_filters'] : []),
          ...(body.texture_filters ? ['texture_filters'] : []),
          ...(body.property_filters ? ['property_filters'] : [])
        ]
      },
      matches: enhancedMatches,
      search_statistics: searchStats,
      recommendations
    };

    const response = createSuccessResponse(resultData, {
      processingTime: searchTime,
      version: '1.0.0'
    });

    return createJSONResponse(response);

  } catch (error) {
    console.error('Visual search query error:', error);

    const response = createErrorResponse(
      'VISUAL_SEARCH_QUERY_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred during visual search',
      {
        timestamp: new Date().toISOString(),
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError'
      }
    );

    return createJSONResponse(response, 500);
  }
});

// Helper functions for recommendations
function generateRelatedSearches(matches: VisualSearchMatch[], searchType: string): string[] {
  const suggestions = new Set<string>();
  
  // Add search type variations
  const searchTypes = ['color', 'texture', 'material', 'combined'];
  searchTypes.filter(type => type !== searchType).forEach(type => {
    suggestions.add(`Try ${type}-focused search`);
  });

  // Add material-specific suggestions based on matches
  matches.slice(0, 3).forEach(match => {
    if (match.material_data?.category) {
      suggestions.add(`Search for more ${match.material_data.category} materials`);
    }
  });

  return Array.from(suggestions).slice(0, 5);
}

function generateFilterSuggestions(matches: VisualSearchMatch[]): string[] {
  const suggestions = new Set<string>();

  // Analyze match diversity
  const categories = new Set(matches.map(m => m.material_data?.category).filter(Boolean));
  if (categories.size > 3) {
    suggestions.add('Use material_categories filter to narrow results');
  }

  const colorVariety = new Set(
    matches.flatMap(m => m.visual_features?.dominant_colors?.map(c => c.name) || [])
  );
  if (colorVariety.size > 5) {
    suggestions.add('Apply color_filters to focus on specific colors');
  }

  return Array.from(suggestions).slice(0, 3);
}

function generateQualityInsights(matches: VisualSearchMatch[], stats: any): string {
  if (matches.length === 0) {
    return 'No matches found. Try lowering similarity_threshold or using different query input.';
  }

  if (stats.average_similarity > 0.9) {
    return 'High similarity matches found. Results are very relevant to your query.';
  } else if (stats.average_similarity > 0.7) {
    return 'Good similarity matches found. Consider refining search parameters for better precision.';
  } else {
    return 'Lower similarity matches. Try different search_type or expand similarity_threshold.';
  }
}