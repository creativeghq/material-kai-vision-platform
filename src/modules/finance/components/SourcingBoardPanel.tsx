import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageSearch, Truck, PackageCheck, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SectionHeader } from '@/components/shared/SectionHeader';

/**
 * Finance procurement board off the stock_allocations ledger.
 * Three lanes: Needs ordering (committed demand, no supply) / On order (awaiting
 * supplier, with ETA) / Arrived-reserved (held for the customer, ready to dispatch).
 */
interface AllocationRow {
  id: string;
  status: string;
  quantity: number;
  source_type: string | null;
  expected_at: string | null;
  reserved_at: string | null;
  product_name: string | null;
  product_sku: string | null;
  customer_name: string | null;
  supply_order_id: string | null;
  supply_order_number: string | null;
  supplier_name: string | null;
  warehouse_name: string | null;
}
interface BoardData {
  needs_ordering: AllocationRow[];
  on_order: AllocationRow[];
  reserved: AllocationRow[];
  counts: { needs_ordering: number; on_order: number; reserved: number };
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

const AllocationCard: React.FC<{ row: AllocationRow; lane: 'needs' | 'on_order' | 'reserved' }> = ({ row, lane }) => (
  <div className="dashboard-card p-3 space-y-1.5">
    <div className="flex items-start justify-between gap-2">
      <span className="text-sm font-medium leading-tight">{row.product_name || '(unnamed product)'}</span>
      <Badge variant="secondary" className="shrink-0 text-[10px]">×{row.quantity}</Badge>
    </div>
    {row.product_sku && <div className="font-mono text-[10px] text-muted-foreground">{row.product_sku}</div>}
    {row.customer_name && (
      <div className="text-xs text-muted-foreground">For: <span className="text-foreground">{row.customer_name}</span></div>
    )}
    {lane === 'on_order' && (
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
        {row.supplier_name && <span>{row.supplier_name}</span>}
        {row.supply_order_number && <span className="font-mono">PO {row.supply_order_number}</span>}
        <span>ETA {fmtDate(row.expected_at)}</span>
      </div>
    )}
    {lane === 'reserved' && (
      <div className="text-xs text-muted-foreground">
        {row.warehouse_name ? `In ${row.warehouse_name}` : 'In stock'} · reserved {fmtDate(row.reserved_at)}
      </div>
    )}
  </div>
);

const Lane: React.FC<{
  title: string; icon: React.ElementType; count: number; rows: AllocationRow[]; lane: 'needs' | 'on_order' | 'reserved';
}> = ({ title, icon: Icon, count, rows, lane }) => (
  <Card className="flex-1 min-w-[260px]">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2">
        <Icon className="h-4 w-4" /> {title}
        <Badge variant="outline" className="ml-auto">{count}</Badge>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      {rows.length === 0
        ? <p className="text-xs text-muted-foreground py-6 text-center">Nothing here.</p>
        : rows.map((r) => <AllocationCard key={r.id} row={r} lane={lane} />)}
    </CardContent>
  </Card>
);

export const SourcingBoardPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('get_sourcing_board', { p_workspace_id: workspaceId, p_mine: mine });
      if (error) throw error;
      setData(res as unknown as BoardData);
    } catch (err: any) {
      toast({ title: 'Failed to load sourcing board', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [workspaceId, mine, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Sourcing"
        subtitle="What needs ordering, what's on its way, and what's reserved for customers."
        actions={<>
          <div className="inline-flex rounded-full border border-border overflow-hidden text-xs">
            <button
              className={`px-3 py-1 ${!mine ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              onClick={() => setMine(false)}
            >All</button>
            <button
              className={`px-3 py-1 ${mine ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              onClick={() => setMine(true)}
            >My orders</button>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </>}
      />
      {loading && !data ? (
        <div className="flex items-center gap-2 justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="flex gap-4 flex-wrap items-start">
          <Lane title="Needs ordering" icon={PackageSearch} count={data?.counts.needs_ordering ?? 0} rows={data?.needs_ordering ?? []} lane="needs" />
          <Lane title="On order" icon={Truck} count={data?.counts.on_order ?? 0} rows={data?.on_order ?? []} lane="on_order" />
          <Lane title="Arrived · reserved" icon={PackageCheck} count={data?.counts.reserved ?? 0} rows={data?.reserved ?? []} lane="reserved" />
        </div>
      )}
    </div>
  );
};

export default SourcingBoardPanel;
