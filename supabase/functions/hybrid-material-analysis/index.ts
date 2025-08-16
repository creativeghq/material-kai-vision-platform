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
      noise_level: 0.05
    };
  }

  return {
    peaks: spectralData.peaks || [1650, 2850, 3300],
    intensities: spectralData.intensities || [0.8, 0.6, 0.9],
    baseline_quality: spectralData.baseline_quality || 0.85,
    noise_level: spectralData.noise_level || 0.05
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
      accuracy: 0.92
    };
  }

  return {
    elements: chemicalData.elemental_composition || { 'C': 85.2, 'H': 12.1, 'O': 2.7 },
    molecular_weight: chemicalData.molecular_weight || 180.5,
    purity: chemicalData.purity_level || 0.90,
    accuracy: chemicalData.accuracy || 0.92
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
      yield_strength: 38
    };
  }

  return {
    hardness: mechanicalData.hardness_hv || 85,
    elastic_modulus: mechanicalData.elastic_modulus_gpa || 3.2,
    tensile_strength: mechanicalData.tensile_strength_mpa || 45,
    elongation: mechanicalData.elongation_percent || 15,
    yield_strength: mechanicalData.yield_strength_mpa || 38
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
      heat_capacity: 1.5
    };
  }

  return {
    melting_point: thermalData.melting_point_c || 165,
    glass_transition: thermalData.glass_transition_c || 85,
    thermal_conductivity: thermalData.thermal_conductivity_w_mk || 0.2,
    thermal_expansion: thermalData.thermal_expansion_k || 65e-6,
    heat_capacity: thermalData.heat_capacity_j_gk || 1.5
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
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const startTime = Date.now();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
          content: `You are an expert materials scientist specializing in visual material analysis. Analyze the image to identify the material, its properties, and quality indicators. Respond with structured JSON matching the AnalysisResult interface.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Perform comprehensive visual analysis of this material. Identify:
              1. Material type and category
              2. Observable physical properties
              3. Surface characteristics and finish quality
              4. Any visible defects or irregularities
              5. Estimated composition if determinable
              
              Provide detailed analysis in JSON format.`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Visual analysis failed: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const analysisText = data.choices[0].message.content;
  
  try {
    const analysis = JSON.parse(analysisText);
    return {
      mode: 'visual',
      confidence: analysis.confidence || 0.8,
      material_identification: analysis.material_identification,
      properties: analysis.properties || {},
      quality_indicators: analysis.quality_indicators || {},
      processing_metadata: {
        method: 'gpt-4o-vision',
        processing_time_ms: Date.now() - startTime,
        model_version: 'gpt-4o-2024-05-13'
      }
    };
  } catch (error) {
    console.error('Failed to parse visual analysis response:', analysisText);
    throw new Error('Invalid JSON response from visual analysis');
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
          confidence: material.spectral_properties.confidence || 0.8
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
      'composite': { peaks: [1650, 1200, 2850], confidence: 0.75 }
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
      composition: estimateComposition(bestMatch.material)
    },
    properties: {
      chemical: {
        functional_groups: identifyFunctionalGroups(spectralData.peaks),
        purity_estimate: spectralData.baseline_quality
      }
    },
    quality_indicators: {
      purity_level: spectralData.baseline_quality,
      uniformity_score: 0.85
    },
    processing_metadata: {
      method: 'ftir-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'spectral-v1.0'
    }
  };
}

async function performChemicalAnalysis(fileData: any): Promise<AnalysisResult> {
  const startTime = Date.now();
  
  // Simulate chemical analysis (XRF, EDS, etc.)
  const mockElementalData = {
    elements: { 'C': 85.2, 'H': 12.1, 'O': 2.7 },
    detection_limit: 0.1,
    accuracy: 0.95
  };

  const materialFromComposition = identifyMaterialFromComposition(mockElementalData.elements);

  return {
    mode: 'chemical',
    confidence: mockElementalData.accuracy,
    material_identification: {
      primary_material: materialFromComposition.name,
      category: materialFromComposition.category,
      composition: mockElementalData.elements
    },
    properties: {
      chemical: {
        elemental_composition: mockElementalData.elements,
        molecular_weight: calculateMolecularWeight(mockElementalData.elements),
        reactivity_indicators: assessReactivity(mockElementalData.elements)
      }
    },
    quality_indicators: {
      purity_level: mockElementalData.accuracy,
      uniformity_score: 0.9
    },
    processing_metadata: {
      method: 'xrf-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'chemical-v1.0'
    }
  };
}

