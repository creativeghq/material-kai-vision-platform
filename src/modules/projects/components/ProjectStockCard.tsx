/**
 * What stock is held for this job (#378 N3).
 *
 * THE FINDING, AND WHY THIS IS NOT A NEW `demand_type`
 * ---------------------------------------------------
 * The issue says "a project cannot hold material" and proposes widening
 * `stock_allocations.demand_type` from ('order_item','quote_item') to include a project. Its own
 * caveat is right and still stands: that column has eight SQL consumers plus `inbox-api`, a tool
 * `z.enum` and the generated manifest, and adding a value none of them understands creates
 * reservations no delivery path relieves and no integrity check validates.
 *
 * Checking what a job can ALREADY hold changes the question. Material reaches stock through the
 * documents a project produces: a `quote_item` reserves when the quote is built and an
 * `order_item` reserves when a SALES order is confirmed, and both carry the project. So a job with
 * a quote or a sale has always held its material — there was simply no way to SEE it, because
 * nothing joined allocations back to the job. That is what this shows.
 *
 * What a new demand type would genuinely add is a hold for a job with no quote and no sale — our
 * own fit-out, or material set aside before quoting. That is a different lifecycle (what relieves
 * it, what reconciles it, what cancels it) and it belongs in its own design rather than bolted
 * onto a vocabulary about order fulfilment.
 *
 * PURCHASE ORDERS ARE ABSENT ON PURPOSE. A purchase order is inbound SUPPLY, not a hold on stock
 * we already have — which is why `_orders_reserve_on_status` reserves only for sales orders.
 * Showing them here would double-count the same material as both arriving and reserved.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Boxes } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
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

export const ProjectStockCard: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<StockHold[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: StockHold[] | null; error: Error | null }>;
      }).rpc('get_project_stock_holds', { p_project_id: projectId });
      if (error) throw error;
      setRows(data ?? []);
    } catch (err) {
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
        {rows.length === 0 ? (
          // "Nothing held" is a complete answer, and saying WHERE a hold comes from is the useful
          // half: material is reserved by the quote or the sales order, not by the job itself.
          <p className="text-sm text-muted-foreground">
            No stock is held for this job. Material is reserved by a quote or a confirmed sales
            order on it — there is no separate hold at the project level.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="px-2 py-2 text-left">Held by</th>
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
