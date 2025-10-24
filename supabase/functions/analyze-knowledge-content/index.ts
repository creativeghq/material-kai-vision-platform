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

  try {
    // Primary: Use MIVAA semantic analysis for content analysis
    const mivaaResponse = await fetch(`${Deno.env.get('MIVAA_API_URL')}/semantic_analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('MIVAA_API_KEY')}`,
      },
      body: JSON.stringify({
        input_text: content,
        analysis_type: 'knowledge_content_analysis',
        prompt: `${prompts[analysisDepth as keyof typeof prompts] || prompts.comprehensive}\n\nSystem context: You are an expert knowledge analyst specializing in technical content analysis, particularly in materials science, engineering, and related domains. Analyze content for key insights, entities, and actionable information. Always respond with valid JSON matching the KnowledgeAnalysis interface.`,
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (mivaaResponse.ok) {
      const mivaaData = await mivaaResponse.json();
      const analysisText = mivaaData.analysis_result || mivaaData.result;

      try {
        return JSON.parse(analysisText);
      } catch (parseError) {
        console.warn('Failed to parse MIVAA analysis response, MIVAA-only approach:', parseError);
        // Fall through to OpenAI fallback
      }
    } else {
      console.warn('MIVAA content analysis failed, MIVAA-only approach');
      // Fall through to OpenAI fallback
    }
  } catch (mivaaError) {
    console.warn('MIVAA content analysis error, MIVAA-only approach:', mivaaError);
    // Fall through to OpenAI fallback
  }

  // MIVAA-only approach - OpenAI integration removed for centralized AI management
  console.error('❌ All MIVAA methods failed for content analysis');
  throw new Error('Content analysis failed - MIVAA service required. OpenAI direct integration removed as part of centralized AI architecture. Please check MIVAA service availability.');
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Primary: Use MIVAA generate_embeddings action
    const mivaaResponse = await fetch(`${Deno.env.get('MIVAA_API_URL')}/generate_embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('MIVAA_API_KEY')}`,
      },
      body: JSON.stringify({
        input: text.substring(0, 8000), // Limit input length
        model: 'text-embedding-ada-002', // PLATFORM STANDARD
      }),
    });

    if (mivaaResponse.ok) {
      const mivaaData = await mivaaResponse.json();
      if (mivaaData.embeddings && mivaaData.embeddings.length > 0) {
        return mivaaData.embeddings[0];
      } else {
        console.warn('MIVAA embeddings response missing data, MIVAA-only approach');
      }
    } else {
      console.warn('MIVAA embedding generation failed, MIVAA-only approach');
    }
  } catch (mivaaError) {
    console.warn('MIVAA embedding generation error, MIVAA-only approach:', mivaaError);
  }

  throw new Error('Embedding generation failed - MIVAA service required. OpenAI direct integration removed as part of centralized AI architecture. Please check MIVAA service availability.');
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
