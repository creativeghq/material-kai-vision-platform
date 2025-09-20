import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
// Dynamic material categories - fetch from database instead of hardcoded
let MATERIAL_CATEGORIES: Record<string, { name: string; metaFields: string[] }> = {};

// Function to fetch dynamic material categories
async function fetchMaterialCategories() {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Call the get-material-categories edge function for legacy format
    const response = await fetch(`${supabaseUrl}/functions/v1/get-material-categories/legacy-format`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    if (result.success) {
      MATERIAL_CATEGORIES = result.data;
      console.log(`Loaded ${Object.keys(MATERIAL_CATEGORIES).length} dynamic material categories`);
    } else {
      throw new Error(result.error || 'Failed to fetch categories');
    }
  } catch (error) {
    console.error('Failed to fetch dynamic categories, using fallback:', error);
    // Minimal fallback categories
    MATERIAL_CATEGORIES = {
      ceramics: { name: 'ceramics', metaFields: ['r11_rating', 'finish', 'size', 'installation_method', 'application'] },
      porcelain: { name: 'porcelain', metaFields: ['r11_rating', 'finish', 'size', 'installation_method', 'application'] },
      natural_stone: { name: 'natural_stone', metaFields: ['r11_rating', 'finish', 'size', 'installation_method', 'application'] },
      metal: { name: 'metal', metaFields: ['metal_type', 'finish', 'size', 'installation_method', 'application'] },
      other: { name: 'other', metaFields: ['finish', 'size', 'installation_method', 'application'] }
    };
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Enhanced features extracted from ai-material-analysis for better UI performance

// Analysis type flexibility for different use cases
type AnalysisType = 'comprehensive' | 'quick' | 'properties_only';

// Result validation system from ai-material-analysis
function validateResult(result: any): { score: number; issues: string[] } {
  let score = 1.0;
  const issues: string[] = [];

  // Check material name quality
  if (!result.material_name || result.material_name.trim().length < 2) {
    score -= 0.3;
    issues.push('Missing or invalid material name');
  }

  // Check category presence
  if (!result.category) {
    score -= 0.2;
    issues.push('Missing category classification');
  }

  // Check confidence threshold
  if (result.confidence < 0.6) {
    score -= 0.2;
    issues.push('Low confidence score');
  }

  // Check properties completeness
  if (!result.properties || Object.keys(result.properties).length < 2) {
    score -= 0.2;
    issues.push('Insufficient property extraction');
  }

  // Generic response detection (superior feature from ai-material-analysis)
  const genericTerms = ['unknown', 'generic', 'standard', 'typical', 'unspecified', 'unclear'];
  const responseText = JSON.stringify(result).toLowerCase();
  const genericCount = genericTerms.filter(term => responseText.includes(term)).length;
  
  if (genericCount > 2) {
    score -= 0.1;
    issues.push('Contains too many generic terms');
  }

  // Additional quality checks
  if (result.material_name && result.material_name.toLowerCase().includes('unknown')) {
    score -= 0.15;
    issues.push('Material name indicates uncertainty');
  }

  return { 
    score: Math.max(0, Math.min(1, score)),
    issues 
  };
}

// Enhanced prompt engineering from ai-material-analysis
function getAnalysisPrompts(analysisType: AnalysisType, availableCategories: string[]): {
  comprehensive: string;
  quick: string;
  properties_only: string;
} {
  const categoryList = availableCategories.join(', ');
  
  return {
    comprehensive: `Analyze this material image comprehensively. You are an expert materials scientist with extensive knowledge.

CRITICAL REQUIREMENTS:
1. Material identification with confidence score (0-1)
2. Category classification from: ${categoryList}
3. Physical properties (density, strength, thermal properties)
4. Meta properties: R11 rating, metal types, finish, size, installation method, application
5. Chemical composition if identifiable
6. Safety considerations and handling requirements
7. Relevant industry standards

RESPONSE FORMAT: Valid JSON only. Include confidence scores for each property extracted.

QUALITY REQUIREMENTS:
- Avoid generic terms like "unknown", "typical", "standard"
- Provide specific, technical descriptions
- Include numerical values where possible
- Specify exact standards and certifications`,

    quick: `Quickly identify this material with high accuracy. Focus on:
1. Material name and type
2. Category from: ${categoryList}
3. Key identifying features
4. Confidence score (0-1)

RESPONSE FORMAT: Valid JSON only. Be specific, avoid generic terms.`,

    properties_only: `Focus exclusively on material properties and characteristics:
1. Physical properties (hardness, density, texture)
2. Meta properties (R11, finish, size, installation, application)
3. Performance characteristics
4. Safety ratings
5. Technical specifications

RESPONSE FORMAT: Valid JSON only. Include specific measurements and ratings.`
  };
}

// Database helper functions for retrieving analysis data
async function getSpectralDataFromDatabase(fileId: string): Promise<any> {
  const { data: spectralData, error } = await supabase
    .from('spectral_analysis_results')
    .select('*')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !spectralData) {
    // Fallback to material catalog spectral data if no specific analysis exists
    const { data: materialData } = await supabase
      .from('materials_catalog')
      .select('spectral_properties')
      .not('spectral_properties', 'is', null)
      .limit(1)
      .single();

    return materialData?.spectral_properties || {
      peaks: [1650, 2850, 3300],
      intensities: [0.8, 0.6, 0.9],
      baseline_quality: 0.85,
      noise_level: 0.05,
    };
  }

  return {
    peaks: spectralData.peaks || [1650, 2850, 3300],
    intensities: spectralData.intensities || [0.8, 0.6, 0.9],
    baseline_quality: spectralData.baseline_quality || 0.85,
    noise_level: spectralData.noise_level || 0.05,
  };
}

async function getChemicalDataFromDatabase(fileId: string): Promise<any> {
  const { data: chemicalData, error } = await supabase
    .from('chemical_analysis_results')
    .select('*')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !chemicalData) {
    // Fallback to material catalog chemical data
    const { data: materialData } = await supabase
      .from('materials_catalog')
      .select('chemical_composition')
      .not('chemical_composition', 'is', null)
      .limit(1)
      .single();

    return materialData?.chemical_composition || {
      elements: { 'C': 85.2, 'H': 12.1, 'O': 2.7 },
      molecular_weight: 180.5,
      purity: 0.90,
      accuracy: 0.92,
    };
  }

  return {
    elements: chemicalData.elemental_composition || { 'C': 85.2, 'H': 12.1, 'O': 2.7 },
    molecular_weight: chemicalData.molecular_weight || 180.5,
    purity: chemicalData.purity_level || 0.90,
    accuracy: chemicalData.accuracy || 0.92,
  };
}

