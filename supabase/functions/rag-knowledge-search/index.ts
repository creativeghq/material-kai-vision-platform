import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

import { performUnifiedVectorSearch, UnifiedSearchRequest } from '../_shared/unified-vector-search.ts';
import { evaluateRetrievalQuality, identifyRelevantChunks, type RetrievalResult } from '../_shared/retrieval-quality.ts';
import { evaluateResponseQuality, type ResponseQualityMetrics } from '../_shared/response-quality.ts';
import { createAILogger } from '../_shared/ai-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// MIVAA Gateway configuration
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY');

// Environment variable controls
const USE_MIVAA_EMBEDDINGS = Deno.env.get('USE_MIVAA_EMBEDDINGS') !== 'false';
const USE_MIVAA_CHAT = Deno.env.get('USE_MIVAA_CHAT') !== 'false'; // For future when MIVAA supports text chat

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize AI logger
const aiLogger = createAILogger(supabaseUrl, supabaseServiceKey);

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

// Legacy MIVAA embedding function - replaced by unified vector search service

// Legacy embedding and search functions - replaced by unified vector search service

// Generate contextual response using RAG results
async function generateRAGContext(query: string, searchResults: any[]): Promise<string> {
  if (!searchResults.length) {
    return 'No relevant materials or knowledge found for your query.';
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

  console.log('Generating contextual response with MIVAA chat completion');

  const startTime = Date.now();
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'chat_completion',
        payload: {
          messages: [
            {
              role: 'system',
              content: 'You are a material expert assistant. Provide helpful, accurate information about materials based on the provided context.',
            },
            {
              role: 'user',
              content: contextPrompt,
            },
          ],
          model: 'gpt-4',
          max_tokens: 1000,
          temperature: 0.3,
        },
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      console.error('MIVAA chat completion error for context generation');

      // Log failed AI call
      await aiLogger.logAICall({
        task: 'rag_context_generation',
        model: 'gpt-4',
        latency_ms: latencyMs,
        action: 'fallback_to_rules',
        fallback_reason: 'MIVAA chat completion error',
        error_message: `HTTP ${response.status}: ${response.statusText}`,
      });

      return "I found relevant materials but couldn't generate a detailed response. Please check the search results.";
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.response || data.content || 'Response generated successfully.';

    // Log successful AI call
    await aiLogger.logOpenAICall(
      'rag_context_generation',
      'gpt-4',
      data,
      latencyMs,
      0.85, // Confidence score
      {
        model_confidence: 0.90,
        completeness: 0.85,
        consistency: 0.82,
        validation: 0.80,
      },
      'use_ai_result'
    );

    return content;

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('MIVAA chat completion failed:', error);

    // Log failed AI call
    await aiLogger.logAICall({
      task: 'rag_context_generation',
      model: 'gpt-4',
      latency_ms: latencyMs,
      action: 'fallback_to_rules',
      fallback_reason: 'MIVAA service unavailable',
      error_message: error instanceof Error ? error.message : String(error),
    });

    return "I found relevant materials but couldn't generate a detailed response. Please check MIVAA service availability.";
  }
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // Use unified vector search with caching
    const searchRequest: UnifiedSearchRequest = {
      query: requestBody.query,
      searchType: requestBody.search_type || 'hybrid',
      embeddingTypes: requestBody.embedding_types || ['openai'],
      matchThreshold: requestBody.match_threshold || 0.7,
      matchCount: requestBody.match_count || 10,
      includeContext: requestBody.include_context,
      workspaceId: undefined, // TODO: Extract from auth context
      userId: undefined, // TODO: Extract from auth context
    };

    const unifiedResponse = await performUnifiedVectorSearch(searchRequest, supabase);
    console.log('Unified search completed:', unifiedResponse.totalResults, 'results');

    // Measure retrieval quality
    try {
      const retrievedChunks: RetrievalResult[] = unifiedResponse.results.map((result: any, index: number) => ({
        chunk_id: result.id || `chunk-${index}`,
        content: result.content || '',
        relevance_score: result.similarity_score || 0,
        rank: index + 1,
      }));

      // Identify relevant chunks (simplified - based on query term matching)
      const allChunks = retrievedChunks.map(c => ({ id: c.chunk_id, content: c.content }));
      const relevantChunkIds = identifyRelevantChunks(requestBody.query, allChunks);

      // Evaluate and store retrieval quality metrics
      const retrievalMetrics = await evaluateRetrievalQuality(
        requestBody.query,
        retrievedChunks,
        relevantChunkIds,
        supabase,
      );

      console.log(`✅ Retrieval Quality Metrics: Precision=${(retrievalMetrics.precision * 100).toFixed(1)}%, Recall=${(retrievalMetrics.recall * 100).toFixed(1)}%, MRR=${retrievalMetrics.mrr.toFixed(3)}`);
    } catch (qualityError) {
      console.error('Warning: Failed to measure retrieval quality:', qualityError);
      // Don't fail the search if quality measurement fails
    }

    // Generate contextual response if requested
    let context: string | undefined;
    let responseMetrics: ResponseQualityMetrics | undefined;

    if (requestBody.include_context) {
      context = await generateRAGContext(requestBody.query, unifiedResponse.results);

      // Measure response quality
      try {
        const sourceChunks = unifiedResponse.results
          .map((r: any) => r.content || '')
          .filter((c: string) => c.length > 0);

        const responseId = `rag-response-${Date.now()}`;
        responseMetrics = await evaluateResponseQuality(
          responseId,
          requestBody.query,
          context || '',
          sourceChunks,
          supabase,
        );

        console.log(`✅ Response Quality: ${responseMetrics.quality_assessment} (${(responseMetrics.overall_quality_score * 100).toFixed(1)}%)`);
      } catch (qualityError) {
        console.error('Warning: Failed to measure response quality:', qualityError);
        // Don't fail the search if quality measurement fails
      }
    }

    const result: RAGSearchResult = {
      results: unifiedResponse.results,
      context,
      query_embedding: requestBody.include_context ? undefined : undefined, // Embedding not exposed for security
      search_params: requestBody,
      processing_time_ms: unifiedResponse.performance.totalTime,
    };

    // Store search results
    try {
      const { error: storageError } = await supabase
        .from('search_analytics')
        .insert({
          user_id: requestBody.user_id,
          input_data: {
            query: requestBody.query,
            search_type: requestBody.search_type || 'hybrid',
            embedding_types: requestBody.embedding_types,
            match_threshold: requestBody.match_threshold,
            match_count: requestBody.match_count,
          },
          result_data: {
            results: unifiedResponse.results,
            context: context,
            total_results: unifiedResponse.results.length,
          },
          confidence_score: unifiedResponse.results.length > 0
            ? unifiedResponse.results.reduce((sum: number, r: any) => sum + (r.similarity || 0), 0) / unifiedResponse.results.length
            : 0,
          processing_time_ms: unifiedResponse.performance.totalTime,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (storageError) {
        console.error('Failed to store search results:', storageError);
      } else {
        console.log('✅ Search results stored successfully');
      }
    } catch (storageError) {
      console.error('Error storing search results:', storageError);
    }

    console.log(`RAG search completed in ${unifiedResponse.performance.totalTime}ms`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('RAG search error:', error);
    return new Response(
      JSON.stringify({
        error: 'RAG search failed',
        details: error.message,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
