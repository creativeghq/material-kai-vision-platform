import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

async function generateQueryEmbedding(query: string): Promise<number[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: query
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Embedding API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function performSemanticSearch(
  embedding: number[], 
  documentTypes: string[], 
  limit: number, 
  threshold: number
): Promise<SearchResult[]> {
  
  let query = supabase
    .rpc('vector_similarity_search', {
      query_embedding: `[${embedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit
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
    section: item.section
  }));
}

async function performKeywordSearch(
  query: string, 
  documentTypes: string[], 
  limit: number
): Promise<SearchResult[]> {
  
  let queryBuilder = supabase
    .from('documents')
    .select(`
      id,
      title,
      content,
      document_type,
      metadata,
      file_path,
      page_number,
      section
    `)
    .textSearch('content', query, {
      type: 'websearch',
      config: 'english'
    })
    .limit(limit);

  if (documentTypes.length > 0) {
    queryBuilder = queryBuilder.in('document_type', documentTypes);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    console.error('Keyword search error:', error);
    throw new Error(`Keyword search failed: ${error.message}`);
  }

  return (data || []).map((item: any) => ({
    document_id: item.id,
    title: item.title || 'Untitled',
    content_snippet: item.content?.substring(0, 300) + '...',
    similarity_score: 0.8, // Default score for keyword matches
    document_type: item.document_type || 'unknown',
    metadata: item.metadata || {},
    file_path: item.file_path,
    page_number: item.page_number,
    section: item.section
  }));
}

async function performHybridSearch(
  query: string,
  embedding: number[],
  documentTypes: string[],
  limit: number,
  threshold: number
): Promise<SearchResult[]> {
  
  // Perform both searches in parallel
  const [semanticResults, keywordResults] = await Promise.all([
    performSemanticSearch(embedding, documentTypes, Math.ceil(limit * 0.7), threshold),
    performKeywordSearch(query, documentTypes, Math.ceil(limit * 0.5))
  ]);

  // Combine and deduplicate results
  const combinedResults = new Map<string, SearchResult>();
  
  // Add semantic results with higher weight
  semanticResults.forEach(result => {
    combinedResults.set(result.document_id, {
      ...result,
      similarity_score: result.similarity_score * 1.1 // Boost semantic scores
    });
  });

  // Add keyword results, merging with existing if found
  keywordResults.forEach(result => {
    const existing = combinedResults.get(result.document_id);
    if (existing) {
      // Combine scores for documents found in both searches
      existing.similarity_score = Math.max(existing.similarity_score, result.similarity_score * 0.9);
    } else {
      combinedResults.set(result.document_id, result);
    }
  });

  // Sort by similarity score and return top results
  return Array.from(combinedResults.values())
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
}

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
          document_types_filter: request.document_types || []
        }
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
    
    switch (request.search_type) {
      case 'semantic': {
        const embedding = await generateQueryEmbedding(request.query);
        results = await performSemanticSearch(embedding, documentTypes, limit, threshold);
        break;
      }
      
      case 'keyword': {
        results = await performKeywordSearch(request.query, documentTypes, limit);
        break;
      }
      
      case 'hybrid': {
        const embedding = await generateQueryEmbedding(request.query);
        results = await performHybridSearch(request.query, embedding, documentTypes, limit, threshold);
        break;
      }
      
      default:
        throw new Error(`Unsupported search type: ${request.search_type}`);
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
        embedding_model: 'text-embedding-3-large'
      }
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
      limit: request.limit || 10
    });

    if (!request.query || request.query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'query is required and cannot be empty' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!['semantic', 'keyword', 'hybrid'].includes(request.search_type)) {
      return new Response(
        JSON.stringify({ error: 'search_type must be one of: semantic, keyword, hybrid' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await processDocumentSearch(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Document vector search error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Document search failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});