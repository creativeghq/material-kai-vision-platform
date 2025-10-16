import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { evaluateRetrievalQuality, identifyRelevantChunks, type RetrievalResult } from '../_shared/retrieval-quality.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// MIVAA Gateway configuration
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY');

// Fallback OpenAI API configuration (for endpoints not yet available in MIVAA)
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const USE_MIVAA_EMBEDDINGS = Deno.env.get('USE_MIVAA_EMBEDDINGS') !== 'false';

async function generateSearchEmbeddingViaMivaa(query: string): Promise<number[] | null> {
  if (!MIVAA_API_KEY) {
    throw new Error('MIVAA API key not configured');
  }

  try {
    const response = await fetch(`${MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
      },
      body: JSON.stringify({
        action: 'generate_embedding',
        payload: {
          text: query,
          model: 'text-embedding-3-large',
          dimensions: 1536
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MIVAA embedding error: ${response.status} - ${error}`);
    }

    const gatewayResponse = await response.json();
    
    if (!gatewayResponse.success) {
      throw new Error(`MIVAA embedding failed: ${gatewayResponse.error?.message || 'Unknown error'}`);
    }

    return gatewayResponse.data.embedding || null;
  } catch (error) {
    console.error('Error generating embedding via MIVAA:', error);
    throw error;
  }
}

// Generate embedding for search query using MIVAA-only approach
async function generateSearchEmbedding(query: string): Promise<number[] | null> {
  console.log('Using MIVAA for search embedding generation');
  
  try {
    return await generateSearchEmbeddingViaMivaa(query);
  } catch (error) {
    console.error('MIVAA embedding generation failed:', error);
    throw new Error(`Search embedding generation failed: ${(error as Error).message}. Please check MIVAA service availability.`);
  }
}

