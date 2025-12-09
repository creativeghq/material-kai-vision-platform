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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Activity,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Package,
  Link as LinkIcon,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);
  const [jobCheckpoints, setJobCheckpoints] = useState<any[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);

  // Fetch job details with checkpoints
  const fetchJobDetails = async (job: BackgroundJob) => {
    try {
      setLoadingCheckpoints(true);
      setSelectedJob(job);

      // Fetch all checkpoints for this job
      const { data: checkpoints, error } = await supabase
        .from('job_checkpoints')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setJobCheckpoints(checkpoints || []);
    } catch (error) {
      console.error('Error fetching job details:', error);
    } finally {
      setLoadingCheckpoints(false);
    }
  };

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

      setJobs(jobsData || []);

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
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="PDF Processing Monitor"
        description="Real-time monitoring of PDF processing jobs, stages, and analytics"
        badge="Admin"
      />

      <div className="p-6 space-y-6">
        {/* Overview Metrics - Compact Design */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
            <div className="text-2xl font-bold">{metrics.total_documents}</div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Products</p>
            </div>
            <div className="text-2xl font-bold">{metrics.total_products_created}</div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Chunks</p>
            </div>
            <div className="text-2xl font-bold">{metrics.total_chunks_created}</div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Images</p>
            </div>
            <div className="text-2xl font-bold">{metrics.total_images_extracted}</div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
            <div className="text-2xl font-bold">
              {metrics.pdf_processing.success_rate.toFixed(1)}%
            </div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Avg Time</p>
            </div>
            <div className="text-2xl font-bold">
              {formatTime(metrics.pdf_processing.avg_processing_time)}
            </div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Total Jobs</p>
            </div>
            <div className="text-2xl font-bold">{metrics.pdf_processing.total}</div>
          </div>
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
      <div className="space-y-4">
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
                        onClick={() => fetchJobDetails(job)}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition cursor-pointer group"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900 group-hover:text-primary transition">
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
                          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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

      {/* Job Details Modal */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Job Details: {selectedJob?.metadata?.filename || selectedJob?.document_id?.slice(0, 8) || 'Unknown'}
            </DialogTitle>
            <DialogDescription>
              Complete pipeline workflow with all stages, metrics, and AI models used
            </DialogDescription>
          </DialogHeader>

          {loadingCheckpoints ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Job Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Job Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-1">{selectedJob && getStatusBadge(selectedJob.status)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Progress</div>
                    <div className="mt-1 font-semibold">{selectedJob?.progress}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="mt-1 text-sm">{selectedJob && formatDate(selectedJob.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Duration</div>
                    <div className="mt-1 text-sm">
                      {selectedJob?.started_at && selectedJob?.completed_at
                        ? formatTime(
                            (new Date(selectedJob.completed_at).getTime() -
                              new Date(selectedJob.started_at).getTime()) /
                              1000
                          )
                        : 'N/A'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pipeline Stages - Workflow Style */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Pipeline Workflow
                  </CardTitle>
                  <CardDescription>
                    {jobCheckpoints.length} stages completed
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {jobCheckpoints.map((checkpoint) => {
                      const metadata = checkpoint.metadata || {};
                      const isCompleted = checkpoint.stage !== 'FAILED';
                      const isFailed = checkpoint.stage === 'FAILED';

                      return (
                        <div
                          key={checkpoint.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            isFailed
                              ? 'bg-red-50 border-red-200'
                              : isCompleted
                              ? 'bg-green-50 border-green-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          {/* Status Icon */}
                          <div className="flex-shrink-0 mt-0.5">
                            {isFailed ? (
                              <XCircle className="h-5 w-5 text-red-600" />
                            ) : isCompleted ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : (
                              <Clock className="h-5 w-5 text-slate-400" />
                            )}
                          </div>

                          {/* Stage Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm">
                                {checkpoint.stage.replace(/_/g, ' ')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(checkpoint.created_at)}
                              </div>
                            </div>

                            {/* Stage Details */}
                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              {metadata.ai_model && (
                                <div>
                                  <span className="text-muted-foreground">AI Model:</span>
                                  <span className="ml-1 font-medium">{metadata.ai_model}</span>
                                </div>
                              )}
                              {metadata.processing_time && (
                                <div>
                                  <span className="text-muted-foreground">Time:</span>
                                  <span className="ml-1 font-medium">{metadata.processing_time}s</span>
                                </div>
                              )}
                              {metadata.products_discovered !== undefined && (
                                <div>
                                  <span className="text-muted-foreground">Products:</span>
                                  <span className="ml-1 font-medium">{metadata.products_discovered}</span>
                                </div>
                              )}
                              {metadata.chunks_created !== undefined && (
                                <div>
                                  <span className="text-muted-foreground">Chunks:</span>
                                  <span className="ml-1 font-medium">{metadata.chunks_created}</span>
                                </div>
                              )}
                              {metadata.images_extracted !== undefined && (
                                <div>
                                  <span className="text-muted-foreground">Images:</span>
                                  <span className="ml-1 font-medium">{metadata.images_extracted}</span>
                                </div>
                              )}
                              {metadata.embeddings_generated !== undefined && (
                                <div>
                                  <span className="text-muted-foreground">Embeddings:</span>
                                  <span className="ml-1 font-medium">{metadata.embeddings_generated}</span>
                                </div>
                              )}
                            </div>

                            {/* Error Message */}
                            {metadata.error && (
                              <div className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded">
                                {metadata.error}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Metrics Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Processing Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Products</div>
                        <div className="font-semibold">
                          {selectedJob?.metadata?.total_products || 0}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Chunks</div>
                        <div className="font-semibold">
                          {selectedJob?.metadata?.total_chunks || 0}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Images</div>
                        <div className="font-semibold">
                          {selectedJob?.metadata?.total_images || 0}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Embeddings</div>
                        <div className="font-semibold">
                          {selectedJob?.metadata?.total_embeddings || 0}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Relations</div>
                        <div className="font-semibold">
                          {selectedJob?.metadata?.total_relations || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};
