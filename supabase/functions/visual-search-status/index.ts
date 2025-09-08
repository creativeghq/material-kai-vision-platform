import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import standardized Edge Function response types
import {
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Status monitoring interfaces
interface SystemStatus {
  service_name: 'visual-search-platform';
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  uptime_ms: number;
  components: {
    llama_vision: ComponentStatus;
    database: ComponentStatus;
    storage: ComponentStatus;
    vector_search: ComponentStatus;
  };
  performance_metrics: {
    avg_analysis_time_ms: number;
    avg_search_time_ms: number;
    cache_hit_rate: number;
    error_rate_percent: number;
  };
  capacity_metrics: {
    active_analyses: number;
    queue_depth: number;
    storage_usage_mb: number;
    vector_index_size: number;
  };
}

interface ComponentStatus {
  status: 'healthy' | 'degraded' | 'down';
  last_check: string;
  response_time_ms?: number;
  error_message?: string;
  metrics?: Record<string, number>;
}

interface JobProgress {
  job_id: string;
  job_type: 'analysis' | 'search' | 'batch';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_percent: number;
  current_step?: string;
  estimated_completion?: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

interface UserActivitySummary {
  user_id: string;
  period: '24h' | '7d' | '30d';
  analysis_count: number;
  search_count: number;
  batch_jobs: number;
  avg_confidence_score: number;
  most_analyzed_categories: string[];
  storage_usage_mb: number;
}

async function checkLLamaVisionHealth(): Promise<ComponentStatus> {
  const startTime = Date.now();
  const apiKey = Deno.env.get('TOGETHER_AI_API_KEY');
  
  if (!apiKey) {
    return {
      status: 'down',
      last_check: new Date().toISOString(),
      error_message: 'API key not configured'
    };
  }

  try {
    // Simple health check with minimal token usage
    const response = await fetch('https://api.together.xyz/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        status: 'healthy',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime
      };
    } else {
      return {
        status: 'degraded',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime,
        error_message: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      status: 'down',
      last_check: new Date().toISOString(),
      response_time_ms: Date.now() - startTime,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkDatabaseHealth(): Promise<ComponentStatus> {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('visual_search_analysis')
      .select('count')
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        status: 'down',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime,
        error_message: error.message
      };
    }

    return {
      status: responseTime > 2000 ? 'degraded' : 'healthy',
      last_check: new Date().toISOString(),
      response_time_ms: responseTime
    };
  } catch (error) {
    return {
      status: 'down',
      last_check: new Date().toISOString(),
      response_time_ms: Date.now() - startTime,
      error_message: error instanceof Error ? error.message : 'Database connection failed'
    };
  }
}

async function checkStorageHealth(): Promise<ComponentStatus> {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase.storage
      .from('material-images')
      .list('', { limit: 1 });

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        status: 'down',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime,
        error_message: error.message
      };
    }

    return {
      status: responseTime > 3000 ? 'degraded' : 'healthy',
      last_check: new Date().toISOString(),
      response_time_ms: responseTime
    };
  } catch (error) {
    return {
      status: 'down',
      last_check: new Date().toISOString(),
      response_time_ms: Date.now() - startTime,
      error_message: error instanceof Error ? error.message : 'Storage connection failed'
    };
  }
}

async function getSystemStatus(): Promise<SystemStatus> {
  const [llamaHealth, dbHealth, storageHealth] = await Promise.all([
    checkLLamaVisionHealth(),
    checkDatabaseHealth(),
    checkStorageHealth()
  ]);

  // Check vector search health (placeholder)
  const vectorHealth: ComponentStatus = {
    status: 'healthy',
    last_check: new Date().toISOString(),
    response_time_ms: 50
  };

  // Calculate overall system status
  const componentStatuses = [llamaHealth.status, dbHealth.status, storageHealth.status, vectorHealth.status];
  const overallStatus = componentStatuses.includes('down') ? 'down' 
    : componentStatuses.includes('degraded') ? 'degraded' 
    : 'healthy';

  // Get performance metrics
  const { data: recentAnalyses } = await supabase
    .from('visual_search_analysis')
    .select('confidence_scores, created_at')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(100);

  const avgConfidence = recentAnalyses?.length 
    ? recentAnalyses.reduce((sum: number, analysis: any) => sum + (analysis.confidence_scores?.overall || 0), 0) / recentAnalyses.length
    : 0;

  // Get capacity metrics
  const { data: activeJobs } = await supabase
    .from('visual_search_batch_jobs')
    .select('id')
    .eq('status', 'processing');

  const { data: queuedJobs } = await supabase
    .from('visual_search_batch_jobs')
    .select('id')
    .eq('status', 'pending');

  return {
    service_name: 'visual-search-platform',
    status: overallStatus,
    version: '1.0.0',
    uptime_ms: Date.now() - new Date('2025-09-06T00:00:00Z').getTime(), // Placeholder
    components: {
      llama_vision: llamaHealth,
      database: dbHealth,
      storage: storageHealth,
      vector_search: vectorHealth
    },
    performance_metrics: {
      avg_analysis_time_ms: 5000, // Placeholder
      avg_search_time_ms: 500,    // Placeholder
      cache_hit_rate: 0.85,       // Placeholder
      error_rate_percent: 2.5     // Placeholder
    },
    capacity_metrics: {
      active_analyses: activeJobs?.length || 0,
      queue_depth: queuedJobs?.length || 0,
      storage_usage_mb: 1024,     // Placeholder
      vector_index_size: 50000    // Placeholder
    }
  };
}

