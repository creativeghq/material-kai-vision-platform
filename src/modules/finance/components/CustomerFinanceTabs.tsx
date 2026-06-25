// Reusable Finance sub-tabs for a CRM customer (contact or company).
// Mounts inside ContactDetailPage / CompanyDetailPage. Each tab is self-contained
// and lazy-loads its data on first render.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, Mail, Wallet, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  financeService,
  formatMoney,
  type CustomerTopProductRow,
} from '@/modules/finance/services/financeService';
import { ordersService } from '@/modules/finance/services/ordersService';

// `customerName` is optional metadata used only to label the customer inside the
// create dialogs; the ids are what actually scope the created records.
type Target = { contactId?: string; companyId?: string; customerName?: string };


/**
 * Shared presentational account summary — the single source of layout for a party's money
 * position, used by BOTH the CRM Account tab and the Finance → Parties drill-down so they
 * look identical. Shows a net-position headline + an "As customer" and/or "As supplier"
 * section (each only when that role has data). Pure: callers pass already-resolved numbers.
 */
export const PartyAccountSummary: React.FC<{
  customer?: { invoiced: number; paid: number; outstanding: number } | null;
  supplier?: { billed: number; paid: number; outstanding: number; ordered?: number } | null;
  /** Per-customer AR aging breakdown (exclusive buckets, by days past due). */
  aging?: { not_due: number; due_0_30: number; due_31_90: number; due_90_plus: number } | null;
  /** Orders roll-up (count, total ordered value, amount still owed on un-invoiced orders). */
  orders?: { count: number; ordered: number; owedUninvoiced: number } | null;
  meta?: Array<{ label: string; value: React.ReactNode }>;
}> = ({ customer, supplier, aging, orders, meta }) => {
  const net = (customer?.outstanding ?? 0) - (supplier?.outstanding ?? 0);
  const netLabel = net > 0 ? 'Account balance (they owe us)' : net < 0 ? 'Account balance (we owe them)' : 'Account balance (settled)';
  const netTone = net > 0 ? 'text-emerald-400' : net < 0 ? 'text-destructive' : 'text-muted-foreground';
  const netRing = net > 0 ? 'ring-1 ring-emerald-500/25' : net < 0 ? 'ring-1 ring-destructive/30' : '';

  const cell = (label: string, value: React.ReactNode, danger = false) => (
    <Card className={`dashboard-card border-0 ${danger ? 'ring-1 ring-destructive/40' : ''}`}>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${danger ? 'text-destructive' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );

  const agingCell = (label: string, value: number, danger = false) => (
    <div className={`rounded-md border border-border/50 px-2.5 py-1.5 ${danger && value > 0 ? 'border-destructive/40' : ''}`}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${danger && value > 0 ? 'text-destructive' : ''}`}>{formatMoney(value)}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <Card className={`dashboard-card border-0 ${netRing}`}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> {netLabel}</div>
          <div className={`text-2xl font-semibold ${netTone}`}>{formatMoney(Math.abs(net))}</div>
        </CardContent>
      </Card>

      {orders && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">Orders</div>
          <div className="grid grid-cols-3 gap-3">
            {cell('Orders', orders.count)}
            {cell('Ordered', formatMoney(orders.ordered))}
            {cell('Owed on orders', formatMoney(orders.owedUninvoiced), orders.owedUninvoiced > 0)}
          </div>
        </div>
      )}

      {customer && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">As customer</div>
          <div className="grid grid-cols-3 gap-3">
            {cell('Invoiced', formatMoney(customer.invoiced))}
            {cell('Paid', formatMoney(customer.paid))}
            {cell('They owe us', formatMoney(customer.outstanding), customer.outstanding > 0)}
          </div>
          {aging && (aging.not_due + aging.due_0_30 + aging.due_31_90 + aging.due_90_plus) > 0 && (
            <div className="grid grid-cols-4 gap-2 pt-0.5">
              {agingCell('Not due', aging.not_due)}
              {agingCell('1–30 days', aging.due_0_30)}
              {agingCell('31–90 days', aging.due_31_90)}
              {agingCell('90+ days', aging.due_90_plus, aging.due_90_plus > 0)}
            </div>
          )}
        </div>
      )}

      {supplier && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">As supplier</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {cell('Billed to us', formatMoney(supplier.billed))}
            {cell('Paid to them', formatMoney(supplier.paid))}
            {cell('We owe', formatMoney(supplier.outstanding), supplier.outstanding > 0)}
            {cell('Ordered', formatMoney(supplier.ordered ?? 0))}
          </div>
        </div>
      )}

      {meta && meta.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {meta.map((m, i) => <div key={i}>{m.label}: <span className="text-foreground">{m.value}</span></div>)}
        </div>
      )}
    </div>
  );
};

/**
 * #201 — consolidated account overview for the CRM party page: the shared PartyAccountSummary
 * (customer + supplier net position) + open orders / last payment meta + the customer's top
 * products to push + email-statement + an optional "View ledger in Finance" cross-link.
 */
export const CustomerAccountOverview: React.FC<Target & { isSupplier?: boolean; ledgerHref?: string }> = ({ contactId, companyId, isSupplier, ledgerHref }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<{ invoicedTotal: number; paidTotal: number; outstandingTotal: number; quoteCount: number } | null>(null);
  const [supplierAcct, setSupplierAcct] = useState<{ billedTotal: number; paidTotal: number; outstandingTotal: number; orderedTotal: number } | null>(null);
  const [lastPayment, setLastPayment] = useState<{ paid_at: string; amount: number; currency: string } | null>(null);
  const [openOrders, setOpenOrders] = useState(0);
  const [topProducts, setTopProducts] = useState<CustomerTopProductRow[]>([]);
  const [aging, setAging] = useState<{ not_due: number; due_0_30: number; due_31_90: number; due_90_plus: number } | null>(null);
  const [emailing, setEmailing] = useState(false);
  // Orders roll-up for the KPI strip. Receivables/payables now live PER ORDER (open an order),
  // not as a separate party-level section.
  const [orderStats, setOrderStats] = useState<{ count: number; ordered: number; owedUninvoiced: number } | null>(null);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contactId, companyId, activeWorkspaceId, isSupplier]);

  const load = async () => {
    if (!contactId && !companyId) return;
    setLoading(true);
    try {
      const [acct, supAcct, payments, topProds] = await Promise.all([
        financeService.getCustomerAccount({ contactId, companyId }),
        isSupplier ? financeService.getSupplierAccount({ contactId, companyId }) : Promise.resolve(null),
        financeService.listPayments({ counterpartyContactId: contactId, counterpartyCompanyId: companyId, direction: 'in', limit: 1 }),
        activeWorkspaceId
          ? financeService.reportCustomerTopProducts({ workspaceId: activeWorkspaceId, companyId, contactId, limit: 6 })
          : Promise.resolve([] as CustomerTopProductRow[]),
      ]);
      setAccount(acct ? { invoicedTotal: acct.invoicedTotal, paidTotal: acct.paidTotal, outstandingTotal: acct.outstandingTotal, quoteCount: acct.quoteCount } : null);
      setSupplierAcct(supAcct ? { billedTotal: supAcct.billedTotal, paidTotal: supAcct.paidTotal, outstandingTotal: supAcct.outstandingTotal, orderedTotal: supAcct.orderedTotal } : null);
      const p = payments[0];
      setLastPayment(p ? { paid_at: p.paid_at, amount: p.amount, currency: p.currency } : null);
      setTopProducts(topProds);

      // Orders roll-up — count, total ordered value, and the still-owed amount on orders that
      // haven't been invoiced yet. This drives the KPI strip ("Orders" + "Owed on orders").
      if (activeWorkspaceId) {
        try {
          const ordersList = await ordersService.list({ workspaceId: activeWorkspaceId, companyId, contactId });
          const active = ordersList.filter((o) => o.status !== 'cancelled');
          const uninvoiced = await ordersService.listUninvoicedOutstanding({ workspaceId: activeWorkspaceId, companyId, contactId });
          setOrderStats({
            count: active.length,
            ordered: active.reduce((a, o) => a + Number(o.total), 0),
            owedUninvoiced: uninvoiced.reduce((a, o) => a + o.outstanding, 0),
          });
          setOpenOrders(active.filter((o) => o.status !== 'fulfilled').length);
        } catch { setOrderStats(null); }

        // Per-customer AR aging breakdown (skip for supplier-only views).
        const buckets = await financeService.getCustomerAgingBuckets({ workspaceId: activeWorkspaceId, companyId, contactId });
        const b = buckets[0];
        setAging(b ? { not_due: Number(b.not_due), due_0_30: Number(b.due_0_30), due_31_90: Number(b.due_31_90), due_90_plus: Number(b.due_90_plus) } : null);
      }
    } catch (e) {
      console.error('account overview load failed', e);
    } finally {
      setLoading(false);
    }
  };

  const emailOverview = async () => {
    const partyId = companyId ?? contactId;
    if (!partyId) return;
    try {
      setEmailing(true);
      const res = await financeService.sendStatement({ partyType: companyId ? 'company' : 'contact', partyId });
      if (res.ok) {
        toast({ title: 'Account overview sent', description: res.email_sent_to ? `Emailed to ${res.email_sent_to}` : 'Statement generated' });
      } else {
        toast({ title: 'Could not send', description: res.error ?? 'No email on file for this customer', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Failed to send', description: e?.message, variant: 'destructive' });
    } finally {
      setEmailing(false);
    }
  };

  if (loading) return <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-primary">Account overview</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {ledgerHref && (
            <Link to={ledgerHref}><Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5 mr-2" /> View ledger in Finance</Button></Link>
          )}
          <Button size="sm" variant="outline" onClick={emailOverview} disabled={emailing}>
            {emailing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-2" />}
            Email account info
          </Button>
        </div>
      </div>

      <PartyAccountSummary
        customer={account ? { invoiced: account.invoicedTotal, paid: account.paidTotal, outstanding: account.outstandingTotal } : null}
        supplier={supplierAcct ? { billed: supplierAcct.billedTotal, paid: supplierAcct.paidTotal, outstanding: supplierAcct.outstandingTotal, ordered: supplierAcct.orderedTotal } : null}
        aging={aging}
        orders={orderStats}
        meta={[
          { label: 'Open orders', value: openOrders },
          { label: 'Last payment', value: lastPayment ? new Date(lastPayment.paid_at).toLocaleDateString() : '—' },
        ]}
      />

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Top items to push</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-right">Qty bought</th>
                <th className="px-4 py-2 text-right">Revenue</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-right">Last ordered</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No purchase history yet for this customer.</td></tr>
              ) : (
                topProducts.map((p) => (
                  <tr key={p.product_id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{p.description || 'Product'}</div>
                      {p.sku && <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(p.total_quantity).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.revenue_net)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.order_count}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{p.last_ordered ? new Date(p.last_ordered).toLocaleDateString() : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Receivables & payables are managed PER ORDER now — open an order to add/see them. */}
    </div>
  );
};

