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

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

interface StyleAnalysisRequest {
  material_id?: string;
  image_url: string;
  analysis_type: 'full' | 'color_only' | 'style_only' | 'room_suitability';
  target_rooms?: string[];
  style_preferences?: string[];
}

interface AIStyleAnalysis {
  primaryStyle: string;
  styleConfidence: number;
  colorPalette: {
    dominantColors: string[];
    colorHarmony: string;
    warmthScore: number;
    colorDescription: string;
  };
  roomSuitability: {
    [roomType: string]: {
      score: number;
      reasoning: string;
      recommendations: string[];
    };
  };
  aestheticProperties: {
    texture: string;
    finish: string;
    pattern: string;
    modernityScore: number;
    luxuryLevel: string;
  };
  trendScore: number;
  designTags: string[];
  marketingDescription: string;
  designerNotes: string;
}

async function analyzeStyleWithAI(imageUrl: string, request: StyleAnalysisRequest): Promise<AIStyleAnalysis> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    console.log(`Analyzing style for image: ${imageUrl}`);

    const stylePrompt = `
Analyze this material/surface image for comprehensive style characteristics. Return a detailed JSON object with:

{
  "primaryStyle": "specific design style (minimalist, traditional, contemporary, industrial, rustic, transitional, scandinavian, bohemian, mid-century, art-deco, etc.)",
  "styleConfidence": 0.0-1.0,
  "colorPalette": {
    "dominantColors": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
    "colorHarmony": "monochromatic|analogous|complementary|triadic|split-complementary|tetradic",
    "warmthScore": -1.0 to 1.0 (-1=very cool, 0=neutral, 1=very warm),
    "colorDescription": "descriptive color analysis"
  },
  "roomSuitability": {
    "living_room": {"score": 0.0-1.0, "reasoning": "why suitable/unsuitable", "recommendations": ["tip1", "tip2"]},
    "bedroom": {"score": 0.0-1.0, "reasoning": "analysis", "recommendations": ["tip1", "tip2"]},
    "kitchen": {"score": 0.0-1.0, "reasoning": "analysis", "recommendations": ["tip1", "tip2"]},
    "bathroom": {"score": 0.0-1.0, "reasoning": "analysis", "recommendations": ["tip1", "tip2"]},
    "office": {"score": 0.0-1.0, "reasoning": "analysis", "recommendations": ["tip1", "tip2"]},
    "dining_room": {"score": 0.0-1.0, "reasoning": "analysis", "recommendations": ["tip1", "tip2"]}
  },
  "aestheticProperties": {
    "texture": "smooth|rough|textured|glossy|matte|brushed|polished|natural",
    "finish": "matte|satin|semi-gloss|gloss|metallic|natural|distressed|aged",
    "pattern": "solid|striped|geometric|floral|abstract|textured|marbled|veined",
    "modernityScore": 0.0-1.0 (0=traditional, 1=ultra-modern),
    "luxuryLevel": "budget|mid-range|premium|luxury|ultra-luxury"
  },
  "trendScore": 0.0-1.0 (based on 2024-2025 design trends),
  "designTags": ["descriptive", "tags", "for", "style", "characteristics"],
  "marketingDescription": "2-3 sentence appealing description for potential buyers",
  "designerNotes": "professional interior designer perspective and application advice"
}

Focus on:
- Accurate color analysis with proper hex codes
- Practical room suitability with specific reasoning
- Current design trend awareness
- Professional design vocabulary
- Actionable recommendations
`;

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
              { type: 'text', text: stylePrompt },
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'high' }
              }
            ]
          }
        ],
        max_tokens: 1500,
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize the response
    return {
      primaryStyle: analysis.primaryStyle || 'contemporary',
      styleConfidence: Math.min(Math.max(analysis.styleConfidence || 0.7, 0), 1),
      colorPalette: {
        dominantColors: analysis.colorPalette?.dominantColors || ['#808080'],
        colorHarmony: analysis.colorPalette?.colorHarmony || 'monochromatic',
        warmthScore: Math.min(Math.max(analysis.colorPalette?.warmthScore || 0, -1), 1),
        colorDescription: analysis.colorPalette?.colorDescription || 'Neutral tones'
      },
      roomSuitability: analysis.roomSuitability || {},
      aestheticProperties: {
        texture: analysis.aestheticProperties?.texture || 'smooth',
        finish: analysis.aestheticProperties?.finish || 'matte',
        pattern: analysis.aestheticProperties?.pattern || 'solid',
        modernityScore: Math.min(Math.max(analysis.aestheticProperties?.modernityScore || 0.5, 0), 1),
        luxuryLevel: analysis.aestheticProperties?.luxuryLevel || 'mid-range'
      },
      trendScore: Math.min(Math.max(analysis.trendScore || 0.5, 0), 1),
      designTags: analysis.designTags || [],
      marketingDescription: analysis.marketingDescription || 'Versatile material suitable for various design applications.',
      designerNotes: analysis.designerNotes || 'Consider application context and lighting when specifying this material.'
    };

  } catch (error) {
    console.error('AI style analysis error:', error);
    throw new Error(`Style analysis failed: ${error.message}`);
  }
}

async function storeStyleAnalysis(materialId: string, analysis: AIStyleAnalysis): Promise<void> {
  try {
    const { error } = await supabase
      .from('material_style_analysis')
      .upsert({
        material_id: materialId,
        style_tags: analysis.designTags,
        style_confidence: {
          primary_style: analysis.primaryStyle,
          confidence: analysis.styleConfidence,
          modernity_score: analysis.aestheticProperties.modernityScore,
          luxury_level: analysis.aestheticProperties.luxuryLevel
        },
        color_palette: {
          dominant_colors: analysis.colorPalette.dominantColors,
          color_harmony: analysis.colorPalette.colorHarmony,
          warmth_score: analysis.colorPalette.warmthScore,
          description: analysis.colorPalette.colorDescription
        },
        texture_analysis: {
          texture: analysis.aestheticProperties.texture,
          finish: analysis.aestheticProperties.finish,
          pattern: analysis.aestheticProperties.pattern
        },
        room_suitability: analysis.roomSuitability,
        trend_score: analysis.trendScore,
        ml_model_version: 'gpt-4-vision-style-v1.0',
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error storing style analysis:', error);
      throw error;
    }

    console.log('Style analysis stored successfully for material:', materialId);
  } catch (error) {
    console.error('Failed to store style analysis:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: StyleAnalysisRequest = await req.json();
    
    console.log('Processing style analysis request:', {
      material_id: request.material_id,
      analysis_type: request.analysis_type,
      has_image_url: !!request.image_url
    });

    // Validate request
    if (!request.image_url) {
      return new Response(
        JSON.stringify({ error: 'image_url is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const startTime = Date.now();

    // Perform AI style analysis
    const styleAnalysis = await analyzeStyleWithAI(request.image_url, request);
    
    // Store analysis if material_id provided
    if (request.material_id) {
      await storeStyleAnalysis(request.material_id, styleAnalysis);
    }

    const processingTime = Date.now() - startTime;

    // Log analytics
    await supabase
      .from('analytics_events')
      .insert({
        event_type: 'style_analysis_completed',
        event_data: {
          material_id: request.material_id,
          analysis_type: request.analysis_type,
          primary_style: styleAnalysis.primaryStyle,
          confidence: styleAnalysis.styleConfidence,
          processing_time_ms: processingTime,
          ai_powered: true
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        analysis: styleAnalysis,
        processing_time_ms: processingTime,
        analysis_type: request.analysis_type
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Style analysis error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Style analysis failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});