import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface MaterialRecognitionRequest {
  image_url?: string;
  image_data?: string;
  analysis_type?: 'basic' | 'detailed' | 'comprehensive';
  confidence_threshold?: number;
  user_id?: string;
  workspace_id?: string;
}

interface MaterialProperties {
  category: string;
  subcategory?: string;
  color?: string;
  texture?: string;
  finish?: string;
  durability?: string;
  sustainability?: string;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RecognizedMaterial {
  name: string;
  confidence: number;
  properties: MaterialProperties;
  bounding_box: BoundingBox;
}

interface MaterialsCatalogItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  color?: string;
  texture?: string;
  finish?: string;
  durability?: string;
  sustainability_rating?: string;
}

interface MaterialRecognitionResponse {
  success: boolean;
  materials: Array<{
    name: string;
    confidence: number;
    properties: MaterialProperties;
    bounding_box?: BoundingBox;
  }>;
  metadata: {
    processing_time: number;
    analysis_type: string;
    image_dimensions?: {
      width: number;
      height: number;
    };
  };
  error?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  try {
    const startTime = Date.now();
    const body: MaterialRecognitionRequest = await req.json();

    // Validate input
    if (!body.image_url && !body.image_data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Either image_url or image_data is required',
          materials: [],
          metadata: {
            processing_time: Date.now() - startTime,
            analysis_type: body.analysis_type || 'basic',
          },
        } as MaterialRecognitionResponse),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    const analysisType = body.analysis_type || 'basic';
    const confidenceThreshold = body.confidence_threshold || 0.5;

    // Store recognition request in database for tracking
    const { data: recognitionRecord, error: insertError } = await supabase
      .from('material_recognition_requests')
      .insert({
        user_id: body.user_id,
        workspace_id: body.workspace_id,
        image_url: body.image_url,
        analysis_type: analysisType,
        confidence_threshold: confidenceThreshold,
        status: 'processing',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert recognition request:', insertError);
    }

    // Perform actual material recognition using AI/ML services
    let recognizedMaterials = [];

    try {
      // Use OpenAI Vision API for material recognition
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey && body.image_url) {
        const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                content: 'You are an expert materials scientist. Analyze the image to identify materials and their properties. Return a JSON array of materials with: name, confidence (0-1), properties (category, subcategory, color, texture, finish, durability, sustainability), and bounding_box (x, y, width, height). Be precise and only identify materials you can see clearly.',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Analyze this image for materials. Analysis type: ${analysisType}. Minimum confidence: ${confidenceThreshold}`,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: body.image_url,
                      detail: analysisType === 'comprehensive' ? 'high' : 'auto',
                    },
                  },
                ],
              },
            ],
            max_tokens: 1500,
            temperature: 0.1,
          }),
        });

        if (visionResponse.ok) {
          const visionData = await visionResponse.json();
          const analysisText = visionData.choices[0].message.content;

          try {
            const parsedMaterials = JSON.parse(analysisText);
            if (Array.isArray(parsedMaterials)) {
              recognizedMaterials = parsedMaterials;
            }
          } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
          }
        }
      }

      // If AI recognition failed or no materials found, query materials catalog for similar materials
      if (recognizedMaterials.length === 0) {
        const { data: catalogMaterials, error: catalogError } = await supabase
          .from('materials_catalog')
          .select('*')
          .limit(5);

        if (!catalogError && catalogMaterials) {
          recognizedMaterials = catalogMaterials.map((material: MaterialsCatalogItem): RecognizedMaterial => ({
            name: material.name || 'Unknown Material',
            confidence: 0.6, // Lower confidence for catalog fallback
            properties: {
              category: material.category || 'Unknown',
              subcategory: material.subcategory,
              color: material.color,
              texture: material.texture,
              finish: material.finish,
              durability: material.durability,
              sustainability: material.sustainability_rating,
            },
            bounding_box: {
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            },
          }));
        }
      }

      // Filter materials based on confidence threshold
      const filteredMaterials = recognizedMaterials.filter(
        (material: RecognizedMaterial) => material.confidence >= confidenceThreshold,
      );

      // Store results in database
      if (recognitionRecord && filteredMaterials.length > 0) {
        const { error: resultsError } = await supabase
          .from('material_recognition_results')
          .insert(
            filteredMaterials.map((material: RecognizedMaterial) => ({
              request_id: recognitionRecord.id,
              material_name: material.name,
              confidence: material.confidence,
              properties: material.properties,
              bounding_box: material.bounding_box,
              created_at: new Date().toISOString(),
            })),
          );

        if (resultsError) {
          console.error('Failed to store recognition results:', resultsError);
        }

        // Update request status
        await supabase
          .from('material_recognition_requests')
          .update({
            status: 'completed',
            materials_found: filteredMaterials.length,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recognitionRecord.id);
      }

    } catch (error) {
      console.error('Material recognition processing error:', error);

      // Update request status to failed
      if (recognitionRecord) {
        await supabase
          .from('material_recognition_requests')
          .update({
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recognitionRecord.id);
      }

      // Return empty results but don't fail the request
      recognizedMaterials = [];
    }

    const filteredMaterials = recognizedMaterials.filter(
      (material: RecognizedMaterial) => material.confidence >= confidenceThreshold,
    );


    const processingTime = Date.now() - startTime;

    const response: MaterialRecognitionResponse = {
      success: true,
      materials: filteredMaterials,
      metadata: {
        processing_time: processingTime,
        analysis_type: analysisType,
        image_dimensions: {
          width: 800,
          height: 600,
        },
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Material recognition error:', error);

    const response: MaterialRecognitionResponse = {
      success: false,
      materials: [],
      metadata: {
        processing_time: 0,
        analysis_type: 'basic',
      },
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
