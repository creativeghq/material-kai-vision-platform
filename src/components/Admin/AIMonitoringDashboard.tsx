/**
 * AI Monitoring Dashboard
 *
 * Comprehensive admin dashboard for monitoring AI usage across the platform:
 * - Real-time cost tracking
 * - Model usage statistics
 * - Confidence score distribution
 * - Latency metrics
 * - Fallback rate tracking
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  DollarSign,
  Zap,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface AIMetricsSummary {
  total_calls: number;
  total_cost: number;
  total_tokens: number;
  average_latency_ms: number;
  average_confidence: number;
  fallback_rate: number;
  time_period: string;
}

interface ModelUsageStats {
  model: string;
  call_count: number;
  total_cost: number;
  total_tokens: number;
  average_latency_ms: number;
  average_confidence: number;
  fallback_count: number;
}

interface TaskBreakdown {
  task: string;
  call_count: number;
  total_cost: number;
  average_confidence: number;
  models_used: string[];
}

interface ConfidenceDistribution {
  range: string;
  count: number;
  percentage: number;
}

interface AIMetricsResponse {
  summary: AIMetricsSummary;
  model_usage: ModelUsageStats[];
  task_breakdown: TaskBreakdown[];
  confidence_distribution: ConfidenceDistribution[];
  recent_calls: any[];
}

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
];

export const AIMonitoringDashboard: React.FC = () => {
  const [timePeriod, setTimePeriod] = useState<string>('24h');
  const [metrics, setMetrics] = useState<AIMetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${import.meta.env.VITE_MIVAA_API_URL || 'http://localhost:8000'}/api/v1/ai-metrics/summary?time_period=${timePeriod}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      console.error('Error fetching AI metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [timePeriod]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, timePeriod]);

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatNumber = (num: number) => num.toLocaleString();
  const formatPercentage = (num: number) => `${(num * 100).toFixed(1)}%`;

  if (loading && !metrics) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="AI Monitoring Dashboard"
          description="Real-time AI usage, costs, and performance metrics"
          badge="Analytics"
        />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading AI metrics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="AI Monitoring Dashboard"
          description="Real-time AI usage, costs, and performance metrics"
          badge="Analytics"
        />
        <div className="flex items-center justify-center h-96">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Error Loading Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchMetrics} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="AI Monitoring Dashboard"
        description="Real-time AI usage, costs, and performance metrics"
        badge="Analytics"
      />

      <div className="p-6 space-y-6">
        {/* Header Controls */}
        <div className="flex items-center justify-end gap-4">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`}
            />
            Auto Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={fetchMetrics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards - Compact Design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Total Cost</p>
            </div>
            <div className="text-2xl font-bold">
              {formatCost(metrics.summary.total_cost)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(metrics.summary.total_calls)} AI calls
            </p>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Avg Confidence</p>
            </div>
            <div className="text-2xl font-bold">
              {formatPercentage(metrics.summary.average_confidence)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Quality score across all calls
            </p>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Avg Latency</p>
            </div>
            <div className="text-2xl font-bold">
              {Math.round(metrics.summary.average_latency_ms)}ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Average response time
            </p>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Fallback Rate</p>
            </div>
            <div className="text-2xl font-bold">
              {formatPercentage(metrics.summary.fallback_rate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              AI failures requiring fallback
            </p>
          </div>
        </div>

      {/* Tabs */}
      <Tabs defaultValue="models" className="space-y-4">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
          <TabsTrigger value="models" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Model Usage
          </TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Task Breakdown
          </TabsTrigger>
          <TabsTrigger value="confidence" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Confidence Distribution
          </TabsTrigger>
          <TabsTrigger value="recent" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Recent Calls
          </TabsTrigger>
        </TabsList>

        {/* Model Usage Tab */}
        <TabsContent value="models" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Model Usage Table */}
            <Card>
              <CardHeader>
                <CardTitle>Model Statistics</CardTitle>
                <CardDescription>
                  Cost and performance by AI model
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {metrics.model_usage.map((model, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{model.model}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatNumber(model.call_count)} calls •{' '}
                          {formatCost(model.total_cost)}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={
                            model.average_confidence > 0.8
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {formatPercentage(model.average_confidence)}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {Math.round(model.average_latency_ms)}ms
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Cost Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Distribution</CardTitle>
                <CardDescription>Spending by model</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.model_usage}
                      dataKey="total_cost"
                      nameKey="model"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) =>
                        `${entry.model}: ${formatCost(entry.total_cost)}`
                      }
                    >
                      {metrics.model_usage.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCost(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Task Breakdown Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Task Performance</CardTitle>
              <CardDescription>AI usage by task type</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={metrics.task_breakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="task"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="total_cost"
                    fill="#8884d8"
                    name="Cost ($)"
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="call_count"
                    fill="#82ca9d"
                    name="Calls"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Confidence Distribution Tab */}
        <TabsContent value="confidence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Confidence Score Distribution</CardTitle>
              <CardDescription>
                Quality distribution across all AI calls
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.confidence_distribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" name="Number of Calls" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Calls Tab */}
        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent AI Calls</CardTitle>
              <CardDescription>Last 20 AI API calls</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics.recent_calls.map((call, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 border rounded-lg text-sm"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{call.task}</div>
                      <div className="text-xs text-muted-foreground">
                        {call.model} •{' '}
                        {new Date(call.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div>{formatCost(call.cost || 0)}</div>
                        <div className="text-xs text-muted-foreground">
                          {call.latency_ms}ms
                        </div>
                      </div>
                      {call.action === 'use_ai_result' ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default AIMonitoringDashboard;
