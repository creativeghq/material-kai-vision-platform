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

interface AnalysisRequest {
  file_id: string;
  analysis_type: 'comprehensive' | 'quick' | 'properties_only';
  include_similar: boolean;
}

interface MaterialAnalysis {
  material_name: string;
  category: string;
  confidence: number;
  properties: Record<string, any>;
  chemical_composition: Record<string, any>;
  safety_considerations: string[];
  standards: string[];
  embedding: number[];
}

async function analyzeWithOpenAI(imageUrl: string, analysisType: string): Promise<MaterialAnalysis> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Comprehensive analysis prompt based on type
  const prompts = {
    comprehensive: `Analyze this material image comprehensively. Provide:
    1. Material identification with confidence score (0-1)
    2. Category classification
    3. Physical properties (density, strength, thermal properties)
    4. Chemical composition if identifiable
    5. Safety considerations and handling requirements
    6. Relevant industry standards
    
    Respond in JSON format only.`,
    
    quick: `Quickly identify this material. Provide basic identification, category, and confidence score in JSON format.`,
    
    properties_only: `Focus on identifying the physical and mechanical properties of this material. Respond in JSON format.`
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
          content: 'You are an expert materials scientist with extensive knowledge of material identification, properties, and safety. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompts[analysisType] || prompts.comprehensive
            },
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
      max_tokens: 1500,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const analysisText = data.choices[0].message.content;
  
  try {
    const analysis = JSON.parse(analysisText);
    
    // Generate embedding for the analysis
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: `${analysis.material_name} ${analysis.category} ${JSON.stringify(analysis.properties)}`
      }),
    });

    const embeddingData = await embeddingResponse.json();
    analysis.embedding = embeddingData.data[0].embedding;
    
    return analysis;
  } catch (error) {
    console.error('Failed to parse OpenAI response:', analysisText);
    throw new Error('Invalid JSON response from OpenAI');
  }
}

async function findSimilarMaterials(embedding: number[], limit = 5) {
  const { data, error } = await supabase.rpc('vector_similarity_search', {
    query_embedding: `[${embedding.join(',')}]`,
    match_threshold: 0.7,
    match_count: limit
  });

  if (error) {
    console.error('Error finding similar materials:', error);
    return [];
  }

  return data || [];
}

async function processAnalysis(request: AnalysisRequest) {
  const startTime = Date.now();
  
  try {
    // Get file information
    const { data: file, error: fileError } = await supabase
      .from('uploaded_files')
      .select('*')
      .eq('id', request.file_id)
      .single();

    if (fileError || !file) {
      throw new Error(`File not found: ${fileError?.message}`);
    }

    // Get public URL for the file
    const { data: urlData } = supabase.storage
      .from('material-images')
      .getPublicUrl(file.storage_path);

    console.log(`Analyzing image with OpenAI: ${urlData.publicUrl}`);
    
    // Analyze with OpenAI
    const analysis = await analyzeWithOpenAI(urlData.publicUrl, request.analysis_type);
    
    // Find similar materials if requested
    let similarMaterials = [];
    if (request.include_similar && analysis.embedding) {
      similarMaterials = await findSimilarMaterials(analysis.embedding);
    }

    // Find or create material in catalog
    let materialId = null;
    if (analysis.confidence > 0.8) {
      const { data: existingMaterial } = await supabase
        .from('materials_catalog')
        .select('id')
        .eq('name', analysis.material_name)
        .single();

      if (!existingMaterial) {
        // Create new material entry
        const { data: newMaterial, error: createError } = await supabase
          .from('materials_catalog')
          .insert({
            name: analysis.material_name,
            category: analysis.category,
            properties: analysis.properties || {},
            chemical_composition: analysis.chemical_composition || {},
            safety_data: {
              considerations: analysis.safety_considerations || [],
              handling_requirements: []
            },
            standards: analysis.standards || [],
            embedding: `[${analysis.embedding.join(',')}]`
          })
          .select('id')
          .single();

        if (!createError && newMaterial) {
          materialId = newMaterial.id;
        }
      } else {
        materialId = existingMaterial.id;
      }
    }

    // Store recognition result
    const { data: result, error: resultError } = await supabase
      .from('recognition_results')
      .insert({
        file_id: request.file_id,
        material_id: materialId,
        confidence_score: analysis.confidence,
        detection_method: 'visual',
        ai_model_version: 'gpt-4o-vision',
        properties_detected: analysis.properties || {},
        processing_time_ms: Date.now() - startTime,
        user_verified: false,
        embedding: analysis.embedding ? `[${analysis.embedding.join(',')}]` : null
      })
      .select()
      .single();

    if (resultError) {
      console.error('Error storing result:', resultError);
      throw new Error(`Failed to store result: ${resultError.message}`);
    }

    // Log analytics
    await supabase
      .from('analytics_events')
      .insert({
        user_id: file.user_id,
        event_type: 'ai_material_analysis',
        event_data: {
          file_id: request.file_id,
          result_id: result.id,
          analysis_type: request.analysis_type,
          confidence: analysis.confidence,
          material_category: analysis.category,
          processing_time_ms: Date.now() - startTime
        }
      });

    return {
      success: true,
      result,
      analysis,
      similar_materials: similarMaterials,
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('AI analysis error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: AnalysisRequest = await req.json();
    
    console.log('Processing AI analysis request:', request);

    if (!request.file_id) {
      return new Response(
        JSON.stringify({ error: 'file_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await processAnalysis(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('AI material analysis error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'AI analysis failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});