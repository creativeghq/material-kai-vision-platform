import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  TrendingUp,
  TrendingDown,
  Filter
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ChunkQualityMetrics {
  total_chunks: number;
  total_documents: number;
  exact_duplicates_prevented: number;
  semantic_duplicates_prevented: number;
  low_quality_rejected: number;
  borderline_quality_flagged: number;
  average_quality_score: number;
  quality_distribution: Record<string, number>;
  flagged_chunks_pending_review: number;
  flagged_chunks_reviewed: number;
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
      const response = await fetch(`${import.meta.env.VITE_MIVAA_API_URL}/admin/chunk-quality/metrics?days=30`);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  const fetchFlaggedChunks = async (reviewed: boolean) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_MIVAA_API_URL}/admin/chunk-quality/flagged?reviewed=${reviewed}&limit=50`
      );
      if (!response.ok) throw new Error('Failed to fetch flagged chunks');
      const data = await response.json();
      setFlaggedChunks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flagged chunks');
    }
  };

  const reviewChunk = async (flagId: string, action: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_MIVAA_API_URL}/admin/chunk-quality/flagged/${flagId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        }
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

  const qualityPercentage = metrics ? (metrics.average_quality_score * 100).toFixed(1) : '0';
  const totalDuplicatesPrevented = (metrics?.exact_duplicates_prevented || 0) + (metrics?.semantic_duplicates_prevented || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Chunk Quality Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor chunk quality, deduplication, and validation metrics
          </p>
        </div>
        <Button onClick={() => { fetchMetrics(); fetchFlaggedChunks(showReviewed); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Chunks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total_chunks.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {metrics?.total_documents || 0} documents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Quality</CardTitle>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Duplicates Prevented</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDuplicatesPrevented.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics?.exact_duplicates_prevented || 0} exact, {metrics?.semantic_duplicates_prevented || 0} semantic
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Flagged for Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.flagged_chunks_pending_review || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics?.flagged_chunks_reviewed || 0} already reviewed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="distribution" className="space-y-4">
        <TabsList>
          <TabsTrigger value="distribution">Quality Distribution</TabsTrigger>
          <TabsTrigger value="flagged">Flagged Chunks</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        {/* Quality Distribution Tab */}
        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quality Score Distribution</CardTitle>
              <CardDescription>Distribution of chunk quality scores (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics && Object.entries(metrics.quality_distribution).map(([range, count]) => {
                  const total = metrics.total_chunks;
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  const isGood = range.startsWith('0.7') || range.startsWith('0.85');
                  
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
                })}
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
                        <CardTitle className="text-base">
                          {chunk.flag_type.replace(/_/g, ' ').toUpperCase()}
                        </CardTitle>
                        <CardDescription>{chunk.flag_reason}</CardDescription>
                      </div>
                      <Badge variant={chunk.quality_score >= 0.7 ? 'default' : 'destructive'}>
                        Score: {(chunk.quality_score * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-gray-50 p-3 rounded text-sm">
                      <p className="text-muted-foreground mb-1">Content Preview:</p>
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
                        Reviewed: {chunk.review_action} on {new Date(chunk.reviewed_at!).toLocaleDateString()}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Validation Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Low Quality Rejected:</span>
                  <span className="font-bold">{metrics?.low_quality_rejected || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Exact Duplicates Prevented:</span>
                  <span className="font-bold">{metrics?.exact_duplicates_prevented || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Semantic Duplicates Prevented:</span>
                  <span className="font-bold">{metrics?.semantic_duplicates_prevented || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Borderline Quality Flagged:</span>
                  <span className="font-bold">{metrics?.borderline_quality_flagged || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quality Thresholds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Minimum Quality Score:</span>
                  <Badge>0.7 (70%)</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Minimum Length:</span>
                  <Badge>50 characters</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Maximum Length:</span>
                  <Badge>5000 characters</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Semantic Similarity Threshold:</span>
                  <Badge>0.85 (85%)</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

