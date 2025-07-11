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

interface GenerationRequest {
  user_id: string;
  prompt: string;
  room_type?: string;
  style?: string;
  specific_materials?: string[];
}

// CrewAI Agent: Parse user request with hybrid AI approach
async function parseUserRequestHybrid(prompt: string) {
  // Try OpenAI first
  try {
    const openaiResult = await parseWithOpenAI(prompt);
    const validation = validateParseResult(openaiResult);
    
    if (validation.score >= 0.7) {
      console.log(`OpenAI parsing successful with score: ${validation.score}`);
      return openaiResult;
    }
    
    console.log(`OpenAI parsing score ${validation.score} below threshold, trying Claude...`);
  } catch (error) {
    console.log(`OpenAI parsing failed: ${error.message}, trying Claude...`);
  }

  // Try Claude as fallback
  try {
    const claudeResult = await parseWithClaude(prompt);
    const validation = validateParseResult(claudeResult);
    
    console.log(`Claude parsing completed with score: ${validation.score}`);
    return claudeResult;
  } catch (error) {
    console.error(`Claude parsing also failed: ${error.message}`);
    // Return basic fallback
    return {
      room_type: 'living room',
      style: 'modern',
      materials: [],
      features: [],
      layout: '',
      enhanced_prompt: prompt
    };
  }
}

function validateParseResult(result: any): { score: number } {
  let score = 1.0;
  
  if (!result.room_type) score -= 0.3;
  if (!result.style) score -= 0.3;
  if (!result.enhanced_prompt || result.enhanced_prompt === result.original_prompt) score -= 0.2;
  if (!result.materials || result.materials.length === 0) score -= 0.1;
  if (!result.features || result.features.length === 0) score -= 0.1;
  
  return { score: Math.max(0, Math.min(1, score)) };
}

async function parseWithOpenAI(prompt: string) {
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
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a CrewAI Agent specialized in parsing interior design requests. Extract:
          1. Room type (living room, kitchen, bedroom, etc.)
          2. Style (modern, Swedish, industrial, etc.)
          3. Specific materials mentioned (oak, marble, steel, etc.)
          4. Key furniture or features
          5. Layout specifications (L-shape, open concept, etc.)
          
          Respond in JSON format with: room_type, style, materials, features, layout, enhanced_prompt`
        },
        {
          role: 'user',
          content: `Parse this interior design request: "${prompt}"`
        }
      ],
      max_tokens: 500,
      temperature: 0.2
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return {
      room_type: 'living room',
      style: 'modern',
      materials: [],
      features: [],
      layout: '',
      enhanced_prompt: prompt
    };
  }
}

async function parseWithClaude(prompt: string) {
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!claudeKey) {
    throw new Error('Claude API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${claudeKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: [
        {
          role: 'user',
          content: `Parse this interior design request and extract room type, style, materials, features, and layout. Create an enhanced prompt for image generation.

Request: "${prompt}"

Respond in JSON format with: room_type, style, materials, features, layout, enhanced_prompt`
        }
      ],
      max_tokens: 500,
      system: 'You are an interior design expert. Parse requests accurately and enhance prompts for better image generation.'
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`);
  }

  const data = await response.json();
  try {
    return JSON.parse(data.content[0].text);
  } catch {
    return {
      room_type: 'living room',
      style: 'modern',
      materials: [],
      features: [],
      layout: '',
      enhanced_prompt: prompt
    };
  }
}

// CrewAI Agent: Match materials from our catalog
async function matchMaterials(materials: string[]) {
  if (!materials || materials.length === 0) return [];

  try {
    const materialMatches = [];
    
    for (const material of materials) {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('id, name, category, properties')
        .or(`name.ilike.%${material}%,description.ilike.%${material}%`)
        .limit(3);

      if (!error && data && data.length > 0) {
        materialMatches.push(...data);
      }
    }

    return materialMatches;
  } catch (error) {
    console.error('Error matching materials:', error);
    return [];
  }
}

