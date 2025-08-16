import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  corsHeaders,
  AuthUtils,
  Logger,
  Utils,
  ValidationSchemas
} from '../_shared/config.ts';

interface BatchProcessRequest {
  documents: Array<{
    documentId: string;
    extractionType: 'markdown' | 'tables' | 'images' | 'all';
    priority?: 'low' | 'normal' | 'high';
  }>;
  workspaceId?: string;
  userId?: string;
  options?: {
    includeImages?: boolean;
    includeMetadata?: boolean;
    chunkSize?: number;
    overlapSize?: number;
    outputFormat?: 'json' | 'markdown';
    maxConcurrent?: number;
    notifyOnComplete?: boolean;
    webhookUrl?: string;
  };
}

interface BatchProcessResponse {
  success: boolean;
  data?: {
    batchId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
    totalDocuments: number;
    processedDocuments: number;
    failedDocuments: number;
    estimatedCompletionTime?: string;
    results?: Array<{
      documentId: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      extractionId?: string;
      error?: string;
      processingTime?: number;
    }>;
  };
  error?: string;
  statusCode?: number;
}

interface BatchJob {
  id: string;
  userId: string;
  workspaceId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  documents: Array<any>;
  options: any;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

serve(async (req) => {
  const startTime = Date.now();
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different HTTP methods
    switch (req.method) {
      case 'POST':
        return await handleBatchCreate(req, supabase, startTime);
      case 'GET':
        return await handleBatchStatus(req, supabase, startTime);
      case 'DELETE':
        return await handleBatchCancel(req, supabase, startTime);
      default:
        return Utils.createErrorResponse('Method not allowed', 405, startTime);
    }

  } catch (error) {
    console.error('Batch processing error:', error);
    return Utils.createErrorResponse(
      'Internal server error during batch processing',
      500,
      startTime
    );
  }
});