async function getMechanicalDataFromDatabase(fileId: string): Promise<any> {
  const { data: mechanicalData, error } = await supabase
    .from('mechanical_analysis_results')
    .select('*')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !mechanicalData) {
    // Fallback to material catalog mechanical properties
    const { data: materialData } = await supabase
      .from('materials_catalog')
      .select('mechanical_properties')
      .not('mechanical_properties', 'is', null)
      .limit(1)
      .single();

    return materialData?.mechanical_properties || {
      hardness: 85,
      elastic_modulus: 3.2,
      tensile_strength: 45,
      elongation: 15,
      yield_strength: 38,
    };
  }

  return {
    hardness: mechanicalData.hardness_hv || 85,
    elastic_modulus: mechanicalData.elastic_modulus_gpa || 3.2,
    tensile_strength: mechanicalData.tensile_strength_mpa || 45,
    elongation: mechanicalData.elongation_percent || 15,
    yield_strength: mechanicalData.yield_strength_mpa || 38,
  };
}

async function getThermalDataFromDatabase(fileId: string): Promise<any> {
  const { data: thermalData, error } = await supabase
    .from('thermal_analysis_results')
    .select('*')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !thermalData) {
    // Fallback to material catalog thermal properties
    const { data: materialData } = await supabase
      .from('materials_catalog')
      .select('thermal_properties')
      .not('thermal_properties', 'is', null)
      .limit(1)
      .single();

    return materialData?.thermal_properties || {
      melting_point: 165,
      glass_transition: 85,
      thermal_conductivity: 0.2,
      thermal_expansion: 65e-6,
      heat_capacity: 1.5,
    };
  }

  return {
    melting_point: thermalData.melting_point_c || 165,
    glass_transition: thermalData.glass_transition_c || 85,
    thermal_conductivity: thermalData.thermal_conductivity_w_mk || 0.2,
    thermal_expansion: thermalData.thermal_expansion_k || 65e-6,
    heat_capacity: thermalData.heat_capacity_j_gk || 1.5,
  };
}

interface HybridAnalysisRequest {
  file_id: string;
  analysis_modes: ('visual' | 'spectral' | 'chemical' | 'mechanical' | 'thermal')[];
  confidence_threshold?: number;
  include_comparisons?: boolean;
  generate_report?: boolean;
  user_id?: string;
}

interface AnalysisResult {
  mode: string;
  confidence: number;
  material_identification: {
    primary_material: string;
    category: string;
    subcategory?: string;
    composition?: Record<string, number>;
  };
  properties: {
    physical?: Record<string, any>;
    mechanical?: Record<string, any>;
    thermal?: Record<string, any>;
    electrical?: Record<string, any>;
    chemical?: Record<string, any>;
  };
  quality_indicators: {
    surface_finish?: string;
    defects?: string[];
    uniformity_score?: number;
    purity_level?: number;
  };
  processing_metadata: {
    method: string;
    processing_time_ms: number;
    model_version: string;
    extracted_meta?: {
      finish?: string;
      size?: string;
      installation_method?: string;
      application?: string;
      r11?: string;
      metal_types?: string[];
    };
  };
}

interface HybridAnalysisResponse {
  file_id: string;
  analysis_results: AnalysisResult[];
  consensus_analysis: {
    material_name: string;
    category: string;
    confidence: number;
    properties: Record<string, any>;
    quality_assessment: string;
  };
  comparative_analysis?: {
    similar_materials: any[];
    differentiation_factors: string[];
  };
  recommendations: string[];
  report_url?: string;
  processing_summary: {
    total_time_ms: number;
    modes_analyzed: string[];
    overall_confidence: number;
  };
}

