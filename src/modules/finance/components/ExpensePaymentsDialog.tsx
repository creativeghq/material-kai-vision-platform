/**
 * The expense side of the payment ↔ expense link: everything paid against ONE expense, plus the
 * two ways to add to it —
 *   • Attach a payment that was already recorded (money went out earlier, unallocated).
 *   • Record a new payment for it (delegates to PaySupplierBillDialog).
 *
 * An expense IS a `supplier_bills` row and `payment_allocations` is its settlement ledger, so
 * this dialog only ever reads/writes allocations — what is still due is never recomputed here,
 * it comes from the bill row the triggers maintain.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Link2, Unlink, Inbox as InboxIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  financeService, formatMoney, paymentMethodLabel,
  type PayableExpense, type ExpensePayment, type AttachablePayment,
} from '@/modules/finance/services/financeService';
import { PaySupplierBillDialog, type PayableBillRef } from '@/modules/finance/components/PaySupplierBillDialog';
import { parseDecimal } from '@/utils/decimal';

export const ExpensePaymentsDialog: React.FC<{
  workspaceId: string;
  /** The expense to show. Pass the row you already have — it is re-read on every change. */
  expenseId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fired whenever something settled, so the calling list can refresh. */
  onChanged?: () => void;
}> = ({ workspaceId, expenseId, open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [expense, setExpense] = useState<PayableExpense | null>(null);
  const [payments, setPayments] = useState<ExpensePayment[]>([]);
  const [attachable, setAttachable] = useState<AttachablePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pickedPaymentId, setPickedPaymentId] = useState('');
  const [attachAmount, setAttachAmount] = useState('');

  const load = useCallback(async () => {
    if (!expenseId) return;
    setLoading(true);
    try {
      // The expense is read back from the payable list so `inbox` + party name resolve the same
      // way they do everywhere else. A fully-settled expense drops out of that list, so fall
      // back to a direct read — otherwise paying it in full would blank the dialog.
      const [openList, paid] = await Promise.all([
        financeService.listPayableExpenses(workspaceId),
        financeService.listExpensePayments(expenseId),
      ]);
      const found = openList.find((e) => e.id === expenseId) ?? null;
      setExpense(found ?? (await financeService.getPayableExpense(expenseId)));
      setPayments(paid);
      setPickedPaymentId('');
      setAttachAmount('');
    } catch (err: any) {
      toast({ title: 'Could not load payments', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [expenseId, workspaceId, toast]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  // Candidates to attach: money-out payments with room left, in the expense's currency.
  useEffect(() => {
    if (!open || !expense) { setAttachable([]); return; }
    let live = true;
    (async () => {
      const rows = await financeService.listAttachablePayments(workspaceId, {
        currency: expense.currency,
        companyId: expense.supplier_company_id,
        contactId: expense.supplier_contact_id,
      }).catch(() => [] as AttachablePayment[]);
      if (live) setAttachable(rows);
    })();
    return () => { live = false; };
  }, [open, workspaceId, expense]);

  const picked = attachable.find((p) => p.id === pickedPaymentId) ?? null;

  const pickPayment = (id: string) => {
    setPickedPaymentId(id);
    const p = attachable.find((x) => x.id === id);
    if (p && expense) setAttachAmount(String(Math.min(p.unallocated, expense.amount_due)));
  };

  const attach = async () => {
    if (!expense || !picked) return;
    const amt = parseDecimal(attachAmount);
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount to attach', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.attachPaymentToExpense({ paymentId: picked.id, supplierBillId: expense.id, amount: amt });
      toast({ title: 'Payment attached', description: `${formatMoney(amt, expense.currency)} now settles this expense.` });
      await load(); onChanged?.();
    } catch (err: any) {
      toast({ title: 'Could not attach', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const detach = async (allocationId: string) => {
    setBusy(true);
    try {
      await financeService.detachPaymentFromExpense(allocationId);
      toast({ title: 'Payment detached', description: 'The payment is unallocated again — the expense is owed once more.' });
      await load(); onChanged?.();
    } catch (err: any) {
      toast({ title: 'Could not detach', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const billRef: PayableBillRef | null = expense
    ? { id: expense.id, supplier_bill_number: expense.supplier_bill_number, party_name: expense.party_name, amount_due: expense.amount_due, currency: expense.currency }
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payments on this expense</DialogTitle>
            <DialogDescription>
              {expense
                ? <>{expense.supplier_bill_number ?? 'Expense'}{expense.party_name ? ` · ${expense.party_name}` : ''} — {formatMoney(expense.total, expense.currency)} total, {formatMoney(expense.amount_due, expense.currency)} still due.</>
                : 'Everything paid against this expense.'}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !expense ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Expense not found.</p>
          ) : (
            <div className="space-y-4">
              {/* Where this expense came from — the myDATA document in the Inbox. */}
              {expense.inbox && (
                <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <InboxIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="font-medium">From the Inbox — {expense.inbox.issuer_name ?? expense.inbox.issuer_vat ?? 'received document'}</div>
                    <div className="text-muted-foreground">
                      {expense.inbox.series ?? ''}{expense.inbox.aa ? ` ${expense.inbox.aa}` : ''}
                      {expense.inbox.issue_date ? ` · ${new Date(expense.inbox.issue_date).toLocaleDateString()}` : ''}
                      <span className="ml-1 font-mono">MARK {expense.inbox.mark}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Attached payments */}
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold">
                  Paid so far — {formatMoney(expense.amount_paid, expense.currency)} of {formatMoney(expense.total, expense.currency)}
                </div>
                {payments.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nothing paid against this expense yet.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Date</th>
                        <th className="px-3 py-1.5 text-left">Method</th>
                        <th className="px-3 py-1.5 text-left">Reference</th>
                        <th className="px-3 py-1.5 text-right">Amount</th>
                        <th className="px-3 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.allocation_id} className="border-b border-border/30 last:border-0">
                          <td className="px-3 py-1.5">{new Date(p.paid_at).toLocaleDateString()}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{paymentMethodLabel(p.method)}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.reference ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatMoney(p.amount, p.currency)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Button
                              size="sm" variant="ghost" disabled={busy}
                              className="h-7 px-2 text-muted-foreground hover:text-destructive"
                              title="Detach — the payment stays recorded but stops settling this expense"
                              onClick={() => detach(p.allocation_id)}
                            >
                              <Unlink className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Attach an already-recorded payment */}
              {expense.amount_due > 0 && (
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="text-xs font-semibold">Attach a payment you already recorded</div>
                  {attachable.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      No unallocated money-out payments in {expense.currency}. Use “Record a payment” below to book a new one.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
                        <div className="space-y-1">
                          <Label className="text-xs">Payment</Label>
                          <Select value={pickedPaymentId} onValueChange={pickPayment}>
                            <SelectTrigger><SelectValue placeholder="Pick a recorded payment…" /></SelectTrigger>
                            <SelectContent>
                              {attachable.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {new Date(p.paid_at).toLocaleDateString()}
                                  {p.party_name ? ` · ${p.party_name}` : ''}
                                  {p.reference ? ` · ${p.reference}` : ''}
                                  {` — ${formatMoney(p.unallocated, p.currency)} free`}
                                  {p.allocated > 0 ? ` of ${formatMoney(p.amount, p.currency)}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Amount</Label>
                          <Input type="text" inputMode="decimal" value={attachAmount} onChange={(e) => setAttachAmount(e.target.value)} />
                        </div>
                      </div>
                      {picked && (
                        <p className="text-[11px] text-muted-foreground">
                          Settles up to {formatMoney(Math.min(picked.unallocated, expense.amount_due), expense.currency)} —
                          the payment has {formatMoney(picked.unallocated, picked.currency)} unallocated and this expense has {formatMoney(expense.amount_due, expense.currency)} due.
                        </p>
                      )}
                      <Button size="sm" onClick={attach} disabled={busy || !picked}>
                        {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-2 h-3.5 w-3.5" />}
                        Attach
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
            {expense && expense.amount_due > 0 && (
              <Button onClick={() => setPayOpen(true)} disabled={busy}>Record a payment</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New money-out payment for this expense — same single settlement path. */}
      <PaySupplierBillDialog
        workspaceId={workspaceId}
        bill={billRef}
        open={payOpen}
        onOpenChange={setPayOpen}
        onSaved={() => { void load(); onChanged?.(); }}
      />
    </>
  );
};
