/**
 * Chunk-Aware Search Edge Function
 * Performs search with chunk analysis filters and scoring
 *
 * Integrates:
 * - Content classification (product, specification, etc.)
 * - Boundary detection (sentence, paragraph, semantic, etc.)
 * - Validation scores (quality metrics)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

interface ChunkSearchRequest {
  query: string;
  workspace_id: string;
  filters?: {
    content_types?: string[];
    validation_status?: string[];
    min_confidence?: number;
    min_validation_score?: number;
    only_product_boundaries?: boolean;
  };
  limit?: number;
  offset?: number;
}

interface EnhancedSearchResult {
  chunk_id: string;
  content: string;
  classification?: {
    content_type: string;
    confidence: number;
    reasoning?: string;
  };
  boundary?: {
    boundary_type: string;
    boundary_score: number;
    is_product_boundary: boolean;
  };
  validation?: {
    overall_validation_score: number;
    validation_status: string;
    content_quality_score?: number;
  };
  overall_quality: number;
}

Deno.serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body: ChunkSearchRequest = await req.json();
    const { query, workspace_id, filters = {}, limit = 20, offset = 0 } = body;

    // Validate required fields
    if (!query || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: query, workspace_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build the search query
    let searchQuery = supabase
      .from('document_chunks')
      .select(
        `
        id,
        content,
        workspace_id,
        chunk_classifications (
          content_type,
          confidence,
          reasoning,
          sub_categories
        ),
        chunk_boundaries (
          boundary_type,
          boundary_score,
          is_product_boundary
        ),
        chunk_validation_scores (
          overall_validation_score,
          validation_status,
          content_quality_score
        )
      `,
        { count: 'exact' },
      )
      .eq('workspace_id', workspace_id)
      .textSearch('content', query);

    // Apply content type filter
    if (filters.content_types && filters.content_types.length > 0) {
      searchQuery = searchQuery.in('chunk_classifications.content_type', filters.content_types);
    }

    // Apply validation status filter
    if (filters.validation_status && filters.validation_status.length > 0) {
      searchQuery = searchQuery.in('chunk_validation_scores.validation_status', filters.validation_status);
    }

    // Apply confidence threshold
    if (filters.min_confidence) {
      searchQuery = searchQuery.gte('chunk_classifications.confidence', filters.min_confidence);
    }

    // Apply validation score threshold
    if (filters.min_validation_score) {
      searchQuery = searchQuery.gte('chunk_validation_scores.overall_validation_score', filters.min_validation_score);
    }

    // Apply product boundary filter
    if (filters.only_product_boundaries) {
      searchQuery = searchQuery.eq('chunk_boundaries.is_product_boundary', true);
    }

    // Apply pagination
    searchQuery = searchQuery.range(offset, offset + limit - 1);

    // Execute search
    const { data, error, count } = await searchQuery;

    if (error) {
      console.error('Search error:', error);
      return new Response(
        JSON.stringify({ error: `Search failed: ${error.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Enhance results with analysis data
    const enhancedResults: EnhancedSearchResult[] = (data || []).map((chunk: any) => {
      const classification = chunk.chunk_classifications?.[0];
      const boundary = chunk.chunk_boundaries?.[0];
      const validation = chunk.chunk_validation_scores?.[0];

      // Calculate overall quality score
      const classificationScore = classification?.confidence || 0;
      const boundaryScore = boundary?.boundary_score || 0.5;
      const validationScore = validation?.overall_validation_score || 0.5;

      const overallQuality = classificationScore * 0.4 + boundaryScore * 0.3 + validationScore * 0.3;

      return {
        chunk_id: chunk.id,
        content: chunk.content,
        classification: classification
          ? {
              content_type: classification.content_type,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
            }
          : undefined,
        boundary: boundary
          ? {
              boundary_type: boundary.boundary_type,
              boundary_score: boundary.boundary_score,
              is_product_boundary: boundary.is_product_boundary,
            }
          : undefined,
        validation: validation
          ? {
              overall_validation_score: validation.overall_validation_score,
              validation_status: validation.validation_status,
              content_quality_score: validation.content_quality_score,
            }
          : undefined,
        overall_quality: overallQuality,
      };
    });

    // Sort by overall quality
    enhancedResults.sort((a, b) => b.overall_quality - a.overall_quality);

    return new Response(
      JSON.stringify({
        success: true,
        results: enhancedResults,
        total: count || 0,
        limit,
        offset,
        filters,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${error.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

