/**
 * Daily dispatch board — the warehouse's "what ships today" program. Lists every paid,
 * shippable order (`invoices.has_shipping` + `status='paid'`) that hasn't left the door,
 * bucketed by `transport_date`. Each order matches its lines to warehouse stock (so
 * shortfalls show before picking), cuts a draft dispatch note in one click, then issues
 * it (decrementing stock + optionally myDATA 9.3). Mirrors the PlanningTab day-bucketing.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Truck, Printer, AlertTriangle, PackageCheck, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { escapeHtml } from '@/utils/escapeHtml';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { deliveryNotesService, type DispatchQueueOrder } from '@/modules/finance/services/deliveryNotesService';

type BucketKey = 'overdue' | 'today' | 'next7' | 'later' | 'undated';
const BUCKET_LABEL: Record<BucketKey, string> = {
  overdue: 'Overdue', today: 'Today', next7: 'Next 7 days', later: 'Later', undated: 'No ship date',
};
const BUCKET_ORDER: BucketKey[] = ['overdue', 'today', 'next7', 'later', 'undated'];

export const DispatchBoard: React.FC<{ workspaceId: string; readOnly: boolean }> = ({ workspaceId, readOnly }) => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<DispatchQueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Each day-bucket is its own table, so each keeps its own page — paging "Later" must not
  // move the operator off the "Today" rows they're picking.
  const [pages, setPages] = useState<Record<BucketKey, number>>({ overdue: 1, today: 1, next7: 1, later: 1, undated: 1 });

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setOrders(await deliveryNotesService.listDispatchQueue(workspaceId));
    } catch (err: any) {
      toast({ title: 'Failed to load dispatch board', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId]);

  const buckets = useMemo(() => {
    const b: Record<BucketKey, DispatchQueueOrder[]> = { overdue: [], today: [], next7: [], later: [], undated: [] };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const o of orders) {
      if (!o.transport_date) { b.undated.push(o); continue; }
      const d = new Date(o.transport_date); d.setHours(0, 0, 0, 0);
      const diff = Math.floor((d.getTime() - today.getTime()) / 86_400_000);
      if (diff < 0) b.overdue.push(o);
      else if (diff === 0) b.today.push(o);
      else if (diff <= 7) b.next7.push(o);
      else b.later.push(o);
    }
    return b;
  }, [orders]);

  // Issuing/scheduling an order moves it between buckets (or off the board) — clamp so a
  // shrunken bucket never leaves its table stranded on an empty page.
  useEffect(() => {
    setPages((prev) => {
      const next = { ...prev };
      for (const k of BUCKET_ORDER) next[k] = clampPage(prev[k], buckets[k].length);
      return next;
    });
  }, [buckets]);

  const shortfallCount = orders.filter((o) => o.has_shortfall).length;

  const createNote = async (o: DispatchQueueOrder) => {
    setBusy(o.invoice_id);
    try {
      await deliveryNotesService.createDispatchFromOrder(workspaceId, o);
      toast({ title: 'Dispatch note created', description: `Draft cut for order ${o.internal_number}. Issue it to decrement stock.` });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const issueNote = async (o: DispatchQueueOrder) => {
    if (!o.dispatch) return;
    setBusy(o.invoice_id);
    try {
      await deliveryNotesService.issue(o.dispatch.id);
      toast({ title: 'Shipped · stock decremented', description: `Order ${o.internal_number} dispatched.` });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to issue', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const printNote = async (o: DispatchQueueOrder) => {
    if (!o.dispatch) return;
    setBusy(o.invoice_id);
    try {
      const url = await deliveryNotesService.generatePdf(o.dispatch.id, true);
      if (url) window.open(url, '_blank');
    } catch (err: any) {
      toast({ title: 'PDF failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  // Planning: schedule an order into a day (buckets update on reload). Tomorrow = next day's dispatch load.
  const tomorrowISO = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const schedule = async (o: DispatchQueueOrder, date: string | null) => {
    setBusy(o.invoice_id);
    try {
      await deliveryNotesService.scheduleDispatch(workspaceId, o.invoice_id, date);
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to schedule', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (orders.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        <PackageCheck className="mx-auto mb-3 h-8 w-8 opacity-40" />
        Nothing to ship. Paid orders flagged for shipping show up here, bucketed by their ship date.
        Once a dispatch note is issued the order leaves the board.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">{orders.length} order{orders.length === 1 ? '' : 's'} to ship</span>
          {shortfallCount > 0 && (
            <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" /> {shortfallCount} with stock shortfall</Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => printRunSheet(orders)}>
          <Printer className="mr-1 h-3.5 w-3.5" /> Print run sheet
        </Button>
      </div>

      {BUCKET_ORDER.filter((k) => buckets[k].length > 0).map((k) => (
        <div key={k} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${k === 'overdue' ? 'text-destructive' : k === 'today' ? 'text-foreground' : 'text-muted-foreground'}`}>{BUCKET_LABEL[k]}</h3>
            <Badge variant="outline" className="text-[10px]">{buckets[k].length}</Badge>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  {paginate(buckets[k], pages[k]).map((o) => {
                    const isOpen = expanded.has(o.invoice_id);
                    return (
                      <React.Fragment key={o.invoice_id}>
                        <tr className="border-b border-border/30 hover:bg-muted/30">
                          <td className="w-8 px-2 py-2">
                            <button type="button" onClick={() => toggle(o.invoice_id)} className="text-muted-foreground hover:text-foreground">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-mono text-xs">{o.internal_number}</div>
                            <div className="text-xs text-muted-foreground">{o.customer_name ?? 'Customer'}</div>
                          </td>
                          <td className="px-2 py-2 max-w-[260px]">
                            <div className="truncate text-xs text-muted-foreground" title={o.ship_to ?? ''}>{o.ship_to ?? '—'}</div>
                            {!readOnly && (
                              <div className="mt-1 flex items-center gap-1">
                                <input
                                  type="date" value={o.transport_date ?? ''} disabled={busy === o.invoice_id}
                                  onChange={(e) => schedule(o, e.target.value || null)}
                                  className="h-6 rounded border border-border/60 bg-transparent px-1 text-[11px]"
                                  title="Ship date — plan which day this order goes out"
                                />
                                {o.transport_date !== tomorrowISO && (
                                  <button type="button" disabled={busy === o.invoice_id} onClick={() => schedule(o, tomorrowISO)}
                                    className="text-[11px] text-primary hover:underline whitespace-nowrap">Tomorrow</button>
                                )}
                                {o.transport_date && (
                                  <button type="button" disabled={busy === o.invoice_id} onClick={() => schedule(o, null)}
                                    className="text-[11px] text-muted-foreground hover:underline">clear</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {o.lines.length} line{o.lines.length === 1 ? '' : 's'}
                            {o.has_shortfall && <Badge variant="destructive" className="ml-2 gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" /> short</Badge>}
                          </td>
                          <td className="px-2 py-2 text-right text-xs whitespace-nowrap">{formatMoney(o.total, o.currency)}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {!readOnly && !o.dispatch && (
                                <Button size="sm" disabled={busy === o.invoice_id} onClick={() => createNote(o)}>
                                  {busy === o.invoice_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Truck className="mr-1 h-3.5 w-3.5" /> Create note</>}
                                </Button>
                              )}
                              {!readOnly && o.dispatch && (
                                <>
                                  <Badge variant="outline" className="text-[10px]">draft {o.dispatch.number ?? ''}</Badge>
                                  <Button size="sm" variant="ghost" disabled={busy === o.invoice_id} onClick={() => printNote(o)} title="Print dispatch note">
                                    <FileText className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" disabled={busy === o.invoice_id} onClick={() => issueNote(o)}>
                                    {busy === o.invoice_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><PackageCheck className="mr-1 h-3.5 w-3.5" /> Issue & ship</>}
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-border/30 bg-muted/20">
                            <td />
                            <td colSpan={5} className="px-2 py-2">
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                  <tr>
                                    <th className="py-1 text-left font-medium">Item</th>
                                    <th className="py-1 text-left font-medium">SKU</th>
                                    <th className="py-1 text-right font-medium">Ordered</th>
                                    <th className="py-1 text-right font-medium">On hand</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {o.lines.map((l, i) => (
                                    <tr key={i} className={l.shortfall ? 'text-destructive' : ''}>
                                      <td className="py-1 pr-2">{l.description}</td>
                                      <td className="py-1 pr-2 font-mono text-muted-foreground">{l.sku ?? '—'}</td>
                                      <td className="py-1 text-right">{l.quantity}{l.unit ? ` ${l.unit}` : ''}</td>
                                      <td className="py-1 text-right">{l.qty_on_hand == null ? <span className="text-muted-foreground">not stocked</span> : l.qty_on_hand}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <TablePagination
                page={pages[k]}
                total={buckets[k].length}
                onPageChange={(p) => setPages((prev) => ({ ...prev, [k]: p }))}
                label="orders"
              />
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
};

/** Open a printable run sheet (one picking block per order) in a new window. Pure client render. */
function printRunSheet(orders: DispatchQueueOrder[]) {
  const esc = escapeHtml; // was a local `& < >`-only escaper (left " ' unescaped — attribute-unsafe)
  const today = new Date().toLocaleDateString();
  const blocks = orders.map((o) => `
    <div class="order">
      <div class="ohead">
        <strong>${esc(o.internal_number)}</strong> — ${esc(o.customer_name ?? 'Customer')}
        ${o.transport_date ? `<span class="date">ship ${esc(o.transport_date)}</span>` : ''}
      </div>
      ${o.ship_to ? `<div class="ship">${esc(o.ship_to)}</div>` : ''}
      <table>
        <thead><tr><th>☐</th><th>Item</th><th>SKU</th><th class="r">Qty</th><th class="r">On hand</th></tr></thead>
        <tbody>
          ${o.lines.map((l) => `<tr class="${l.shortfall ? 'short' : ''}"><td>☐</td><td>${esc(l.description)}</td><td>${esc(l.sku ?? '')}</td><td class="r">${esc(l.quantity)}${l.unit ? ' ' + esc(l.unit) : ''}</td><td class="r">${l.qty_on_hand == null ? '-' : esc(l.qty_on_hand)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Dispatch run sheet — ${esc(today)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
      body{font-family:'Open Sans',Arial,Helvetica,sans-serif;margin:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
      .order{border:1px solid #ccc;border-radius:6px;padding:10px 12px;margin-bottom:12px;page-break-inside:avoid}
      .ohead{font-size:14px;margin-bottom:2px} .ohead .date{float:right;color:#666;font-weight:normal}
      .ship{color:#444;font-size:12px;margin-bottom:6px}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{border-bottom:1px solid #eee;padding:4px 6px;text-align:left}
      th{color:#666;font-weight:600} .r{text-align:right} tr.short td{color:#b00}
      @media print{button{display:none}}
    </style></head>
    <body>
      <h1>Dispatch run sheet</h1>
      <div class="sub">${esc(today)} · ${orders.length} order${orders.length === 1 ? '' : 's'}</div>
      <button onclick="window.print()" style="margin-bottom:12px;padding:6px 14px">Print</button>
      ${blocks}
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

export default DispatchBoard;
