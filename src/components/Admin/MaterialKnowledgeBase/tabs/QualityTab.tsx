import React from 'react';
import { FileText, Image as ImageIcon, Package, Layers, Eye, RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';

interface QualityTabProps {
  qualityLoading: boolean;
  qualityData: any;
  navigateToTab: (tab: string) => void;
}

export const QualityTab: React.FC<QualityTabProps> = ({
  qualityLoading,
  qualityData,
  navigateToTab,
}) => {
  if (qualityLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center gap-3">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <p className="text-muted-foreground">
                Loading quality scores...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!qualityData) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No quality data available
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chunks Quality KPIs */}
      {qualityData.kpis.chunks && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Chunks Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Validated
                </p>
                <p className="text-2xl font-bold">
                  {qualityData.kpis.chunks.total_validated}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Overall Score
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.chunks.avg_overall_score,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valid</p>
                <p className="text-2xl font-bold text-green-600">
                  {qualityData.kpis.chunks.valid_count}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Needs Review
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {qualityData.kpis.chunks.needs_review_count}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Content Quality
                </p>
                <p className="text-lg font-semibold">
                  {(
                    parseFloat(
                      qualityData.kpis.chunks.avg_content_quality,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Boundary Quality
                </p>
                <p className="text-lg font-semibold">
                  {(
                    parseFloat(
                      qualityData.kpis.chunks.avg_boundary_quality,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Semantic Coherence
                </p>
                <p className="text-lg font-semibold">
                  {(
                    parseFloat(
                      qualityData.kpis.chunks.avg_semantic_coherence,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Completeness
                </p>
                <p className="text-lg font-semibold">
                  {(
                    parseFloat(
                      qualityData.kpis.chunks.avg_completeness,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
            </div>
            {qualityData.distributions.chunks && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">
                  Quality Distribution
                </p>
                <div className="flex gap-2">
                  <Badge variant="default" className="bg-green-600">
                    Excellent:{' '}
                    {qualityData.distributions.chunks.excellent}
                  </Badge>
                  <Badge variant="default" className="bg-blue-600">
                    Good: {qualityData.distributions.chunks.good}
                  </Badge>
                  <Badge variant="default" className="bg-yellow-600">
                    Fair: {qualityData.distributions.chunks.fair}
                  </Badge>
                  <Badge variant="default" className="bg-red-600">
                    Poor: {qualityData.distributions.chunks.poor}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Images Quality KPIs */}
      {qualityData.kpis.images && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Images Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Validated
                </p>
                <p className="text-2xl font-bold">
                  {qualityData.kpis.images.total_validated}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Quality Score
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.images.avg_quality_score,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Relevance
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.images.avg_relevance_score,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg OCR Confidence
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.images.avg_ocr_confidence,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
            </div>
            {qualityData.distributions.images && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">
                  Quality Distribution
                </p>
                <div className="flex gap-2">
                  <Badge variant="default" className="bg-green-600">
                    Excellent:{' '}
                    {qualityData.distributions.images.excellent}
                  </Badge>
                  <Badge variant="default" className="bg-blue-600">
                    Good: {qualityData.distributions.images.good}
                  </Badge>
                  <Badge variant="default" className="bg-yellow-600">
                    Fair: {qualityData.distributions.images.fair}
                  </Badge>
                  <Badge variant="default" className="bg-red-600">
                    Poor: {qualityData.distributions.images.poor}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Products Quality KPIs */}
      {qualityData.kpis.products && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Products Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Scored
                </p>
                <p className="text-2xl font-bold">
                  {qualityData.kpis.products.total_scored}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Quality
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.products.avg_quality_score,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Confidence
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.products.avg_confidence_score,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Completeness
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.products.avg_completeness_score,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
            </div>
            {qualityData.distributions.products && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">
                  Quality Distribution
                </p>
                <div className="flex gap-2">
                  <Badge variant="default" className="bg-green-600">
                    Excellent:{' '}
                    {qualityData.distributions.products.excellent}
                  </Badge>
                  <Badge variant="default" className="bg-blue-600">
                    Good: {qualityData.distributions.products.good}
                  </Badge>
                  <Badge variant="default" className="bg-yellow-600">
                    Fair: {qualityData.distributions.products.fair}
                  </Badge>
                  <Badge variant="default" className="bg-red-600">
                    Poor: {qualityData.distributions.products.poor}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents Quality */}
      {qualityData.kpis.documents && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Documents
                </p>
                <p className="text-2xl font-bold">
                  {qualityData.kpis.documents.total_documents}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Coherence
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.documents.avg_coherence_score,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Avg Overall Quality
                </p>
                <p className="text-2xl font-bold">
                  {(
                    parseFloat(
                      qualityData.kpis.documents.avg_overall_quality,
                    ) * 100
                  ).toFixed(0)}
                  %
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Navigation */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold mb-1">
                Need Deeper Analysis?
              </h3>
              <p className="text-sm text-muted-foreground">
                View AI-driven patterns, anomalies, and recommendations
              </p>
            </div>
            <Button
              onClick={() => navigateToTab('insights')}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              View Insights
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QualityTab;
