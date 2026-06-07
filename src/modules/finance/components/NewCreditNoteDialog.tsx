/**
 * New credit note from the Credit-notes list. You pick the invoice it corrects — the
 * credit note is created against it (myDATA 5.1 when the invoice has a MARK), nets the
 * invoice's balance, and optionally transmits. Mirrors how the operator's tool attaches a
 * credit note to an invoice.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type Invoice } from '@/modules/finance/services/financeService';

export const NewCreditNoteDialog: React.FC<{
  workspaceId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitFiscal, setSubmitFiscal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInvoiceId(''); setAmount(''); setReason(''); setSubmitFiscal(false);
    financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'paid', 'overdue'], limit: 300 })
      .then(setInvoices).catch(() => setInvoices([]));
  }, [open, workspaceId]);

  const invoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);

  const pick = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) { setAmount(String(inv.total)); setSubmitFiscal(!!(inv as any).fiscal_mark); }
  };

  const save = async () => {
    if (!invoiceId) { toast({ title: 'Pick an invoice', variant: 'destructive' }); return; }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (!reason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.createCreditNote({
        invoiceId, amount: amt, currency: invoice?.currency, reason: reason.trim(),
        correlated: !!(invoice as any)?.fiscal_mark, submitFiscal,
      });
      toast({ title: 'Credit note issued' });
      onCreated(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New credit note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Against invoice *</Label>
            <Select value={invoiceId} onValueChange={pick}>
              <SelectTrigger><SelectValue placeholder="Pick the invoice to credit…" /></SelectTrigger>
              <SelectContent>
                {invoices.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No issued invoices</div>
                  : invoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.internal_number} — {formatMoney(i.total, i.currency)}{(i as any).fiscal_mark ? ' · MARK' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            {invoice && (
              <p className="text-[11px] text-muted-foreground">
                {(invoice as any).fiscal_mark
                  ? 'Correlated 5.1 credit note (references the invoice MARK).'
                  : 'Non-correlated 5.2 (the invoice has no myDATA MARK).'} A full-total credit flips the invoice to credit_noted.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Amount (gross)</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer return — chipped tile" />
          </div>
          {invoice && (invoice as any).fiscal_mark && (
            <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">Transmit to myDATA (5.1)</div>
                <p className="text-xs text-muted-foreground">Correlated to the invoice MARK.</p>
              </div>
              <Switch checked={submitFiscal} onCheckedChange={setSubmitFiscal} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Issue credit note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
