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

interface ExtractionRequest {
  source_type: 'document' | 'image' | 'url' | 'text';
  source_data: string; // file_id, image_url, url, or raw text
  extraction_focus: 'materials' | 'properties' | 'processes' | 'standards' | 'comprehensive';
  include_relationships: boolean;
  confidence_threshold?: number;
  user_id?: string;
}

interface MaterialKnowledge {
  materials: {
    name: string;
    category: string;
    confidence: number;
    properties: Record<string, any>;
    applications: string[];
    standards: string[];
  }[];
  processes: {
    name: string;
    type: string;
    parameters: Record<string, any>;
    materials_involved: string[];
    confidence: number;
  }[];
  properties: {
    property_name: string;
    value: string | number;
    unit?: string;
    material: string;
    confidence: number;
  }[];
  standards: {
    standard_id: string;
    organization: string;
    title: string;
    relevance: string;
    confidence: number;
  }[];
  relationships: {
    type: 'material_property' | 'material_process' | 'process_standard' | 'material_application';
    source: string;
    target: string;
    relationship: string;
    confidence: number;
  }[];
  metadata: {
    extraction_method: string;
    processing_time_ms: number;
    source_type: string;
    confidence_score: number;
  };
}

async function extractFromText(text: string, focus: string): Promise<MaterialKnowledge> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompts = {
    materials: `Extract material information from this text. Focus on identifying:
    - Material names and categories
    - Material properties and characteristics
    - Applications and use cases
    - Relevant standards
    
    Respond with structured JSON matching the MaterialKnowledge interface.`,
    
    properties: `Extract material properties from this text. Focus on:
    - Physical properties (density, strength, thermal, electrical)
    - Mechanical properties (elasticity, hardness, toughness)
    - Chemical properties (composition, reactivity)
    - Property values with units where available
    
    Respond with structured JSON.`,
    
    processes: `Extract manufacturing and processing information from this text. Focus on:
    - Process names and types
    - Process parameters and conditions
    - Materials involved in processes
    - Quality standards and specifications
    
    Respond with structured JSON.`,
    
    standards: `Extract standards and specifications from this text. Focus on:
    - Standard identifiers (ASTM, ISO, ANSI, etc.)
    - Standard titles and descriptions
    - Relevant organizations
    - Application contexts
    
    Respond with structured JSON.`,
    
    comprehensive: `Perform comprehensive material knowledge extraction from this text. Extract:
    1. All materials mentioned with their categories and properties
    2. Manufacturing processes and their parameters
    3. Material properties with values and units
    4. Relevant standards and specifications
    5. Relationships between materials, processes, and standards
    
    Provide detailed structured JSON response matching the MaterialKnowledge interface.`
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
          content: `You are an expert materials engineer and knowledge extraction specialist. Extract structured material knowledge from technical content. Always respond with valid JSON matching the MaterialKnowledge interface. Include confidence scores (0-1) for all extracted information.`
        },
        {
          role: 'user',
          content: `${prompts[focus] || prompts.comprehensive}\n\nText to analyze:\n${text}`
        }
      ],
      max_tokens: 3000,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const extractionText = data.choices[0].message.content;
  
  try {
    return JSON.parse(extractionText);
  } catch (error) {
    console.error('Failed to parse OpenAI response:', extractionText);
    throw new Error('Invalid JSON response from OpenAI');
  }
}

