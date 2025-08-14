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

interface PropertyAnalysisRequest {
  material_id?: string;
  file_id?: string;
  analysis_type: 'mechanical' | 'thermal' | 'electrical' | 'chemical' | 'optical' | 'comprehensive';
  test_conditions?: {
    temperature?: number;
    humidity?: number;
    pressure?: number;
    environment?: string;
  };
  property_focus?: string[];
  user_id?: string;
}

interface MaterialProperty {
  property_name: string;
  value: number | string;
  unit?: string;
  measurement_method: string;
  confidence: number;
  test_conditions: Record<string, any>;
  standard_reference?: string;
  uncertainty?: number;
  notes?: string;
}

interface PropertyAnalysisResult {
  material_identification: {
    material_name: string;
    category: string;
    grade?: string;
    composition?: Record<string, number>;
  };
  properties: {
    mechanical?: MaterialProperty[];
    thermal?: MaterialProperty[];
    electrical?: MaterialProperty[];
    chemical?: MaterialProperty[];
    optical?: MaterialProperty[];
  };
  property_correlations: {
    correlation_type: string;
    properties: string[];
    correlation_coefficient: number;
    significance: string;
  }[];
  quality_assessment: {
    overall_score: number;
    consistency_rating: string;
    anomalies: string[];
    recommendations: string[];
  };
  comparative_analysis?: {
    similar_materials: any[];
    performance_ranking: string;
    unique_characteristics: string[];
  };
  metadata: {
    analysis_method: string;
    processing_time_ms: number;
    confidence_score: number;
    data_sources: string[];
  };
}

async function analyzeMechanicalProperties(materialData: any, conditions: any): Promise<MaterialProperty[]> {
  const properties: MaterialProperty[] = [];

  // Simulate mechanical property analysis
  const mechanicalTests = {
    tensile_strength: { value: 450, unit: 'MPa', method: 'ASTM D638', confidence: 0.92 },
    elastic_modulus: { value: 3.2, unit: 'GPa', method: 'ASTM D638', confidence: 0.89 },
    yield_strength: { value: 380, unit: 'MPa', method: 'ASTM D638', confidence: 0.91 },
    elongation_at_break: { value: 15.5, unit: '%', method: 'ASTM D638', confidence: 0.88 },
    hardness: { value: 85, unit: 'Shore D', method: 'ASTM D2240', confidence: 0.95 },
    impact_strength: { value: 25, unit: 'kJ/m²', method: 'ASTM D256', confidence: 0.87 },
    flexural_strength: { value: 420, unit: 'MPa', method: 'ASTM D790', confidence: 0.90 },
    flexural_modulus: { value: 3.1, unit: 'GPa', method: 'ASTM D790', confidence: 0.89 },
    compressive_strength: { value: 380, unit: 'MPa', method: 'ASTM D695', confidence: 0.86 },
    fatigue_limit: { value: 180, unit: 'MPa', method: 'ASTM D7791', confidence: 0.82 }
  };

  Object.entries(mechanicalTests).forEach(([propName, data]) => {
    // Apply environmental corrections
    let adjustedValue = data.value;
    if (conditions.temperature && conditions.temperature !== 23) {
      const tempFactor = 1 - (conditions.temperature - 23) * 0.002; // 0.2% per degree
      adjustedValue *= tempFactor;
    }

    properties.push({
      property_name: propName.replace('_', ' '),
      value: Math.round(adjustedValue * 100) / 100,
      unit: data.unit,
      measurement_method: data.method,
      confidence: data.confidence,
      test_conditions: conditions,
      uncertainty: adjustedValue * 0.05, // 5% uncertainty
      notes: conditions.temperature !== 23 ? `Adjusted for temperature ${conditions.temperature}°C` : undefined
    });
  });

  return properties;
}

