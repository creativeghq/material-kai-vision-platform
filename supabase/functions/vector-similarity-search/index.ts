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
  image_url?: string;
  category_filter?: string;
  confidence_threshold?: number;
  limit?: number;
  search_type: 'text' | 'image' | 'hybrid';
}

async function enhanceNaturalLanguageQuery(text: string): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return text;

  try {
    // Enhance the query with AI to extract material specifications
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a material specification expert. Extract and expand material properties from user queries. Return only the enhanced query with material properties, dimensions, characteristics, and related technical terms. Be concise but comprehensive.'
          },
          {
            role: 'user',
            content: `Enhance this material query: "${text}"`
          }
        ],
        max_tokens: 200,
        temperature: 0.1
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const enhanced = data.choices[0].message.content;
      console.log(`Enhanced query: "${text}" -> "${enhanced}"`);
      return enhanced;
    }
  } catch (error) {
    console.log('Query enhancement failed, using original:', error);
  }
  
  return text;
}

async function generateQueryEmbedding(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // First enhance the query for better material matching
  const enhancedQuery = await enhanceNaturalLanguageQuery(text);

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: enhancedQuery
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI Embeddings API error: ${error.error?.message}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function generateImageEmbedding(imageUrl: string): Promise<number[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Use GPT-4 Vision to describe the image, then embed the description
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Describe this material image in technical detail, focusing on material properties, appearance, texture, color, and any identifiable characteristics. Be concise but comprehensive.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI Vision API error: ${error.error?.message}`);
  }

  const data = await response.json();
  const description = data.choices[0].message.content;
  
  // Now generate embedding from the description
  return await generateQueryEmbedding(description);
}

async function performVectorSearch(
  queryEmbedding: number[], 
  imageEmbedding?: number[], 
  categoryFilter?: string,
  threshold = 0.7, 
  limit = 10
) {
  // Use the vector similarity search function
  const { data, error } = await supabase.rpc('vector_similarity_search', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    image_embedding: imageEmbedding ? `[${imageEmbedding.join(',')}]` : null,
    match_threshold: threshold,
    match_count: limit
  });

  if (error) {
    console.error('Vector search error:', error);
    throw new Error(`Vector search failed: ${error.message}`);
  }

  // Filter by category if specified
  let results = data || [];
  if (categoryFilter && categoryFilter !== 'all') {
    results = results.filter(item => item.category === categoryFilter);
  }

  return results;
}

async function searchEnhancedKnowledgeBase(query: string, limit = 10) {
  // Search in enhanced knowledge base (prioritizing PDF content)
  const { data: enhancedResults, error: enhancedError } = await supabase
    .from('enhanced_knowledge_base')
    .select('*')
    .or(`title.ilike.%${query}%,content.ilike.%${query}%,search_keywords.cs.{${query}}`)
    .eq('status', 'published')
    .order('relevance_score', { ascending: false })
    .limit(limit);

  if (enhancedError) {
    console.error('Enhanced knowledge search error:', enhancedError);
  }

  // Also search legacy material knowledge
  const { data: legacyResults, error: legacyError } = await supabase
    .from('material_knowledge')
    .select('*')
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
    .order('relevance_score', { ascending: false })
    .limit(Math.floor(limit / 2));

  if (legacyError) {
    console.error('Legacy knowledge search error:', legacyError);
  }

  // Combine and format results
  const combined = [
    ...(enhancedResults || []).map(item => ({
      ...item,
      source_type: 'enhanced_pdf',
      confidence: item.confidence_scores?.overall || 0.8
    })),
    ...(legacyResults || []).map(item => ({
      ...item,
      source_type: 'legacy_knowledge',
      confidence: item.relevance_score || 0.5
    }))
  ];

  return combined.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

async function processSearch(request: SearchRequest) {
  const startTime = Date.now();
  
  try {
    let queryEmbedding: number[] = [];
    let imageEmbedding: number[] | undefined;

    // Generate embeddings based on search type
    if (request.search_type === 'text' || request.search_type === 'hybrid') {
      if (!request.query) {
        throw new Error('Query text is required for text or hybrid search');
      }
      queryEmbedding = await generateQueryEmbedding(request.query);
    }

    if (request.search_type === 'image' || request.search_type === 'hybrid') {
      if (!request.image_url) {
        throw new Error('Image URL is required for image or hybrid search');
      }
      imageEmbedding = await generateImageEmbedding(request.image_url);
      
      // For image-only search, use image embedding as query
      if (request.search_type === 'image') {
        queryEmbedding = imageEmbedding;
      }
    }

    // Perform vector search
    const materialResults = await performVectorSearch(
      queryEmbedding,
      imageEmbedding,
      request.category_filter,
      request.confidence_threshold || 0.7,
      request.limit || 10
    );

    // Search enhanced knowledge base for additional context
    const knowledgeResults = request.query ? 
      await searchEnhancedKnowledgeBase(request.query, 8) : [];

    // Enhance results with additional material data
    const enhancedResults = await Promise.all(
      materialResults.map(async (result) => {
        // Get full material details
        const { data: material } = await supabase
          .from('materials_catalog')
          .select('*')
          .eq('id', result.material_id)
          .single();

        // Get recent recognition results for this material
        const { data: recentResults } = await supabase
          .from('recognition_results')
          .select('confidence_score, user_verified, created_at')
          .eq('material_id', result.material_id)
          .order('created_at', { ascending: false })
          .limit(5);

        return {
          ...result,
          material_details: material,
          recent_recognitions: recentResults || [],
          avg_confidence: recentResults?.length ? 
            recentResults.reduce((sum, r) => sum + (r.confidence_score || 0), 0) / recentResults.length : 
            null
        };
      })
    );

    return {
      success: true,
      results: enhancedResults,
      knowledge_results: knowledgeResults,
      search_metadata: {
        query: request.query,
        search_type: request.search_type,
        total_results: enhancedResults.length,
        processing_time_ms: Date.now() - startTime,
        filters_applied: {
          category: request.category_filter,
          confidence_threshold: request.confidence_threshold
        }
      }
    };

  } catch (error) {
    console.error('Search processing error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: SearchRequest = await req.json();
    
    console.log('Processing vector search request:', request);

    // Validate request
    if (!request.search_type) {
      return new Response(
        JSON.stringify({ error: 'search_type is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await processSearch(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Vector similarity search error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Search failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});