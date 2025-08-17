import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface StyleAnalysisRequest {
  content_id?: string;
  content_type: 'image' | 'text' | 'document' | 'webpage' | 'material_sample';
  content_data?: string; // Base64 encoded image or text content
  content_url?: string;
  analysis_focus?: {
    visual_style?: boolean;
    color_palette?: boolean;
    typography?: boolean;
    layout_composition?: boolean;
    material_aesthetics?: boolean;
    design_patterns?: boolean;
    brand_consistency?: boolean;
  };
  reference_styles?: string[]; // Style categories or reference IDs
  user_id?: string;
}

interface ColorAnalysis {
  dominant_colors: {
    hex: string;
    rgb: [number, number, number];
    hsl: [number, number, number];
    percentage: number;
    color_name: string;
  }[];
  color_harmony: {
    scheme_type: 'monochromatic' | 'analogous' | 'complementary' | 'triadic' | 'tetradic' | 'split-complementary';
    harmony_score: number;
    temperature: 'warm' | 'cool' | 'neutral';
    saturation_level: 'high' | 'medium' | 'low';
    brightness_level: 'bright' | 'medium' | 'dark';
  };
  accessibility: {
    contrast_ratios: { foreground: string; background: string; ratio: number; wcag_level: string }[];
    color_blind_friendly: boolean;
    accessibility_score: number;
  };
}

interface TypographyAnalysis {
  fonts_detected: {
    font_family: string;
    font_weight: string;
    font_style: string;
    font_size: string;
    usage_context: string;
  }[];
  typography_hierarchy: {
    level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption';
    font_size: number;
    font_weight: number;
    line_height: number;
    letter_spacing: number;
  }[];
  readability: {
    readability_score: number;
    font_pairing_quality: 'excellent' | 'good' | 'fair' | 'poor';
    consistency_score: number;
  };
}

interface LayoutAnalysis {
  composition: {
    layout_type: 'grid' | 'asymmetrical' | 'centered' | 'magazine' | 'minimal' | 'complex';
    balance: 'symmetrical' | 'asymmetrical' | 'radial';
    alignment: 'left' | 'center' | 'right' | 'justified' | 'mixed';
    spacing_consistency: number;
    visual_hierarchy_score: number;
  };
  design_principles: {
    contrast: number;
    repetition: number;
    alignment: number;
    proximity: number;
    white_space_usage: number;
  };
  responsive_design: {
    mobile_friendly: boolean;
    breakpoint_consistency: boolean;
    adaptive_elements: string[];
  };
}

interface MaterialAesthetics {
  surface_properties: {
    texture: 'smooth' | 'rough' | 'matte' | 'glossy' | 'metallic' | 'fabric' | 'natural';
    finish: 'polished' | 'brushed' | 'anodized' | 'painted' | 'raw' | 'coated';
    transparency: 'opaque' | 'translucent' | 'transparent';
    reflectivity: 'high' | 'medium' | 'low';
  };
  aesthetic_qualities: {
    style_category: 'modern' | 'classic' | 'industrial' | 'minimalist' | 'ornate' | 'rustic' | 'futuristic';
    sophistication_level: number;
    visual_appeal_score: number;
    uniqueness_factor: number;
  };
  contextual_fit: {
    application_suitability: string[];
    target_audience: string[];
    market_positioning: 'luxury' | 'premium' | 'mainstream' | 'budget';
  };
}

interface StyleAnalysisResult {
  content_info: {
    content_type: string;
    content_id?: string;
    analysis_timestamp: string;
    processing_method: string;
  };
  visual_analysis: {
    color_analysis: ColorAnalysis;
    typography_analysis?: TypographyAnalysis;
    layout_analysis?: LayoutAnalysis;
    material_aesthetics?: MaterialAesthetics;
  };
  style_classification: {
    primary_style: string;
    secondary_styles: string[];
    style_confidence: number;
    design_era: string;
    cultural_influences: string[];
  };
  design_patterns: {
    identified_patterns: {
      pattern_name: string;
      pattern_type: 'layout' | 'color' | 'typography' | 'interaction' | 'visual';
      confidence: number;
      description: string;
    }[];
    pattern_consistency: number;
    innovation_score: number;
  };
  brand_analysis?: {
    brand_consistency: number;
    brand_recognition_elements: string[];
    brand_personality_traits: string[];
    competitive_differentiation: number;
  };
  recommendations: {
    improvement_suggestions: string[];
    style_alternatives: string[];
    accessibility_improvements: string[];
    trend_alignment: string[];
  };
  quality_metrics: {
    overall_style_score: number;
    aesthetic_appeal: number;
    functional_design: number;
    innovation_factor: number;
    market_relevance: number;
  };
}

