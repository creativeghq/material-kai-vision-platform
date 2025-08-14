import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface MaterialRecognitionRequest {
  image_url?: string;
  image_data?: string;
  analysis_type?: 'basic' | 'detailed' | 'comprehensive';
  confidence_threshold?: number;
}

interface MaterialRecognitionResponse {
  success: boolean;
  materials: Array<{
    name: string;
    confidence: number;
    properties: {
      category: string;
      subcategory?: string;
      color?: string;
      texture?: string;
      finish?: string;
      durability?: string;
      sustainability?: string;
    };
    bounding_box?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
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
      }
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
        }
      );
    }

    const analysisType = body.analysis_type || 'basic';
    const confidenceThreshold = body.confidence_threshold || 0.5;

    // Simulate material recognition processing
    // In a real implementation, this would integrate with computer vision APIs
    // like Google Vision AI, AWS Rekognition, or custom ML models
    
    const mockMaterials = [
      {
        name: 'Oak Wood',
        confidence: 0.92,
        properties: {
          category: 'Wood',
          subcategory: 'Hardwood',
          color: 'Light Brown',
          texture: 'Grain Pattern',
          finish: 'Natural',
          durability: 'High',
          sustainability: 'Renewable',
        },
        bounding_box: {
          x: 100,
          y: 150,
          width: 200,
          height: 180,
        },
      },
      {
        name: 'Stainless Steel',
        confidence: 0.87,
        properties: {
          category: 'Metal',
          subcategory: 'Steel Alloy',
          color: 'Silver',
          texture: 'Smooth',
          finish: 'Brushed',
          durability: 'Very High',
          sustainability: 'Recyclable',
        },
        bounding_box: {
          x: 320,
          y: 80,
          width: 150,
          height: 220,
        },
      },
    ];

    // Filter materials based on confidence threshold
    const filteredMaterials = mockMaterials.filter(
      material => material.confidence >= confidenceThreshold
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
          height: 600
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