import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import standardized Edge Function response types
import {
  type EdgeFunctionResponse,
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
  focusAreas: string[],
): Promise<VisualSearchAnalysisResult> {
  if (!MIVAA_API_KEY) {
    throw new Error('MIVAA API key not configured');
  }

  const analysisId = `VSA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Use MIVAA gateway for advanced visual analysis
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
          analysis_type: 'visual_search',
          focus_areas: focusAreas,
          analysis_depth: analysisDepth,
          response_format: 'structured_json',
          prompt: `You are an advanced visual analysis AI specializing in material recognition and visual search. Perform comprehensive image analysis for visual search applications.

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

Analyze the image comprehensively for visual search matching capabilities.`,
          options: {
            temperature: 0.1,
            max_tokens: 3000,
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
      throw new Error(`MIVAA visual analysis error: ${result.error?.message || 'Unknown error'}`);
    }

    // Parse the structured analysis response
    let parsedAnalysis: VisualSearchAnalysisResult;
    try {
      if (typeof result.data.analysis === 'string') {
        parsedAnalysis = JSON.parse(result.data.analysis);
      } else {
        parsedAnalysis = result.data.analysis;
      }

      // Ensure analysis_id is set
      parsedAnalysis.analysis_id = analysisId;

      return parsedAnalysis as VisualSearchAnalysisResult;
    } catch (parseError) {
      console.error('Failed to parse MIVAA visual analysis response:', parseError);
      throw new Error('Invalid response format from MIVAA visual analysis');
    }
  } catch (error) {
    console.error('MIVAA visual analysis failed:', error);
    throw error;
  }
}

async function storeAnalysisResult(
  analysisResult: VisualSearchAnalysisResult,
  request: VisualSearchAnalysisRequest,
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
      { allowed_methods: ['POST'] },
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
        { required_fields: ['image_url', 'image_data'] },
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
        { valid_values: validDepths, provided: analysisDepth },
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
        { valid_areas: validFocusAreas, invalid_areas: invalidAreas },
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
            upsert: false,
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
          { error: uploadError instanceof Error ? uploadError.message : 'Unknown upload error' },
        );
        return createJSONResponse(response, 500);
      }
    }

    if (!imageUrl) {
      const response = createErrorResponse(
        'NO_IMAGE_URL',
        'Could not obtain a valid image URL for analysis',
        {},
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
              confidence: analysisResult.confidence_scores.overall,
            },
            created_at: new Date().toISOString(),
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
        embedding_stored: combinedVector && combinedVector.length > 0,
      },
      processing_metadata: {
        processing_time_ms: processingTime,
        analysis_depth: analysisDepth,
        focus_areas: focusAreas,
        image_url: imageUrl,
      },
    };

    const response = createSuccessResponse(responseData, {
      processingTime,
      version: '1.0.0',
    });

    return createJSONResponse(response);

  } catch (error) {
    console.error('Visual search analysis error:', error);

    const response = createErrorResponse(
      'VISUAL_SEARCH_ANALYSIS_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred during visual analysis',
      {
        timestamp: new Date().toISOString(),
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
      },
    );

    return createJSONResponse(response, 500);
  }
});