// Perform unified search combining multiple approaches
async function performUnifiedSearch(
  query: string,
  searchType: 'text' | 'semantic' | 'hybrid' = 'hybrid',
  category?: string,
  limit: number = 20
) {
  const startTime = Date.now();
  const results: any[] = [];

  try {
    // 1. Text-based search
    if (searchType === 'text' || searchType === 'hybrid') {
      let dbQuery = supabase
        .from('materials_catalog')
        .select(`
          *,
          material_images(id, image_url, image_type, is_featured, display_order),
          material_metafield_values(
            field_id,
            value_text,
            value_number,
            value_boolean,
            confidence_score,
            field:material_metadata_fields(field_name, display_name, field_type)
          )
        `);

      if (category) {
        dbQuery = dbQuery.eq('category', category);
      }

      dbQuery = dbQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(Math.ceil(limit * 0.6))
        .order('name');

      const { data: materials, error } = await dbQuery;

      if (!error && materials) {
        results.push(...materials.map((material: any) => ({
          ...material,
          images: (material.material_images || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((img: any) => ({
              id: img.id,
              url: img.image_url,
              type: img.image_type,
              is_featured: img.is_featured
            })),
          metafield_values: (material.material_metafield_values || []).map((value: any) => ({
            field_name: value.field?.field_name,
            display_name: value.field?.display_name,
            field_type: value.field?.field_type,
            value_text: value.value_text,
            value_number: value.value_number,
            value_boolean: value.value_boolean,
            confidence_score: value.confidence_score
          })),
          search_score: 0.8,
          match_type: 'text'
        })));
      }
    }

    // 2. Vector semantic search
    if (searchType === 'semantic' || searchType === 'hybrid') {
      const embedding = await generateSearchEmbedding(query);
      if (embedding) {
        const { data: vectorResults, error } = await supabase.rpc('vector_similarity_search', {
          query_embedding: `[${embedding.join(',')}]`,
          match_threshold: 0.7,
          match_count: Math.ceil(limit * 0.4)
        });

        if (!error && vectorResults) {
          const materialIds = vectorResults.map((r: any) => r.material_id).filter(Boolean);
          
          if (materialIds.length > 0) {
            const { data: materials } = await supabase
              .from('materials_catalog')
              .select(`
                *,
                material_images(id, image_url, image_type, is_featured, display_order),
                material_metafield_values(
                  field_id,
                  value_text,
                  value_number,
                  value_boolean,
                  confidence_score,
                  field:material_metadata_fields(field_name, display_name, field_type)
                )
              `)
              .in('id', materialIds);

            if (materials) {
              const scoresMap = new Map();
              vectorResults.forEach((r: any) => {
                if (r.material_id) {
                  scoresMap.set(r.material_id, r.similarity_score || 0.7);
                }
              });

              results.push(...materials.map((material: any) => ({
                ...material,
                images: (material.material_images || [])
                  .sort((a: any, b: any) => a.display_order - b.display_order)
                  .map((img: any) => ({
                    id: img.id,
                    url: img.image_url,
                    type: img.image_type,
                    is_featured: img.is_featured
                  })),
                metafield_values: (material.material_metafield_values || []).map((value: any) => ({
                  field_name: value.field?.field_name,
                  display_name: value.field?.display_name,
                  field_type: value.field?.field_type,
                  value_text: value.value_text,
                  value_number: value.value_number,
                  value_boolean: value.value_boolean,
                  confidence_score: value.confidence_score
                })),
                search_score: scoresMap.get(material.id) || 0.7,
                match_type: 'semantic'
              })));
            }
          }
        }
      }
    }

    // Deduplicate results
    const uniqueResults = new Map();
    results.forEach(result => {
      const existing = uniqueResults.get(result.id);
      if (existing) {
        // Keep result with higher score
        if ((result.search_score || 0) > (existing.search_score || 0)) {
          uniqueResults.set(result.id, { ...result, match_type: 'hybrid' });
        }
      } else {
        uniqueResults.set(result.id, result);
      }
    });

    let finalResults = Array.from(uniqueResults.values());
    finalResults.sort((a, b) => (b.search_score || 0) - (a.search_score || 0));
    finalResults = finalResults.slice(0, limit);

    return {
      results: finalResults,
      metadata: {
        total_count: finalResults.length,
        processing_time_ms: Date.now() - startTime,
        search_type: searchType,
        methods_used: searchType === 'hybrid' ? ['text', 'semantic'] : [searchType]
      }
    };

  } catch (error) {
    console.error('Error in unified search:', error);
    return {
      results: [],
      metadata: {
        total_count: 0,
        processing_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Search failed'
      }
    };
  }
}

// GET /unified-material-search - Search materials
async function handleSearch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;
  
  const query = params.get('q') || params.get('query');
  const searchType = params.get('search_type') as 'text' | 'semantic' | 'hybrid' || 'hybrid';
  const category = params.get('category') || undefined;
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);

  const startTime = Date.now();

  if (!query || query.trim().length === 0) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Search query is required',
      metadata: { processing_time_ms: Date.now() - startTime }
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { results, metadata } = await performUnifiedSearch(
      query.trim(),
      searchType,
      category,
      limit
    );

    // Measure retrieval quality
    try {
      const retrievedChunks: RetrievalResult[] = results.map((result: any, index: number) => ({
        chunk_id: result.id || `material-${index}`,
        content: result.title || result.content || '',
        relevance_score: result.search_score || 0,
        rank: index + 1,
      }));

      // Identify relevant chunks (simplified - based on query term matching)
      const allChunks = retrievedChunks.map(c => ({ id: c.chunk_id, content: c.content }));
      const relevantChunkIds = identifyRelevantChunks(query.trim(), allChunks);

      // Evaluate and store retrieval quality metrics
      const retrievalMetrics = await evaluateRetrievalQuality(
        query.trim(),
        retrievedChunks,
        relevantChunkIds,
        supabase
      );

      console.log(`✅ Retrieval Quality: Precision=${(retrievalMetrics.precision * 100).toFixed(1)}%, Recall=${(retrievalMetrics.recall * 100).toFixed(1)}%, MRR=${retrievalMetrics.mrr.toFixed(3)}`);
    } catch (qualityError) {
      console.error('Warning: Failed to measure retrieval quality:', qualityError);
      // Don't fail the search if quality measurement fails
    }

    return new Response(JSON.stringify({
      success: true,
      data: results,
      metadata: {
        ...metadata,
        query: query.substring(0, 100),
        filters_applied: { category, limit }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in material search:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
      metadata: { processing_time_ms: Date.now() - startTime }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// GET /unified-material-search/suggestions - Get search suggestions
async function handleSearchSuggestions(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;
  
  const partial = params.get('q') || params.get('partial') || '';
  const limit = Math.min(parseInt(params.get('limit') || '10'), 20);
  
  const startTime = Date.now();

  if (partial.length < 2) {
    return new Response(JSON.stringify({
      success: true,
      data: [],
      metadata: {
        processing_time_ms: Date.now() - startTime,
        message: 'Minimum 2 characters required for suggestions'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { data: materialSuggestions } = await supabase
      .from('materials_catalog')
      .select('name, category')
      .ilike('name', `${partial}%`)
      .limit(limit)
      .order('name');

    const suggestions = (materialSuggestions || []).map((material: any) => ({
      text: material.name,
      type: 'material_name',
      category: material.category
    }));

    return new Response(JSON.stringify({
      success: true,
      data: suggestions,
      metadata: {
        total_count: suggestions.length,
        processing_time_ms: Date.now() - startTime,
        partial_query: partial
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get suggestions',
      metadata: { processing_time_ms: Date.now() - startTime }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const endpoint = pathSegments[1]; // e.g., 'suggestions'

    switch (req.method) {
      case 'GET':
        if (endpoint === 'suggestions') {
          return await handleSearchSuggestions(req);
        } else {
          return await handleSearch(req);
        }
      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed'
        }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Unified Material Search API error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});