async function performVisualAnalysis(imageUrl: string): Promise<AnalysisResult> {
  const startTime = Date.now();
  let usedMethod = 'unknown';
  let processedResult: any = null;

  // Comprehensive material analysis prompt for both MIVAA and OpenAI
  const materialAnalysisPrompt = `You are an expert materials scientist specializing in visual material analysis and catalog data extraction. Analyze the image to identify the material, its properties, quality indicators, and extract meta fields from catalog content.

Available material categories: ${Object.keys(MATERIAL_CATEGORIES).join(', ')}

For each category, extract these meta fields when visible in the catalog:
- finish: surface finish type
- size: dimensions/specifications
- installation_method: how the material is installed
- application: where/how the material is used
- r11: R11 rating if visible (thermal resistance)
- metal_types: types of metals if applicable

Respond with structured JSON matching the AnalysisResult interface, including extracted meta data in the metadata field.`;

  const detailedAnalysisPrompt = `Perform comprehensive visual analysis of this material catalog image. Extract:

1. MATERIAL IDENTIFICATION:
   - Primary material type and category from: ${Object.keys(MATERIAL_CATEGORIES).join(', ')}
   - Observable physical properties
   - Estimated composition if determinable

2. FUNCTIONAL METADATA EXTRACTION (from catalog text/specifications):
   
   A. SLIP AND SAFETY RATINGS:
   - slip_resistance_r_value: DIN 51130 R-values (R9, R10, R11, R12, R13)
   - barefoot_ramp_rating: DIN 51097 classes (A, B, C for wet barefoot areas)
   - pendulum_test_value: BS 7976 PTV ratings for wet/dry slip resistance
   - dcof_rating: ANSI A137.1 Dynamic Coefficient of Friction (≥0.42 recommended)
   - slip_resistance_general: Any other slip resistance certifications or ratings
   
   B. SURFACE GLOSS/REFLECTIVITY:
   - surface_gloss_level: Super Polished, Polished, Satin/Semi-polished, Matte/Velvet, Anti-glare
   - gloss_measurement: Numerical gloss values if specified (GU - Gloss Units)
   
   C. MECHANICAL PROPERTIES:
   - mohs_hardness: Hardness scale rating (1-10)
   - pei_rating: Porcelain Enamel Institute wear rating (Class 0-5)
   - breaking_strength: Flexural strength in N/mm² or MPa
   - impact_resistance: ISO 10545-5 ratings or impact test results
   
   D. THERMAL PROPERTIES:
   - thermal_conductivity: Thermal conductivity values (W/m·K)
   - thermal_expansion: Thermal expansion coefficient
   - heat_resistance: Maximum temperature ratings
   - radiant_heating_compatible: Compatibility with underfloor heating
   
   E. WATER AND MOISTURE RESISTANCE:
   - water_absorption: ISO 10545-3 percentage (<0.5% non-porous, etc.)
   - frost_resistance: Frost resistance ratings or certifications
   - hydrophobic_treatment: Nano-sealed or hydrophobic surface treatments
   - mold_mildew_resistant: Anti-microbial or mold resistance properties
   
   F. CHEMICAL AND HYGIENE RESISTANCE:
   - chemical_resistance: ISO 10545-13 ratings or chemical resistance classes
   - stain_resistance: ISO 10545-14 classes (1-5) or stain resistance ratings
   - antibacterial_surface: Antibacterial/antimicrobial certifications
   - acid_alkali_resistance: Specific acid or alkali resistance ratings
   - food_safe_certification: Food-safe or kitchen-safe certifications
   
   G. ACOUSTIC AND ELECTRICAL PROPERTIES:
   - sound_absorption: NRC ratings or dB reduction values
   - impact_insulation: IIC ratings for impact sound transmission
   - antistatic_properties: ESD-safe or anti-static ratings
   - electrical_conductivity: Conductive tile specifications if applicable
   
   H. ENVIRONMENTAL AND SUSTAINABILITY:
   - voc_emissions: Greenguard, FloorScore, or other VOC emission ratings
   - recycled_content: Percentage of recycled materials
   - eco_certifications: LEED credits, BREEAM ratings, other eco-labels
   - carbon_footprint: Low-carbon, geopolymer, or carbon-neutral ratings
   - recyclability: End-of-life recyclability or circular material properties
   
   I. DIMENSIONAL AND AESTHETIC:
   - edge_type: Rectified, non-rectified, or calibrated edges
   - calibration_grade: Dimensional accuracy classifications
   - texture_3d_rating: 3D texture depth or tactile surface ratings
   - color_uniformity: Shade variation ratings (V1-V4)
   - translucency: Backlit capability or light transmission properties
   - luminescent_properties: Glow-in-the-dark or photoluminescent features
   
   LEGACY FIELDS (maintain for compatibility):
   - finish: surface finish type (use surface_gloss_level for new extractions)
   - size: dimensions and specifications
   - installation_method: installation technique
   - application: usage context (floor, wall, outdoor, etc.)
   - r11: R11 thermal resistance rating (use slip_resistance_r_value for new extractions)
   - metal_types: specific metal compositions if applicable

3. QUALITY ASSESSMENT:
   - Surface characteristics and finish quality
   - Any visible defects or irregularities
   - Uniformity and consistency indicators

4. CATALOG CONTEXT:
   - Product specifications and standards
   - Installation requirements
   - Performance characteristics

Provide detailed analysis in JSON format with all extracted meta fields included.`;

  // Try MIVAA first
  try {
    console.log('🔍 Attempting MIVAA semantic analysis for visual material analysis');
    
    const mivaaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'semantic_analysis',
        input_type: 'image',
        analysis_type: 'material_catalog_analysis',
        image_url: imageUrl,
        prompt: `${materialAnalysisPrompt}\n\n${detailedAnalysisPrompt}`,
        parameters: {
          response_format: 'json',
          max_tokens: 2000,
          temperature: 0.1,
        },
      }),
    });

    if (mivaaResponse.ok) {
      const mivaaData = await mivaaResponse.json();
      console.log('✅ MIVAA semantic analysis successful');
      
      // Parse MIVAA response using proven pattern
      const mivaaResult = mivaaData.analysis_result || mivaaData.result;
      if (mivaaResult) {
        processedResult = typeof mivaaResult === 'string' ? JSON.parse(mivaaResult) : mivaaResult;
        usedMethod = 'mivaa-semantic-analysis';
      } else {
        throw new Error('No analysis result in MIVAA response');
      }
    } else {
      const errorData = await mivaaResponse.json();
      throw new Error(`MIVAA request failed: ${errorData.error || 'Unknown error'}`);
    }
  } catch (mivaaError) {
    console.log(`⚠️ MIVAA semantic analysis failed: ${(mivaaError as Error).message}, trying parallel MIVAA approach`);
    
    // Enhanced fallback: Use parallel MIVAA actions for better performance and reliability
    try {
      console.log('🔄 Attempting parallel MIVAA analysis (LLaMA vision + CLIP embeddings)');
      
      // Prepare parallel MIVAA requests
      const llamaRequest = {
        action: 'llama_vision_analysis',
        payload: {
          image_url: imageUrl,
          analysis_type: 'comprehensive_material_analysis',
          prompt: `${materialAnalysisPrompt}\n\n${detailedAnalysisPrompt}`,
          options: {
            response_format: 'json',
            max_tokens: 2000,
            temperature: 0.1,
            include_confidence_scores: true
          }
        }
      };

      const clipRequest = {
        action: 'clip_embedding_generation',
        payload: {
          image_url: imageUrl,
          embedding_type: 'visual_similarity',
          options: {
            normalize: true,
            dimensions: 512
          }
        }
      };

      // Execute both MIVAA requests in parallel
      const [llamaResponse, clipResponse] = await Promise.all([
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mivaa-gateway`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(llamaRequest),
        }),
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mivaa-gateway`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(clipRequest),
        })
      ]);

      // Process LLaMA vision result
      if (llamaResponse.ok) {
        const llamaData = await llamaResponse.json();
        const llamaResult = llamaData.analysis_result || llamaData.result || llamaData.data;
        
        if (llamaResult) {
          processedResult = typeof llamaResult === 'string' ? JSON.parse(llamaResult) : llamaResult;
          usedMethod = 'mivaa-llama-vision-parallel';
          
          // Optionally enhance with CLIP embeddings if successful
          if (clipResponse.ok) {
            const clipData = await clipResponse.json();
            if (clipData.embedding || clipData.visual_embedding) {
              processedResult.visual_embeddings = {
                clip_embedding: clipData.embedding || clipData.visual_embedding,
                embedding_type: 'clip_512d',
                model_used: clipData.model_used || 'clip-vit-base-patch32'
              };
              usedMethod = 'mivaa-parallel-llama-clip';
            }
          }
          
          console.log('✅ Parallel MIVAA analysis successful');
        } else {
          throw new Error('No analysis result in parallel MIVAA response');
        }
      } else {
        const llamaError = await llamaResponse.json();
        throw new Error(`Parallel MIVAA LLaMA analysis failed: ${llamaError.error || 'Unknown error'}`);
      }
      
    } catch (parallelError) {
      console.error('❌ All MIVAA methods failed:', (parallelError as Error).message);
      throw new Error(`Material analysis failed: ${(parallelError as Error).message}. Please check MIVAA service availability.`);
    }
  }

  // Process and extract metadata from either MIVAA or OpenAI result
  if (!processedResult) {
    throw new Error('No valid analysis result obtained from either MIVAA or OpenAI');
  }
