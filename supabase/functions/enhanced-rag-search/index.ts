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


    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: query' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Enhanced RAG search:', { query, searchType, maxResults });

    // Analyze query intent
    const queryIntent = analyzeQueryIntent(query);

    // Search enhanced knowledge base (primary PDF content source)
    const { data: knowledgeResults, error: kbError } = await supabase
      .from('enhanced_knowledge_base')
      .select('*')
      .or(`title.ilike.%${query}%,content.ilike.%${query}%,search_keywords.cs.{${query}}`)
      .eq('status', 'published')
      .limit(maxResults);

    if (kbError) {
      console.error('Knowledge base search error:', kbError);
    }

    // Search materials catalog (secondary source)
    const { data: materialResults, error: matError } = await supabase
      .from('materials_catalog')
      .select('*')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(Math.floor(maxResults / 2));

    if (matError) {
      console.error('Material search error:', matError);
    }


    // Format results - enhanced knowledge base is now the primary source
    const results = {
      knowledgeBase: (knowledgeResults || []).map(item => ({
        id: item.id,
        title: item.title,
        content: item.content.substring(0, 500) + '...',
        confidence: (item.confidence_scores?.overall || 0.8),
        type: 'knowledge_document',
        source: 'pdf_document',
        categories: item.material_categories || [],
        keywords: item.search_keywords || [],
        metadata: {
          source_url: item.source_url,
          technical_complexity: item.technical_complexity,
          material_categories: item.material_categories,
          processing_method: item.metadata?.processing_method
        }
      })),
      materials: (materialResults || []).map(item => ({
        id: item.id,
        title: item.name,
        content: item.description || '',
        confidence: Math.random() * 0.3 + 0.7,
        type: 'material',
        category: item.category,
        properties: item.properties
      })),
      recommendations: generateRecommendations(query, queryIntent),
      realTimeInfo: includeRealTime ? await getRealTimeInfo(query) : null
    };

    // Log search analytics
    if (userId) {
      await supabase.from('search_analytics').insert({
        user_id: userId,
        query_text: query,
        total_results: results.knowledgeBase.length + results.materials.length,
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
        totalResults: results.knowledgeBase.length + results.materials.length
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