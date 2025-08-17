import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  query: string
  searchType?: 'semantic' | 'hybrid' | 'keyword'
  maxResults?: number
  includeContext?: boolean
  embeddingTypes?: string[]
  matchThreshold?: number
}

interface SearchResult {
  result_type: string
  id: string
  similarity_score: number
  title: string
  content: string
  metadata: any
}

interface CachedEmbedding {
  embedding: number[]
  timestamp: number
}

// In-memory cache for embeddings (1 hour TTL)
const embeddingCache = new Map<string, CachedEmbedding>();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// Hash function for cache keys
function hashQuery(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

// Get embedding from cache
function getFromCache(key: string): number[] | null {
  const cached = embeddingCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.embedding;
  }
  if (cached) {
    embeddingCache.delete(key); // Remove expired cache
  }
  return null;
}

// Set embedding in cache
function setCache(key: string, embedding: number[]): void {
  embeddingCache.set(key, {
    embedding,
    timestamp: Date.now(),
  });
}

// Generate query embedding using OpenAI text-embedding-ada-002 (1536 dimensions)
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const cacheKey = `embedding_${hashQuery(text)}`;

  // Check cache first
  const cachedEmbedding = getFromCache(cacheKey);
  if (cachedEmbedding) {
    console.log('Using cached embedding for query:', text.substring(0, 50));
    return cachedEmbedding;
  }

  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not found');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002', // 1536 dimensions for MIVAA compatibility
        input: text,
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    // Validate embedding dimensions
    if (embedding.length !== 1536) {
      throw new Error(`Invalid embedding dimensions: expected 1536, got ${embedding.length}`);
    }

    // Cache the embedding
    setCache(cacheKey, embedding);

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

// Perform vector search using the enhanced_vector_search RPC function
async function performVectorSearch(
  supabase: any,
  queryEmbedding: number[],
  searchType: string,
  maxResults: number,
  matchThreshold: number,
): Promise<SearchResult[]> {
  try {
    const { data: vectorResults, error: vectorError } = await supabase
      .rpc('enhanced_vector_search', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        search_type: searchType,
        embedding_types: ['clip'],
        match_threshold: matchThreshold,
        match_count: maxResults,
      });

    if (vectorError) {
      console.error('Vector search error:', vectorError);
      throw new Error(`Vector search failed: ${vectorError.message}`);
    }

    return vectorResults || [];
  } catch (error) {
    console.error('Error in vector search:', error);
    throw new Error(`Vector search error: ${error.message}`);
  }
}

// Fallback keyword search for when vector search fails
async function performKeywordSearch(
  supabase: any,
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  try {
    const { data: keywordResults, error: keywordError } = await supabase
      .from('enhanced_knowledge_base')
      .select('id, title, content, metadata')
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .eq('status', 'published')
      .limit(maxResults);

    if (keywordError) {
      console.error('Keyword search error:', keywordError);
      return [];
    }

    // Transform to match SearchResult interface
    return (keywordResults || []).map((item: any) => ({
      result_type: 'knowledge',
      id: item.id,
      similarity_score: 0.5, // Default score for keyword matches
      title: item.title,
      content: item.content.length > 500 ? item.content.substring(0, 500) + '...' : item.content,
      metadata: item.metadata,
    }));
  } catch (error) {
    console.error('Error in keyword search:', error);
    return [];
  }
}

// Generate contextual response using GPT-4
async function generateRAGContext(query: string, searchResults: SearchResult[]): Promise<string> {
  if (searchResults.length === 0) {
    return 'No relevant context found for the query.';
  }

  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not found');
  }

  const context = searchResults
    .map(result => `Title: ${result.title}\nContent: ${result.content}`)
    .join('\n\n---\n\n');

  const prompt = `Based on the following context, provide a comprehensive answer to the query: "${query}"

Context:
${context}

Please provide a detailed, accurate response based solely on the provided context. If the context doesn't contain enough information to fully answer the query, please indicate what information is missing.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides accurate information based on the given context. Always cite your sources when possible.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating RAG context:', error);
    return `Error generating contextual response: ${error.message}`;
  }
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
    const requestBody: SearchRequest = await req.json();
    const {
      query,
      searchType = 'hybrid',
      maxResults = 10,
      includeContext = false,
      matchThreshold = 0.7,
    } = requestBody;

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required and cannot be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log(`Processing ${searchType} search for query: "${query}"`);

    let searchResults: SearchResult[] = [];

    try {
      // Generate query embedding for vector search
      const queryEmbedding = await generateQueryEmbedding(query);

      // Perform vector search
      searchResults = await performVectorSearch(
        supabase,
        queryEmbedding,
        searchType,
        maxResults,
        matchThreshold,
      );

      console.log(`Vector search returned ${searchResults.length} results`);
    } catch (embeddingError) {
      console.error('Vector search failed, falling back to keyword search:', embeddingError);

      // Fallback to keyword search if vector search fails
      searchResults = await performKeywordSearch(supabase, query, maxResults);
      console.log(`Keyword search returned ${searchResults.length} results`);
    }

    // Generate contextual response if requested
    let context: string | undefined;
    if (includeContext && searchResults.length > 0) {
      try {
        context = await generateRAGContext(query, searchResults);
      } catch (contextError) {
        console.error('Error generating context:', contextError);
        context = 'Error generating contextual response';
      }
    }

    // Prepare response
    const response = {
      query,
      searchType,
      results: searchResults,
      totalResults: searchResults.length,
      context,
      performance: {
        cacheHit: embeddingCache.has(`embedding_${hashQuery(query)}`),
        timestamp: new Date().toISOString(),
      },
    };

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Error in enhanced-rag-search:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