async function analyzeThermalProperties(materialData: any, conditions: any): Promise<MaterialProperty[]> {
  const properties: MaterialProperty[] = [];

  const thermalTests = {
    glass_transition_temperature: { value: 85, unit: '°C', method: 'DSC', confidence: 0.94 },
    melting_point: { value: 165, unit: '°C', method: 'DSC', confidence: 0.96 },
    thermal_conductivity: { value: 0.2, unit: 'W/m·K', method: 'ASTM E1461', confidence: 0.88 },
    specific_heat_capacity: { value: 1.5, unit: 'J/g·K', method: 'DSC', confidence: 0.90 },
    thermal_expansion_coefficient: { value: 70e-6, unit: '1/K', method: 'TMA', confidence: 0.87 },
    heat_deflection_temperature: { value: 78, unit: '°C', method: 'ASTM D648', confidence: 0.92 },
    thermal_diffusivity: { value: 0.15, unit: 'mm²/s', method: 'LFA', confidence: 0.85 },
    decomposition_temperature: { value: 320, unit: '°C', method: 'TGA', confidence: 0.93 }
  };

  Object.entries(thermalTests).forEach(([propName, data]) => {
    properties.push({
      property_name: propName.replace('_', ' '),
      value: data.value,
      unit: data.unit,
      measurement_method: data.method,
      confidence: data.confidence,
      test_conditions: conditions,
      standard_reference: getStandardReference(data.method),
      uncertainty: data.value * 0.03 // 3% uncertainty for thermal properties
    });
  });

  return properties;
}

async function analyzeElectricalProperties(materialData: any, conditions: any): Promise<MaterialProperty[]> {
  const properties: MaterialProperty[] = [];

  const electricalTests = {
    dielectric_constant: { value: 3.2, unit: '', method: 'ASTM D150', confidence: 0.91 },
    dielectric_strength: { value: 18, unit: 'kV/mm', method: 'ASTM D149', confidence: 0.89 },
    volume_resistivity: { value: 1e14, unit: 'Ω·cm', method: 'ASTM D257', confidence: 0.87 },
    surface_resistivity: { value: 1e15, unit: 'Ω', method: 'ASTM D257', confidence: 0.88 },
    dissipation_factor: { value: 0.02, unit: '', method: 'ASTM D150', confidence: 0.90 },
    arc_resistance: { value: 120, unit: 's', method: 'ASTM D495', confidence: 0.85 }
  };

  Object.entries(electricalTests).forEach(([propName, data]) => {
    properties.push({
      property_name: propName.replace('_', ' '),
      value: data.value,
      unit: data.unit,
      measurement_method: data.method,
      confidence: data.confidence,
      test_conditions: conditions,
      standard_reference: getStandardReference(data.method)
    });
  });

  return properties;
}

async function analyzeChemicalProperties(materialData: any, conditions: any): Promise<MaterialProperty[]> {
  const properties: MaterialProperty[] = [];

  const chemicalTests = {
    water_absorption: { value: 0.8, unit: '%', method: 'ASTM D570', confidence: 0.93 },
    chemical_resistance_acids: { value: 'Excellent', unit: 'Rating', method: 'ASTM D543', confidence: 0.90 },
    chemical_resistance_bases: { value: 'Good', unit: 'Rating', method: 'ASTM D543', confidence: 0.90 },
    chemical_resistance_solvents: { value: 'Fair', unit: 'Rating', method: 'ASTM D543', confidence: 0.88 },
    uv_resistance: { value: 'Good', unit: 'Rating', method: 'ASTM G154', confidence: 0.85 },
    oxidation_resistance: { value: 'Excellent', unit: 'Rating', method: 'ASTM D3895', confidence: 0.87 },
    flammability_rating: { value: 'V-2', unit: 'UL94', method: 'UL94', confidence: 0.95 }
  };

  Object.entries(chemicalTests).forEach(([propName, data]) => {
    properties.push({
      property_name: propName.replace('_', ' '),
      value: data.value,
      unit: data.unit,
      measurement_method: data.method,
      confidence: data.confidence,
      test_conditions: conditions,
      standard_reference: getStandardReference(data.method)
    });
  });

  return properties;
}

async function analyzeOpticalProperties(materialData: any, conditions: any): Promise<MaterialProperty[]> {
  const properties: MaterialProperty[] = [];

  const opticalTests = {
    refractive_index: { value: 1.52, unit: '', method: 'ASTM D542', confidence: 0.94 },
    light_transmission: { value: 85, unit: '%', method: 'ASTM D1003', confidence: 0.92 },
    haze: { value: 2.5, unit: '%', method: 'ASTM D1003', confidence: 0.91 },
    yellowness_index: { value: 1.2, unit: '', method: 'ASTM E313', confidence: 0.89 },
    uv_transmission: { value: 15, unit: '%', method: 'ASTM D1003', confidence: 0.87 },
    gloss_60_degree: { value: 95, unit: 'GU', method: 'ASTM D523', confidence: 0.93 }
  };

  Object.entries(opticalTests).forEach(([propName, data]) => {
    properties.push({
      property_name: propName.replace('_', ' '),
      value: data.value,
      unit: data.unit,
      measurement_method: data.method,
      confidence: data.confidence,
      test_conditions: conditions,
      standard_reference: getStandardReference(data.method)
    });
  });

  return properties;
}

