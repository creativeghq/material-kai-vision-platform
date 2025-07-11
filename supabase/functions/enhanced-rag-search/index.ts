import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');

interface RAGSearchRequest {
  query: string;
  userId?: string;
  sessionId?: string;
  context?: {
    projectType?: string;
    roomType?: string;
    stylePreferences?: string[];
    materialCategories?: string[];
  };
  searchType?: 'semantic' | 'hybrid' | 'perplexity' | 'comprehensive';
  maxResults?: number;
  includeRealTime?: boolean;
}

interface EnhancedRAGResult {
  success: boolean;
  query: string;
  processedQuery: string;
  queryIntent: string;
  results: {
    knowledgeBase: KnowledgeResult[];
    materialKnowledge: MaterialKnowledgeResult[];
    realTimeInfo?: PerplexityResult;
    recommendations: RecommendationResult[];
  };
  semanticAnalysis: {
    queryEmbedding: number[];
    detectedEntities: Record<string, any>;
    queryComplexity: number;
    suggestedRefinements: string[];
  };
  performance: {
    totalTime: number;
    embeddingTime: number;
    searchTime: number;
    perplexityTime?: number;
  };
  analytics: {
    sessionId: string;
    cacheHit: boolean;
    relevanceScores: number[];
  };
}

interface KnowledgeResult {
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  source: string;
  metadata: Record<string, any>;
}

interface MaterialKnowledgeResult {
  materialId: string;
  materialName: string;
  extractedKnowledge: string;
  extractionType: string;
  confidence: number;
  relevanceScore: number;
}

interface PerplexityResult {
  answer: string;
  sources: string[];
  confidence: number;
  relatedQuestions: string[];
}

interface RecommendationResult {
  type: 'material' | 'style' | 'knowledge';
  id: string;
  title: string;
  description: string;
  score: number;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const { 
      query, 
      userId, 
      sessionId = crypto.randomUUID(),
      context = {},
      searchType = 'comprehensive',
      maxResults = 10,
      includeRealTime = true
    }: RAGSearchRequest = await req.json();

    console.log('Enhanced RAG search request:', { query, searchType, userId });

    // Step 1: Query Intelligence and Processing
    const embeddingStart = Date.now();
    const { processedQuery, queryEmbedding, queryIntent, detectedEntities } = 
      await processQuery(query, context);
    const embeddingTime = Date.now() - embeddingStart;