async function getUserJobs(userId: string, limit: number = 20): Promise<JobProgress[]> {
  try {
    // Get analysis jobs
    const { data: analysisJobs } = await supabase
      .from('visual_search_analysis')
      .select('analysis_id, created_at, confidence_scores')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Get batch jobs
    const { data: batchJobs } = await supabase
      .from('visual_search_batch_jobs')
      .select('batch_id, status, total_items, created_at, started_at, completed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    const jobs: JobProgress[] = [];

    // Convert analysis jobs
    analysisJobs?.forEach((job: any) => {
      jobs.push({
        job_id: job.analysis_id,
        job_type: 'analysis',
        status: 'completed',
        progress_percent: 100,
        created_at: job.created_at,
        updated_at: job.created_at,
        user_id: userId,
        metadata: {
          confidence: job.confidence_scores?.overall || 0
        }
      });
    });

    // Convert batch jobs
    batchJobs?.forEach((job: any) => {
      const progressPercent = job.status === 'completed' ? 100 
        : job.status === 'processing' ? 50 
        : job.status === 'failed' ? 0 
        : 0;

      jobs.push({
        job_id: job.batch_id,
        job_type: 'batch',
        status: job.status,
        progress_percent: progressPercent,
        created_at: job.created_at,
        updated_at: job.completed_at || job.started_at || job.created_at,
        user_id: userId,
        metadata: {
          total_items: job.total_items
        }
      });
    });

    return jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    console.error('Failed to get user jobs:', error);
    return [];
  }
}

async function getUserActivitySummary(userId: string, period: '24h' | '7d' | '30d'): Promise<UserActivitySummary> {
  const periodMs = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };

  const since = new Date(Date.now() - periodMs[period]).toISOString();

  try {
    // Get analysis count
    const { data: analyses, count: analysisCount } = await supabase
      .from('visual_search_analysis')
      .select('analysis_id, confidence_scores, material_classification', { count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', since);

    // Get search count  
    const { count: searchCount } = await supabase
      .from('visual_search_queries')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', since);

    // Get batch job count
    const { count: batchCount } = await supabase
      .from('visual_search_batch_jobs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', since);

    // Calculate average confidence
    const avgConfidence = analyses?.length 
      ? analyses.reduce((sum: number, analysis: any) => sum + (analysis.confidence_scores?.overall || 0), 0) / analyses.length
      : 0;

    // Extract most analyzed categories
    const categoryCount = new Map<string, number>();
    analyses?.forEach((analysis: any) => {
      const categories = analysis.material_classification || [];
      categories.forEach((material: any) => {
        const category = material.material_type || 'unknown';
        categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
      });
    });

    const mostAnalyzedCategories = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category]) => category);

    return {
      user_id: userId,
      period,
      analysis_count: analysisCount || 0,
      search_count: searchCount || 0,
      batch_jobs: batchCount || 0,
      avg_confidence_score: avgConfidence,
      most_analyzed_categories: mostAnalyzedCategories,
      storage_usage_mb: 0 // Placeholder - would need storage API integration
    };
  } catch (error) {
    console.error('Failed to get user activity summary:', error);
    return {
      user_id: userId,
      period,
      analysis_count: 0,
      search_count: 0,
      batch_jobs: 0,
      avg_confidence_score: 0,
      most_analyzed_categories: [],
      storage_usage_mb: 0
    };
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'GET') {
    const response = createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Only GET method is allowed for status endpoints',
      { allowed_methods: ['GET'] }
    );
    return createJSONResponse(response, 405);
  }

  try {
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Handle different status endpoints:
    // GET /visual-search-status - System status
    // GET /visual-search-status/jobs/{user_id} - User job history
    // GET /visual-search-status/activity/{user_id} - User activity summary
    // GET /visual-search-status/job/{job_id} - Specific job progress

    if (pathSegments.length === 1) {
      // System status
      console.log('Fetching system status...');
      const systemStatus = await getSystemStatus();
      
      const response = createSuccessResponse(systemStatus, {
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });

      return createJSONResponse(response);

    } else if (pathSegments[1] === 'jobs' && pathSegments[2]) {
      // User job history
      const userId = pathSegments[2];
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam) : 20;

      if (limit > 100) {
        const response = createErrorResponse(
          'INVALID_LIMIT',
          'Limit cannot exceed 100',
          { max_limit: 100, requested: limit }
        );
        return createJSONResponse(response, 400);
      }

      console.log(`Fetching job history for user: ${userId}`);
      const userJobs = await getUserJobs(userId, limit);

      const response = createSuccessResponse({
        user_id: userId,
        jobs: userJobs,
        total_returned: userJobs.length
      });

      return createJSONResponse(response);

    } else if (pathSegments[1] === 'activity' && pathSegments[2]) {
      // User activity summary
      const userId = pathSegments[2];
      const period = (url.searchParams.get('period') as '24h' | '7d' | '30d') || '7d';

      if (!['24h', '7d', '30d'].includes(period)) {
        const response = createErrorResponse(
          'INVALID_PERIOD',
          'Period must be one of: 24h, 7d, 30d',
          { valid_periods: ['24h', '7d', '30d'], provided: period }
        );
        return createJSONResponse(response, 400);
      }

      console.log(`Fetching activity summary for user: ${userId}, period: ${period}`);
      const activitySummary = await getUserActivitySummary(userId, period);

      const response = createSuccessResponse(activitySummary);
      return createJSONResponse(response);

    } else if (pathSegments[1] === 'job' && pathSegments[2]) {
      // Specific job progress
      const jobId = pathSegments[2];

      // Check if it's a batch job
      const { data: batchJob } = await supabase
        .from('visual_search_batch_jobs')
        .select('*')
        .eq('batch_id', jobId)
        .single();

      if (batchJob) {
        // Get detailed batch progress
        const { data: batchItems } = await supabase
          .from('visual_search_batch_items')
          .select('status, item_id, created_at, updated_at')
          .eq('batch_id', jobId);

        const totalItems = batchItems?.length || 0;
        const completedItems = batchItems?.filter((item: any) => item.status === 'completed').length || 0;
        const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

        const jobProgress: JobProgress = {
          job_id: jobId,
          job_type: 'batch',
          status: batchJob.status,
          progress_percent: progressPercent,
          created_at: batchJob.created_at,
          updated_at: batchJob.updated_at || batchJob.created_at,
          user_id: batchJob.user_id,
          metadata: {
            total_items: totalItems,
            completed_items: completedItems,
            failed_items: batchItems?.filter((item: any) => item.status === 'failed').length || 0
          }
        };

        // Only add current_step if we have a meaningful value
        if (batchJob.status === 'processing') {
          jobProgress.current_step = `Processing item ${completedItems + 1} of ${totalItems}`;
        }

        const response = createSuccessResponse(jobProgress);
        return createJSONResponse(response);
      }

      // Check if it's an analysis job
      const { data: analysisJob } = await supabase
        .from('visual_search_analysis')
        .select('*')
        .eq('analysis_id', jobId)
        .single();

      if (analysisJob) {
        const jobProgress: JobProgress = {
          job_id: jobId,
          job_type: 'analysis',
          status: 'completed',
          progress_percent: 100,
          created_at: analysisJob.created_at,
          updated_at: analysisJob.created_at,
          user_id: analysisJob.user_id,
          metadata: {
            confidence: analysisJob.confidence_scores?.overall || 0,
            analysis_depth: analysisJob.analysis_depth
          }
        };

        const response = createSuccessResponse(jobProgress);
        return createJSONResponse(response);
      }

      // Job not found
      const response = createErrorResponse(
        'JOB_NOT_FOUND',
        `Job ${jobId} not found`,
        { job_id: jobId }
      );
      return createJSONResponse(response, 404);

    } else {
      const response = createErrorResponse(
        'INVALID_ENDPOINT',
        'Invalid status endpoint path',
        { 
          available_endpoints: [
            '/visual-search-status',
            '/visual-search-status/jobs/{user_id}',
            '/visual-search-status/activity/{user_id}',
            '/visual-search-status/job/{job_id}'
          ]
        }
      );
      return createJSONResponse(response, 404);
    }

  } catch (error) {
    console.error('Status endpoint error:', error);

    const response = createErrorResponse(
      'STATUS_CHECK_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred during status check',
      {
        timestamp: new Date().toISOString(),
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError'
      }
    );

    return createJSONResponse(response, 500);
  }
});