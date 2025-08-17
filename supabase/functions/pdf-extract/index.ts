import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

import {
  corsHeaders,
  AuthUtils,
  Logger,
  Utils,
  ValidationSchemas,
} from '../_shared/config.ts';

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

    // Transform results for RAG if needed
    let ragDocuments: Array<any> = [];
    if (requestBody.options?.outputFormat !== 'json' && extractionResult.data?.markdown) {
      ragDocuments = await transformToRagDocuments(
        extractionResult.data.markdown,
        documentInfo,
        requestBody.options,
      );
    }

    // Update processing record with success
    const finalResult = {
      ...extractionResult.data,
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