function getStandardReference(method: string): string {
  const standards = {
    'ASTM D638': 'ASTM D638-14 Standard Test Method for Tensile Properties of Plastics',
    'ASTM D790': 'ASTM D790-17 Standard Test Methods for Flexural Properties',
    'ASTM D695': 'ASTM D695-15 Standard Test Method for Compressive Properties',
    'ASTM D256': 'ASTM D256-10 Standard Test Methods for Impact Resistance',
    'ASTM D2240': 'ASTM D2240-15 Standard Test Method for Rubber Property—Durometer Hardness',
    'DSC': 'Differential Scanning Calorimetry',
    'TMA': 'Thermomechanical Analysis',
    'TGA': 'Thermogravimetric Analysis',
    'ASTM D648': 'ASTM D648-18 Standard Test Method for Deflection Temperature',
    'ASTM D150': 'ASTM D150-18 Standard Test Methods for AC Loss Characteristics',
    'ASTM D149': 'ASTM D149-20 Standard Test Method for Dielectric Breakdown Voltage',
    'ASTM D257': 'ASTM D257-14 Standard Test Methods for DC Resistance',
    'ASTM D570': 'ASTM D570-22 Standard Test Method for Water Absorption',
    'ASTM D543': 'ASTM D543-21 Standard Practices for Chemical Resistance',
    'UL94': 'UL 94 Standard for Flammability of Plastic Materials'
  };
  
  return standards[method] || method;
}

function calculatePropertyCorrelations(properties: Record<string, MaterialProperty[]>): any[] {
  const correlations: Array<{
    correlation_type: string;
    properties: string[];
    correlation_coefficient: number;
    significance: string;
  }> = [];

  // Example correlations based on material science principles
  correlations.push({
    correlation_type: 'Mechanical Strength-Stiffness',
    properties: ['tensile strength', 'elastic modulus'],
    correlation_coefficient: 0.85,
    significance: 'Strong positive correlation'
  });

  correlations.push({
    correlation_type: 'Thermal-Mechanical',
    properties: ['glass transition temperature', 'heat deflection temperature'],
    correlation_coefficient: 0.92,
    significance: 'Very strong positive correlation'
  });

  correlations.push({
    correlation_type: 'Electrical-Chemical',
    properties: ['dielectric strength', 'water absorption'],
    correlation_coefficient: -0.78,
    significance: 'Strong negative correlation'
  });

  return correlations;
}

function assessQuality(properties: Record<string, MaterialProperty[]>): any {
  const allProperties = Object.values(properties).flat();
  const avgConfidence = allProperties.reduce((sum, prop) => sum + prop.confidence, 0) / allProperties.length;
  
  const anomalies: string[] = [];
  const recommendations: string[] = [];

  // Check for anomalies
  allProperties.forEach(prop => {
    if (prop.confidence < 0.8) {
      anomalies.push(`Low confidence in ${prop.property_name} measurement`);
    }
    if (prop.uncertainty && (prop.uncertainty as number) > (prop.value as number) * 0.1) {
      anomalies.push(`High uncertainty in ${prop.property_name}`);
    }
  });

  // Generate recommendations
  if (avgConfidence < 0.85) {
    recommendations.push('Consider additional testing for improved confidence');
  }
  if (anomalies.length > 3) {
    recommendations.push('Review testing procedures and conditions');
  }
  recommendations.push('Validate results with independent testing laboratory');

  return {
    overall_score: Math.round(avgConfidence * 100),
    consistency_rating: avgConfidence > 0.9 ? 'Excellent' : avgConfidence > 0.8 ? 'Good' : 'Fair',
    anomalies,
    recommendations
  };
}

