/**
 * Per-row Edit + Delete for a payment on the party Payments list.
 *
 * Edit is METADATA-ONLY (bank account, method, date, reference, notes) — amount and
 * allocations are immutable here because they drive invoice settlement + treasury
 * balances.
 *
 * Delete is Greek-law-correct:
 *  - If the payment settles NO transmitted invoice → hard delete (reopens any
 *    non-transmitted invoice it settled). Audited via payment_audit_log.
 *  - If it settles a TRANSMITTED invoice (invoices.fiscal_mark present) → the invoice
 *    can't be deleted; we issue a credit note (return, correlated 5.1) against it, then
 *    ask whether the received money is refunded to the customer (records a money-out that
 *    subtracts from totals) or kept as customer credit. The original payment is left in
 *    place (a transmitted document is never silently removed).
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  financeService, formatMoney, paymentMethodLabel,
  type PaymentWithAllocation, type PaymentMethod, type BankAccount,
} from '@/modules/finance/services/financeService';

const METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'check', 'other'];
const NONE = '__none__';

type TransmittedAlloc = Awaited<ReturnType<typeof financeService.getPaymentInvoiceAllocations>>[number];

export const PaymentRowActions: React.FC<{
  payment: PaymentWithAllocation;
  workspaceId: string;
  onChanged: () => void;
}> = ({ payment, workspaceId, onChanged }) => {
  const { toast } = useToast();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Return-flow state (only used when deleting a payment tied to a transmitted invoice).
  const [returnCtx, setReturnCtx] = useState<{ allocs: TransmittedAlloc[] } | null>(null);

  // Edit form.
  const [method, setMethod] = useState<PaymentMethod | null>((payment.method as PaymentMethod) ?? null);
  const [bankAccountId, setBankAccountId] = useState<string>(payment.bank_account_id ?? NONE);
  const [paidAt, setPaidAt] = useState<string>((payment.paid_at ?? '').slice(0, 10));
  const [reference, setReference] = useState<string>(payment.reference ?? '');
  const [notes, setNotes] = useState<string>(payment.notes ?? '');

  useEffect(() => {
    if (!editOpen && !returnCtx) return;
    financeService.listBankAccounts(workspaceId, { includeInactive: true }).then(setBanks).catch(() => setBanks([]));
  }, [editOpen, returnCtx, workspaceId]);

  const saveEdit = async () => {
    setBusy(true);
    try {
      await financeService.updatePayment(payment.id, {
        bankAccountId: bankAccountId === NONE ? null : bankAccountId,
        method, paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
        reference: reference.trim() || null, notes: notes.trim() || null,
      });
      toast({ title: 'Payment updated' });
      setEditOpen(false);
      onChanged();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const startDelete = async () => {
    setBusy(true);
    try {
      const allocs = await financeService.getPaymentInvoiceAllocations(payment.id);
      const transmitted = allocs.filter((a) => a.fiscal_mark);
      if (transmitted.length > 0) {
        setReturnCtx({ allocs: transmitted });          // → return flow (credit note + refund/credit)
        return;
      }
      // No transmitted invoice → safe hard delete.
      const settled = allocs.length > 0
        ? ` Invoice ${allocs.map((a) => a.internal_number ?? '').filter(Boolean).join(', ')} will reopen.`
        : '';
      if (!window.confirm(`Delete this ${formatMoney(Number(payment.amount), payment.currency)} payment?${settled}`)) return;
      await financeService.deletePayment(payment.id);
      toast({ title: 'Payment deleted' });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Could not delete', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" title="Edit (bank, method, reference…)" className="text-muted-foreground hover:text-primary disabled:opacity-40" disabled={busy} onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Delete / Issue return" className="text-muted-foreground hover:text-destructive disabled:opacity-40" disabled={busy} onClick={startDelete}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Edit — metadata only */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit payment</DialogTitle></DialogHeader>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Correct where/how the money moved. The amount can't be changed here — to change it, delete this payment and record it again.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" className="h-9 text-sm" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={method ?? NONE} onValueChange={(v) => setMethod(v === NONE ? null : (v as PaymentMethod))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {METHODS.map((m) => <SelectItem key={m} value={m}>{paymentMethodLabel(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bank / Cash account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Unassigned —</SelectItem>
                  {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.iban ? ` · ${b.iban}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference</Label>
              <Input className="h-9 text-sm" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ref, cheque no…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} className="text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {returnCtx && (
        <ReturnPaymentDialog
          payment={payment}
          allocs={returnCtx.allocs}
          banks={banks}
          onClose={() => setReturnCtx(null)}
          onDone={() => { setReturnCtx(null); onChanged(); }}
        />
      )}
    </>
  );
};

/**
 * Transmitted-invoice case: issue the credit note(s), then either refund the received
 * money (money-out that subtracts from totals) or keep it as customer credit.
 */
const ReturnPaymentDialog: React.FC<{
  payment: PaymentWithAllocation;
  allocs: TransmittedAlloc[];
  banks: BankAccount[];
  onClose: () => void;
  onDone: () => void;
}> = ({ payment, allocs, banks, onClose, onDone }) => {
  const { toast } = useToast();
  const [reason, setReason] = useState('Payment reversal — customer return');
  const [refund, setRefund] = useState(true);
  const [submitFiscal, setSubmitFiscal] = useState(true);
  const [bankAccountId, setBankAccountId] = useState<string>(payment.bank_account_id ?? NONE);
  const [method, setMethod] = useState<PaymentMethod>((payment.method as PaymentMethod) ?? 'bank_transfer');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!reason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      // 1) Reverse each transmitted invoice with a correlated credit note.
      for (const a of allocs) {
        await financeService.createCreditNote({
          workspaceId: payment.workspace_id,
          invoiceId: a.invoice_id,
          amount: a.amount,
          currency: a.currency ?? payment.currency,
          reason: reason.trim(),
          correlated: !!a.fiscal_mark,
          submitFiscal,
        });
      }
      // 2) Refund the received cash (money out) — subtracts from totals — or keep as credit.
      if (refund) {
        await financeService.recordPayment({
          workspaceId: payment.workspace_id,
          direction: 'out',
          amount: Number(payment.amount),
          currency: payment.currency,
          method,
          counterpartyContactId: payment.counterparty_contact_id ?? null,
          counterpartyCompanyId: payment.counterparty_company_id ?? null,
          reference: `Refund — return of ${formatMoney(Number(payment.amount), payment.currency)}`,
          notes: reason.trim(),
          bankAccountId: bankAccountId === NONE ? null : bankAccountId,
          allocations: [],
        });
      }
      toast({ title: refund ? 'Return issued + refund recorded' : 'Return issued — kept as customer credit' });
      onDone();
    } catch (err: any) {
      toast({ title: 'Return failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Issue return</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              This payment settles a <strong>transmitted</strong> invoice ({allocs.map((a) => a.internal_number ?? '—').join(', ')}),
              which can't be deleted. We'll issue a credit note (return) to reverse it, per Greek law.
            </span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason</Label>
            <Textarea rows={2} className="text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
            <span className="text-xs">Transmit credit note to myDATA <span className="text-muted-foreground">(correlated 5.1)</span></span>
            <Switch checked={submitFiscal} onCheckedChange={setSubmitFiscal} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
            <span className="text-xs">
              Refund {formatMoney(Number(payment.amount), payment.currency)} to the customer
              <span className="block text-muted-foreground">Off = keep it as customer credit (no cash out)</span>
            </span>
            <Switch checked={refund} onCheckedChange={setRefund} />
          </label>
          {refund && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Refund from</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Unassigned —</SelectItem>
                    {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.iban ? ` · ${b.iban}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m} value={m}>{paymentMethodLabel(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {refund ? 'Issue return + refund' : 'Issue return · keep credit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
