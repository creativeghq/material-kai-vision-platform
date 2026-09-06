/**
 * Out of credits — the top-up flow, wherever you hit it.
 *
 * This is the credit twin of `ModuleTabGate`: running out is not a failure the user made, it is
 * the moment to sell them more, so every surface that can be refused for credits opens THIS
 * instead of printing the refusal. Before it, each one answered differently — a destructive toast
 * in Assessment, Resupply and the invoice dialog; in the agent, a card that could never render
 * because its detector tested for a space in a code that has an underscore, so what actually
 * reached the user was the raw JSON body of a 402.
 *
 * It is a DIALOG, not a route. The refusal always happens mid-task — a half-written article, a
 * quote you were about to issue — and navigating to /billing/credits throws that away to buy the
 * thing that would have finished it. Checkout is the one navigation, and it happens on the user's
 * own click, to Stripe.
 *
 * Pricing and the tier ladder come from `calculateCreditsForAmount` (stripe.service), the same
 * source Profile → Credits and the workspace pool card quote from. There is no second price list
 * here — a top-up that costs a different amount depending on which screen refused you is worse
 * than no top-up at all.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Coins, Loader2, ShoppingCart, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { StripeService, calculateCreditsForAmount } from '@/services/stripe.service';
import { CreditsService } from '@/services/credits.service';
import { formatNumber } from '@/utils/decimal';

const stripeService = new StripeService();
const creditsService = new CreditsService();
const PRESET_AMOUNTS = [10, 25, 50, 100];

export interface CreditTopUpRequest {
  /** What the user was trying to do, in their words — "generate the article", "issue the invoice". */
  action?: string;
  /** Balance the refusal reported, when it carried one. */
  balance?: number | null;
  /** Credits the operation needed, when the refusal named it. */
  required?: number | null;
}

export const CreditTopUpDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  request?: CreditTopUpRequest;
}> = ({ open, onClose, request }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(request?.balance ?? null);

  const quote = useMemo(() => calculateCreditsForAmount(amount), [amount]);

  // Read the live balance when the refusal did not carry one. Best-effort: the dialog is useful
  // without it, and a failed read must not replace a top-up offer with another error.
  useEffect(() => {
    if (!open) return;
    if (typeof request?.balance === 'number') { setBalance(request.balance); return; }
    let cancelled = false;
    void (async () => {
      try {
        const r = await creditsService.getBalance();
        if (!cancelled) setBalance(r?.balance ?? null);
      } catch { /* leave it unknown rather than wrong */ }
    })();
    return () => { cancelled = true; };
  }, [open, request?.balance]);

  const buy = async () => {
    setBusy(true);
    try {
      const { url } = await stripeService.createCreditCheckoutSession(quote.credits, amount);
      if (!url) throw new Error('Checkout did not return a URL.');
      window.location.href = url;
    } catch (e) {
      toast({
        title: 'Could not start checkout',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Top up to continue
          </DialogTitle>
          <DialogDescription>
            {request?.action
              ? `You do not have enough credits to ${request.action}.`
              : 'You do not have enough credits for this.'}
            {' '}
            {balance != null && (
              <>You have <strong className="tabular-nums">{formatNumber(balance)}</strong>
                {request?.required != null ? <> and this needs <strong className="tabular-nums">{formatNumber(request.required)}</strong></> : null}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((pa) => (
              <Button
                key={pa}
                type="button"
                variant={amount === pa ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAmount(pa)}
                className="tabular-nums"
              >
                ${pa}
              </Button>
            ))}
          </div>

          <div>
            <Label htmlFor="credit-topup-amount" className="text-xs text-muted-foreground">Or your own amount (USD)</Label>
            <Input
              id="credit-topup-amount"
              type="number"
              min={1}
              max={500}
              value={amount}
              onChange={(e) => setAmount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-1 tabular-nums"
            />
          </div>

          <div className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">You get</span>
              <span className="font-semibold tabular-nums">{formatNumber(quote.credits)} credits</span>
            </div>
            {quote.discount > 0 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {quote.tierName} rate — {quote.discount}% better than the base rate.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* The full page stays reachable for anyone who wants the history and the tiers, but
                it is the secondary path: leaving is what loses the work that was interrupted. */}
            <Link
              to="/billing/credits"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              See all packages <ExternalLink className="h-3 w-3" />
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Not now</Button>
              <Button size="sm" onClick={buy} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
                Buy {formatNumber(quote.credits)} credits
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreditTopUpDialog;