// Simulated style analysis functions
async function analyzeColors(contentData: any, contentType: string): Promise<ColorAnalysis> {
  // Simulate color extraction and analysis
  const dominantColors = [
    { hex: '#2C3E50', rgb: [44, 62, 80] as [number, number, number], hsl: [210, 29, 24] as [number, number, number], percentage: 35, color_name: 'Dark Blue Gray' },
    { hex: '#3498DB', rgb: [52, 152, 219] as [number, number, number], hsl: [204, 70, 53] as [number, number, number], percentage: 25, color_name: 'Bright Blue' },
    { hex: '#ECF0F1', rgb: [236, 240, 241] as [number, number, number], hsl: [192, 15, 94] as [number, number, number], percentage: 20, color_name: 'Light Gray' },
    { hex: '#E74C3C', rgb: [231, 76, 60] as [number, number, number], hsl: [6, 78, 57] as [number, number, number], percentage: 12, color_name: 'Red' },
    { hex: '#F39C12', rgb: [243, 156, 18] as [number, number, number], hsl: [37, 90, 51] as [number, number, number], percentage: 8, color_name: 'Orange' },
  ];

  const colorHarmony = {
    scheme_type: 'complementary' as const,
    harmony_score: 0.85,
    temperature: 'cool' as const,
    saturation_level: 'medium' as const,
    brightness_level: 'medium' as const,
  };

  const accessibility = {
    contrast_ratios: [
      { foreground: '#2C3E50', background: '#ECF0F1', ratio: 12.5, wcag_level: 'AAA' },
      { foreground: '#3498DB', background: '#ECF0F1', ratio: 4.8, wcag_level: 'AA' },
      { foreground: '#E74C3C', background: '#ECF0F1', ratio: 5.2, wcag_level: 'AA' },
    ],
    color_blind_friendly: true,
    accessibility_score: 0.92,
  };

  return {
    dominant_colors: dominantColors,
    color_harmony: colorHarmony,
    accessibility,
  };
}

async function analyzeTypography(contentData: any): Promise<TypographyAnalysis> {
  const fontsDetected = [
    { font_family: 'Roboto', font_weight: '400', font_style: 'normal', font_size: '16px', usage_context: 'body text' },
    { font_family: 'Roboto', font_weight: '700', font_style: 'normal', font_size: '24px', usage_context: 'headings' },
    { font_family: 'Roboto Mono', font_weight: '400', font_style: 'normal', font_size: '14px', usage_context: 'code blocks' },
  ];

  const typographyHierarchy = [
    { level: 'h1' as const, font_size: 32, font_weight: 700, line_height: 1.2, letter_spacing: -0.5 },
    { level: 'h2' as const, font_size: 24, font_weight: 700, line_height: 1.3, letter_spacing: -0.25 },
    { level: 'h3' as const, font_size: 20, font_weight: 600, line_height: 1.4, letter_spacing: 0 },
    { level: 'body' as const, font_size: 16, font_weight: 400, line_height: 1.6, letter_spacing: 0 },
  ];

  const readability = {
    readability_score: 0.88,
    font_pairing_quality: 'excellent' as const,
    consistency_score: 0.92,
  };

  return {
    fonts_detected: fontsDetected,
    typography_hierarchy: typographyHierarchy,
    readability,
  };
}

async function analyzeLayout(contentData: any): Promise<LayoutAnalysis> {
  const composition = {
    layout_type: 'grid' as const,
    balance: 'asymmetrical' as const,
    alignment: 'left' as const,
    spacing_consistency: 0.85,
    visual_hierarchy_score: 0.90,
  };

  const designPrinciples = {
    contrast: 0.88,
    repetition: 0.82,
    alignment: 0.90,
    proximity: 0.85,
    white_space_usage: 0.78,
  };

  const responsiveDesign = {
    mobile_friendly: true,
    breakpoint_consistency: true,
    adaptive_elements: ['navigation', 'grid layout', 'typography scaling', 'image sizing'],
  };

  return {
    composition,
    design_principles: designPrinciples,
    responsive_design: responsiveDesign,
  };
}

