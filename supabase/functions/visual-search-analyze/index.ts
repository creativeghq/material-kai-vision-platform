import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import standardized Edge Function response types
import {
  type EdgeFunctionResponse,
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

// Enhanced Visual Search Analysis Interfaces
interface ColorInfo {
  hex: string;
  name: string;
  percentage: number;
  saturation: number;
  brightness: number;
}

interface TextureMetrics {
  roughness: number;
  uniformity: number;
  directionality: string;
  scale: string;
  pattern_frequency: number;
}

interface MaterialClassification {
  material_type: string;
  confidence: number;
  sub_category: string;
  physical_properties: {
    hardness: string;
    reflectivity: number;
    porosity: string;
    thermal_conductivity: string;
  };
  surface_properties: {
    finish: string;
    wear_level: string;
    defects: string[];
  };
}

interface VisualSearchAnalysisResult {
  analysis_id: string;
  image_metadata: {
    dimensions: { width: number; height: number };
    format: string;
    size_bytes?: number;
  };
  color_analysis: {
    dominant_palette: ColorInfo[];
    color_harmony: string;
    color_temperature: 'warm' | 'cool' | 'neutral';
    color_distribution: Record<string, number>;
  };
  texture_analysis: {
    primary_texture: TextureMetrics;
    texture_regions: Array<{
      region_id: string;
      bounding_box: { x: number; y: number; width: number; height: number };
      texture_metrics: TextureMetrics;
    }>;
  };
  material_classification: MaterialClassification[];
  spatial_features: {
    edges: Array<{ start: [number, number]; end: [number, number]; strength: number }>;
    corners: Array<{ position: [number, number]; strength: number }>;
    regions: Array<{ 
      id: string; 
      area: number; 
      centroid: [number, number];
      material_consistency: number;
    }>;
  };
  similarity_vectors: {
    color_vector: number[];
    texture_vector: number[];
    shape_vector: number[];
    combined_vector: number[];
  };
  confidence_scores: {
    overall: number;
    color_accuracy: number;
    texture_accuracy: number;
    material_accuracy: number;
  };
}

interface VisualSearchAnalysisRequest {
  image_url?: string;
  image_data?: string; // Base64 encoded
  analysis_depth: 'quick' | 'standard' | 'comprehensive';
  focus_areas?: Array<'color' | 'texture' | 'material' | 'spatial'>;
  similarity_threshold?: number;
  user_id?: string;
  workspace_id?: string;
}

async function performVisualAnalysis(
  imageUrl: string,
  analysisDepth: string,
  focusAreas: string[]
): Promise<VisualSearchAnalysisResult> {
  if (!TOGETHER_AI_API_KEY) {
    throw new Error('LLaMA Vision API key not configured');
  }

  const analysisId = `VSA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
            content: `You are an advanced visual analysis AI specializing in material recognition and visual search. Perform comprehensive image analysis for visual search applications.

Focus Areas: ${focusAreas.join(', ')}
Analysis Depth: ${analysisDepth}

REQUIRED OUTPUT FORMAT - Return ONLY valid JSON:
{
  "analysis_id": "${analysisId}",
  "image_metadata": {
    "dimensions": {"width": 0, "height": 0},
    "format": "detected format",
    "estimated_size": "size assessment"
  },
  "color_analysis": {
    "dominant_palette": [
      {
        "hex": "#hex_code",
        "name": "color_name",
        "percentage": 0.0-100.0,
        "saturation": 0.0-100.0,
        "brightness": 0.0-100.0
      }
    ],
    "color_harmony": "monochromatic/analogous/complementary/triadic/etc",
    "color_temperature": "warm/cool/neutral",
    "color_distribution": {"region_description": percentage}
  },
  "texture_analysis": {
    "primary_texture": {
      "roughness": 0.0-10.0,
      "uniformity": 0.0-10.0,
      "directionality": "random/horizontal/vertical/diagonal/radial",
      "scale": "fine/medium/coarse",
      "pattern_frequency": 0.0-10.0
    },
    "texture_regions": [
      {
        "region_id": "region_1",
        "bounding_box": {"x": 0, "y": 0, "width": 100, "height": 100},
        "texture_metrics": {
          "roughness": 0.0-10.0,
          "uniformity": 0.0-10.0,
          "directionality": "direction",
          "scale": "scale",
          "pattern_frequency": 0.0-10.0
        }
      }
    ]
  },
  "material_classification": [
    {
      "material_type": "specific material name",
      "confidence": 0.0-1.0,
      "sub_category": "material subcategory",
      "physical_properties": {
        "hardness": "soft/medium/hard",
        "reflectivity": 0.0-1.0,
        "porosity": "non-porous/low/medium/high",
        "thermal_conductivity": "low/medium/high"
      },
      "surface_properties": {
        "finish": "matte/satin/glossy/textured",
        "wear_level": "new/lightly_worn/moderately_worn/heavily_worn",
        "defects": ["list of visible defects"]
      }
    }
  ],
  "spatial_features": {
    "edges": [{"start": [x1, y1], "end": [x2, y2], "strength": 0.0-1.0}],
    "corners": [{"position": [x, y], "strength": 0.0-1.0}],
    "regions": [
      {
        "id": "region_id",
        "area": 0.0-100.0,
        "centroid": [x, y],
        "material_consistency": 0.0-1.0
      }
    ]
  },
  "similarity_vectors": {
    "color_vector": [0.1, 0.2, 0.3],
    "texture_vector": [0.1, 0.2, 0.3],
    "shape_vector": [0.1, 0.2, 0.3],
    "combined_vector": [0.1, 0.2, 0.3]
  },
  "confidence_scores": {
    "overall": 0.0-1.0,
    "color_accuracy": 0.0-1.0,
    "texture_accuracy": 0.0-1.0,
    "material_accuracy": 0.0-1.0
  }
}

Analyze the image comprehensively for visual search matching capabilities.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Perform comprehensive visual analysis for search matching. Focus on: ${focusAreas.join(', ')}. Analysis depth: ${analysisDepth}.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: analysisDepth === 'comprehensive' ? 'high' : 'auto'
                }
              }
            ]
          }
        ],
        max_tokens: 3000,
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
      return parsedAnalysis as VisualSearchAnalysisResult;
    } catch (parseError) {
      console.error('Failed to parse LLaMA Vision response:', parseError);
      throw new Error('Invalid response format from LLaMA Vision');
    }
  } catch (error) {
    console.error('LLaMA Vision analysis failed:', error);
    throw error;
  }
}

