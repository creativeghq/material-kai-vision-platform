import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import standardized Edge Function response types
import {

  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Batch processing interfaces
interface BatchAnalysisItem {
  item_id: string;
  image_url?: string;
  image_data?: string;
  analysis_depth?: 'quick' | 'standard' | 'comprehensive';
  focus_areas?: Array<'color' | 'texture' | 'material' | 'spatial'>;
  metadata?: Record<string, any>;
}

interface BatchAnalysisRequest {
  batch_id?: string;
  items: BatchAnalysisItem[];
  batch_settings: {
    analysis_depth: 'quick' | 'standard' | 'comprehensive';
    focus_areas: Array<'color' | 'texture' | 'material' | 'spatial'>;
    similarity_threshold: number;
    max_concurrent: number;
    priority: 'low' | 'normal' | 'high';
  };
  notification_webhook?: string;
  user_id?: string;
  workspace_id?: string;
}

interface BatchJobStatus {
  batch_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  progress: {
    total_items: number;
    completed_items: number;
    failed_items: number;
    current_item?: string;
    estimated_completion?: string;
  };
  results: {
    completed_analyses: string[]; // Analysis IDs
    failed_analyses: Array<{
      item_id: string;
      error: string;
      retry_count: number;
    }>;
  };
  timing: {
    started_at: string;
    estimated_duration_ms?: number;
    completed_at?: string;
  };
}

interface BatchProcessingResult {
  batch_id: string;
  submission_status: 'accepted' | 'rejected';
  batch_metadata: {
    total_items: number;
    estimated_processing_time_ms: number;
    priority_level: string;
    queue_position?: number;
  };
  processing_details: {
    max_concurrent: number;
    retry_policy: {
      max_retries: number;
      retry_delay_ms: number;
    };
    timeout_per_item_ms: number;
  };
  webhook_url?: string;
}

async function validateBatchRequest(request: BatchAnalysisRequest): Promise<string[]> {
  const errors: string[] = [];

  // Validate items
  if (!request.items || request.items.length === 0) {
    errors.push('Batch must contain at least one item');
  }

  if (request.items && request.items.length > 100) {
    errors.push('Batch cannot exceed 100 items per request');
  }

  // Validate each item
  request.items?.forEach((item, index) => {
    if (!item.item_id) {
      errors.push(`Item ${index}: item_id is required`);
    }

    if (!item.image_url && !item.image_data) {
      errors.push(`Item ${index}: either image_url or image_data is required`);
    }

    // Validate focus areas if provided
    if (item.focus_areas) {
      const validFocusAreas = ['color', 'texture', 'material', 'spatial'];
      const invalidAreas = item.focus_areas.filter(area => !validFocusAreas.includes(area));
      if (invalidAreas.length > 0) {
        errors.push(`Item ${index}: invalid focus areas: ${invalidAreas.join(', ')}`);
      }
    }
  });

  // Validate batch settings
  if (!request.batch_settings) {
    errors.push('batch_settings is required');
  } else {
    const validDepths = ['quick', 'standard', 'comprehensive'];
    if (!validDepths.includes(request.batch_settings.analysis_depth)) {
      errors.push(`Invalid analysis_depth: must be one of ${validDepths.join(', ')}`);
    }

    if (request.batch_settings.max_concurrent > 10) {
      errors.push('max_concurrent cannot exceed 10 for system stability');
    }

    if (request.batch_settings.similarity_threshold < 0 || request.batch_settings.similarity_threshold > 1) {
      errors.push('similarity_threshold must be between 0 and 1');
    }
  }

  return errors;
}

async function createBatchJob(request: BatchAnalysisRequest): Promise<string> {
  const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Calculate estimated processing time
  const baseTimePerItem = {
    'quick': 2000,      // 2 seconds
    'standard': 5000,   // 5 seconds
    'comprehensive': 10000, // 10 seconds
  };

  const estimatedTimeMs = request.items.length * baseTimePerItem[request.batch_settings.analysis_depth];

  try {
    // Create batch job record
    const { error: batchError } = await supabase
      .from('visual_search_batch_jobs')
      .insert({
        batch_id: batchId,
        user_id: request.user_id,
        workspace_id: request.workspace_id,
        status: 'pending',
        total_items: request.items.length,
        batch_settings: request.batch_settings,
        notification_webhook: request.notification_webhook,
        estimated_duration_ms: estimatedTimeMs,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (batchError) {
      throw new Error(`Failed to create batch job: ${batchError.message}`);
    }

    // Create individual item records
    const batchItems = request.items.map(item => ({
      batch_id: batchId,
      item_id: item.item_id,
      image_url: item.image_url,
      image_data: item.image_data,
      analysis_depth: item.analysis_depth || request.batch_settings.analysis_depth,
      focus_areas: item.focus_areas || request.batch_settings.focus_areas,
      item_metadata: item.metadata,
      status: 'pending',
      created_at: new Date().toISOString(),
    }));

    const { error: itemsError } = await supabase
      .from('visual_search_batch_items')
      .insert(batchItems);

    if (itemsError) {
      throw new Error(`Failed to create batch items: ${itemsError.message}`);
    }

    return batchId;
  } catch (error) {
    console.error('Failed to create batch job:', error);
    throw error;
  }
}

async function processBatchJob(batchId: string): Promise<void> {
  // This would typically be handled by a background worker
  // For now, we'll start the processing asynchronously

  // Update batch status to processing
  await supabase
    .from('visual_search_batch_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .eq('batch_id', batchId);

  // Note: In a production system, this would trigger a background worker
  // or be handled by a queue system like Supabase Realtime or external queue
  console.log(`Batch job ${batchId} queued for processing`);
}

async function getBatchStatus(batchId: string): Promise<BatchJobStatus | null> {
  try {
    // Get batch job info
    const { data: batchData, error: batchError } = await supabase
      .from('visual_search_batch_jobs')
      .select('*')
      .eq('batch_id', batchId)
      .single();

    if (batchError || !batchData) {
      return null;
    }

    // Get item status counts
    const { data: itemStats, error: statsError } = await supabase
      .from('visual_search_batch_items')
      .select('status, item_id, error_message, retry_count, analysis_id')
      .eq('batch_id', batchId);

    if (statsError) {
      console.error('Failed to get item stats:', statsError);
      return null;
    }

    const completed = itemStats?.filter((item: any) => item.status === 'completed') || [];
    const failed = itemStats?.filter((item: any) => item.status === 'failed') || [];
    const processing = itemStats?.filter((item: any) => item.status === 'processing') || [];

    // Calculate estimated completion
    let estimatedCompletion: string | undefined;
    if (batchData.status === 'processing' && processing.length > 0) {
      const remainingItems = batchData.total_items - completed.length;
      const avgTimePerItem = batchData.estimated_duration_ms / batchData.total_items;
      const estimatedRemainingMs = remainingItems * avgTimePerItem;
      estimatedCompletion = new Date(Date.now() + estimatedRemainingMs).toISOString();
    }

    return {
      batch_id: batchId,
      status: batchData.status,
      progress: {
        total_items: batchData.total_items,
        completed_items: completed.length,
        failed_items: failed.length,
        current_item: processing[0]?.item_id,
        ...(estimatedCompletion && {estimated_completion: estimatedCompletion}),
      },
      results: {
        completed_analyses: completed.map((item: any) => item.analysis_id).filter(Boolean),
        failed_analyses: failed.map((item: any) => ({
          item_id: item.item_id,
          error: item.error_message || 'Unknown error',
          retry_count: item.retry_count || 0,
        })),
      },
      timing: {
        started_at: batchData.started_at || batchData.created_at,
        estimated_duration_ms: batchData.estimated_duration_ms,
        completed_at: batchData.completed_at,
      },
    };
  } catch (error) {
    console.error('Failed to get batch status:', error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);

    // Handle different endpoints:
    // POST /visual-search-batch - Submit new batch
    // GET /visual-search-batch/{batch_id} - Get batch status
    // GET /visual-search-batch/{batch_id}/results - Get batch results

    if (req.method === 'POST') {
      // Submit new batch for processing
      const startTime = Date.now();
      const body: BatchAnalysisRequest = await req.json();

      // Validate the request
      const validationErrors = await validateBatchRequest(body);
      if (validationErrors.length > 0) {
        const response = createErrorResponse(
          'BATCH_VALIDATION_FAILED',
          'Batch request validation failed',
          { validation_errors: validationErrors },
        );
        return createJSONResponse(response, 400);
      }

      console.log(`Creating batch job with ${body.items.length} items`);

      // Create the batch job
      const batchId = await createBatchJob(body);

      // Start processing (in background)
      await processBatchJob(batchId);

      const processingTime = Date.now() - startTime;

      // Return batch submission result
      const resultData: BatchProcessingResult = {
        batch_id: batchId,
        submission_status: 'accepted',
        batch_metadata: {
          total_items: body.items.length,
          estimated_processing_time_ms: body.items.length * 5000, // 5s per item average
          priority_level: body.batch_settings.priority,
          queue_position: 1, // Placeholder
        },
        processing_details: {
          max_concurrent: body.batch_settings.max_concurrent,
          retry_policy: {
            max_retries: 3,
            retry_delay_ms: 5000,
          },
          timeout_per_item_ms: 30000,
        },
        ...(body.notification_webhook && {webhook_url: body.notification_webhook}),
      };

      const response = createSuccessResponse(resultData, {
        processingTime,
        version: '1.0.0',
      });

      return createJSONResponse(response);

    } else if (req.method === 'GET') {
      // Get batch status or results
      const batchId = pathSegments[pathSegments.length - 1];
      const isResultsRequest = pathSegments.includes('results');

      if (!batchId || batchId === 'visual-search-batch') {
        const response = createErrorResponse(
          'MISSING_BATCH_ID',
          'Batch ID is required in the URL path',
          { expected_format: '/visual-search-batch/{batch_id}' },
        );
        return createJSONResponse(response, 400);
      }

      const batchStatus = await getBatchStatus(batchId);
      if (!batchStatus) {
        const response = createErrorResponse(
          'BATCH_NOT_FOUND',
          `Batch job ${batchId} not found`,
          { batch_id: batchId },
        );
        return createJSONResponse(response, 404);
      }

      if (isResultsRequest) {
        // Return detailed results for completed analyses
        if (batchStatus.status !== 'completed' && batchStatus.status !== 'partial') {
          const response = createErrorResponse(
            'BATCH_NOT_READY',
            'Batch processing is not yet complete',
            {
              current_status: batchStatus.status,
              progress: batchStatus.progress,
            },
          );
          return createJSONResponse(response, 202); // Accepted but not ready
        }

        // Fetch detailed analysis results
        const { data: analysisResults, error: resultsError } = await supabase
          .from('visual_search_analysis')
          .select('*')
          .in('analysis_id', batchStatus.results.completed_analyses);

        if (resultsError) {
          const response = createErrorResponse(
            'RESULTS_FETCH_ERROR',
            'Failed to fetch batch analysis results',
            { error: resultsError.message },
          );
          return createJSONResponse(response, 500);
        }

        const response = createSuccessResponse({
          batch_id: batchId,
          status: batchStatus.status,
          results: analysisResults || [],
          summary: {
            total_processed: batchStatus.progress.completed_items,
            total_failed: batchStatus.progress.failed_items,
            success_rate: batchStatus.progress.total_items > 0
              ? (batchStatus.progress.completed_items / batchStatus.progress.total_items) * 100
              : 0,
          },
        });

        return createJSONResponse(response);
      } else {
        // Return batch status
        const response = createSuccessResponse(batchStatus);
        return createJSONResponse(response);
      }

    } else {
      const response = createErrorResponse(
        'METHOD_NOT_ALLOWED',
        'Only POST and GET methods are allowed',
        { allowed_methods: ['POST', 'GET'] },
      );
      return createJSONResponse(response, 405);
    }

  } catch (error) {
    console.error('Visual search batch error:', error);

    const response = createErrorResponse(
      'BATCH_PROCESSING_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred during batch processing',
      {
        timestamp: new Date().toISOString(),
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
      },
    );

    return createJSONResponse(response, 500);
  }
});