    // Step 2: Check semantic similarity cache
    const cacheResult = await checkSemanticCache(query, queryEmbedding, maxResults);
    if (cacheResult.hit && !includeRealTime) {
      console.log('Cache hit, returning cached results');
      return new Response(JSON.stringify({
        ...cacheResult.data,
        analytics: { ...cacheResult.data.analytics, cacheHit: true }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: Parallel knowledge search
    const searchStart = Date.now();
    const [
      knowledgeResults,
      materialKnowledgeResults,
      perplexityResult
    ] = await Promise.allSettled([
      searchEnhancedKnowledgeBase(queryEmbedding, processedQuery, maxResults),
      searchMaterialKnowledge(queryEmbedding, processedQuery, maxResults),
      includeRealTime ? searchPerplexity(processedQuery, query) : Promise.resolve(null)
    ]);
    const searchTime = Date.now() - searchStart;

    // Step 4: Generate intelligent recommendations
    const recommendations = await generateRecommendations(
      queryIntent,
      detectedEntities,
      context,
      knowledgeResults.status === 'fulfilled' ? knowledgeResults.value : [],
      materialKnowledgeResults.status === 'fulfilled' ? materialKnowledgeResults.value : []
    );

    // Step 5: Prepare comprehensive response
    const result: EnhancedRAGResult = {
      success: true,
      query,
      processedQuery,
      queryIntent,
      results: {
        knowledgeBase: knowledgeResults.status === 'fulfilled' ? knowledgeResults.value : [],
        materialKnowledge: materialKnowledgeResults.status === 'fulfilled' ? materialKnowledgeResults.value : [],
        realTimeInfo: perplexityResult.status === 'fulfilled' ? perplexityResult.value : undefined,
        recommendations
      },
      semanticAnalysis: {
        queryEmbedding,
        detectedEntities,
        queryComplexity: calculateQueryComplexity(query, detectedEntities),
        suggestedRefinements: generateQueryRefinements(query, queryIntent, detectedEntities)
      },
      performance: {
        totalTime: Date.now() - startTime,
        embeddingTime,
        searchTime,
        perplexityTime: perplexityResult.status === 'fulfilled' && includeRealTime 
          ? (perplexityResult.value as any)?.processingTime : undefined
      },
      analytics: {
        sessionId,
        cacheHit: false,
        relevanceScores: [
          ...(knowledgeResults.status === 'fulfilled' ? knowledgeResults.value.map(r => r.relevanceScore) : []),
          ...(materialKnowledgeResults.status === 'fulfilled' ? materialKnowledgeResults.value.map(r => r.relevanceScore) : [])
        ]
      }
    };

    // Step 6: Store analytics and cache results
    await Promise.all([
      storeSearchAnalytics(userId, sessionId, query, queryEmbedding, result),
      storeQueryIntelligence(userId, query, processedQuery, queryIntent, detectedEntities, result),
      cacheSemanticResults(query, queryEmbedding, result)
    ]);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in enhanced RAG search:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      details: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function processQuery(query: string, context: any) {
  try {
    // Generate embedding for the query
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: query,
        model: 'text-embedding-3-small'
      }),
    });

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Process query with LLM for intent and entity extraction
    const processingResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a material design expert AI. Analyze the user query and extract:
1. Query intent (search, compare, recommend, explain)
2. Query type (technical, aesthetic, functional, compatibility)
3. Detected entities (materials, colors, styles, rooms, properties)
4. Processed query (cleaned and enhanced version)

Return JSON format:
{
  "processedQuery": "enhanced search query",
  "queryIntent": "search|compare|recommend|explain",
  "queryType": "technical|aesthetic|functional|compatibility",
  "detectedEntities": {
    "materials": ["list"],
    "colors": ["list"],
    "styles": ["list"],
    "rooms": ["list"],
    "properties": ["list"]
  }
}`
          },
          {
            role: 'user',
            content: `Query: "${query}"\nContext: ${JSON.stringify(context)}`
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      }),
    });

    const processingData = await processingResponse.json();
    const analysis = JSON.parse(processingData.choices[0].message.content);

    return {
      processedQuery: analysis.processedQuery,
      queryEmbedding,
      queryIntent: analysis.queryIntent,
      detectedEntities: analysis.detectedEntities
    };

  } catch (error) {
    console.error('Error processing query:', error);
    return {
      processedQuery: query,
      queryEmbedding: new Array(1536).fill(0),
      queryIntent: 'search',
      detectedEntities: {}
    };
  }
}

async function searchEnhancedKnowledgeBase(
  queryEmbedding: number[], 
  processedQuery: string, 
  maxResults: number
): Promise<KnowledgeResult[]> {
  try {
    const { data, error } = await supabase.rpc('enhanced_vector_search', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      search_type: 'knowledge',
      match_threshold: 0.7,
      match_count: maxResults
    });

    if (error) throw error;

    return data.map((item: any) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      relevanceScore: item.similarity_score,
      source: item.metadata?.source_url || 'internal',
      metadata: item.metadata
    }));

  } catch (error) {
    console.error('Error searching knowledge base:', error);
    return [];
  }
}

async function searchMaterialKnowledge(
  queryEmbedding: number[], 
  processedQuery: string, 
  maxResults: number
): Promise<MaterialKnowledgeResult[]> {
  try {
    const { data, error } = await supabase
      .from('material_knowledge_extraction')
      .select(`
        *,
        materials_catalog!inner(id, name)
      `)
      .textSearch('extracted_knowledge', processedQuery, { type: 'websearch' })
      .limit(maxResults);

    if (error) throw error;

    return data.map((item: any) => ({
      materialId: item.material_id,
      materialName: item.materials_catalog?.name || 'Unknown Material',
      extractedKnowledge: item.extracted_knowledge,
      extractionType: item.extraction_type,
      confidence: item.confidence_score,
      relevanceScore: 0.8 // Would be calculated with vector similarity
    }));

  } catch (error) {
    console.error('Error searching material knowledge:', error);
    return [];
  }
}

async function searchPerplexity(processedQuery: string, originalQuery: string): Promise<PerplexityResult | null> {
  if (!perplexityApiKey) {
    console.log('Perplexity API key not available, skipping real-time search');
    return null;
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a material design expert. Provide accurate, current information about materials, design trends, and technical specifications. Focus on practical, actionable insights.'
          },
          {
            role: 'user',
            content: `${processedQuery}\n\nProvide current information, recent trends, and practical insights about this material design query.`
          }
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 1000,
        return_images: false,
        return_related_questions: true,
        search_recency_filter: 'month',
        frequency_penalty: 1,
        presence_penalty: 0
      }),
    });

    const data = await response.json();
    
    return {
      answer: data.choices[0].message.content,
      sources: [], // Perplexity doesn't return sources in this format
      confidence: 0.9, // Default confidence for Perplexity
      relatedQuestions: [] // Would be extracted from response
    };

  } catch (error) {
    console.error('Error with Perplexity search:', error);
    return null;
  }
}

async function generateRecommendations(
  queryIntent: string,
  detectedEntities: any,
  context: any,
  knowledgeResults: KnowledgeResult[],
  materialResults: MaterialKnowledgeResult[]
): Promise<RecommendationResult[]> {
  // Implement intelligent recommendation logic based on query analysis
  const recommendations: RecommendationResult[] = [];

  // Add style recommendations if materials were detected
  if (detectedEntities.materials?.length > 0) {
    recommendations.push({
      type: 'style',
      id: 'style-rec-1',
      title: 'Complementary Styles',
      description: `Based on your interest in ${detectedEntities.materials.join(', ')}, consider modern minimalist or industrial styles`,
      score: 0.85,
      reasoning: 'Material compatibility analysis'
    });
  }

  // Add material recommendations if rooms were detected
  if (detectedEntities.rooms?.length > 0) {
    recommendations.push({
      type: 'material',
      id: 'material-rec-1',
      title: 'Room-Specific Materials',
      description: `For ${detectedEntities.rooms.join(', ')}, consider durability and maintenance requirements`,
      score: 0.9,
      reasoning: 'Room context analysis'
    });
  }

  return recommendations;
}

async function checkSemanticCache(query: string, embedding: number[], maxResults: number) {
  const queryHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query));
  const hashHex = Array.from(new Uint8Array(queryHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { data, error } = await supabase
    .from('semantic_similarity_cache')
    .select('*')
    .eq('query_hash', hashHex)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (data && !error) {
    // Update hit count
    await supabase
      .from('semantic_similarity_cache')
      .update({ 
        hit_count: data.hit_count + 1,
        last_accessed: new Date().toISOString()
      })
      .eq('id', data.id);

    return { hit: true, data: data.results };
  }

  return { hit: false };
}

async function storeSearchAnalytics(
  userId: string | undefined, 
  sessionId: string, 
  query: string, 
  queryEmbedding: number[], 
  result: EnhancedRAGResult
) {
  try {
    await supabase.from('search_analytics').insert({
      user_id: userId,
      session_id: sessionId,
      query_text: query,
      query_embedding: `[${queryEmbedding.join(',')}]`,
      query_processing_time_ms: result.performance.embeddingTime,
      total_results: result.results.knowledgeBase.length + result.results.materialKnowledge.length,
      results_shown: Math.min(result.results.knowledgeBase.length + result.results.materialKnowledge.length, 10),
      avg_relevance_score: result.analytics.relevanceScores.length > 0 
        ? result.analytics.relevanceScores.reduce((a, b) => a + b, 0) / result.analytics.relevanceScores.length 
        : 0,
      response_time_ms: result.performance.totalTime
    });
  } catch (error) {
    console.error('Error storing search analytics:', error);
  }
}

async function storeQueryIntelligence(
  userId: string | undefined,
  originalQuery: string,
  processedQuery: string,
  queryIntent: string,
  detectedEntities: any,
  result: EnhancedRAGResult
) {
  try {
    await supabase.from('query_intelligence').insert({
      user_id: userId,
      original_query: originalQuery,
      processed_query: processedQuery,
      query_embedding: `[${result.semanticAnalysis.queryEmbedding.join(',')}]`,
      query_intent: queryIntent,
      query_type: detectedEntities.queryType || 'general',
      entities_detected: detectedEntities,
      results_returned: result.results.knowledgeBase.length + result.results.materialKnowledge.length
    });
  } catch (error) {
    console.error('Error storing query intelligence:', error);
  }
}

async function cacheSemanticResults(query: string, embedding: number[], result: EnhancedRAGResult) {
  try {
    const queryHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query));
    const hashHex = Array.from(new Uint8Array(queryHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Cache for 1 hour

    await supabase.from('semantic_similarity_cache').insert({
      query_hash: hashHex,
      query_embedding: `[${embedding.join(',')}]`,
      results: result,
      similarity_threshold: 0.7,
      expires_at: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Error caching results:', error);
  }
}

function calculateQueryComplexity(query: string, detectedEntities: any): number {
  let complexity = 0.5; // Base complexity
  
  // Add complexity based on query length
  complexity += Math.min(query.length / 200, 0.3);
  
  // Add complexity based on entity count
  const entityCount = Object.values(detectedEntities).flat().length;
  complexity += Math.min(entityCount / 10, 0.2);
  
  return Math.min(complexity, 1.0);
}

function generateQueryRefinements(query: string, intent: string, entities: any): string[] {
  const refinements: string[] = [];
  
  if (entities.materials?.length > 0) {
    refinements.push(`${query} compatibility`);
    refinements.push(`${entities.materials[0]} properties`);
  }
  
  if (entities.rooms?.length > 0) {
    refinements.push(`${query} for ${entities.rooms[0]}`);
  }
  
  if (intent === 'search') {
    refinements.push(`best ${query}`);
    refinements.push(`how to choose ${query}`);
  }
  
  return refinements.slice(0, 3);
}