async function handleBatchCreate(req: Request, supabase: any, startTime: number): Promise<Response> {
  try {
    // Parse request body
    let requestBody: BatchProcessRequest;
    try {
      requestBody = await req.json();
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return Utils.createErrorResponse('Invalid JSON in request body', 400, startTime);
    }

    // Validate request
    const validationError = validateBatchRequest(requestBody);
    if (validationError) {
      return Utils.createErrorResponse(validationError, 400, startTime);
    }

    console.log(`Batch processing - Creating batch job for ${requestBody.documents.length} documents`);

    // Check authentication
    const authResult = await AuthUtils.checkAuthentication(req, supabase);
    if (!authResult.success) {
      return Utils.createErrorResponse(authResult.error || 'Authentication failed', 401, startTime);
    }

    // Validate workspace membership if workspaceId is provided
    if (requestBody.workspaceId && authResult.workspaceId !== requestBody.workspaceId) {
      const workspaceCheck = await AuthUtils.checkWorkspaceMembership(
        supabase,
        authResult.userId!,
        requestBody.workspaceId
      );
      if (!workspaceCheck.success) {
        return Utils.createErrorResponse(workspaceCheck.error || 'Workspace access denied', 403, startTime);
      }
    }

    // Validate all documents exist and user has permissions
    const documentValidation = await validateDocuments(
      supabase,
      requestBody.documents,
      authResult.userId!,
      requestBody.workspaceId || authResult.workspaceId
    );

    if (!documentValidation.success) {
      return Utils.createErrorResponse(documentValidation.error || 'Document validation failed', 403, startTime);
    }

    // Create batch job record
    const batchJob = await createBatchJob(supabase, {
      userId: authResult.userId!,
      workspaceId: requestBody.workspaceId || authResult.workspaceId,
      documents: requestBody.documents,
      options: requestBody.options || {},
    });

    // Start processing (async)
    processBatchAsync(supabase, batchJob.id, requestBody.documents, requestBody.options || {});

    const responseTime = Date.now() - startTime;
    console.log(`Batch job created in ${responseTime}ms: ${batchJob.id}`);

    // Log API usage
    await Logger.logApiUsage(supabase, {
      endpoint_id: undefined,
      user_id: authResult.userId!,
      ip_address: Utils.getClientIP(req),
      user_agent: req.headers.get('user-agent') || undefined,
      request_method: 'POST',
      request_path: '/pdf-batch-process',
      response_status: 202,
      response_time_ms: responseTime,
      is_internal_request: false,
      rate_limit_exceeded: false,
    });

    const response: BatchProcessResponse = {
      success: true,
      data: {
        batchId: batchJob.id,
        status: 'queued',
        totalDocuments: requestBody.documents.length,
        processedDocuments: 0,
        failedDocuments: 0,
        estimatedCompletionTime: Utils.calculateEstimatedCompletion(requestBody.documents.length),
        results: requestBody.documents.map(doc => ({
          documentId: doc.documentId,
          status: 'pending',
        })),
      },
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 202, // Accepted
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error creating batch job:', error);
    return Utils.createErrorResponse('Failed to create batch job', 500, startTime);
  }
}

async function handleBatchStatus(req: Request, supabase: any, startTime: number): Promise<Response> {
  try {
    const url = new URL(req.url);
    const batchId = url.searchParams.get('batchId');

    if (!batchId) {
      return Utils.createErrorResponse('batchId parameter is required', 400, startTime);
    }

    // Check authentication
    const authResult = await AuthUtils.checkAuthentication(req, supabase);
    if (!authResult.success) {
      return Utils.createErrorResponse(authResult.error || 'Authentication failed', 401, startTime);
    }

    // Get batch job status
    const batchJob = await getBatchJob(supabase, batchId, authResult.userId!);
    if (!batchJob) {
      return Utils.createErrorResponse('Batch job not found', 404, startTime);
    }

    // Get detailed results
    const results = await getBatchResults(supabase, batchId);

    const responseTime = Date.now() - startTime;

    const response: BatchProcessResponse = {
      success: true,
      data: {
        batchId: batchJob.id,
        status: batchJob.status,
        totalDocuments: batchJob.totalDocuments,
        processedDocuments: batchJob.processedDocuments,
        failedDocuments: batchJob.failedDocuments,
        results,
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
    console.error('Error getting batch status:', error);
    return Utils.createErrorResponse('Failed to get batch status', 500, startTime);
  }
}

async function handleBatchCancel(req: Request, supabase: any, startTime: number): Promise<Response> {
  try {
    const url = new URL(req.url);
    const batchId = url.searchParams.get('batchId');

    if (!batchId) {
      return Utils.createErrorResponse('batchId parameter is required', 400, startTime);
    }

    // Check authentication
    const authResult = await AuthUtils.checkAuthentication(req, supabase);
    if (!authResult.success) {
      return Utils.createErrorResponse(authResult.error || 'Authentication failed', 401, startTime);
    }

    // Cancel batch job
    const success = await cancelBatchJob(supabase, batchId, authResult.userId!);
    if (!success) {
      return Utils.createErrorResponse('Batch job not found or cannot be cancelled', 404, startTime);
    }

    const responseTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({ success: true, message: 'Batch job cancelled' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error cancelling batch job:', error);
    return Utils.createErrorResponse('Failed to cancel batch job', 500, startTime);
  }
}

function validateBatchRequest(request: BatchProcessRequest): string | null {
  if (!request.documents || !Array.isArray(request.documents) || request.documents.length === 0) {
    return 'documents array is required and must not be empty';
  }

  if (request.documents.length > 100) {
    return 'Maximum 100 documents allowed per batch';
  }

  for (let i = 0; i < request.documents.length; i++) {
    const doc = request.documents[i];
    
    if (!doc.documentId || !ValidationSchemas.documentId(doc.documentId)) {
      return `Document at index ${i} has invalid documentId`;
    }

    if (!doc.extractionType || !ValidationSchemas.extractionType(doc.extractionType)) {
      return `Document at index ${i} has invalid extractionType. Must be one of: markdown, tables, images, all`;
    }

    if (doc.priority && !ValidationSchemas.priority(doc.priority)) {
      return `Document at index ${i} has invalid priority. Must be one of: low, normal, high`;
    }
  }

  if (request.options?.maxConcurrent && !ValidationSchemas.maxConcurrent(request.options.maxConcurrent)) {
    return 'maxConcurrent must be between 1 and 10';
  }

  if (request.options?.chunkSize && !ValidationSchemas.chunkSize(request.options.chunkSize)) {
    return 'chunkSize must be between 100 and 10000';
  }

  return null;
}

// Authentication is now handled by AuthUtils from shared config

async function validateDocuments(
  supabase: any,
  documents: Array<any>,
  userId: string,
  workspaceId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const documentIds = documents.map(doc => doc.documentId);
    
    // Check if all documents exist and user has access
    const { data, error } = await supabase
      .from('processing_results')
      .select('id, user_id, workspace_id')
      .in('id', documentIds);

    if (error) {
      Logger.logError('validateDocuments', error, { documentIds, userId });
      return { success: false, error: 'Failed to validate documents' };
    }

    if (data.length !== documentIds.length) {
      return { success: false, error: 'One or more documents not found' };
    }

    // Check permissions for each document
    for (const doc of data) {
      if (doc.user_id !== userId) {
        if (!workspaceId || doc.workspace_id !== workspaceId) {
          return { success: false, error: `Insufficient permissions for document: ${doc.id}` };
        }
        
        // Check if user is member of workspace
        const workspaceCheck = await AuthUtils.checkWorkspaceMembership(
          supabase,
          userId,
          doc.workspace_id
        );
        if (!workspaceCheck.success) {
          return { success: false, error: `Insufficient workspace permissions for document: ${doc.id}` };
        }
      }
    }

    return { success: true };
  } catch (error) {
    Logger.logError('validateDocuments', error, { documentIds, userId, workspaceId });
    return { success: false, error: 'Document validation failed' };
  }
}

async function createBatchJob(supabase: any, data: any): Promise<BatchJob> {
  try {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: record, error } = await supabase
      .from('pdf_batch_jobs')
      .insert({
        id: batchId,
        user_id: data.userId,
        workspace_id: data.workspaceId,
        status: 'queued',
        total_documents: data.documents.length,
        processed_documents: 0,
        failed_documents: 0,
        documents: data.documents,
        options: data.options,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating batch job:', error);
      throw new Error('Failed to create batch job');
    }

    return {
      id: record.id,
      userId: record.user_id,
      workspaceId: record.workspace_id,
      status: record.status,
      totalDocuments: record.total_documents,
      processedDocuments: record.processed_documents,
      failedDocuments: record.failed_documents,
      documents: record.documents,
      options: record.options,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      completedAt: record.completed_at,
    };
  } catch (error) {
    console.error('Error creating batch job:', error);
    throw error;
  }
}

async function getBatchJob(supabase: any, batchId: string, userId: string): Promise<BatchJob | null> {
  try {
    const { data, error } = await supabase
      .from('pdf_batch_jobs')
      .select('*')
      .eq('id', batchId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      workspaceId: data.workspace_id,
      status: data.status,
      totalDocuments: data.total_documents,
      processedDocuments: data.processed_documents,
      failedDocuments: data.failed_documents,
      documents: data.documents,
      options: data.options,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      completedAt: data.completed_at,
    };
  } catch (error) {
    console.error('Error getting batch job:', error);
    return null;
  }
}

async function getBatchResults(supabase: any, batchId: string): Promise<Array<any>> {
  try {
    const { data, error } = await supabase
      .from('pdf_processing_results')
      .select('id, document_id, status, processing_time, error')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting batch results:', error);
      return [];
    }

    return data.map((result: any) => ({
      documentId: result.document_id,
      status: result.status,
      extractionId: result.id,
      error: result.error,
      processingTime: result.processing_time,
    }));
  } catch (error) {
    console.error('Error getting batch results:', error);
    return [];
  }
}

async function cancelBatchJob(supabase: any, batchId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('pdf_batch_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)
      .eq('user_id', userId)
      .in('status', ['queued', 'processing'])
      .select();

    if (error) {
      console.error('Error cancelling batch job:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('Error cancelling batch job:', error);
    return false;
  }
}

async function processBatchAsync(
  supabase: any,
  batchId: string,
  documents: Array<any>,
  options: any
): Promise<void> {
  try {
    console.log(`Starting async processing for batch: ${batchId}`);
    
    // Update batch status to processing
    await supabase
      .from('pdf_batch_jobs')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    const maxConcurrent = options.maxConcurrent || 3;
    const pdfExtractUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pdf-extract`;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    let processedCount = 0;
    let failedCount = 0;
    
    // Process documents in batches
    for (let i = 0; i < documents.length; i += maxConcurrent) {
      const batch = documents.slice(i, i + maxConcurrent);
      
      const promises = batch.map(async (doc) => {
        try {
          const response = await fetch(pdfExtractUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              documentId: doc.documentId,
              extractionType: doc.extractionType,
              options: {
                ...options,
                batchId, // Include batch ID for tracking
              },
            }),
          });

          if (response.ok) {
            processedCount++;
            console.log(`Successfully processed document: ${doc.documentId}`);
          } else {
            failedCount++;
            console.error(`Failed to process document: ${doc.documentId}, status: ${response.status}`);
          }
        } catch (error) {
          failedCount++;
          console.error(`Error processing document: ${doc.documentId}`, error);
        }
      });

      await Promise.allSettled(promises);
      
      // Update progress
      await supabase
        .from('pdf_batch_jobs')
        .update({
          processed_documents: processedCount,
          failed_documents: failedCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId);
    }

    // Update final status
    const finalStatus = failedCount === 0 ? 'completed' : 
                       processedCount === 0 ? 'failed' : 'partial';

    await supabase
      .from('pdf_batch_jobs')
      .update({
        status: finalStatus,
        processed_documents: processedCount,
        failed_documents: failedCount,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    console.log(`Batch processing completed: ${batchId}, processed: ${processedCount}, failed: ${failedCount}`);

    // Send webhook notification if configured
    if (options.notifyOnComplete && options.webhookUrl) {
      await sendWebhookNotification(options.webhookUrl, {
        batchId,
        status: finalStatus,
        totalDocuments: documents.length,
        processedDocuments: processedCount,
        failedDocuments: failedCount,
      });
    }

  } catch (error) {
    console.error(`Error in batch processing: ${batchId}`, error);
    
    // Update batch status to failed
    await supabase
      .from('pdf_batch_jobs')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);
  }
}

async function sendWebhookNotification(webhookUrl: string, data: any): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    console.log('Webhook notification sent successfully');
  } catch (error) {
    console.error('Failed to send webhook notification:', error);
  }
}

function calculateEstimatedCompletion(documentCount: number): string {
  // Rough estimate: 30 seconds per document
  const estimatedSeconds = documentCount * 30;
  const estimatedDate = new Date(Date.now() + estimatedSeconds * 1000);
  return estimatedDate.toISOString();
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
  
  const response: BatchProcessResponse = {
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