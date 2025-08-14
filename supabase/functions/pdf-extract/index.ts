import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

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
    const authResult = await checkAuthentication(req, supabase);
    if (!authResult.success) {
      return createErrorResponse(authResult.error || 'Authentication failed', 401, startTime);
    }

    // Get document information from database
    const documentInfo = await getDocumentInfo(supabase, requestBody.documentId);
    if (!documentInfo) {
      return createErrorResponse('Document not found', 404, startTime);
    }

    // Check user permissions for the document
    const hasPermission = await checkDocumentPermissions(
      supabase, 
      requestBody.documentId, 
      authResult.userId,
      requestBody.workspaceId
    );
    if (!hasPermission) {
      return createErrorResponse('Insufficient permissions', 403, startTime);
    }

    // Create processing record
    const processingRecord = await createProcessingRecord(supabase, {
      documentId: requestBody.documentId,
      userId: authResult.userId,
      workspaceId: requestBody.workspaceId,
      extractionType: requestBody.extractionType,
      status: 'processing',
      options: requestBody.options,
    });

    // Process PDF with Mivaa service
    const extractionResult = await processPdfWithMivaa(
      documentInfo,
      requestBody.extractionType,
      requestBody.options
    );

    if (!extractionResult.success) {
      // Update processing record with error
      await updateProcessingRecord(supabase, processingRecord.id, {
        status: 'failed',
        error: extractionResult.error,
        completedAt: new Date().toISOString(),
      });

      return createErrorResponse(
        extractionResult.error || 'PDF processing failed',
        500,
        startTime
      );
    }

    // Transform results for RAG if needed
    let ragDocuments: Array<any> = [];
    if (requestBody.options?.outputFormat !== 'json' && extractionResult.data?.markdown) {
      ragDocuments = await transformToRagDocuments(
        extractionResult.data.markdown,
        documentInfo,
        requestBody.options
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
        userId: authResult.userId,
        workspaceId: requestBody.workspaceId,
      });
    }

    const responseTime = Date.now() - startTime;
    console.log(`PDF extraction completed in ${responseTime}ms for document: ${requestBody.documentId}`);

    // Log successful request
    await logApiUsage(supabase, {
      endpoint_id: null,
      user_id: authResult.userId,
      ip_address: getClientIP(req),
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
      }
    );

  } catch (error) {
    console.error('PDF extraction error:', error);
    
    const responseTime = Date.now() - startTime;
    
    return createErrorResponse(
      'Internal server error during PDF extraction',
      500,
      startTime
    );
  }
});

function validateRequest(request: PdfExtractionRequest): string | null {
  if (!request.documentId) {
    return 'documentId is required';
  }

  if (!request.extractionType) {
    return 'extractionType is required';
  }

  const validTypes = ['markdown', 'tables', 'images', 'all'];
  if (!validTypes.includes(request.extractionType)) {
    return `extractionType must be one of: ${validTypes.join(', ')}`;
  }

  if (request.options?.chunkSize && (request.options.chunkSize < 100 || request.options.chunkSize > 10000)) {
    return 'chunkSize must be between 100 and 10000';
  }

  if (request.options?.overlapSize && (request.options.overlapSize < 0 || request.options.overlapSize > 1000)) {
    return 'overlapSize must be between 0 and 1000';
  }

  return null;
}

async function checkAuthentication(req: Request, supabase: any): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
}> {
  const authHeader = req.headers.get('authorization');
  const apiKey = req.headers.get('x-api-key');

  // Check API key authentication
  if (apiKey && apiKey.startsWith('kai_')) {
    // TODO: Validate API key against database
    return { success: true, userId: 'api_user' };
  }

  // Check JWT authentication
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return { success: false, error: 'Invalid authentication token' };
      }

      return { success: true, userId: user.id };
    } catch (error) {
      return { success: false, error: 'Authentication verification failed' };
    }
  }

  return { success: false, error: 'Authentication required' };
}

async function getDocumentInfo(supabase: any, documentId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('pdf_processing_results')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error) {
      console.error('Error fetching document info:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching document info:', error);
    return null;
  }
}

async function checkDocumentPermissions(
  supabase: any,
  documentId: string,
  userId: string,
  workspaceId?: string
): Promise<boolean> {
  try {
    // For now, implement basic permission check
    // In a real implementation, you would check workspace membership, document ownership, etc.
    const { data, error } = await supabase
      .from('pdf_processing_results')
      .select('user_id, workspace_id')
      .eq('id', documentId)
      .single();

    if (error) {
      console.error('Error checking permissions:', error);
      return false;
    }

    // Check if user owns the document or has workspace access
    if (data.user_id === userId) {
      return true;
    }

    if (workspaceId && data.workspace_id === workspaceId) {
      // TODO: Check if user is member of workspace
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking permissions:', error);
    return false;
  }
}

async function createProcessingRecord(supabase: any, data: any): Promise<any> {
  try {
    const { data: record, error } = await supabase
      .from('pdf_processing_results')
      .insert({
        document_id: data.documentId,
        user_id: data.userId,
        workspace_id: data.workspaceId,
        extraction_type: data.extractionType,
        status: data.status,
        options: data.options,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating processing record:', error);
      throw new Error('Failed to create processing record');
    }

    return record;
  } catch (error) {
    console.error('Error creating processing record:', error);
    throw error;
  }
}

async function updateProcessingRecord(supabase: any, recordId: string, updates: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('pdf_processing_results')
      .update(updates)
      .eq('id', recordId);

    if (error) {
      console.error('Error updating processing record:', error);
    }
  } catch (error) {
    console.error('Error updating processing record:', error);
  }
}

async function processPdfWithMivaa(
  documentInfo: any,
  extractionType: string,
  options?: any
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
  options?: any
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
  context: { documentId: string; userId: string; workspaceId?: string }
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
  startTime: number
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
    }
  );
}