/**
 * Standalone "Record payment" (receipt / payment / refund).
 *  - Received: money in from a customer — optionally "for" an open invoice OR an
 *    un-invoiced receivable → marks it (partly) settled.
 *  - Paid out: money out to a supplier — optionally against an un-invoiced payable.
 *  - Refund/Return: money out to a customer (e.g. against a credit note).
 * Carries a finance category + method + back-datable date.
 *
 * Pass `preset` to deep-link the dialog to a specific target (the Settle action
 * on a Receivables/Payables row).
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
import { financeService, type Invoice, type ManualEntry, type PaymentMethod } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

type Kind = 'received' | 'paid_out' | 'refund';
type TargetType = 'invoice' | 'manual_entry';
const METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'check', 'other'];

/** Deep-link the dialog straight to one target (Settle action on an aging row). */
export interface RecordPaymentPreset {
  direction: Kind;
  targetType: TargetType;
  targetId: string;
}

export const RecordPaymentDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  preset?: RecordPaymentPreset | null;
}> = ({ workspaceId, open, onOpenChange, onSaved, preset }) => {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>('received');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  // Settle target as `${type}:${id}` ('' = unallocated). Refund still uses an invoice only.
  const [targetKey, setTargetKey] = useState<string>('');
  const [invoiceId, setInvoiceId] = useState<string>(''); // refund target only
  const [issueCreditNote, setIssueCreditNote] = useState(true);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialKind = preset?.direction ?? 'received';
    setKind(initialKind);
    setAmount(''); setMethod('cash'); setPaidAt(new Date().toISOString().slice(0, 10));
    setCategoryId(''); setReference(''); setNotes('');
    setTargetKey(preset && preset.direction !== 'refund' ? `${preset.targetType}:${preset.targetId}` : '');
    setInvoiceId(preset?.direction === 'refund' ? preset.targetId : '');
    setIssueCreditNote(true);
    (async () => {
      const [cats, invs, manual] = await Promise.all([
        financeCategoriesService.list(workspaceId).catch(() => []),
        // Include paid invoices too — a refund is usually against an already-settled invoice.
        financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'overdue', 'paid'], limit: 200 }).catch(() => []),
        financeService.listManualEntries({ workspaceId }).catch(() => []),
      ]);
      setCategories(cats);
      setInvoices(invs);
      setManualEntries(manual);
    })();
  }, [open, workspaceId, preset]);

  // Received → open invoices + open receivables. Refund → any issued invoice (usually paid).
  const pickableInvoices = useMemo(
    () => (kind === 'refund' ? invoices : invoices.filter((i) => Number(i.amount_due) > 0)),
    [invoices, kind],
  );
  const receivables = useMemo(() => manualEntries.filter((m) => m.direction === 'receivable' && Number(m.amount_due) > 0), [manualEntries]);
  const payables = useMemo(() => manualEntries.filter((m) => m.direction === 'payable' && Number(m.amount_due) > 0), [manualEntries]);

  const selectedInvoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);
  const selectedTarget = useMemo(() => {
    if (!targetKey) return null;
    const [type, id] = targetKey.split(':');
    if (type === 'invoice') return { type: 'invoice' as const, inv: invoices.find((i) => i.id === id) ?? null, man: null };
    return { type: 'manual_entry' as const, inv: null, man: manualEntries.find((m) => m.id === id) ?? null };
  }, [targetKey, invoices, manualEntries]);

  const pickTarget = (key: string) => {
    setTargetKey(key);
    if (amount) return;
    const [type, id] = key.split(':');
    if (type === 'invoice') {
      const inv = invoices.find((i) => i.id === id);
      if (inv) setAmount(String(inv.amount_due));
    } else {
      const man = manualEntries.find((m) => m.id === id);
      if (man) setAmount(String(man.amount_due));
    }
  };

  const pickRefundInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv && !amount) setAmount(String((inv as any).total ?? inv.amount_due));
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (kind === 'refund' && issueCreditNote && !invoiceId) {
      toast({ title: 'Pick the invoice to credit', description: 'A refund issues a credit note against an invoice. Choose it, or turn off the credit note.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      // Refund: first issue the credit note (5.1 correlated) so myDATA nets the original invoice.
      let creditNoteRef: string | null = null;
      let creditNoteFiscalError: string | undefined;
      if (kind === 'refund' && issueCreditNote && invoiceId) {
        const cn = await financeService.createCreditNote({
          workspaceId,
          invoiceId,
          amount: amt,
          reason: reference || notes || 'Refund / return',
          correlated: true,
          submitFiscal: true,
        });
        creditNoteRef = cn.credit_note_id;
        creditNoteFiscalError = cn.fiscal_error;
      }

      const direction = kind === 'received' ? 'in' : 'out';

      // Build the allocation + resolve the counterparty from the chosen target.
      let allocations: Array<{ target_id: string; target_type: TargetType; amount: number }> = [];
      let counterpartyCompanyId: string | null = null;
      let counterpartyContactId: string | null = null;
      if (kind === 'refund') {
        counterpartyCompanyId = selectedInvoice?.customer_company_id ?? null;
        counterpartyContactId = selectedInvoice?.customer_contact_id ?? null;
      } else if (selectedTarget?.type === 'invoice' && selectedTarget.inv) {
        allocations = [{ target_id: selectedTarget.inv.id, target_type: 'invoice', amount: amt }];
        counterpartyCompanyId = selectedTarget.inv.customer_company_id ?? null;
        counterpartyContactId = selectedTarget.inv.customer_contact_id ?? null;
      } else if (selectedTarget?.type === 'manual_entry' && selectedTarget.man) {
        allocations = [{ target_id: selectedTarget.man.id, target_type: 'manual_entry', amount: amt }];
        counterpartyCompanyId = selectedTarget.man.counterparty_company_id ?? null;
        counterpartyContactId = selectedTarget.man.counterparty_contact_id ?? null;
      }

      await financeService.recordPayment({
        workspaceId,
        direction,
        amount: amt,
        method,
        paidAt: new Date(paidAt).toISOString(),
        categoryId: categoryId || null,
        reference: reference || (creditNoteRef ? `Refund · CN ${creditNoteRef.slice(0, 8)}` : kind === 'refund' ? 'Refund' : null),
        notes: notes || null,
        counterpartyCompanyId,
        counterpartyContactId,
        allocations,
      });
      if (creditNoteFiscalError) {
        // Cash-out logged + credit note created, but myDATA transmission failed —
        // don't pretend it's filed. Operator must retransmit from the credit-note list.
        toast({
          title: 'Refund recorded — myDATA transmission failed',
          description: `The credit note was created and the cash-out logged, but it was NOT accepted by myDATA: ${creditNoteFiscalError}. Retransmit it from the credit notes list.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: kind === 'refund' ? 'Refund recorded' : 'Payment recorded',
          description: creditNoteRef ? 'Credit note issued to myDATA and the cash-out logged.' : undefined,
        });
      }
      onSaved(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v: any) => { setKind(v); setTargetKey(''); setInvoiceId(''); }}>
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
              <Label>For (optional)</Label>
              <Select value={targetKey} onValueChange={pickTarget}>
                <SelectTrigger><SelectValue placeholder="None — unallocated credit" /></SelectTrigger>
                <SelectContent>
                  {pickableInvoices.length === 0 && receivables.length === 0 && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">No open invoices or receivables</div>
                  )}
                  {pickableInvoices.length > 0 && (
                    <SelectGroupLabel>Invoices</SelectGroupLabel>
                  )}
                  {pickableInvoices.map((i) => (
                    <SelectItem key={i.id} value={`invoice:${i.id}`}>{i.internal_number} — due {Number(i.amount_due).toFixed(2)}</SelectItem>
                  ))}
                  {receivables.length > 0 && (
                    <SelectGroupLabel>Un-invoiced receivables</SelectGroupLabel>
                  )}
                  {receivables.map((m) => (
                    <SelectItem key={m.id} value={`manual_entry:${m.id}`}>{m.description} — due {Number(m.amount_due).toFixed(2)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTarget?.type === 'invoice' && selectedTarget.inv && <p className="text-[11px] text-muted-foreground">Settling this invoice will mark it paid when fully covered.</p>}
              {selectedTarget?.type === 'manual_entry' && selectedTarget.man && <p className="text-[11px] text-muted-foreground">Settling this receivable reduces what the customer owes.</p>}
            </div>
          )}

          {kind === 'paid_out' && (
            <div className="space-y-1">
              <Label>For (optional)</Label>
              <Select value={targetKey} onValueChange={pickTarget}>
                <SelectTrigger><SelectValue placeholder="None — unallocated cash-out" /></SelectTrigger>
                <SelectContent>
                  {payables.length === 0
                    ? <div className="px-2 py-1 text-xs text-muted-foreground">No open payables</div>
                    : payables.map((m) => (
                      <SelectItem key={m.id} value={`manual_entry:${m.id}`}>{m.description} — due {Number(m.amount_due).toFixed(2)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedTarget?.type === 'manual_entry' && selectedTarget.man && <p className="text-[11px] text-muted-foreground">Settling this payable reduces what we owe the supplier.</p>}
            </div>
          )}

          {kind === 'refund' && (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <div className="space-y-1">
                <Label>Invoice to credit</Label>
                <Select value={invoiceId} onValueChange={pickRefundInvoice}>
                  <SelectTrigger><SelectValue placeholder="Pick the invoice being refunded…" /></SelectTrigger>
                  <SelectContent>
                    {pickableInvoices.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No invoices</div>
                      : pickableInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.internal_number} — {Number((i as any).total ?? 0).toFixed(2)}{(i as any).fiscal_mark ? ' · MARK' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>Issue credit note to myDATA (nets the invoice)</span>
                <Switch checked={issueCreditNote} onCheckedChange={setIssueCreditNote} />
              </label>
              <p className="text-[11px] text-muted-foreground">
                {issueCreditNote
                  ? 'A 5.1 credit note is transmitted against the invoice, then the cash-out is logged.'
                  : 'Only the cash-out is recorded — no credit note is issued.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / cheque no. / credit note" />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
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

// Small non-selectable label inside a Select dropdown to group options.
const SelectGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>
);
