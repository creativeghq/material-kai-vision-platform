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

interface RecognitionRequest {
  job_id: string;
  file_ids: string[];
  options: {
    detection_methods: string[];
    confidence_threshold: number;
    include_similar_materials: boolean;
    extract_properties: boolean;
  };
}

interface MaterialClassification {
  material_name: string;
  category: string;
  confidence: number;
  properties: Record<string, any>;
}

// Simple material classification based on visual analysis
// In production, this would use advanced AI models
async function classifyMaterial(imageUrl: string): Promise<MaterialClassification> {
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

      // Classify the material
      const classification = await classifyMaterial(urlData.publicUrl);
      
      // Find matching material in catalog
      const matchingMaterial = await findMatchingMaterial(classification);

      // Create recognition result
      const { data: result, error: resultError } = await supabase
        .from('recognition_results')
        .insert({
          file_id: fileId,
          material_id: matchingMaterial?.id,
          confidence_score: classification.confidence,
          detection_method: 'visual',
          ai_model_version: 'demo-v1.0',
          properties_detected: classification.properties,
          processing_time_ms: Date.now() - startTime,
          user_verified: false
        })
        .select()
        .single();

      if (resultError) {
        console.error('Error creating recognition result:', resultError);
        continue;
      }

      results.push(result);

      // Log analytics event
      await supabase
        .from('analytics_events')
        .insert({
          user_id: file.user_id,
          event_type: 'material_identified',
          event_data: {
            file_id: fileId,
            result_id: result.id,
            material_category: classification.category,
            confidence: classification.confidence
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