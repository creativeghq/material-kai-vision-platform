// Reusable Finance sub-tabs for a CRM customer (contact or company).
// Mounts inside ContactDetailPage / CompanyDetailPage. Each tab is self-contained
// and lazy-loads its data on first render.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  financeService,
  formatMoney,
  type Invoice,
  type PaymentWithAllocation,
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
                    <Link to={`/admin/finance/invoices/${i.id}`}><Button size="sm" variant="ghost"><ArrowUpRight className="h-3 w-3" /></Button></Link>
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
                                <Link to={`/admin/finance/invoices/${a.invoice_id}`} className="text-primary hover:underline font-mono">
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