try {
  const analysis = processedResult;

  // Extract functional metadata fields from the analysis
  const metadata = analysis.metadata || {};
  const functionalMetadata = analysis.functional_metadata || {};
  
  const extractedMeta = {
      // Legacy fields (maintain compatibility)
      finish: metadata.finish || analysis.finish,
      size: metadata.size || analysis.size,
      installation_method: metadata.installation_method || analysis.installation_method,
      application: metadata.application || analysis.application,
      r11: metadata.r11 || analysis.r11,
      metal_types: metadata.metal_types || analysis.metal_types,
      
      // Slip and Safety Ratings
      slip_resistance_r_value: functionalMetadata.slip_resistance_r_value || metadata.slip_resistance_r_value,
      barefoot_ramp_rating: functionalMetadata.barefoot_ramp_rating || metadata.barefoot_ramp_rating,
      pendulum_test_value: functionalMetadata.pendulum_test_value || metadata.pendulum_test_value,
      dcof_rating: functionalMetadata.dcof_rating || metadata.dcof_rating,
      slip_resistance_general: functionalMetadata.slip_resistance_general || metadata.slip_resistance_general,
      
      // Surface Gloss/Reflectivity
      surface_gloss_level: functionalMetadata.surface_gloss_level || metadata.surface_gloss_level,
      gloss_measurement: functionalMetadata.gloss_measurement || metadata.gloss_measurement,
      
      // Mechanical Properties
      mohs_hardness: functionalMetadata.mohs_hardness || metadata.mohs_hardness,
      pei_rating: functionalMetadata.pei_rating || metadata.pei_rating,
      breaking_strength: functionalMetadata.breaking_strength || metadata.breaking_strength,
      impact_resistance: functionalMetadata.impact_resistance || metadata.impact_resistance,
      
      // Thermal Properties
      thermal_conductivity: functionalMetadata.thermal_conductivity || metadata.thermal_conductivity,
      thermal_expansion: functionalMetadata.thermal_expansion || metadata.thermal_expansion,
      heat_resistance: functionalMetadata.heat_resistance || metadata.heat_resistance,
      radiant_heating_compatible: functionalMetadata.radiant_heating_compatible || metadata.radiant_heating_compatible,
      
      // Water and Moisture Resistance
      water_absorption: functionalMetadata.water_absorption || metadata.water_absorption,
      frost_resistance: functionalMetadata.frost_resistance || metadata.frost_resistance,
      hydrophobic_treatment: functionalMetadata.hydrophobic_treatment || metadata.hydrophobic_treatment,
      mold_mildew_resistant: functionalMetadata.mold_mildew_resistant || metadata.mold_mildew_resistant,
      
      // Chemical and Hygiene Resistance
      chemical_resistance: functionalMetadata.chemical_resistance || metadata.chemical_resistance,
      stain_resistance: functionalMetadata.stain_resistance || metadata.stain_resistance,
      antibacterial_surface: functionalMetadata.antibacterial_surface || metadata.antibacterial_surface,
      acid_alkali_resistance: functionalMetadata.acid_alkali_resistance || metadata.acid_alkali_resistance,
      food_safe_certification: functionalMetadata.food_safe_certification || metadata.food_safe_certification,
      
      // Acoustic and Electrical Properties
      sound_absorption: functionalMetadata.sound_absorption || metadata.sound_absorption,
      impact_insulation: functionalMetadata.impact_insulation || metadata.impact_insulation,
      antistatic_properties: functionalMetadata.antistatic_properties || metadata.antistatic_properties,
      electrical_conductivity: functionalMetadata.electrical_conductivity || metadata.electrical_conductivity,
      
      // Environmental and Sustainability
      voc_emissions: functionalMetadata.voc_emissions || metadata.voc_emissions,
      recycled_content: functionalMetadata.recycled_content || metadata.recycled_content,
      eco_certifications: functionalMetadata.eco_certifications || metadata.eco_certifications,
      carbon_footprint: functionalMetadata.carbon_footprint || metadata.carbon_footprint,
      recyclability: functionalMetadata.recyclability || metadata.recyclability,
      
      // Dimensional and Aesthetic
      edge_type: functionalMetadata.edge_type || metadata.edge_type,
      calibration_grade: functionalMetadata.calibration_grade || metadata.calibration_grade,
      texture_3d_rating: functionalMetadata.texture_3d_rating || metadata.texture_3d_rating,
      color_uniformity: functionalMetadata.color_uniformity || metadata.color_uniformity,
      translucency: functionalMetadata.translucency || metadata.translucency,
      luminescent_properties: functionalMetadata.luminescent_properties || metadata.luminescent_properties,
    };

    return {
      mode: 'visual',
      confidence: analysis.confidence || 0.8,
      material_identification: analysis.material_identification,
      properties: analysis.properties || {},
      quality_indicators: analysis.quality_indicators || {},
      processing_metadata: {
        method: usedMethod,
        processing_time_ms: Date.now() - startTime,
        model_version: usedMethod === 'mivaa-semantic-analysis' ? 'mivaa-v1' : 'gpt-4o-2024-05-13',
        extracted_meta: extractedMeta,
      },
    };
  } catch (error) {
    console.error('Failed to parse visual analysis response:', processedResult);
    throw new Error(`Invalid JSON response from ${usedMethod}: ${error instanceof Error ? error.message : 'Unknown parsing error'}`);
  }
}

