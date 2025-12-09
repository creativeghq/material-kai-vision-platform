import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Activity,
} from 'lucide-react';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface BackgroundJob {
  id: string;
  workspace_id: string;
  document_id: string | null;
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'cancelled';
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  error: string | null;
  metadata: {
    filename?: string;
    stage?: string;
    products_discovered?: number;
    chunks_created?: number;
    images_extracted?: number;
    embeddings_generated?: number;
    processing_time_ms?: number;
    ai_model?: string;
    retry_count?: number;
    [key: string]: any;
  } | null;
}

interface JobCheckpoint {
  id: string;
  job_id: string;
  stage: string;
  checkpoint_data: any;
  metadata: any;
  created_at: string;
}

interface QueueMetrics {
  pdf_processing: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
    total: number;
    success_rate: number;
    avg_processing_time: number;
  };
  total_documents: number;
  total_products_created: number;
  total_chunks_created: number;
  total_images_extracted: number;
}

export const AsyncJobQueueMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [checkpoints, setCheckpoints] = useState<JobCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchQueueData = useCallback(async () => {
    try {
      setError(null);

      // Fetch background jobs (PDF processing jobs)
      const { data: jobsData, error: jobsError } = await supabase
        .from('background_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (jobsError) throw jobsError;

      // Fetch job checkpoints for detailed stage information
      const { data: checkpointsData, error: checkpointsError } = await supabase
        .from('job_checkpoints')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (checkpointsError) throw checkpointsError;

      setJobs(jobsData || []);
      setCheckpoints(checkpointsData || []);

      // Calculate metrics from background_jobs
      const calculateMetrics = (): QueueMetrics => {
        const allJobs = jobsData || [];

        const pending = allJobs.filter((j) => j.status === 'pending').length;
        const processing = allJobs.filter((j) => j.status === 'processing').length;
        const completed = allJobs.filter((j) => j.status === 'completed').length;
        const failed = allJobs.filter((j) => j.status === 'failed').length;
        const retrying = allJobs.filter((j) => j.status === 'retrying').length;
        const total = allJobs.length;

        const completedJobs = allJobs.filter((j) => j.status === 'completed');
        const successRate = total > 0 ? (completed / total) * 100 : 0;

        // Calculate average processing time from completed jobs
        let avgProcessingTime = 0;
        if (completedJobs.length > 0) {
          const totalTime = completedJobs.reduce((sum, job) => {
            if (job.started_at && job.completed_at) {
              const start = new Date(job.started_at).getTime();
              const end = new Date(job.completed_at).getTime();
              return sum + (end - start);
            }
            return sum;
          }, 0);
          avgProcessingTime = totalTime / completedJobs.length / 1000; // Convert to seconds
        }

        // Calculate totals from metadata
        const totalProducts = allJobs.reduce((sum, job) => {
          return sum + (job.metadata?.products_discovered || 0);
        }, 0);

        const totalChunks = allJobs.reduce((sum, job) => {
          return sum + (job.metadata?.chunks_created || 0);
        }, 0);

        const totalImages = allJobs.reduce((sum, job) => {
          return sum + (job.metadata?.images_extracted || 0);
        }, 0);

        const totalDocuments = new Set(allJobs.map((j) => j.document_id).filter(Boolean)).size;

        return {
          pdf_processing: {
            pending,
            processing,
            completed,
            failed,
            retrying,
            total,
            success_rate: successRate,
            avg_processing_time: avgProcessingTime,
          },
          total_documents: totalDocuments,
          total_products_created: totalProducts,
          total_chunks_created: totalChunks,
          total_images_extracted: totalImages,
        };
      };

      setMetrics(calculateMetrics());
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch queue data',
      );
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueueData();

    // Set up real-time subscription for background_jobs
    const jobsSubscription = supabase
      .channel('background_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'background_jobs',
        },
        () => {
          fetchQueueData();
        }
      )
      .subscribe();

    // Auto-refresh interval as backup
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchQueueData, 10000); // Refresh every 10 seconds
    }

    return () => {
      jobsSubscription.unsubscribe();
      if (interval) clearInterval(interval);
    };
  }, [fetchQueueData, autoRefresh]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: string }> = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
      processing: { color: 'bg-blue-100 text-blue-800', icon: '⚙️' },
      completed: { color: 'bg-green-100 text-green-800', icon: '✅' },
      failed: { color: 'bg-red-100 text-red-800', icon: '❌' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Badge className={config.color}>
        {config.icon} {status}
      </Badge>
    );
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Async Job Queue Monitor"
          description="Monitor background job processing queues and progress"
          badge="Admin"
        />
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p>Loading queue data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Async Job Queue Monitor"
          description="Monitor background job processing queues and progress"
          badge="Admin"
        />
        <div className="p-6">
          <Alert className="bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              Error: {error}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Async Job Queue Monitor"
          description="Monitor background job processing queues and progress"
          badge="Admin"
        />
        <div className="p-6">
          <p className="text-muted-foreground">No queue data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <GlobalAdminHeader
        title="PDF Processing Monitor"
        description="Real-time monitoring of PDF processing jobs, stages, and analytics"
        badge="Admin"
      />

      <div className="p-6 space-y-6">
        {/* Overview Metrics - Glass Morphism Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Total Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{metrics.total_documents}</div>
              <p className="text-xs text-slate-500 mt-1">Unique PDFs processed</p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Products Created
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {metrics.total_products_created}
              </div>
              <p className="text-xs text-slate-500 mt-1">From all documents</p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" />
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {metrics.pdf_processing.success_rate.toFixed(1)}%
              </div>
              <Progress
                value={metrics.pdf_processing.success_rate}
                className="mt-2 h-2"
              />
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-600" />
                Avg Processing Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {formatTime(metrics.pdf_processing.avg_processing_time)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Per document</p>
            </CardContent>
          </Card>
        </div>

        {/* Control Buttons */}
        <div className="flex justify-end items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg font-medium transition shadow-sm ${
              autoRefresh
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-slate-100 text-slate-800 border border-slate-300'
            }`}
          >
            {autoRefresh ? '🔄 Auto-refresh ON' : '⏸️ Auto-refresh OFF'}
          </button>
          <button
            onClick={fetchQueueData}
            className="px-4 py-2 bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20 transition border border-primary/30 shadow-sm"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Refresh Now
          </button>
        </div>

      {/* Queue Status */}
      <Tabs defaultValue="jobs" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-white/80 backdrop-blur-sm">
          <TabsTrigger value="jobs">Processing Jobs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                PDF Processing Jobs
              </CardTitle>
              <CardDescription>
                {metrics.pdf_processing.total} total jobs | Avg processing time:{' '}
                {formatTime(metrics.pdf_processing.avg_processing_time)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <div className="text-2xl font-bold text-yellow-700">
                    {metrics.pdf_processing.pending}
                  </div>
                  <div className="text-sm text-yellow-600">Pending</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="text-2xl font-bold text-blue-700">
                    {metrics.pdf_processing.processing}
                  </div>
                  <div className="text-sm text-blue-600">Processing</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="text-2xl font-bold text-green-700">
                    {metrics.pdf_processing.completed}
                  </div>
                  <div className="text-sm text-green-600">Completed</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <div className="text-2xl font-bold text-red-700">
                    {metrics.pdf_processing.failed}
                  </div>
                  <div className="text-sm text-red-600">Failed</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <div className="text-2xl font-bold text-orange-700">
                    {metrics.pdf_processing.retrying}
                  </div>
                  <div className="text-sm text-orange-600">Retrying</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="text-2xl font-bold text-purple-700">
                    {metrics.pdf_processing.total}
                  </div>
                  <div className="text-sm text-purple-600">Total</div>
                </div>
              </div>

              {/* Recent Jobs List */}
              <div className="mt-6">
                <h4 className="font-semibold mb-3 text-slate-700">Recent Jobs</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {jobs.length === 0 ? (
                    <p className="text-slate-500 text-sm">No jobs in queue</p>
                  ) : (
                    jobs.slice(0, 30).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900">
                            {job.metadata?.filename || job.document_id?.slice(0, 8) || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {formatDate(job.created_at)} | Progress: {job.progress}%
                          </div>
                          {job.metadata?.stage && (
                            <div className="text-xs text-slate-600 mt-1">
                              Stage: {job.metadata.stage}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {job.metadata?.retry_count && job.metadata.retry_count > 0 && (
                            <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                              Retry {job.metadata.retry_count}
                            </Badge>
                          )}
                          {getStatusBadge(job.status)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Total Products
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-slate-900">
                  {metrics.total_products_created}
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Extracted from {metrics.total_documents} documents
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  Total Chunks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-slate-900">
                  {metrics.total_chunks_created}
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Text chunks for embeddings
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-600" />
                  Total Images
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-slate-900">
                  {metrics.total_images_extracted}
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Images extracted and processed
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Processing Stages Breakdown */}
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Processing Stages Overview
              </CardTitle>
              <CardDescription>
                Breakdown of jobs by processing stage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {checkpoints.length === 0 ? (
                  <p className="text-slate-500 text-sm">No checkpoint data available</p>
                ) : (
                  (() => {
                    const stageCount: Record<string, number> = {};
                    checkpoints.forEach((cp) => {
                      stageCount[cp.stage] = (stageCount[cp.stage] || 0) + 1;
                    });
                    return Object.entries(stageCount)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10)
                      .map(([stage, count]) => (
                        <div key={stage} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-sm font-medium text-slate-700">
                            {stage.replace(/_/g, ' ').toUpperCase()}
                          </div>
                          <Badge className="bg-primary/10 text-primary border-primary/30">
                            {count} jobs
                          </Badge>
                        </div>
                      ));
                  })()
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Error Logs */}
      {jobs.some((j) => j.status === 'failed') && (
        <Card className="border-red-300 bg-red-50/80 backdrop-blur-sm shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Failed Jobs
            </CardTitle>
            <CardDescription className="text-red-700">
              Jobs that failed after all retry attempts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {jobs
                .filter((j) => j.status === 'failed')
                .slice(0, 15)
                .map((job) => (
                  <div
                    key={job.id}
                    className="p-4 bg-white rounded-lg border border-red-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-red-900">
                          {job.metadata?.filename || job.document_id?.slice(0, 8) || 'Unknown'}
                        </div>
                        <div className="text-xs text-red-700 mt-1">
                          {job.error || 'Unknown error'}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Failed: {job.failed_at ? formatDate(job.failed_at) : 'N/A'}
                        </div>
                      </div>
                      {job.metadata?.retry_count && (
                        <Badge className="bg-red-100 text-red-800 border-red-300">
                          {job.metadata.retry_count} retries
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
};
