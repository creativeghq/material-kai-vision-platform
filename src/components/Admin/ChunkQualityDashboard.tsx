import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { MIVAA_API_URL } from '@/config/mivaa';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Filter,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { SectionHeader } from '@/components/shared/SectionHeader';

interface ChunkQualityMetrics {
  total_chunks: number;
  total_documents: number;
  exact_duplicates_prevented: number;
  low_quality_rejected: number;
  borderline_quality_flagged: number;
  average_quality_score: number;
  quality_distribution: Record<string, number>;
  flagged_chunks_pending_review: number;
  flagged_chunks_reviewed: number;
  // Enhanced metrics
  chunk_size_stats: {
    min: number;
    max: number;
    avg: number;
    stddev: number;
    median: number;
  };
  chunk_overlap_stats: {
    avg_overlap: number;
    avg_configured_size: number;
    overlap_ratio: number;
  };
  very_small_chunks: number;
  very_large_chunks: number;
  recommendations: string[];
}

interface FlaggedChunk {
  id: string;
  chunk_id: string;
  document_id: string;
  flag_type: string;
  flag_reason: string;
  quality_score: number;
  content_preview: string;
  flagged_at: string;
  reviewed: boolean;
  reviewed_at?: string;
  reviewed_by?: string;
  review_action?: string;
}

