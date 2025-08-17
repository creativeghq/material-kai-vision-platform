import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface VectorSearchRequest {
  query_text?: string;
  query_vector?: number[];
  search_type: 'semantic' | 'hybrid' | 'similarity' | 'keyword';
  collections?: string[]; // Which vector collections to search
  filters?: {
    content_type?: string[];
    date_range?: {
      start?: string;
      end?: string;
    };
    metadata_filters?: Record<string, any>;
    similarity_threshold?: number;
  };
  limit?: number;
  include_metadata?: boolean;
  include_content?: boolean;
  user_id?: string;
}

interface VectorSearchResult {
  id: string;
  content: string;
  metadata: {
    title?: string;
    content_type: string;
    source: string;
    created_at: string;
    tags?: string[];
    author?: string;
    [key: string]: any;
  };
  similarity_score: number;
  vector_distance: number;
  search_rank: number;
}

interface SearchResponse {
  results: VectorSearchResult[];
  search_metadata: {
    query_type: string;
    total_results: number;
    search_time_ms: number;
    collections_searched: string[];
    embedding_model: string;
    similarity_threshold: number;
  };
  aggregations?: {
    content_types: Record<string, number>;
    sources: Record<string, number>;
    date_distribution: Record<string, number>;
    avg_similarity: number;
  };
}

// OpenAI API configuration
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 3072;

async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.substring(0, 8000), // Limit input length
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function performSemanticSearch(
  queryVector: number[],
  collections: string[],
  filters: any,
  limit: number,
): Promise<VectorSearchResult[]> {
  const results: VectorSearchResult[] = [];

  // Search in each specified collection
  for (const collection of collections) {
    let query = supabase
      .from(collection)
      .select('id, content, metadata, embedding')
      .limit(limit);

    // Apply filters
    if (filters.content_type && filters.content_type.length > 0) {
      query = query.in('metadata->content_type', filters.content_type);
    }

    if (filters.date_range?.start) {
      query = query.gte('created_at', filters.date_range.start);
    }

    if (filters.date_range?.end) {
      query = query.lte('created_at', filters.date_range.end);
    }

    // Apply metadata filters
    if (filters.metadata_filters) {
      Object.entries(filters.metadata_filters).forEach(([key, value]) => {
        query = query.eq(`metadata->${key}`, value);
      });
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error searching collection ${collection}:`, error);
      continue;
    }

    if (data) {
      // Calculate similarity scores
      const collectionResults = data.map((item: any, index: number) => {
        const similarity = calculateCosineSimilarity(queryVector, item.embedding || []);

        return {
          id: item.id,
          content: item.content || '',
          metadata: {
            content_type: item.metadata?.content_type || 'unknown',
            source: collection,
            created_at: item.created_at || new Date().toISOString(),
            title: item.metadata?.title,
            tags: item.metadata?.tags || [],
            author: item.metadata?.author,
            ...item.metadata,
          },
          similarity_score: similarity,
          vector_distance: 1 - similarity,
          search_rank: index + 1,
        };
      }).filter(result =>
        result.similarity_score >= (filters.similarity_threshold || 0.5),
      );

      results.push(...collectionResults);
    }
  }

  // Sort by similarity score and limit results
  return results
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
}

async function performHybridSearch(
  queryText: string,
  queryVector: number[],
  collections: string[],
  filters: any,
  limit: number,
): Promise<VectorSearchResult[]> {
  // Combine semantic and keyword search
  const semanticResults = await performSemanticSearch(queryVector, collections, filters, limit * 2);
  const keywordResults = await performKeywordSearch(queryText, collections, filters, limit * 2);

  // Merge and re-rank results using hybrid scoring
  const combinedResults = new Map<string, VectorSearchResult>();

  // Add semantic results with weight
  semanticResults.forEach((result, index) => {
    const hybridScore = result.similarity_score * 0.7 + (1 - index / semanticResults.length) * 0.3;
    combinedResults.set(result.id, {
      ...result,
      similarity_score: hybridScore,
      search_rank: index + 1,
    });
  });

  // Add keyword results with weight, combining scores if already present
  keywordResults.forEach((result, index) => {
    const keywordScore = (1 - index / keywordResults.length) * 0.5;

    if (combinedResults.has(result.id)) {
      const existing = combinedResults.get(result.id)!;
      existing.similarity_score = existing.similarity_score * 0.8 + keywordScore * 0.2;
    } else {
      combinedResults.set(result.id, {
        ...result,
        similarity_score: keywordScore,
        search_rank: index + 1,
      });
    }
  });

  // Sort by hybrid score and limit
  return Array.from(combinedResults.values())
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
}

async function performKeywordSearch(
  queryText: string,
  collections: string[],
  filters: any,
  limit: number,
): Promise<VectorSearchResult[]> {
  const results: VectorSearchResult[] = [];

  // Simple keyword search implementation
  const keywords = queryText.toLowerCase().split(/\s+/).filter(word => word.length > 2);

  for (const collection of collections) {
    let query = supabase
      .from(collection)
      .select('id, content, metadata, created_at')
      .limit(limit);

    // Apply filters
    if (filters.content_type && filters.content_type.length > 0) {
      query = query.in('metadata->content_type', filters.content_type);
    }

    if (filters.date_range?.start) {
      query = query.gte('created_at', filters.date_range.start);
    }

    if (filters.date_range?.end) {
      query = query.lte('created_at', filters.date_range.end);
    }

    // Use text search if available
    if (keywords.length > 0) {
      query = query.textSearch('content', keywords.join(' | '));
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error in keyword search for collection ${collection}:`, error);
      continue;
    }

    if (data) {
      const collectionResults = data.map((item: any, index: number) => {
        // Calculate keyword relevance score
        const content = (item.content || '').toLowerCase();
        const matchCount = keywords.reduce((count, keyword) => {
          return count + (content.includes(keyword) ? 1 : 0);
        }, 0);

        const relevanceScore = matchCount / keywords.length;

        return {
          id: item.id,
          content: item.content || '',
          metadata: {
            content_type: item.metadata?.content_type || 'unknown',
            source: collection,
            created_at: item.created_at || new Date().toISOString(),
            title: item.metadata?.title,
            tags: item.metadata?.tags || [],
            author: item.metadata?.author,
            ...item.metadata,
          },
          similarity_score: relevanceScore,
          vector_distance: 1 - relevanceScore,
          search_rank: index + 1,
        };
      }).filter(result => result.similarity_score > 0);

      results.push(...collectionResults);
    }
  }

  return results
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
}

function calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function generateAggregations(results: VectorSearchResult[]): any {
  const contentTypes: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const dateDistribution: Record<string, number> = {};
  let totalSimilarity = 0;

  results.forEach(result => {
    // Content type aggregation
    const contentType = result.metadata.content_type;
    contentTypes[contentType] = (contentTypes[contentType] || 0) + 1;

    // Source aggregation
    const source = result.metadata.source;
    sources[source] = (sources[source] || 0) + 1;

    // Date aggregation (by month)
    const date = new Date(result.metadata.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    dateDistribution[monthKey] = (dateDistribution[monthKey] || 0) + 1;

    totalSimilarity += result.similarity_score;
  });

  return {
    content_types: contentTypes,
    sources: sources,
    date_distribution: dateDistribution,
    avg_similarity: results.length > 0 ? totalSimilarity / results.length : 0,
  };
}

async function processVectorSearch(request: VectorSearchRequest): Promise<SearchResponse> {
  const startTime = Date.now();

  try {
    console.log(`Processing ${request.search_type} search`);

    // Set default values
    const limit = Math.min(request.limit || 20, 100);
    const collections = request.collections || ['documents', 'knowledge_base', 'materials_catalog'];
    const filters = request.filters || {};
    const similarityThreshold = filters.similarity_threshold || 0.5;

    let queryVector: number[] = [];

    // Generate embedding if query text is provided
    if (request.query_text && !request.query_vector) {
      queryVector = await generateEmbedding(request.query_text);
    } else if (request.query_vector) {
      queryVector = request.query_vector;
    } else {
      throw new Error('Either query_text or query_vector must be provided');
    }

    let results: VectorSearchResult[] = [];

    // Perform search based on type
    switch (request.search_type) {
      case 'semantic':
      case 'similarity':
        results = await performSemanticSearch(queryVector, collections, filters, limit);
        break;

      case 'hybrid':
        if (!request.query_text) {
          throw new Error('query_text is required for hybrid search');
        }
        results = await performHybridSearch(request.query_text, queryVector, collections, filters, limit);
        break;

      case 'keyword':
        if (!request.query_text) {
          throw new Error('query_text is required for keyword search');
        }
        results = await performKeywordSearch(request.query_text, collections, filters, limit);
        break;

      default:
        throw new Error(`Unsupported search type: ${request.search_type}`);
    }

    // Filter content and metadata based on request options
    if (!request.include_content) {
      results = results.map(result => ({
        ...result,
        content: result.content.substring(0, 200) + '...', // Truncate content
      }));
    }

    if (!request.include_metadata) {
      results = results.map(result => ({
        ...result,
        metadata: {
          content_type: result.metadata.content_type,
          source: result.metadata.source,
          created_at: result.metadata.created_at,
        },
      }));
    }

    // Generate aggregations
    const aggregations = generateAggregations(results);

    const searchTime = Date.now() - startTime;

    const response: SearchResponse = {
      results,
      search_metadata: {
        query_type: request.search_type,
        total_results: results.length,
        search_time_ms: searchTime,
        collections_searched: collections,
        embedding_model: EMBEDDING_MODEL,
        similarity_threshold: similarityThreshold,
      },
      aggregations,
    };

    // Log search analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'vector_search',
          event_data: {
            search_type: request.search_type,
            collections_searched: collections,
            results_count: results.length,
            search_time_ms: searchTime,
            avg_similarity: aggregations.avg_similarity,
            query_length: request.query_text?.length || 0,
          },
        });
    }

    return response;

  } catch (error) {
    console.error('Vector search error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: VectorSearchRequest = await req.json();

    console.log('Processing vector search request:', {
      search_type: request.search_type,
      has_query_text: !!request.query_text,
      has_query_vector: !!request.query_vector,
      collections: request.collections,
      limit: request.limit,
    });

    if (!request.query_text && !request.query_vector) {
      return new Response(
        JSON.stringify({ error: 'Either query_text or query_vector is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!['semantic', 'hybrid', 'similarity', 'keyword'].includes(request.search_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid search_type. Must be one of: semantic, hybrid, similarity, keyword' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const response = await processVectorSearch(request);

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Vector similarity search error:', error);

    return new Response(
      JSON.stringify({
        error: 'Vector search failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
