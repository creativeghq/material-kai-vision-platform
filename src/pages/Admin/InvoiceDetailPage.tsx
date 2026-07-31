import React, { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  Loader2,
  FileText,
  CheckCircle2,
  Plus,
  ExternalLink,
  AlertCircle,
  ArrowLeft,
  CreditCard,
  Copy,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle , DialogDescription } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  financeService,
  formatMoney,
  type InvoiceWithItems,
} from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { fiscalConnectorService } from '@/services/fiscalConnectorService';
import { InvoicePreviewModal } from '@/modules/finance/components/InvoicePreviewModal';
import { NewCreditNoteDialog } from '@/modules/finance/components/NewCreditNoteDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';

const MOVE_PURPOSE_LABELS: Record<string, string> = {
  '1': 'Sale',
  '2': 'Sale on behalf of third party',
  '3': 'Sampling',
  '4': 'Exhibition',
  '5': 'Return',
  '6': 'Movement between premises',
  '7': 'Consignment',
};

const InvoiceDetailPage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const financeBase = useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance';
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [creditNoteDialogOpen, setCreditNoteDialogOpen] = useState(false);
  const [payLink, setPayLink] = useState<string | null>(null);
  const [payLinkBusy, setPayLinkBusy] = useState(false);
  const [fiscalBusy, setFiscalBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    try {
      setPdfBusy(true);
      const { pdf_url } = await financeService.generateInvoicePdf(invoice.id, true);
      if (pdf_url) window.open(pdf_url, '_blank');
      else toast({ title: 'PDF generated but no URL returned', variant: 'destructive' });
    } catch (err: any) {
      toast({ title: 'PDF generation failed', description: err?.message, variant: 'destructive' });
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    if (!invoiceId) return;
    void load();
  }, [invoiceId]);

  const load = async () => {
    if (!invoiceId) return;
    try {
      setLoading(true);
      setError(null);
      const inv = await financeService.getInvoice(invoiceId);
      setInvoice(inv);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleIssue = async () => {
    if (!invoice) return;
    try {
      await financeService.markInvoiceIssued(invoice.id);
      toast({ title: 'Invoice issued' });
      await load();
    } catch (err: any) {
      toast({ title: 'Issue failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmitFiscal = async () => {
    if (!invoice) return;
    try {
      setFiscalBusy(true);
      const res = await fiscalConnectorService.submitInvoice(invoice.id);
      const f: any = res?.fiscal;
      if (!f) {
        toast({ title: 'No fiscal response', variant: 'destructive' });
      } else if (f.ok === false) {
        // not_configured / no_binding / build error — surfaced verbatim
        toast({ title: 'Not submitted', description: f.error, variant: 'destructive' });
      } else if (f.skipped) {
        toast({ title: 'Already transmitted', description: 'This invoice has a myDATA MARK already.' });
      } else if (f.status === 'accepted') {
        toast({ title: 'Transmitted to myDATA', description: `MARK ${f.mark}` });
      } else if (f.status === 'offline') {
        toast({ title: 'Accepted — AADE offline', description: 'The final MARK will be assigned automatically shortly.' });
      } else if (f.status === 'rejected') {
        toast({ title: 'Rejected by myDATA', description: f.errorMessage ?? f.errorCode ?? 'Validation error', variant: 'destructive' });
      } else {
        toast({ title: 'Submitted', description: String(f.status ?? 'done') });
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Submit failed', description: err?.message, variant: 'destructive' });
    } finally {
      setFiscalBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="px-3 sm:px-6 py-10">
        <Card className="border-destructive/50">
          <CardContent className="flex gap-2 p-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            {error ?? 'Invoice not found'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalMargin = invoice.items.reduce((acc, it) => acc + (it.line_margin ?? 0), 0);
  const totalCogs = invoice.items.reduce((acc, it) => acc + (it.line_cost ?? 0), 0);
  const marginPct =
    invoice.subtotal_net > 0 ? (totalMargin / invoice.subtotal_net) * 100 : null;

  return (
    <div className="px-3 sm:px-6 space-y-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link to={financeBase} aria-label="Back to finance">
            <Button variant="ghost" size="sm" className="-ml-2" aria-label="Back to finance">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold">{invoice.internal_number}</h1>
              <Badge variant={invoice.status === 'overdue' ? 'destructive' : invoice.status === 'paid' ? 'default' : 'outline'}>
                {invoice.status}
              </Badge>
              {(invoice as any).has_shipping && (
                <Badge variant="secondary" className="gap-1"><Truck className="h-3 w-3" /> With shipping</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.issued_at
                ? `Issued ${new Date(invoice.issued_at).toLocaleDateString()}`
                : 'Not issued yet'}
              {invoice.due_at && ` · Due ${invoice.due_at}`}
              {Number((invoice as any).branch_code ?? 0) > 0 && ` · Establishment #${(invoice as any).branch_code}`}
              {(invoice as any).series && ` · Series ${(invoice as any).series}`}
              {(invoice as any).order_id && (
                <> · <Link to={`${financeBase}/orders/${(invoice as any).order_id}`} className="text-primary hover:underline">View order</Link></>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {invoice.status === 'draft' && (
            <Button onClick={handleIssue}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark issued
            </Button>
          )}
          <Button onClick={() => setPreviewOpen(true)} variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button onClick={handleDownloadPdf} variant="outline" disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
          {(invoice as any).fiscal_status !== 'accepted' && invoice.status !== 'draft' && (
            <Button onClick={handleSubmitFiscal} variant="outline" disabled={fiscalBusy}>
              {fiscalBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Submit to myDATA
            </Button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'credit_noted' && Number(invoice.amount_due) > 0 && (
            <Button
              onClick={async () => {
                if (!invoice) return;
                try {
                  setPayLinkBusy(true);
                  const res = await financeService.getInvoicePayLink(invoice.id, { linkOnly: true });
                  setPayLink(res.pay_link);
                  try {
                    await navigator.clipboard.writeText(res.pay_link);
                    toast({ title: 'Pay link copied', description: 'Send this to the customer to collect payment by card.' });
                  } catch {
                    toast({ title: 'Pay link ready', description: res.pay_link });
                  }
                } catch (err: any) {
                  toast({ title: 'Failed', description: err?.message ?? 'Error', variant: 'destructive' });
                } finally {
                  setPayLinkBusy(false);
                }
              }}
              disabled={payLinkBusy}
              variant="outline"
            >
              {payLinkBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Card pay link
            </Button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'credit_noted' && (
            <Button onClick={() => setPaymentDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Record payment
            </Button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'credit_noted' && (
            <Button onClick={() => setCreditNoteDialogOpen(true)} variant="outline">
              Credit note
            </Button>
          )}
        </div>
      </div>

      {payLink && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium">Public pay link (valid 90 days)</div>
              <code className="block truncate text-xs text-muted-foreground">{payLink}</code>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(payLink); toast({ title: 'Copied' }); }}>
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.open(payLink, '_blank')}>
                <ExternalLink className="h-3 w-3 mr-1" /> Open
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPayLink(null)}>Hide</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="dashboard-card border-0">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="mt-1 text-xl font-semibold">{formatMoney(invoice.total, invoice.currency)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Net {formatMoney(invoice.subtotal_net, invoice.currency)} · VAT {formatMoney(invoice.vat_amount, invoice.currency)}
            </div>
          </CardContent>
        </Card>
        <Card className="dashboard-card border-0">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Paid / Due</div>
            <div className="mt-1 text-xl font-semibold">
              {formatMoney(invoice.amount_paid, invoice.currency)} / <span className="text-base text-muted-foreground">{formatMoney(invoice.amount_due, invoice.currency)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {(invoice.payments ?? []).length} payment(s) recorded
            </div>
          </CardContent>
        </Card>
        <Card className="dashboard-card border-0">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Margin (admin)</div>
            <div className="mt-1 text-xl font-semibold">
              {formatMoney(totalMargin, invoice.currency)}{' '}
              {marginPct != null && <span className="text-sm text-muted-foreground">({marginPct.toFixed(1)}%)</span>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              COGS {formatMoney(totalCogs, invoice.currency)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit price</th>
                <th className="px-4 py-2 text-right">Line total</th>
                <th className="px-4 py-2 text-right">Cost (snap)</th>
                <th className="px-4 py-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No line items.</td></tr>
              )}
              {invoice.items.map((it) => (
                <tr key={it.id} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-4 py-2">{it.description ?? '(no description)'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{it.sku ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{it.quantity}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(it.unit_price, invoice.currency)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatMoney(it.line_total, invoice.currency)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(it.line_cost, invoice.currency)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${it.line_margin < 0 ? 'text-destructive' : ''}`}>
                    {formatMoney(it.line_margin, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(invoice as any).has_shipping && (
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" /> Shipping &amp; transport
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
            {[
              ['Loading place', (invoice as any).ship_from],
              ['Delivery place', (invoice as any).ship_to],
              ['Transport date', (invoice as any).transport_date],
              ['Time', (invoice as any).transport_time],
              ['Vehicle no.', (invoice as any).vehicle_number],
              ['Responsible', (invoice as any).responsible],
              ['Purpose', MOVE_PURPOSE_LABELS[(invoice as any).move_purpose as string] ?? (invoice as any).move_purpose],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right font-medium">{value ? String(value) : '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(() => {
        const inv = invoice as any;
        const PAY: Record<number, string> = { 1: 'Cash', 2: 'Check', 3: 'On credit', 4: 'Web banking', 5: 'POS / e-POS', 6: 'IRIS', 7: 'Domestic account', 8: 'Foreign account' };
        const rows: [string, any][] = [
          ['Payment method', inv.payment_method_code ? (PAY[Number(inv.payment_method_code)] ?? inv.payment_method_code) : null],
          ['Payment note', inv.payment_method_info],
          ['Related document', inv.related_document],
          ['Digital transaction fee', Number(inv.digital_transaction_fee) > 0 ? formatMoney(inv.digital_transaction_fee, inv.currency) : null],
          ['Withholding', Number(inv.total_withheld_amount) > 0 ? formatMoney(inv.total_withheld_amount, inv.currency) : null],
          ['Prices include VAT', inv.prices_include_vat ? 'Yes' : null],
          ['VAT payment suspension', inv.vat_payment_suspension ? 'Yes' : null],
        ].filter((r) => r[1]) as [string, any][];
        return rows.length > 0 ? (
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle>Payment &amp; Document Details</CardTitle></CardHeader>
            <CardContent className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-right font-medium">{String(value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null;
      })()}

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-right">Amount allocated</th>
                <th className="px-4 py-2 text-right w-24">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.payments ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No payments recorded.</td></tr>
              )}
              {(invoice.payments ?? []).map((p) => {
                const allocAmount = p.allocations
                  .filter((a) => a.invoice_id === invoice.id)
                  .reduce((acc, a) => acc + Number(a.amount ?? 0), 0);
                return (
                  <tr key={p.id} className="border-b border-border/30">
                    <td className="px-4 py-2">{new Date(p.paid_at).toLocaleDateString()}</td>
                    {/* Account, not method — the method is derived from the account. */}
                    <td className="px-4 py-2">{p.bank_account_name ?? '—'}</td>
                    <td className="px-4 py-2">{p.reference ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatMoney(allocAmount, p.currency)}</td>
                    <td className="px-4 py-2 text-right"><PaymentReceiptActions paymentId={p.id} direction={(p as any).direction ?? 'in'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(invoice.credit_notes ?? []).length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3">
            <CardTitle>Credit Notes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Number</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Type / myDATA</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.credit_notes ?? []).map((cn: any) => (
                  <tr key={cn.id} className="border-b border-border/30">
                    <td className="px-4 py-2 font-mono text-xs">{cn.credit_note_number}</td>
                    <td className="px-4 py-2">{cn.issued_at ? new Date(cn.issued_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="mr-1">{cn.document_type ?? '—'}</Badge>
                      {cn.fiscal_mark
                        ? <span className="font-mono text-[11px] text-muted-foreground">{cn.fiscal_mark}</span>
                        : <span className="text-[11px] text-muted-foreground italic">{cn.fiscal_status ?? 'not sent'}</span>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{cn.reason ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatMoney(cn.total ?? cn.amount, cn.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(() => {
        const f = invoice as any;
        if (!f.fiscal_status) return null;
        const tone =
          f.fiscal_status === 'accepted' ? 'default'
          : f.fiscal_status === 'offline' ? 'secondary'
          : f.fiscal_status === 'rejected' || f.fiscal_status === 'error' ? 'destructive'
          : 'outline';
        return (
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> myDATA / e-Invoicing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={tone as any}>{f.fiscal_status}{f.fiscal_connector_slug ? ` · ${f.fiscal_connector_slug}` : ''}</Badge>
              </div>
              {f.fiscal_mark && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">MARK</span>
                  <span className="font-mono text-xs">{f.fiscal_mark}</span>
                </div>
              )}
              {f.fiscal_uid && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">UID</span>
                  <span className="font-mono text-xs break-all">{f.fiscal_uid}</span>
                </div>
              )}
              {f.fiscal_submitted_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Submitted</span>
                  <span className="text-xs">{new Date(f.fiscal_submitted_at).toLocaleString()}</span>
                </div>
              )}
              {f.fiscal_qr_url && (
                <Button size="sm" variant="outline" onClick={() => window.open(f.fiscal_qr_url, '_blank')}>
                  <ExternalLink className="h-3 w-3 mr-1" /> View on AADE
                </Button>
              )}
              {f.fiscal_status === 'offline' && (
                <p className="text-xs text-muted-foreground">
                  AADE was offline at submission. The provider will transmit automatically and the final MARK will appear shortly.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* The platform's one Record Payment form, preset to this invoice. Foreign-currency
          settlement lives in it now, so this page no longer needs a copy of the form to have it. */}
      <RecordPaymentDialog
        workspaceId={invoice.workspace_id}
        presetInvoiceId={invoice.id}
        defaultAmount={Number(invoice.amount_due) || undefined}
        initialCounterparty={{ companyId: invoice.customer_company_id ?? null, contactId: invoice.customer_contact_id ?? null }}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSaved={async () => { setPaymentDialogOpen(false); await load(); }}
      />
      {/* The platform's one credit-note form, preset to this invoice — it credits per LINE with
          exact VAT, which the bespoke copy that used to live here could not do at all. */}
      <NewCreditNoteDialog
        workspaceId={invoice.workspace_id}
        presetInvoiceId={invoice.id}
        open={creditNoteDialogOpen}
        onOpenChange={setCreditNoteDialogOpen}
        onCreated={async () => { setCreditNoteDialogOpen(false); await load(); }}
      />
      <InvoicePreviewModal
        invoiceId={invoice.id}
        workspaceId={invoice.workspace_id}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
};



export default InvoiceDetailPage;