export const ChunkQualityDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<ChunkQualityMetrics | null>(null);
  const [flaggedChunks, setFlaggedChunks] = useState<FlaggedChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const apiUrl = MIVAA_API_URL;
      const response = await fetch(
        `${apiUrl}/admin/chunk-quality/metrics?days=30`,
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch metrics (${response.status}): ${errorText.substring(0, 100)}`);
      }
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
      console.error('Chunk quality metrics error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFlaggedChunks = async (reviewed: boolean) => {
    try {
      const apiUrl = MIVAA_API_URL;
      const response = await fetch(
        `${apiUrl}/admin/chunk-quality/flagged?reviewed=${reviewed}&limit=50`,
      );
      if (!response.ok) throw new Error('Failed to fetch flagged chunks');
      const data = await response.json();
      setFlaggedChunks(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load flagged chunks',
      );
    }
  };

  const reviewChunk = async (flagId: string, action: string) => {
    try {
      const apiUrl = MIVAA_API_URL;
      const response = await fetch(
        `${apiUrl}/admin/chunk-quality/flagged/${flagId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) throw new Error('Failed to review chunk');

      // Refresh flagged chunks
      await fetchFlaggedChunks(showReviewed);
      await fetchMetrics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review chunk');
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchFlaggedChunks(false);
  }, []);

  useEffect(() => {
    fetchFlaggedChunks(showReviewed);
  }, [showReviewed]);

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const qualityPercentage = metrics
    ? (metrics.average_quality_score * 100).toFixed(1)
    : '0';
  const totalDuplicatesPrevented = metrics?.exact_duplicates_prevented || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        icon={CheckCircle}
        title="Chunk Quality Dashboard"
        subtitle="Monitor chunk quality, deduplication, and validation metrics"
        actions={
          <Button
            onClick={() => {
              fetchMetrics();
              fetchFlaggedChunks(showReviewed);
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground">
              Total Chunks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.total_chunks.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {metrics?.total_documents || 0} documents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground">
              Average Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              {qualityPercentage}%
              {parseFloat(qualityPercentage) >= 70 ? (
                <TrendingUp className="w-5 h-5 ml-2 text-green-500" />
              ) : (
                <TrendingDown className="w-5 h-5 ml-2 text-red-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Quality score threshold: 70%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground">
              Duplicates Prevented
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalDuplicatesPrevented.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Exact content match (MD5)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground">
              Flagged for Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.flagged_chunks_pending_review || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics?.flagged_chunks_reviewed || 0} already reviewed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="recommendations" className="space-y-4">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
          <TabsTrigger value="recommendations">
            Recommendations
          </TabsTrigger>
          <TabsTrigger value="distribution">
            Quality Distribution
          </TabsTrigger>
          <TabsTrigger value="flagged">
            Flagged Chunks
          </TabsTrigger>
          <TabsTrigger value="stats">
            Statistics
          </TabsTrigger>
        </TabsList>

        {/* Recommendations Tab - NEW */}
        <TabsContent value="recommendations" className="space-y-4">
          {/* AI-Powered Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                AI-Powered Chunk Quality Recommendations
              </CardTitle>
              <CardDescription>
                Actionable insights to improve your chunking configuration and retrieval quality
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics?.recommendations && metrics.recommendations.length > 0 ? (
                <div className="space-y-3">
                  {metrics.recommendations.map((rec, idx) => {
                    const isHigh = rec.includes('⚠️ HIGH');
                    const isMedium = rec.includes('⚡ MEDIUM');
                    const isExcellent = rec.includes('✅ EXCELLENT');
                    const isInfo = rec.includes('💡');

                    return (
                      <Alert
                        key={idx}
                        variant={isHigh ? 'destructive' : 'default'}
                        className={
                          isExcellent ? 'border-green-500 bg-green-50' :
                          isMedium ? 'border-yellow-500 bg-yellow-50' :
                          isInfo ? 'border-blue-500 bg-blue-50' :
                          ''
                        }
                      >
                        <AlertDescription className="text-sm">
                          {rec}
                        </AlertDescription>
                      </Alert>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No recommendations available. Process more documents to get insights.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Chunk Size Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Chunk Size Analysis</CardTitle>
              <CardDescription>
                Statistical analysis of chunk sizes across your documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Minimum</p>
                  <p className="text-2xl font-bold">{metrics?.chunk_size_stats?.min || 0}</p>
                  <p className="text-xs text-muted-foreground">characters</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Average</p>
                  <p className="text-2xl font-bold">{metrics?.chunk_size_stats?.avg?.toFixed(0) || 0}</p>
                  <p className="text-xs text-muted-foreground">characters</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Median</p>
                  <p className="text-2xl font-bold">{metrics?.chunk_size_stats?.median?.toFixed(0) || 0}</p>
                  <p className="text-xs text-muted-foreground">characters</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Maximum</p>
                  <p className="text-2xl font-bold">{metrics?.chunk_size_stats?.max || 0}</p>
                  <p className="text-xs text-muted-foreground">characters</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Std Dev</p>
                  <p className="text-2xl font-bold">{metrics?.chunk_size_stats?.stddev?.toFixed(0) || 0}</p>
                  <p className="text-xs text-muted-foreground">variance</p>
                </div>
              </div>

              {/* Size Distribution Warnings */}
              <div className="mt-4 space-y-2">
                {metrics && metrics.very_small_chunks > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {metrics.very_small_chunks} chunks are very small (&lt; 100 chars) -
                      {((metrics.very_small_chunks / metrics.total_chunks) * 100).toFixed(1)}% of total
                    </AlertDescription>
                  </Alert>
                )}
                {metrics && metrics.very_large_chunks > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {metrics.very_large_chunks} chunks are very large (&gt; 2500 chars) -
                      {((metrics.very_large_chunks / metrics.total_chunks) * 100).toFixed(1)}% of total
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Overlap Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Chunk Overlap Configuration</CardTitle>
              <CardDescription>
                Current overlap settings and efficiency metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Configured Size</p>
                  <p className="text-2xl font-bold">
                    {metrics?.chunk_overlap_stats?.avg_configured_size?.toFixed(0) || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">characters</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Average Overlap</p>
                  <p className="text-2xl font-bold">
                    {metrics?.chunk_overlap_stats?.avg_overlap?.toFixed(0) || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">characters</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Overlap Ratio</p>
                  <p className="text-2xl font-bold">
                    {metrics?.chunk_overlap_stats?.overlap_ratio?.toFixed(1) || 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metrics && metrics.chunk_overlap_stats?.overlap_ratio > 20 ?
                      'Consider reducing' :
                      metrics && metrics.chunk_overlap_stats?.overlap_ratio < 10 ?
                      'Consider increasing' :
                      'Optimal range'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quality Distribution Tab */}
        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quality Score Distribution</CardTitle>
              <CardDescription>
                Distribution of chunk quality scores (last 30 days)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics &&
                  Object.entries(metrics.quality_distribution).map(
                    ([range, count]) => {
                      const total = metrics.total_chunks;
                      const percentage = total > 0 ? (count / total) * 100 : 0;
                      const isGood =
                        range.startsWith('0.7') || range.startsWith('0.85');

                      return (
                        <div key={range} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{range}</span>
                            <span className="text-muted-foreground">
                              {count} chunks ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${isGood ? 'bg-green-500' : 'bg-yellow-500'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Flagged Chunks Tab */}
        <TabsContent value="flagged" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {showReviewed ? 'Reviewed Chunks' : 'Pending Review'}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReviewed(!showReviewed)}
            >
              <Filter className="w-4 h-4 mr-2" />
              {showReviewed ? 'Show Pending' : 'Show Reviewed'}
            </Button>
          </div>

          <div className="space-y-3">
            {flaggedChunks.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>No {showReviewed ? 'reviewed' : 'pending'} chunks</p>
                </CardContent>
              </Card>
            ) : (
              flaggedChunks.map((chunk) => (
                <Card key={chunk.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle>
                          {chunk.flag_type.replace(/_/g, ' ').toUpperCase()}
                        </CardTitle>
                        <CardDescription>{chunk.flag_reason}</CardDescription>
                      </div>
                      <Badge
                        variant={
                          chunk.quality_score >= 0.7 ? 'default' : 'destructive'
                        }
                      >
                        Score: {(chunk.quality_score * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-gray-50 p-3 rounded text-sm">
                      <p className="text-muted-foreground mb-1">
                        Content Preview:
                      </p>
                      <p className="line-clamp-2">{chunk.content_preview}</p>
                    </div>

                    {!chunk.reviewed && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => reviewChunk(chunk.id, 'approve')}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reviewChunk(chunk.id, 'reject')}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => reviewChunk(chunk.id, 'delete_chunk')}
                        >
                          Delete Chunk
                        </Button>
                      </div>
                    )}

                    {chunk.reviewed && (
                      <div className="text-sm text-muted-foreground">
                        Reviewed: {chunk.review_action} on{' '}
                        {new Date(chunk.reviewed_at!).toLocaleDateString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="stats" className="space-y-4">
          {/* Detailed Chunk Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Chunk Statistics Overview</CardTitle>
              <CardDescription>
                Comprehensive statistics about your document chunks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Chunks</p>
                  <p className="text-3xl font-bold">{metrics?.total_chunks || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Documents</p>
                  <p className="text-3xl font-bold">{metrics?.total_documents || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Avg Chunks/Doc</p>
                  <p className="text-3xl font-bold">
                    {metrics && metrics.total_documents > 0
                      ? (metrics.total_chunks / metrics.total_documents).toFixed(1)
                      : 0}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Avg Quality</p>
                  <p className="text-3xl font-bold">
                    {((metrics?.average_quality_score || 0) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quality Distribution Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Quality Distribution</CardTitle>
                <CardDescription>Breakdown by quality tier</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {metrics && Object.entries(metrics.quality_distribution).map(([range, count]) => {
                  const total = metrics.total_chunks;
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  const label = range === 'excellent' ? '🌟 Excellent (≥90%)' :
                               range === 'good' ? '✅ Good (70-89%)' :
                               range === 'fair' ? '⚠️ Fair (50-69%)' :
                               '❌ Poor (<50%)';

                  return (
                    <div key={range} className="flex justify-between items-center">
                      <span className="text-sm">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{count}</span>
                        <Badge variant={range === 'excellent' || range === 'good' ? 'default' : 'destructive'}>
                          {percentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Size Distribution Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Size Distribution</CardTitle>
                <CardDescription>Chunk size breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Very Small (&lt;100 chars)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{metrics?.very_small_chunks || 0}</span>
                    <Badge variant="destructive">
                      {metrics && metrics.total_chunks > 0
                        ? ((metrics.very_small_chunks / metrics.total_chunks) * 100).toFixed(1)
                        : 0}%
                    </Badge>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Optimal (500-2000 chars)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">
                      {metrics ? metrics.total_chunks - (metrics.very_small_chunks + metrics.very_large_chunks) : 0}
                    </span>
                    <Badge variant="default">
                      {metrics && metrics.total_chunks > 0
                        ? (((metrics.total_chunks - (metrics.very_small_chunks + metrics.very_large_chunks)) / metrics.total_chunks) * 100).toFixed(1)
                        : 0}%
                    </Badge>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Very Large (&gt;2500 chars)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{metrics?.very_large_chunks || 0}</span>
                    <Badge variant="secondary">
                      {metrics && metrics.total_chunks > 0
                        ? ((metrics.very_large_chunks / metrics.total_chunks) * 100).toFixed(1)
                        : 0}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuration Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Current Configuration</CardTitle>
                <CardDescription>Active chunking settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Chunk Size</span>
                  <Badge variant="outline">
                    {metrics?.chunk_overlap_stats?.avg_configured_size?.toFixed(0) || 1000} chars
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Chunk Overlap</span>
                  <Badge variant="outline">
                    {metrics?.chunk_overlap_stats?.avg_overlap?.toFixed(0) || 200} chars
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Overlap Ratio</span>
                  <Badge variant="outline">
                    {metrics?.chunk_overlap_stats?.overlap_ratio?.toFixed(1) || 20}%
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Strategy</span>
                  <Badge variant="outline">Hierarchical</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Flagged Chunks Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Review Queue</CardTitle>
                <CardDescription>Chunks requiring attention</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Pending Review</span>
                  <Badge variant="destructive">
                    {metrics?.flagged_chunks_pending_review || 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Already Reviewed</span>
                  <Badge variant="secondary">
                    {metrics?.flagged_chunks_reviewed || 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Borderline Quality</span>
                  <Badge variant="secondary">
                    {metrics?.borderline_quality_flagged || 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