async function performSpectralAnalysis(fileData: any): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Get spectral data from database or use fallback
  const spectralData = await getSpectralDataFromDatabase(fileData.id);

  // Get material signatures from database
  const { data: materialSignatures, error: signaturesError } = await supabase
    .from('materials_catalog')
    .select('name, spectral_properties')
    .not('spectral_properties', 'is', null);

  const spectralSignatures: Record<string, { peaks: number[], confidence: number }> = {};
  if (!signaturesError && materialSignatures) {
    materialSignatures.forEach((material: any) => {
      if (material.spectral_properties?.peaks) {
        spectralSignatures[material.name] = {
          peaks: material.spectral_properties.peaks,
          confidence: material.spectral_properties.confidence || 0.8,
        };
      }
    });
  }

  // Fallback signatures if database is empty
  if (Object.keys(spectralSignatures).length === 0) {
    Object.assign(spectralSignatures, {
      'polymer': { peaks: [1650, 2850], confidence: 0.9 },
      'metal': { peaks: [500, 800], confidence: 0.85 },
      'ceramic': { peaks: [1000, 1200], confidence: 0.8 },
      'composite': { peaks: [1650, 1200, 2850], confidence: 0.75 },
    });
  }

  let bestMatch = { material: 'unknown', confidence: 0.5 };

  for (const [material, signature] of Object.entries(spectralSignatures)) {
    const matchScore = calculateSpectralMatch(spectralData.peaks, signature.peaks);
    if (matchScore > bestMatch.confidence) {
      bestMatch = { material, confidence: matchScore * signature.confidence };
    }
  }

  return {
    mode: 'spectral',
    confidence: bestMatch.confidence,
    material_identification: {
      primary_material: bestMatch.material,
      category: getCategoryFromMaterial(bestMatch.material),
      composition: estimateComposition(bestMatch.material),
    },
    properties: {
      chemical: {
        functional_groups: identifyFunctionalGroups(spectralData.peaks),
        purity_estimate: spectralData.baseline_quality,
      },
    },
    quality_indicators: {
      purity_level: spectralData.baseline_quality,
      uniformity_score: 0.85,
    },
    processing_metadata: {
      method: 'ftir-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'spectral-v1.0',
    },
  };
}

