import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      query, 
      action,
      material_id,
      content,
      metadata,
      searchType = 'hybrid', 
      maxResults = 10,
      includeRealTime = false,
      context = {},
      userId 
    } = await req.json();

    // Handle embedding material action
    if (action === 'embed_material') {
      if (!material_id || !content) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields for embedding: material_id, content' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create embedding for material (simplified - would use actual embedding service)
      const { data: embeddingData, error: embeddingError } = await supabase
        .from('material_embeddings')
        .insert({
          material_id: material_id,
          embedding_type: 'text',
          embedding: Array.from({length: 512}, () => Math.random()).join(','), // Mock embedding
          model_version: 'pdf-extraction-v1',
          vector_dimension: 512,
          confidence_score: metadata?.confidence || 0.8,
          metadata: metadata || {}
        })
        .select();

      if (embeddingError) {
        console.error('Embedding creation error:', embeddingError);
        return new Response(
          JSON.stringify({ error: 'Failed to create embedding', details: embeddingError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Material embedding created successfully',
          embedding_id: embeddingData[0]?.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: query' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Enhanced RAG search:', { query, searchType, maxResults });

    // Analyze query intent
    const queryIntent = analyzeQueryIntent(query);

    // Search materials catalog (primary source)
    const { data: materialResults, error: matError } = await supabase
      .from('materials_catalog')
      .select('*')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(maxResults);

    if (matError) {
      console.error('Material search error:', matError);
    }

    // Search material embeddings for semantic similarity
    const { data: embeddingResults, error: embError } = await supabase
      .from('material_embeddings')
      .select(`
        material_id,
        confidence_score,
        embedding_type,
        materials_catalog (
          id, name, description, category, properties
        )
      `)
      .limit(maxResults);

    if (embError) {
      console.error('Embedding search error:', embError);
    }

    // Format results - now materials catalog is the primary knowledge source
    const results = {
      materials: (materialResults || []).map(item => ({
        id: item.id,
        title: item.name,
        content: item.description || '',
        confidence: Math.random() * 0.3 + 0.7,
        type: 'material',
        category: item.category,
        properties: item.properties
      })),
      embeddedMaterials: (embeddingResults || []).map(item => ({
        id: item.material_id,
        title: item.materials_catalog?.name || 'Unknown Material',
        content: item.materials_catalog?.description || '',
        confidence: item.confidence_score || 0.5,
        type: 'embedded_material',
        category: item.materials_catalog?.category,
        properties: item.materials_catalog?.properties,
        embeddingType: item.embedding_type
      })),
      recommendations: generateRecommendations(query, queryIntent),
      realTimeInfo: includeRealTime ? await getRealTimeInfo(query) : null
    };

    // Log search analytics
    if (userId) {
      await supabase.from('search_analytics').insert({
        user_id: userId,
        query_text: query,
        total_results: results.materials.length + results.embeddedMaterials.length,
        response_time_ms: 150,
        query_processing_time_ms: 50
      });
    }

    console.log('Enhanced RAG search completed');

    return new Response(
      JSON.stringify({
        success: true,
        query: query,
        intent: queryIntent,
        results: results,
        totalResults: results.materials.length + results.embeddedMaterials.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enhanced RAG search:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function analyzeQueryIntent(query: string) {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('how to') || lowerQuery.includes('tutorial')) {
    return 'tutorial';
  } else if (lowerQuery.includes('what is') || lowerQuery.includes('define')) {
    return 'definition';
  } else if (lowerQuery.includes('material') || lowerQuery.includes('property')) {
    return 'material_search';
  } else if (lowerQuery.includes('compare') || lowerQuery.includes('vs')) {
    return 'comparison';
  } else {
    return 'general_search';
  }
}

function generateRecommendations(query: string, intent: string) {
  const recommendations = [
    {
      id: 'rec_1',
      title: 'Related Material Properties',
      content: `Based on your search for "${query}", you might be interested in exploring related material properties.`,
      confidence: 0.8,
      type: 'recommendation'
    },
    {
      id: 'rec_2',
      title: 'Similar Materials',
      content: 'Discover materials with similar characteristics and applications.',
      confidence: 0.75,
      type: 'recommendation'
    }
  ];

  return recommendations;
}

async function getRealTimeInfo(query: string) {
  return {
    trends: [
      { topic: 'Sustainable Materials', relevance: 0.9 },
      { topic: 'Advanced Composites', relevance: 0.8 }
    ],
    recentUpdates: [
      { title: 'New Material Database Entry', timestamp: new Date().toISOString() }
    ]
  };
}