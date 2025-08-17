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

interface AnalysisRequest {
  content: string;
  content_type: 'text' | 'pdf' | 'document' | 'webpage';
  analysis_depth: 'surface' | 'detailed' | 'comprehensive';
  extract_entities: boolean;
  generate_summary: boolean;
  user_id?: string;
}

interface KnowledgeAnalysis {
  content_summary: string;
  key_topics: string[];
  entities: {
    materials: string[];
    techniques: string[];
    standards: string[];
    organizations: string[];
    locations: string[];
  };
  complexity_score: number;
  readability_score: number;
  technical_level: 'basic' | 'intermediate' | 'advanced' | 'expert';
  knowledge_domains: string[];
  actionable_insights: string[];
  related_concepts: string[];
  confidence: number;
}

async function analyzeContentWithAI(content: string, analysisDepth: string): Promise<KnowledgeAnalysis> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompts = {
    surface: 'Analyze this content briefly. Identify main topics, key materials mentioned, and provide a summary. Focus on extracting actionable insights.',

    detailed: `Perform detailed analysis of this content. Extract:
    1. Comprehensive summary
    2. Key topics and themes
    3. Materials, techniques, standards mentioned
    4. Technical complexity assessment
    5. Knowledge domains covered
    6. Actionable insights and recommendations
    
    Provide structured analysis in JSON format.`,

    comprehensive: `Perform comprehensive knowledge analysis of this content. Extract:
    1. Detailed content summary
    2. All key topics and subtopics
    3. Named entities (materials, techniques, standards, organizations, locations)
    4. Complexity and readability assessment
    5. Technical level classification
    6. Knowledge domains and interdisciplinary connections
    7. Actionable insights and practical applications
    8. Related concepts for further exploration
    9. Confidence assessment of the analysis
    
    Respond with detailed JSON structure.`,
  };

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
          content: 'You are an expert knowledge analyst specializing in technical content analysis, particularly in materials science, engineering, and related domains. Analyze content for key insights, entities, and actionable information. Always respond with valid JSON matching the KnowledgeAnalysis interface.',
        },
        {
          role: 'user',
          content: `${prompts[analysisDepth] || prompts.comprehensive}\n\nContent to analyze:\n${content}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const analysisText = data.choices[0].message.content;

  try {
    return JSON.parse(analysisText);
  } catch (error) {
    console.error('Failed to parse OpenAI response:', analysisText);
    throw new Error('Invalid JSON response from OpenAI');
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
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
      input: text.substring(0, 8000), // Limit input length
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Embedding API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function findSimilarContent(embedding: number[], limit = 5) {
  const { data, error } = await supabase.rpc('vector_similarity_search', {
    query_embedding: `[${embedding.join(',')}]`,
    match_threshold: 0.75,
    match_count: limit,
  });

  if (error) {
    console.error('Error finding similar content:', error);
    return [];
  }

  return data || [];
}

async function storeKnowledgeAnalysis(analysis: KnowledgeAnalysis, request: AnalysisRequest, embedding: number[]) {
  const { data, error } = await supabase
    .from('knowledge_analysis')
    .insert({
      content_hash: await generateContentHash(request.content),
      content_type: request.content_type,
      analysis_depth: request.analysis_depth,
      summary: analysis.content_summary,
      key_topics: analysis.key_topics,
      entities: analysis.entities,
      complexity_score: analysis.complexity_score,
      readability_score: analysis.readability_score,
      technical_level: analysis.technical_level,
      knowledge_domains: analysis.knowledge_domains,
      actionable_insights: analysis.actionable_insights,
      related_concepts: analysis.related_concepts,
      confidence: analysis.confidence,
      embedding: `[${embedding.join(',')}]`,
      user_id: request.user_id,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error storing knowledge analysis:', error);
    throw new Error(`Failed to store analysis: ${error.message}`);
  }

  return data;
}

async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function processKnowledgeAnalysis(request: AnalysisRequest) {
  const startTime = Date.now();

  try {
    console.log(`Analyzing content with depth: ${request.analysis_depth}`);

    // Analyze content with AI
    const analysis = await analyzeContentWithAI(request.content, request.analysis_depth);

    // Generate embedding for similarity search
    const embeddingText = `${analysis.content_summary} ${analysis.key_topics.join(' ')} ${analysis.knowledge_domains.join(' ')}`;
    const embedding = await generateEmbedding(embeddingText);

    // Find similar content
    const similarContent = await findSimilarContent(embedding);

    // Store the analysis
    const storedAnalysis = await storeKnowledgeAnalysis(analysis, request, embedding);

    // Log analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'knowledge_content_analysis',
          event_data: {
            analysis_id: storedAnalysis.id,
            content_type: request.content_type,
            analysis_depth: request.analysis_depth,
            complexity_score: analysis.complexity_score,
            technical_level: analysis.technical_level,
            processing_time_ms: Date.now() - startTime,
          },
        });
    }

    return {
      success: true,
      analysis,
      analysis_id: storedAnalysis.id,
      similar_content: similarContent,
      processing_time_ms: Date.now() - startTime,
    };

  } catch (error) {
    console.error('Knowledge analysis error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: AnalysisRequest = await req.json();

    console.log('Processing knowledge analysis request:', {
      content_type: request.content_type,
      analysis_depth: request.analysis_depth,
      content_length: request.content.length,
    });

    if (!request.content || request.content.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'content is required and cannot be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (request.content.length > 50000) {
      return new Response(
        JSON.stringify({ error: 'content too large, maximum 50,000 characters allowed' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await processKnowledgeAnalysis(request);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Knowledge content analysis error:', error);

    return new Response(
      JSON.stringify({
        error: 'Knowledge analysis failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
