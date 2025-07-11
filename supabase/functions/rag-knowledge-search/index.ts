import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface RAGSearchRequest {
  query: string;
  search_type?: 'material' | 'knowledge' | 'hybrid';
  embedding_types?: string[];
  match_threshold?: number;
  match_count?: number;
  include_context?: boolean;
}

interface RAGSearchResult {
  results: Array<{
    result_type: string;
    id: string;
    similarity_score: number;
    title: string;
    content: string;
    metadata: any;
  }>;
  context?: string;
  query_embedding?: number[];
  search_params: RAGSearchRequest;
  processing_time_ms: number;
}

// Generate embeddings using OpenAI
async function generateQueryEmbedding(text: string): Promise<number[]> {
  console.log('Generating embedding for query:', text.substring(0, 100));
  
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 512 // Match our vector dimension
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Perform enhanced vector search
async function performRAGSearch(
  queryEmbedding: number[], 
  searchParams: RAGSearchRequest
): Promise<any[]> {
  console.log('Performing RAG search with params:', searchParams);

  const { data, error } = await supabase
    .rpc('enhanced_vector_search', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      search_type: searchParams.search_type || 'hybrid',
      embedding_types: searchParams.embedding_types || ['clip'],
      match_threshold: searchParams.match_threshold || 0.7,
      match_count: searchParams.match_count || 10
    });

  if (error) {
    console.error('Vector search error:', error);
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return data || [];
}

// Generate contextual response using RAG results
async function generateRAGContext(query: string, searchResults: any[]): Promise<string> {
  if (!searchResults.length) {
    return "No relevant materials or knowledge found for your query.";
  }

  // Prepare context from search results
  const materialContext = searchResults
    .filter(r => r.result_type === 'material')
    .slice(0, 3)
    .map(r => `Material: ${r.title} - ${r.content} (Category: ${r.metadata.category})`)
    .join('\n');

  const knowledgeContext = searchResults
    .filter(r => r.result_type === 'knowledge')
    .slice(0, 3)
    .map(r => `Knowledge: ${r.title} - ${r.content}`)
    .join('\n');

  const contextPrompt = `
Based on the following material catalog and knowledge base information, provide a helpful response to the user's query: "${query}"

MATERIAL INFORMATION:
${materialContext}

KNOWLEDGE BASE:
${knowledgeContext}

Provide a comprehensive answer that synthesizes this information and directly addresses the user's question. Focus on practical insights and material recommendations.`;

  console.log('Generating contextual response with OpenAI');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-2025-04-14',
      messages: [
        {
          role: 'system',
          content: 'You are a material expert assistant. Provide helpful, accurate information about materials based on the provided context.'
        },
        {
          role: 'user',
          content: contextPrompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    }),
  });

  if (!response.ok) {
    console.error('OpenAI API error for context generation');
    return "I found relevant materials but couldn't generate a detailed response. Please check the search results.";
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Main request handler
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const requestBody: RAGSearchRequest = await req.json();

    console.log('RAG search request:', requestBody);

    // Validate required fields
    if (!requestBody.query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(requestBody.query);
    console.log('Generated embedding with dimensions:', queryEmbedding.length);

    // Perform vector search
    const searchResults = await performRAGSearch(queryEmbedding, requestBody);
    console.log('Found search results:', searchResults.length);

    // Generate contextual response if requested
    let context: string | undefined;
    if (requestBody.include_context) {
      context = await generateRAGContext(requestBody.query, searchResults);
    }

    const processingTime = Date.now() - startTime;

    const result: RAGSearchResult = {
      results: searchResults,
      context,
      query_embedding: requestBody.include_context ? undefined : queryEmbedding, // Only include if no context needed
      search_params: requestBody,
      processing_time_ms: processingTime
    };

    console.log(`RAG search completed in ${processingTime}ms`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('RAG search error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'RAG search failed', 
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});