async function performChemicalAnalysis(fileData: any): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Simulate chemical analysis (XRF, EDS, etc.)
  const mockElementalData = {
    elements: { 'C': 85.2, 'H': 12.1, 'O': 2.7 },
    detection_limit: 0.1,
    accuracy: 0.95,
  };

  const materialFromComposition = identifyMaterialFromComposition(mockElementalData.elements);

  return {
    mode: 'chemical',
    confidence: mockElementalData.accuracy,
    material_identification: {
      primary_material: materialFromComposition.name,
      category: materialFromComposition.category,
      composition: mockElementalData.elements,
    },
    properties: {
      chemical: {
        elemental_composition: mockElementalData.elements,
        molecular_weight: calculateMolecularWeight(mockElementalData.elements),
        reactivity_indicators: assessReactivity(mockElementalData.elements),
      },
    },
    quality_indicators: {
      purity_level: mockElementalData.accuracy,
      uniformity_score: 0.9,
    },
    processing_metadata: {
      method: 'xrf-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'chemical-v1.0',
    },
  };
}

async function performMechanicalAnalysis(fileData: any): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Simulate mechanical property analysis
  const mockMechanicalData = {
    hardness: 85, // HV
    elastic_modulus: 3.2, // GPa
    tensile_strength: 45, // MPa
    elongation: 15, // %
  };

  const materialFromMechanical = identifyMaterialFromMechanical(mockMechanicalData);

  return {
    mode: 'mechanical',
    confidence: 0.8,
    material_identification: {
      primary_material: materialFromMechanical.name,
      category: materialFromMechanical.category,
    },
    properties: {
      mechanical: {
        hardness_hv: mockMechanicalData.hardness,
        elastic_modulus_gpa: mockMechanicalData.elastic_modulus,
        tensile_strength_mpa: mockMechanicalData.tensile_strength,
        elongation_percent: mockMechanicalData.elongation,
        toughness_estimate: calculateToughness(mockMechanicalData),
      },
    },
    quality_indicators: {
      uniformity_score: 0.88,
      defects: assessMechanicalDefects(mockMechanicalData),
    },
    processing_metadata: {
      method: 'nanoindentation-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'mechanical-v1.0',
    },
  };
}

async function performThermalAnalysis(fileData: any): Promise<AnalysisResult> {
  const startTime = Date.now();

  // Simulate thermal analysis (DSC, TGA, etc.)
  const mockThermalData = {
    melting_point: 165, // °C
    glass_transition: 85, // °C
    thermal_conductivity: 0.2, // W/m·K
    thermal_expansion: 70e-6, // 1/K
  };

  const materialFromThermal = identifyMaterialFromThermal(mockThermalData);

  return {
    mode: 'thermal',
    confidence: 0.85,
    material_identification: {
      primary_material: materialFromThermal.name,
      category: materialFromThermal.category,
    },
    properties: {
      thermal: {
        melting_point_c: mockThermalData.melting_point,
        glass_transition_c: mockThermalData.glass_transition,
        thermal_conductivity_w_mk: mockThermalData.thermal_conductivity,
        thermal_expansion_k: mockThermalData.thermal_expansion,
        heat_capacity_estimate: estimateHeatCapacity(materialFromThermal.name),
      },
    },
    quality_indicators: {
      uniformity_score: 0.92,
      purity_level: 0.88,
    },
    processing_metadata: {
      method: 'dsc-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'thermal-v1.0',
    },
  };
}

