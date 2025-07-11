import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

interface RecognitionRequest {
  job_id: string;
  file_ids: string[];
  options: {
    detection_methods: string[];
    confidence_threshold: number;
    include_similar_materials: boolean;
    extract_properties: boolean;
    use_ai_vision?: boolean;
  };
}

interface MaterialClassification {
  material_name: string;
  category: string;
  confidence: number;
  properties: Record<string, any>;
  reasoning?: string;
  visual_features?: string[];
}

// Enhanced AI-powered material classification using OpenAI Vision
async function classifyMaterialWithAI(imageUrl: string): Promise<MaterialClassification> {
  if (!OPENAI_API_KEY) {
    console.log('OpenAI API key not found, falling back to simple classification');
    return classifyMaterialSimple(imageUrl);
  }

  try {
    console.log(`Analyzing image with AI: ${imageUrl}`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this material image and provide detailed classification. Return a JSON object with:
                {
                  "material_name": "specific material name",
                  "category": "one of: metals, plastics, ceramics, composites, textiles, wood, glass, rubber, concrete, other",
                  "confidence": 0.0-1.0,
                  "properties": {
                    "surface_texture": "description",
                    "color": "description", 
                    "apparent_hardness": "soft/medium/hard",
                    "estimated_density": "low/medium/high",
                    "visible_features": ["feature1", "feature2"]
                  },
                  "reasoning": "explanation of classification",
                  "visual_features": ["distinctive visual characteristics"]
                }`
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
        max_tokens: 500,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{.*\}/s);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const classification = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize the response
    return {
      material_name: classification.material_name || 'Unknown Material',
      category: classification.category || 'other',
      confidence: Math.min(Math.max(classification.confidence || 0.5, 0), 1),
      properties: classification.properties || {},
      reasoning: classification.reasoning || '',
      visual_features: classification.visual_features || []
    };

  } catch (error) {
    console.error('AI classification error:', error);
    console.log('Falling back to simple classification');
    return classifyMaterialSimple(imageUrl);
  }
}

// Fallback simple material classification
function classifyMaterialSimple(imageUrl: string): MaterialClassification {
  console.log(`Analyzing image: ${imageUrl}`);
  
  // For demo purposes, simulate classification based on filename patterns
  // In production, this would call OpenAI Vision API or HuggingFace models
  
  const url = imageUrl.toLowerCase();
  let material_name = 'Unknown Material';
  let category = 'other';
  let confidence = 0.5;
  let properties = {};

  if (url.includes('aluminum') || url.includes('aluminium')) {
    material_name = 'Aluminum Alloy';
    category = 'metals';
    confidence = 0.85;
    properties = {
      density: 2.7,
      yield_strength: 276,
      thermal_conductivity: 167
    };
  } else if (url.includes('steel') || url.includes('iron')) {
    material_name = 'Steel';
    category = 'metals';
    confidence = 0.90;
    properties = {
      density: 7.85,
      yield_strength: 250,
      thermal_conductivity: 51.9
    };
  } else if (url.includes('plastic') || url.includes('polymer')) {
    material_name = 'Plastic Polymer';
    category = 'plastics';
    confidence = 0.75;
    properties = {
      density: 1.2,
      tensile_strength: 50,
      melting_point: 150
    };
  } else if (url.includes('wood') || url.includes('timber')) {
    material_name = 'Wood';
    category = 'wood';
    confidence = 0.80;
    properties = {
      density: 0.6,
      moisture_content: 12,
      hardness: 'medium'
    };
  } else if (url.includes('ceramic') || url.includes('clay')) {
    material_name = 'Ceramic';
    category = 'ceramics';
    confidence = 0.70;
    properties = {
      density: 2.5,
      thermal_resistance: 'high',
      brittleness: 'high'
    };
  }

  return {
    material_name,
    category,
    confidence,
    properties
  };
}

async function findMatchingMaterial(classification: MaterialClassification) {
  // Find existing material in catalog that matches
  const { data: materials, error } = await supabase
    .from('materials_catalog')
    .select('*')
    .eq('category', classification.category)
    .ilike('name', `%${classification.material_name.split(' ')[0]}%`)
    .limit(1);

  if (error) {
    console.error('Error finding matching material:', error);
    return null;
  }

  return materials?.[0] || null;
}

async function generateMaterialEmbedding(classification: MaterialClassification): Promise<number[] | null> {
  if (!OPENAI_API_KEY) {
    return null;
  }

  try {
    const embeddingText = `${classification.material_name} ${classification.category} ${classification.reasoning || ''} ${classification.visual_features?.join(' ') || ''}`;
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: embeddingText,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding API error: ${response.status}`);
    }

    const embeddingResponse = await response.json();
    return embeddingResponse.data[0]?.embedding || null;

  } catch (error) {
    console.error('Embedding generation error:', error);
    return null;
  }
}

