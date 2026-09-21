import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import { formatMoney, parseDecimalOr } from '@/utils/decimal';
import { financeService, type BankAccountBalance } from '@/modules/finance/services/financeService';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { invoicedTotal } from '@/modules/finance/utils/inboundProvenance';

/** Radix cannot select an empty string, so "no account" needs a value of its own. */
const NO_ACCOUNT = '__none__';

interface Props {
  workspaceId: string;
  doc: InboundDocument | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSettled: () => void;
}

/**
 * Mark a received document paid, whether or not it has ever been booked. The account is the whole
 * decision and the dialog says so before it is made: name one and this is an ordinary expense in
 * the P&L; leave it empty and the purchase is settled OUTSIDE the books, which is the old orders
 * paid before this platform held them and must not be counted here a second time.
 */
export const SettleExpenseDialog: React.FC<Props> = ({ workspaceId, doc, open, onOpenChange, onSettled }) => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccountBalance[]>([]);
  /** Null = not read yet. A FAILED read must not leave "no account" as the only option. */
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>(NO_ACCOUNT);
  const [paidOn, setPaidOn] = useState(todayLocalISO);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const currency = doc?.currency ?? 'EUR';
  // `invoicedTotal` is the one statement of the reverse-charge rule (net, not gross). Restating
  // it here is how the shown figure and the booked one start to differ.
  const owed = useMemo(() => (doc ? invoicedTotal(doc) : 0), [doc]);
  const alreadyBooked = !!doc?.created_supplier_bill_id;

  useEffect(() => {
    if (!open || !workspaceId) return;
    setPaidOn(todayLocalISO());
    setAmount('');
    setNote('');
    setAccountId(NO_ACCOUNT);
    setAccountsError(null);
    void financeService.getBankAccountBalances(workspaceId)
      .then((rows) => setAccounts(rows.filter((r) => r.is_active)))
      .catch((e) => {
        setAccounts([]);
        setAccountsError(e instanceof Error ? e.message : String(e));
      });
  }, [open, workspaceId]);

  const outside = accountId === NO_ACCOUNT;
  // A payment is recorded in the BILL's currency, so an account in another one would have its
  // balance moved by an amount it is not denominated in.
  const usable = useMemo(
    () => accounts.filter((a) => a.currency === currency),
    [accounts, currency],
  );

  const submit = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const typed = amount.trim();
      const res = await inboundService.settleDocument(doc.id, {
        bankAccountId: outside ? null : accountId,
        paidOn,
        // Blank means "whatever is still due", which the server derives from the bill. Prefilling
        // the document total instead settles a part-paid bill for more than it owes, and the
        // allocation refuses the whole thing.
        amount: outside || !typed ? null : parseDecimalOr(typed, owed),
        note: note.trim() || null,
      });
      const COPY: Record<string, { title: string; body: string }> = {
        settled_outside: {
          title: 'Marked settled outside the books',
          body: 'Excluded from the P&L and reported as an excluded cost. Undo it from the same menu.',
        },
        already_settled_outside: {
          title: 'Already settled outside the books',
          body: 'Nothing changed — it was already excluded.',
        },
        booked_and_paid: {
          title: 'Booked as an expense and paid',
          body: `${formatMoney(res.amount, currency)} out of the account you picked.`,
        },
        already_paid: {
          title: 'Nothing left to settle',
          body: 'This expense was already paid in full, so no payment was recorded.',
        },
      };
      const said = COPY[res.outcome] ?? { title: 'Done', body: '' };
      toast({ title: said.title, description: said.body });
      onSettled();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Could not settle it',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            {doc?.issuer_name ?? doc?.issuer_vat ?? 'This document'}
            {owed > 0 && <> · {formatMoney(owed, currency)}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Paid from</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>No account — settled outside the books</SelectItem>
                {usable.map((a) => (
                  <SelectItem key={a.bank_account_id} value={a.bank_account_id}>
                    {a.name} · {formatMoney(Number(a.current_balance), a.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* An empty picker and a picker that could not load look identical, and the second
                leaves "settled outside" as the only choice — which silently excludes a real cost. */}
            {accountsError && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Your accounts could not be read, so none are offered — this is a failed read, not
                an empty list. Close this and try again rather than settling it outside the books.
              </p>
            )}
            {!accountsError && usable.length === 0 && accounts.length > 0 && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                None of your accounts are in {currency}, so this cannot be paid from one here.
              </p>
            )}

            {/* The consequence before the button: these two answers mean different books. */}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {outside
                ? 'Nothing is booked and no money moves. The cost is kept OUT of the P&L, expenses and the VAT return — for purchases already paid and accounted for elsewhere. It is counted separately and shown beside the P&L, never hidden.'
                : alreadyBooked
                  ? 'The payment leaves this account and settles the expense that already exists for this document.'
                  : 'The purchase is booked as an expense — no purchase order is raised — and the payment leaves this account. It counts in the P&L, the VAT return and that balance.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-date">Paid on</Label>
              <Input id="settle-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            {!outside && (
              <div className="space-y-1.5">
                <Label htmlFor="settle-amount">Amount</Label>
                <Input
                  id="settle-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Whatever is still due"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settle-note">Note</Label>
            <Textarea
              id="settle-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={outside ? 'Why this is not counted — e.g. paid in cash in 2024, before the books moved here' : 'Reference, cheque number…'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {outside ? 'Mark settled outside' : 'Book and pay'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
