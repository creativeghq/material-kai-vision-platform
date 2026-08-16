import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, ShoppingCart, TrendingUp, TrendingDown, Minus, AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { TablePagination, paginate } from '@/components/core/ui/table-pagination';
import { stockService, type ForecastCandidate } from '../services/stockService';

const TrendBadge: React.FC<{ t: ForecastCandidate['trend'] }> = ({ t }) => {
  if (t === 'accelerating') return <span className="inline-flex items-center text-xs text-amber-600 dark:text-amber-400"><TrendingUp className="h-3 w-3 mr-1" />rising</span>;
  if (t === 'slowing') return <span className="inline-flex items-center text-xs text-muted-foreground"><TrendingDown className="h-3 w-3 mr-1" />slowing</span>;
  return <span className="inline-flex items-center text-xs text-muted-foreground"><Minus className="h-3 w-3 mr-1" />steady</span>;
};

export const ResupplySection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ForecastCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRan, setAiRan] = useState(false);
  const [reordering, setReordering] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);

  // Flagged = will run short (stockout risk or below reorder point) AND has a supplier to order from.
  const flagged = rows.filter((c) => c.has_supplier && (c.stockout_before_reorder || c.below_reorder));

  const load = async () => {
    setLoading(true);
    try { setRows(await stockService.forecast(workspaceId)); setAiRan(false); setPage(1); }
    catch (err: any) { toast({ title: 'Failed to load forecast', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const runAi = async () => {
    if (!confirm('Run the AI resupply forecast? This costs 5 credits.')) return;
    setAiBusy(true);
    try {
      const res = await stockService.aiForecast(workspaceId);
      if ((res as any)?.code === 'insufficient_credits') { toast({ title: 'Not enough credits', variant: 'destructive' }); return; }
      // Prefer the AI-ranked list when present; else keep the deterministic order.
      setRows(res.recommendations.length ? res.recommendations : res.candidates);
      setAiRan(res.recommendations.length > 0);
      // The AI list is re-ranked and usually shorter — start over at the top.
      setPage(1);
      toast({ title: 'AI forecast ready', description: `${res.recommendations.length} prioritised recommendation(s).` });
    } catch (err: any) {
      toast({ title: 'AI forecast failed', description: err?.message, variant: 'destructive' });
    } finally { setAiBusy(false); }
  };

  const reorder = async (c: ForecastCandidate) => {
    if (!confirm(`Draft a replenishment PO for "${c.name}"${c.recommended_order_qty ? ` (${c.recommended_order_qty} ${c.unit})` : ''}? This costs 2 credits.`)) return;
    setReordering(c.warehouse_item_id);
    try {
      const r = await stockService.reorder(workspaceId, c.warehouse_item_id, c.recommended_order_qty ? { quantity: c.recommended_order_qty } : {});
      if (!r.ok) { toast({ title: 'Could not reorder', description: r.message, variant: 'destructive' }); return; }
      const channel = r.supplier_is_app_user ? 'in-app supplier (portal)' : 'supplier (email)';
      // Name the round-up when it happened. Quantity is the number the supplier will be asked
      // for, and it is no longer necessarily the number we asked this function for (#332 step 2).
      const moqNote = r.moq_rounded ? ` Raised from ${r.quantity_requested} — supplier minimum ${r.moq}.` : '';
      toast({
        title: r.moq_rounded ? 'Reorder drafted at the supplier minimum' : 'Reorder drafted',
        description: `${r.quantity} ${c.unit} of ${r.item_name} from ${r.supplier_name ?? 'supplier'} → ${channel}.${moqNote}`,
      });
    } catch (err: any) { toast({ title: 'Reorder failed', description: err?.message, variant: 'destructive' }); }
    finally { setReordering(null); }
  };

  // Draft a replenishment PO for every flagged item in one go (each is an independent, credit-metered
  // reorder → its supplier's draft PO). Sequential so a mid-run failure stops cleanly.
  const reorderAll = async () => {
    if (flagged.length === 0) return;
    if (!confirm(`Draft replenishment POs for ${flagged.length} flagged item(s)? This costs 2 credits each (${flagged.length * 2} total).`)) return;
    setBulkBusy(true);
    let drafted = 0; let failed = 0;
    try {
      for (const c of flagged) {
        setReordering(c.warehouse_item_id);
        try {
          const r = await stockService.reorder(workspaceId, c.warehouse_item_id, c.recommended_order_qty ? { quantity: c.recommended_order_qty } : {});
          if (r.ok) drafted++; else failed++;
        } catch { failed++; }
      }
      toast({ title: 'Bulk reorder complete', description: `${drafted} PO(s) drafted${failed ? ` · ${failed} skipped (no supplier / error)` : ''}.` });
    } finally { setBulkBusy(false); setReordering(null); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Resupply forecast</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Consumption velocity → days of cover vs supplier lead time. Items that will run out before a reorder lands are flagged.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {flagged.length > 0 && (
            <Button size="sm" variant="outline" className="rounded-full" disabled={bulkBusy || loading} onClick={reorderAll}>
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingCart className="h-4 w-4 mr-1" /> Reorder all flagged ({flagged.length})</>}
            </Button>
          )}
          <Button size="sm" className="rounded-full" disabled={aiBusy || loading || rows.length === 0} onClick={runAi}>
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> AI forecast (5 cr)</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Not enough movement history yet. Once items start selling/issuing, the forecast ranks what to restock first.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                {aiRan && <th className="px-3 py-2 text-left">#</th>}
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-right">Vel/day</th>
                <th className="px-4 py-2 text-right">Days cover</th>
                <th className="px-4 py-2 text-left">Trend</th>
                <th className="px-4 py-2 text-right">Lead</th>
                {aiRan && <th className="px-4 py-2 text-left">Recommendation</th>}
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {paginate(rows, page).map((c) => (
                <tr key={c.warehouse_item_id} className="border-b border-border/30 align-top">
                  {aiRan && <td className="px-3 py-2 font-medium">{c.priority ?? '—'}</td>}
                  <td className="px-4 py-2 font-medium">
                    {c.name} <span className="text-xs text-muted-foreground">/ {c.unit}</span>
                    {c.stockout_before_reorder && (
                      <span className="ml-2 inline-flex items-center text-xs text-destructive"><AlertTriangle className="h-3 w-3 mr-1" />stockout risk</span>
                    )}
                    {c.sku && <div className="font-mono text-[11px] text-muted-foreground">{c.sku}</div>}
                  </td>
                  <td className="px-4 py-2 text-right">{c.velocity_per_day}</td>
                  <td className="px-4 py-2 text-right">{c.days_of_cover == null ? '∞' : `${c.days_of_cover}d`}</td>
                  <td className="px-4 py-2"><TrendBadge t={c.trend} /></td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{c.lead_time_days == null ? '—' : `${c.lead_time_days}d`}</td>
                  {aiRan && (
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[22rem]">
                      {c.recommended_order_qty != null && <span className="text-foreground font-medium">Order {c.recommended_order_qty} {c.unit}</span>}
                      {c.order_by_days != null && <span className="ml-1 inline-flex items-center"><Clock className="h-3 w-3 mr-0.5" />within {c.order_by_days}d.</span>}
                      {c.reason && <div>{c.reason}</div>}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" disabled={!c.has_supplier || bulkBusy || reordering === c.warehouse_item_id} title={c.has_supplier ? 'Draft a purchase order' : 'No supplier configured for this product'} onClick={() => reorder(c)}>
                      {reordering === c.warehouse_item_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShoppingCart className="h-3.5 w-3.5 mr-1" /> Reorder</>}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && <TablePagination page={page} total={rows.length} onPageChange={setPage} label="items" />}
      </CardContent>
    </Card>
  );
};
