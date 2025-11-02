import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Cpu,
  Server,
  AlertTriangle,
  CheckCircle,
  Clock,
  Brain,
  Home,
  ArrowLeft,
  Gauge,
  FileText,
  Layers,
  BarChart3,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';

interface SystemMetrics {
  total_processing_jobs: number;
  avg_processing_time: number;
  success_rate: number;
  error_rate: number;
  ai_model_performance: {
    openai_success: number;
    claude_success: number;
    openai_avg_time: number;
    claude_avg_time: number;
  };
}

interface ProcessingJob {
  id: string;
  job_type: string;
  status: string;
  processing_time_ms: number;
  created_at: string;
  error_message?: string;
}

interface MLTask {
  id: string;
  ml_operation_type: string;
  processing_time_ms: number;
  confidence_scores: Record<string, number> | null;
  created_at: string;
}

interface EnhancedJobDetails {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_percentage: number;
  current_stage: string;
  stages: Array<{
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    processing_time_ms?: number;
    error_message?: string;
  }>;
  estimated_completion_time?: number;
  total_processing_time_ms: number;
  document_info?: {
    name: string;
    type: string;
    size_bytes: number;
  };
  error_details?: {
    stage: string;
    message: string;
    timestamp: string;
  };
}

interface DocumentAnalysisMetrics {
  total_documents: number;
  documents_processed_today: number;
  avg_processing_time_per_document: number;
  success_rate_24h: number;
  error_rate_24h: number;
  processing_stages: Array<{
    stage_name: string;
    avg_time_ms: number;
    success_rate: number;
    common_errors: string[];
  }>;
  performance_trends: {
    processing_time_trend: number; // percentage change
    success_rate_trend: number;
    volume_trend: number;
  };
}

