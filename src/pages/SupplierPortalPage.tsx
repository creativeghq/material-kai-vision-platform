import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageCheck, Truck, RefreshCw, Inbox } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supplierClaimsService, type SupplierInboundOrder } from '@/services/supplierClaimsService';

/**
 * #247 / Workstream F — supplier portal. A claimed supplier sees the purchase
 * orders sent to their identity across ALL buyer workspaces and can acknowledge /
 * mark shipped. Backed by the operator-claim flow; the RPCs enforce the claim.
 */
export default function SupplierPortalPage() {
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

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium flex items-center gap-2"><Inbox className="h-5 w-5" /> Incoming orders</h1>
          <p className="text-sm text-muted-foreground">Purchase orders sent to you across every buyer.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : notClaimed ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          This workspace hasn't claimed a supplier identity yet. Once an operator approves your claim, purchase orders sent to you will appear here.
        </CardContent></Card>
      ) : orders.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No incoming orders yet.</CardContent></Card>
      ) : orders.map((o) => (
        <Card key={o.order_id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span>PO {o.order_number} · {o.buyer_name}</span>
              <span className="flex items-center gap-2">
                {o.supplier_status && <Badge variant="secondary" className="text-[10px] capitalize">{o.supplier_status}</Badge>}
                <Badge variant="outline" className="text-[10px]">{o.total} {o.currency}</Badge>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              {o.lines.map((l, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{l.description} × {l.quantity}</span>
                  <span className="text-muted-foreground">{l.line_total} {o.currency}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
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
}
