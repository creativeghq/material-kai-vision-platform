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

interface VoiceRequest {
  audio_data: string; // base64 encoded audio
  user_id: string;
  language?: string;
  enhance_with_ai?: boolean;
}

function processBase64Audio(base64String: string): Uint8Array {
  const binaryString = atob(base64String);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

async function transcribeAudio(audioData: Uint8Array): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const formData = new FormData();
  const audioBlob = new Blob([audioData], { type: 'audio/webm' });
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('prompt', 'Material description, properties, color, texture, composition, industrial application');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Whisper API error: ${error.error?.message}`);
  }

  const result = await response.json();
  return result.text;
}

async function enhanceDescription(transcription: string): Promise<{
  enhanced_description: string;
  extracted_properties: Record<string, any>;
  suggested_category: string;
  confidence_score: number;
}> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

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
          content: `You are an expert materials scientist. Analyze the following voice description of a material and:
          1. Enhance the description with technical details
          2. Extract any mentioned properties (density, strength, color, texture, etc.)
          3. Suggest the most likely material category
          4. Provide a confidence score (0-1) for your assessment
          
          Respond in JSON format with: enhanced_description, extracted_properties, suggested_category, confidence_score`
        },
        {
          role: 'user',
          content: `Voice description: "${transcription}"`
        }
      ],
      max_tokens: 800,
      temperature: 0.2
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse AI response:', content);
    return {
      enhanced_description: transcription,
      extracted_properties: {},
      suggested_category: 'other',
      confidence_score: 0.5
    };
  }
}

async function searchSimilarMaterials(description: string, properties: Record<string, any>) {
  // Generate embedding for search
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return [];

  try {
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: `${description} ${JSON.stringify(properties)}`
      }),
    });

    if (!embeddingResponse.ok) return [];

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    // Search for similar materials
    const { data, error } = await supabase.rpc('vector_similarity_search', {
      query_embedding: `[${embedding.join(',')}]`,
      match_threshold: 0.6,
      match_count: 5
    });

    return error ? [] : (data || []);
  } catch (error) {
    console.error('Error searching similar materials:', error);
    return [];
  }
}

async function processVoiceInput(request: VoiceRequest) {
  const startTime = Date.now();
  
  try {
    // Process audio data
    const audioBytes = processBase64Audio(request.audio_data);
    
    console.log(`Processing audio: ${audioBytes.length} bytes`);
    
    // Transcribe audio
    const transcription = await transcribeAudio(audioBytes);
    console.log(`Transcription: ${transcription}`);
    
    if (!transcription.trim()) {
      throw new Error('No speech detected in audio');
    }

    let enhancedResult = null;
    let similarMaterials = [];

    // Enhance with AI if requested
    if (request.enhance_with_ai) {
      enhancedResult = await enhanceDescription(transcription);
      
      // Search for similar materials
      similarMaterials = await searchSimilarMaterials(
        enhancedResult.enhanced_description,
        enhancedResult.extracted_properties
      );
    }

    // Store the voice input record
    const { data: voiceRecord, error: recordError } = await supabase
      .from('analytics_events')
      .insert({
        user_id: request.user_id,
        event_type: 'voice_material_description',
        event_data: {
          transcription,
          enhanced_description: enhancedResult?.enhanced_description,
          extracted_properties: enhancedResult?.extracted_properties,
          suggested_category: enhancedResult?.suggested_category,
          confidence_score: enhancedResult?.confidence_score,
          processing_time_ms: Date.now() - startTime,
          audio_length_bytes: audioBytes.length
        }
      })
      .select()
      .single();

    if (recordError) {
      console.error('Error storing voice record:', recordError);
    }

    return {
      success: true,
      transcription,
      enhanced_result: enhancedResult,
      similar_materials: similarMaterials,
      processing_time_ms: Date.now() - startTime,
      record_id: voiceRecord?.id
    };

  } catch (error) {
    console.error('Voice processing error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: VoiceRequest = await req.json();
    
    console.log('Processing voice input request');

    // Validate request
    if (!request.audio_data || !request.user_id) {
      return new Response(
        JSON.stringify({ error: 'audio_data and user_id are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await processVoiceInput(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Voice to material error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Voice processing failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});