async function storeAnalysisResult(
  analysisResult: VisualSearchAnalysisResult,
  request: VisualSearchAnalysisRequest
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('visual_search_analysis')
      .insert({
        analysis_id: analysisResult.analysis_id,
        user_id: request.user_id,
        workspace_id: request.workspace_id,
        image_url: request.image_url,
        analysis_depth: request.analysis_depth,
        focus_areas: request.focus_areas,
        
        // Store analysis results as JSONB
        color_analysis: analysisResult.color_analysis,
        texture_analysis: analysisResult.texture_analysis,
        material_classification: analysisResult.material_classification,
        spatial_features: analysisResult.spatial_features,
        similarity_vectors: analysisResult.similarity_vectors,
        confidence_scores: analysisResult.confidence_scores,
        
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to store analysis result:', error);
      throw error;
    }

    return data.id;
  } catch (error) {
    console.error('Database storage error:', error);
    throw error;
  }
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
    const response = createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Only POST method is allowed for visual search analysis',
      { allowed_methods: ['POST'] }
    );
    return createJSONResponse(response, 405);
  }

  try {
    const startTime = Date.now();
    const body: VisualSearchAnalysisRequest = await req.json();

    // Input validation
    if (!body.image_url && !body.image_data) {
      const response = createErrorResponse(
        'MISSING_IMAGE_INPUT',
        'Either image_url or image_data is required',
        { required_fields: ['image_url', 'image_data'] }
      );
      return createJSONResponse(response, 400);
    }

    // Set defaults
    const analysisDepth = body.analysis_depth || 'standard';
    const focusAreas = body.focus_areas || ['color', 'texture', 'material', 'spatial'];
    const similarityThreshold = body.similarity_threshold || 0.7;

    // Validate analysis depth
    const validDepths = ['quick', 'standard', 'comprehensive'];
    if (!validDepths.includes(analysisDepth)) {
      const response = createErrorResponse(
        'INVALID_ANALYSIS_DEPTH',
        `Analysis depth must be one of: ${validDepths.join(', ')}`,
        { valid_values: validDepths, provided: analysisDepth }
      );
      return createJSONResponse(response, 400);
    }

    // Validate focus areas
    const validFocusAreas = ['color', 'texture', 'material', 'spatial'];
    const invalidAreas = focusAreas.filter(area => !validFocusAreas.includes(area));
    if (invalidAreas.length > 0) {
      const response = createErrorResponse(
        'INVALID_FOCUS_AREAS',
        `Invalid focus areas: ${invalidAreas.join(', ')}`,
        { valid_areas: validFocusAreas, invalid_areas: invalidAreas }
      );
      return createJSONResponse(response, 400);
    }

    console.log(`Starting visual search analysis with depth: ${analysisDepth}, focus: ${focusAreas.join(', ')}`);

    // Perform visual analysis
    let imageUrl = body.image_url;
    
    // Handle base64 image data by uploading to storage
    if (!imageUrl && body.image_data) {
      try {
        const imageBuffer = Uint8Array.from(atob(body.image_data), c => c.charCodeAt(0));
        const fileName = `visual-search-${Date.now()}.jpg`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('material-images')
          .upload(`analysis/${fileName}`, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('material-images')
          .getPublicUrl(uploadData.path);
        
        imageUrl = publicUrl;
      } catch (uploadError) {
        const response = createErrorResponse(
          'IMAGE_UPLOAD_FAILED',
          'Failed to process base64 image data',
          { error: uploadError instanceof Error ? uploadError.message : 'Unknown upload error' }
        );
        return createJSONResponse(response, 500);
      }
    }

    if (!imageUrl) {
      const response = createErrorResponse(
        'NO_IMAGE_URL',
        'Could not obtain a valid image URL for analysis',
        {}
      );
      return createJSONResponse(response, 400);
    }

    // Perform the visual analysis
    const analysisResult = await performVisualAnalysis(imageUrl, analysisDepth, focusAreas);
    
    // Store the analysis result in database
    const recordId = await storeAnalysisResult(analysisResult, body);
    
    const processingTime = Date.now() - startTime;

    // Generate similarity search vectors for future matching
    const combinedVector = analysisResult.similarity_vectors.combined_vector;
    
    // Store embeddings for vector similarity search
    if (combinedVector && combinedVector.length > 0) {
      try {
        await supabase
          .from('visual_search_embeddings')
          .insert({
            analysis_id: analysisResult.analysis_id,
            image_url: imageUrl,
            embedding_vector: combinedVector,
            analysis_metadata: {
              depth: analysisDepth,
              focus_areas: focusAreas,
              confidence: analysisResult.confidence_scores.overall
            },
            created_at: new Date().toISOString()
          });
      } catch (embeddingError) {
        console.error('Failed to store embedding vector:', embeddingError);
        // Don't fail the entire request for embedding storage issues
      }
    }

    console.log(`Visual search analysis completed in ${processingTime}ms with confidence: ${analysisResult.confidence_scores.overall}`);

    // Create standardized success response
    const responseData = {
      analysis_result: analysisResult,
      storage: {
        record_id: recordId,
        embedding_stored: combinedVector && combinedVector.length > 0
      },
      processing_metadata: {
        processing_time_ms: processingTime,
        analysis_depth: analysisDepth,
        focus_areas: focusAreas,
        image_url: imageUrl
      }
    };

    const response = createSuccessResponse(responseData, {
      processingTime,
      version: '1.0.0',
      capabilities: ['color_analysis', 'texture_analysis', 'material_classification', 'spatial_features', 'similarity_vectors']
    });

    return createJSONResponse(response);

  } catch (error) {
    console.error('Visual search analysis error:', error);

    const response = createErrorResponse(
      'VISUAL_SEARCH_ANALYSIS_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred during visual analysis',
      {
        timestamp: new Date().toISOString(),
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError'
      }
    );

    return createJSONResponse(response, 500);
  }
});