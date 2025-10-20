import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Link2, Search, MessageSquare } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { GlobalAdminHeader } from './GlobalAdminHeader';

interface RelationshipStats {
  total_relationships: number;
  sequential: number;
  semantic: number;
  hierarchical: number;
  avg_confidence: number;
}

interface RetrievalMetrics {
  avg_precision: number;
  avg_recall: number;
  avg_mrr: number;
  avg_latency_ms: number;
  total_queries: number;
}

interface ResponseMetrics {
  avg_coherence: number;
  avg_hallucination: number;
  avg_attribution: number;
  avg_consistency: number;
  avg_overall: number;
  total_responses: number;
}

const Phase3MetricsPanel: React.FC = () => {
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const [relationshipStats, setRelationshipStats] = useState<RelationshipStats>({
    total_relationships: 0,
    sequential: 0,
    semantic: 0,
    hierarchical: 0,
    avg_confidence: 0,
  });

  const [retrievalMetrics, setRetrievalMetrics] = useState<RetrievalMetrics>({
    avg_precision: 0,
    avg_recall: 0,
    avg_mrr: 0,
    avg_latency_ms: 0,
    total_queries: 0,
  });

  const [responseMetrics, setResponseMetrics] = useState<ResponseMetrics>({
    avg_coherence: 0,
    avg_hallucination: 0,
    avg_attribution: 0,
    avg_consistency: 0,
    avg_overall: 0,
    total_responses: 0,
  });

  const fetchMetrics = useCallback(async () => {
    try {
      setRefreshing(true);

      // Fetch relationship statistics
      const { data: relationships } = await supabase
        .from('knowledge_relationships')
        .select('relationship_type, confidence_score')
        .eq('source_type', 'chunk');

      if (relationships) {
        const byType: Record<string, number> = {};
        let totalConfidence = 0;

        for (const rel of relationships) {
          byType[rel.relationship_type] = (byType[rel.relationship_type] || 0) + 1;
          totalConfidence += rel.confidence_score || 0;
        }

        setRelationshipStats({
          total_relationships: relationships.length,
          sequential: byType['sequential'] || 0,
          semantic: byType['semantic'] || 0,
          hierarchical: byType['hierarchical'] || 0,
          avg_confidence: relationships.length > 0 ? totalConfidence / relationships.length : 0,
        });
      }

      // Fetch retrieval quality metrics
      const { data: retrievalData } = await supabase
        .from('retrieval_quality_metrics')
        .select('precision, recall, mrr, latency_ms')
        .order('created_at', { ascending: false })
        .limit(100);

      if (retrievalData && retrievalData.length > 0) {
        setRetrievalMetrics({
          avg_precision: retrievalData.reduce((sum: number, m: any) => sum + m.precision, 0) / retrievalData.length,
          avg_recall: retrievalData.reduce((sum: number, m: any) => sum + m.recall, 0) / retrievalData.length,
          avg_mrr: retrievalData.reduce((sum: number, m: any) => sum + m.mrr, 0) / retrievalData.length,
          avg_latency_ms: retrievalData.reduce((sum: number, m: any) => sum + m.latency_ms, 0) / retrievalData.length,
          total_queries: retrievalData.length,
        });
      }

      // Fetch response quality metrics
      const { data: responseData } = await supabase
        .from('response_quality_metrics')
        .select('coherence_score, hallucination_score, source_attribution_score, factual_consistency_score, overall_quality_score')
        .order('created_at', { ascending: false })
        .limit(100);

      if (responseData && responseData.length > 0) {
        setResponseMetrics({
          avg_coherence: responseData.reduce((sum: number, m: any) => sum + m.coherence_score, 0) / responseData.length,
          avg_hallucination: responseData.reduce((sum: number, m: any) => sum + m.hallucination_score, 0) / responseData.length,
          avg_attribution: responseData.reduce((sum: number, m: any) => sum + m.source_attribution_score, 0) / responseData.length,
          avg_consistency: responseData.reduce((sum: number, m: any) => sum + m.factual_consistency_score, 0) / responseData.length,
          avg_overall: responseData.reduce((sum: number, m: any) => sum + m.overall_quality_score, 0) / responseData.length,
          total_responses: responseData.length,
        });
      }
    } catch (error) {
      console.error('Error fetching Phase 3 metrics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch Phase 3 metrics',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const getHealthColor = (score: number) => {
    if (score > 0.85) return 'bg-green-100 text-green-800';
    if (score > 0.75) return 'bg-blue-100 text-blue-800';
    if (score > 0.65) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getHealthLabel = (score: number) => {
    if (score > 0.85) return 'Excellent';
    if (score > 0.75) return 'Good';
    if (score > 0.65) return 'Fair';
    return 'Poor';
  };

  const overallHealth = (
    relationshipStats.avg_confidence * 0.3 +
    (retrievalMetrics.avg_precision + retrievalMetrics.avg_recall) / 2 * 0.35 +
    responseMetrics.avg_overall * 0.35
  );

  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="Phase 3: Validation Metrics"
        description="Monitor chunk relationships, retrieval quality, and response quality"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Phase 3 Metrics' },
        ]}
      />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-end">
          <Button onClick={() => fetchMetrics()} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

      {/* Overall Health */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Platform Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-medium">Health Score</span>
            <Badge className={getHealthColor(overallHealth)}>
              {(overallHealth * 100).toFixed(1)}% - {getHealthLabel(overallHealth)}
            </Badge>
          </div>
          <Progress value={overallHealth * 100} className="h-3" />
        </CardContent>
      </Card>

      {/* Metrics Tabs */}
      <Tabs defaultValue="relationships" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="relationships" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Relationships
          </TabsTrigger>
          <TabsTrigger value="retrieval" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Retrieval
          </TabsTrigger>
          <TabsTrigger value="response" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Response
          </TabsTrigger>
        </TabsList>

        {/* Relationships Tab */}
        <TabsContent value="relationships" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chunk Relationship Graph</CardTitle>
              <CardDescription>Sequential, semantic, and hierarchical relationships</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium mb-2">Total Relationships</div>
                  <div className="text-3xl font-bold">{relationshipStats.total_relationships}</div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Average Confidence</div>
                  <div className="text-3xl font-bold">{(relationshipStats.avg_confidence * 100).toFixed(1)}%</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Sequential</div>
                  <div className="text-2xl font-bold mt-2">{relationshipStats.sequential}</div>
                  <Progress value={(relationshipStats.sequential / Math.max(relationshipStats.total_relationships, 1)) * 100} className="mt-2 h-2" />
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Semantic</div>
                  <div className="text-2xl font-bold mt-2">{relationshipStats.semantic}</div>
                  <Progress value={(relationshipStats.semantic / Math.max(relationshipStats.total_relationships, 1)) * 100} className="mt-2 h-2" />
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Hierarchical</div>
                  <div className="text-2xl font-bold mt-2">{relationshipStats.hierarchical}</div>
                  <Progress value={(relationshipStats.hierarchical / Math.max(relationshipStats.total_relationships, 1)) * 100} className="mt-2 h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Retrieval Tab */}
        <TabsContent value="retrieval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Retrieval Quality Metrics</CardTitle>
              <CardDescription>Search effectiveness and performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium mb-2">Total Queries</div>
                  <div className="text-3xl font-bold">{retrievalMetrics.total_queries}</div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Avg Latency</div>
                  <div className="text-3xl font-bold">{retrievalMetrics.avg_latency_ms.toFixed(0)}ms</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Precision</div>
                  <div className="text-2xl font-bold mt-2">{(retrievalMetrics.avg_precision * 100).toFixed(1)}%</div>
                  <Progress value={retrievalMetrics.avg_precision * 100} className="mt-2 h-2" />
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Recall</div>
                  <div className="text-2xl font-bold mt-2">{(retrievalMetrics.avg_recall * 100).toFixed(1)}%</div>
                  <Progress value={retrievalMetrics.avg_recall * 100} className="mt-2 h-2" />
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600">Mean Reciprocal Rank (MRR)</div>
                <div className="text-2xl font-bold mt-2">{retrievalMetrics.avg_mrr.toFixed(3)}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Response Tab */}
        <TabsContent value="response" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Response Quality Metrics</CardTitle>
              <CardDescription>LLM output quality and validation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium mb-2">Total Responses</div>
                  <div className="text-3xl font-bold">{responseMetrics.total_responses}</div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Overall Quality</div>
                  <div className="text-3xl font-bold">{(responseMetrics.avg_overall * 100).toFixed(1)}%</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Coherence</div>
                  <div className="text-2xl font-bold mt-2">{(responseMetrics.avg_coherence * 100).toFixed(1)}%</div>
                  <Progress value={responseMetrics.avg_coherence * 100} className="mt-2 h-2" />
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Hallucination</div>
                  <div className="text-2xl font-bold mt-2">{(responseMetrics.avg_hallucination * 100).toFixed(1)}%</div>
                  <Progress value={responseMetrics.avg_hallucination * 100} className="mt-2 h-2" />
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Attribution</div>
                  <div className="text-2xl font-bold mt-2">{(responseMetrics.avg_attribution * 100).toFixed(1)}%</div>
                  <Progress value={responseMetrics.avg_attribution * 100} className="mt-2 h-2" />
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Consistency</div>
                  <div className="text-2xl font-bold mt-2">{(responseMetrics.avg_consistency * 100).toFixed(1)}%</div>
                  <Progress value={responseMetrics.avg_consistency * 100} className="mt-2 h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default Phase3MetricsPanel;

