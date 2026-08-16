import React, { useEffect, useState } from 'react';
import { Loader2, Package, AlertTriangle, PackageX, ArrowLeftRight, ClipboardList, Warehouse as WarehouseIcon, PackageCheck, Inbox, Coins, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { stockService, type StockOverview, type StockValuation, type LowStockItem } from '../services/stockService';
import { formatNumber } from '@/utils/decimal';

const fmtMoney = (n: number, ccy?: string) => {
  const sym = ccy === 'USD' ? '$' : ccy === 'GBP' ? '£' : '€';
  return `${sym}${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

const KPI: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; tone?: 'default' | 'amber' | 'red' }> = ({ icon: Icon, label, value, tone = 'default' }) => (
  <div className="dashboard-card p-4 flex items-center gap-3">
    <div className={`rounded-full p-2 ${tone === 'amber' ? 'bg-amber-500/15 text-amber-500' : tone === 'red' ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'}`}>
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <div className="text-lg font-medium leading-none">{value}</div>
      <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
    </div>
  </div>
);

export const StockOverviewSection: React.FC<{ workspaceId: string; onNavigate?: (tab: string) => void }> = ({ workspaceId, onNavigate }) => {
  const { toast } = useToast();
  const [ov, setOv] = useState<StockOverview | null>(null);
  const [val, setVal] = useState<StockValuation | null>(null);
  const [low, setLow] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowPage, setLowPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [overview, valuation, lowRes] = await Promise.all([
          stockService.overview(workspaceId), stockService.valuation(workspaceId), stockService.lowStock(workspaceId),
        ]);
        if (cancelled) return;
        setOv(overview);
        setVal(valuation);
        setLow(lowRes.items);
        setLowPage((p) => clampPage(p, lowRes.items.length));
      } catch (err: any) {
        if (!cancelled) toast({ title: 'Failed to load stock overview', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, toast]);

  const [reordering, setReordering] = useState<string | null>(null);
  const reorder = async (it: LowStockItem) => {
    if (!confirm(`Draft a replenishment purchase order for "${it.name}"? This costs 2 credits.`)) return;
    setReordering(it.id);
    try {
      const r = await stockService.reorder(workspaceId, it.id);
      if (!r.ok) {
        toast({ title: 'Could not reorder', description: r.message ?? 'No supplier configured for this product.', variant: 'destructive' });
        return;
      }
      const channel = r.supplier_is_app_user ? 'in-app supplier (portal)' : 'supplier (email)';
      // #332 step 2: the quantity may have been raised to the supplier's minimum, and only when
      // the product opted in via `enforce_moq`. Either way the operator is told which it was.
      const moqNote = r.moq_rounded ? ` Raised from ${r.quantity_requested} — supplier minimum ${r.moq}.` : '';
      toast({
        title: r.moq_rounded ? 'Reorder drafted at the supplier minimum' : 'Reorder drafted',
        description: `${r.quantity} ${it.unit} of ${r.item_name} from ${r.supplier_name ?? 'supplier'} → ${channel}.${moqNote} Review & send in Finance → Orders.`,
      });
    } catch (err: any) {
      toast({ title: 'Reorder failed', description: err?.message, variant: 'destructive' });
    } finally {
      setReordering(null);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!ov) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KPI icon={Coins} label={`Stock value${ov.items_missing_cost > 0 ? ` · ${ov.items_missing_cost} missing cost` : ''}`} value={fmtMoney(ov.total_value, val?.currencies?.[0])} />
        <KPI icon={Package} label="Stock items" value={ov.items} />
        <KPI icon={WarehouseIcon} label="Warehouses" value={ov.warehouses} />
        <KPI icon={PackageCheck} label="Units on hand" value={formatNumber(Number(ov.total_on_hand))} />
        <KPI icon={ArrowLeftRight} label="Units reserved" value={formatNumber(Number(ov.total_reserved))} />
        <KPI icon={AlertTriangle} label="Low stock" value={ov.low_stock} tone={ov.low_stock > 0 ? 'amber' : 'default'} />
        <KPI icon={PackageX} label="Out of stock" value={ov.out_of_stock} tone={ov.out_of_stock > 0 ? 'red' : 'default'} />
        <KPI icon={Inbox} label="Pending intake" value={ov.pending_intake} tone={ov.pending_intake > 0 ? 'amber' : 'default'} />
        <KPI icon={ClipboardList} label="Open counts" value={ov.open_counts} />
      </div>

      {val && (val.by_warehouse.length > 1 || val.items_missing_cost > 0) && (
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3">
            <CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Stock valuation</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {val.by_warehouse.map((w) => (
                  <tr key={w.warehouse_id} className="border-b border-border/30">
                    <td className="px-4 py-2">{w.warehouse_name} <span className="text-xs text-muted-foreground">· {w.items} item{w.items === 1 ? '' : 's'}</span></td>
                    <td className="px-4 py-2 text-right font-medium">{fmtMoney(w.value, val.currencies?.[0])}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(val.total_value, val.currencies?.[0])}</td>
                </tr>
              </tbody>
            </table>
            {val.items_missing_cost > 0 && (
              <div className="px-4 py-2 text-xs text-amber-500 border-t border-border/60 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {val.items_missing_cost} item{val.items_missing_cost === 1 ? '' : 's'} with stock have no product cost — set a cost on the product to value them.
              </div>
            )}
            {val.currencies.length > 1 && (
              <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border/60">Mixed cost currencies ({val.currencies.join(', ')}) — totals are unconverted sums.</div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Low stock</CardTitle>
          {low.length > 0 && onNavigate && (
            <button className="text-xs text-primary hover:underline" onClick={() => onNavigate('inventory')}>Manage in inventory →</button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {low.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing below its reorder point. Inventory is healthy.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-right">On hand</th>
                  <th className="px-4 py-2 text-right">Reorder</th>
                  <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {paginate(low, lowPage).map((it) => (
                  <tr key={it.id} className="border-b border-border/30">
                    <td className="px-4 py-2 font-medium">{it.name} <span className="text-xs text-muted-foreground">/ {it.unit}</span></td>
                    <td className="px-4 py-2 font-mono text-xs">{it.sku ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      {it.qty_on_hand}
                      <span className="ml-2 inline-flex items-center text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3 mr-1" />low</span>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{it.reorder_point}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" disabled={reordering === it.id} onClick={() => reorder(it)}>
                        {reordering === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShoppingCart className="h-3.5 w-3.5 mr-1" /> Reorder</>}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TablePagination page={lowPage} total={low.length} onPageChange={setLowPage} label="items" />
        </CardContent>
      </Card>
    </div>
  );
};
