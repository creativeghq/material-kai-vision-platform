import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, AlertTriangle, CheckCircle, Clock, Zap } from 'lucide-react';

interface QueueJob {
  id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  max_retries: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

interface ImageProcessingJob extends QueueJob {
  image_id: string;
}

interface AIAnalysisJob extends QueueJob {
  chunk_id?: string;
  analysis_type: 'classification' | 'metadata' | 'product_detection';
}

interface JobProgress {
  document_id: string;
  stage: 'extraction' | 'image_processing' | 'chunking' | 'ai_analysis' | 'product_creation';
  progress: number;
  total_items: number;
  completed_items: number;
  metadata: any;
  updated_at: string;
}

interface QueueMetrics {
  image_queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
    success_rate: number;
    avg_processing_time: number;
  };
  ai_queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
    success_rate: number;
    avg_processing_time: number;
  };
  active_documents: number;
  total_jobs_processed: number;
}

export const AsyncJobQueueMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [imageJobs, setImageJobs] = useState<ImageProcessingJob[]>([]);
  const [aiJobs, setAIJobs] = useState<AIAnalysisJob[]>([]);
  const [progressData, setProgressData] = useState<JobProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchQueueData = useCallback(async () => {
    try {
      setError(null);

      // Fetch image processing queue
      const { data: imageData, error: imageError } = await supabase
        .from('image_processing_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (imageError) throw imageError;

      // Fetch AI analysis queue
      const { data: aiData, error: aiError } = await supabase
        .from('ai_analysis_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (aiError) throw aiError;

      // Fetch job progress
      const { data: progressDataRaw, error: progressError } = await supabase
        .from('job_progress')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (progressError) throw progressError;

      setImageJobs(imageData || []);
      setAIJobs(aiData || []);
      setProgressData(progressDataRaw || []);

      // Calculate metrics
      const calculateMetrics = (): QueueMetrics => {
        const imageQueue = imageData || [];
        const aiQueue = aiData || [];

        const calculateQueueMetrics = (jobs: any[]) => {
          const pending = jobs.filter(j => j.status === 'pending').length;
          const processing = jobs.filter(j => j.status === 'processing').length;
          const completed = jobs.filter(j => j.status === 'completed').length;
          const failed = jobs.filter(j => j.status === 'failed').length;
          const total = jobs.length;

          const completedJobs = jobs.filter(j => j.status === 'completed');
          const successRate = total > 0 ? (completed / total) * 100 : 0;

          let avgProcessingTime = 0;
          if (completedJobs.length > 0) {
            const totalTime = completedJobs.reduce((sum, job) => {
              const start = new Date(job.started_at).getTime();
              const end = new Date(job.completed_at).getTime();
              return sum + (end - start);
            }, 0);
            avgProcessingTime = totalTime / completedJobs.length / 1000; // Convert to seconds
          }

          return {
            pending,
            processing,
            completed,
            failed,
            total,
            success_rate: successRate,
            avg_processing_time: avgProcessingTime,
          };
        };

        const activeDocuments = new Set([
          ...imageQueue.map(j => j.document_id),
          ...aiQueue.map(j => j.document_id),
        ]).size;

        const totalJobsProcessed = (imageQueue.filter(j => j.status === 'completed').length +
          aiQueue.filter(j => j.status === 'completed').length);

        return {
          image_queue: calculateQueueMetrics(imageQueue),
          ai_queue: calculateQueueMetrics(aiQueue),
          active_documents: activeDocuments,
          total_jobs_processed: totalJobsProcessed,
        };
      };

      setMetrics(calculateMetrics());
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch queue data');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueueData();
    if (autoRefresh) {
      const interval = setInterval(fetchQueueData, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
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
      <div className="p-6 bg-white rounded-lg">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>Loading queue data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="bg-red-50 border-red-200">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          Error: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6 bg-white rounded-lg">
        <p className="text-gray-600">No queue data available</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">🔄 Async Job Queue Monitor</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              autoRefresh
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {autoRefresh ? '🔄 Auto-refresh ON' : '⏸️ Auto-refresh OFF'}
          </button>
          <button
            onClick={fetchQueueData}
            className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg font-medium hover:bg-blue-200 transition"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Refresh Now
          </button>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.active_documents}</div>
            <p className="text-xs text-gray-500 mt-1">Currently processing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Jobs Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.total_jobs_processed}</div>
            <p className="text-xs text-gray-500 mt-1">Completed successfully</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Image Queue Success</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.image_queue.success_rate.toFixed(1)}%</div>
            <Progress value={metrics.image_queue.success_rate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">AI Queue Success</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.ai_queue.success_rate.toFixed(1)}%</div>
            <Progress value={metrics.ai_queue.success_rate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Queue Status */}
      <Tabs defaultValue="image" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="image">Image Processing Queue</TabsTrigger>
          <TabsTrigger value="ai">AI Analysis Queue</TabsTrigger>
          <TabsTrigger value="progress">Progress Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Image Processing Queue Status</CardTitle>
              <CardDescription>
                {metrics.image_queue.total} total jobs | Avg processing time:{' '}
                {formatTime(metrics.image_queue.avg_processing_time)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-700">{metrics.image_queue.pending}</div>
                  <div className="text-sm text-yellow-600">Pending</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">{metrics.image_queue.processing}</div>
                  <div className="text-sm text-blue-600">Processing</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{metrics.image_queue.completed}</div>
                  <div className="text-sm text-green-600">Completed</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-700">{metrics.image_queue.failed}</div>
                  <div className="text-sm text-red-600">Failed</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-700">{metrics.image_queue.total}</div>
                  <div className="text-sm text-purple-600">Total</div>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="font-semibold mb-3">Recent Jobs</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {imageJobs.length === 0 ? (
                    <p className="text-gray-500 text-sm">No jobs in queue</p>
                  ) : (
                    imageJobs.slice(0, 20).map(job => (
                      <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{job.image_id}</div>
                          <div className="text-xs text-gray-500">{formatDate(job.created_at)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {job.retry_count > 0 && (
                            <Badge className="bg-orange-100 text-orange-800">
                              Retry {job.retry_count}/{job.max_retries}
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

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Analysis Queue Status</CardTitle>
              <CardDescription>
                {metrics.ai_queue.total} total jobs | Avg processing time:{' '}
                {formatTime(metrics.ai_queue.avg_processing_time)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-700">{metrics.ai_queue.pending}</div>
                  <div className="text-sm text-yellow-600">Pending</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">{metrics.ai_queue.processing}</div>
                  <div className="text-sm text-blue-600">Processing</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{metrics.ai_queue.completed}</div>
                  <div className="text-sm text-green-600">Completed</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-700">{metrics.ai_queue.failed}</div>
                  <div className="text-sm text-red-600">Failed</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-700">{metrics.ai_queue.total}</div>
                  <div className="text-sm text-purple-600">Total</div>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="font-semibold mb-3">Recent Jobs</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {aiJobs.length === 0 ? (
                    <p className="text-gray-500 text-sm">No jobs in queue</p>
                  ) : (
                    aiJobs.slice(0, 20).map(job => (
                      <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{job.analysis_type}</div>
                          <div className="text-xs text-gray-500">{formatDate(job.created_at)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {job.retry_count > 0 && (
                            <Badge className="bg-orange-100 text-orange-800">
                              Retry {job.retry_count}/{job.max_retries}
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

        <TabsContent value="progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Processing Progress</CardTitle>
              <CardDescription>Real-time progress tracking for active documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {progressData.length === 0 ? (
                  <p className="text-gray-500 text-sm">No active processing</p>
                ) : (
                  progressData.slice(0, 20).map(progress => (
                    <div key={`${progress.document_id}-${progress.stage}`} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium">
                            {progress.stage.replace(/_/g, ' ').toUpperCase()}
                          </div>
                          <div className="text-xs text-gray-500">
                            Doc: {progress.document_id.slice(0, 8)}... | Updated:{' '}
                            {formatDate(progress.updated_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{progress.progress}%</div>
                          <div className="text-xs text-gray-500">
                            {progress.completed_items}/{progress.total_items}
                          </div>
                        </div>
                      </div>
                      <Progress value={progress.progress} className="h-2" />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Error Logs */}
      {(imageJobs.some(j => j.status === 'failed') || aiJobs.some(j => j.status === 'failed')) && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">⚠️ Failed Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...imageJobs, ...aiJobs]
                .filter(j => j.status === 'failed')
                .slice(0, 10)
                .map(job => (
                  <div key={job.id} className="p-3 bg-white rounded-lg border border-red-200">
                    <div className="text-sm font-medium text-red-900">
                      {job.id.slice(0, 8)}... - {job.error_message || 'Unknown error'}
                    </div>
                    <div className="text-xs text-red-700 mt-1">
                      Retries: {job.retry_count}/{job.max_retries}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

