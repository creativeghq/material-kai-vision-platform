/**
 * "Allocate as profit" — take what an order made off the order and record it as taken.
 *
 * A sales order that has been paid and whose costs are on it has an amount left over: its margin.
 * Until now that number existed only on reports, with no way to say "that is mine, I have taken
 * it" — so it stayed an observation rather than a decision.
 *
 * What this does and does NOT do:
 *  - The CASH DOES NOT MOVE. It stays in whichever account it landed in and is free to spend.
 *  - The order records that its margin has been claimed: the amount, the day, a category, a note.
 *  - It is capped at what the order actually made LESS anything already taken, so the same euro
 *    cannot be taken twice. The cap is re-read by the RPC — this dialog's number can be stale.
 *  - It does NOT add income to the P&L a second time. The order's revenue and its cost of goods
 *    are already in there and already net to this figure; booking it again would double it. This
 *    is the record of the decision, not a second earning of the same money.
 *  - NOTHING is issued to anyone and NOTHING is transmitted to myDATA.
 *
 * Reversible: `financeService.reverseProfitAllocation(id)`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type OrderProfitPosition } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { parseDecimal } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';

export const AllocateProfitDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  orderNumber?: string | null;
  /** The order's position, straight from `get_order_profit_positions`. Never recomputed here. */
  position: OrderProfitPosition | null;
  onDone: () => void;
}> = ({ workspaceId, open, onOpenChange, orderId, orderNumber, position, onDone }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [busy, setBusy] = useState(false);

  const available = position?.available ?? 0;
  const currency = position?.currency ?? 'EUR';

  useEffect(() => {
    if (!open) return;
    setAmount(available > 0 ? available.toFixed(2) : '');
    setNotes('');
    void financeCategoriesService.list(workspaceId)
      .then((cats) => {
        setCategories(cats);
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
      toast({
        title: 'More than this order made',
        description: `Only ${formatMoney(available, currency)} of margin is left on it.`,
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      const res = await financeService.allocateOrderProfit({
        orderId,
        amount: amt,
        categoryId: categoryId || null,
        // The operator's calendar day, not the server's: see the RPC's own note.
        allocatedOn: todayLocalISO(),
        notes: notes.trim() || null,
      });
      if (res.allocated <= 0.005) {
        toast({ title: 'Nothing left to take', description: 'This order’s margin has already been allocated.' });
      } else {
        toast({
          title: `${formatMoney(res.allocated, currency)} allocated as profit`,
          description: res.available > 0.005
            ? `${formatMoney(res.available, currency)} still left on this order.`
            : 'The money stays in your account — the order’s margin is now recorded as taken.',
        });
      }
      onDone();
      onOpenChange(false);
    } catch (err: unknown) {
      toast({ title: 'Could not allocate', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Allocate as profit</DialogTitle>
          <DialogDescription>
            Take what {orderNumber ? <strong>{orderNumber}</strong> : 'this order'} made. The money stays in your
            account — the order records that its margin is yours and has been taken.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* The three numbers the decision rests on, in the order the trade happened. Shown rather
              than summarised: "€420 available" alone leaves the operator checking it elsewhere. */}
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Revenue (net)</span>
              <span className="tabular-nums">{formatMoney(position?.revenue_net ?? 0, currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost of goods</span>
              <span className="tabular-nums">−{formatMoney(position?.cogs ?? 0, currency)}</span>
            </div>
            {(position?.allocated ?? 0) > 0.005 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Already taken</span>
                <span className="tabular-nums">−{formatMoney(position?.allocated ?? 0, currency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-emerald-500/30 pt-1 font-semibold">
              <span>Left to take</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(available, currency)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Amount</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="text-right tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Take all of it, or part — whatever is left stays on the order.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick a category" /></SelectTrigger>
              <SelectContent>
                {incomeCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Why you are taking it now — optional." className="text-sm" />
          </div>

          <p className="text-[11px] text-muted-foreground">
            The cash does not move and nothing is issued to anyone. The order&rsquo;s revenue and cost are
            already in your P&amp;L and already net to this figure — this records that you have taken it.
            Reversible.

          </p>
          <p className="text-[11px] text-muted-foreground">
            {/* Where the money actually leaves. Without this the dialog implies the cash has moved,
                which is the single thing it does not do. */}
            To take it out of the bank, record a money-out payment in the <strong>Profit allocation</strong>{' '}
            category. Reports then show what you have claimed against what you have actually drawn.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || available <= 0.005}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-1" />}
            Allocate as profit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
