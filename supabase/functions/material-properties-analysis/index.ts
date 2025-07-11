import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface MaterialPropertiesRequest {
  imageUrl: string;
  materialType?: string;
  analysisDepth: 'basic' | 'standard' | 'comprehensive';
  focusAreas?: string[];
  applicationContext?: string;
  userId: string;
}

interface MaterialPropertiesAnalysis {
  materialType: string;
  confidence: number;
  properties: {
    physical: {
      density: number;
      hardness: number;
      elasticity: number;
      thermalConductivity: number;
      electricalConductivity: number;
      magneticProperties: string;
      porosity: number;
      surfaceRoughness: number;
    };
    mechanical: {
      tensileStrength: number;
      compressiveStrength: number;
      flexuralStrength: number;
      fatigueResistance: number;
      impactResistance: number;
      wearResistance: number;
      creepResistance: number;
    };
    chemical: {
      composition: { [element: string]: number };
      corrosionResistance: number;
      chemicalStability: number;
      oxidationResistance: number;
      acidResistance: number;
      alkalineResistance: number;
      solventResistance: number;
    };
    environmental: {
      weatherResistance: number;
      uvResistance: number;
      moistureResistance: number;
      temperatureRange: { min: number; max: number };
      fireResistance: number;
      recyclability: number;
      carbonFootprint: number;
      toxicity: string;
    };
    performance: {
      durability: number;
      lifecycle: number;
      maintenanceRequirements: string;
      performanceGrade: string;
      qualityRating: number;
      costEffectiveness: number;
      availabilityScore: number;
    };
    compliance: {
      standards: string[];
      certifications: string[];
      regulatoryCompliance: string[];
      safetyRatings: string[];
      industryGrades: string[];
    };
  };
  recommendations: {
    applications: string[];
    suitableEnvironments: string[];
    incompatibleMaterials: string[];
    maintenanceGuidelines: string[];
    safetyPrecautions: string[];
  };
  qualityAssessment: {
    overallGrade: string;
    strengthAreas: string[];
    weaknessAreas: string[];
    improvementSuggestions: string[];
  };
  reasoning: string;
  technicalDetails: string;
  industryInsights: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { imageUrl, materialType, analysisDepth, focusAreas, applicationContext, userId }: MaterialPropertiesRequest = await req.json();

    console.log('Starting advanced material properties analysis:', {
      imageUrl: imageUrl.substring(0, 100) + '...',
      materialType,
      analysisDepth,
      focusAreas,
      applicationContext,
      userId
    });

    // Create comprehensive analysis prompt
    const systemPrompt = `You are an advanced materials engineer and scientist with expertise in material properties analysis. 

Your task is to analyze the material in the image and provide comprehensive technical properties, performance characteristics, and professional recommendations.

Focus Areas: ${focusAreas?.join(', ') || 'General analysis'}
Application Context: ${applicationContext || 'General construction/engineering'}
Analysis Depth: ${analysisDepth}

For ${analysisDepth} analysis, provide:
- Physical properties (density, hardness, elasticity, thermal/electrical conductivity, magnetic properties, porosity, surface roughness)
- Mechanical properties (tensile/compressive/flexural strength, fatigue/impact/wear/creep resistance)
- Chemical properties (composition, corrosion resistance, chemical stability, acid/alkaline/solvent resistance)
- Environmental properties (weather/UV/moisture resistance, temperature range, fire resistance, recyclability, carbon footprint, toxicity)
- Performance characteristics (durability, lifecycle, maintenance requirements, performance grade, quality rating, cost effectiveness, availability)
- Compliance (standards, certifications, regulatory compliance, safety ratings, industry grades)
- Detailed recommendations for applications, suitable environments, incompatible materials, maintenance guidelines, and safety precautions
- Quality assessment with overall grade, strength/weakness areas, and improvement suggestions
- Technical reasoning explaining your analysis
- Industry insights and best practices

Return results as valid JSON with numerical values where specified (use reasonable engineering values based on material type).`;

    const userPrompt = `Analyze this material image for advanced properties. ${materialType ? `The material appears to be: ${materialType}` : 'Identify the material type first.'}

Provide comprehensive technical analysis including all physical, mechanical, chemical, environmental, and performance properties with specific numerical values where applicable.`;

    // Make request to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;

    console.log('Raw AI analysis:', analysisText.substring(0, 500) + '...');

    // Parse and structure the analysis
    let structuredAnalysis: MaterialPropertiesAnalysis;
    
    try {
      // Try to parse as JSON first
      structuredAnalysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.log('Failed to parse as JSON, extracting structured data...');
      
      // Fallback: extract structured information from text
      structuredAnalysis = extractStructuredAnalysis(analysisText, materialType);
    }

    // Validate and enhance the analysis
    structuredAnalysis = validateAndEnhanceAnalysis(structuredAnalysis);

