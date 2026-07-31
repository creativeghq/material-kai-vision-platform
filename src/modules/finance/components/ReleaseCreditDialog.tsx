/**
 * "Release to income" — stop holding a customer's leftover on-account money.
 *
 * A customer's on-account balance is money of theirs we are sitting on: unallocated cash-in. Once
 * their job is done and everything they owed is settled, whatever is left is ours. Until now there
 * was no way to say so — the only exits were "apply it to another order" and "refund it", so a
 * leftover €400 stayed a liability on their account forever.
 *
 * What this does and does NOT do:
 *  - The CASH DOES NOT MOVE. It stays in whichever account it landed in and is free to spend.
 *  - The customer's on-account balance drops by the released amount and it leaves their statement.
 *  - It books as income under the category picked here, so it shows up as profit in the P&L.
 *  - NOTHING is issued to the customer and NOTHING is transmitted to myDATA. This is an internal
 *    reclassification, not a sale. If the retained amount is consideration for a supply, invoice
 *    it instead — that is a different act and a different form.
 *
 * Reversible: `financeService.reverseCreditRelease(id)` puts the credit back exactly as it was.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Coins } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { parseDecimal } from '@/utils/decimal';

export const ReleaseCreditDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Whose credit. Exactly one of these, same rule as the payment counterparty. */
  party: { companyId?: string | null; contactId?: string | null; name?: string | null };
  /** What the account tile is showing right now — the default and the ceiling shown to the user.
   *  The RPC re-reads the real figure, so a stale value here can only over-state the cap. */
  available: number;
  currency?: string;
  onDone: () => void;
}> = ({ workspaceId, open, onOpenChange, party, available, currency = 'EUR', onDone }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(available > 0 ? available.toFixed(2) : '');
    setNotes('');
    void financeCategoriesService.list(workspaceId)
      .then((cats) => {
        setCategories(cats);
        // Income is what this is, so only income categories are offered. Default to the first —
        // an uncategorised release lands in "Uncategorized" in the P&L, which helps nobody.
        const income = cats.filter((c) => c.kind === 'income' || c.kind === 'both');
        setCategoryId((cur) => cur || income[0]?.id || '');
      })
      .catch(() => setCategories([]));
  }, [open, workspaceId, available]);

  const incomeCats = useMemo(
    () => categories.filter((c) => c.kind === 'income' || c.kind === 'both'),
    [categories],
  );

  const amt = parseDecimal(amount);

  const save = async () => {
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (amt > available + 0.005) {
      toast({ title: 'More than they have on account', description: `Only ${formatMoney(available, currency)} is unallocated.`, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const res = await financeService.releaseCustomerCredit({
        workspaceId,
        companyId: party.companyId ?? null,
        contactId: party.contactId ?? null,
        amount: amt,
        categoryId: categoryId || null,
        currency,
        notes: notes.trim() || null,
      });
      if (res.released <= 0.005) {
        toast({ title: 'Nothing to release', description: 'That credit has already been applied somewhere else.' });
      } else {
        toast({
          title: `${formatMoney(res.released, currency)} released to income`,
          description: 'The money stays in your account — it is just no longer held for this customer.',
        });
      }
      onDone();
      onOpenChange(false);
    } catch (err: unknown) {
      toast({ title: 'Could not release', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Release to income</DialogTitle>
          <DialogDescription>
            Keep {party.name ? <strong>{party.name}</strong> : 'this customer'}&rsquo;s leftover balance as profit. The money
            stays in your account — it simply stops being theirs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">On account now</span>
            <span className="font-semibold text-amber-500 tabular-nums">{formatMoney(available, currency)}</span>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Amount to release</Label>
            <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Release part of it and the rest stays on their account.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Income category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder={incomeCats.length ? 'Pick a category' : 'No income categories'} /></SelectTrigger>
              <SelectContent>
                {incomeCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Where it lands in the P&amp;L.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this balance is being kept — for whoever reads the books later." />
          </div>

          <p className="text-[11px] text-muted-foreground">
            No cash moves, no document is issued and nothing is sent to myDATA. If the customer is owed
            this money back, refund it from their Payments list instead.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || available <= 0.005}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Coins className="h-4 w-4 mr-1.5" />}
            Release {amt != null && amt > 0 ? formatMoney(amt, currency) : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReleaseCreditDialog;
