/**
 * Quality Dashboard Component
 *
 * Main dashboard for monitoring and managing quality metrics across
 * Image Validation, Product Enrichment, and Validation Rules services.
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QualityDashboardService, QualityDashboardData } from '@/services/QualityDashboardService';

import { QualityMetricsCard } from './QualityMetricsCard';
import { QualityTrendsChart } from './QualityTrendsChart';
import { QualityIssuesPanel } from './QualityIssuesPanel';
import { QualityRecommendationsPanel } from './QualityRecommendationsPanel';

interface QualityDashboardProps {
  workspaceId: string;
  refreshInterval?: number;
}

export const QualityDashboard: React.FC<QualityDashboardProps> = ({
  workspaceId,
  refreshInterval = 30000,
}) => {
  const [data, setData] = useState<QualityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const service = QualityDashboardService.getInstance();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const dashboardData = await service.getDashboardData(workspaceId);
        setData(dashboardData);
        setLastUpdated(new Date());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load quality data';
        setError(message);
        console.error('Quality Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [workspaceId, refreshInterval, service]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading quality metrics...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { metrics, trends, issues, recommendations } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quality Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage quality metrics across all services
          </p>
        </div>
        <div className="text-right">
          <Badge
            variant={
              metrics.quality_trend === 'improving'
                ? 'default'
                : metrics.quality_trend === 'declining'
                ? 'destructive'
                : 'secondary'
            }
            className="mb-2"
          >
            {metrics.quality_trend === 'improving' && (
              <TrendingUp className="w-3 h-3 mr-1" />
            )}
            {metrics.quality_trend === 'declining' && (
              <TrendingDown className="w-3 h-3 mr-1" />
            )}
            {metrics.quality_trend.charAt(0).toUpperCase() + metrics.quality_trend.slice(1)}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {lastUpdated?.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Overall Quality Score */}
      <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
        <CardHeader>
          <CardTitle>Overall Quality Score</CardTitle>
        </CardHeader><CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-5xl font-bold">
                {(metrics.overall_quality_score * 100).toFixed(1)}%
              </div>
              <p className="text-muted-foreground mt-2">
                Based on image validation, enrichment, and validation rules
              </p>
            </div>
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-foreground">
                  {(metrics.overall_quality_score * 100).toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QualityMetricsCard
          title="Image Validation"
          valid={metrics.valid_images}
          invalid={metrics.invalid_images}
          needsReview={metrics.images_needing_review}
          averageScore={metrics.average_image_quality_score}
          total={metrics.total_images_validated}
        />
        <QualityMetricsCard
          title="Product Enrichment"
          valid={metrics.enriched_chunks}
          invalid={metrics.unenriched_chunks}
          needsReview={0}
          averageScore={metrics.average_enrichment_score}
          total={metrics.total_chunks_enriched}
        />
        <QualityMetricsCard
          title="Validation Rules"
          valid={metrics.passed_validations}
          invalid={metrics.failed_validations}
          needsReview={0}
          averageScore={metrics.validation_pass_rate}
          total={metrics.total_validations}
        />
      </div>

      {/* Trends Chart */}
      {trends.length > 0 && (
        <QualityTrendsChart trends={trends} />
      )}

      {/* Issues and Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QualityIssuesPanel issues={issues} />
        <QualityRecommendationsPanel recommendations={recommendations} />
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            service.getDashboardData(workspaceId).then(dashboardData => {
              setData(dashboardData);
              setLastUpdated(new Date());
              setLoading(false);
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setLoading(true);
              service.getDashboardData(workspaceId).then(dashboardData => {
                setData(dashboardData);
                setLastUpdated(new Date());
                setLoading(false);
              });
            }
          }}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh Now'}
        </Button>
      </div>
    </div>
  );
};