async function analyzeMaterialAesthetics(contentData: any): Promise<MaterialAesthetics> {
  const surfaceProperties = {
    texture: 'smooth' as const,
    finish: 'polished' as const,
    transparency: 'opaque' as const,
    reflectivity: 'medium' as const,
  };

  const aestheticQualities = {
    style_category: 'modern' as const,
    sophistication_level: 0.85,
    visual_appeal_score: 0.88,
    uniqueness_factor: 0.72,
  };

  const contextualFit = {
    application_suitability: ['consumer electronics', 'automotive interior', 'furniture', 'architectural elements'],
    target_audience: ['professionals', 'design-conscious consumers', 'tech enthusiasts'],
    market_positioning: 'premium' as const,
  };

  return {
    surface_properties: surfaceProperties,
    aesthetic_qualities: aestheticQualities,
    contextual_fit: contextualFit,
  };
}

function classifyStyle(colorAnalysis: ColorAnalysis, typography?: TypographyAnalysis, layout?: LayoutAnalysis): any {
  // Simulate style classification based on analysis results
  const styles = ['modern', 'minimalist', 'corporate', 'creative', 'classic', 'industrial'];
  const eras = ['contemporary', '2020s', '2010s', 'timeless'];
  const cultures = ['western', 'scandinavian', 'japanese', 'american'];

  return {
    primary_style: 'modern minimalist',
    secondary_styles: ['corporate', 'clean'],
    style_confidence: 0.87,
    design_era: 'contemporary',
    cultural_influences: ['scandinavian', 'japanese minimalism'],
  };
}

function identifyDesignPatterns(analysisData: any): any {
  const patterns = [
    {
      pattern_name: 'Card-based Layout',
      pattern_type: 'layout' as const,
      confidence: 0.92,
      description: 'Content organized in distinct card containers with consistent spacing',
    },
    {
      pattern_name: 'Monochromatic Color Scheme',
      pattern_type: 'color' as const,
      confidence: 0.85,
      description: 'Primary use of blue tones with minimal accent colors',
    },
    {
      pattern_name: 'Typography Scale',
      pattern_type: 'typography' as const,
      confidence: 0.88,
      description: 'Consistent typographic hierarchy with clear size relationships',
    },
  ];

  return {
    identified_patterns: patterns,
    pattern_consistency: 0.86,
    innovation_score: 0.74,
  };
}

function generateRecommendations(analysisResult: any): any {
  return {
    improvement_suggestions: [
      'Increase color contrast for better accessibility',
      'Add more visual hierarchy through typography weight variation',
      'Consider adding subtle animations for enhanced user engagement',
      'Optimize spacing consistency across different screen sizes',
    ],
    style_alternatives: [
      'Dark mode variant with inverted color scheme',
      'High-contrast version for accessibility',
      'Colorful accent variant for creative industries',
      'Minimal monochrome version for professional contexts',
    ],
    accessibility_improvements: [
      'Ensure all text meets WCAG AA contrast requirements',
      'Add focus indicators for keyboard navigation',
      'Provide alternative text for decorative elements',
      'Test with screen readers and assistive technologies',
    ],
    trend_alignment: [
      'Incorporate subtle gradients for modern appeal',
      'Consider glassmorphism effects for depth',
      'Add micro-interactions for enhanced UX',
      'Explore sustainable design principles',
    ],
  };
}

function calculateQualityMetrics(analysisData: any): any {
  return {
    overall_style_score: 0.85,
    aesthetic_appeal: 0.88,
    functional_design: 0.82,
    innovation_factor: 0.74,
    market_relevance: 0.86,
  };
}

