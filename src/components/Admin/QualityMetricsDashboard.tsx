/**
 * Quality Metrics Dashboard
 *
 * Displays retrieval and response quality metrics collected from search and LLM operations
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Type assertions for recharts components
const RechartResponsiveContainer = ResponsiveContainer as any;
const RechartBarChart = BarChart as any;
const RechartLineChart = LineChart as any;
const RechartXAxis = XAxis as any;
const RechartYAxis = YAxis as any;
const RechartCartesianGrid = CartesianGrid as any;
const RechartTooltip = Tooltip as any;
const RechartLegend = Legend as any;
const RechartLine = Line as any;
const RechartBar = Bar as any;

interface RetrievalMetric {
  id: string;
  query: string;
  precision: number;
  recall: number;
  mrr: number;
  latency_ms: number;
  created_at: string;
}

interface ResponseMetric {
  id: string;
  query: string;
  coherence_score: number;
  hallucination_score: number;
  source_attribution_score: number;
  factual_consistency_score: number;
  overall_quality_score: number;
  quality_assessment: string;
  created_at: string;
}

interface MetricsStats {
  avgPrecision: number;
  avgRecall: number;
  avgMRR: number;
  avgLatency: number;
  avgCoherence: number;
  avgHallucination: number;
  avgAttribution: number;
  avgConsistency: number;
  avgResponseQuality: number;
}

export const QualityMetricsDashboard: React.FC = () => {
  const [retrievalMetrics, setRetrievalMetrics] = useState<RetrievalMetric[]>(
    [],
  );
  const [responseMetrics, setResponseMetrics] = useState<ResponseMetric[]>([]);
  const [stats, setStats] = useState<MetricsStats>({
    avgPrecision: 0,
    avgRecall: 0,
    avgMRR: 0,
    avgLatency: 0,
    avgCoherence: 0,
    avgHallucination: 0,
    avgAttribution: 0,
    avgConsistency: 0,
    avgResponseQuality: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);

      // Load retrieval quality metrics
      const { data: retrievalData, error: retrievalError } = await supabase
        .from('retrieval_quality_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (retrievalError) throw retrievalError;
      setRetrievalMetrics(retrievalData || []);

      // Load response quality metrics
      const { data: responseData, error: responseError } = await supabase
        .from('response_quality_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (responseError) throw responseError;
      setResponseMetrics(responseData || []);

      // Calculate statistics
      if (retrievalData && retrievalData.length > 0) {
        const avgPrecision =
          retrievalData.reduce(
            (sum: number, m: any) => sum + (m.precision || 0),
            0,
          ) / retrievalData.length;
        const avgRecall =
          retrievalData.reduce(
            (sum: number, m: any) => sum + (m.recall || 0),
            0,
          ) / retrievalData.length;
        const avgMRR =
          retrievalData.reduce((sum: number, m: any) => sum + (m.mrr || 0), 0) /
          retrievalData.length;
        const avgLatency =
          retrievalData.reduce(
            (sum: number, m: any) => sum + (m.latency_ms || 0),
            0,
          ) / retrievalData.length;

        setStats((prev) => ({
          ...prev,
          avgPrecision,
          avgRecall,
          avgMRR,
          avgLatency,
        }));
      }

      if (responseData && responseData.length > 0) {
        const avgCoherence =
          responseData.reduce(
            (sum: number, m: any) => sum + (m.coherence_score || 0),
            0,
          ) / responseData.length;
        const avgHallucination =
          responseData.reduce(
            (sum: number, m: any) => sum + (m.hallucination_score || 0),
            0,
          ) / responseData.length;
        const avgAttribution =
          responseData.reduce(
            (sum: number, m: any) => sum + (m.source_attribution_score || 0),
            0,
          ) / responseData.length;
        const avgConsistency =
          responseData.reduce(
            (sum: number, m: any) => sum + (m.factual_consistency_score || 0),
            0,
          ) / responseData.length;
        const avgResponseQuality =
          responseData.reduce(
            (sum: number, m: any) => sum + (m.overall_quality_score || 0),
            0,
          ) / responseData.length;

        setStats((prev) => ({
          ...prev,
          avgCoherence,
          avgHallucination,
          avgAttribution,
          avgConsistency,
          avgResponseQuality,
        }));
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [loadMetrics]);

  const getQualityColor = (score: number) => {
    if (score >= 0.85) return 'text-green-600';
    if (score >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualityBadge = (score: number) => {
    if (score >= 0.85)
      return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (score >= 0.7)
      return <Badge className="bg-yellow-100 text-yellow-800">Good</Badge>;
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>;
  };

  if (loading) {
    return <div className="p-6">Loading quality metrics...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Precision</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${getQualityColor(stats.avgPrecision)}`}
            >
              {(stats.avgPrecision * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Retrieval accuracy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Recall</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${getQualityColor(stats.avgRecall)}`}
            >
              {(stats.avgRecall * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Retrieval completeness
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Avg Response Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${getQualityColor(stats.avgResponseQuality)}`}
            >
              {(stats.avgResponseQuality * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              LLM response quality
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.avgLatency.toFixed(0)}ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Search response time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed metrics */}
      <Tabs defaultValue="retrieval" className="w-full">
        <TabsList>
          <TabsTrigger value="retrieval">Retrieval Quality</TabsTrigger>
          <TabsTrigger value="response">Response Quality</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="retrieval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Retrieval Quality Metrics</CardTitle>
              <CardDescription>
                {retrievalMetrics.length} searches analyzed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {retrievalMetrics.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No retrieval metrics collected yet. Perform searches to
                    generate data.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="font-semibold mb-2">
                        Precision Distribution
                      </h4>
                      <RechartResponsiveContainer width="100%" height={200}>
                        <RechartBarChart data={retrievalMetrics.slice(0, 10)}>
                          <RechartCartesianGrid strokeDasharray="3 3" />
                          <RechartXAxis dataKey="query" width={50} />
                          <RechartYAxis />
                          <RechartTooltip />
                          <RechartBar dataKey="precision" fill="#8884d8" />
                        </RechartBarChart>
                      </RechartResponsiveContainer>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">
                        Recall Distribution
                      </h4>
                      <RechartResponsiveContainer width="100%" height={200}>
                        <RechartBarChart data={retrievalMetrics.slice(0, 10)}>
                          <RechartCartesianGrid strokeDasharray="3 3" />
                          <RechartXAxis dataKey="query" width={50} />
                          <RechartYAxis />
                          <RechartTooltip />
                          <RechartBar dataKey="recall" fill="#82ca9d" />
                        </RechartBarChart>
                      </RechartResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="response" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Response Quality Metrics</CardTitle>
              <CardDescription>
                {responseMetrics.length} responses analyzed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {responseMetrics.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No response metrics collected yet. Generate LLM responses to
                    collect data.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="font-semibold mb-2">Quality Scores</h4>
                      <RechartResponsiveContainer width="100%" height={200}>
                        <RechartBarChart data={responseMetrics.slice(0, 10)}>
                          <RechartCartesianGrid strokeDasharray="3 3" />
                          <RechartXAxis dataKey="query" width={50} />
                          <RechartYAxis />
                          <RechartTooltip />
                          <RechartBar
                            dataKey="overall_quality_score"
                            fill="#ffc658"
                          />
                        </RechartBarChart>
                      </RechartResponsiveContainer>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">
                        Assessment Distribution
                      </h4>
                      <div className="space-y-2">
                        {responseMetrics.map((metric) => (
                          <div
                            key={metric.id}
                            className="flex justify-between items-center text-sm"
                          >
                            <span className="truncate">
                              {metric.query.substring(0, 30)}...
                            </span>
                            {getQualityBadge(metric.overall_quality_score)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quality Trends</CardTitle>
              <CardDescription>Metrics over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">
                    Retrieval Quality Trend
                  </h4>
                  <RechartResponsiveContainer width="100%" height={250}>
                    <RechartLineChart
                      data={retrievalMetrics.slice(0, 20).reverse()}
                    >
                      <RechartCartesianGrid strokeDasharray="3 3" />
                      <RechartXAxis dataKey="created_at" />
                      <RechartYAxis />
                      <RechartTooltip />
                      <RechartLegend />
                      <RechartLine
                        type="monotone"
                        dataKey="precision"
                        stroke="#8884d8"
                        name="Precision"
                      />
                      <RechartLine
                        type="monotone"
                        dataKey="recall"
                        stroke="#82ca9d"
                        name="Recall"
                      />
                    </RechartLineChart>
                  </RechartResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QualityMetricsDashboard;