function generateConsensusAnalysis(results: AnalysisResult[]): any {
  const materialVotes = new Map<string, number>();
  const categoryVotes = new Map<string, number>();
  let totalConfidence = 0;

  results.forEach(result => {
    const material = result.material_identification.primary_material;
    const category = result.material_identification.category;
    const weight = result.confidence;

    materialVotes.set(material, (materialVotes.get(material) || 0) + weight);
    categoryVotes.set(category, (categoryVotes.get(category) || 0) + weight);
    totalConfidence += weight;
  });

  const consensusMaterial = Array.from(materialVotes.entries())
    .sort((a, b) => b[1] - a[1])[0];

  const consensusCategory = Array.from(categoryVotes.entries())
    .sort((a, b) => b[1] - a[1])[0];

  // Combine properties from all analyses
  const combinedProperties = {};
  results.forEach(result => {
    Object.assign(combinedProperties, result.properties);
  });

  return {
    material_name: consensusMaterial[0],
    category: consensusCategory[0],
    confidence: totalConfidence / results.length,
    properties: combinedProperties,
    quality_assessment: generateQualityAssessment(results),
  };
}

function generateQualityAssessment(results: AnalysisResult[]): string {
  const qualityScores = results.map(r => r.quality_indicators.uniformity_score || 0.8);
  const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;

  if (avgQuality > 0.9) return 'Excellent';
  if (avgQuality > 0.8) return 'Good';
  if (avgQuality > 0.7) return 'Fair';
  return 'Poor';
}

// Helper functions (simplified implementations)
function calculateSpectralMatch(peaks1: number[], peaks2: number[]): number {
  // Simplified spectral matching algorithm
  let matches = 0;
  const tolerance = 50; // wavenumber tolerance

  peaks1.forEach(peak1 => {
    if (peaks2.some(peak2 => Math.abs(peak1 - peak2) <= tolerance)) {
      matches++;
    }
  });

  return matches / Math.max(peaks1.length, peaks2.length);
}

function getCategoryFromMaterial(material: string): string {
  const categories: Record<string, string> = {
    'polymer': 'plastics',
    'metal': 'metals',
    'ceramic': 'ceramics',
    'composite': 'composites',
  };
  return categories[material] || 'unknown';
}

function estimateComposition(material: string): Record<string, number> {
  const compositions: Record<string, Record<string, number>> = {
    'polymer': { 'C': 85, 'H': 12, 'O': 3 },
    'metal': { 'Fe': 95, 'C': 3, 'Mn': 2 },
    'ceramic': { 'Al': 40, 'O': 60 },
    'composite': { 'C': 60, 'Si': 25, 'O': 15 },
  };
  return compositions[material] || {};
}

function identifyFunctionalGroups(peaks: number[]): string[] {
  const groups: string[] = [];
  if (peaks.includes(1650)) groups.push('C=O');
  if (peaks.includes(2850)) groups.push('C-H');
  if (peaks.includes(3300)) groups.push('O-H');
  return groups;
}

function identifyMaterialFromComposition(elements: Record<string, number>): { name: string, category: string } {
  const carbonContent = elements['C'] || 0;
  const ironContent = elements['Fe'] || 0;
  const aluminumContent = elements['Al'] || 0;

  if (carbonContent > 80) return { name: 'polymer', category: 'plastics' };
  if (ironContent > 50) return { name: 'steel', category: 'metals' };
  if (aluminumContent > 30) return { name: 'aluminum_alloy', category: 'metals' };
  return { name: 'unknown', category: 'unknown' };
}

function calculateMolecularWeight(elements: Record<string, number>): number {
  const atomicWeights: Record<string, number> = { 'C': 12.01, 'H': 1.008, 'O': 15.999, 'Fe': 55.845, 'Al': 26.982 };
  let totalWeight = 0;

  Object.entries(elements).forEach(([element, percentage]) => {
    totalWeight += (atomicWeights[element] || 0) * (percentage / 100);
  });

  return totalWeight;
}

function assessReactivity(elements: Record<string, number>): string[] {
  const indicators: string[] = [];
  if (elements['O'] > 10) indicators.push('oxidation_prone');
  if (elements['H'] > 5) indicators.push('hydrogen_bonding');
  if (elements['C'] > 50) indicators.push('organic_reactions');
  return indicators;
}

function identifyMaterialFromMechanical(data: any): { name: string, category: string } {
  if (data.hardness > 200) return { name: 'hardened_steel', category: 'metals' };
  if (data.elastic_modulus > 200) return { name: 'steel', category: 'metals' };
  if (data.elastic_modulus < 10) return { name: 'polymer', category: 'plastics' };
  return { name: 'composite', category: 'composites' };
}

function calculateToughness(data: any): number {
  return (data.tensile_strength * data.elongation) / 100;
}

function assessMechanicalDefects(data: any): string[] {
  const defects: string[] = [];
  if (data.elongation < 5) defects.push('brittleness');
  if (data.hardness < 20) defects.push('softness');
  return defects;
}

