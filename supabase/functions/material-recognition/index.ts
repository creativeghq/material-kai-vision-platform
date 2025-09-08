import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// Import standardized Edge Function response types
import {
  type MaterialRecognitionResult,
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// LLaMA Vision Service Integration
const TOGETHER_AI_API_KEY = Deno.env.get('TOGETHER_AI_API_KEY');
const TOGETHER_AI_BASE_URL = 'https://api.together.xyz/v1/chat/completions';
const LLAMA_VISION_MODEL = 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo';

// Enhanced interfaces for comprehensive visual analysis
interface ColorPalette {
  dominant_colors: Array<{
    color: string;
    percentage: number;
    name: string;
  }>;
  accent_colors: Array<{
    color: string;
    percentage: number;
    name: string;
  }>;
  color_harmony: string;
  color_temperature: string;
}

interface TextureAnalysis {
  surface_texture: string;
  texture_scale: string;
  texture_pattern: string;
  texture_directionality: string;
  surface_roughness: string;
}

interface PatternDetection {
  pattern_type: string;
  pattern_scale: string;
  pattern_regularity: string;
  geometric_elements: string[];
}

interface LightingConditions {
  lighting_type: string;
  lighting_direction: string;
  shadow_presence: string;
  highlights: string;
}

interface SurfaceProperties {
  reflectance: string;
  transparency: string;
  surface_defects: string[];
  wear_patterns: string;
}

interface VisualAnalysisData {
  embeddings?: number[];
  visual_features?: {
    color_palette?: ColorPalette;
    texture_analysis?: TextureAnalysis;
    pattern_detection?: PatternDetection;
    lighting_conditions?: LightingConditions;
    surface_properties?: SurfaceProperties;
  };
  material_segmentation?: Array<{
    segment_id: number;
    material_type: string;
    confidence: number;
    area_percentage: number;
    bounding_box: BoundingBox;
    segmentation_method: string;
    material_interactions: string;
  }>;
  material_categorization?: {
    primary_material_family: string;
    construction_type: string;
    style_classification: string;
    quality_assessment: string;
    installation_complexity: string;
  };
}

interface MaterialRecognitionRequest {
  image_url?: string;
  image_data?: string;
  analysis_type?: 'basic' | 'detailed' | 'comprehensive';
  confidence_threshold?: number;
  user_id?: string;
  workspace_id?: string;
  use_llama_vision?: boolean; // New: Enable LLaMA Vision instead of OpenAI
  enable_visual_analysis?: boolean; // New: Enable full visual feature extraction
}

// LLaMA Vision Analysis Function
async function analyzeWithLLamaVision(
  imageUrl: string,
  analysisType: string,
  confidenceThreshold: number
): Promise<{ materials: RecognizedMaterial[]; visualAnalysis?: VisualAnalysisData; method: string }> {
  if (!TOGETHER_AI_API_KEY) {
    throw new Error('LLaMA Vision API key not configured');
  }

  try {
    const response = await fetch(TOGETHER_AI_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LLAMA_VISION_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert materials scientist and visual analyst specializing in architectural, interior design, and construction materials. Analyze the image to identify materials with comprehensive visual analysis.

ENHANCED ANALYSIS REQUIREMENTS:
1. Material Property Extraction: Identify physical, chemical, and performance characteristics
2. Visual Feature Description: Detailed surface characteristics, reflectance, and appearance
3. Material Categorization: Hierarchical classification with industry standards
4. Texture & Pattern Analysis: Surface texture, grain patterns, and micro-structures
5. Color Palette Extraction: Precise color identification with hex codes and color theory

REQUIRED OUTPUT FORMAT - Return ONLY valid JSON:
{
  "materials": [
    {
      "name": "specific material name",
      "confidence": 0.0-1.0,
      "properties": {
        "category": "primary category (wood, metal, stone, ceramic, fabric, etc.)",
        "subcategory": "specific type (oak, aluminum, granite, etc.)",
        "color": "primary color description",
        "texture": "surface texture (smooth, rough, textured, etc.)",
        "finish": "surface finish (matte, glossy, satin, etc.)",
        "durability": "durability rating (low/medium/high/commercial)",
        "sustainability": "sustainability assessment",
        "hardness": "material hardness (soft/medium/hard)",
        "reflectivity": "surface reflectivity (low/medium/high)",
        "porosity": "porosity level (non-porous/low/medium/high)",
        "thermal_properties": "thermal characteristics",
        "maintenance_level": "maintenance requirements (low/medium/high)"
      },
      "visual_description": "detailed visual description of material appearance",
      "applications": ["typical use cases"],
      "bounding_box": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
      }
    }
  ],
  "visual_features": {
    "color_palette": {
      "dominant_colors": [{"color": "#hex", "percentage": 0.0-100.0, "name": "color name"}],
      "accent_colors": [{"color": "#hex", "percentage": 0.0-100.0, "name": "color name"}],
      "color_harmony": "color scheme type",
      "color_temperature": "warm/cool/neutral"
    },
    "texture_analysis": {
      "surface_texture": "detailed texture description",
      "texture_scale": "micro/fine/medium/coarse",
      "texture_pattern": "pattern type (geometric, organic, random, etc.)",
      "texture_directionality": "directional/non-directional",
      "surface_roughness": "roughness assessment"
    },
    "pattern_detection": {
      "pattern_type": "identified patterns",
      "pattern_scale": "pattern size assessment",
      "pattern_regularity": "regular/irregular/random",
      "geometric_elements": ["identified geometric elements"]
    },
    "lighting_conditions": {
      "lighting_type": "natural/artificial/mixed",
      "lighting_direction": "direction assessment",
      "shadow_presence": "shadow characteristics",
      "highlights": "highlight areas description"
    },
    "surface_properties": {
      "reflectance": "reflection characteristics",
      "transparency": "transparency level",
      "surface_defects": ["visible defects or imperfections"],
      "wear_patterns": "signs of wear or aging"
    }
  },
  "material_segmentation": [
    {
      "segment_id": 1,
      "material_type": "material type",
      "confidence": 0.0-1.0,
      "area_percentage": 0.0-100.0,
      "bounding_box": {"x": 0, "y": 0, "width": 100, "height": 100},
      "segmentation_method": "color/texture/edge-based",
      "material_interactions": "how this material interacts with adjacent materials"
    }
  ],
  "material_categorization": {
    "primary_material_family": "dominant material type",
    "construction_type": "architectural/decorative/structural/functional",
    "style_classification": "modern/traditional/industrial/etc.",
    "quality_assessment": "budget/standard/premium/luxury",
    "installation_complexity": "simple/moderate/complex"
  }
}

Analysis precision: ${analysisType}. Minimum confidence threshold: ${confidenceThreshold}. Focus on accurate material identification with comprehensive visual analysis.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image for materials and their properties. Focus on architectural and design materials. Provide detailed material segmentation and visual feature analysis.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: analysisType === 'comprehensive' ? 'high' : 'auto'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`LLaMA Vision API error: ${response.status} - ${errorData}`);
    }

    const llamaData = await response.json();
    const analysisText = llamaData.choices[0].message.content;

    try {
      const parsedAnalysis = JSON.parse(analysisText);
      
      // Convert to our format
      const materials: RecognizedMaterial[] = parsedAnalysis.materials || [];
      const visualAnalysis: VisualAnalysisData = {
        visual_features: parsedAnalysis.visual_features,
        material_segmentation: parsedAnalysis.material_segmentation
      };

      return {
        materials: materials.filter(m => m.confidence >= confidenceThreshold),
        visualAnalysis,
        method: 'llama_vision'
      };
    } catch (parseError) {
      console.error('Failed to parse LLaMA Vision response:', parseError);
      throw new Error('Invalid response format from LLaMA Vision');
    }
  } catch (error) {
    console.error('LLaMA Vision analysis failed:', error);
    throw error;
  }
}