async function extractFromImage(imageUrl: string, focus: string): Promise<MaterialKnowledge> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompts = {
    materials: `Analyze this image to identify materials. Look for:
    - Material types and categories visible
    - Surface characteristics and textures
    - Color, finish, and appearance indicators
    - Any visible labels or markings
    
    Extract material knowledge in JSON format.`,
    
    properties: `Analyze this image to identify material properties. Look for:
    - Visual indicators of material properties
    - Surface finish and texture characteristics
    - Structural features and patterns
    - Any measurement data or property indicators
    
    Extract property information in JSON format.`,
    
    comprehensive: `Perform comprehensive material analysis of this image. Extract:
    1. All visible materials and their characteristics
    2. Observable material properties
    3. Manufacturing processes evident from the image
    4. Any visible standards, labels, or specifications
    5. Relationships between different materials shown
    
    Provide detailed JSON response.`
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
          content: `You are an expert materials scientist specializing in visual material analysis. Extract material knowledge from images with high accuracy. Always respond with valid JSON matching the MaterialKnowledge interface.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompts[focus] || prompts.comprehensive
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
      max_tokens: 2000,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI Vision API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const extractionText = data.choices[0].message.content;
  
  try {
    return JSON.parse(extractionText);
  } catch (error) {
    console.error('Failed to parse OpenAI Vision response:', extractionText);
    throw new Error('Invalid JSON response from OpenAI Vision');
  }
}

async function extractFromDocument(fileId: string, focus: string): Promise<MaterialKnowledge> {
  // Get document content from database
  const { data: document, error } = await supabase
    .from('documents')
    .select('content, title, document_type')
    .eq('id', fileId)
    .single();

  if (error || !document) {
    throw new Error(`Document not found: ${error?.message}`);
  }

  // Extract from document content
  return await extractFromText(document.content, focus);
}

async function extractFromUrl(url: string, focus: string): Promise<MaterialKnowledge> {
  try {
    // Fetch content from URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }
    
    const content = await response.text();
    
    // Simple text extraction (in production, you might want to use a proper HTML parser)
    const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    return await extractFromText(textContent, focus);
  } catch (error) {
    throw new Error(`URL extraction failed: ${error.message}`);
  }
}

async function storeExtractedKnowledge(knowledge: MaterialKnowledge, request: ExtractionRequest) {
  const { data, error } = await supabase
    .from('material_knowledge_extractions')
    .insert({
      source_type: request.source_type,
      source_data: request.source_data,
      extraction_focus: request.extraction_focus,
      materials: knowledge.materials,
      processes: knowledge.processes,
      properties: knowledge.properties,
      standards: knowledge.standards,
      relationships: knowledge.relationships,
      metadata: knowledge.metadata,
      user_id: request.user_id,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error storing extracted knowledge:', error);
    throw new Error(`Failed to store extraction: ${error.message}`);
  }

  return data;
}

async function processKnowledgeExtraction(request: ExtractionRequest): Promise<any> {
  const startTime = Date.now();
  
  try {
    console.log(`Extracting ${request.extraction_focus} knowledge from ${request.source_type}`);
    
    let knowledge: MaterialKnowledge;
    
    switch (request.source_type) {
      case 'text':
        knowledge = await extractFromText(request.source_data, request.extraction_focus);
        break;
        
      case 'document':
        knowledge = await extractFromDocument(request.source_data, request.extraction_focus);
        break;
        
      case 'image':
        knowledge = await extractFromImage(request.source_data, request.extraction_focus);
        break;
        
      case 'url':
        knowledge = await extractFromUrl(request.source_data, request.extraction_focus);
        break;
        
      default:
        throw new Error(`Unsupported source type: ${request.source_type}`);
    }

    // Add metadata
    knowledge.metadata = {
      extraction_method: 'gpt-4o-vision',
      processing_time_ms: Date.now() - startTime,
      source_type: request.source_type,
      confidence_score: calculateOverallConfidence(knowledge)
    };

    // Filter by confidence threshold if specified
    if (request.confidence_threshold) {
      knowledge = filterByConfidence(knowledge, request.confidence_threshold);
    }

    // Store the extracted knowledge
    const storedExtraction = await storeExtractedKnowledge(knowledge, request);

    // Log analytics
    if (request.user_id) {
      await supabase
        .from('analytics_events')
        .insert({
          user_id: request.user_id,
          event_type: 'material_knowledge_extraction',
          event_data: {
            extraction_id: storedExtraction.id,
            source_type: request.source_type,
            extraction_focus: request.extraction_focus,
            materials_count: knowledge.materials.length,
            processes_count: knowledge.processes.length,
            properties_count: knowledge.properties.length,
            standards_count: knowledge.standards.length,
            overall_confidence: knowledge.metadata.confidence_score,
            processing_time_ms: knowledge.metadata.processing_time_ms
          }
        });
    }

    return {
      success: true,
      extraction_id: storedExtraction.id,
      knowledge,
      processing_time_ms: knowledge.metadata.processing_time_ms
    };

  } catch (error) {
    console.error('Knowledge extraction error:', error);
    throw error;
  }
}

function calculateOverallConfidence(knowledge: MaterialKnowledge): number {
  const allConfidences = [
    ...knowledge.materials.map(m => m.confidence),
    ...knowledge.processes.map(p => p.confidence),
    ...knowledge.properties.map(p => p.confidence),
    ...knowledge.standards.map(s => s.confidence),
    ...knowledge.relationships.map(r => r.confidence)
  ];

  return allConfidences.length > 0 ? 
    allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length : 0;
}

function filterByConfidence(knowledge: MaterialKnowledge, threshold: number): MaterialKnowledge {
  return {
    ...knowledge,
    materials: knowledge.materials.filter(m => m.confidence >= threshold),
    processes: knowledge.processes.filter(p => p.confidence >= threshold),
    properties: knowledge.properties.filter(p => p.confidence >= threshold),
    standards: knowledge.standards.filter(s => s.confidence >= threshold),
    relationships: knowledge.relationships.filter(r => r.confidence >= threshold)
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ExtractionRequest = await req.json();
    
    console.log('Processing material knowledge extraction request:', {
      source_type: request.source_type,
      extraction_focus: request.extraction_focus,
      include_relationships: request.include_relationships
    });

    if (!request.source_data || request.source_data.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'source_data is required and cannot be empty' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!['document', 'image', 'url', 'text'].includes(request.source_type)) {
      return new Response(
        JSON.stringify({ error: 'source_type must be one of: document, image, url, text' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await processKnowledgeExtraction(request);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Material knowledge extraction error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Knowledge extraction failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});