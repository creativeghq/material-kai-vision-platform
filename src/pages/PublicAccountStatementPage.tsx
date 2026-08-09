import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck, FileText, Download, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';
import { formatDate } from '@/utils/datetime';

// Public, no-auth account-statement page reached via a shared /statement/:token link.
// The recipient unlocks it with their VAT + email (verified server-side against the CRM
// party record). On success they see their running ledger (Καρτέλα), can download the PDF,
// and — if they're a customer — pay each open invoice through the existing Stripe /pay flow.

type ViewData = Awaited<ReturnType<typeof financeService.viewStatementShare>>;

const KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', credit_note: 'Credit note', payment: 'Payment',
  supplier_bill: 'Supplier bill', supplier_credit_note: 'Supplier credit note',
};

const PublicAccountStatementPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const justPaid = search.get('paid') === '1';
  const [vat, setVat] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ViewData | null>(null);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!vat.trim() || !email.trim()) { setError('Enter both your VAT number and email.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await financeService.viewStatementShare({ token, vat: vat.trim(), email: email.trim() });
      if (!res.ok) { setError(res.error ?? 'Could not open the statement.'); return; }
      setData(res);
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const m = (n: number) => formatMoney(n, data?.currency ?? 'EUR');

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-4xl space-y-4">
        {justPaid && !data && (
          // ---- Post-payment thank-you (Stripe redirect target) ----
          <Card className="mx-auto max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <CardTitle>Payment Received</CardTitle>
              <p className="text-sm text-muted-foreground">Thank you — your payment was completed. A receipt will be emailed to you. You can close this page, or unlock your statement below to review the balance.</p>
            </CardHeader>
          </Card>
        )}
        {!data ? (
          // ---- Unlock gate ----
          <Card className="mx-auto max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Your Account Statement</CardTitle>
              <p className="text-sm text-muted-foreground">Enter your VAT number and email to view your statement.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={unlock} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="vat">VAT number</Label>
                  <Input id="vat" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="e.g. 123456789" autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  View statement
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          // ---- Statement (styled to resemble the PDF Καρτέλα) ----
          <div
            className="rounded-lg border bg-card shadow-sm overflow-hidden"
            style={data.background_url ? { backgroundImage: `url(${data.background_url})`, backgroundSize: 'cover', backgroundPosition: 'top center' } : undefined}
          >
            <div className="bg-card/92 p-5 sm:p-8 space-y-5">
              {/* Header: logo + title + period + download */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  {data.logo_url
                    ? <img src={data.logo_url} alt={data.business_name ?? ''} className="max-h-12 max-w-[180px] object-contain" />
                    : data.business_name && <div className="text-base font-semibold">{data.business_name}</div>}
                  <h1 className="text-xl font-semibold">{data.title ?? 'Account statement'}</h1>
                  <p className="text-xs text-muted-foreground">{data.from} → {data.to} · {data.currency}</p>
                </div>
                {data.pdf_url && (
                  <a href={data.pdf_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2" /> Download PDF</Button>
                  </a>
                )}
              </div>

              {/* Issuer / recipient identity columns (mirrors the PDF) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {data.issuer && (
                  <div className="space-y-0.5">
                    <div className="font-semibold text-primary uppercase tracking-wide text-[10px]">From</div>
                    {data.issuer.name && <div className="font-medium text-sm text-foreground">{data.issuer.name}</div>}
                    {data.issuer.address && <div className="text-muted-foreground">{data.issuer.address}</div>}
                    {data.issuer.city && <div className="text-muted-foreground">{data.issuer.city}</div>}
                    {data.issuer.vat && <div className="text-muted-foreground">VAT: {data.issuer.vat}</div>}
                    {data.issuer.tax_office && <div className="text-muted-foreground">Tax office: {data.issuer.tax_office}</div>}
                    {data.issuer.email && <div className="text-muted-foreground">{data.issuer.email}</div>}
                  </div>
                )}
                {data.recipient && (
                  <div className="space-y-0.5 sm:text-right">
                    <div className="font-semibold text-primary uppercase tracking-wide text-[10px]">To</div>
                    {data.recipient.name && <div className="font-medium text-sm text-foreground">{data.recipient.name}</div>}
                    {data.recipient.address && <div className="text-muted-foreground">{data.recipient.address}</div>}
                    {data.recipient.city && <div className="text-muted-foreground">{data.recipient.city}</div>}
                    {data.recipient.vat && <div className="text-muted-foreground">VAT: {data.recipient.vat}</div>}
                    {data.recipient.email && <div className="text-muted-foreground">{data.recipient.email}</div>}
                  </div>
                )}
              </div>

              {/* Closing-balance callout + Pay balance */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{data.closing_label ?? 'Closing balance'}</div>
                  <div className={`text-2xl font-semibold ${data.owes ? 'text-destructive' : ''}`}>{m(Math.abs(Number(data.closing ?? 0)))}</div>
                </div>
                {data.payment_link_url && Number(data.outstanding ?? 0) > 0 && (
                  <a href={data.payment_link_url}>
                    <Button size="lg"><CreditCard className="h-4 w-4 mr-2" /> Pay balance {formatMoney(Number(data.outstanding), data.currency)}</Button>
                  </a>
                )}
              </div>

              {/* Bank transfer alternative — one detail per row (preserves your typed rows) */}
              {data.bank_transfer && data.bank_transfer.lines.length > 0 && (
                <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{data.bank_transfer.label}</div>
                  <div className="space-y-0.5">
                    {data.bank_transfer.lines.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
              )}

              {/* Open invoices with per-invoice Stripe pay buttons */}
              {data.invoices && data.invoices.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <div className="border-b px-4 py-2 text-sm font-medium flex items-center gap-2"><CreditCard className="h-4 w-4" /> Open invoices</div>
                  {/* Mirrors the sibling table below — the font-mono invoice number
                      is un-truncated, so a long internal_number pushed the page
                      sideways without a scroll container. */}
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left">Invoice</th>
                        <th className="px-4 py-2 text-right">Amount due</th>
                        <th className="px-4 py-2 text-right">Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((i, idx) => (
                        <tr key={idx} className="border-b border-border/40 last:border-0">
                          <td className="px-4 py-2 font-mono">{i.internal_number ?? '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(i.amount_due, i.currency)}</td>
                          <td className="px-4 py-2 text-right">
                            {i.pay_url
                              ? <a href={i.pay_url}><Button size="sm" variant="outline"><CreditCard className="h-3.5 w-3.5 mr-1" /> Pay</Button></a>
                              : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Running ledger */}
              <div className="rounded-md border overflow-hidden">
                <div className="border-b px-4 py-2 text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" /> Statement</div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Document</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/30 bg-muted/30">
                      <td colSpan={5} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Opening balance</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{m(Number(data.opening ?? 0))}</td>
                    </tr>
                    {(data.rows ?? []).length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-muted-foreground">No activity in this period.</td></tr>
                    ) : (data.rows ?? []).map((r, idx) => (
                      <tr key={idx} className="border-b border-border/30">
                        <td className="px-3 py-1.5">{r.date ? formatDate(r.date) : '—'}</td>
                        <td className="px-3 py-1.5">{KIND_LABEL[r.kind] ?? r.kind}</td>
                        <td className="px-3 py-1.5 font-mono">{r.doc ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.debit ? m(r.debit) : ''}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.credit ? m(r.credit) : ''}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{m(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">Please contact us with any questions about this statement.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicAccountStatementPage;
