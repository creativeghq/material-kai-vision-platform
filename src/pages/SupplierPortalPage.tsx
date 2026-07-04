import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageCheck, Truck, RefreshCw, Inbox } from 'lucide-react';
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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display tracking-tight" style={{ fontWeight: 600 }}>Incoming orders</h1>
            <p className="text-sm text-muted-foreground">Purchase orders sent to you across every buyer.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="rounded-full">
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : notClaimed ? (
        <div className="dashboard-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
          This workspace hasn't claimed a supplier identity yet. Once an operator approves your claim, purchase orders sent to you will appear here.
        </div>
      ) : orders.length === 0 ? (
        <div className="dashboard-card rounded-2xl p-10 text-center text-sm text-muted-foreground">No incoming orders yet.</div>
      ) : orders.map((o) => (
        <div key={o.order_id} className="dashboard-card rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="font-display text-[15px]" style={{ fontWeight: 600 }}>
              PO {o.order_number} <span className="text-muted-foreground">· {o.buyer_name}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {o.supplier_status && <Badge variant="secondary" className="text-[10px] capitalize">{o.supplier_status}</Badge>}
              <Badge variant="outline" className="text-[10px] tabular-nums">{o.total} {o.currency}</Badge>
            </span>
          </div>
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
        </div>
      ))}
    </div>
  );
}