async function processRecognitionJob(request: RecognitionRequest) {
  const startTime = Date.now();
  
  try {
    // Update job status to processing
    await supabase
      .from('processing_queue')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', request.job_id);

    const results = [];

    // Process each uploaded file
    for (const fileId of request.file_ids) {
      // Get file information
      const { data: file, error: fileError } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError || !file) {
        console.error(`Error fetching file ${fileId}:`, fileError);
        continue;
      }

      // Get public URL for the file
      const { data: urlData } = supabase.storage
        .from('material-images')
        .getPublicUrl(file.storage_path);

      // Classify the material using AI or fallback
      const classification = request.options.use_ai_vision !== false 
        ? await classifyMaterialWithAI(urlData.publicUrl)
        : classifyMaterialSimple(urlData.publicUrl);
      
      
      // Find matching material in catalog
      const matchingMaterial = await findMatchingMaterial(classification);

      // Generate semantic embedding for better search
      const embedding = await generateMaterialEmbedding(classification);

      // Create recognition result with enhanced data
      const { data: result, error: resultError } = await supabase
        .from('recognition_results')
        .insert({
          file_id: fileId,
          material_id: matchingMaterial?.id,
          confidence_score: classification.confidence,
          detection_method: 'visual',
          ai_model_version: OPENAI_API_KEY ? 'gpt-4-vision-v1.0' : 'fallback-v1.0',
          properties_detected: {
            ...classification.properties,
            reasoning: classification.reasoning,
            visual_features: classification.visual_features,
            material_name: classification.material_name,
            category: classification.category
          },
          processing_time_ms: Date.now() - startTime,
          user_verified: false,
          embedding: embedding ? `[${embedding.join(',')}]` : null
        })
        .select()
        .single();

      if (resultError) {
        console.error('Error creating recognition result:', resultError);
        continue;
      }

      results.push(result);

      // Store material embedding if we have one and no existing material
      if (embedding && !matchingMaterial && request.options.extract_properties) {
        try {
          await supabase
            .from('material_embeddings')
            .insert({
              material_id: result.id, // Use recognition result ID as temporary material ID
              embedding: `[${embedding.join(',')}]`,
              embedding_type: 'openai_text_3_small',
              model_version: 'text-embedding-3-small',
              vector_dimension: embedding.length,
              confidence_score: classification.confidence,
              metadata: {
                source: 'material_recognition',
                classification: classification
              }
            });
        } catch (embeddingError) {
          console.error('Error storing embedding:', embeddingError);
        }
      }

      // Log analytics event with enhanced data
      await supabase
        .from('analytics_events')
        .insert({
          user_id: file.user_id,
          event_type: 'material_identified',
          event_data: {
            file_id: fileId,
            result_id: result.id,
            material_category: classification.category,
            confidence: classification.confidence,
            ai_powered: !!OPENAI_API_KEY,
            processing_method: OPENAI_API_KEY ? 'ai_vision' : 'fallback'
          }
        });
    }

    const processingTime = Date.now() - startTime;

    // Update job status to completed
    await supabase
      .from('processing_queue')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: { 
          results: results.map(r => r.id),
          processing_time_ms: processingTime
        },
        processing_time_ms: processingTime
      })
      .eq('id', request.job_id);

    return {
      success: true,
      results,
      processing_time_ms: processingTime
    };

  } catch (error) {
    console.error('Recognition processing error:', error);
    
    // Update job status to failed
    await supabase
      .from('processing_queue')
      .update({ 
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', request.job_id);

    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: RecognitionRequest = await req.json();
    
    console.log('Processing recognition request:', request);

    // Validate request
    if (!request.job_id || !request.file_ids || !Array.isArray(request.file_ids)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request: job_id and file_ids are required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Process the recognition job
    const result = await processRecognitionJob(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Material recognition error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Recognition processing failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});