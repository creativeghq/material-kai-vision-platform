import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Whitelist of allowed storage tables
const ALLOWED_TABLES = [
  'generation_3d',
  'style_analysis_results',
  'property_analysis_results',
  'hybrid_analysis_results',
  'spaceformer_analysis_results',
  'svbrdf_extraction_results',
  'ocr_results',
  'recognition_results',
  'voice_conversion_results',
  'material_visual_analysis',
  'pdf_integration_health_results',
  'search_analytics',
  'ml_training_jobs',
  'visual_search_batch_jobs',
  'scraping_sessions',
];

interface RetrievalRequest {
  table_name: string;
  operation: 'get' | 'list' | 'search' | 'delete';
  id?: string;
  user_id?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  filters?: Record<string, any>;
  search_text?: string;
  confidence_min?: number;
}

interface RetrievalResponse {
  success: boolean;
  data?: any;
  error?: string;
  error_code?: string;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  metadata: {
    timestamp: string;
    processing_time_ms: number;
  };
}

function createErrorResponse(error: string, errorCode: string, processingTime: number): RetrievalResponse {
  return {
    success: false,
    error,
    error_code: errorCode,
    metadata: {
      timestamp: new Date().toISOString(),
      processing_time_ms: processingTime,
    },
  };
}

function createSuccessResponse(data: any, pagination?: any, processingTime: number = 0): RetrievalResponse {
  const response: RetrievalResponse = {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      processing_time_ms: processingTime,
    },
  };

  if (pagination) {
    response.pagination = pagination;
  }

  return response;
}

async function getSingleResult(
  supabase: any,
  tableName: string,
  id: string,
  userId?: string,
): Promise<any> {
  let query = supabase.from(tableName).select('*').eq('id', id);

  // Verify user ownership if user_id is provided
  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.single();

  if (error) {
    throw new Error(`Failed to fetch result: ${error.message}`);
  }

  return data;
}

async function listResults(
  supabase: any,
  tableName: string,
  userId?: string,
  limit: number = 20,
  offset: number = 0,
  sortBy: string = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc',
): Promise<{ data: any[]; total: number }> {
  // Validate limit
  const validLimit = Math.min(Math.max(limit, 1), 100);

  let query = supabase.from(tableName).select('*', { count: 'exact' });

  // Filter by user if provided
  if (userId) {
    query = query.eq('user_id', userId);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply pagination
  query = query.range(offset, offset + validLimit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list results: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
  };
}

async function searchResults(
  supabase: any,
  tableName: string,
  userId?: string,
  filters?: Record<string, any>,
  searchText?: string,
  confidenceMin?: number,
  limit: number = 20,
): Promise<any[]> {
  let query = supabase.from(tableName).select('*');

  // Filter by user if provided
  if (userId) {
    query = query.eq('user_id', userId);
  }

  // Apply confidence filter if provided
  if (confidenceMin !== undefined) {
    query = query.gte('confidence_score', confidenceMin);
  }

  // Apply custom filters
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    }
  }

  // Apply text search if provided (search in result_data JSONB)
  if (searchText) {
    query = query.or(
      `result_data.ilike.%${searchText}%,input_data.ilike.%${searchText}%`,
    );
  }

  query = query.limit(Math.min(limit, 100));

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to search results: ${error.message}`);
  }

  return data || [];
}

async function deleteResult(
  supabase: any,
  tableName: string,
  id: string,
  userId?: string,
): Promise<void> {
  // First verify ownership if user_id is provided
  if (userId) {
    const { data: existing } = await supabase
      .from(tableName)
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      throw new Error('Result not found or you do not have permission to delete it');
    }
  }

  const { error } = await supabase.from(tableName).delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete result: ${error.message}`);
  }
}

serve(async (req: Request) => {
  const startTime = Date.now();

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseKey) {
      const processingTime = Date.now() - startTime;
      return new Response(
        JSON.stringify(createErrorResponse('Missing Supabase configuration', 'CONFIG_ERROR', processingTime)),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);

    // Expected format: /retrieval-api/{table_name}/{operation}/{id?}
    // Examples:
    // GET /retrieval-api/style_analysis_results/list?user_id=xxx
    // GET /retrieval-api/style_analysis_results/get/123
    // POST /retrieval-api/style_analysis_results/search
    // DELETE /retrieval-api/style_analysis_results/delete/123

    if (pathSegments.length < 3) {
      const processingTime = Date.now() - startTime;
      return new Response(
        JSON.stringify(createErrorResponse('Invalid request format', 'INVALID_FORMAT', processingTime)),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tableName = pathSegments[1];
    const operation = pathSegments[2];
    const id = pathSegments[3];

    // Validate table name
    if (!ALLOWED_TABLES.includes(tableName)) {
      const processingTime = Date.now() - startTime;
      return new Response(
        JSON.stringify(createErrorResponse(`Table '${tableName}' is not allowed`, 'INVALID_TABLE', processingTime)),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get query parameters
    const userId = url.searchParams.get('user_id') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const sortBy = url.searchParams.get('sort_by') || 'created_at';
    const sortOrder = (url.searchParams.get('sort_order') || 'desc') as 'asc' | 'desc';

    let responseData: any;
    let pagination: any;

    // Route to appropriate handler
    switch (operation) {
      case 'get':
        if (!id) {
          const processingTime = Date.now() - startTime;
          return new Response(
            JSON.stringify(createErrorResponse('ID is required for get operation', 'MISSING_ID', processingTime)),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        responseData = await getSingleResult(supabase, tableName, id, userId);
        break;

      case 'list':
        const listResult = await listResults(supabase, tableName, userId, limit, offset, sortBy, sortOrder);
        responseData = listResult.data;
        pagination = {
          total: listResult.total,
          limit,
          offset,
          has_more: offset + limit < listResult.total,
        };
        break;

      case 'search': {
        if (req.method !== 'POST') {
          const processingTime = Date.now() - startTime;
          return new Response(
            JSON.stringify(createErrorResponse('Search requires POST method', 'INVALID_METHOD', processingTime)),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const body = await req.json();
        responseData = await searchResults(
          supabase,
          tableName,
          userId,
          body.filters,
          body.search_text,
          body.confidence_min,
          body.limit || 20,
        );
        break;
      }

      case 'delete':
        if (!id) {
          const processingTime = Date.now() - startTime;
          return new Response(
            JSON.stringify(createErrorResponse('ID is required for delete operation', 'MISSING_ID', processingTime)),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        await deleteResult(supabase, tableName, id, userId);
        responseData = { success: true, message: 'Result deleted successfully' };
        break;

      default:
        const processingTime = Date.now() - startTime;
        return new Response(
          JSON.stringify(createErrorResponse(`Unknown operation: ${operation}`, 'INVALID_OPERATION', processingTime)),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }

    const processingTime = Date.now() - startTime;
    const response = createSuccessResponse(responseData, pagination, processingTime);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Retrieval API error:', error);

    return new Response(
      JSON.stringify(
        createErrorResponse(
          error instanceof Error ? error.message : 'Unknown error occurred',
          'INTERNAL_ERROR',
          processingTime,
        ),
      ),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