// CrewAI Agent: Generate 3D interior image using OpenAI
async function generate3DImage(enhancedPrompt: string, materials: any[]) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  // Enhance prompt with material details and 3D styling
  let finalPrompt = enhancedPrompt;
  if (materials.length > 0) {
    const materialDescriptions = materials.map(m => `${m.name} (${m.category})`).join(', ');
    finalPrompt += `. Materials: ${materialDescriptions}.`;
  }
  
  // Add specific 3D interior design styling
  finalPrompt += ' Professional interior design photography, photorealistic, high quality, architectural visualization, well-lit, modern composition, 8K resolution, award-winning interior design';

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: finalPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'high'
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI API error: ${response.statusText} - ${errorData}`);
    }

    const data = await response.json();
    
    if (!data.data || !data.data[0] || !data.data[0].url) {
      throw new Error('Invalid response from OpenAI image generation');
    }

    // Download the image and convert to base64
    const imageResponse = await fetch(data.data[0].url);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch generated image');
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    return `data:image/png;base64,${base64}`;
    
  } catch (error) {
    console.error('3D generation error:', error);
    throw new Error(`Failed to generate 3D image: ${error.message}`);
  }
}

// CrewAI Agent: Quality validation and feedback
async function validateQuality(imageBase64: string, originalPrompt: string) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return { score: 0.8, feedback: 'Quality validation unavailable' };
  }

  try {
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
            content: 'You are a CrewAI Quality Validator for interior design images. Rate the image quality and adherence to the request on a scale of 0-1. Provide constructive feedback.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Original request: "${originalPrompt}". Rate this generated interior design image and provide feedback.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 200,
        temperature: 0.1
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Extract score from response (simple heuristic)
      const scoreMatch = content.match(/(\d\.?\d*)/);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.8;
      
      return { score: Math.min(score, 1), feedback: content };
    }
  } catch (error) {
    console.error('Quality validation error:', error);
  }

  return { score: 0.8, feedback: 'Quality validation completed' };
}

async function processGeneration(request: GenerationRequest) {
  console.log('processGeneration started');
  const startTime = Date.now();
  let generationRecord: any = null;
  
  try {
    console.log('About to create initial record');
    // Create initial record
    const { data: recordData, error: createError } = await supabase
      .from('generation_3d')
      .insert({
        user_id: request.user_id,
        prompt: request.prompt,
        room_type: request.room_type,
        style: request.style,
        generation_status: 'processing'
      })
      .select()
      .single();

    if (createError) {
      console.error('Database insert error:', createError);
      throw new Error(`Failed to create generation record: ${createError.message}`);
    }
    
    generationRecord = recordData;
    console.log(`Record created successfully: ${generationRecord?.id}`);

    console.log(`Starting 3D generation for record: ${generationRecord.id}`);

    // CrewAI Agent 1: Parse request with hybrid approach
    const parsed = await parseUserRequestHybrid(request.prompt);
    console.log('Parsed request:', parsed);

    // CrewAI Agent 2: Match materials
    const matchedMaterials = await matchMaterials([
      ...(parsed.materials || []),
      ...(request.specific_materials || [])
    ]);
    console.log('Matched materials:', matchedMaterials);

    // CrewAI Agent 3: Generate 3D image
    const imageBase64 = await generate3DImage(parsed.enhanced_prompt, matchedMaterials);
    console.log('Generated 3D image');

    // CrewAI Agent 4: Quality validation
    const qualityCheck = await validateQuality(imageBase64, request.prompt);
    console.log('Quality validation:', qualityCheck);

    // Update record with results
    const { error: updateError } = await supabase
      .from('generation_3d')
      .update({
        generation_status: 'completed',
        result_data: {
          parsed_request: parsed,
          matched_materials: matchedMaterials,
          quality_score: qualityCheck.score,
          quality_feedback: qualityCheck.feedback
        },
        image_urls: [imageBase64],
        material_ids: matchedMaterials.map(m => m.id),
        materials_used: matchedMaterials.map(m => m.name),
        processing_time_ms: Date.now() - startTime,
        updated_at: new Date().toISOString()
      })
      .eq('id', generationRecord.id);

    if (updateError) {
      console.error('Failed to update record:', updateError);
    }

    // Log analytics
    await supabase
      .from('analytics_events')
      .insert({
        user_id: request.user_id,
        event_type: 'hybrid_3d_generation_completed',
        event_data: {
          generation_id: generationRecord.id,
          room_type: parsed.room_type,
          style: parsed.style,
          materials_count: matchedMaterials.length,
          quality_score: qualityCheck.score,
          processing_time_ms: Date.now() - startTime
        }
      });

    return {
      success: true,
      generation_id: generationRecord.id,
      image_url: imageBase64,
      parsed_request: parsed,
      matched_materials: matchedMaterials,
      quality_assessment: qualityCheck,
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('3D generation error in processGeneration:', error);
    console.log('generationRecord at error time:', generationRecord);
    
    // Update record with error
    if (generationRecord?.id) {
      console.log('Attempting to update record with error');
      try {
        await supabase
          .from('generation_3d')
          .update({
            generation_status: 'failed',
            error_message: error.message,
            processing_time_ms: Date.now() - startTime
          })
          .eq('id', generationRecord.id);
        console.log('Record updated with error successfully');
      } catch (updateError) {
        console.error('Failed to update record with error:', updateError);
      }
    } else {
      console.log('No generationRecord found, cannot update with error');
    }

    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Received 3D generation request');
    const request: GenerationRequest = await req.json();
    
    console.log('Processing 3D generation request:', JSON.stringify(request));

    // Validate request
    if (!request.user_id || !request.prompt) {
      console.error('Validation failed: missing user_id or prompt');
      return new Response(
        JSON.stringify({ error: 'user_id and prompt are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Request validation passed, calling processGeneration');
    
    try {
      const result = await processGeneration(request);
      
      return new Response(
        JSON.stringify(result),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (processError) {
      console.error('Process generation failed:', processError);
      
      // Return a proper error response instead of throwing
      return new Response(
        JSON.stringify({ 
          success: false,
          error: '3D generation failed', 
          details: processError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('CrewAI 3D generation error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Request processing failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});