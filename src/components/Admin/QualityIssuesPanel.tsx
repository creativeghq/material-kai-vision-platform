/**
 * Quality Issues Panel Component
 *
 * Displays identified quality issues with severity levels and recommendations.
 */

import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QualityIssue } from '@/services/QualityDashboardService';

interface QualityIssuesPanelProps {
  issues: QualityIssue[];
}

export const QualityIssuesPanel: React.FC<QualityIssuesPanelProps> = ({ issues }) => {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return 'destructive';
      case 'warning':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Quality Issues ({issues.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No quality issues detected</p>
          </div>
        ) : (
          <div className="space-y-4">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1">
                    {getSeverityIcon(issue.severity)}
                    <div className="flex-1">
                      <h4 className="font-semibold">{issue.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {issue.description}
                      </p>
                    </div>
                  </div>
                  <Badge variant={getSeverityBadgeVariant(issue.severity)}>
                    {issue.severity}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Affected: {issue.affected_count} items
                  </span>
                </div>

                <div className="bg-muted/50 rounded p-2 text-sm">
                  <p className="font-medium mb-1">Recommendation:</p>
                  <p className="text-muted-foreground">{issue.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

