/**
 * "Allocate as profit" from the PARTY screen — take margin across everything this customer has
 * bought, in one go, instead of opening each order in turn.
 *
 * It is the same act as `AllocateProfitDialog` at a different scope, and deliberately not a
 * different KIND of record: the RPC spreads the amount oldest-first and writes one
 * `finance_profit_allocations` row PER ORDER. So each order's own banner still reports itself
 * correctly afterwards, and each take stays separately reversible from the order it came off.
 *
 * What this does and does NOT do — unchanged from the per-order door:
 *  - The CASH DOES NOT MOVE. Nothing is issued to anyone, nothing reaches myDATA.
 *  - It does NOT add income to the P&L a second time: the revenue and cost are already in there
 *    and already net to this figure. This is the record of the decision.
 *  - The cap is re-read by the RPC — this dialog's number can be stale.
 *
 * The figure comes from `get_party_profit_position`, which aggregates the SAME per-order
 * derivation the order screen uses. It is NOT `getCustomerProfitability().profit_unallocated`:
 * that is the P&L view (invoice lines + uninvoiced orders), a different quantity, and showing it
 * beside this button would put two answers to "how much may I take" on one card.
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
import { financeService, formatMoney, type PartyProfitPosition } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { parseDecimal } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';

export const AllocatePartyProfitDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  party: { companyId?: string | null; contactId?: string | null; name?: string | null };
  onDone: () => void;
}> = ({ workspaceId, open, onOpenChange, party, onDone }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<PartyProfitPosition | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const available = position?.available ?? 0;
  const currency = position?.currency ?? 'EUR';

  // Re-read on open rather than taking a figure from the card: the card was rendered whenever the
  // page last loaded, and margin can have been taken from an order since.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setNotes('');
    financeService.getPartyProfitPosition(workspaceId, party)
      .then((pos) => {
        if (cancelled) return;
        setPosition(pos);
        setAmount(pos.available > 0 ? pos.available.toFixed(2) : '');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A FAILED read is not "nothing to take" — the multi-currency refusal arrives this way and
        // is a real instruction to the operator, not an empty state.
        setPosition(null);
        setLoadError(e instanceof Error ? e.message : 'Could not read what is left to take.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    void financeCategoriesService.list(workspaceId)
      .then((cats) => {
        if (cancelled) return;
        setCategories(cats);
        const income = cats.filter((c) => c.kind === 'income' || c.kind === 'both');
        setCategoryId((cur) => cur || income[0]?.id || '');
      })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [open, workspaceId, party.companyId, party.contactId]);

  const incomeCats = useMemo(
    () => categories.filter((c) => c.kind === 'income' || c.kind === 'both'),
    [categories],
  );

  const amt = parseDecimal(amount);

  const save = async () => {
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (amt > available + 0.005) {
      toast({
        title: 'More than their orders made',
        description: `Only ${formatMoney(available, currency)} of margin is left across them.`,
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      const res = await financeService.allocatePartyProfit({
        workspaceId,
        companyId: party.companyId ?? null,
        contactId: party.contactId ?? null,
        amount: amt,
        categoryId: categoryId || null,
        // The operator's calendar day, not the server's: see the RPC's own note.
        allocatedOn: todayLocalISO(),
        notes: notes.trim() || null,
      });
      if (res.allocated <= 0.005) {
        toast({ title: 'Nothing left to take', description: 'Every order of theirs has already been allocated.' });
      } else {
        // Name the orders it landed on. A party-level number with no orders behind it is exactly
        // the sort of figure nobody can reconcile a month later.
        const spread = res.orders.map((o) => `${o.order_number ?? o.order_id.slice(0, 8)} ${formatMoney(o.amount, res.currency)}`).join(', ');
        toast({
          title: `${formatMoney(res.allocated, res.currency)} allocated as profit`,
          description: `${res.orders.length === 1 ? 'From' : `Spread across ${res.orders.length} orders:`} ${spread}.`
            + (res.available > 0.005 ? ` ${formatMoney(res.available, res.currency)} still left.` : ''),
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
            Take the margin earned on {party.name ? <strong>{party.name}</strong> : 'this party'}&rsquo;s orders. The money
            stays in your account — the orders record that their margin is yours and has been taken.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : loadError ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {loadError}
          </div>
        ) : (
        <div className="space-y-3">
          {/* The same three numbers as the per-order dialog, at party scope. */}
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Margin on their orders</span>
              <span className="tabular-nums">{formatMoney(position?.margin ?? 0, currency)}</span>
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
            {/* Which orders it will come off, in the order it will fill them. Without this the
                operator is approving a spread they cannot see. */}
            {(position?.orders.length ?? 0) > 0 && (
              <div className="border-t border-emerald-500/30 pt-1 space-y-0.5">
                {position!.orders.map((o) => (
                  <div key={o.order_id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{o.order_number ?? o.order_id.slice(0, 8)}</span>
                    <span className="tabular-nums">{formatMoney(o.available, currency)}</span>
                  </div>
                ))}
              </div>
            )}
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
              Taken off the oldest order first. Whatever is left stays on the orders.
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
            The cash does not move and nothing is issued to anyone. The orders&rsquo; revenue and cost are
            already in your P&amp;L and already net to this figure — this records that you have taken it.
            Each order&rsquo;s share is reversible on its own.
          
          </p>
          <p className="text-[11px] text-muted-foreground">
            {/* Where the money actually leaves. Without this the dialog implies the cash has moved,
                which is the single thing it does not do. */}
            To take it out of the bank, record a money-out payment in the <strong>Profit allocation</strong>{' '}
            category. Reports then show what you have claimed against what you have actually drawn.
          </p>
        </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || loading || !!loadError || available <= 0.005}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-1" />}
            Allocate as profit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
