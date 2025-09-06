import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

import {
  corsHeaders,
  AuthUtils,
  Logger,
  Utils,
  ValidationSchemas,
} from '../_shared/config.ts';

// Import material categories for AI analysis
const MATERIAL_CATEGORIES = {
  CERAMICS: { name: 'ceramics', finish: ['glossy', 'matte', 'semi-gloss', 'textured'], size: ['4x4"', '6x6"', '8x8"', '12x12"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive', 'pressure sensitive adhesive'], application: ['floor', 'wall', 'backsplash', 'shower'] },
  PORCELAIN: { name: 'porcelain', finish: ['polished', 'matte', 'textured', 'glazed'], size: ['12x12"', '18x18"', '24x24"', '30x30"', '36x36"'], installationMethod: ['thinset mortar', 'epoxy adhesive', 'pressure sensitive adhesive'], application: ['floor', 'wall', 'outdoor', 'commercial'] },
  TRAVERTINE: { name: 'travertine', finish: ['honed', 'polished', 'brushed', 'tumbled'], size: ['12x12"', '16x16"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'outdoor', 'pool deck'] },
  MARBLE: { name: 'marble', finish: ['polished', 'honed', 'brushed', 'tumbled'], size: ['12x12"', '16x16"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'countertop', 'vanity'] },
  GRANITE: { name: 'granite', finish: ['polished', 'honed', 'flamed', 'leathered'], size: ['12x12"', '18x18"', '24x24"', '30x30"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'countertop', 'outdoor'] },
  SLATE: { name: 'slate', finish: ['natural cleft', 'honed', 'polished', 'riven'], size: ['12x12"', '16x16"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'roof', 'outdoor'] },
  LIMESTONE: { name: 'limestone', finish: ['honed', 'polished', 'brushed', 'tumbled'], size: ['12x12"', '16x16"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'outdoor', 'pool deck'] },
  QUARTZITE: { name: 'quartzite', finish: ['polished', 'honed', 'leathered', 'brushed'], size: ['12x12"', '18x18"', '24x24"', '30x30"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'countertop', 'outdoor'] },
  SANDSTONE: { name: 'sandstone', finish: ['natural cleft', 'honed', 'polished', 'brushed'], size: ['12x12"', '16x16"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'outdoor', 'fireplace'] },
  ONYX: { name: 'onyx', finish: ['polished', 'honed', 'brushed'], size: ['12x12"', '16x16"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'countertop', 'backsplash'] },
  GLASS: { name: 'glass', finish: ['clear', 'frosted', 'tinted', 'patterned'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['thinset mortar', 'epoxy adhesive', 'silicone'], application: ['floor', 'wall', 'backsplash', 'shower'] },
  MOSAIC: { name: 'mosaic', finish: ['glossy', 'matte', 'mixed'], size: ['1x1"', '2x2"', 'sheets'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'backsplash', 'shower'] },
  METAL: { name: 'metal', finish: ['brushed', 'polished', 'oxidized', 'painted'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['thinset mortar', 'epoxy adhesive', 'mechanical fasteners'], application: ['floor', 'wall', 'backsplash', 'accent'] },
  CONCRETE: { name: 'concrete', finish: ['polished', 'matte', 'textured', 'stained'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'outdoor', 'commercial'] },
  WOOD: { name: 'wood', finish: ['natural', 'stained', 'oiled', 'lacquered'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['floating', 'glue down', 'nail down'], application: ['floor', 'wall', 'accent', 'furniture'] },
  VINYL: { name: 'vinyl', finish: ['matte', 'glossy', 'textured'], size: ['12"', '18"', 'rolls'], installationMethod: ['glue down', 'floating', 'self-adhesive'], application: ['floor', 'wall', 'commercial', 'residential'] },
  LAMINATE: { name: 'laminate', finish: ['matte', 'glossy', 'textured'], size: ['12x12"', '18x18"', 'rolls'], installationMethod: ['floating', 'glue down'], application: ['floor', 'commercial', 'residential'] },
  CARPET: { name: 'carpet', finish: ['loop', 'cut', 'frieze', 'shag'], size: ['rolls', 'tiles'], installationMethod: ['glue down', 'tack strips'], application: ['floor', 'commercial', 'residential'] },
  RUBBER: { name: 'rubber', finish: ['matte', 'textured'], size: ['rolls', 'tiles'], installationMethod: ['glue down', 'self-adhesive'], application: ['floor', 'commercial', 'industrial'] },
  CORK: { name: 'cork', finish: ['natural', 'stained', 'oiled'], size: ['12x12"', '18x18"', 'rolls'], installationMethod: ['glue down', 'floating'], application: ['floor', 'wall', 'acoustic'] },
  BAMBOO: { name: 'bamboo', finish: ['natural', 'stained', 'carbonized'], size: ['12x12"', '18x18"', 'rolls'], installationMethod: ['floating', 'glue down', 'nail down'], application: ['floor', 'wall', 'eco-friendly'] },
  TERRAZZO: { name: 'terrazzo', finish: ['polished', 'honed', 'matte'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'commercial', 'outdoor'] },
  RECYCLED_GLASS: { name: 'recycled_glass', finish: ['polished', 'matte', 'textured'], size: ['12x12"', '18x18"', '24x24"'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'eco-friendly'] },
  ACRYLIC: { name: 'acrylic', finish: ['clear', 'tinted', 'patterned'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['thinset mortar', 'epoxy adhesive', 'silicone'], application: ['floor', 'wall', 'shower', 'backsplash'] },
  CORIAN: { name: 'corian', finish: ['polished', 'matte', 'textured'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'countertop', 'backsplash'] },
  QUARTZ: { name: 'quartz', finish: ['polished', 'honed', 'matte'], size: ['12x12"', '18x18"', '24x24"', 'custom'], installationMethod: ['thinset mortar', 'epoxy adhesive'], application: ['floor', 'wall', 'countertop', 'backsplash'] }
} as const;

interface PdfExtractionRequest {
  documentId: string;
  extractionType: 'markdown' | 'tables' | 'images' | 'all';
  workspaceId?: string;
  userId?: string;
  options?: {
    includeImages?: boolean;
    includeMetadata?: boolean;
    chunkSize?: number;
    overlapSize?: number;
    outputFormat?: 'json' | 'markdown';
  };
}

interface PdfExtractionResponse {
  success: boolean;
  data?: {
    extractionId: string;
    status: 'processing' | 'completed' | 'failed';
    results?: {
      markdown?: string;
      tables?: Array<{
        pageNumber: number;
        tableData: string[][];
        csvData?: string;
      }>;
      images?: Array<{
        pageNumber: number;
        imageUrl: string;
        description?: string;
      }>;
      metadata?: {
        pageCount: number;
        title?: string;
        author?: string;
        creationDate?: string;
        fileSize: number;
      };
    };
    processingTime?: number;
    ragDocuments?: Array<{
      id: string;
      content: string;
      metadata: Record<string, any>;
    }>;
  };
  error?: string;
  statusCode?: number;
}

interface MivaaApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  processing_time?: number;
}

interface MaterialMetaExtraction {
  finish?: string;
  size?: string;
  installation_method?: string;
  application?: string;
  r11?: string;
  metal_types?: string[];
  category?: string;
  confidence?: number;
  // Comprehensive functional metadata
  slip_resistance_r_value?: string;
  surface_gloss_level?: string;
  mohs_hardness?: number;
  pei_rating?: number;
  water_absorption?: number;
  chemical_resistance?: string;
  sound_absorption?: number;
  voc_emissions?: string;
  recycled_content?: number;
  edge_type?: string;
  [key: string]: any;
}

interface EnhancedExtractionResult {
  originalResult: any;
  materialMetadata?: MaterialMetaExtraction;
  extractionSource: 'mivaa_only' | 'mivaa_with_ai_analysis';
  aiAnalysisTime?: number;
}

/**
 * Analyze extracted text content using OpenAI to extract material meta fields and categories
 */
async function analyzeTextWithOpenAI(textContent: string): Promise<MaterialMetaExtraction> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    console.warn('OpenAI API key not configured, skipping AI analysis');
    return { confidence: 0 };
  }

  const startTime = Date.now();

  try {
    const availableCategories = Object.keys(MATERIAL_CATEGORIES).join(', ');
    const categoryDetails = Object.entries(MATERIAL_CATEGORIES)
      .map(([key, category]) => `${key}: finish(${category.finish.join(', ')}), size(${category.size.join(', ')}), installation(${category.installationMethod.join(', ')}), application(${category.application.join(', ')})`)
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert materials scientist specializing in catalog data extraction.

Available material categories and their meta fields:
${categoryDetails}

Extract material properties and meta fields from catalog text content. Focus on identifying:

REQUIRED META FIELDS:
- finish: surface finish type (polished, matte, honed, brushed, etc.)
- size: dimensions and specifications (12x12", 24x24", etc.)
- installation_method: how the material is installed (thinset mortar, epoxy adhesive, etc.)
- application: where/how the material is used (floor, wall, countertop, etc.)
- r11: R11 slip resistance rating if mentioned (DIN 51130 standard)
- metal_types: specific metal compositions if applicable
- category: primary material category from available options

COMPREHENSIVE FUNCTIONAL METADATA (extract if mentioned):
- slip_resistance_r_value: DIN 51130 R-values (R9, R10, R11, R12, R13)
- surface_gloss_level: gloss classification (super-polished, polished, satin, matte, etc.)
- mohs_hardness: hardness scale rating (1-10)
- pei_rating: wear rating (Class 0-5)
- water_absorption: absorption percentage or classification
- chemical_resistance: chemical resistance ratings or certifications
- sound_absorption: NRC ratings or dB reduction values
- voc_emissions: emission ratings (Greenguard, FloorScore, etc.)
- recycled_content: percentage of recycled materials
- edge_type: edge characteristics (rectified, non-rectified, etc.)

Return structured JSON with extracted fields. Use null for missing information. Include confidence score (0-1).`,
          },
          {
            role: 'user',
            content: `Analyze this catalog text content and extract material meta fields and category information:

${textContent.substring(0, 8000)}

Extract all relevant meta fields and provide material category classification. Focus on accuracy and completeness.`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      return { confidence: 0 };
    }

    const data = await response.json();
    const analysisContent = data.choices[0].message.content;

    try {
      const analysis = JSON.parse(analysisContent);
      
      // Validate and clean the analysis results
      const cleanedAnalysis: MaterialMetaExtraction = {
        finish: analysis.finish || null,
        size: analysis.size || null,
        installation_method: analysis.installation_method || null,
        application: analysis.application || null,
        r11: analysis.r11 || analysis.slip_resistance_r_value || null,
        metal_types: Array.isArray(analysis.metal_types) ? analysis.metal_types : null,
        category: analysis.category || null,
        confidence: analysis.confidence || 0.8,
        
        // Comprehensive functional metadata
        slip_resistance_r_value: analysis.slip_resistance_r_value || null,
        surface_gloss_level: analysis.surface_gloss_level || null,
        mohs_hardness: analysis.mohs_hardness || null,
        pei_rating: analysis.pei_rating || null,
        water_absorption: analysis.water_absorption || null,
        chemical_resistance: analysis.chemical_resistance || null,
        sound_absorption: analysis.sound_absorption || null,
        voc_emissions: analysis.voc_emissions || null,
        recycled_content: analysis.recycled_content || null,
        edge_type: analysis.edge_type || null,
      };

      // Remove null values
      Object.keys(cleanedAnalysis).forEach(key => {
        if (cleanedAnalysis[key] === null || cleanedAnalysis[key] === undefined) {
          delete cleanedAnalysis[key];
        }
      });

      console.log(`OpenAI text analysis completed in ${Date.now() - startTime}ms`);
      return cleanedAnalysis;

    } catch (parseError) {
      console.error('Failed to parse OpenAI analysis response:', parseError, analysisContent);
      return { confidence: 0 };
    }

  } catch (error) {
    console.error('OpenAI text analysis error:', error);
    return { confidence: 0 };
  }
}

/**
 * Validate extracted meta fields against MATERIAL_CATEGORIES
 */
function validateMetaFields(metadata: MaterialMetaExtraction): MaterialMetaExtraction {
  if (!metadata.category) {
    return metadata;
  }

  const categoryKey = metadata.category.toUpperCase();
  const categoryDef = MATERIAL_CATEGORIES[categoryKey as keyof typeof MATERIAL_CATEGORIES];
  
  if (!categoryDef) {
    console.warn(`Unknown category: ${metadata.category}`);
    return metadata;
  }

  const validated = { ...metadata };

  // Validate finish
  if (validated.finish && !categoryDef.finish.includes(validated.finish)) {
    console.warn(`Invalid finish '${validated.finish}' for category '${metadata.category}'`);
    validated.finish = categoryDef.finish[0]; // Use first valid option as fallback
  }

  // Validate size
  if (validated.size && !categoryDef.size.includes(validated.size)) {
    console.warn(`Invalid size '${validated.size}' for category '${metadata.category}'`);
  }

  // Validate installation method
  if (validated.installation_method && !categoryDef.installationMethod.includes(validated.installation_method)) {
    console.warn(`Invalid installation method '${validated.installation_method}' for category '${metadata.category}'`);
  }

  // Validate application
  if (validated.application && !categoryDef.application.includes(validated.application)) {
    console.warn(`Invalid application '${validated.application}' for category '${metadata.category}'`);
  }

  return validated;
}

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST requests for PDF extraction
    if (req.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405, startTime);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let requestBody: PdfExtractionRequest;
    try {
      requestBody = await req.json();
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return createErrorResponse('Invalid JSON in request body', 400, startTime);
    }

    // Validate required fields
    const validationError = validateRequest(requestBody);
    if (validationError) {
      return createErrorResponse(validationError, 400, startTime);
    }

    console.log(`PDF Extraction - Processing document: ${requestBody.documentId}, type: ${requestBody.extractionType}`);

    // Check authentication and authorization
    const authResult = await AuthUtils.checkAuthentication(req, supabase);
    if (!authResult.success) {
      return Utils.createErrorResponse(authResult.error || 'Authentication failed', 401, startTime);
    }

    // Validate workspace membership if workspaceId is provided
    if (requestBody.workspaceId && authResult.workspaceId !== requestBody.workspaceId) {
      const workspaceCheck = await AuthUtils.checkWorkspaceMembership(
        supabase,
        authResult.userId!,
        requestBody.workspaceId,
      );
      if (!workspaceCheck.success) {
        return Utils.createErrorResponse(workspaceCheck.error || 'Workspace access denied', 403, startTime);
      }
    }

    // Get document information from database
    const documentInfo = await getDocumentInfo(supabase, requestBody.documentId);
    if (!documentInfo) {
      return Utils.createErrorResponse('Document not found', 404, startTime);
    }

    // Check user permissions for the document
    const hasPermission = await checkDocumentPermissions(
      supabase,
      requestBody.documentId,
      authResult.userId!,
      requestBody.workspaceId || authResult.workspaceId,
    );
    if (!hasPermission) {
      return Utils.createErrorResponse('Insufficient permissions', 403, startTime);
    }

    // Create processing record
    const processingRecord = await createProcessingRecord(supabase, {
      documentId: requestBody.documentId,
      userId: authResult.userId!,
      workspaceId: requestBody.workspaceId || authResult.workspaceId,
      extractionType: requestBody.extractionType,
      status: 'processing',
      options: requestBody.options,
    });

    // Process PDF with Mivaa service
    const extractionResult = await processPdfWithMivaa(
      documentInfo,
      requestBody.extractionType,
      requestBody.options,
    );

    if (!extractionResult.success) {
      // Update processing record with error
      await updateProcessingRecord(supabase, processingRecord.id, {
        status: 'failed',
        error: extractionResult.error,
        completedAt: new Date().toISOString(),
      });

      return Utils.createErrorResponse(
        extractionResult.error || 'PDF processing failed',
        500,
        startTime,
      );
    }

    // Analyze extracted text with OpenAI for meta fields and categories
    let materialMetadata: MaterialMetaExtraction | undefined;
    let enhancedResult: EnhancedExtractionResult;
    
    if (extractionResult.data?.markdown && requestBody.options?.includeMetadata !== false) {
      console.log('Analyzing extracted text with OpenAI for material meta fields...');
      const aiAnalysisStart = Date.now();
      
      try {
        const rawMetadata = await analyzeTextWithOpenAI(extractionResult.data.markdown);
        materialMetadata = validateMetaFields(rawMetadata);
        
        enhancedResult = {
          originalResult: extractionResult.data,
          materialMetadata,
          extractionSource: 'mivaa_with_ai_analysis',
          aiAnalysisTime: Date.now() - aiAnalysisStart,
        };
        
        console.log(`AI analysis completed in ${Date.now() - aiAnalysisStart}ms`);
        if (materialMetadata.confidence && materialMetadata.confidence > 0.5) {
          console.log(`Extracted meta fields: category=${materialMetadata.category}, finish=${materialMetadata.finish}, size=${materialMetadata.size}`);
        }
      } catch (aiError) {
        console.error('AI analysis failed, continuing without meta extraction:', aiError);
        enhancedResult = {
          originalResult: extractionResult.data,
          extractionSource: 'mivaa_only',
        };
      }
    } else {
      enhancedResult = {
        originalResult: extractionResult.data,
        extractionSource: 'mivaa_only',
      };
    }

    // Transform results for RAG if needed
    let ragDocuments: Array<any> = [];
    if (requestBody.options?.outputFormat !== 'json' && extractionResult.data?.markdown) {
      ragDocuments = await transformToRagDocuments(
        extractionResult.data.markdown,
        documentInfo,
        requestBody.options,
        materialMetadata, // Include extracted metadata in RAG documents
      );
    }

    // Update processing record with success including AI-extracted metadata
    const finalResult = {
      ...extractionResult.data,
      materialMetadata: materialMetadata,
      extractionSource: enhancedResult.extractionSource,
      aiAnalysisTime: enhancedResult.aiAnalysisTime,
      ragDocuments: ragDocuments.length > 0 ? ragDocuments : undefined,
    };

    await updateProcessingRecord(supabase, processingRecord.id, {
      status: 'completed',
      results: finalResult,
      processingTime: extractionResult.processing_time,
      completedAt: new Date().toISOString(),
    });

    // Store RAG documents if generated
    if (ragDocuments.length > 0) {
      await storeRagDocuments(supabase, ragDocuments, {
        documentId: requestBody.documentId,
        userId: authResult.userId!,
        workspaceId: requestBody.workspaceId || authResult.workspaceId,
      });
    }

    const responseTime = Date.now() - startTime;
    console.log(`PDF extraction completed in ${responseTime}ms for document: ${requestBody.documentId}`);

    // Log successful request
    await Logger.logApiUsage(supabase, {
      endpoint_id: null,
      user_id: authResult.userId!,
      ip_address: Utils.getClientIP(req),
      user_agent: req.headers.get('user-agent') || undefined,
      request_method: 'POST',
      request_path: '/pdf-extract',
      response_status: 200,
      response_time_ms: responseTime,
      is_internal_request: false,
      rate_limit_exceeded: false,
    });

    const response: PdfExtractionResponse = {
      success: true,
      data: {
        extractionId: processingRecord.id,
        status: 'completed',
        results: finalResult,
        processingTime: extractionResult.processing_time,
        ragDocuments,
      },
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('PDF extraction error:', error);

    const responseTime = Date.now() - startTime;

    return Utils.createErrorResponse(
      'Internal server error during PDF extraction',
      500,
      startTime,
    );
  }
});

function validateRequest(request: PdfExtractionRequest): string | null {
  if (!request.documentId || !ValidationSchemas.documentId(request.documentId)) {
    return 'Valid documentId is required';
  }

  if (!request.extractionType || !ValidationSchemas.extractionType(request.extractionType)) {
    return 'Valid extractionType is required (markdown, tables, images, all)';
  }

  if (request.options?.chunkSize && !ValidationSchemas.chunkSize(request.options.chunkSize)) {
    return 'chunkSize must be between 100 and 10000';
  }

  if (request.options?.overlapSize && !ValidationSchemas.overlapSize(request.options.overlapSize)) {
    return 'overlapSize must be between 0 and 1000';
  }

  return null;
}

// Authentication is now handled by AuthUtils from shared config

async function getDocumentInfo(supabase: any, documentId: string): Promise<any> {
  try {
    // First check processing_results table for document metadata
    const { data: processingData, error: processingError } = await supabase
      .from('processing_results')
      .select(`
        id,
        file_path,
        file_name,
        file_size,
        user_id,
        workspace_id,
        status,
        metadata,
        created_at
      `)
      .eq('id', documentId)
      .single();

    if (processingError) {
      Logger.logError('getDocumentInfo', processingError, { documentId });
      return null;
    }

    return processingData;
  } catch (error) {
    Logger.logError('getDocumentInfo', error, { documentId });
    return null;
  }
}

async function checkDocumentPermissions(
  supabase: any,
  documentId: string,
  userId: string,
  workspaceId?: string,
): Promise<boolean> {
  try {
    // Get document ownership and workspace info
    const { data: docData, error: docError } = await supabase
      .from('processing_results')
      .select('user_id, workspace_id')
      .eq('id', documentId)
      .single();

    if (docError) {
      Logger.logError('checkDocumentPermissions', docError, { documentId, userId });
      return false;
    }

    // Check if user owns the document
    if (docData.user_id === userId) {
      return true;
    }

    // Check workspace access if document belongs to a workspace
    if (docData.workspace_id && workspaceId === docData.workspace_id) {
      // Verify user is a member of the workspace
      const workspaceCheck = await AuthUtils.checkWorkspaceMembership(
        supabase,
        userId,
        docData.workspace_id,
      );
      return workspaceCheck.success;
    }

    return false;
  } catch (error) {
    Logger.logError('checkDocumentPermissions', error, { documentId, userId, workspaceId });
    return false;
  }
}

async function createProcessingRecord(supabase: any, data: any): Promise<any> {
  try {
    const { data: record, error } = await supabase
      .from('processing_results')
      .insert({
        id: Utils.generateId('pdf_extract'),
        source_type: 'pdf_extraction',
        source_id: data.documentId,
        user_id: data.userId,
        workspace_id: data.workspaceId,
        status: data.status,
        metadata: {
          extraction_type: data.extractionType,
          options: data.options,
          processing_type: 'pdf_extract',
        },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      Logger.logError('createProcessingRecord', error, data);
      throw new Error('Failed to create processing record');
    }

    return record;
  } catch (error) {
    Logger.logError('createProcessingRecord', error, data);
    throw error;
  }
}

async function updateProcessingRecord(supabase: any, recordId: string, updates: any): Promise<void> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.status) {
      updateData.status = updates.status;
    }

    if (updates.results) {
      updateData.results = updates.results;
    }

    if (updates.error) {
      updateData.error_message = updates.error;
    }

    if (updates.processingTime) {
      updateData.processing_time_ms = updates.processingTime;
    }

    if (updates.completedAt) {
      updateData.completed_at = updates.completedAt;
    }

    const { error } = await supabase
      .from('processing_results')
      .update(updateData)
      .eq('id', recordId);

    if (error) {
      Logger.logError('updateProcessingRecord', error, { recordId, updates });
    }
  } catch (error) {
    Logger.logError('updateProcessingRecord', error, { recordId, updates });
  }
}

async function processPdfWithMivaa(
  documentInfo: any,
  extractionType: string,
  options?: any,
): Promise<MivaaApiResponse> {
  try {
    const mivaaBaseUrl = Deno.env.get('MIVAA_BASE_URL') || 'http://localhost:8000';
    const mivaaApiKey = Deno.env.get('MIVAA_API_KEY');
    const timeout = parseInt(Deno.env.get('PDF_PROCESSING_TIMEOUT') || '300000'); // 5 minutes default

    let endpoint: string;
    let requestBody: any;

    // Determine endpoint based on extraction type
    switch (extractionType) {
      case 'markdown':
        endpoint = `${mivaaBaseUrl}/extract/markdown`;
        requestBody = {
          file_path: documentInfo.file_path,
          include_images: options?.includeImages || false,
          include_metadata: options?.includeMetadata || true,
        };
        break;
      case 'tables':
        endpoint = `${mivaaBaseUrl}/extract/tables`;
        requestBody = {
          file_path: documentInfo.file_path,
          output_format: 'csv',
        };
        break;
      case 'images':
        endpoint = `${mivaaBaseUrl}/extract/images`;
        requestBody = {
          file_path: documentInfo.file_path,
          include_descriptions: true,
        };
        break;
      case 'all':
        // For 'all', we'll call markdown endpoint with all options enabled
        endpoint = `${mivaaBaseUrl}/extract/markdown`;
        requestBody = {
          file_path: documentInfo.file_path,
          include_images: true,
          include_metadata: true,
          extract_tables: true,
        };
        break;
      default:
        throw new Error(`Unsupported extraction type: ${extractionType}`);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (mivaaApiKey) {
      headers['Authorization'] = `Bearer ${mivaaApiKey}`;
    }

    console.log(`Calling Mivaa API: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Mivaa API error: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `Mivaa API error: ${response.status} - ${response.statusText}`,
      };
    }

    const result = await response.json();
    console.log('Mivaa API response received successfully');

    return {
      success: true,
      data: result,
      processing_time: result.processing_time,
    };

  } catch (error) {
    console.error('Error calling Mivaa API:', error);

    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        success: false,
        error: 'PDF processing timeout - document may be too large or complex',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

async function transformToRagDocuments(
  markdownContent: string,
  documentInfo: any,
  options?: any,
  materialMetadata?: MaterialMetaExtraction,
): Promise<Array<any>> {
  try {
    const chunkSize = options?.chunkSize || 1000;
    const overlapSize = options?.overlapSize || 100;

    // Simple text chunking implementation
    const chunks = chunkText(markdownContent, chunkSize, overlapSize);

    return chunks.map((chunk, index) => ({
      id: `${documentInfo.id}_chunk_${index}`,
      content: chunk,
      metadata: {
        documentId: documentInfo.id,
        documentTitle: documentInfo.title || 'Untitled',
        chunkIndex: index,
        totalChunks: chunks.length,
        extractionType: 'markdown',
        createdAt: new Date().toISOString(),
        // Include AI-extracted material metadata if available
        materialCategory: materialMetadata?.category,
        materialFinish: materialMetadata?.finish,
        materialSize: materialMetadata?.size,
        materialInstallationMethod: materialMetadata?.installation_method,
        materialApplication: materialMetadata?.application,
        materialR11: materialMetadata?.r11,
        materialMetalTypes: materialMetadata?.metal_types,
        aiExtractionConfidence: materialMetadata?.confidence,
        // Additional functional metadata
        slipResistanceRValue: materialMetadata?.slip_resistance_r_value,
        surfaceGlossLevel: materialMetadata?.surface_gloss_level,
        mohsHardness: materialMetadata?.mohs_hardness,
        peiRating: materialMetadata?.pei_rating,
        waterAbsorption: materialMetadata?.water_absorption,
        chemicalResistance: materialMetadata?.chemical_resistance,
        soundAbsorption: materialMetadata?.sound_absorption,
        vocEmissions: materialMetadata?.voc_emissions,
        recycledContent: materialMetadata?.recycled_content,
        edgeType: materialMetadata?.edge_type,
      },
    }));
  } catch (error) {
    console.error('Error transforming to RAG documents:', error);
    return [];
  }
}

function chunkText(text: string, chunkSize: number, overlapSize: number): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunk = text.slice(startIndex, endIndex);
    chunks.push(chunk);

    if (endIndex === text.length) {
      break;
    }

    startIndex = endIndex - overlapSize;
  }

  return chunks;
}

async function storeRagDocuments(
  supabase: any,
  ragDocuments: Array<any>,
  context: { documentId: string; userId: string; workspaceId?: string },
): Promise<void> {
  try {
    const documentsToInsert = ragDocuments.map(doc => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      document_id: context.documentId,
      user_id: context.userId,
      workspace_id: context.workspaceId,
      created_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('rag_documents')
      .insert(documentsToInsert);

    if (error) {
      console.error('Error storing RAG documents:', error);
    } else {
      console.log(`Stored ${ragDocuments.length} RAG documents`);
    }
  } catch (error) {
    console.error('Error storing RAG documents:', error);
  }
}

function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  return '127.0.0.1';
}

async function logApiUsage(supabase: any, logData: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('api_usage_logs')
      .insert(logData);

    if (error) {
      console.error('Error logging API usage:', error);
    }
  } catch (error) {
    console.error('Error logging API usage:', error);
  }
}

function createErrorResponse(
  message: string,
  status: number,
  startTime: number,
): Response {
  const responseTime = Date.now() - startTime;

  const response: PdfExtractionResponse = {
    success: false,
    error: message,
    statusCode: status,
  };

  return new Response(
    JSON.stringify(response),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}
