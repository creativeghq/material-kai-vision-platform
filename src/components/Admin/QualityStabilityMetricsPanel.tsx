import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Activity,
  ArrowLeft,
  RefreshCw,
  Download,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface QualityMetrics {
  total_chunks: number;
  chunks_with_scores: number;
  average_score: number;
  min_score: number;
  max_score: number;
  excellent_count: number;
  very_good_count: number;
  good_count: number;
  fair_count: number;
  acceptable_count: number;
  poor_count: number;
}

interface StabilityMetrics {
  total_chunks: number;
  average_stability: number;
  average_consistency: number;
  average_variance: number;
  anomalies_detected: number;
  anomaly_rate: number;
}

interface DocumentMetrics {
  document_id: string;
  document_name: string;
  created_at: string;
  quality_metrics: QualityMetrics;
  stability_metrics: StabilityMetrics;
  overall_health: number;
}

const QualityStabilityMetricsPanel: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocumentMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setRefreshing(true);

      // Get recent documents
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, document_name, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (docsError) throw docsError;

      const metricsData: DocumentMetrics[] = [];

      for (const doc of docs || []) {
        // Get quality metrics
        const { data: qualityChunks } = await supabase
          .from('document_chunks')
          .select('coherence_score, quality_assessment')
          .eq('document_id', doc.id);

        // Get stability metrics
        const { data: stabilityMetrics } = await supabase
          .from('embedding_stability_metrics')
          .select('stability_score, consistency_score, variance_score, anomaly_detected')
          .eq('document_id', doc.id);

        if (qualityChunks && qualityChunks.length > 0) {
          const scores = qualityChunks
            .map(c => c.coherence_score)
            .filter(s => s !== null) as number[];

          const assessments = qualityChunks.map(c => c.quality_assessment);

          const qualityMetrics: QualityMetrics = {
            total_chunks: qualityChunks.length,
            chunks_with_scores: scores.length,
            average_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
            min_score: scores.length > 0 ? Math.min(...scores) : 0,
            max_score: scores.length > 0 ? Math.max(...scores) : 0,
            excellent_count: assessments.filter(a => a === 'Excellent').length,
            very_good_count: assessments.filter(a => a === 'Very Good').length,
            good_count: assessments.filter(a => a === 'Good').length,
            fair_count: assessments.filter(a => a === 'Fair').length,
            acceptable_count: assessments.filter(a => a === 'Acceptable').length,
            poor_count: assessments.filter(a => a === 'Poor').length,
          };

          let stabilityMetrics: StabilityMetrics = {
            total_chunks: 0,
            average_stability: 0,
            average_consistency: 0,
            average_variance: 0,
            anomalies_detected: 0,
            anomaly_rate: 0,
          };

          if (stabilityMetrics && stabilityMetrics.length > 0) {
            const stabilityScores = stabilityMetrics.map(m => m.stability_score);
            const consistencyScores = stabilityMetrics.map(m => m.consistency_score);
            const varianceScores = stabilityMetrics.map(m => m.variance_score);
            const anomalies = stabilityMetrics.filter(m => m.anomaly_detected).length;

            stabilityMetrics = {
              total_chunks: stabilityMetrics.length,
              average_stability: stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length,
              average_consistency: consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length,
              average_variance: varianceScores.reduce((a, b) => a + b, 0) / varianceScores.length,
              anomalies_detected: anomalies,
              anomaly_rate: anomalies / stabilityMetrics.length,
            };
          }

          const overallHealth = (
            qualityMetrics.average_score * 0.4 +
            stabilityMetrics.average_stability * 0.35 +
            stabilityMetrics.average_consistency * 0.25
          );

          metricsData.push({
            document_id: doc.id,
            document_name: doc.document_name || 'Unknown',
            created_at: doc.created_at,
            quality_metrics: qualityMetrics,
            stability_metrics: stabilityMetrics,
            overall_health: overallHealth,
          });
        }
      }

      setDocuments(metricsData);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch quality and stability metrics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const getHealthBadge = (score: number) => {
    if (score >= 0.85) return <Badge className="bg-green-600">Excellent</Badge>;
    if (score >= 0.75) return <Badge className="bg-green-500">Very Good</Badge>;
    if (score >= 0.65) return <Badge className="bg-blue-500">Good</Badge>;
    if (score >= 0.50) return <Badge className="bg-yellow-500">Acceptable</Badge>;
    return <Badge className="bg-red-500">Needs Improvement</Badge>;
  };

  const getScoreBadge = (score: number) => {
    if (score >= 0.9) return <Badge className="bg-green-600">Excellent</Badge>;
    if (score >= 0.8) return <Badge className="bg-green-500">Very Good</Badge>;
    if (score >= 0.7) return <Badge className="bg-blue-500">Good</Badge>;
    if (score >= 0.6) return <Badge className="bg-yellow-500">Fair</Badge>;
    if (score >= 0.5) return <Badge className="bg-orange-500">Acceptable</Badge>;
    return <Badge className="bg-red-500">Poor</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="Quality & Stability Metrics"
        description="Monitor PDF chunk quality scoring and embedding stability analysis"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Quality & Stability Metrics' },
        ]}
      />

      <div className="p-6 space-y-6">
        {/* Refresh Button */}
        <div className="flex justify-end">
          <Button
            onClick={fetchMetrics}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Metrics'}
          </Button>
        </div>

        {/* Summary Cards */}
        {documents.length > 0 && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Documents Analyzed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{documents.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Quality Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((documents.reduce((sum, d) => sum + d.quality_metrics.average_score, 0) / documents.length) * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Stability</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((documents.reduce((sum, d) => sum + d.stability_metrics.average_stability, 0) / documents.length) * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Platform Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((documents.reduce((sum, d) => sum + d.overall_health, 0) / documents.length) * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle>Document Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading metrics...</div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No documents with metrics found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Quality Score</TableHead>
                      <TableHead>Stability</TableHead>
                      <TableHead>Consistency</TableHead>
                      <TableHead>Anomalies</TableHead>
                      <TableHead>Overall Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.document_id}>
                        <TableCell className="font-medium">{doc.document_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{(doc.quality_metrics.average_score * 100).toFixed(1)}%</span>
                            {getScoreBadge(doc.quality_metrics.average_score)}
                          </div>
                        </TableCell>
                        <TableCell>{(doc.stability_metrics.average_stability * 100).toFixed(1)}%</TableCell>
                        <TableCell>{(doc.stability_metrics.average_consistency * 100).toFixed(1)}%</TableCell>
                        <TableCell>
                          {doc.stability_metrics.anomalies_detected > 0 ? (
                            <Badge className="bg-red-500">{doc.stability_metrics.anomalies_detected}</Badge>
                          ) : (
                            <Badge className="bg-green-500">0</Badge>
                          )}
                        </TableCell>
                        <TableCell>{getHealthBadge(doc.overall_health)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detailed Metrics */}
        {documents.length > 0 && (
          <Tabs defaultValue="quality" className="space-y-4">
            <TabsList>
              <TabsTrigger value="quality">Quality Distribution</TabsTrigger>
              <TabsTrigger value="stability">Stability Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="quality" className="space-y-4">
              {documents.map((doc) => (
                <Card key={doc.document_id}>
                  <CardHeader>
                    <CardTitle className="text-base">{doc.document_name} - Quality Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="text-sm font-medium mb-2">Excellent</div>
                        <Progress value={(doc.quality_metrics.excellent_count / doc.quality_metrics.total_chunks) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{doc.quality_metrics.excellent_count} chunks</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Very Good</div>
                        <Progress value={(doc.quality_metrics.very_good_count / doc.quality_metrics.total_chunks) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{doc.quality_metrics.very_good_count} chunks</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Good</div>
                        <Progress value={(doc.quality_metrics.good_count / doc.quality_metrics.total_chunks) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{doc.quality_metrics.good_count} chunks</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Fair</div>
                        <Progress value={(doc.quality_metrics.fair_count / doc.quality_metrics.total_chunks) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{doc.quality_metrics.fair_count} chunks</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Acceptable</div>
                        <Progress value={(doc.quality_metrics.acceptable_count / doc.quality_metrics.total_chunks) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{doc.quality_metrics.acceptable_count} chunks</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Poor</div>
                        <Progress value={(doc.quality_metrics.poor_count / doc.quality_metrics.total_chunks) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{doc.quality_metrics.poor_count} chunks</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="stability" className="space-y-4">
              {documents.map((doc) => (
                <Card key={doc.document_id}>
                  <CardHeader>
                    <CardTitle className="text-base">{doc.document_name} - Stability Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-sm font-medium mb-2">Stability Score</div>
                        <Progress value={doc.stability_metrics.average_stability * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{(doc.stability_metrics.average_stability * 100).toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Consistency Score</div>
                        <Progress value={doc.stability_metrics.average_consistency * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{(doc.stability_metrics.average_consistency * 100).toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Variance Score</div>
                        <Progress value={doc.stability_metrics.average_variance * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{(doc.stability_metrics.average_variance * 100).toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">Anomaly Rate</div>
                        <Progress value={doc.stability_metrics.anomaly_rate * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{(doc.stability_metrics.anomaly_rate * 100).toFixed(1)}% ({doc.stability_metrics.anomalies_detected} anomalies)</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default QualityStabilityMetricsPanel;

