// Reusable Finance sub-tabs for a CRM customer (contact or company).
// Mounts inside ContactDetailPage / CompanyDetailPage. Each tab is self-contained
// and lazy-loads its data on first render.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, Mail, Wallet, ShoppingBag, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  financeService,
  formatMoney,
  type CustomerTopProductRow,
  type ManualEntry,
  type ManualEntryDirection,
} from '@/modules/finance/services/financeService';
import { ordersService, ORDER_STATUS_LABEL } from '@/modules/finance/services/ordersService';
import { ManualEntryDialog } from '@/modules/finance/components/ManualEntryDialog';

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
  meta?: Array<{ label: string; value: React.ReactNode }>;
}> = ({ customer, supplier, aging, meta }) => {
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
export const CustomerAccountOverview: React.FC<Target & { isSupplier?: boolean; ledgerHref?: string }> = ({ contactId, companyId, customerName, isSupplier, ledgerHref }) => {
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
  // Item 3 — un-invoiced receivables/payables recorded against this party.
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; direction: ManualEntryDirection }>({ open: false, direction: 'receivable' });
  // Confirmed orders not yet invoiced are real money owed too — surfaced as rows here.
  const [orderRows, setOrderRows] = useState<Array<{ id: string; label: string; direction: ManualEntryDirection; outstanding: number; currency: string; statusLabel: string }>>([]);

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

      // Open orders = quotes still in flight (submitted / quoted) for this customer.
      let oq = supabase.from('quotes').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'quoted']);
      if (contactId) oq = oq.eq('customer_contact_id', contactId);
      if (companyId) oq = oq.eq('customer_company_id', companyId);
      const { count } = await oq;
      setOpenOrders(count ?? 0);

      // Per-customer AR aging breakdown (skip for supplier-only views).
      if (activeWorkspaceId) {
        const buckets = await financeService.getCustomerAgingBuckets({ workspaceId: activeWorkspaceId, companyId, contactId });
        const b = buckets[0];
        setAging(b ? { not_due: Number(b.not_due), due_0_30: Number(b.due_0_30), due_31_90: Number(b.due_31_90), due_90_plus: Number(b.due_90_plus) } : null);

        // Un-invoiced receivables/payables for this party (item 3).
        const me = await financeService.listManualEntries({ workspaceId: activeWorkspaceId, companyId, contactId, includeSettled: true }).catch(() => [] as ManualEntry[]);
        setEntries(me);

        // Confirmed-but-not-yet-invoiced orders are money owed too, but they aren't AR/AP
        // documents yet (no invoice/bill issued). Surface their outstanding balance here so
        // "money owed" is complete. Once an order is invoiced, the invoice/bill takes over
        // and the order drops off (filtered out below) — no double counting.
        try {
          const uninvoiced = await ordersService.listUninvoicedOutstanding({ workspaceId: activeWorkspaceId, companyId, contactId });
          setOrderRows(uninvoiced.map((o) => ({
            id: o.id,
            label: `Order ${o.order_number ?? o.id.slice(0, 8)}`,
            direction: (o.order_type === 'sales' ? 'receivable' : 'payable') as ManualEntryDirection,
            outstanding: o.outstanding,
            currency: o.currency,
            statusLabel: ORDER_STATUS_LABEL[o.status],
          })));
        } catch { setOrderRows([]); }
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
          <Button size="sm" variant="outline" onClick={() => setEntryDialog({ open: true, direction: 'receivable' })}>
            <Plus className="h-3.5 w-3.5 mr-2" /> Add receivable
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEntryDialog({ open: true, direction: 'payable' })}>
            <Plus className="h-3.5 w-3.5 mr-2" /> Add payable
          </Button>
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

      {/* Item 3 — un-invoiced receivables / payables recorded against this party. */}
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" /> Receivables &amp; payables (un-invoiced)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 && orderRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No money owed outside of issued invoices. Confirmed orders not yet invoiced, and any manual
              receivable / payable you add above, appear here.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Method</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Due</th>
                  <th className="px-4 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Confirmed, not-yet-invoiced orders — money owed that hasn't become an invoice/bill. */}
                {orderRows.map((o) => (
                  <tr key={o.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{o.label}</div>
                      <Badge variant="outline" className="mt-0.5 text-[10px]">Order · not yet invoiced</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={o.direction === 'receivable' ? 'default' : 'secondary'} className="text-[10px] capitalize">{o.direction}</Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">—</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(o.outstanding, o.currency)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{o.statusLabel}</td>
                  </tr>
                ))}
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{e.description}</div>
                      {e.finance_doc_requested && (
                        <Badge variant="outline" className="mt-0.5 text-[10px]">
                          {e.finance_doc_status === 'issued' ? `${e.finance_doc_kind} issued` : `${e.finance_doc_kind} requested`}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={e.direction === 'receivable' ? 'default' : 'secondary'} className="text-[10px] capitalize">{e.direction}</Badge>
                    </td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{e.settlement_method ? e.settlement_method.replace('_', ' ') : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(e.amount, e.currency)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{e.due_at ? new Date(e.due_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2 text-right capitalize text-muted-foreground">{e.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {activeWorkspaceId && (
        <ManualEntryDialog
          workspaceId={activeWorkspaceId}
          direction={entryDialog.direction}
          open={entryDialog.open}
          onOpenChange={(v) => setEntryDialog((s) => ({ ...s, open: v }))}
          onSaved={load}
          lockedParty={
            companyId
              ? { party_type: 'company', party_id: companyId, display_name: customerName ?? 'This company' }
              : contactId
                ? { party_type: 'contact', party_id: contactId, display_name: customerName ?? 'This contact' }
                : undefined
          }
        />
      )}
    </div>
  );
};

