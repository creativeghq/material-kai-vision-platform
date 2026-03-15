import React from 'react';
import { Search, Layers, Hash, ChevronRight, Eye, RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';

interface DetectionsTabProps {
  detectionsLoading: boolean;
  detectionsData: any;
}

export const DetectionsTab: React.FC<DetectionsTabProps> = ({
  detectionsLoading,
  detectionsData,
}) => {
  if (detectionsLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center gap-3">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading detections...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!detectionsData) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No detection data available
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Total Detections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {detectionsData.total_detections}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Avg Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(
                parseFloat(detectionsData.summary.avg_confidence) * 100
              ).toFixed(0)}
              %
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              High Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {detectionsData.summary.high_confidence_count}
            </div>
            <p className="text-xs text-muted-foreground">
              ≥80% confidence
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Low Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {detectionsData.summary.low_confidence_count}
            </div>
            <p className="text-xs text-muted-foreground">
              &lt;50% confidence
            </p>
          </CardContent>
        </Card>
      </div>

      {/* By Type */}
      {Object.keys(detectionsData.summary.by_type).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Detections by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(detectionsData.summary.by_type).map(
                ([type, count]) => (
                  <Badge
                    key={type}
                    variant="default"
                    className="text-base px-4 py-2"
                  >
                    {type}: {count as number}
                  </Badge>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* By Event */}
      {Object.keys(detectionsData.summary.by_event).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Detections by Event
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(detectionsData.summary.by_event).map(
                ([event, count]) => (
                  <div
                    key={event}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded"
                  >
                    <span className="font-medium">{event}</span>
                    <Badge variant="secondary">{count as number}</Badge>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {detectionsData.timeline &&
        Object.keys(detectionsData.timeline).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChevronRight className="h-5 w-5" />
                Detection Timeline (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(detectionsData.timeline)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .slice(0, 10)
                  .map(([date, count]) => (
                    <div
                      key={date}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {date}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                ((count as number) /
                                  Math.max(
                                    ...Object.values(
                                      detectionsData.timeline!,
                                    ),
                                  )) *
                                  100,
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="font-medium w-8 text-right">
                          {count as number}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Recent Detections */}
      {detectionsData.detections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Recent Detections ({detectionsData.detections.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {detectionsData.detections
                .slice(0, 50)
                .map((detection: any) => (
                  <Card key={detection.id} className="border">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {detection.detection_type || 'chunk'}
                          </Badge>
                          <Badge variant="secondary">
                            {detection.event}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {detection.confidence !== null && (
                            <Badge
                              variant={
                                detection.confidence >= 0.8
                                  ? 'default'
                                  : detection.confidence >= 0.5
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {(detection.confidence * 100).toFixed(0)}%
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(
                              detection.created_at,
                            ).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {detection.details && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Entity: {detection.entity_id?.substring(0, 8)}
                          ...
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DetectionsTab;