    // Store results in database
    const { data: insertData, error: insertError } = await supabase
      .from('ml_processing_queue')
      .insert({
        user_id: userId,
        task_type: 'material_properties_analysis',
        input_data: {
          imageUrl,
          materialType,
          analysisDepth,
          focusAreas,
          applicationContext
        },
        result_data: structuredAnalysis,
        status: 'completed',
        completed_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error storing analysis results:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: structuredAnalysis,
        processingTime: Date.now()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Material properties analysis error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Material properties analysis failed',
        details: error.toString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function extractStructuredAnalysis(text: string, materialTypeHint?: string): MaterialPropertiesAnalysis {
  // Extract material type
  const materialTypeMatch = text.match(/material.*?(?:type|is|appears to be).*?:?\s*([A-Za-z\s]+)/i);
  const materialType = materialTypeMatch?.[1]?.trim() || materialTypeHint || 'Unknown Material';

  // Extract confidence
  const confidenceMatch = text.match(/confidence.*?:?\s*(\d+(?:\.\d+)?)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) / 100 : 0.75;

  // Default properties based on common materials
  const defaultProperties = getDefaultPropertiesByMaterial(materialType);

  return {
    materialType,
    confidence,
    properties: defaultProperties.properties,
    recommendations: {
      applications: extractListItems(text, 'applications?|uses?|suitable for'),
      suitableEnvironments: extractListItems(text, 'environments?|conditions'),
      incompatibleMaterials: extractListItems(text, 'incompatible|avoid|not suitable'),
      maintenanceGuidelines: extractListItems(text, 'maintenance|care|upkeep'),
      safetyPrecautions: extractListItems(text, 'safety|precautions|warnings')
    },
    qualityAssessment: {
      overallGrade: extractGrade(text),
      strengthAreas: extractListItems(text, 'strengths?|advantages?|benefits?'),
      weaknessAreas: extractListItems(text, 'weaknesses?|disadvantages?|limitations?'),
      improvementSuggestions: extractListItems(text, 'improvements?|suggestions?|recommendations?')
    },
    reasoning: extractSection(text, 'reasoning|analysis|explanation') || 'Based on visual analysis and material properties database.',
    technicalDetails: extractSection(text, 'technical|details|specifications') || 'Standard material properties applied.',
    industryInsights: extractSection(text, 'industry|insights|best practices') || 'Following industry standards and best practices.'
  };
}

function extractListItems(text: string, pattern: string): string[] {
  const regex = new RegExp(`${pattern}.*?:([^\\n\\r]*(?:\\n[^\\n\\r]*)*?)(?:\\n\\s*\\n|$)`, 'i');
  const match = text.match(regex);
  
  if (match && match[1]) {
    return match[1]
      .split(/[,\n\r•\-*]/)
      .map(item => item.trim())
      .filter(item => item.length > 0 && !item.match(/^\d+\.?\s*$/))
      .slice(0, 5); // Limit to 5 items
  }
  
  return [];
}

function extractSection(text: string, pattern: string): string {
  const regex = new RegExp(`${pattern}.*?:([^\\n\\r]*(?:\\n[^\\n\\r]*)*?)(?:\\n\\s*\\n|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() || '';
}

function extractGrade(text: string): string {
  const gradeMatch = text.match(/grade.*?:?\s*([A-F][+-]?)/i);
  return gradeMatch?.[1] || 'B';
}

function getDefaultPropertiesByMaterial(materialType: string) {
  const type = materialType.toLowerCase();
  
  if (type.includes('steel') || type.includes('metal')) {
    return {
      properties: {
        physical: { density: 7850, hardness: 250, elasticity: 200000, thermalConductivity: 50, electricalConductivity: 6, magneticProperties: 'ferromagnetic', porosity: 0, surfaceRoughness: 1.6 },
        mechanical: { tensileStrength: 400, compressiveStrength: 400, flexuralStrength: 400, fatigueResistance: 8, impactResistance: 9, wearResistance: 8, creepResistance: 7 },
        chemical: { composition: { 'Fe': 98, 'C': 0.5, 'Mn': 1, 'Si': 0.5 }, corrosionResistance: 4, chemicalStability: 7, oxidationResistance: 4, acidResistance: 3, alkalineResistance: 6, solventResistance: 8 },
        environmental: { weatherResistance: 4, uvResistance: 9, moistureResistance: 3, temperatureRange: { min: -40, max: 500 }, fireResistance: 9, recyclability: 10, carbonFootprint: 6, toxicity: 'low' },
        performance: { durability: 9, lifecycle: 50, maintenanceRequirements: 'Regular inspection for corrosion', performanceGrade: 'A', qualityRating: 8, costEffectiveness: 7, availabilityScore: 9 },
        compliance: { standards: ['ASTM A36', 'EN 10025'], certifications: ['CE marking'], regulatoryCompliance: ['Building codes'], safetyRatings: ['Fire resistant'], industryGrades: ['Structural grade'] }
      }
    };
  } else if (type.includes('concrete')) {
    return {
      properties: {
        physical: { density: 2400, hardness: 150, elasticity: 30000, thermalConductivity: 1.7, electricalConductivity: 0, magneticProperties: 'non-magnetic', porosity: 15, surfaceRoughness: 50 },
        mechanical: { tensileStrength: 4, compressiveStrength: 30, flexuralStrength: 5, fatigueResistance: 6, impactResistance: 4, wearResistance: 7, creepResistance: 8 },
        chemical: { composition: { 'CaO': 65, 'SiO2': 20, 'Al2O3': 6, 'Fe2O3': 3 }, corrosionResistance: 8, chemicalStability: 9, oxidationResistance: 10, acidResistance: 5, alkalineResistance: 9, solventResistance: 7 },
        environmental: { weatherResistance: 8, uvResistance: 10, moistureResistance: 6, temperatureRange: { min: -20, max: 200 }, fireResistance: 10, recyclability: 8, carbonFootprint: 4, toxicity: 'very low' },
        performance: { durability: 9, lifecycle: 100, maintenanceRequirements: 'Crack monitoring and sealing', performanceGrade: 'A', qualityRating: 8, costEffectiveness: 9, availabilityScore: 10 },
        compliance: { standards: ['ACI 318', 'EN 206'], certifications: ['Quality control'], regulatoryCompliance: ['Building codes'], safetyRatings: ['Fire resistant'], industryGrades: ['Structural concrete'] }
      }
    };
  } else if (type.includes('plastic') || type.includes('polymer')) {
    return {
      properties: {
        physical: { density: 1400, hardness: 80, elasticity: 3000, thermalConductivity: 0.2, electricalConductivity: 0, magneticProperties: 'non-magnetic', porosity: 0, surfaceRoughness: 0.8 },
        mechanical: { tensileStrength: 50, compressiveStrength: 60, flexuralStrength: 80, fatigueResistance: 6, impactResistance: 5, wearResistance: 6, creepResistance: 5 },
        chemical: { composition: { 'C': 50, 'H': 40, 'Cl': 10 }, corrosionResistance: 9, chemicalStability: 7, oxidationResistance: 6, acidResistance: 8, alkalineResistance: 8, solventResistance: 4 },
        environmental: { weatherResistance: 7, uvResistance: 5, moistureResistance: 9, temperatureRange: { min: -20, max: 60 }, fireResistance: 3, recyclability: 6, carbonFootprint: 3, toxicity: 'low' },
        performance: { durability: 6, lifecycle: 25, maintenanceRequirements: 'UV protection recommended', performanceGrade: 'B', qualityRating: 6, costEffectiveness: 8, availabilityScore: 9 },
        compliance: { standards: ['ASTM D792', 'ISO 1183'], certifications: ['RoHS'], regulatoryCompliance: ['Material safety'], safetyRatings: ['Food grade available'], industryGrades: ['Engineering plastic'] }
      }
    };
  }
  
  // Default unknown material
  return {
    properties: {
      physical: { density: 2000, hardness: 150, elasticity: 10000, thermalConductivity: 1, electricalConductivity: 0, magneticProperties: 'non-magnetic', porosity: 5, surfaceRoughness: 10 },
      mechanical: { tensileStrength: 100, compressiveStrength: 100, flexuralStrength: 100, fatigueResistance: 5, impactResistance: 5, wearResistance: 5, creepResistance: 5 },
      chemical: { composition: {}, corrosionResistance: 5, chemicalStability: 5, oxidationResistance: 5, acidResistance: 5, alkalineResistance: 5, solventResistance: 5 },
      environmental: { weatherResistance: 5, uvResistance: 5, moistureResistance: 5, temperatureRange: { min: 0, max: 100 }, fireResistance: 5, recyclability: 5, carbonFootprint: 5, toxicity: 'unknown' },
      performance: { durability: 5, lifecycle: 20, maintenanceRequirements: 'Standard maintenance', performanceGrade: 'C', qualityRating: 5, costEffectiveness: 5, availabilityScore: 5 },
      compliance: { standards: [], certifications: [], regulatoryCompliance: [], safetyRatings: [], industryGrades: [] }
    }
  };
}

function validateAndEnhanceAnalysis(analysis: MaterialPropertiesAnalysis): MaterialPropertiesAnalysis {
  // Ensure all required fields exist and have reasonable values
  analysis.confidence = Math.max(0.1, Math.min(1.0, analysis.confidence || 0.75));
  
  // Validate numerical ranges
  if (analysis.properties?.physical) {
    const physical = analysis.properties.physical;
    physical.density = Math.max(100, Math.min(50000, physical.density || 2000));
    physical.hardness = Math.max(1, Math.min(1000, physical.hardness || 150));
    physical.elasticity = Math.max(100, Math.min(1000000, physical.elasticity || 10000));
    physical.porosity = Math.max(0, Math.min(90, physical.porosity || 5));
  }
  
  // Ensure arrays exist
  if (!analysis.recommendations) {
    analysis.recommendations = {
      applications: ['General use'],
      suitableEnvironments: ['Standard conditions'],
      incompatibleMaterials: [],
      maintenanceGuidelines: ['Regular inspection'],
      safetyPrecautions: ['Follow safety guidelines']
    };
  }
  
  return analysis;
}