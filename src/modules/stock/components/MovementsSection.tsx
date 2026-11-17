import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PackagePlus, PackageMinus, SlidersHorizontal, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { stockService, type StockMovement } from '../services/stockService';
import { formatDate } from '@/utils/datetime';

const DIR_META: Record<string, { icon: React.ElementType; label: string; cls: string }> = {
  in: { icon: PackagePlus, label: 'Received', cls: 'text-emerald-600 dark:text-emerald-400' },
  out: { icon: PackageMinus, label: 'Issued', cls: 'text-red-500 dark:text-red-400' },
  adjust: { icon: SlidersHorizontal, label: 'Adjusted', cls: 'text-amber-600 dark:text-amber-400' },
};

const fmtWhen = (iso: string) => {
  try { return formatDate(iso, { withTime: true }); } catch { return iso; }
};

export const MovementsSection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 500 is the server-side ceiling on `list-movements`; ask for all of it so the pager
        // walks the full window instead of a silently truncated slice of it.
        const m = await stockService.listMovements(workspaceId, { limit: 500 });
        if (!cancelled) setRows(m);
      } catch (err: any) {
        if (!cancelled) toast({ title: 'Failed to load movements', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, toast]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.item?.name ?? ''} ${r.item?.sku ?? ''} ${r.reason ?? ''} ${r.source_type ?? ''}`.toLowerCase().includes(s));
  }, [rows, q]);

  // Narrowing the filter shrinks the row set — without this a deep page goes blank.
  useEffect(() => { setPage((p) => clampPage(p, visible.length)); }, [visible.length]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between gap-2">
        <CardTitle>Stock Movements</CardTitle>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item, reason, source…" className="h-8 w-52 pl-7 text-xs" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{rows.length === 0 ? 'No stock movements yet.' : 'No movements match the filter.'}</td></tr>
              )}
              {paginate(visible, page).map((r) => {
                const meta = DIR_META[r.direction] ?? DIR_META.adjust;
                const Icon = meta.icon;
                return (
                  <tr key={r.id} className="border-b border-border/30">
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmtWhen(r.occurred_at)}</td>
                    <td className="px-4 py-2 font-medium">
                      {r.item?.name ?? '—'}
                      {r.item?.sku && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{r.item.sku}</span>}
                    </td>
                    <td className="px-4 py-2"><span className={`text-sm inline-flex items-center ${meta.cls}`}><Icon className="h-3 w-3 mr-1" />{meta.label}</span></td>
                    <td className="px-4 py-2 text-right font-medium">{r.quantity}{r.item?.unit ? <span className="text-xs text-muted-foreground"> {r.item.unit}</span> : null}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.reason ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.source_type ?? 'manual'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        {!loading && <TablePagination page={page} total={visible.length} onPageChange={setPage} label="movements" />}
      </CardContent>
    </Card>
  );
};