async function performMechanicalAnalysis(fileData: any): Promise<AnalysisResult> {
  const startTime = Date.now();
  
  // Simulate mechanical property analysis
  const mockMechanicalData = {
    hardness: 85, // HV
    elastic_modulus: 3.2, // GPa
    tensile_strength: 45, // MPa
    elongation: 15 // %
  };

  const materialFromMechanical = identifyMaterialFromMechanical(mockMechanicalData);

  return {
    mode: 'mechanical',
    confidence: 0.8,
    material_identification: {
      primary_material: materialFromMechanical.name,
      category: materialFromMechanical.category
    },
    properties: {
      mechanical: {
        hardness_hv: mockMechanicalData.hardness,
        elastic_modulus_gpa: mockMechanicalData.elastic_modulus,
        tensile_strength_mpa: mockMechanicalData.tensile_strength,
        elongation_percent: mockMechanicalData.elongation,
        toughness_estimate: calculateToughness(mockMechanicalData)
      }
    },
    quality_indicators: {
      uniformity_score: 0.88,
      defects: assessMechanicalDefects(mockMechanicalData)
    },
    processing_metadata: {
      method: 'nanoindentation-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'mechanical-v1.0'
    }
  };
}

async function performThermalAnalysis(fileData: any): Promise<AnalysisResult> {
  const startTime = Date.now();
  
  // Simulate thermal analysis (DSC, TGA, etc.)
  const mockThermalData = {
    melting_point: 165, // °C
    glass_transition: 85, // °C
    thermal_conductivity: 0.2, // W/m·K
    thermal_expansion: 70e-6 // 1/K
  };

  const materialFromThermal = identifyMaterialFromThermal(mockThermalData);

  return {
    mode: 'thermal',
    confidence: 0.85,
    material_identification: {
      primary_material: materialFromThermal.name,
      category: materialFromThermal.category
    },
    properties: {
      thermal: {
        melting_point_c: mockThermalData.melting_point,
        glass_transition_c: mockThermalData.glass_transition,
        thermal_conductivity_w_mk: mockThermalData.thermal_conductivity,
        thermal_expansion_k: mockThermalData.thermal_expansion,
        heat_capacity_estimate: estimateHeatCapacity(materialFromThermal.name)
      }
    },
    quality_indicators: {
      uniformity_score: 0.92,
      purity_level: 0.88
    },
    processing_metadata: {
      method: 'dsc-simulation',
      processing_time_ms: Date.now() - startTime,
      model_version: 'thermal-v1.0'
    }
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
    quality_assessment: generateQualityAssessment(results)
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
    'composite': 'composites'
  };
  return categories[material] || 'unknown';
}

function estimateComposition(material: string): Record<string, number> {
  const compositions: Record<string, Record<string, number>> = {
    'polymer': { 'C': 85, 'H': 12, 'O': 3 },
    'metal': { 'Fe': 95, 'C': 3, 'Mn': 2 },
    'ceramic': { 'Al': 40, 'O': 60 },
    'composite': { 'C': 60, 'Si': 25, 'O': 15 }
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
    'composite': 1.0
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
        overall_confidence: consensusAnalysis.confidence
      }
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
        created_at: new Date().toISOString()
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
            processing_time_ms: response.processing_summary.total_time_ms
          }
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: HybridAnalysisRequest = await req.json();
    
    console.log('Processing hybrid material analysis request:', {
      file_id: request.file_id,
      analysis_modes: request.analysis_modes,
      confidence_threshold: request.confidence_threshold
    });

    if (!request.file_id) {
      return new Response(
        JSON.stringify({ error: 'file_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!request.analysis_modes || request.analysis_modes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'analysis_modes array is required and cannot be empty' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await processHybridAnalysis(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Hybrid material analysis error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Hybrid analysis failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});