async function processStyleAnalysis(request: StyleAnalysisRequest): Promise<StyleAnalysisResult> {
  const startTime = Date.now();

  try {
    console.log(`Analyzing ${request.content_type} style`);

    // Get content data
    let contentData: any = {};
    if (request.content_id) {
      const { data, error } = await supabase
        .from('content_library')
        .select('*')
        .eq('id', request.content_id)
        .single();

      if (error) throw new Error(`Content not found: ${error.message}`);
      contentData = data;
    } else if (request.content_url) {
      // Fetch content from URL
      const response = await fetch(request.content_url);
      if (!response.ok) throw new Error(`Failed to fetch content: ${response.statusText}`);
      contentData = { url: request.content_url, type: request.content_type };
    } else if (request.content_data) {
      contentData = { data: request.content_data, type: request.content_type };
    }

    // Perform style analysis based on focus areas
    const focus = request.analysis_focus || {
      visual_style: true,
      color_palette: true,
      typography: true,
      layout_composition: true,
      material_aesthetics: false,
      design_patterns: true,
      brand_consistency: false,
    };

    const visualAnalysis: any = {};

    // Color analysis (always performed for visual content)
    if (focus.color_palette && ['image', 'webpage', 'material_sample'].includes(request.content_type)) {
      visualAnalysis.color_analysis = await analyzeColors(contentData, request.content_type);
    }

    // Typography analysis
    if (focus.typography && ['text', 'document', 'webpage'].includes(request.content_type)) {
      visualAnalysis.typography_analysis = await analyzeTypography(contentData);
    }

    // Layout analysis
    if (focus.layout_composition && ['webpage', 'document'].includes(request.content_type)) {
      visualAnalysis.layout_analysis = await analyzeLayout(contentData);
    }

    // Material aesthetics
    if (focus.material_aesthetics && request.content_type === 'material_sample') {
      visualAnalysis.material_aesthetics = await analyzeMaterialAesthetics(contentData);
    }

    // Style classification
    const styleClassification = classifyStyle(
      visualAnalysis.color_analysis,
      visualAnalysis.typography_analysis,
      visualAnalysis.layout_analysis,
    );

    // Design patterns
    const designPatterns = focus.design_patterns ? identifyDesignPatterns(visualAnalysis) : {
      identified_patterns: [],
      pattern_consistency: 0,
      innovation_score: 0,
    };

    // Brand analysis (if requested)
    let brandAnalysis;
    if (focus.brand_consistency) {
      brandAnalysis = {
        brand_consistency: 0.82,
        brand_recognition_elements: ['logo placement', 'color scheme', 'typography'],
        brand_personality_traits: ['professional', 'trustworthy', 'innovative'],
        competitive_differentiation: 0.75,
      };
    }

    // Generate recommendations
    const recommendations = generateRecommendations({
      visual: visualAnalysis,
      style: styleClassification,
      patterns: designPatterns,
    });

    // Calculate quality metrics
    const qualityMetrics = calculateQualityMetrics({
      visual: visualAnalysis,
      style: styleClassification,
      patterns: designPatterns,
    });

    const result: StyleAnalysisResult = {
      content_info: {
        content_type: request.content_type,
        content_id: request.content_id,
        analysis_timestamp: new Date().toISOString(),
        processing_method: 'ai_style_analysis',
      },
      visual_analysis: visualAnalysis,
      style_classification: styleClassification,
      design_patterns: designPatterns,
      brand_analysis: brandAnalysis,
      recommendations,
      quality_metrics: qualityMetrics,
    };

    // Store analysis results
    await supabase
      .from('style_analysis_results')
      .insert({
        content_id: request.content_id,
        content_type: request.content_type,
        analysis_focus: request.analysis_focus,
        style_classification: styleClassification,
        quality_metrics: qualityMetrics,
        recommendations,
        user_id: request.user_id,
        created_at: new Date().toISOString(),
      });

    // Log analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'style_analysis',
          event_data: {
            content_type: request.content_type,
            analysis_focus: Object.keys(request.analysis_focus || {}).filter(key => request.analysis_focus![key as keyof typeof request.analysis_focus]),
            style_score: qualityMetrics.overall_style_score,
            processing_time_ms: Date.now() - startTime,
          },
        });
    }

    return result;

  } catch (error) {
    console.error('Style analysis error:', error);
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
      content_type: request.content_type,
      has_content_id: !!request.content_id,
      has_content_url: !!request.content_url,
      has_content_data: !!request.content_data,
      analysis_focus: request.analysis_focus,
    });

    if (!request.content_id && !request.content_url && !request.content_data) {
      return new Response(
        JSON.stringify({ error: 'One of content_id, content_url, or content_data is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!['image', 'text', 'document', 'webpage', 'material_sample'].includes(request.content_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid content_type. Must be one of: image, text, document, webpage, material_sample' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await processStyleAnalysis(request);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Style analysis error:', error);

    return new Response(
      JSON.stringify({
        error: 'Style analysis failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
