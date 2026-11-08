/** What stock is held for this job (#378 N3). */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Boxes } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { supabase } from '@/integrations/supabase/client';

interface StockHold {
  demand_type: 'order_item' | 'quote_item';
  demand_id: string;
  document_id: string;
  document_number: string | null;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  status: string;
  source_type: string | null;
  expected_at: string | null;
}

const DOC_LABEL: Record<StockHold['demand_type'], string> = {
  order_item: 'Order',
  quote_item: 'Quote',
};

export const ProjectStockCard: React.FC<{ projectId: string; onOpenSection?: (tab: string) => void }> = ({ projectId, onOpenSection }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<StockHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: StockHold[] | null; error: Error | null }>;
      }).rpc('get_project_stock_holds', { p_project_id: projectId });
      if (error) throw error;
      setRows(data ?? []);
    } catch (err) {
      setFailed(true);
      toast({ title: 'Could not load stock holds', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Boxes className="h-4 w-4" /> Stock held for this job
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">Stock holds could not be loaded. They are unknown, not none.</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            icon={Boxes}
            className="py-6"
            title="No stock held for this job"
            description="Material is reserved by a quote or a confirmed sales order on the project, not by the project itself."
            action={onOpenSection ? <Button size="sm" variant="outline" onClick={() => onOpenSection('quotes')}>Open quotes</Button> : undefined}
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="px-2 py-2 text-left">Held By</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Expected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.demand_type}:${r.demand_id}`} className="border-b border-border/30">
                    <td className="px-2 py-2">{r.product_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {DOC_LABEL[r.demand_type]} {r.document_number ?? ''}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{Number(r.quantity)}</td>
                    <td className="px-2 py-2">
                      <Badge variant="neutral" className={`text-[10px] ${statusTone(r.status)}`}>{r.status}</Badge>
                    </td>
                    {/* An absent date is an em dash, not "today" — `expected_at` is only set for a
                        hold sourced from a purchase order that has not landed yet. */}
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.expected_at ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
