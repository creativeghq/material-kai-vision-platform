import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

import { evaluateRetrievalQuality, identifyRelevantChunks, type RetrievalResult } from '../_shared/retrieval-quality.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MIVAA Gateway configuration
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY');

// Environment variable controls
const USE_MIVAA_EMBEDDINGS = Deno.env.get('USE_MIVAA_EMBEDDINGS') !== 'false';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface SearchRequest {
  query: string;
  search_type: 'semantic' | 'keyword' | 'hybrid';
  document_types?: string[];
  limit?: number;
  threshold?: number;
  include_metadata?: boolean;
  user_id?: string;
}

interface SearchResult {
  document_id: string;
  title: string;
  content_snippet: string;
  similarity_score: number;
  document_type: string;
  metadata: Record<string, any>;
  file_path?: string;
  page_number?: number;
  section?: string;
}

interface VectorSearchResponse {
  results: SearchResult[];
  total_found: number;
  search_metadata: {
    query: string;
    search_type: string;
    processing_time_ms: number;
    embedding_model: string;
  };
}

async function generateQueryEmbeddingViaMivaa(query: string): Promise<number[]> {
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
          dimensions: 1536,
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

    return gatewayResponse.data.embedding;
  } catch (error) {
    console.error('Error generating embedding via MIVAA:', error);
    throw error;
  }
}

// Generate query embedding using MIVAA-only approach
async function generateQueryEmbedding(query: string): Promise<number[]> {
  console.log('Using MIVAA for document query embedding generation');

  try {
    return await generateQueryEmbeddingViaMivaa(query);
  } catch (error) {
    console.error('MIVAA embedding generation failed:', error);
    throw new Error(`Document query embedding generation failed: ${(error as Error).message}. Please check MIVAA service availability.`);
  }
}

async function performSemanticSearch(
  embedding: number[],
  documentTypes: string[],
  limit: number,
  threshold: number,
): Promise<SearchResult[]> {

  let query = supabase
    .rpc('vector_similarity_search', {
      query_embedding_text: `[${embedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
    });

  const { data, error } = await query;

  if (error) {
    console.error('Semantic search error:', error);
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return (data || []).map((item: any) => ({
    document_id: item.id,
    title: item.title || 'Untitled',
    content_snippet: item.content?.substring(0, 300) + '...',
    similarity_score: item.similarity,
    document_type: item.document_type || 'unknown',
    metadata: item.metadata || {},
    file_path: item.file_path,
    page_number: item.page_number,
    section: item.section,
  }));
}

// Removed keyword and hybrid search functions - vector search only

async function logSearchEvent(request: SearchRequest, results: SearchResult[], processingTime: number) {
  if (!request.user_id) return;

  try {
    await supabase
      .from('analytics_events')
      .insert({
        user_id: request.user_id,
        event_type: 'document_vector_search',
        event_data: {
          query: request.query,
          search_type: request.search_type,
          results_count: results.length,
          avg_similarity: results.length > 0 ?
            results.reduce((sum, r) => sum + r.similarity_score, 0) / results.length : 0,
          processing_time_ms: processingTime,
          document_types_filter: request.document_types || [],
        },
      });
  } catch (error) {
    console.error('Failed to log search event:', error);
  }
}

async function processDocumentSearch(request: SearchRequest): Promise<VectorSearchResponse> {
  const startTime = Date.now();

  try {
    console.log(`Processing ${request.search_type} search for: "${request.query}"`);

    const limit = request.limit || 10;
    const threshold = request.threshold || 0.7;
    const documentTypes = request.document_types || [];

    let results: SearchResult[] = [];

    // Only semantic (vector) search - no fallbacks
    const embedding = await generateQueryEmbedding(request.query);
    results = await performSemanticSearch(embedding, documentTypes, limit, threshold);

    console.log(`Vector search completed: ${results.length} results found`);

    // Measure retrieval quality
    try {
      const retrievedChunks: RetrievalResult[] = results.map((result, index) => ({
        chunk_id: result.document_id,
        content: result.content_snippet || '',
        relevance_score: result.similarity_score,
        rank: index + 1,
      }));

      // Identify relevant chunks (simplified - based on query term matching)
      const allChunks = retrievedChunks.map(c => ({ id: c.chunk_id, content: c.content }));
      const relevantChunkIds = identifyRelevantChunks(request.query, allChunks);

      // Evaluate and store retrieval quality metrics
      const retrievalMetrics = await evaluateRetrievalQuality(
        request.query,
        retrievedChunks,
        relevantChunkIds,
        supabase,
      );

      console.log(`✅ Retrieval Quality: Precision=${(retrievalMetrics.precision * 100).toFixed(1)}%, Recall=${(retrievalMetrics.recall * 100).toFixed(1)}%, MRR=${retrievalMetrics.mrr.toFixed(3)}`);
    } catch (qualityError) {
      console.error('Warning: Failed to measure retrieval quality:', qualityError);
      // Don't fail the search if quality measurement fails
    }

    const processingTime = Date.now() - startTime;

    // Log the search event
    await logSearchEvent(request, results, processingTime);

    return {
      results,
      total_found: results.length,
      search_metadata: {
        query: request.query,
        search_type: request.search_type,
        processing_time_ms: processingTime,
        embedding_model: 'text-embedding-3-large',
      },
    };

  } catch (error) {
    console.error('Document search error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: SearchRequest = await req.json();

    console.log('Processing document search request:', {
      query: request.query,
      search_type: request.search_type,
      limit: request.limit || 10,
    });

    if (!request.query || request.query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'query is required and cannot be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!['semantic', 'keyword', 'hybrid'].includes(request.search_type)) {
      return new Response(
        JSON.stringify({ error: 'search_type must be one of: semantic, keyword, hybrid' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await processDocumentSearch(request);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Document vector search error:', error);

    return new Response(
      JSON.stringify({
        error: 'Document search failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
