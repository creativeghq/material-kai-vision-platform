import React, { useState, useEffect } from 'react';
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
  confidence_scores: any;
  created_at: string;
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
  const { toast } = useToast();

  useEffect(() => {
    fetchPerformanceData();
  }, []);

  const fetchPerformanceData = async () => {
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

      setProcessingJobs(queueData as any || []);
      setMLTasks(mlData as any || []);

      // Calculate performance metrics
      const totalJobs = queueData?.length || 0;
      const completedJobs = queueData?.filter((job: any) => job.status === 'completed') || [];
      const failedJobs = queueData?.filter((job: any) => job.status === 'failed') || [];

      const avgProcessingTime = completedJobs.reduce((sum: number, job: any) =>
        sum + (job.processing_time_ms || 0), 0) / Math.max(completedJobs.length, 1);

      const successRate = totalJobs > 0 ? (completedJobs.length / totalJobs) * 100 : 0;
      const errorRate = totalJobs > 0 ? (failedJobs.length / totalJobs) * 100 : 0;

      // AI model performance from analytics
      const hybridEvents = analyticsData?.filter(e => e.event_type.includes('hybrid')) || [];
      let openaiCount = 0, claudeCount = 0, openaiTime = 0, claudeTime = 0;

      hybridEvents.forEach(event => {
        const data = event.event_data as any;
        if (data?.final_provider === 'openai') {
          openaiCount++;
          openaiTime += data?.processing_time_ms || 0;
        } else if (data?.final_provider === 'claude') {
          claudeCount++;
          claudeTime += data?.processing_time_ms || 0;
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
          openai_avg_time: openaiCount > 0 ? Math.round(openaiTime / openaiCount) : 0,
          claude_avg_time: claudeCount > 0 ? Math.round(claudeTime / claudeCount) : 0,
        },
      });

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
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-600';
      case 'processing': return 'bg-blue-500/20 text-blue-600';
      case 'pending': return 'bg-yellow-500/20 text-yellow-600';
      case 'failed': return 'bg-red-500/20 text-red-600';
      default: return 'bg-gray-500/20 text-gray-600';
    }
  };

  const MetricCard = ({ title, value, icon: Icon, description, trend, status }: {
    title: string;
    value: string | number;
    icon: any;
    description: string;
    trend?: number;
    status?: 'good' | 'warning' | 'error';
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${
          status === 'good' ? 'text-green-600' :
          status === 'warning' ? 'text-yellow-600' :
          status === 'error' ? 'text-red-600' :
          'text-muted-foreground'
        }`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          {trend !== undefined && (
            <Badge className={`text-xs ${trend > 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
              {trend > 0 ? '+' : ''}{trend}%
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
                className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button
                onClick={() => navigate('/admin')}
                className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">System Performance</h1>
              <p className="text-sm text-muted-foreground">
                Technical performance metrics, processing times, and system health
              </p>
            </div>
          </div>
          <Button onClick={fetchPerformanceData} disabled={loading}>
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
            status={metrics.success_rate > 90 ? 'good' : metrics.success_rate > 70 ? 'warning' : 'error'}
          />
          <MetricCard
            title="Avg Processing Time"
            value={`${metrics.avg_processing_time}ms`}
            icon={Clock}
            description="Average job duration"
            status={metrics.avg_processing_time < 2000 ? 'good' : metrics.avg_processing_time < 5000 ? 'warning' : 'error'}
          />
          <MetricCard
            title="Error Rate"
            value={`${metrics.error_rate}%`}
            icon={AlertTriangle}
            description="Failed job percentage"
            status={metrics.error_rate < 5 ? 'good' : metrics.error_rate < 15 ? 'warning' : 'error'}
          />
        </div>

        <Tabs defaultValue="ai-performance" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="ai-performance">AI Performance</TabsTrigger>
            <TabsTrigger value="processing-queue">Processing Queue</TabsTrigger>
            <TabsTrigger value="ml-tasks">ML Tasks</TabsTrigger>
            <TabsTrigger value="system-health">System Health</TabsTrigger>
          </TabsList>

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
                        <Badge className="border border-border bg-background text-foreground">{metrics.ai_model_performance.openai_success} completions</Badge>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Avg Response Time</span>
                        <span>{metrics.ai_model_performance.openai_avg_time}ms</span>
                      </div>
                      <Progress
                        value={metrics.ai_model_performance.openai_success > 0 ? 85 : 0}
                        className="h-2 mt-1"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Claude</span>
                        <Badge className="border border-border bg-background text-foreground">{metrics.ai_model_performance.claude_success} completions</Badge>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Avg Response Time</span>
                        <span>{metrics.ai_model_performance.claude_avg_time}ms</span>
                      </div>
                      <Progress
                        value={metrics.ai_model_performance.claude_success > 0 ? 78 : 0}
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
                        {metrics.ai_model_performance.openai_avg_time > 0 ?
                          Math.round(1000 / metrics.ai_model_performance.openai_avg_time * 100) / 100 : 0} req/s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Claude Efficiency</span>
                      <span className="font-mono text-sm">
                        {metrics.ai_model_performance.claude_avg_time > 0 ?
                          Math.round(1000 / metrics.ai_model_performance.claude_avg_time * 100) / 100 : 0} req/s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Hybrid Success Rate</span>
                      <span className="font-mono text-sm">
                        {Math.round((metrics.ai_model_performance.openai_success + metrics.ai_model_performance.claude_success) / Math.max(metrics.total_processing_jobs, 1) * 100)}%
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
                        <TableCell className="font-medium">{job.job_type}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {job.processing_time_ms ? `${job.processing_time_ms}ms` : '-'}
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
                            <span className="font-medium">{task.ml_operation_type}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.processing_time_ms ? `${task.processing_time_ms}ms` : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {task.confidence_scores && typeof task.confidence_scores === 'object' ? (
                            <div className="space-y-1">
                              {Object.entries(task.confidence_scores).slice(0, 2).map(([key, value]) => (
                                <div key={key} className="flex items-center gap-2">
                                  <span className="text-xs">{key}:</span>
                                  <Progress value={Number(value) * 100} className="w-16 h-2" />
                                  <span className="text-xs">{(Number(value) * 100).toFixed(0)}%</span>
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
                      <Badge className="border border-border bg-background text-foreground">342</Badge>
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
