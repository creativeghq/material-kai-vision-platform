/**
 * Quality Recommendations Panel Component
 *
 * Displays actionable recommendations for improving quality metrics.
 */

import React from 'react';
import { Lightbulb, CheckCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface QualityRecommendationsPanelProps {
  recommendations: string[];
}

export const QualityRecommendationsPanel: React.FC<QualityRecommendationsPanelProps> = ({
  recommendations,
}) => {
  const [completedItems, setCompletedItems] = React.useState<Set<number>>(new Set());

  const toggleCompleted = (index: number) => {
    const newCompleted = new Set(completedItems);
    if (newCompleted.has(index)) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
    }
    setCompletedItems(newCompleted);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5" />
          Recommendations ({recommendations.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">All quality metrics are optimal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((recommendation, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  completedItems.has(index)
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-muted/50 border-muted hover:bg-muted'
                }`}
              >
                <button
                  onClick={() => toggleCompleted(index)}
                  className="mt-1 flex-shrink-0"
                >
                  <CheckCircle
                    className={`w-5 h-5 transition-colors ${
                      completedItems.has(index)
                        ? 'text-green-500'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  />
                </button>
                <div className="flex-1">
                  <p
                    className={`text-sm ${
                      completedItems.has(index)
                        ? 'line-through text-muted-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {recommendation}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-3">
              {completedItems.size} of {recommendations.length} completed
            </p>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{
                  width: `${(completedItems.size / recommendations.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

