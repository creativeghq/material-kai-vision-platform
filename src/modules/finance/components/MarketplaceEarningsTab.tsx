import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { marketplacePricingService, type CommissionLedgerRow } from '@/services/marketplacePricingService';

/**
 * Operator/dealer marketplace earnings — per-sale commission your downline generated
 * on the operator catalog, with seller + product breakdowns ("gain per sale").
 */
export const MarketplaceEarningsTab: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const [rows, setRows] = useState<CommissionLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    setLoading(true);
    marketplacePricingService.getCommissionLedger(activeWorkspaceId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  const cur = rows[0]?.currency ?? 'EUR';
  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.commission_amount || 0), 0), [rows]);
  const bySeller = useMemo(() => groupSum(rows, (r) => r.seller), [rows]);
  const byProduct = useMemo(() => groupSum(rows, (r) => r.product), [rows]);
  const byCategory = useMemo(() => groupSum(rows, (r) => r.category), [rows]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (rows.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        No marketplace commission yet. You earn commission when a workspace below you sells an operator-catalog product.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="dashboard-card border-0"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Total earned</div>
          <div className="mt-1 text-xl font-semibold">{cur} {total.toFixed(2)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{rows.length} sale(s)</div>
        </CardContent></Card>
        <BreakdownCard title="By seller" rows={bySeller} cur={cur} />
        <BreakdownCard title="By category" rows={byCategory} cur={cur} />
        <BreakdownCard title="By product" rows={byProduct} cur={cur} />
      </div>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Commission per sale</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Seller</th>
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-right">Base</th>
                <th className="px-4 py-2 text-right">%</th>
                <th className="px-4 py-2 text-right">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-4 py-2">{new Date(r.occurred_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{r.seller} <Badge variant="outline" className="ml-1 text-[10px] uppercase">{r.seller_rank}</Badge></td>
                  <td className="px-4 py-2">{r.product}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{cur} {Number(r.base_price).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{r.commission_pct}%</td>
                  <td className="px-4 py-2 text-right font-medium">{cur} {Number(r.commission_amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

function groupSum(rows: CommissionLedgerRow[], key: (r: CommissionLedgerRow) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + Number(r.commission_amount || 0));
  return [...m.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
}

const BreakdownCard: React.FC<{ title: string; rows: { label: string; amount: number }[]; cur: string }> = ({ title, rows, cur }) => (
  <Card className="dashboard-card border-0"><CardContent className="p-4">
    <div className="text-xs text-muted-foreground">{title}</div>
    <div className="mt-2 space-y-1">
      {rows.slice(0, 5).map((r) => (
        <div key={r.label} className="flex items-center justify-between text-sm">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="font-medium">{cur} {r.amount.toFixed(2)}</span>
        </div>
      ))}
    </div>
  </CardContent></Card>
);
