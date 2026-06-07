/**
 * Standalone "Record payment" (receipt / payment / refund).
 *  - Received: money in from a customer — optionally "for an invoice" → marks it paid
 *    (works for late/overdue settlement; the allocation flips the invoice to paid).
 *  - Paid out: money out to a supplier.
 *  - Refund/Return: money out to a customer (e.g. against a credit note).
 * Carries a finance category + method + back-datable date.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, type Invoice, type PaymentMethod } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

type Kind = 'received' | 'paid_out' | 'refund';
const METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'check', 'other'];

export const RecordPaymentDialog: React.FC<{
  workspaceId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}> = ({ workspaceId, open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>('received');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('received'); setAmount(''); setMethod('cash'); setPaidAt(new Date().toISOString().slice(0, 10));
    setCategoryId(''); setReference(''); setNotes(''); setInvoiceId('');
    (async () => {
      const [cats, invs] = await Promise.all([
        financeCategoriesService.list(workspaceId).catch(() => []),
        financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'overdue'], limit: 200 }).catch(() => []),
      ]);
      setCategories(cats);
      setOpenInvoices(invs);
    })();
  }, [open, workspaceId]);

  const selectedInvoice = useMemo(() => openInvoices.find((i) => i.id === invoiceId), [openInvoices, invoiceId]);

  const pickInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = openInvoices.find((i) => i.id === id);
    if (inv && !amount) setAmount(String(inv.amount_due));
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const direction = kind === 'received' ? 'in' : 'out';
      const allocations = (kind === 'received' && invoiceId)
        ? [{ target_id: invoiceId, target_type: 'invoice' as const, amount: amt }]
        : [];
      await financeService.recordPayment({
        workspaceId,
        direction,
        amount: amt,
        method,
        paidAt: new Date(paidAt).toISOString(),
        categoryId: categoryId || null,
        reference: reference || (kind === 'refund' ? 'Refund' : null),
        notes: notes || null,
        counterpartyCompanyId: selectedInvoice?.customer_company_id ?? null,
        counterpartyContactId: selectedInvoice?.customer_contact_id ?? null,
        allocations,
      });
      toast({ title: kind === 'refund' ? 'Refund recorded' : 'Payment recorded' });
      onSaved(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v: any) => { setKind(v); setInvoiceId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Received (from customer)</SelectItem>
                  <SelectItem value="paid_out">Paid out (to supplier)</SelectItem>
                  <SelectItem value="refund">Refund / return (to customer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          {kind === 'received' && (
            <div className="space-y-1">
              <Label>For invoice (optional)</Label>
              <Select value={invoiceId} onValueChange={pickInvoice}>
                <SelectTrigger><SelectValue placeholder="None — unallocated credit" /></SelectTrigger>
                <SelectContent>
                  {openInvoices.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No open invoices</div>
                    : openInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.internal_number} — due {Number(i.amount_due).toFixed(2)}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedInvoice && <p className="text-[11px] text-muted-foreground">Settling this invoice will mark it paid when fully covered.</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {categories.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">Add categories in Settings</div>
                  : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / cheque no. / credit note" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
