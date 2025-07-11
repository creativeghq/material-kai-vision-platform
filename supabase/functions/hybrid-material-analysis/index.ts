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

interface ValidationResult {
  score: number; // 0-1
  confidence: number;
  reasoning: string;
  issues: string[];
  suggestions: string[];
}

interface MaterialAnalysisResponse {
  material_name: string;
  category: string;
  confidence: number;
  properties: Record<string, any>;
  chemical_composition?: Record<string, any>;
  safety_considerations?: string[];
  standards?: string[];
}

interface HybridRequest {
  file_id: string;
  analysis_type: 'comprehensive' | 'quick' | 'properties_only';
  include_similar: boolean;
  minimum_score?: number;
  max_retries?: number;
}

interface HybridResponse {
  success: boolean;
  data: any;
  provider: string;
  attempts: Array<{
    provider: string;
    success: boolean;
    score?: number;
    error?: string;
    processing_time_ms: number;
  }>;
  final_score: number;
  validation: ValidationResult;
  total_processing_time_ms: number;
}

// Response validation
function validateMaterialAnalysis(response: MaterialAnalysisResponse, originalPrompt: string): ValidationResult {
  let score = 1.0;
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check material name quality
  if (!response.material_name || response.material_name.trim().length < 2) {
    score -= 0.3;
    issues.push('Material name missing or too short');
    suggestions.push('Provide specific material identification');
  }

  // Check category validity
  const validCategories = ['metals', 'plastics', 'ceramics', 'composites', 'textiles', 'wood', 'glass', 'rubber', 'concrete', 'other'];
  if (!response.category || !validCategories.includes(response.category)) {
    score -= 0.2;
    issues.push('Invalid or missing material category');
    suggestions.push('Use valid material categories');
  }

  // Check confidence score
  if (response.confidence < 0.6) {
    score -= 0.2;
    issues.push('Low confidence in material identification');
    suggestions.push('Provide more detailed analysis');
  }

  // Check properties completeness
  if (!response.properties || Object.keys(response.properties).length < 2) {
    score -= 0.2;
    issues.push('Insufficient material properties provided');
    suggestions.push('Include density, strength, thermal properties');
  }

  // Check for generic responses
  const genericTerms = ['unknown', 'generic', 'standard', 'typical', 'common'];
  const responseText = JSON.stringify(response).toLowerCase();
  const genericCount = genericTerms.filter(term => responseText.includes(term)).length;
  if (genericCount > 2) {
    score -= 0.1;
    issues.push('Response contains too many generic terms');
    suggestions.push('Provide more specific material details');
  }

  score = Math.max(0, Math.min(1, score));

  return {
    score,
    confidence: response.confidence || 0,
    reasoning: generateReasoning(score, issues),
    issues,
    suggestions
  };
}

function generateReasoning(score: number, issues: string[]): string {
  if (score >= 0.9) {
    return 'Excellent response quality with comprehensive and accurate information';
  } else if (score >= 0.7) {
    return 'Good response quality with minor issues';
  } else if (score >= 0.5) {
    return `Acceptable response quality but has concerns: ${issues.slice(0, 2).join(', ')}`;
  } else if (score >= 0.3) {
    return `Poor response quality with significant issues: ${issues.slice(0, 3).join(', ')}`;
  } else {
    return `Very poor response quality requiring retry: ${issues.join(', ')}`;
  }
}

// OpenAI analysis
async function analyzeWithOpenAI(imageUrl: string, analysisType: string): Promise<MaterialAnalysisResponse> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompts = {
    comprehensive: `Analyze this material image comprehensively. Provide:
    1. Material identification with confidence score (0-1)
    2. Category classification (metals, plastics, ceramics, composites, textiles, wood, glass, rubber, concrete, other)
    3. Physical properties (density, strength, thermal properties)
    4. Chemical composition if identifiable
    5. Safety considerations and handling requirements
    6. Relevant industry standards
    
    Respond in JSON format only.`,
    
    quick: `Quickly identify this material. Provide basic identification, category, and confidence score in JSON format.`,
    
    properties_only: `Focus on identifying the physical and mechanical properties of this material. Respond in JSON format.`
  };

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
          content: 'You are an expert materials scientist with extensive knowledge of material identification, properties, and safety. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompts[analysisType] || prompts.comprehensive
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
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const analysisText = data.choices[0].message.content;
  
  try {
    const analysis = JSON.parse(analysisText);
    
    // Generate embedding for the analysis
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: `${analysis.material_name} ${analysis.category} ${JSON.stringify(analysis.properties)}`
      }),
    });

    const embeddingData = await embeddingResponse.json();
    analysis.embedding = embeddingData.data[0].embedding;
    
    return analysis;
  } catch (error) {
    console.error('Failed to parse OpenAI response:', analysisText);
    throw new Error('Invalid JSON response from OpenAI');
  }
}

// Claude analysis
async function analyzeWithClaude(imageUrl: string, analysisType: string): Promise<MaterialAnalysisResponse> {
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!claudeKey) {
    throw new Error('Claude API key not configured');
  }

  const prompts = {
    comprehensive: `Analyze this material image comprehensively. Provide detailed material identification, category, properties, chemical composition, safety considerations, and standards in JSON format.`,
    quick: `Quickly identify this material with basic properties in JSON format.`,
    properties_only: `Focus on material properties and characteristics in JSON format.`
  };

  // Download and convert image to base64 for Claude
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${claudeKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompts[analysisType] || prompts.comprehensive },
            { 
              type: 'image', 
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
      system: 'You are an expert materials scientist. Respond with valid JSON containing: material_name, category (metals/plastics/ceramics/composites/textiles/wood/glass/rubber/concrete/other), confidence (0-1), properties, chemical_composition, safety_considerations, standards.'
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Claude API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const analysisText = data.content[0].text;
  
  try {
    return JSON.parse(analysisText);
  } catch (error) {
    console.error('Failed to parse Claude response:', analysisText);
    throw new Error('Invalid JSON response from Claude');
  }
}

