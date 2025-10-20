/**
 * Quality Metrics Card Component
 * 
 * Displays quality metrics for a specific service (Image Validation,
 * Product Enrichment, or Validation Rules).
 */

import React from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface QualityMetricsCardProps {
  title: string;
  valid: number;
  invalid: number;
  needsReview: number;
  averageScore: number;
  total: number;
}

export const QualityMetricsCard: React.FC<QualityMetricsCardProps> = ({
  title,
  valid,
  invalid,
  needsReview,
  averageScore,
  total,
}) => {
  const validPercentage = total > 0 ? (valid / total) * 100 : 0;
  const invalidPercentage = total > 0 ? (invalid / total) * 100 : 0;
  const reviewPercentage = total > 0 ? (needsReview / total) * 100 : 0;

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-500';
    if (score >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Quality Score</span>
            <span className={`text-2xl font-bold ${getScoreColor(averageScore)}`}>
              {(averageScore * 100).toFixed(1)}%
            </span>
          </div>
          <Progress value={averageScore * 100} className="h-2" />
        </div>

        {/* Status Breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Valid</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{valid}</span>
              <span className="text-muted-foreground">({validPercentage.toFixed(1)}%)</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span>Invalid</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{invalid}</span>
              <span className="text-muted-foreground">({invalidPercentage.toFixed(1)}%)</span>
            </div>
          </div>

          {needsReview > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <span>Needs Review</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{needsReview}</span>
                <span className="text-muted-foreground">({reviewPercentage.toFixed(1)}%)</span>
              </div>
            </div>
          )}
        </div>

        {/* Total Count */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Processed</span>
            <span className="font-semibold">{total}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

