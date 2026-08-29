/**
 * Per-row Edit + Delete for a payment on the party Payments list.
 *
 * Edit is METADATA-ONLY (account, date, reference, notes) — amount and allocations are
 * immutable here because they drive invoice settlement + treasury balances.
 *
 * There is NO method control, here or anywhere else. The account answers it (a cash account IS
 * cash, a bank account books as a transfer) and `PaidFromSelect` derives `payments.method` from
 * the account's kind. A second control could only contradict the first.
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
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle , DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  financeService, formatMoney,
  type PaymentWithAllocation, type PaymentMethod, type BankAccountBalance,
} from '@/modules/finance/services/financeService';
import { PaidFromSelect } from '@/modules/finance/components/PaidFromSelect';

type TransmittedAlloc = Awaited<ReturnType<typeof financeService.getPaymentInvoiceAllocations>>[number];

export const PaymentRowActions: React.FC<{
  payment: PaymentWithAllocation;
  workspaceId: string;
  onChanged: () => void;
}> = ({ payment, workspaceId, onChanged }) => {
  const { toast } = useToast();
  // Balances (not bare names) so the picker shows what is in each account while you re-point
  // the payment at one — the same control the record dialogs use.
  const [banks, setBanks] = useState<BankAccountBalance[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Return-flow state (only used when deleting a payment tied to a transmitted invoice).
  const [returnCtx, setReturnCtx] = useState<{ allocs: TransmittedAlloc[] } | null>(null);

  // Edit form. `method` is not edited — PaidFromSelect derives it from the chosen account.
  const [method, setMethod] = useState<PaymentMethod>((payment.method as PaymentMethod) ?? 'bank_transfer');
  const [bankAccountId, setBankAccountId] = useState<string>(payment.bank_account_id ?? '');
  const [paidAt, setPaidAt] = useState<string>((payment.paid_at ?? '').slice(0, 10));
  const [reference, setReference] = useState<string>(payment.reference ?? '');
  const [notes, setNotes] = useState<string>(payment.notes ?? '');

  useEffect(() => {
    if (!editOpen && !returnCtx) return;
    financeService.getBankAccountBalances(workspaceId).then(setBanks).catch(() => setBanks([]));
  }, [editOpen, returnCtx, workspaceId]);

  const saveEdit = async () => {
    setBusy(true);
    try {
      // Only re-derive the method when the ACCOUNT actually changed. `PaidFromSelect` snaps the
      // method to the account's kind on mount too, and a bank account's implied method is
      // `bank_transfer` — so writing it unconditionally would quietly turn an existing cheque
      // payment into a bank transfer just because someone opened this dialog to fix a typo.
      const accountChanged = (bankAccountId || null) !== (payment.bank_account_id ?? null);
      await financeService.updatePayment(payment.id, {
        bankAccountId: bankAccountId || null,
        method: accountChanged ? method : ((payment.method as PaymentMethod) ?? method),
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
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
        <button type="button" title="Edit (account, date, reference…)" className="text-muted-foreground hover:text-primary disabled:opacity-40" disabled={busy} onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Delete / Issue return" className="text-muted-foreground hover:text-destructive disabled:opacity-40" disabled={busy} onClick={startDelete}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Edit — metadata only */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Payment</DialogTitle><DialogDescription className="sr-only">Edit or remove this payment.</DialogDescription></DialogHeader>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Correct which account the money moved through, and when. The amount can&rsquo;t be changed here — to change it, delete this payment and record it again.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" className="h-9 text-sm" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <PaidFromSelect
              workspaceId={workspaceId}
              label={payment.direction === 'in' ? 'Deposited to account' : 'Paid from account'}
              value={bankAccountId}
              onChange={setBankAccountId}
              method={method}
              onMethodChange={setMethod}
              accounts={banks}
            />
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
  banks: BankAccountBalance[];
  onClose: () => void;
  onDone: () => void;
}> = ({ payment, allocs, banks, onClose, onDone }) => {
  const { toast } = useToast();
  const [reason, setReason] = useState('Payment reversal — customer return');
  const [refund, setRefund] = useState(true);
  const [submitFiscal, setSubmitFiscal] = useState(true);
  const [bankAccountId, setBankAccountId] = useState<string>(payment.bank_account_id ?? '');
  const [method, setMethod] = useState<PaymentMethod>((payment.method as PaymentMethod) ?? 'bank_transfer');
  const [busy, setBusy] = useState(false);

  /**
   * What this return has already done (#351 A1).
   *
   * A return is a LOOP of credit notes followed by a refund, with nothing recording which of them
   * succeeded. A failure on the third of four invoices, or on the refund, showed one generic
   * "Return failed" and left the whole flow retryable — and a retry re-issued the credit notes
   * that already existed. With "Transmit to myDATA" on, those are transmitted legal documents,
   * and the customer's account is credited twice for one return.
   *
   * `issue_credit_note` now caps cumulative credit at the invoice total (#351 B4), so the second
   * copy would be refused rather than issued — but "refused" reaches the operator as a raw error
   * on a flow that half-worked, which is not a recovery. This is: each leg is remembered, a retry
   * resumes at the first one that has not happened, and the toast says exactly where it stopped.
   *
   * A ref, not state: it must be correct on the very next click, not on the next render.
   */
  const doneRef = useRef<{ credited: Set<string>; refunded: boolean }>({ credited: new Set(), refunded: false });
  const busyRef = useRef(false);

  const confirm = async () => {
    if (!reason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // 1) Reverse each transmitted invoice with a correlated credit note.
      for (const a of allocs) {
        if (doneRef.current.credited.has(a.invoice_id)) continue;
        try {
          await financeService.createCreditNote({
            workspaceId: payment.workspace_id,
            invoiceId: a.invoice_id,
            amount: a.amount,
            currency: a.currency ?? payment.currency,
            reason: reason.trim(),
            correlated: !!a.fiscal_mark,
            submitFiscal,
          });
        } catch (cnErr: unknown) {
          const doneCount = doneRef.current.credited.size;
          toast({
            title: doneCount > 0 ? `Return stopped after ${doneCount} of ${allocs.length} credit notes` : 'Return failed',
            description: `${a.internal_number ?? 'An invoice'} could not be credited: ${cnErr instanceof Error ? cnErr.message : String(cnErr)}. ${doneCount > 0 ? 'The notes already issued stay issued — pressing Confirm again resumes from this one and will not repeat them.' : 'Nothing was issued.'}`,
            variant: 'destructive',
          });
          return;
        }
        doneRef.current.credited.add(a.invoice_id);
      }
      // 2) Refund the received cash (money out) — subtracts from totals — or keep as credit.
      if (refund && !doneRef.current.refunded) {
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
          bankAccountId: bankAccountId || null,
          allocations: [],
        });
        doneRef.current.refunded = true;
      }
      toast({ title: refund ? 'Return issued + refund recorded' : 'Return issued — kept as customer credit' });
      onDone();
    } catch (err: any) {
      // Reached only by the refund leg now — the credit notes report their own position above.
      toast({
        title: doneRef.current.credited.size > 0 ? 'Credit notes issued — refund NOT recorded' : 'Return failed',
        description: doneRef.current.credited.size > 0
          ? `${err?.message ?? 'The refund could not be recorded.'} The credit notes stand; pressing Confirm again records the refund only.`
          : err?.message,
        variant: 'destructive',
      });
    } finally { busyRef.current = false; setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Issue Return</DialogTitle><DialogDescription className="sr-only">Edit or remove this payment.</DialogDescription></DialogHeader>
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
            <PaidFromSelect
              workspaceId={payment.workspace_id}
              label="Refund from"
              value={bankAccountId}
              onChange={setBankAccountId}
              method={method}
              onMethodChange={setMethod}
              accounts={banks}
            />
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