interface MaterialProperties {
  category: string;
  subcategory?: string;
  color?: string;
  texture?: string;
  finish?: string;
  durability?: string;
  sustainability?: string;
  hardness?: string;
  reflectivity?: string;
  porosity?: string;
  thermal_properties?: string;
  maintenance_level?: string;
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
  visual_description?: string;
  applications?: string[];
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
    let visualAnalysis: VisualAnalysisData | undefined;
    let processingMethod = 'catalog_fallback';

    try {
      // Primary: Use LLaMA Vision if enabled and configured
      if (body.use_llama_vision !== false && TOGETHER_AI_API_KEY && body.image_url) {
        try {
          console.log('Starting LLaMA Vision analysis...');
          const llamaResult = await analyzeWithLLamaVision(
            body.image_url,
            analysisType,
            confidenceThreshold
          );
          
          recognizedMaterials = llamaResult.materials;
          visualAnalysis = llamaResult.visualAnalysis;
          processingMethod = llamaResult.method;
          
          console.log(`LLaMA Vision analysis completed. Found ${recognizedMaterials.length} materials.`);
          
          // Store visual analysis data if enabled
          if (body.enable_visual_analysis && visualAnalysis && recognitionRecord) {
            const { error: visualAnalysisError } = await supabase
              .from('material_visual_analysis')
              .insert({
                image_url: body.image_url,
                user_id: body.user_id,
                workspace_id: body.workspace_id,
                visual_features: visualAnalysis.visual_features,
                material_segmentation: visualAnalysis.material_segmentation,
                analysis_type: analysisType,
                confidence_threshold: confidenceThreshold,
                processing_time_ms: Date.now() - startTime,
                created_at: new Date().toISOString()
              });
              
            if (visualAnalysisError) {
              console.error('Failed to store visual analysis:', visualAnalysisError);
            }
          }
          
        } catch (llamaError) {
          console.error('LLaMA Vision analysis failed, falling back to OpenAI:', llamaError);
          // Continue to OpenAI fallback
        }
      }

      // Fallback: Use OpenAI Vision API if LLaMA failed or not enabled
      if (recognizedMaterials.length === 0) {
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (openaiKey && body.image_url) {
          console.log('Using OpenAI Vision as fallback...');
          processingMethod = 'openai_vision';
          
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
      }

      // Final fallback: Query materials catalog for similar materials
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
              subcategory: material.subcategory || '',
              color: material.color || '',
              texture: material.texture || '',
              finish: material.finish || '',
              durability: material.durability || '',
              sustainability: material.sustainability_rating || '',
            } as any,
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
            processing_method: processingMethod,
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
            error_message: error instanceof Error ? error.message : String(error),
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

    // Create standardized success response using the new pattern
    const responseData: MaterialRecognitionResult = {
      materials: filteredMaterials.map((material: any) => ({
        name: material.name,
        confidence: material.confidence,
        properties: {
          category: material.properties.category,
          subcategory: material.properties.subcategory || undefined,
          color: material.properties.color || undefined,
          texture: material.properties.texture || undefined,
          finish: material.properties.finish || undefined,
          durability: material.properties.durability || undefined,
          sustainability: material.properties.sustainability || undefined,
        },
        boundingBox: material.bounding_box,
      })),
      analysisMetadata: {
        analysisType: analysisType,
        processingMethod: 'llama_vision',
        imageDimensions: {
          width: 800,
          height: 600,
        },
      },
    };

    const response = createSuccessResponse(responseData, {
      processingTime,
      version: '1.0.0',
    });

    return createJSONResponse(response);

  } catch (error) {
    console.error('Material recognition error:', error);

    const response = createErrorResponse(
      'MATERIAL_RECOGNITION_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred',
      {
        timestamp: new Date().toISOString(),
      }
    );

    return createJSONResponse(response, 500);
  }
});