async function findSimilarMaterials(embedding: number[], limit = 5) {
  const { data, error } = await supabase.rpc('vector_similarity_search', {
    query_embedding: `[${embedding.join(',')}]`,
    match_threshold: 0.7,
    match_count: limit
  });

  if (error) {
    console.error('Error finding similar materials:', error);
    return [];
  }

  return data || [];
}

async function processHybridAnalysis(request: HybridRequest): Promise<HybridResponse> {
  const startTime = Date.now();
  const attempts: HybridResponse['attempts'] = [];
  const minimumScore = request.minimum_score ?? 0.7;
  const maxRetries = request.max_retries ?? 2;

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

  const providers = [
    { name: 'openai', func: analyzeWithOpenAI },
    { name: 'claude', func: analyzeWithClaude }
  ];

  let bestResult: any = null;
  let bestScore = 0;
  let bestValidation: ValidationResult | null = null;

  for (const provider of providers) {
    if (attempts.length >= maxRetries) {
      break;
    }

    const attemptStart = Date.now();
    
    try {
      console.log(`Attempting analysis with ${provider.name}`);
      
      const result = await provider.func(urlData.publicUrl, request.analysis_type);
      const validation = validateMaterialAnalysis(result, `Analyze material image with ${request.analysis_type} approach`);
      const processingTime = Date.now() - attemptStart;

      attempts.push({
        provider: provider.name,
        success: true,
        score: validation.score,
        processing_time_ms: processingTime
      });

      // Check if this is the best result so far
      if (validation.score > bestScore) {
        bestResult = result;
        bestScore = validation.score;
        bestValidation = validation;
      }

      // If score meets minimum threshold, we can stop
      if (validation.score >= minimumScore) {
        console.log(`${provider.name} met minimum score threshold: ${validation.score}`);
        break;
      }

      console.log(`${provider.name} score ${validation.score} below threshold ${minimumScore}, trying next provider`);

    } catch (error) {
      const processingTime = Date.now() - attemptStart;
      
      attempts.push({
        provider: provider.name,
        success: false,
        error: error.message,
        processing_time_ms: processingTime
      });

      console.error(`${provider.name} failed:`, error.message);
    }
  }

  const totalProcessingTime = Date.now() - startTime;

  if (!bestResult || !bestValidation) {
    return {
      success: false,
      data: null,
      provider: 'none',
      attempts,
      final_score: 0,
      validation: {
        score: 0,
        confidence: 0,
        reasoning: 'All providers failed',
        issues: ['All AI providers failed to analyze the material'],
        suggestions: ['Check image quality', 'Verify API keys', 'Try different image']
      },
      total_processing_time_ms: totalProcessingTime
    };
  }

  // Find similar materials if requested and we have embeddings
  let similarMaterials = [];
  if (request.include_similar && bestResult.embedding) {
    similarMaterials = await findSimilarMaterials(bestResult.embedding);
  }

  // Find or create material in catalog
  let materialId = null;
  if (bestResult.confidence > 0.8) {
    const { data: existingMaterial } = await supabase
      .from('materials_catalog')
      .select('id')
      .eq('name', bestResult.material_name)
      .single();

    if (!existingMaterial) {
      // Create new material entry
      const { data: newMaterial, error: createError } = await supabase
        .from('materials_catalog')
        .insert({
          name: bestResult.material_name,
          category: bestResult.category,
          properties: bestResult.properties || {},
          chemical_composition: bestResult.chemical_composition || {},
          safety_data: {
            considerations: bestResult.safety_considerations || [],
            handling_requirements: []
          },
          standards: bestResult.standards || [],
          embedding: bestResult.embedding ? `[${bestResult.embedding.join(',')}]` : null
        })
        .select('id')
        .single();

      if (!createError && newMaterial) {
        materialId = newMaterial.id;
      }
    } else {
      materialId = existingMaterial.id;
    }
  }

  // Store recognition result
  const { data: result, error: resultError } = await supabase
    .from('recognition_results')
    .insert({
      file_id: request.file_id,
      material_id: materialId,
      confidence_score: bestResult.confidence,
      detection_method: 'visual',
      ai_model_version: `hybrid-${attempts.find(a => a.score === bestScore)?.provider || 'unknown'}`,
      properties_detected: bestResult.properties || {},
      processing_time_ms: totalProcessingTime,
      user_verified: false,
      embedding: bestResult.embedding ? `[${bestResult.embedding.join(',')}]` : null
    })
    .select()
    .single();

  if (resultError) {
    console.error('Error storing result:', resultError);
  }

  // Log analytics
  await supabase
    .from('analytics_events')
    .insert({
      user_id: file.user_id,
      event_type: 'hybrid_ai_analysis',
      event_data: {
        file_id: request.file_id,
        result_id: result?.id,
        analysis_type: request.analysis_type,
        final_provider: attempts.find(a => a.score === bestScore)?.provider,
        final_score: bestScore,
        attempts_count: attempts.length,
        processing_time_ms: totalProcessingTime
      }
    });

  return {
    success: true,
    data: {
      result,
      analysis: bestResult,
      similar_materials: similarMaterials
    },
    provider: attempts.find(a => a.score === bestScore)?.provider || 'unknown',
    attempts,
    final_score: bestScore,
    validation: bestValidation,
    total_processing_time_ms: totalProcessingTime
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: HybridRequest = await req.json();
    
    console.log('Processing hybrid AI analysis request:', request);

    if (!request.file_id) {
      return new Response(
        JSON.stringify({ error: 'file_id is required' }),
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