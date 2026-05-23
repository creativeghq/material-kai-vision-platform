import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  FileText,
  CheckCircle2,
  Plus,
  ExternalLink,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  financeService,
  formatMoney,
  type InvoiceWithItems,
  type PaymentMethod,
} from '@/modules/finance/services/financeService';

const PAYMENT_METHODS: PaymentMethod[] = ['bank_transfer', 'cash', 'card', 'check', 'other'];

const InvoiceDetailPage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [creditNoteDialogOpen, setCreditNoteDialogOpen] = useState(false);
  const [oxygenLegalNumber, setOxygenLegalNumber] = useState('');

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
      setOxygenLegalNumber(inv.oxygen_legal_number ?? '');
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

  const handlePushOxygen = async () => {
    if (!invoice || !invoice.quote_id) {
      toast({ title: 'Cannot push', description: 'Invoice has no source quote.', variant: 'destructive' });
      return;
    }
    try {
      const result = await financeService.issueInvoiceFromQuote(invoice.quote_id, {
        pushToOxygen: true,
      });
      const oxy: any = result.oxygen;
      if (oxy?.error) {
        toast({ title: 'Oxygen push failed', description: oxy.error, variant: 'destructive' });
      } else if (oxy?.oxygen_notice_id) {
        toast({ title: 'Pushed to Oxygen', description: `Notice ${oxy.oxygen_notice_id}` });
      } else {
        toast({ title: 'Pushed to Oxygen' });
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Push failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveLegalNumber = async () => {
    if (!invoice) return;
    try {
      await financeService.updateInvoice(invoice.id, { oxygen_legal_number: oxygenLegalNumber || null });
      toast({ title: 'Saved' });
      await load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
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
      <div className="container max-w-2xl py-10">
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
    <div className="container max-w-6xl space-y-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link to="/admin/finance">
            <Button variant="ghost" size="sm" className="-ml-2">
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
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.issued_at
                ? `Issued ${new Date(invoice.issued_at).toLocaleDateString()}`
                : 'Not issued yet'}
              {invoice.due_at && ` · Due ${invoice.due_at}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {invoice.status === 'draft' && (
            <Button onClick={handleIssue}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark issued
            </Button>
          )}
          {invoice.quote_id && !invoice.oxygen_notice_id && (
            <Button onClick={handlePushOxygen} variant="outline">
              Push to Oxygen
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
          <CardTitle className="text-sm">Line items</CardTitle>
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

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm">Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Method</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-right">Amount allocated</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.payments ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No payments recorded.</td></tr>
              )}
              {(invoice.payments ?? []).map((p) => {
                const allocAmount = p.allocations
                  .filter((a) => a.invoice_id === invoice.id)
                  .reduce((acc, a) => acc + Number(a.amount ?? 0), 0);
                return (
                  <tr key={p.id} className="border-b border-border/30">
                    <td className="px-4 py-2">{new Date(p.paid_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{p.method ?? '—'}</td>
                    <td className="px-4 py-2">{p.reference ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatMoney(allocAmount, p.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm">Oxygen sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Notice ID</span>
            <span className="font-mono text-xs">
              {invoice.oxygen_notice_id ?? <span className="text-muted-foreground italic">not pushed</span>}
            </span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="legal_number">Legal invoice number (from Oxygen UI)</Label>
            <div className="flex gap-2">
              <Input
                id="legal_number"
                value={oxygenLegalNumber}
                onChange={(e) => setOxygenLegalNumber(e.target.value)}
                placeholder="e.g. ΤΠ-2026/0042"
              />
              <Button onClick={handleSaveLegalNumber} variant="outline" size="sm">Save</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Oxygen issues the legal invoice and assigns the official number. Paste it here for the audit trail.
            </p>
          </div>
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoice={invoice}
        onSaved={async () => { setPaymentDialogOpen(false); await load(); }}
      />
      <CreditNoteDialog
        open={creditNoteDialogOpen}
        onOpenChange={setCreditNoteDialogOpen}
        invoice={invoice}
        onSaved={async () => { setCreditNoteDialogOpen(false); await load(); }}
      />
    </div>
  );
};

// ============================================================================
// Record payment dialog
// ============================================================================

const RecordPaymentDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceWithItems;
  onSaved: () => void;
}> = ({ open, onOpenChange, invoice, onSaved }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(invoice.amount_due ? String(invoice.amount_due) : '');
      setMethod('bank_transfer');
      setReference('');
      setPaidAt(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
  }, [open, invoice.amount_due]);

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    try {
      setBusy(true);
      await financeService.recordPayment({
        workspaceId: invoice.workspace_id,
        direction: 'in',
        amount: num,
        currency: invoice.currency,
        method,
        paidAt: new Date(paidAt).toISOString(),
        counterpartyContactId: invoice.customer_contact_id ?? null,
        counterpartyCompanyId: invoice.customer_company_id ?? null,
        reference: reference || null,
        notes: notes || null,
        allocations: [{ target_id: invoice.id, target_type: 'invoice', amount: num }],
      });
      toast({ title: 'Payment recorded' });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground">Outstanding on this invoice: {formatMoney(invoice.amount_due, invoice.currency)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v: PaymentMethod) => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Paid on</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / check no." />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// Credit note dialog
// ============================================================================

const CreditNoteDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceWithItems;
  onSaved: () => void;
}> = ({ open, onOpenChange, invoice, onSaved }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(invoice.total));
      setReason('');
    }
  }, [open, invoice.total]);

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'Reason required', variant: 'destructive' });
      return;
    }
    try {
      setBusy(true);
      await financeService.createCreditNote({
        workspaceId: invoice.workspace_id,
        invoiceId: invoice.id,
        amount: num,
        currency: invoice.currency,
        reason: reason.trim(),
      });
      toast({ title: 'Credit note created' });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue credit note</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              A credit note ≥ invoice total ({formatMoney(invoice.total, invoice.currency)}) will flip the invoice to <code>credit_noted</code>.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Customer return — chipped tile" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Issue credit note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceDetailPage;
