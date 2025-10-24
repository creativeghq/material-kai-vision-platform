import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import standardized Edge Function response types
import {
  type MaterialRecognitionResult,
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types.ts';

// Import MIVAA utilities for centralized AI management
import { generateSemanticAnalysis } from '../_shared/embedding-utils.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// MIVAA Gateway Configuration
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY');

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
  use_mivaa_vision?: boolean; // New: Enable MIVAA Vision instead of OpenAI
  enable_visual_analysis?: boolean; // New: Enable full visual feature extraction
}

// MIVAA Analysis Function
async function analyzeWithMIVAA(
  imageUrl: string,
  analysisType: string,
  confidenceThreshold: number,
): Promise<{ materials: RecognizedMaterial[]; visualAnalysis?: VisualAnalysisData; method: string }> {
  if (!MIVAA_API_KEY) {
    throw new Error('MIVAA API key not configured');
  }

  try {
    // Use MIVAA gateway for comprehensive material analysis
    const response = await fetch(`${MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Material-Kai-Vision-Platform-Supabase/1.0',
      },
      body: JSON.stringify({
        action: 'advanced_visual_analysis',
        payload: {
          image_data: imageUrl,
          analysis_type: 'material_recognition',
          prompt: `You are an expert materials scientist and visual analyst specializing in architectural, interior design, and construction materials. Analyze the image to identify materials with comprehensive visual analysis.

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

Analysis precision: ${analysisType}. Minimum confidence threshold: ${confidenceThreshold}. Focus on accurate material identification with comprehensive visual analysis.`,
          options: {
            temperature: 0.1,
            max_tokens: 2000,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`MIVAA gateway error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`MIVAA material analysis error: ${result.error?.message || 'Unknown error'}`);
    }

    // Parse the structured analysis response
    let parsedAnalysis: any;
    try {
      if (typeof result.data.analysis === 'string') {
        parsedAnalysis = JSON.parse(result.data.analysis);
      } else {
        parsedAnalysis = result.data.analysis;
      }

      // Convert to our format
      const materials: RecognizedMaterial[] = parsedAnalysis.materials || [];
      const visualAnalysis: VisualAnalysisData = {
        visual_features: parsedAnalysis.visual_features,
        material_segmentation: parsedAnalysis.material_segmentation,
        material_categorization: parsedAnalysis.material_categorization,
      };

      return {
        materials: materials.filter(m => m.confidence >= confidenceThreshold),
        visualAnalysis,
        method: 'mivaa_vision',
      };
    } catch (parseError) {
      console.error('Failed to parse MIVAA material analysis response:', parseError);
      throw new Error('Invalid response format from MIVAA material analysis');
    }
  } catch (error) {
    console.error('MIVAA material analysis failed:', error);
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

    // Enhanced input validation
    if (!body.image_url && !body.image_data) {
      const errorResponse = createErrorResponse(
        'MISSING_IMAGE_INPUT',
        'Either image_url or image_data is required for material recognition',
        {
          provided_fields: Object.keys(body),
          required_fields: ['image_url', 'image_data'],
        },
      );
      return createJSONResponse(errorResponse, 400);
    }

    // Validate image URL format if provided
    if (body.image_url) {
      try {
        const url = new URL(body.image_url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          const errorResponse = createErrorResponse(
            'INVALID_IMAGE_URL',
            'Image URL must use HTTP or HTTPS protocol',
            { provided_url: body.image_url },
          );
          return createJSONResponse(errorResponse, 400);
        }
      } catch (urlError) {
        const errorResponse = createErrorResponse(
          'MALFORMED_IMAGE_URL',
          'Invalid image URL format',
          { provided_url: body.image_url, error: String(urlError) },
        );
        return createJSONResponse(errorResponse, 400);
      }
    }

    // Validate analysis parameters
    if (body.confidence_threshold && (body.confidence_threshold < 0 || body.confidence_threshold > 1)) {
      const errorResponse = createErrorResponse(
        'INVALID_CONFIDENCE_THRESHOLD',
        'Confidence threshold must be between 0 and 1',
        { provided_threshold: body.confidence_threshold },
      );
      return createJSONResponse(errorResponse, 400);
    }

    if (body.analysis_type && !['basic', 'detailed', 'comprehensive'].includes(body.analysis_type)) {
      const errorResponse = createErrorResponse(
        'INVALID_ANALYSIS_TYPE',
        'Analysis type must be one of: basic, detailed, comprehensive',
        { provided_type: body.analysis_type },
      );
      return createJSONResponse(errorResponse, 400);
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
    let processingMethod = 'unknown';

    try {
      // Primary: Use MIVAA Vision if enabled and configured
      if (body.use_mivaa_vision !== false && MIVAA_API_KEY && body.image_url) {
        try {
          console.log('Starting MIVAA Vision analysis...');
          console.log(`MIVAA Gateway URL: ${MIVAA_GATEWAY_URL}`);
          console.log(`MIVAA API Key present: ${!!MIVAA_API_KEY}`);

          const mivaaResult = await analyzeWithMIVAA(
            body.image_url,
            analysisType,
            confidenceThreshold,
          );

          recognizedMaterials = mivaaResult.materials;
          visualAnalysis = mivaaResult.visualAnalysis;
          processingMethod = mivaaResult.method;

          console.log(`MIVAA Vision analysis completed. Found ${recognizedMaterials.length} materials with method: ${processingMethod}`);

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
                created_at: new Date().toISOString(),
              });

            if (visualAnalysisError) {
              console.error('Failed to store visual analysis:', visualAnalysisError);
            }
          }

        } catch (mivaaError) {
          console.error('MIVAA Vision analysis failed, using enhanced MIVAA error handling:', mivaaError);
          processingMethod = 'mivaa_failed';
          // Continue to catalog fallback (MIVAA-first architecture, no OpenAI dependency)
        }
      } else {
        console.log('MIVAA API key not available or vision disabled, skipping MIVAA analysis');
        processingMethod = 'mivaa_skipped';
      }

      // Final fallback: Query materials catalog for similar materials ONLY if MIVAA failed
      if (recognizedMaterials.length === 0) {
        console.log('All AI methods failed, falling back to catalog...');
        const { data: catalogMaterials, error: catalogError } = await supabase
          .from('materials_catalog')
          .select('*')
          .limit(5);

        if (!catalogError && catalogMaterials && catalogMaterials.length > 0) {
          console.log(`Found ${catalogMaterials.length} catalog materials as fallback`);
          processingMethod = processingMethod === 'unknown' ? 'catalog_fallback' : processingMethod + '_catalog_fallback';

          recognizedMaterials = catalogMaterials.map((material: MaterialsCatalogItem): RecognizedMaterial => ({
            name: material.name || 'Unknown Material',
            confidence: 0.3, // Much lower confidence for catalog fallback to indicate it's not AI-based
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
        } else {
          console.log('No catalog materials found or catalog query failed');
          processingMethod = processingMethod === 'unknown' ? 'no_results' : processingMethod + '_no_results';
        }
      }

      // Filter materials based on confidence threshold
      const filteredMaterials = recognizedMaterials.filter(
        (material: RecognizedMaterial) => material.confidence >= confidenceThreshold,
      );

      // Update request status
      if (recognitionRecord) {
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

    // Store recognition results in recognition_results table
    try {
      if (filteredMaterials.length > 0) {
        const { error: storageError } = await supabase
          .from('recognition_results')
          .insert({
            user_id: body.user_id,
            input_data: {
              image_url: body.image_url,
              analysis_type: analysisType,
              confidence_threshold: confidenceThreshold,
            },
            result_data: {
              materials: filteredMaterials.map((material: any) => ({
                name: material.name,
                confidence: material.confidence,
                properties: material.properties,
                bounding_box: material.bounding_box,
              })),
              processing_method: processingMethod,
              analysis_metadata: {
                analysis_type: analysisType,
                total_materials_found: filteredMaterials.length,
              },
            },
            confidence_score: filteredMaterials.length > 0
              ? filteredMaterials.reduce((sum: number, m: any) => sum + m.confidence, 0) / filteredMaterials.length
              : 0,
            processing_time_ms: processingTime,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (storageError) {
          console.error('Failed to store recognition results:', storageError);
        } else {
          console.log('✅ Recognition results stored successfully');
        }
      }
    } catch (storageError) {
      console.error('Error storing recognition results:', storageError);
    }

    // Create standardized success response matching frontend expectations
    const responseData = {
      materials: filteredMaterials.map((material: any, index: number) => ({
        // Frontend expects these exact field names (camelCase)
        id: `mat_${Date.now()}_${index}`,
        fileName: body.image_url ? 'uploaded_image.jpg' : 'unknown',
        confidence: material.confidence,                    // ✅ Fixed: matches frontend expectation
        materialType: material.name,                        // ✅ Fixed: was 'name', now 'materialType'
        properties: {
          category: material.properties.category,
          subcategory: material.properties.subcategory || undefined,
          color: material.properties.color || undefined,
          texture: material.properties.texture || undefined,
          finish: material.properties.finish || undefined,
          durability: material.properties.durability || undefined,
        },
        composition: material.properties.composition || {},  // ✅ Added: frontend expects this
        sustainability: {                                   // ✅ Added: frontend expects this
          rating: material.properties.sustainability || 'unknown',
          certifications: [],
          environmental_impact: 'unknown',
        },
        processingTime: processingTime,                     // ✅ Fixed: matches frontend expectation
        boundingBox: material.bounding_box,
      })),
      analysisMetadata: {
        analysisType: analysisType,
        processingMethod: processingMethod as any,
        totalProcessingTime: processingTime,                // ✅ Added: for metadata
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
      },
    );

    return createJSONResponse(response, 500);
  }
});
