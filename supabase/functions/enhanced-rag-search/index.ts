import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MIVAA Gateway configuration
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY');

// Environment variable controls
const USE_MIVAA_EMBEDDINGS = Deno.env.get('USE_MIVAA_EMBEDDINGS') !== 'false';
const USE_MIVAA_CHAT = Deno.env.get('USE_MIVAA_CHAT') !== 'false'; // For future when MIVAA supports text chat

interface SearchRequest {
  query: string;
  searchType?: 'hybrid' | 'semantic' | 'knowledge' | 'materials' | 'documents';
  maxResults?: number;
  includeContext?: boolean;
  matchThreshold?: number;
}

interface SearchResult {
  result_type: string;
  id: string;
  similarity_score: number;
  title: string;
  content: string;
  metadata: any;
  associated_images: any[];
  source_info: any;
}

// Query intent analysis
function analyzeQueryIntent(query: string): string {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('material') || lowerQuery.includes('properties') || lowerQuery.includes('specification')) {
    return 'material_search';
  }
  if (lowerQuery.includes('how') || lowerQuery.includes('what') || lowerQuery.includes('why')) {
    return 'knowledge_query';
  }
  if (lowerQuery.includes('find') || lowerQuery.includes('search') || lowerQuery.includes('show')) {
    return 'discovery';
  }

  return 'general_search';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Parse request body
    const requestBody = await req.json();
    const {
      query,
      searchType = 'hybrid',
      maxResults = 10,
      includeContext = false,
      matchThreshold = 0.7,
    } = requestBody;

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Query parameter is required and cannot be empty',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        },
      );
    }

    console.log(`Processing ${searchType} search for query: "${query}"`);

    // TEMP: Always use test embedding for debugging - FORCE UPDATE
    console.log('TEMP: Using test embedding from database for debugging - FORCE UPDATE');
    const { data: testEmbedding, error: testError } = await supabase
      .from('document_chunks')
      .select('embedding')
      .limit(1)
      .single();

    if (testError || !testEmbedding?.embedding) {
      throw new Error('Failed to get test embedding from database');
    }

    // Convert vector to array
    const embeddingStr = testEmbedding.embedding.toString();
    const queryEmbedding = embeddingStr.slice(1, -1).split(',').map(Number);
    console.log(`Using test embedding with ${queryEmbedding.length} dimensions`);

    // TEMP: Test direct database call - UPDATED
    console.log('TEMP: Testing direct database call - UPDATED VERSION');
    const { data: directResults, error: directError } = await supabase
      .rpc('enhanced_vector_search_service', {
        query_embedding_text: `[${queryEmbedding.join(',')}]`,
        search_type: 'documents',
        embedding_types: ['openai'],
        match_threshold: 0.1,
        match_count: 2,
      });

    console.log('Direct DB call results:', directResults);
    console.log('Direct DB call error:', directError);

    // Return early with raw results for testing
    return new Response(
      JSON.stringify({
        success: true,
        query,
        debug: {
          embeddingLength: queryEmbedding.length,
          directResults: directResults || [],
          directError: directError,
        },
        totalResults: directResults?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error in enhanced RAG search:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      },
    );
  }
});