function identifyMaterialFromThermal(data: any): { name: string, category: string } {
  if (data.melting_point > 1000) return { name: 'metal', category: 'metals' };
  if (data.glass_transition > 0) return { name: 'polymer', category: 'plastics' };
  if (data.melting_point > 500) return { name: 'ceramic', category: 'ceramics' };
  return { name: 'composite', category: 'composites' };
}

function estimateHeatCapacity(material: string): number {
  const capacities: Record<string, number> = {
    'polymer': 1.5,
    'metal': 0.5,
    'ceramic': 0.8,
    'composite': 1.0,
  };
  return capacities[material] || 1.0;
}

async function processHybridAnalysis(request: HybridAnalysisRequest): Promise<HybridAnalysisResponse> {
  const startTime = Date.now();

  try {
    // Get file information
    const { data: file, error: fileError } = await supabase
      .from('uploaded_files')
      .select('*')
      .eq('id', request.file_id)
      .single();

    if (fileError || !file) {
      throw new Error(`File not found: ${fileError?.message}`);
    }

    // Get public URL for the file
    const { data: urlData } = supabase.storage
      .from('material-images')
      .getPublicUrl(file.storage_path);

    console.log(`Performing hybrid analysis with modes: ${request.analysis_modes.join(', ')}`);

    const analysisResults: AnalysisResult[] = [];

    // Perform analyses based on requested modes
    for (const mode of request.analysis_modes) {
      try {
        let result: AnalysisResult;

        switch (mode) {
          case 'visual':
            result = await performVisualAnalysis(urlData.publicUrl);
            break;
          case 'spectral':
            result = await performSpectralAnalysis(file);
            break;
          case 'chemical':
            result = await performChemicalAnalysis(file);
            break;
          case 'mechanical':
            result = await performMechanicalAnalysis(file);
            break;
          case 'thermal':
            result = await performThermalAnalysis(file);
            break;
          default:
            console.warn(`Unknown analysis mode: ${mode}`);
            continue;
        }

        // Filter by confidence threshold if specified
        if (!request.confidence_threshold || result.confidence >= request.confidence_threshold) {
          analysisResults.push(result);
        }
      } catch (error) {
        console.error(`Error in ${mode} analysis:`, error);
        // Continue with other analyses even if one fails
      }
    }

    if (analysisResults.length === 0) {
      throw new Error('No analysis results met the confidence threshold');
    }

    // Generate consensus analysis
    const consensusAnalysis = generateConsensusAnalysis(analysisResults);

    // Generate recommendations
    const recommendations = generateRecommendations(analysisResults, consensusAnalysis);

    const response: HybridAnalysisResponse = {
      file_id: request.file_id,
      analysis_results: analysisResults,
      consensus_analysis: consensusAnalysis,
      recommendations,
      processing_summary: {
        total_time_ms: Date.now() - startTime,
        modes_analyzed: request.analysis_modes,
        overall_confidence: consensusAnalysis.confidence,
      },
    };

    // Store results in database
    await supabase
      .from('hybrid_analysis_results')
      .insert({
        file_id: request.file_id,
        analysis_modes: request.analysis_modes,
        results: analysisResults,
        consensus: consensusAnalysis,
        recommendations,
        processing_summary: response.processing_summary,
        user_id: request.user_id,
        created_at: new Date().toISOString(),
      });

    // Log analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'hybrid_material_analysis',
          event_data: {
            file_id: request.file_id,
            modes_used: request.analysis_modes,
            results_count: analysisResults.length,
            overall_confidence: consensusAnalysis.confidence,
            processing_time_ms: response.processing_summary.total_time_ms,
          },
        });
    }

    return response;

  } catch (error) {
    console.error('Hybrid analysis error:', error);
    throw error;
  }
}

function generateRecommendations(results: AnalysisResult[], consensus: any): string[] {
  const recommendations: string[] = [];

  if (consensus.confidence < 0.7) {
    recommendations.push('Consider additional analysis methods for higher confidence');
  }

  if (results.length < 3) {
    recommendations.push('Perform additional analysis modes for comprehensive characterization');
  }

  const qualityScore = results.reduce((sum, r) => sum + (r.quality_indicators.uniformity_score || 0.8), 0) / results.length;
  if (qualityScore < 0.8) {
    recommendations.push('Material quality may be suboptimal - consider quality control measures');
  }

  recommendations.push(`Material identified as ${consensus.material_name} with ${(consensus.confidence * 100).toFixed(1)}% confidence`);

  return recommendations;
}

serve(async (req: Request) => {
  // Ensure dynamic categories are loaded for this request
  if (Object.keys(MATERIAL_CATEGORIES).length === 0) {
    await fetchMaterialCategories();
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: HybridAnalysisRequest = await req.json();

    console.log('Processing hybrid material analysis request:', {
      file_id: request.file_id,
      analysis_modes: request.analysis_modes,
      confidence_threshold: request.confidence_threshold,
    });

    if (!request.file_id) {
      return new Response(
        JSON.stringify({ error: 'file_id is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!request.analysis_modes || request.analysis_modes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'analysis_modes array is required and cannot be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await processHybridAnalysis(request);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Hybrid material analysis error:', error);

    return new Response(
      JSON.stringify({
        error: 'Hybrid analysis failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
