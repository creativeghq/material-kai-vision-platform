import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { marketplacePricingService, type CommissionSummary } from '@/services/marketplacePricingService';

/**
 * "Commission earned" — a node's cut on its children's operator-catalog sales.
 * Renders nothing when there's nothing earned yet, so it's safe to always mount.
 */
export const CommissionSummaryCard: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const [summary, setSummary] = useState<CommissionSummary | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    marketplacePricingService
      .getCommissionSummary(activeWorkspaceId)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  if (!summary || summary.total_earned <= 0) return null;
  const cur = summary.currency || 'EUR';

  return (
    <Card className="dashboard-card border-0">
      <CardHeader className="px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Commission earned
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        <div className="text-2xl font-semibold">{cur} {summary.total_earned.toFixed(2)}</div>
        <div className="text-xs text-muted-foreground">{summary.lines} line(s) across your downline's catalog sales</div>
        {summary.by_seller.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/40">
            {summary.by_seller.slice(0, 6).map((s) => (
              <div key={s.seller} className="flex items-center justify-between text-sm">
                <span className="truncate text-muted-foreground">{s.seller}</span>
                <span className="font-medium">{cur} {s.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
