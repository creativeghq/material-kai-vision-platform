// Reusable Finance sub-tabs for a CRM customer (contact or company).
// Mounts inside ContactDetailPage / CompanyDetailPage. Each tab is self-contained
// and lazy-loads its data on first render.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, ArrowUpRight, Mail, Wallet, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  financeService,
  formatMoney,
  type Invoice,
  type PaymentWithAllocation,
  type CustomerTopProductRow,
} from '@/modules/finance/services/financeService';

type Target = { contactId?: string; companyId?: string };

export const CustomerFinanceSummary: React.FC<Target> = ({ contactId, companyId }) => {
  const [summary, setSummary] = useState<{
    quoteCount: number;
    quotedTotal: number;
    acceptedTotal: number;
    invoicedTotal: number;
    paidTotal: number;
    outstandingTotal: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, companyId]);

  const load = async () => {
    if (!contactId && !companyId) return;
    try {
      setLoading(true);
      const s = await financeService.getCustomerAccount({ contactId, companyId });
      setSummary(s);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Card className="dashboard-card border-0"><CardContent className="p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Quotes</div><div className="text-lg font-semibold">{summary.quoteCount}</div></CardContent></Card>
      <Card className="dashboard-card border-0"><CardContent className="p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Quoted</div><div className="text-lg font-semibold">{formatMoney(summary.quotedTotal)}</div></CardContent></Card>
      <Card className="dashboard-card border-0"><CardContent className="p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Accepted</div><div className="text-lg font-semibold">{formatMoney(summary.acceptedTotal)}</div></CardContent></Card>
      <Card className="dashboard-card border-0"><CardContent className="p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Invoiced</div><div className="text-lg font-semibold">{formatMoney(summary.invoicedTotal)}</div></CardContent></Card>
      <Card className="dashboard-card border-0"><CardContent className="p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid</div><div className="text-lg font-semibold">{formatMoney(summary.paidTotal)}</div></CardContent></Card>
      <Card className={`dashboard-card border-0 ${summary.outstandingTotal > 0 ? 'ring-1 ring-destructive/40' : ''}`}><CardContent className="p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</div><div className={`text-lg font-semibold ${summary.outstandingTotal > 0 ? 'text-destructive' : ''}`}>{formatMoney(summary.outstandingTotal)}</div></CardContent></Card>
    </div>
  );
};

/**
 * Shared presentational account summary — the single source of layout for a party's money
 * position, used by BOTH the CRM Account tab and the Finance → Parties drill-down so they
 * look identical. Shows a net-position headline + an "As customer" and/or "As supplier"
 * section (each only when that role has data). Pure: callers pass already-resolved numbers.
 */
export const PartyAccountSummary: React.FC<{
  customer?: { invoiced: number; paid: number; outstanding: number } | null;
  supplier?: { billed: number; paid: number; outstanding: number; ordered?: number } | null;
  meta?: Array<{ label: string; value: React.ReactNode }>;
}> = ({ customer, supplier, meta }) => {
  const net = (customer?.outstanding ?? 0) - (supplier?.outstanding ?? 0);
  const netLabel = net > 0 ? 'They owe us (net)' : net < 0 ? 'We owe them (net)' : 'Settled up';
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
  const [emailing, setEmailing] = useState(false);

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
        <div className="flex items-center gap-2">
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
          {topProducts.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No purchase history yet for this customer.</div>
          ) : (
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
                {topProducts.map((p) => (
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
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const CustomerQuotesTab: React.FC<Target> = ({ contactId, companyId }) => {
  const [rows, setRows] = useState<Array<{
    id: string; quote_number: string | null; name: string | null; status: string;
    grand_total: number | null; currency: string | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contactId, companyId]);

  const load = async () => {
    if (!contactId && !companyId) return;
    let q = supabase
      .from('quotes')
      .select('id, quote_number, name, status, grand_total, currency, created_at')
      .order('created_at', { ascending: false });
    if (contactId) q = q.eq('customer_contact_id', contactId);
    if (companyId) q = q.eq('customer_company_id', companyId);
    const { data } = await q;
    setRows((data as any[]) ?? []);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm">Quotes ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No quotes for this customer.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Quote</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Created</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{q.quote_number ?? q.name ?? q.id.slice(0, 8)}</td>
                  <td className="px-4 py-2"><Badge variant="outline">{q.status}</Badge></td>
                  <td className="px-4 py-2 text-right">{formatMoney(q.grand_total ?? 0, q.currency ?? 'EUR')}</td>
                  <td className="px-4 py-2 text-right">{new Date(q.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/quotes/${q.id}`}><Button size="sm" variant="ghost"><ArrowUpRight className="h-3 w-3" /></Button></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};

export const CustomerInvoicesTab: React.FC<Target> = ({ contactId, companyId }) => {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contactId, companyId]);

  const load = async () => {
    if (!contactId && !companyId) return;
    const invoices = await financeService.listInvoices({
      customerContactId: contactId,
      customerCompanyId: companyId,
    });
    setRows(invoices);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm">Invoices ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No invoices for this customer.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Number</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Due</th>
                <th className="px-4 py-2 text-right">Due date</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs">{i.internal_number}</td>
                  <td className="px-4 py-2">
                    <Badge variant={i.status === 'overdue' ? 'destructive' : i.status === 'paid' ? 'default' : 'outline'}>{i.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">{formatMoney(i.total, i.currency)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(i.amount_paid, i.currency)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatMoney(i.amount_due, i.currency)}</td>
                  <td className="px-4 py-2 text-right">{i.due_at ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/finance/invoices/${i.id}`}><Button size="sm" variant="ghost"><ArrowUpRight className="h-3 w-3" /></Button></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};

export const CustomerPaymentsTab: React.FC<Target> = ({ contactId, companyId }) => {
  const [rows, setRows] = useState<PaymentWithAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contactId, companyId]);

  const load = async () => {
    if (!contactId && !companyId) return;
    const data = await financeService.listPayments({
      counterpartyContactId: contactId,
      counterpartyCompanyId: companyId,
      direction: 'in',
    });
    setRows(data);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm">Payments received ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No payments recorded from this customer.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Paid on</th>
                <th className="px-4 py-2 text-left">Method</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-left">Allocated to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/30">
                  <td className="px-4 py-2">{new Date(p.paid_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{p.method ?? '—'}</td>
                  <td className="px-4 py-2">{p.reference ?? '—'}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-2">
                    {p.allocations.length === 0
                      ? <span className="text-xs text-muted-foreground">Unallocated</span>
                      : (
                        <ul className="text-xs space-y-0.5">
                          {p.allocations.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                              {a.invoice_id && (
                                <Link to={`/finance/invoices/${a.invoice_id}`} className="text-primary hover:underline font-mono">
                                  invoice {a.invoice_id.slice(0, 8)}
                                </Link>
                              )}
                              <span>{formatMoney(a.amount, p.currency)}</span>
                            </li>
                          ))}
                        </ul>
                      )
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};