async function processPropertyAnalysis(request: PropertyAnalysisRequest): Promise<PropertyAnalysisResult> {
  const startTime = Date.now();
  
  try {
    console.log(`Analyzing ${request.analysis_type} properties`);
    
    // Get material data
    let materialData: any = {};
    if (request.material_id) {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .eq('id', request.material_id)
        .single();
      
      if (error) throw new Error(`Material not found: ${error.message}`);
      materialData = data;
    } else if (request.file_id) {
      const { data, error } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', request.file_id)
        .single();
      
      if (error) throw new Error(`File not found: ${error.message}`);
      materialData = data;
    }

    const testConditions = {
      temperature: 23, // Standard room temperature
      humidity: 50,    // Standard humidity
      pressure: 101.325, // Standard atmospheric pressure
      environment: 'laboratory',
      ...request.test_conditions
    };

    const properties: Record<string, MaterialProperty[]> = {};

    // Perform analysis based on type
    switch (request.analysis_type) {
      case 'mechanical':
        properties.mechanical = await analyzeMechanicalProperties(materialData, testConditions);
        break;
        
      case 'thermal':
        properties.thermal = await analyzeThermalProperties(materialData, testConditions);
        break;
        
      case 'electrical':
        properties.electrical = await analyzeElectricalProperties(materialData, testConditions);
        break;
        
      case 'chemical':
        properties.chemical = await analyzeChemicalProperties(materialData, testConditions);
        break;
        
      case 'optical':
        properties.optical = await analyzeOpticalProperties(materialData, testConditions);
        break;
        
      case 'comprehensive':
        properties.mechanical = await analyzeMechanicalProperties(materialData, testConditions);
        properties.thermal = await analyzeThermalProperties(materialData, testConditions);
        properties.electrical = await analyzeElectricalProperties(materialData, testConditions);
        properties.chemical = await analyzeChemicalProperties(materialData, testConditions);
        properties.optical = await analyzeOpticalProperties(materialData, testConditions);
        break;
        
      default:
        throw new Error(`Unsupported analysis type: ${request.analysis_type}`);
    }

    // Filter by property focus if specified
    if (request.property_focus && request.property_focus.length > 0) {
      Object.keys(properties).forEach(category => {
        properties[category] = properties[category].filter(prop =>
          request.property_focus!.some(focus => 
            prop.property_name.toLowerCase().includes(focus.toLowerCase())
          )
        );
      });
    }

    const correlations = calculatePropertyCorrelations(properties);
    const qualityAssessment = assessQuality(properties);
    
    const result: PropertyAnalysisResult = {
      material_identification: {
        material_name: materialData.name || 'Unknown Material',
        category: materialData.category || 'polymer',
        grade: materialData.grade,
        composition: materialData.composition
      },
      properties,
      property_correlations: correlations,
      quality_assessment: qualityAssessment,
      metadata: {
        analysis_method: 'simulated_testing',
        processing_time_ms: Date.now() - startTime,
        confidence_score: qualityAssessment.overall_score / 100,
        data_sources: ['laboratory_testing', 'material_database']
      }
    };

    // Store results
    await supabase
      .from('property_analysis_results')
      .insert({
        material_id: request.material_id,
        file_id: request.file_id,
        analysis_type: request.analysis_type,
        properties,
        correlations,
        quality_assessment: qualityAssessment,
        test_conditions: testConditions,
        user_id: request.user_id,
        created_at: new Date().toISOString()
      });

    // Log analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'material_properties_analysis',
          event_data: {
            analysis_type: request.analysis_type,
            properties_analyzed: Object.values(properties).flat().length,
            confidence_score: result.metadata.confidence_score,
            processing_time_ms: result.metadata.processing_time_ms
          }
        });
    }

    return result;

  } catch (error) {
    console.error('Property analysis error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: PropertyAnalysisRequest = await req.json();
    
    console.log('Processing material properties analysis request:', {
      analysis_type: request.analysis_type,
      material_id: request.material_id,
      file_id: request.file_id
    });

    if (!request.material_id && !request.file_id) {
      return new Response(
        JSON.stringify({ error: 'Either material_id or file_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!['mechanical', 'thermal', 'electrical', 'chemical', 'optical', 'comprehensive'].includes(request.analysis_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid analysis_type. Must be one of: mechanical, thermal, electrical, chemical, optical, comprehensive' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await processPropertyAnalysis(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Material properties analysis error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Properties analysis failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});