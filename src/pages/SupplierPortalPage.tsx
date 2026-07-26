import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackageCheck, Truck, RefreshCw, Inbox } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supplierClaimsService, type SupplierInboundOrder } from '@/services/supplierClaimsService';
import { FilterBar, optionsFromRows, useFilters, type FilterGroupDef } from '@/components/core/filters';

/**
 * #247 / Workstream F — supplier portal. A claimed supplier sees the purchase
 * orders sent to their identity across ALL buyer workspaces and can acknowledge /
 * mark shipped. Backed by the operator-claim flow; the RPCs enforce the claim.
 *
 * Renders in two places: standalone at /supplier-portal, and embedded as a Finance tab.
 * `embedded` drops the page chrome (own padding, width clamp, and H1) so it sits in the
 * finance tab body like every sibling tab instead of looking like a second page.
 */
export default function SupplierPortalPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [orders, setOrders] = useState<SupplierInboundOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [notClaimed, setNotClaimed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true); setNotClaimed(false);
    try {
      setOrders(await supplierClaimsService.getInboundOrders(activeWorkspaceId));
    } catch (e: any) {
      if (String(e?.message || '').includes('has not claimed')) setNotClaimed(true);
      else toast({ title: 'Failed to load orders', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { load(); }, [load]);

  // Incoming POs span every buyer, so give the list a search + status filter.
  const filterGroups = useMemo<FilterGroupDef[]>(() => [{
    key: 'general', label: 'General', icon: Inbox,
    fields: [
      { key: 'q', type: 'text', label: 'Search', placeholder: 'PO number / buyer…', accessor: (o: SupplierInboundOrder) => [o.order_number, o.buyer_name] },
      { key: 'status', type: 'multi', label: 'Status', options: optionsFromRows(orders, (o) => o.supplier_status), accessor: (o: SupplierInboundOrder) => o.supplier_status },
    ],
  }], [orders]);
  const { values: filterValues, setValues: setFilterValues, filtered: ordersView, previewCount } =
    useFilters<SupplierInboundOrder>(orders, filterGroups);

  const act = async (orderId: string, status: 'acknowledged' | 'shipped') => {
    if (!activeWorkspaceId) return;
    setBusyId(orderId);
    try {
      await supplierClaimsService.updateInboundOrder(activeWorkspaceId, orderId, { status });
      toast({ title: status === 'shipped' ? 'Marked shipped' : 'Acknowledged' });
      await load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const body = (
    <div className="space-y-4">
      {/* Standalone gets the page title; embedded relies on the Finance header above it. */}
      <div className="flex items-center justify-between gap-3">
        {embedded ? (
          <div>
            <h2 className="text-sm font-semibold text-primary">Incoming orders</h2>
            <p className="text-xs text-muted-foreground">Purchase orders sent to you across every buyer.</p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display tracking-tight" style={{ fontWeight: 600 }}>Incoming orders</h1>
              <p className="text-sm text-muted-foreground">Purchase orders sent to you across every buyer.</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <FilterBar groups={filterGroups} values={filterValues} onChange={setFilterValues} previewCount={previewCount} title="Filter incoming orders" />
          )}
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="rounded-full">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="dashboard-card border-0">
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : notClaimed ? (
        <Card className="dashboard-card border-0">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This workspace hasn't claimed a supplier identity yet. Once an operator approves your claim, purchase orders sent to you will appear here.
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Card className="dashboard-card border-0">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No incoming orders yet.</CardContent>
        </Card>
      ) : ordersView.length === 0 ? (
        <Card className="dashboard-card border-0">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No orders match the filter.</CardContent>
        </Card>
      ) : ordersView.map((o) => (
        <Card key={o.order_id} className="dashboard-card border-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="font-medium">
              PO {o.order_number} <span className="text-muted-foreground font-normal">· {o.buyer_name}</span>
            </CardTitle>
            <span className="flex items-center gap-2 shrink-0">
              {o.supplier_status && <span className={`text-[10px] capitalize ${statusTone(o.supplier_status)}`}>{o.supplier_status}</span>}
              <Badge variant="outline" className="text-[10px] tabular-nums">{o.total} {o.currency}</Badge>
            </span>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {o.lines.map((l, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{l.description} × {l.quantity}</span>
                  <span className="text-muted-foreground tabular-nums">{l.line_total} {o.currency}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-3">
              <Button size="sm" variant="outline" className="rounded-full h-8" disabled={busyId === o.order_id || o.supplier_status === 'acknowledged' || o.supplier_status === 'shipped'} onClick={() => act(o.order_id, 'acknowledged')}>
                <PackageCheck className="h-3.5 w-3.5 mr-1" /> Acknowledge
              </Button>
              <Button size="sm" className="rounded-full h-8" disabled={busyId === o.order_id || o.supplier_status === 'shipped'} onClick={() => act(o.order_id, 'shipped')}>
                {busyId === o.order_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Truck className="h-3.5 w-3.5 mr-1" /> Mark shipped</>}
              </Button>
              {o.supplier_eta && <span className="text-xs text-muted-foreground ml-auto">ETA {new Date(o.supplier_eta).toLocaleDateString()}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return embedded ? body : <div className="p-6 max-w-4xl mx-auto">{body}</div>;
}
