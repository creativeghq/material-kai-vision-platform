import React, { useEffect, useState } from 'react';
import { Loader2, Download, FileText, FileCheck, Receipt, Package, Wallet, ChevronDown, ChevronRight, Repeat } from 'lucide-react';
import { Card } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { TablePagination, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import {
  customerDocumentsService,
  type CustomerInvoiceDoc,
  type CustomerReceiptDoc,
  type CustomerOrder,
  type CustomerAccountSummary,
  type CustomerOrderItem,
} from '@/services/customerDocumentsService';

const money = (v: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v || 0);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

const ORDER_STATUS_LABEL: Record<CustomerOrder['status'], string> = {
  draft: 'Pre-order', confirmed: 'Confirmed', partially_fulfilled: 'Partially delivered',
  fulfilled: 'Completed', cancelled: 'Cancelled',
};
const PAYMENT_LABEL: Record<CustomerOrder['payment_status'], string> = {
  unpaid: 'Unpaid', partial: 'Partially paid', paid: 'Paid',
};

/**
 * Client Portal — the signed-in customer's own account: a spend/outstanding summary,
 * their sales orders (with drill-in line items), issued invoices / retail receipts,
 * and payment receipts. Data comes from the finance-customer-documents edge function
 * (finance tables are workspace-member RLS-gated, so customers can't read them directly).
 * Empty simply means nothing is addressed to this account yet.
 */
export const MyDocumentsTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CustomerAccountSummary[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoiceDoc[]>([]);
  const [receipts, setReceipts] = useState<CustomerReceiptDoc[]>([]);
  // Each of the three lists grows independently, so each keeps its own page — and each page is
  // fetched from the server. Client-side slicing used to page over a 200-row ceiling, so anything
  // past row 200 was simply unreachable.
  const [orderPage, setOrderPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [receiptPage, setReceiptPage] = useState(1);
  // Server-reported totals — the page count comes from these, not from the rows on screen.
  const [totals, setTotals] = useState({ orders: 0, invoices: 0, receipts: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await customerDocumentsService.listMyDocuments({
          limit: TABLE_PAGE_SIZE,
          ordersOffset: (orderPage - 1) * TABLE_PAGE_SIZE,
          invoicesOffset: (invoicePage - 1) * TABLE_PAGE_SIZE,
          receiptsOffset: (receiptPage - 1) * TABLE_PAGE_SIZE,
        });
        if (cancelled) return;
        setSummary(data.summary);
        setOrders(data.orders); setInvoices(data.invoices); setReceipts(data.receipts);
        setTotals({
          orders: data.paging?.orders.total ?? data.orders.length,
          invoices: data.paging?.invoices.total ?? data.invoices.length,
          receipts: data.paging?.receipts.total ?? data.receipts.length,
        });
      } catch (err) {
        if (!cancelled) toast({ title: 'Could not load your account', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast, orderPage, invoicePage, receiptPage]);

  const open = (url: string | null) => {
    if (url) window.open(url, '_blank');
    else toast({ title: 'Not available yet', description: 'This document is still being prepared.', variant: 'destructive' });
  };

  if (loading) {
    return (
      <Card className="dashboard-card p-12 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const isEmpty = summary.length === 0 && totals.orders === 0 && totals.invoices === 0 && totals.receipts === 0;
  if (isEmpty) {
    return (
      <Card className="dashboard-card p-12 text-center space-y-3">
        <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        <p className="text-xs text-muted-foreground">
          Your orders, invoices and receipts will appear here as soon as a business issues them to you.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Account summary (per currency) ── */}
      {summary.map((s) => (
        <div key={s.currency} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Total spent" value={money(s.paid, s.currency)} icon={Wallet} />
          <SummaryCard label="Outstanding" value={money(s.outstanding, s.currency)} icon={Wallet} danger={s.outstanding > 0} />
          <SummaryCard label="Orders" value={String(s.order_count)} icon={Package} />
          <SummaryCard label="Documents" value={String(s.doc_count)} icon={FileText} />
        </div>
      ))}

      {/* ── Orders ── */}
      {totals.orders > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Orders</h3>
          <div className="space-y-2">
            {orders.map((o) => <OrderRow key={o.id} order={o} />)}
          </div>
          <TablePagination page={orderPage} total={totals.orders} onPageChange={setOrderPage} label="orders" />
        </div>
      )}

      {/* ── Invoices & receipts ── */}
      {totals.invoices > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Invoices &amp; receipts</h3>
          <div className="space-y-2">
            {invoices.map((d) => (
              <Card key={d.id} className="dashboard-card p-3 flex items-center gap-3">
                {d.kind === 'receipt' ? <FileCheck className="h-4 w-4 text-primary shrink-0" /> : <FileText className="h-4 w-4 text-primary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {d.kind === 'receipt' ? 'Receipt' : 'Invoice'} {d.number}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(d.issued_at)} · {money(d.total, d.currency)}
                    {d.amount_due > 0 && d.status !== 'paid' ? ` · ${money(d.amount_due, d.currency)} due` : ''}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] uppercase ${statusTone(d.status)}`}>
                  {d.status.replace('_', ' ')}
                </span>
                <Button size="sm" variant="ghost" className="h-7 gap-1 shrink-0" onClick={() => open(d.pdf_url)}>
                  <Download className="h-3.5 w-3.5" /> <span className="text-xs">PDF</span>
                </Button>
              </Card>
            ))}
          </div>
          <TablePagination page={invoicePage} total={totals.invoices} onPageChange={setInvoicePage} label="documents" />
        </div>
      )}

      {/* ── Payment receipts ── */}
      {totals.receipts > 0 && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Payment receipts</h3>
          <div className="space-y-2">
            {receipts.map((r) => (
              <Card key={r.id} className="dashboard-card p-3 flex items-center gap-3">
                <Receipt className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">Receipt {r.number}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(r.paid_at)} · {money(r.amount, r.currency)}{r.method ? ` · ${r.method.replace('_', ' ')}` : ''}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 gap-1 shrink-0" onClick={() => open(r.pdf_url)}>
                  <Download className="h-3.5 w-3.5" /> <span className="text-xs">PDF</span>
                </Button>
              </Card>
            ))}
          </div>
          <TablePagination page={receiptPage} total={totals.receipts} onPageChange={setReceiptPage} label="receipts" />
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: string; icon: React.ComponentType<{ className?: string }>; danger?: boolean }> = ({ label, value, icon: Icon, danger }) => (
  <Card className={`dashboard-card p-3 ${danger ? 'ring-1 ring-destructive/40' : ''}`}>
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
    <div className={`mt-1 text-xl font-semibold ${danger ? 'text-destructive' : ''}`}>{value}</div>
  </Card>
);

/** A single order row that expands to show its line items on demand. */
const OrderRow: React.FC<{ order: CustomerOrder }> = ({ order }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CustomerOrderItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);

  const orderAgain = async () => {
    setReordering(true);
    try {
      const res = await customerDocumentsService.reorder(order.id);
      toast({
        title: 'Reorder sent',
        description: `We sent your request to the business${res.order_number ? ` (draft order ${res.order_number})` : ''}. They'll confirm the price and availability.`,
      });
    } catch (err) {
      toast({ title: 'Could not reorder', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setReordering(false);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      setLoading(true);
      try {
        const detail = await customerDocumentsService.getOrderDetail(order.id);
        setItems(detail.items);
      } catch (err) {
        toast({ title: 'Could not load order', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Card className="dashboard-card overflow-hidden">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/20 transition-colors">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <Package className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">Order {order.order_number ?? order.id.slice(0, 8)}</div>
          <div className="text-[11px] text-muted-foreground">{fmtDate(order.created_at)} · {money(order.total, order.currency)}</div>
        </div>
        <span className={`shrink-0 text-[10px] capitalize ${statusTone(order.status)}`}>{ORDER_STATUS_LABEL[order.status]}</span>
        <span className={`shrink-0 text-[10px] capitalize ${statusTone(order.payment_status)}`}>{PAYMENT_LABEL[order.payment_status]}</span>
      </button>
      {open && (
        <div className="border-t border-border/50 px-3 py-2">
          {loading ? (
            <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : !items || items.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No line items recorded for this order.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left font-medium">Item</th>
                  <th className="py-1.5 text-right font-medium">Qty</th>
                  <th className="py-1.5 text-right font-medium">Unit</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-border/30">
                    <td className="py-1.5 pr-2">
                      <div className="truncate">{it.description || 'Item'}</div>
                      {it.quantity_delivered > 0 && it.quantity_delivered < it.quantity && (
                        <div className="text-[10px] text-amber-400">{it.quantity_delivered} of {it.quantity} delivered</div>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{it.quantity}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(it.unit_price, order.currency)}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{money(it.line_total, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" className="rounded-full" disabled={reordering} onClick={orderAgain}>
              {reordering ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Repeat className="h-3.5 w-3.5 mr-1" />}
              Order again
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};