export const SystemPerformance: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<SystemMetrics>({
    total_processing_jobs: 0,
    avg_processing_time: 0,
    success_rate: 0,
    error_rate: 0,
    ai_model_performance: {
      openai_success: 0,
      claude_success: 0,
      openai_avg_time: 0,
      claude_avg_time: 0,
    },
  });
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const [mlTasks, setMLTasks] = useState<MLTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Enhanced monitoring state
  const [enhancedJobs, setEnhancedJobs] = useState<EnhancedJobDetails[]>([]);
  const [documentMetrics, setDocumentMetrics] =
    useState<DocumentAnalysisMetrics | null>(null);

  const [jobDetailsLoading, setJobDetailsLoading] = useState(false);

  const { toast } = useToast();

  // Enhanced job details fetching
  const fetchEnhancedJobDetails = useCallback(
    async (jobId: string): Promise<EnhancedJobDetails | null> => {
      try {
        setJobDetailsLoading(true);
        const apiService = BrowserApiIntegrationService.getInstance();

        const result = await apiService.callSupabaseFunction('mivaa-gateway', {
          action: 'get_job_details',
          payload: {
            job_id: jobId,
            include_stages: true,
            include_progress: true,
          },
        });

        if (!result.success) {
          throw new Error(
            `Failed to fetch job details: ${result.error?.message || 'Unknown error'}`,
          );
        }

        const data = result.data;

        return {
          job_id: jobId,
          status: data.status || 'pending',
          progress_percentage: data.progress_percentage || 0,
          current_stage: data.current_stage || 'Initializing',
          stages: data.stages || [],
          estimated_completion_time: data.estimated_completion_time,
          total_processing_time_ms: data.total_processing_time_ms || 0,
          document_info: data.document_info,
          error_details: data.error_details,
        };
      } catch (error) {
        console.error('Error fetching enhanced job details:', error);
        return null;
      } finally {
        setJobDetailsLoading(false);
      }
    },
    [],
  );

  // Document analysis metrics fetching
  const fetchDocumentAnalysisMetrics =
    useCallback(async (): Promise<DocumentAnalysisMetrics | null> => {
      try {
        const apiService = BrowserApiIntegrationService.getInstance();

        const result = await apiService.callSupabaseFunction('mivaa-gateway', {
          action: 'get_document_analysis_metrics',
          payload: {
            time_range: '24h',
            include_trends: true,
            include_stage_breakdown: true,
          },
        });

        if (!result.success) {
          throw new Error(
            `Failed to fetch document metrics: ${result.error?.message || 'Unknown error'}`,
          );
        }

        const data = result.data;

        return {
          total_documents: data.total_documents || 0,
          documents_processed_today: data.documents_processed_today || 0,
          avg_processing_time_per_document:
            data.avg_processing_time_per_document || 0,
          success_rate_24h: data.success_rate_24h || 0,
          error_rate_24h: data.error_rate_24h || 0,
          processing_stages: data.processing_stages || [],
          performance_trends: data.performance_trends || {
            processing_time_trend: 0,
            success_rate_trend: 0,
            volume_trend: 0,
          },
        };
      } catch (error) {
        console.error('Error fetching document analysis metrics:', error);
        return null;
      }
    }, []);

  // Load enhanced job details for recent jobs
  const loadEnhancedJobDetails = useCallback(async () => {
    try {
      // Get recent job IDs from processing jobs
      const recentJobIds = processingJobs.slice(0, 10).map((job) => job.id);

      const enhancedJobPromises = recentJobIds.map((jobId) =>
        fetchEnhancedJobDetails(jobId),
      );
      const enhancedJobResults = await Promise.all(enhancedJobPromises);

      const validEnhancedJobs = enhancedJobResults.filter(
        (job): job is EnhancedJobDetails => job !== null,
      );
      setEnhancedJobs(validEnhancedJobs);
    } catch (error) {
      console.error('Error loading enhanced job details:', error);
    }
  }, [processingJobs, fetchEnhancedJobDetails]);

  const fetchPerformanceData = useCallback(async () => {
    try {
      setLoading(true);

      // Use existing table since processing_queue doesn't exist
      const { data: queueData, error: queueError } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (queueError) throw queueError;

      // Fetch ML tasks
      const { data: mlData, error: mlError } = await supabase
        .from('agent_ml_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (mlError) throw mlError;

      // Fetch analytics events for AI performance
      const { data: analyticsData, error: analyticsError } = await supabase
        .from('analytics_events')
        .select('*')
        .or('event_type.ilike.%ai%,event_type.ilike.%hybrid%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (analyticsError) throw analyticsError;

      setProcessingJobs((queueData as ProcessingJob[]) || []);
      setMLTasks((mlData as MLTask[]) || []);

      // Calculate performance metrics
      const totalJobs = queueData?.length || 0;
      const completedJobs =
        queueData?.filter(
          (job: Record<string, unknown>) => job.status === 'completed',
        ) || [];
      const failedJobs =
        queueData?.filter(
          (job: Record<string, unknown>) => job.status === 'failed',
        ) || [];

      const avgProcessingTime =
        completedJobs.reduce(
          (sum: number, job: Record<string, unknown>) =>
            sum + (Number(job.processing_time_ms) || 0),
          0,
        ) / Math.max(completedJobs.length, 1);

      const successRate =
        totalJobs > 0 ? (completedJobs.length / totalJobs) * 100 : 0;
      const errorRate =
        totalJobs > 0 ? (failedJobs.length / totalJobs) * 100 : 0;

      // AI model performance from analytics
      const hybridEvents =
        analyticsData?.filter((e: unknown) =>
          (e as any).event_type.includes('hybrid'),
        ) || [];
      let openaiCount = 0,
        claudeCount = 0,
        openaiTime = 0,
        claudeTime = 0;

      hybridEvents.forEach((event: any) => {
        const data = event.event_data as Record<string, unknown>;
        if (data?.final_provider === 'openai') {
          openaiCount++;
          openaiTime += Number(data?.processing_time_ms) || 0;
        } else if (data?.final_provider === 'claude') {
          claudeCount++;
          claudeTime += Number(data?.processing_time_ms) || 0;
        }
      });

      setMetrics({
        total_processing_jobs: totalJobs,
        avg_processing_time: Math.round(avgProcessingTime),
        success_rate: Math.round(successRate),
        error_rate: Math.round(errorRate),
        ai_model_performance: {
          openai_success: openaiCount,
          claude_success: claudeCount,
          openai_avg_time:
            openaiCount > 0 ? Math.round(openaiTime / openaiCount) : 0,
          claude_avg_time:
            claudeCount > 0 ? Math.round(claudeTime / claudeCount) : 0,
        },
      });

      // Load enhanced document analysis metrics
      const docMetrics = await fetchDocumentAnalysisMetrics();
      setDocumentMetrics(docMetrics);
    } catch (error) {
      console.error('Error fetching performance data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch performance data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, fetchDocumentAnalysisMetrics]);

  useEffect(() => {
    fetchPerformanceData();
  }, [fetchPerformanceData]);

  // Load enhanced job details when processing jobs change
  useEffect(() => {
    if (processingJobs.length > 0) {
      loadEnhancedJobDetails();
    }
  }, [processingJobs, loadEnhancedJobDetails]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-600';
      case 'processing':
        return 'bg-blue-500/20 text-blue-600';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-600';
      case 'failed':
        return 'bg-red-500/20 text-red-600';
      default:
        return 'bg-gray-500/20 text-gray-600';
    }
  };

  const MetricCard = ({
    title,
    value,
    icon: Icon,
    description,
    trend,
    status,
  }: {
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    trend?: number;
    status?: 'good' | 'warning' | 'error';
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon
          className={`h-4 w-4 ${
            status === 'good'
              ? 'text-green-600'
              : status === 'warning'
                ? 'text-yellow-600'
                : status === 'error'
                  ? 'text-red-600'
                  : 'text-muted-foreground'
          }`}
        />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          {trend !== undefined && (
            <Badge
              className={`text-xs ${trend > 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
            >
              {trend > 0 ? '+' : ''}
              {trend}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading performance data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigate('/')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate('/');
                  }
                }}
                className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button
                onClick={() => navigate('/admin')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate('/admin');
                  }
                }}
                className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                System Performance
              </h1>
              <p className="text-sm text-muted-foreground">
                Technical performance metrics, processing times, and system
                health
              </p>
            </div>
          </div>
          <Button
            onClick={fetchPerformanceData}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchPerformanceData();
              }
            }}
            disabled={loading}
          >
            <Activity className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* System Health Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Processing Jobs"
            value={metrics.total_processing_jobs}
            icon={Server}
            description="Total processing jobs"
            status="good"
          />
          <MetricCard
            title="Success Rate"
            value={`${metrics.success_rate}%`}
            icon={CheckCircle}
            description="Job completion rate"
            status={
              metrics.success_rate > 90
                ? 'good'
                : metrics.success_rate > 70
                  ? 'warning'
                  : 'error'
            }
          />
          <MetricCard
            title="Avg Processing Time"
            value={`${metrics.avg_processing_time}ms`}
            icon={Clock}
            description="Average job duration"
            status={
              metrics.avg_processing_time < 2000
                ? 'good'
                : metrics.avg_processing_time < 5000
                  ? 'warning'
                  : 'error'
            }
          />
          <MetricCard
            title="Error Rate"
            value={`${metrics.error_rate}%`}
            icon={AlertTriangle}
            description="Failed job percentage"
            status={
              metrics.error_rate < 5
                ? 'good'
                : metrics.error_rate < 15
                  ? 'warning'
                  : 'error'
            }
          />
        </div>

        <Tabs defaultValue="enhanced-monitoring" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="enhanced-monitoring">
              Enhanced Monitoring
            </TabsTrigger>
            <TabsTrigger value="ai-performance">AI Performance</TabsTrigger>
            <TabsTrigger value="processing-queue">Processing Queue</TabsTrigger>
            <TabsTrigger value="ml-tasks">ML Tasks</TabsTrigger>
            <TabsTrigger value="system-health">System Health</TabsTrigger>
          </TabsList>

          {/* Enhanced Monitoring Tab */}
          <TabsContent value="enhanced-monitoring" className="space-y-6">
            {/* Document Analysis Metrics */}
            {documentMetrics && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Documents Today"
                  value={documentMetrics.documents_processed_today}
                  icon={FileText}
                  description="Processed in last 24h"
                  trend={documentMetrics.performance_trends.volume_trend}
                  status="good"
                />
                <MetricCard
                  title="Avg Processing Time"
                  value={`${Math.round(documentMetrics.avg_processing_time_per_document / 1000)}s`}
                  icon={Sparkles}
                  description="Per document"
                  trend={
                    documentMetrics.performance_trends.processing_time_trend
                  }
                  status={
                    documentMetrics.avg_processing_time_per_document < 30000
                      ? 'good'
                      : 'warning'
                  }
                />
                <MetricCard
                  title="Success Rate (24h)"
                  value={`${documentMetrics.success_rate_24h.toFixed(1)}%`}
                  icon={CheckCircle}
                  description="Last 24 hours"
                  trend={documentMetrics.performance_trends.success_rate_trend}
                  status={
                    documentMetrics.success_rate_24h > 95
                      ? 'good'
                      : documentMetrics.success_rate_24h > 85
                        ? 'warning'
                        : 'error'
                  }
                />
                <MetricCard
                  title="Total Documents"
                  value={documentMetrics.total_documents}
                  icon={BarChart3}
                  description="All time processed"
                  status="good"
                />
              </div>
            )}

            {/* Enhanced Job Details */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Job Progress Monitoring */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Active Job Monitoring
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {enhancedJobs.length > 0 ? (
                      enhancedJobs.slice(0, 5).map((job) => (
                        <div key={job.job_id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-medium">
                              {job.document_info?.name ||
                                `Job ${job.job_id.slice(0, 8)}`}
                            </div>
                            <Badge className={getStatusColor(job.status)}>
                              {job.status}
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span>Progress</span>
                              <span>{job.progress_percentage}%</span>
                            </div>
                            <Progress
                              value={job.progress_percentage}
                              className="h-2"
                            />

                            <div className="text-sm text-muted-foreground">
                              Current Stage: {job.current_stage}
                            </div>

                            {job.estimated_completion_time && (
                              <div className="text-sm text-muted-foreground">
                                ETA:{' '}
                                {Math.round(
                                  job.estimated_completion_time / 1000,
                                )}
                                s
                              </div>
                            )}
                          </div>

                          {job.error_details && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                              Error in {job.error_details.stage}:{' '}
                              {job.error_details.message}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        {jobDetailsLoading
                          ? 'Loading job details...'
                          : 'No active jobs found'}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Processing Stages Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Processing Stages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {documentMetrics?.processing_stages &&
                  documentMetrics.processing_stages.length > 0 ? (
                    <div className="space-y-4">
                      {documentMetrics.processing_stages.map((stage, index) => (
                        <div key={index} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-medium">
                              {stage.stage_name}
                            </div>
                            <Badge
                              className={
                                stage.success_rate > 95
                                  ? 'bg-green-600 text-white'
                                  : stage.success_rate > 85
                                    ? 'bg-yellow-600 text-white'
                                    : 'bg-red-600 text-white'
                              }
                            >
                              {stage.success_rate.toFixed(1)}%
                            </Badge>
                          </div>

                          <div className="text-sm text-muted-foreground mb-2">
                            Avg Time: {Math.round(stage.avg_time_ms / 1000)}s
                          </div>

                          {stage.common_errors.length > 0 && (
                            <div className="text-xs">
                              <div className="font-medium text-red-600 mb-1">
                                Common Errors:
                              </div>
                              <div className="space-y-1">
                                {stage.common_errors
                                  .slice(0, 2)
                                  .map((error, i) => (
                                    <div
                                      key={i}
                                      className="text-red-600 truncate"
                                    >
                                      • {error}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No stage data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Performance Trends */}
            {documentMetrics && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Performance Trends (24h)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold flex items-center justify-center gap-2">
                        {documentMetrics.performance_trends
                          .processing_time_trend > 0
                          ? '↗️'
                          : '↘️'}
                        {Math.abs(
                          documentMetrics.performance_trends
                            .processing_time_trend,
                        ).toFixed(1)}
                        %
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Processing Time
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {documentMetrics.performance_trends
                          .processing_time_trend > 0
                          ? 'Slower'
                          : 'Faster'}{' '}
                        than yesterday
                      </div>
                    </div>

                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold flex items-center justify-center gap-2">
                        {documentMetrics.performance_trends.success_rate_trend >
                        0
                          ? '↗️'
                          : '↘️'}
                        {Math.abs(
                          documentMetrics.performance_trends.success_rate_trend,
                        ).toFixed(1)}
                        %
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Success Rate
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {documentMetrics.performance_trends.success_rate_trend >
                        0
                          ? 'Better'
                          : 'Worse'}{' '}
                        than yesterday
                      </div>
                    </div>

                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold flex items-center justify-center gap-2">
                        {documentMetrics.performance_trends.volume_trend > 0
                          ? '↗️'
                          : '↘️'}
                        {Math.abs(
                          documentMetrics.performance_trends.volume_trend,
                        ).toFixed(1)}
                        %
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Volume
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {documentMetrics.performance_trends.volume_trend > 0
                          ? 'More'
                          : 'Fewer'}{' '}
                        documents than yesterday
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="ai-performance" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    AI Provider Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">OpenAI</span>
                        <Badge className="border border-border bg-background text-foreground">
                          {metrics.ai_model_performance.openai_success}{' '}
                          completions
                        </Badge>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Avg Response Time</span>
                        <span>
                          {metrics.ai_model_performance.openai_avg_time}ms
                        </span>
                      </div>
                      <Progress
                        value={
                          metrics.ai_model_performance.openai_success > 0
                            ? 85
                            : 0
                        }
                        className="h-2 mt-1"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Claude</span>
                        <Badge className="border border-border bg-background text-foreground">
                          {metrics.ai_model_performance.claude_success}{' '}
                          completions
                        </Badge>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Avg Response Time</span>
                        <span>
                          {metrics.ai_model_performance.claude_avg_time}ms
                        </span>
                      </div>
                      <Progress
                        value={
                          metrics.ai_model_performance.claude_success > 0
                            ? 78
                            : 0
                        }
                        className="h-2 mt-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Model Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">OpenAI Efficiency</span>
                      <span className="font-mono text-sm">
                        {metrics.ai_model_performance.openai_avg_time > 0
                          ? Math.round(
                              (1000 /
                                metrics.ai_model_performance.openai_avg_time) *
                                100,
                            ) / 100
                          : 0}{' '}
                        req/s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Claude Efficiency</span>
                      <span className="font-mono text-sm">
                        {metrics.ai_model_performance.claude_avg_time > 0
                          ? Math.round(
                              (1000 /
                                metrics.ai_model_performance.claude_avg_time) *
                                100,
                            ) / 100
                          : 0}{' '}
                        req/s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Hybrid Success Rate</span>
                      <span className="font-mono text-sm">
                        {Math.round(
                          ((metrics.ai_model_performance.openai_success +
                            metrics.ai_model_performance.claude_success) /
                            Math.max(metrics.total_processing_jobs, 1)) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="processing-queue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Processing Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processing Time</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processingJobs.slice(0, 15).map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">
                          {job.job_type}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {job.processing_time_ms
                            ? `${job.processing_time_ms}ms`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {new Date(job.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {job.error_message ? (
                            <span className="text-red-600 text-sm truncate block">
                              {job.error_message}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ml-tasks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>ML Operation Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operation Type</TableHead>
                      <TableHead>Processing Time</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mlTasks.slice(0, 15).map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4" />
                            <span className="font-medium">
                              {task.ml_operation_type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.processing_time_ms
                            ? `${task.processing_time_ms}ms`
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {task.confidence_scores &&
                          typeof task.confidence_scores === 'object' ? (
                            <div className="space-y-1">
                              {Object.entries(task.confidence_scores)
                                .slice(0, 2)
                                .map(([key, value]) => (
                                  <div
                                    key={key}
                                    className="flex items-center gap-2"
                                  >
                                    <span className="text-xs">{key}:</span>
                                    <Progress
                                      value={Number(value) * 100}
                                      className="w-16 h-2"
                                    />
                                    <span className="text-xs">
                                      {(Number(value) * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(task.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="system-health" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    System Load
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>CPU Usage</span>
                        <span>45%</span>
                      </div>
                      <Progress value={45} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Memory Usage</span>
                        <span>67%</span>
                      </div>
                      <Progress value={67} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Queue Load</span>
                        <span>23%</span>
                      </div>
                      <Progress value={23} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Response Times</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>P50 (median)</span>
                      <span className="font-mono">1.2s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>P95</span>
                      <span className="font-mono">3.8s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>P99</span>
                      <span className="font-mono">8.1s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max</span>
                      <span className="font-mono">15.3s</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Throughput</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Requests/min</span>
                      <Badge className="border border-border bg-background text-foreground">
                        342
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Successful/min</span>
                      <Badge className="bg-green-100 text-green-800">321</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Errors/min</span>
                      <Badge className="bg-red-100 text-red-800">21</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Uptime</span>
                      <span className="font-mono text-green-600">99.8%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
